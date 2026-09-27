// Lays a Report out as a text PDF (selectable, so AI tools read the numbers
// exactly). Loaded on demand: the PDF library only downloads when exporting.

import type { Report } from './report';

/**
 * The PDF's built-in fonts only cover Western European characters, so the
 * rupee sign and a few symbols are spelled out instead of printing as "?".
 */
export const pdfSafe = (s: string) => s
  .replace(/₹/g, 'Rs ')
  .replace(/[−–]/g, '-')
  .replace(/→/g, '->')
  .replace(/›/g, '>')
  .replace(/[●•]/g, '*')
  .replace(/[✓⚠↗↘▲▼]/g, '')
  .replace(/[^\u0000-ÿ—…·’‘“”]/g, '?');

export async function reportPdf(report: Report): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // Landscape: the widest holdings tables have eight columns of amounts
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const margin = 40;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  doc.setFont('helvetica', 'bold').setFontSize(18).text(pdfSafe(report.title), margin, y + 6);
  y += 22;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90);
  for (const [k, v] of report.meta) {
    const lines = doc.splitTextToSize(pdfSafe(`${k}: ${v}`), width) as string[];
    doc.text(lines, margin, y + 10);
    y += 12 * lines.length;
  }
  y += 8;

  for (const s of report.sections) {
    if (y > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); y = margin; }
    doc.setFont('helvetica', 'bold').setFontSize(11.5).setTextColor(20);
    const head = doc.splitTextToSize(pdfSafe(s.heading), width) as string[];
    doc.text(head, margin, y + 12);
    y += 14 * head.length + 4;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(70);
    for (const line of s.lines ?? []) {
      const lines = doc.splitTextToSize(pdfSafe(line), width) as string[];
      if (y + 11 * lines.length > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
      doc.text(lines, margin, y + 9);
      y += 11 * lines.length + 2;
    }
    if (s.table && s.table.rows.length) {
      const right = s.table.right;
      autoTable(doc, {
        startY: y + 2,
        margin: { left: margin, right: margin },
        head: [s.table.head.map(pdfSafe)],
        body: s.table.rows.map((r) => r.map(pdfSafe)),
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [246, 247, 249] },
        // Amounts stay on one line; text columns take whatever width is left and wrap
        columnStyles: Object.fromEntries(right.map((r, i) => [i, r ? { halign: 'right', cellWidth: 'wrap' } : { halign: 'left' }])),
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
    } else {
      y += 8;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(140);
    doc.text(`${pdfSafe(report.title)} · page ${p} of ${pages}`, margin, doc.internal.pageSize.getHeight() - 20);
  }
  return doc.output('blob');
}
