// The receipt the office prints for one payment: a loan payment, a machinery
// service payment, a savings deposit or withdrawal, or a dues payment. Each
// builder turns the record into the same receipt, so they all look alike.
import type { AdminPayment } from '../../../app/services/authApi';
import type { MachineryService, ServicePayment } from '../../../app/services/machineryApi';
import type { Due, DuesPayment } from '../../../app/services/duesApi';
import { DUE_KIND_LABELS } from '../../../app/services/duesApi';
import type { MemberSavingsEntry } from '../../services/membersApi';
import { formatDate } from '../../../utils/dateTime';

export interface ReceiptLine { description: string; amount: number }

export interface PaymentReceipt {
  /** received: money paid to the cooperative; paid: money the cooperative paid out (a savings withdrawal). */
  kind: 'received' | 'paid';
  title: string;
  receiptNo: string;
  date: string;
  /** Who paid (received) or who was paid. */
  party: string;
  memberNumber?: string | null;
  lines: ReceiptLine[];
  total: number;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  balanceLabel?: string;
  balance?: number | null;
  /** The person who recorded the payment, and their position. */
  recordedBy?: string | null;
  recordedByPosition?: string | null;
}

const number = (prefix: string, id: number) => `${prefix}-${String(id).padStart(6, '0')}`;
const cents = (value: number) => Math.round(value * 100);

export function loanPaymentReceipt(payment: AdminPayment): PaymentReceipt {
  const lines: ReceiptLine[] = [];
  if (payment.penaltyPaid > 0) lines.push({ description: `Late payment penalty, loan ${payment.loanNumber}`, amount: payment.penaltyPaid });
  if (payment.interestPaid > 0) lines.push({ description: `Interest, loan ${payment.loanNumber}`, amount: payment.interestPaid });
  if (payment.principalPaid > 0) lines.push({ description: `Principal, loan ${payment.loanNumber}`, amount: payment.principalPaid });
  // Older payments may not be split; the whole amount is then one line.
  const split = lines.reduce((sum, line) => sum + cents(line.amount), 0);
  if (!lines.length || split !== cents(payment.amount)) lines.splice(0, lines.length, { description: `Loan payment, loan ${payment.loanNumber}`, amount: payment.amount });
  return {
    kind: 'received', title: 'Official Receipt', receiptNo: number('LP', payment.id), date: payment.paymentDate,
    party: payment.memberName, memberNumber: payment.memberNumber ?? null, lines, total: payment.amount,
    method: 'Cash, at the ACIFAC office', balanceLabel: 'Loan balance after this payment', balance: payment.remainingBalance,
    recordedBy: payment.recordedBy ?? null, recordedByPosition: payment.recordedByPosition ?? null,
  };
}

/** `payments` are all the payments of the service, so the balance after this one can be worked out. */
export function machineryPaymentReceipt(service: Pick<MachineryService, 'clientName' | 'memberNumber' | 'serviceType' | 'machineryName' | 'serviceDate' | 'feeAmount'>, payment: ServicePayment, payments: ServicePayment[]): PaymentReceipt {
  const ordered = [...payments].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id - b.id);
  const upTo = ordered.slice(0, ordered.findIndex((entry) => entry.id === payment.id) + 1);
  const balance = (cents(service.feeAmount) - upTo.reduce((sum, entry) => sum + cents(entry.amount), 0)) / 100;
  return {
    kind: 'received', title: 'Official Receipt', receiptNo: number('MS', payment.id), date: payment.paymentDate,
    party: service.clientName, memberNumber: service.memberNumber,
    lines: [{ description: `${service.serviceType} by ${service.machineryName} on ${formatDate(service.serviceDate)}`, amount: payment.amount }],
    total: payment.amount, method: 'Cash, at the ACIFAC office', notes: payment.notes || null,
    balanceLabel: 'Balance of the service fee', balance,
    recordedBy: payment.recordedBy, recordedByPosition: payment.recordedByPosition ?? null,
  };
}

export function savingsReceipt(member: { memberName: string; memberNumber: string }, entry: MemberSavingsEntry): PaymentReceipt {
  const withdrawal = entry.type === 'Withdrawal';
  return {
    kind: withdrawal ? 'paid' : 'received', title: withdrawal ? 'Savings Withdrawal Receipt' : 'Official Receipt',
    receiptNo: number(withdrawal ? 'SW' : 'SD', entry.id), date: entry.date,
    party: member.memberName, memberNumber: member.memberNumber,
    lines: [{ description: withdrawal ? 'Savings withdrawal' : 'Savings deposit', amount: entry.amount }],
    total: entry.amount, method: entry.paymentMethod, reference: entry.reference, notes: entry.notes || null,
    balanceLabel: 'Savings balance after this entry', balance: entry.balance,
    recordedBy: entry.recordedBy, recordedByPosition: entry.recordedByPosition ?? null,
  };
}

/** `dues` are the member's dues; the ones this payment settled are its lines. */
export function duesReceipt(member: { name: string; memberNumber: string | null }, payment: DuesPayment, dues: Due[]): PaymentReceipt {
  const paid = dues.filter((due) => due.paymentId === payment.id);
  const lines = paid.length
    ? paid.map((due) => ({ description: due.activityTitle ? `${DUE_KIND_LABELS[due.kind]}: ${due.activityTitle} (${formatDate(due.dueDate)})` : due.description || DUE_KIND_LABELS[due.kind], amount: due.amount }))
    : [{ description: `Dues (${payment.duesCount})`, amount: payment.amount }];
  return {
    kind: 'received', title: 'Official Receipt', receiptNo: number('DP', payment.id), date: payment.paymentDate,
    party: member.name, memberNumber: member.memberNumber, lines, total: payment.amount,
    method: payment.paymentMethod, reference: payment.reference, notes: payment.notes || null,
    recordedBy: payment.recordedBy, recordedByPosition: payment.recordedByPosition ?? null,
  };
}

/** "Lorna Cruz, Treasurer", or the name alone. */
export const recorderLine = (receipt: Pick<PaymentReceipt, 'recordedBy' | 'recordedByPosition'>) =>
  [receipt.recordedBy, receipt.recordedByPosition].filter(Boolean).join(', ');
