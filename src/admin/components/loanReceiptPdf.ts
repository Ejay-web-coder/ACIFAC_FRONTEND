// The official receipt of a loan payment, downloaded from Loans & Payments as
// a PDF: the cooperative's logo and name, who paid for which loan, the
// principal and interest paid, and the balance left.
import { COOPERATIVE_NAME, drawPdfLogo, loadPdfLogo } from '../../lib/pdfLogo';
import { formatDate, formatDateTime } from '../../utils/dateTime';

export interface ReceiptPayment {
  id: string | number;
  paymentDate: string;
  memberName: string;
  loanNumber?: string | null;
  loanId: number | string;
  principalPaid: number;
  interestPaid: number;
  amount: number;
  remainingBalance: number;
}

// The built-in PDF fonts have no peso sign.
const pesos = (value: number) => `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (value: string) => value.replace(/₱/g, 'PHP ').replace(/[   ]/g, ' ');

export async function downloadLoanReceiptPdf(payment: ReceiptPayment) {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadPdfLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  doc.setProperties({ title: `Payment Receipt - ${payment.id}`, creator: 'ACIFAC' });
  const left = 14;
  const right = 134;
  const center = (left + right) / 2;

  let y = drawPdfLogo(doc, logo, center - 9, 8, 18) ? 33 : 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17);
  doc.text('PAYMENT RECEIPT', center, y, { align: 'center' });
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90);
  doc.text(COOPERATIVE_NAME, center, y, { align: 'center' });
  y += 4;
  doc.setDrawColor(51);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 8;

  const row = (label: string, value: string, { strong = false, rule = true } = {}) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(strong ? 11 : 9.5);
    doc.setTextColor(51);
    doc.text(label, left, y);
    doc.setFont('helvetica', strong ? 'bold' : 'normal');
    doc.setTextColor(strong ? 22 : 70);
    doc.text(plain(value), right, y, { align: 'right', maxWidth: 75 });
    if (rule) {
      doc.setDrawColor(strong ? 51 : 225);
      doc.setLineWidth(strong ? 0.4 : 0.2);
      doc.line(left, y + 2.5, right, y + 2.5);
    }
    y += strong ? 9 : 7.5;
  };
  row('Receipt Number', String(payment.id));
  row('Date', formatDate(payment.paymentDate));
  row('Member Name', payment.memberName);
  row('Loan ID', payment.loanNumber || String(payment.loanId));
  y += 3;

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(left - 2, y - 6, right - left + 4, 41, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(17);
  doc.text('Payment Details', left, y);
  y += 7;
  row('Principal Paid', pesos(payment.principalPaid));
  row('Interest Paid', pesos(payment.interestPaid));
  row('Total Payment', pesos(payment.amount), { strong: true });
  row('Remaining Balance', pesos(payment.remainingBalance), { rule: false });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('Thank you for your payment!', center, y, { align: 'center' });
  doc.text('This is a computer-generated receipt. No signature is required.', center, y + 4, { align: 'center' });
  doc.text(`Printed on ${plain(formatDateTime(new Date()))}`, center, y + 10, { align: 'center' });
  doc.save(`Receipt-${payment.id}.pdf`);
}
