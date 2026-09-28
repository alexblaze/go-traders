import { Fragment } from 'react';

/** Renders **bold** / _italic_ / `code` inline as React nodes (no raw HTML). */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={i++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={i++} className="rounded bg-muted px-1">{t.slice(1, -1)}</code>);
    else out.push(<em key={i++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal, XSS-safe Markdown renderer for AI answers (headings, lists, paragraphs). */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  text.split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^\s*[-*•]\s+/.test(line)) return list.push(line.replace(/^\s*[-*•]\s+/, ''));
    flush();
    if (!line.trim()) return;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) blocks.push(<h4 key={idx} className="mb-1 mt-3 text-sm font-semibold">{inline(h[2])}</h4>);
    else blocks.push(<p key={idx} className="my-1">{inline(line)}</p>);
  });
  flush();
  return <div className="text-sm leading-relaxed">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
