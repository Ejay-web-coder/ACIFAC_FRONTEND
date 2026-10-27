// Printable Kadiwa forms: the Add Inventory form and the Daily Sales form,
// filled in by hand at the store and scanned in the OCR Scanner, which saves
// them to the Kadiwa Store (document types Add Inventory Form and Kadiwa Daily
// Sales Form). The layout is kept plain for the AI reader: one value per box, a
// printed line number on every line, the goods and store items pre-printed with
// their codes and prices, and a form code at the top right.
import type { KadiwaGood, KadiwaInventoryItem } from '../../../app/services/authApi';
import { formatDate } from '../../../utils/dateTime';
import { CATEGORIES, COUNT_UNITS, productLabel, SIZE_UNITS } from './InventoryForms';
import { blank, checkboxes, finalY, font, footers, heading, instructions, newForm, PAGE, sectionTitle, signatures, tableStyles } from '../paperFormPdf';

export const INVENTORY_FORM_CODE = 'KADIWA-INV';
export const SALES_FORM_CODE = 'KADIWA-SALES';
const INVENTORY_LINES = 22;
const OTHER_GOODS_LINES = 5;
const EXPENSE_LINES = 5;
const amount = (value: number | null) => (value === null ? '' : value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

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
