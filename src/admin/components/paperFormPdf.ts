// Building blocks of the printable paper forms (the Kadiwa forms and the
// membership form): filled in by hand and scanned in the OCR Scanner. The
// layout is kept plain for the AI reader: a label beside every blank, one
// value per box, and a form code at the top right of every form.
import type { jsPDF } from 'jspdf';
import { COOPERATIVE_NAME, drawPdfLogo, loadPdfLogo } from '../../lib/pdfLogo';

export const PAGE = { left: 12, right: 198, width: 186, bottom: 285 };
export const ROW = 7.6;

// The built-in PDF fonts have no peso sign, dashes or narrow spaces.
export const pdfText = (value: string) => value.replace(/₱/g, 'PHP ').replace(/[–−]/g, '-').replace(/×/g, 'x').replace(/[   ]/g, ' ');
export const finalY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

// The logo of each form being made, drawn by heading().
const logos = new WeakMap<jsPDF, Uint8Array | null>();

export async function newForm(title: string) {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadPdfLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title, creator: 'ACIFAC' });
  logos.set(doc, logo);
  return { doc, autoTable };
}

export const font = (doc: jsPDF, style: 'normal' | 'bold' | 'italic', size: number, gray = 17) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(gray); };

// The heading of every form: the cooperative's logo and name, the title and
// the form code box.
export function heading(doc: jsPDF, title: string, code: string, subtitle: string) {
  const x = drawPdfLogo(doc, logos.get(doc) ?? null, PAGE.left, 9.5, 21) ? PAGE.left + 25 : PAGE.left;
  font(doc, 'bold', 8.3, 40);
  doc.text(COOPERATIVE_NAME, x, 15.5, { maxWidth: PAGE.right - 38 - x });
  font(doc, 'normal', 8, 80);
  doc.text(subtitle, x, 20, { maxWidth: PAGE.right - 38 - x });
  font(doc, 'bold', 17);
  doc.text(title, x, 29);
  doc.setDrawColor(17);
  doc.setLineWidth(0.5);
  doc.rect(PAGE.right - 34, 11, 34, 11);
  font(doc, 'normal', 6.5, 80);
  doc.text('FORM CODE', PAGE.right - 17, 14.5, { align: 'center' });
  font(doc, 'bold', 10.5);
  doc.text(code, PAGE.right - 17, 19.8, { align: 'center' });
  doc.setLineWidth(0.6);
  doc.line(PAGE.left, 32.5, PAGE.right, 32.5);
  return 39;
}

// "Label: ______" with the line ending at `end`.
export function blank(doc: jsPDF, label: string, x: number, y: number, end: number, hint = '') {
  font(doc, 'bold', 9.5);
  doc.text(`${label}:`, x, y);
  const start = x + doc.getTextWidth(`${label}:`) + 2;
  doc.setDrawColor(17);
  doc.setLineWidth(0.25);
  doc.line(start, y + 1, end, y + 1);
  if (hint) { font(doc, 'italic', 6.5, 130); doc.text(hint, end, y + 4, { align: 'right' }); }
}

export function checkboxes(doc: jsPDF, label: string, options: string[], x: number, y: number) {
  font(doc, 'bold', 9.5);
  doc.text(`${label}:`, x, y);
  let at = x + doc.getTextWidth(`${label}:`) + 3;
  font(doc, 'normal', 9.5);
  doc.setLineWidth(0.3);
  for (const option of options) {
    doc.rect(at, y - 3.3, 4, 4);
    doc.text(option, at + 5.5, y);
    at += 5.5 + doc.getTextWidth(option) + 6;
  }
}

export function instructions(doc: jsPDF, lines: string[], y: number) {
  font(doc, 'normal', 7.8, 70);
  const text = doc.splitTextToSize(pdfText(lines.join(' ')), PAGE.width);
  doc.text(text, PAGE.left, y);
  return y + text.length * 3.4 + 2;
}

export function signatures(doc: jsPDF, y: number, labels: string[]) {
  const top = y + 13 > PAGE.bottom - 8 ? (doc.addPage(), 25) : y + 13;
  const width = (PAGE.width - 12 * (labels.length - 1)) / labels.length;
  labels.forEach((label, index) => {
    const x = PAGE.left + index * (width + 12);
    doc.setDrawColor(17);
    doc.setLineWidth(0.3);
    doc.line(x, top, x + width, top);
    font(doc, 'normal', 8, 70);
    doc.text(label, x + width / 2, top + 4, { align: 'center' });
  });
  return top + 4;
}

// Page numbers and the form code on every page, so loose pages are read as one form.
export function footers(doc: jsPDF, code: string, how: string) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    font(doc, 'normal', 7, 120);
    doc.text(`${code} · Page ${page} of ${pages}`, PAGE.left, 291);
    doc.text(how, PAGE.right, 291, { align: 'right' });
  }
}

export const tableStyles = {
  theme: 'grid' as const,
  margin: { left: PAGE.left, right: 210 - PAGE.right, top: 22, bottom: 14 },
  styles: { font: 'helvetica', fontSize: 8.5, textColor: 17, lineColor: 60, lineWidth: 0.25, minCellHeight: ROW, valign: 'middle' as const, cellPadding: 1.2 },
  headStyles: { fillColor: 230, textColor: 17, fontStyle: 'bold' as const, fontSize: 7.8, halign: 'center' as const, minCellHeight: 9 },
  showHead: 'everyPage' as const,
};

export function sectionTitle(doc: jsPDF, text: string, note: string, y: number) {
  if (y > PAGE.bottom - 30) { doc.addPage(); y = 22; }
  font(doc, 'bold', 10.5);
  doc.text(text, PAGE.left, y);
  const width = doc.getTextWidth(text);
  if (note) { font(doc, 'normal', 7.8, 90); doc.text(pdfText(note), PAGE.left + width + 3, y); }
  return y + 2;
}
