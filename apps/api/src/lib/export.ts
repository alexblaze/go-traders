import PDFDocument from 'pdfkit';

export type ExportFormat = 'csv' | 'json' | 'pdf';
type Row = Record<string, unknown>;

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** RFC 4180 CSV with formula-injection protection for spreadsheet apps. */
export function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (s: string) => {
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(cell(r[c]))).join(','))].join('\n') + '\n';
}

export interface PdfSection {
  heading: string;
  lines?: string[];
  table?: { columns: string[]; rows: Row[] };
}

export function toPdf(title: string, sections: PdfSection[], disclaimer: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(title);
    doc.fontSize(8).fillColor('#666').text(`Generated ${new Date().toISOString()}`).moveDown();
    for (const s of sections) {
      doc.fillColor('#000').fontSize(12).text(s.heading).moveDown(0.3);
      doc.fontSize(9);
      for (const l of s.lines ?? []) doc.text(l);
      if (s.table) {
        const w = (doc.page.width - 80) / s.table.columns.length;
        const drawRow = (vals: string[], bold = false) => {
          const y = doc.y;
          vals.forEach((v, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(v.slice(0, 24), 40 + i * w, y, { width: w - 4, lineBreak: false }));
          doc.moveDown(0.6);
          if (doc.y > doc.page.height - 60) doc.addPage();
        };
        drawRow(s.table.columns, true);
        for (const r of s.table.rows.slice(0, 500)) drawRow(s.table.columns.map((c) => cell(r[c])));
        doc.x = 40;
      }
      doc.moveDown();
    }
    doc.fontSize(8).fillColor('#444').text(disclaimer, 40);
    doc.end();
  });
}
