import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '@nepse/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ok, SymbolParams } from '../../lib/http';
import { SignalsService } from '../signals/signals.service';
import { ClaudeAnalyst, type AnalystResult } from './claude-analyst';
import { buildBacktestContext, buildStockContext, type BacktestContext, type StockContext } from './context';
import { templateBacktestAnswer, templateStockAnswer } from './template-analyst';

const AskBody = z.object({
  question: z.string().min(3).max(1000),
  symbol: z.string().max(20).optional(),
  backtestId: z.string().max(64).optional(),
  compareStrategies: z.array(z.string().max(64)).length(2).optional(),
});

export default async function aiRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { env } = app.deps;
  const tags = ['ai'];
  const limited = { onRequest: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const security = [{ bearerAuth: [] }];
  const claude = env.AI_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY ? new ClaudeAnalyst(env.ANTHROPIC_API_KEY, env.AI_MODEL) : null;

  async function run(question: string, ctx: StockContext | BacktestContext | { kind: 'comparison'; items: unknown[] }, template: () => string): Promise<AnalystResult> {
    if (claude) {
      try {
        return await claude.answer(question, ctx);
      } catch (e) {
        const reason = e instanceof Anthropic.RateLimitError ? 'AI provider rate limited' : e instanceof Anthropic.APIError ? `AI provider error ${e.status}` : (e as Error).message;
        app.log.warn({ err: e }, 'Claude analyst failed; using template analyst');
        return { answer: template(), engine: 'template', note: `${reason}; showing rule-based summary instead.` };
      }
    }
    return { answer: template(), engine: 'template', note: 'Rule-based analyst (set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY to enable Claude).' };
  }

  r.get('/explain/:symbol', { ...limited, schema: { tags, summary: 'AI technical summary for a stock', params: SymbolParams, security } }, async (req) => {
    const ctx = await buildStockContext(app.deps, req.params.symbol);
    const q = `Give a technical summary of ${ctx.symbol}.`;
    return ok({ ...(await run(q, ctx, () => templateStockAnswer(ctx, q))), context: ctx });
  });

  r.post('/ask', { ...limited, schema: { tags, summary: 'Ask the AI analyst (answers only from application data)', body: AskBody, security } }, async (req) => {
    const { question, symbol, backtestId, compareStrategies } = req.body;
    if (backtestId) {
      const ctx = await buildBacktestContext(app.deps, backtestId, req.user.sub);
      return ok({ ...(await run(question, ctx, () => templateBacktestAnswer(ctx))), context: ctx });
    }
    if (!symbol) throw new AppError('VALIDATION_ERROR', 'Provide a symbol or backtestId so the answer can be grounded in application data.');
    if (compareStrategies) {
      const stats = await new SignalsService(app.deps).stats(symbol);
      const items = stats.strategies.filter((s) => compareStrategies.includes(s.strategyId));
      if (items.length !== 2) throw new AppError('VALIDATION_ERROR', 'Both strategies must be built-in (non-ensemble) strategies.');
      const ctx = { kind: 'comparison' as const, symbol: symbol.toUpperCase(), items, label: stats.label };
      const template = () =>
        ['## Summary', `Historical comparison of ${items[0].strategyName} and ${items[1].strategyName} on ${symbol.toUpperCase()}.`, '', '## Historical Context',
          ...items.map((s) => `- ${s.strategyName}: ${s.signals} signals (BUY ${s.buySignals} / SELL ${s.sellSignals}); avg 5D ${s.averageReturn[5] ?? 'N/A'}%, avg 20D ${s.averageReturn[20] ?? 'N/A'}%, directional hit rate ${s.winRatePct ?? 'N/A'}%, worst adverse move ${s.maxDrawdownPct ?? 'N/A'}%`),
          '', '## Uncertainty', '- Sample sizes are small and results depend on the period; these are historical observations only.', '', '_This is a technical analysis summary based on the available data and does not guarantee future performance._'].join('\n');
      return ok({ ...(await run(question, ctx, template)), context: ctx });
    }
    const ctx = await buildStockContext(app.deps, symbol);
    return ok({ ...(await run(question, ctx, () => templateStockAnswer(ctx, question))), context: ctx });
  });

  r.get('/status', { schema: { tags, summary: 'AI engine configuration' } }, async () =>
    ok({ engine: claude ? 'claude' : 'template', model: claude ? env.AI_MODEL : null, note: 'The AI only uses structured application data and never invents prices or statistics.' }),
  );
}
