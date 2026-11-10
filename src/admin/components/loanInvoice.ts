// The receipt of a fully paid loan, laid out exactly like the cooperative's paper
// invoice. What the system knows is filled in (member, date, principal and interest,
// totals, amount received, who recorded the last payment); every other field of
// the paper form (TIN, address, SC/PWD ID, discount, BIR and printer details) is left blank.
import type { AdminLoan, AdminPayment } from '../../app/services/authApi';
import { dateOnlyToday } from '../../utils/dateTime';
import { interestRateLabel } from '../../lib/loanPolicy';

export const INVOICE_HEADER = {
  name: 'Amnay Cabagan Irrigators and Farmers Agriculture Cooperative',
  address: 'Barahan, Sta. Cruz, Occidental Mindoro',
  tin: 'NON-VAT Reg. TIN: 755-035-236-00000',
};

export interface LoanInvoiceLine { description: string; qty: number; unitPrice: number; amount: number }

export interface LoanInvoice {
  invoiceNo: string;
  date: string;
  soldTo: string;
  lines: LoanInvoiceLine[];
  totalSales: number;
  totalDue: number;
  /** What the member paid in all, and the same in words, for "Received the amount of". */
  amountReceived: number;
  amountInWords: string;
  cashier: string;
}

const cents = (value: number) => Math.round(value * 100);
const capitalize = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : value;

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}
/** 12345.5 -> "Twelve Thousand Three Hundred Forty-Five Pesos and 50/100" */
export function pesosInWords(value: number) {
  const total = cents(value);
  let whole = Math.floor(total / 100);
  const centavos = total % 100;
  if (whole === 0) return `Zero Pesos and ${String(centavos).padStart(2, '0')}/100`;
  const groups: string[] = [];
  const scales = ['', 'Thousand', 'Million', 'Billion'];
  for (let i = 0; whole > 0 && i < scales.length; i += 1, whole = Math.floor(whole / 1000)) {
    const chunk = whole % 1000;
    if (chunk) groups.unshift(`${belowThousand(chunk)}${scales[i] ? ` ${scales[i]}` : ''}`);
  }
  return `${groups.join(' ')} Peso${cents(value) >= 200 ? 's' : ''} and ${String(centavos).padStart(2, '0')}/100`;
}

export function buildLoanInvoice(loan: AdminLoan, payments: AdminPayment[]): LoanInvoice {
  const sorted = [...payments].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  const last = sorted[sorted.length - 1];
  const interest = Math.max(0, cents(loan.totalAmount) - cents(loan.amount)) / 100;
  const lines: LoanInvoiceLine[] = [
    { description: `${capitalize(loan.loanType)} loan principal (Loan ${loan.id})`, qty: 1, unitPrice: loan.amount, amount: loan.amount },
    { description: `Interest, ${interestRateLabel(loan.interestRate, loan.term)}`, qty: 1, unitPrice: interest, amount: interest },
  ];
  const totalSales = loan.totalAmount;
  const amountReceived = loan.totalPaid > 0 ? loan.totalPaid : totalSales;
  return {
    invoiceNo: loan.id,
    date: last?.paymentDate ?? dateOnlyToday(),
    soldTo: loan.memberName,
    lines,
    totalSales,
    totalDue: totalSales,
    amountReceived,
    amountInWords: pesosInWords(amountReceived),
    cashier: last?.recordedBy ?? '',
  };
}
