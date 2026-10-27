// Printable Kadiwa forms: the Add Inventory form and the Daily Sales form,
// filled in by hand at the store and scanned in the OCR Scanner, which saves
// them to the Kadiwa Store (document types Add Inventory Form and Kadiwa Daily
// Sales Form). The layout is kept plain for the AI reader: one value per box, a
// printed line number on every line, the goods and store items pre-printed with
// their codes and prices, and a form code at the top right.
import type { jsPDF } from 'jspdf';
import type { KadiwaGood, KadiwaInventoryItem } from '../../../app/services/authApi';
import { formatDate } from '../../../utils/dateTime';
import { CATEGORIES, COUNT_UNITS, productLabel, SIZE_UNITS } from './InventoryForms';

export const INVENTORY_FORM_CODE = 'KADIWA-INV';
export const SALES_FORM_CODE = 'KADIWA-SALES';
const INVENTORY_LINES = 22;
const OTHER_GOODS_LINES = 5;
const EXPENSE_LINES = 5;
const PAGE = { left: 12, right: 198, width: 186, bottom: 285 };
const ROW = 7.6;

// The built-in PDF fonts have no peso sign, dashes or narrow spaces.
const pdfText = (value: string) => value.replace(/₱/g, 'PHP ').replace(/[–−]/g, '-').replace(/×/g, 'x').replace(/[   ]/g, ' ');
const amount = (value: number | null) => (value === null ? '' : value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const finalY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

async function newForm(title: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title, creator: 'ACIFAC' });
  return { doc, autoTable };
}

const font = (doc: jsPDF, style: 'normal' | 'bold' | 'italic', size: number, gray = 17) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(gray); };

// The heading of every form: who it is for, the title and the form code box.
function heading(doc: jsPDF, title: string, code: string, subtitle: string) {
  font(doc, 'bold', 9, 80);
  doc.text('ACIFAC COOPERATIVE', PAGE.left, 16);
  font(doc, 'normal', 8.5, 80);
  doc.text(subtitle, PAGE.left, 20.5);
  font(doc, 'bold', 17);
  doc.text(title, PAGE.left, 29);
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
function blank(doc: jsPDF, label: string, x: number, y: number, end: number, hint = '') {
  font(doc, 'bold', 9.5);
  doc.text(`${label}:`, x, y);
  const start = x + doc.getTextWidth(`${label}:`) + 2;
  doc.setDrawColor(17);
  doc.setLineWidth(0.25);
  doc.line(start, y + 1, end, y + 1);
  if (hint) { font(doc, 'italic', 6.5, 130); doc.text(hint, end, y + 4, { align: 'right' }); }
}

function checkboxes(doc: jsPDF, label: string, options: string[], x: number, y: number) {
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

function instructions(doc: jsPDF, lines: string[], y: number) {
  font(doc, 'normal', 7.8, 70);
  const text = doc.splitTextToSize(pdfText(lines.join(' ')), PAGE.width);
  doc.text(text, PAGE.left, y);
  return y + text.length * 3.4 + 2;
}

function signatures(doc: jsPDF, y: number, labels: string[]) {
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
}

// Page numbers and the form code on every page, so loose pages are read as one form.
function footers(doc: jsPDF, code: string, how: string) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    font(doc, 'normal', 7, 120);
    doc.text(`${code} · Page ${page} of ${pages}`, PAGE.left, 291);
    doc.text(how, PAGE.right, 291, { align: 'right' });
  }
}

const tableStyles = {
  theme: 'grid' as const,
  margin: { left: PAGE.left, right: 210 - PAGE.right, top: 22, bottom: 14 },
  styles: { font: 'helvetica', fontSize: 8.5, textColor: 17, lineColor: 60, lineWidth: 0.25, minCellHeight: ROW, valign: 'middle' as const, cellPadding: 1.2 },
  headStyles: { fillColor: 230, textColor: 17, fontStyle: 'bold' as const, fontSize: 7.8, halign: 'center' as const, minCellHeight: 9 },
  showHead: 'everyPage' as const,
};

function sectionTitle(doc: jsPDF, text: string, note: string, y: number) {
  if (y > PAGE.bottom - 30) { doc.addPage(); y = 22; }
  font(doc, 'bold', 10.5);
  doc.text(text, PAGE.left, y);
  const width = doc.getTextWidth(text);
  if (note) { font(doc, 'normal', 7.8, 90); doc.text(pdfText(note), PAGE.left + width + 3, y); }
  return y + 2;
}

// ----- Add Inventory -----------------------------------------------------------------------------

export async function downloadInventoryFormPdf() {
  const { doc, autoTable } = await newForm('Kadiwa Add Inventory Form');
  let y = heading(doc, 'ADD INVENTORY FORM', INVENTORY_FORM_CODE, 'Kadiwa Store · new products for the store inventory');
  blank(doc, 'Date', PAGE.left, y, 80, 'MM/DD/YYYY');
  blank(doc, 'Low stock at', 90, y, 130);
  blank(doc, 'Page no.', 140, y, PAGE.right);
  y += 9;
  checkboxes(doc, 'Category (tick one)', CATEGORIES, PAGE.left, y);
  y += 6;
  y = instructions(doc, [
    'Write in block letters with a black or blue pen, one product per line, one value per box. Do not write outside the boxes.',
    `Size: the number and unit (${SIZE_UNITS.join(', ')}), e.g. 150 g. Counted in: ${COUNT_UNITS.join(', ')}.`,
    'Total = Quantity x Cost Price. Cross out a mistake with one line and write the correct value beside it.',
  ], y);

  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['#', 'PRODUCT', 'SIZE\n(e.g. 150 g)', 'QUANTITY', 'COUNTED\nIN', 'SELLING\nPRICE', 'COST\nPRICE', 'TOTAL\n(Qty x Cost)']],
    body: Array.from({ length: INVENTORY_LINES }, (_, index) => [String(index + 1), '', '', '', '', '', '', '']),
    foot: [[{ content: 'TOTAL', colSpan: 7, styles: { halign: 'right' } }, '']],
    footStyles: { fillColor: 245, textColor: 17, fontStyle: 'bold', minCellHeight: 9 },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', textColor: 90 }, 1: { cellWidth: 52 }, 2: { cellWidth: 22 }, 3: { cellWidth: 19 },
      4: { cellWidth: 17 }, 5: { cellWidth: 21 }, 6: { cellWidth: 21 }, 7: { cellWidth: 26 },
    },
  });
  signatures(doc, finalY(doc), ['Prepared by (name and signature)', 'Checked by (name and signature)']);
  footers(doc, INVENTORY_FORM_CODE, 'Scan in OCR Scanner to save to the Kadiwa Store');
  doc.save('Kadiwa Add Inventory Form.pdf');
}

// ----- Daily Sales -------------------------------------------------------------------------------

/** goods: the daily form's goods with their unit and price; inventory: the store items that can be sold. */
export async function downloadSalesFormPdf(goods: KadiwaGood[], inventory: KadiwaInventoryItem[]) {
  const { doc, autoTable } = await newForm('Kadiwa Daily Sales Form');
  let y = heading(doc, 'DAILY SALES FORM', SALES_FORM_CODE, `Kadiwa ng Pangulo · printed ${formatDate(new Date().toISOString())}`);
  blank(doc, 'Date', PAGE.left, y, 80, 'MM/DD/YYYY');
  blank(doc, 'Prepared by / Seller', 90, y, PAGE.right);
  y += 7;
  y = instructions(doc, [
    'Write in block letters with a black or blue pen. For each good sold, write the quantity or the total amount (or both); leave unsold lines blank.',
    'Write a different price on its line if it changed today. Use the blank lines for other goods. Write every expense with what it was for (write 0 if there were none).',
  ], y);

  y = sectionTitle(doc, 'A. GOODS SOLD', '', y + 1);
  const goodsRows = goods.map((good, index) => [String(index + 1), good.name, good.unit ?? '', good.price === null ? '' : amount(good.price), '', '']);
  const others = Array.from({ length: OTHER_GOODS_LINES }, (_, index) => [String(goods.length + index + 1), '', '', '', '', '']);
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['#', 'GOODS SOLD', 'UNIT', 'PRICE', 'QUANTITY', 'TOTAL AMOUNT']],
    body: [...goodsRows, ...others],
    columnStyles: { 0: { cellWidth: 9, halign: 'center', textColor: 90 }, 1: { cellWidth: 62, fontStyle: 'bold' }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 25, halign: 'right' }, 4: { cellWidth: 30 }, 5: { cellWidth: 40 } },
    // The blank lines for other goods are written in by hand, not in bold.
    didParseCell: (data) => { if (data.section === 'body' && data.row.index >= goods.length) data.cell.styles.fontStyle = 'normal'; },
  });

  const sellable = inventory.filter((item) => item.stock > 0 && item.costPrice !== null).sort((a, b) => productLabel(a).localeCompare(productLabel(b)));
  y = sectionTitle(doc, 'B. STORE ITEMS SOLD', sellable.length ? '(from the store inventory; counted in GROCERIES; write how many were sold)' : '', finalY(doc) + 8);
  if (sellable.length) {
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['CODE', 'PRODUCT', 'SELLING PRICE', 'QUANTITY SOLD', 'AMOUNT']],
      body: sellable.map((item) => [item.id, `${productLabel(item)} (${item.unit})`, amount(item.price), '', '']),
      columnStyles: { 0: { cellWidth: 21, fontSize: 7.5, textColor: 70 }, 1: { cellWidth: 70, fontStyle: 'bold' }, 2: { cellWidth: 27, halign: 'right' }, 3: { cellWidth: 30 }, 4: { cellWidth: 38 } },
    });
    y = finalY(doc);
  } else {
    font(doc, 'italic', 8.5, 90);
    doc.text('No store items in stock with a cost price.', PAGE.left, y + 3);
    y += 4;
  }

  y = sectionTitle(doc, 'C. EXPENSES', '', y + 8);
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['#', 'WHAT IT WAS FOR (e.g. Transportation, Plastic bags, Ice)', 'AMOUNT']],
    body: Array.from({ length: EXPENSE_LINES }, (_, index) => [String(index + 1), '', '']),
    columnStyles: { 0: { cellWidth: 9, halign: 'center', textColor: 90 }, 1: { cellWidth: 137 }, 2: { cellWidth: 40 } },
  });

  y = sectionTitle(doc, 'TOTALS', '', finalY(doc) + 8);
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    body: [['TOTAL GOODS SOLD (A + B)', ''], ['TOTAL EXPENSES (C)', ''], ['NET INCOME', '']],
    styles: { ...tableStyles.styles, minCellHeight: 9, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 106, halign: 'right' }, 1: { cellWidth: 80 } },
    rowPageBreak: 'avoid',
  });
  signatures(doc, finalY(doc), ['Prepared by / Seller (name and signature)', 'Received by (name and signature)']);
  footers(doc, SALES_FORM_CODE, 'Scan in OCR Scanner to save to the Kadiwa Store');
  doc.save(`Kadiwa Daily Sales Form.pdf`);
}
