// The receipt of one payment as a PDF (half of an A4 page, A5), to save or to
// print. Loaded only when a receipt is printed or downloaded.
import { jsPDF } from 'jspdf';
import { drawPdfLogo, loadPdfLogo } from '../../../lib/pdfLogo';
import { formatDate, formatDateTime } from '../../../utils/dateTime';
import { INVOICE_HEADER, pesosInWords } from '../loanInvoice';
import { recorderLine, type PaymentReceipt } from './paymentReceipt';

// The built-in PDF fonts have no peso sign or narrow spaces.
const pdfText = (value: string) => value.replace(/₱/g, 'PHP ').replace(/[   ]/g, ' ');
const money = (value: number) => `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function buildReceiptPdf(receipt: PaymentReceipt) {
  const logo = await loadPdfLogo();
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  doc.setProperties({ title: `${receipt.title} ${receipt.receiptNo}` });
  const left = 12;
  const right = 136;
  let y = 12;

  // Header: logo, the cooperative, its address and TIN; the receipt number on the right.
  const hasLogo = drawPdfLogo(doc, logo, left, y, 16);
  const textLeft = hasLogo ? left + 19 : left;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(17);
  doc.text(doc.splitTextToSize(INVOICE_HEADER.name, right - textLeft - 30), textLeft, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80);
  doc.text(INVOICE_HEADER.address, textLeft, y + 12);
  doc.text(INVOICE_HEADER.tin, textLeft, y + 15.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(185, 28, 28);
  doc.text(`No. ${receipt.receiptNo}`, right, y + 4, { align: 'right' });
  y += 24;

  doc.setDrawColor(51);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 8;
  doc.setTextColor(17);
  doc.setFontSize(14);
  doc.text(receipt.title.toUpperCase(), (left + right) / 2, y, { align: 'center' });
  y += 9;

  const field = (label: string, value: string, x: number, width: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(60);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(17);
    doc.text(pdfText(value), x + doc.getTextWidth(label) + 2, y);
    doc.setDrawColor(150);
    doc.setLineWidth(0.15);
    doc.line(x + doc.getTextWidth(label) + 1, y + 1.2, x + width, y + 1.2);
  };
  field(receipt.kind === 'paid' ? 'Paid to:' : 'Received from:', receipt.party, left, 82);
  field('Date:', formatDate(receipt.date), left + 86, right - left - 86);
  y += 7;
  if (receipt.memberNumber) { field('Member ID:', receipt.memberNumber, left, 82); y += 7; }

  // The lines and the total.
  y += 2;
  doc.setFillColor(243, 244, 246);
  doc.rect(left, y - 4.5, right - left, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Particulars', left + 2, y);
  doc.text('Amount', right - 2, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'normal');
  for (const line of receipt.lines) {
    const description = doc.splitTextToSize(pdfText(line.description), 88);
    doc.text(description, left + 2, y);
    doc.text(money(line.amount), right - 2, y, { align: 'right' });
    y += description.length * 4.2 + 2;
  }
  doc.setDrawColor(51);
  doc.setLineWidth(0.4);
  doc.line(left, y - 2, right, y - 2);
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', left + 2, y);
  doc.text(money(receipt.total), right - 2, y, { align: 'right' });
  y += 6;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(60);
  doc.text(doc.splitTextToSize(`${receipt.kind === 'paid' ? 'The amount of' : 'Received the amount of'} ${pesosInWords(receipt.total)}`, right - left - 4), left + 2, y);
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(17);
  doc.setFontSize(8.5);
  const details: Array<[string, string]> = [];
  if (receipt.method) details.push(['Payment method:', receipt.method]);
  if (receipt.reference) details.push(['Reference:', receipt.reference]);
  if (receipt.balance !== undefined && receipt.balance !== null) details.push([`${receipt.balanceLabel || 'Balance'}:`, money(receipt.balance)]);
  if (receipt.notes) details.push(['Notes:', receipt.notes]);
  for (const [label, value] of details) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, left + 2, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(pdfText(value), right - left - 50);
    doc.text(lines, left + 48, y);
    y += lines.length * 4.2 + 1.5;
  }

  // Who received the money: the person who recorded it, with a line to sign.
  y = Math.max(y + 12, 160);
  const signLeft = right - 62;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(pdfText(recorderLine(receipt) || ' '), (signLeft + right) / 2, y, { align: 'center' });
  doc.setDrawColor(51);
  doc.setLineWidth(0.3);
  doc.line(signLeft, y + 1.5, right, y + 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(receipt.kind === 'paid' ? 'Released by' : 'Cashier/Authorized Representative', (signLeft + right) / 2, y + 5, { align: 'center' });
  if (receipt.kind === 'paid') {
    doc.line(left, y + 1.5, left + 56, y + 1.5);
    doc.text('Received by (member)', left + 28, y + 5, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(pdfText(`Printed on ${formatDateTime(new Date())}`), (left + right) / 2, 200, { align: 'center' });
  return doc;
}

export async function downloadReceiptPdf(receipt: PaymentReceipt) {
  (await buildReceiptPdf(receipt)).save(`${receipt.receiptNo}.pdf`);
}

/** Opens the receipt in a new tab with the print window; false if the browser blocked the tab (then it is downloaded). */
export async function printReceiptPdf(receipt: PaymentReceipt) {
  const doc = await buildReceiptPdf(receipt);
  doc.autoPrint();
  const opened = window.open(doc.output('bloburl'), '_blank');
  if (!opened) {
    doc.save(`${receipt.receiptNo}.pdf`);
    return false;
  }
  return true;
}
