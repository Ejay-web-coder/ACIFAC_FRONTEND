// Saves the receipt of a fully paid loan as a PDF (A5 landscape), drawn exactly
// like the cooperative's paper invoice. Fields the system has no data for stay blank.
import type { jsPDF } from 'jspdf';
import { drawPdfLogo, loadPdfLogo } from '../../lib/pdfLogo';
import { formatDate } from '../../utils/dateTime';
import { INVOICE_HEADER, type LoanInvoice } from './loanInvoice';

// The built-in PDF fonts have no peso sign.
const money = (value: number) => value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = (value: string) => value.replace(/₱/g, 'PHP ').replace(/[   ]/g, ' ');

function checkbox(doc: jsPDF, x: number, y: number, checked: boolean) {
  doc.setLineWidth(0.35);
  doc.rect(x, y - 2.8, 3, 3);
  if (checked) {
    doc.setLineWidth(0.5);
    doc.line(x + 0.6, y - 1.3, x + 1.3, y - 0.4);
    doc.line(x + 1.3, y - 0.4, x + 2.6, y - 2.3);
  }
}

export async function downloadLoanInvoicePdf(invoice: LoanInvoice) {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadPdfLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  doc.setProperties({ title: `Invoice - ${invoice.invoiceNo}`, creator: 'ACIFAC' });
  const left = 10;
  const right = 200;
  doc.setTextColor(17);
  doc.setDrawColor(20);

  /** A label, then a ruled line from after it to x2 with the value (if any) written on it. */
  const field = (label: string, value: string, x1: number, x2: number, at: number, size = 8.5) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x1, at);
    const start = x1 + doc.getTextWidth(label) + 1.2;
    doc.setFont('helvetica', 'normal');
    if (value) doc.text(plain(value), start + 1, at - 0.6, { maxWidth: x2 - start - 1 });
    doc.setLineWidth(0.2);
    doc.line(start, at + 0.6, x2, at + 0.6);
  };

  // Header: logo, cooperative, address, TIN, cash or charge sale, INVOICE; the number in red.
  const hasLogo = drawPdfLogo(doc, logo, left, 6, 21);
  const textX = hasLogo ? left + 24 : left;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(INVOICE_HEADER.name, textX, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(INVOICE_HEADER.address, textX, 15.5);
  doc.text(INVOICE_HEADER.tin, textX, 19.3);
  let y = 25;
  checkbox(doc, textX, y, true);
  doc.text('CASH SALES', textX + 4.5, y);
  checkbox(doc, textX + 26, y, false);
  doc.text('CHARGE SALES', textX + 30.5, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('INVOICE', textX + 58, y + 0.5);
  // The invoice number, in red at the right, as stamped on the paper form.
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(200, 30, 30);
  doc.text(`Nº ${invoice.invoiceNo}`, right, y + 0.5, { align: 'right' });
  doc.setTextColor(17);
  y = 34;

  // Sold to and date; registered name; TIN and business address.
  field('SOLD TO:', invoice.soldTo, left, 145, y);
  field('DATE', formatDate(invoice.date), 149, right, y);
  y += 6;
  field('Registered Name:', invoice.soldTo, left, right, y);
  y += 6;
  field('TIN:', '', left, 80, y);
  field('Business Address:', '', 84, right, y);
  y += 3.5;

  // Items: description, quantity, unit price, amount.
  const cols = [left, 112, 128, 162, right];
  const rowH = 5.4;
  doc.setLineWidth(0.35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.rect(left, y, right - left, 6);
  ['Item Description/Nature of Service', 'Qty.', 'Unit Cost/Price', 'Amount'].forEach((title, i) => {
    doc.text(title, (cols[i] + cols[i + 1]) / 2, y + 4.1, { align: 'center' });
  });
  const tableTop = y;
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const rows = Math.max(6, invoice.lines.length);
  for (let i = 0; i < rows; i += 1) {
    const line = invoice.lines[i];
    doc.setLineWidth(0.35);
    doc.line(left, y + rowH, right, y + rowH);
    if (line) {
      doc.text(plain(line.description), left + 1.5, y + 3.8, { maxWidth: cols[1] - left - 3 });
      doc.text(String(line.qty), (cols[1] + cols[2]) / 2, y + 3.8, { align: 'center' });
      doc.text(money(line.unitPrice), cols[3] - 1.5, y + 3.8, { align: 'right' });
      doc.text(money(line.amount), right - 1.5, y + 3.8, { align: 'right' });
    }
    y += rowH;
  }
  [left, ...cols.slice(1, 4), right].forEach((x) => doc.line(x, tableTop, x, y));

  // Below the items: the SC/PWD/NAAC/MOV/Solo Parent boxes on the left, the totals on the right.
  const totalsTop = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('SC/PWD/NAAC/MOV/ Solo Parent ID No.:', left + 1.2, totalsTop + 3.4);
  doc.text('SC/PWD/NAAC/MOV/ Signature:', left + 1.2, totalsTop + rowH * 2 + 3.4);
  doc.setLineWidth(0.35);
  doc.rect(left, totalsTop, cols[1] - left, rowH * 4);
  doc.line(left, totalsTop + rowH * 2, cols[1], totalsTop + rowH * 2);

  const totals: Array<[string, string, boolean]> = [
    ['TOTAL SALES', money(invoice.totalSales), true],
    ['Less: Discount (SC/PWD/NAAC/MOV/SP)', '', false],
    ['Less: Withholding Tax', '', false],
    ['TOTAL AMOUNT DUE', `PHP ${money(invoice.totalDue)}`, true],
  ];
  totals.forEach(([label, value, strong], i) => {
    const at = totalsTop + rowH * i;
    doc.setFont('helvetica', strong ? 'bold' : 'normal');
    doc.setFontSize(7);
    doc.text(label, cols[3] - 1.2, at + 3.8, { align: 'right' });
    doc.setFontSize(8);
    if (value) doc.text(value, right - 1.5, at + 3.8, { align: 'right' });
    doc.rect(cols[3], at, right - cols[3], rowH);
  });
  y = totalsTop + rowH * 4 + 6;

  // Received the amount of (in words), and the cashier's signature.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  checkbox(doc, left, y, true);
  doc.text('Received the amount of', left + 4.5, y);
  const wordsX = left + 4.5 + doc.getTextWidth('Received the amount of') + 1.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const wordsEnd = 115;
  const full = `${invoice.amountInWords} (PHP ${money(invoice.amountReceived)})`;
  const first: string = doc.splitTextToSize(full, wordsEnd - wordsX - 1)[0];
  const rest: string[] = doc.splitTextToSize(full.slice(first.length).trim(), wordsEnd - left - 1);
  doc.setLineWidth(0.2);
  [first, ...rest].filter(Boolean).forEach((text, i) => {
    const at = y + i * 4.4;
    const x1 = i === 0 ? wordsX : left;
    doc.text(text, x1 + 0.5, at - 0.6);
    doc.line(x1, at + 0.6, wordsEnd, at + 0.6);
  });
  const wordsBottom = y + Math.max(0, rest.length) * 4.4;

  const signLeft = 128;
  const signCenter = (signLeft + right) / 2;
  const signY = y + 3;
  doc.setFontSize(8);
  if (invoice.cashier) doc.text(plain(invoice.cashier), signCenter, signY - 1.5, { align: 'center' });
  doc.line(signLeft, signY, right, signY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('Cashier/Authorized Representative Signature', signCenter, signY + 3.2, { align: 'center' });
  y = Math.max(wordsBottom, signY + 3.2) + 6;

  // Footer, as on the paper: printer's details, BIR authority to print (blank), input-tax notice.
  field("Printer's Accreditation No.:", '', left, 68, y, 6.5);
  field('BIR AUTHORITY TO PRINT NO.:', '', 73, 132, y, 6.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('"THIS DOCUMENT IS NOT VALID FOR', right, y, { align: 'right' });
  doc.text('CLAIM OF INPUT TAX"', right, y + 3.4, { align: 'right' });
  y += 4;
  field('Date Issued:', '', left, 68, y, 6.5);
  field('Date Issued:', '', 73, 132, y, 6.5);
  y += 4;
  field('APPROVED SERIES:', '', 73, 132, y, 6.5);

  doc.save(`Invoice-${invoice.invoiceNo}.pdf`);
}
