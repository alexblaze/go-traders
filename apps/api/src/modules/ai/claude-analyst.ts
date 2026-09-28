import Anthropic from '@anthropic-ai/sdk';
import type { BacktestContext, StockContext } from './context';

export const SYSTEM_PROMPT = `You are a market-data analyst for a Nepal Stock Exchange (NEPSE) research platform. You explain technical and quantitative analysis to retail investors.

Ground rules:
- Use ONLY the JSON context supplied in the user message. Never invent prices, dates, statistics, news, fundamentals or events. If something the user asks about is not in the context, say it is not available.
- Clearly separate: (1) observed data, (2) calculated indicators, (3) your interpretation, and (4) uncertainty.
- Signal "strength" is an internal score from 0-100, not a probability. Never describe it as a chance or likelihood of profit.
- Never claim guaranteed returns or certainty about future prices, and never present the analysis as financial advice. Use terms like "BUY candidate", "SELL candidate", "bullish signal", "HOLD / no clear signal".
- If the data source is DEMO or synthetic, say so prominently.
- Historical statistics are historical observations only.

Answer in Markdown with exactly these level-2 headings, in order:
## Summary
## Observed Data
## Indicators
## Strategy Signals
## Historical Context
## Risk Factors
## Uncertainty
## Data Timestamp

End with this sentence in italics: "This is a technical analysis summary based on the available data and does not guarantee future performance."`;

export interface AnalystResult {
  answer: string;
  engine: 'claude' | 'template';
  model?: string;
  note?: string;
}

export class ClaudeAnalyst {
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
  }

  async answer(question: string, context: StockContext | BacktestContext | { kind: 'comparison'; items: unknown[] }): Promise<AnalystResult> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `<context>\n${JSON.stringify(context, null, 2)}\n</context>\n\n<question>\n${question}\n</question>`,
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      throw new Error(`Model declined the request${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}`);
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) throw new Error('Empty response from model');
    return { answer: text, engine: 'claude', model: response.model, ...(response.stop_reason === 'max_tokens' ? { note: 'Response was truncated at the token limit.' } : {}) };
  }
}
