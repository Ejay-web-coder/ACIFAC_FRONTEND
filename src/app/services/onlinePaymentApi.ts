import { apiGet, apiPost, apiFetch } from '../../lib/api';
import type { DueKind } from './duesApi';

// Pay online: a member pays a loan, dues or a savings deposit by GCash or Maya
// into the cooperative's account, then reports it with the screenshot and the
// reference number. The office checks its own GCash or Maya app and approves
// (the payment is then recorded like one made at the office) or rejects it
// with the reason.

export type PaymentChannelName = 'GCash' | 'Maya';
export const PAYMENT_CHANNEL_NAMES: PaymentChannelName[] = ['GCash', 'Maya'];
export type PaymentPurpose = 'loan' | 'dues' | 'savings';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentChannel {
  channel: PaymentChannelName;
  accountName: string;
  accountNumber: string;
  enabled: boolean;
  hasQr: boolean;
  /** The office's view only. */
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface PayableLoan {
  id: number;
  loanNumber: string;
  balance: number;
  penaltyDue: number;
  amountDueNow: number;
  /** Already in payments the office is still checking. */
  pendingAmount: number;
  /** What can still be paid online now. */
  payableNow: number;
  dueDate: string | null;
}

export interface PayableDue {
  id: number;
  kind: DueKind;
  amount: number;
  dueDate: string;
  description: string;
}

export interface ProofReading {
  isPaymentReceipt?: boolean;
  app?: string;
  status?: string;
  amount?: string;
  referenceNumber?: string;
  date?: string;
  time?: string;
  recipientName?: string;
  recipientNumber?: string;
  confidence?: number;
  /** Why AI could not read it. */
  error?: string;
}

export interface ProofFlag {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface PaymentSubmission {
  id: number;
  memberId: number;
  memberName: string;
  /** The office's view only. */
  memberNumber?: string | null;
  purpose: PaymentPurpose;
  loanId: number | null;
  loanNumber: string | null;
  dues: Array<{ id: number; kind: DueKind; amount: number; dueDate: string; description: string }>;
  amount: number;
  channel: PaymentChannelName;
  reference: string;
  paidOn: string;
  status: SubmissionStatus;
  reviewedBy: string | null;
  reviewedByPosition?: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  /** The office's view only: what AI read on the screenshot, and the problems found. */
  reading?: ProofReading | null;
  flags?: ProofFlag[];
}

export interface MyOnlinePayments {
  submissions: PaymentSubmission[];
  payable: { loans: PayableLoan[]; dues: PayableDue[] };
  channels: PaymentChannel[];
}

export const PURPOSE_LABELS: Record<PaymentPurpose, string> = { loan: 'Loan payment', dues: 'Dues', savings: 'Savings deposit' };

/** "Loan L-2026-001", "Dues (2)", "Savings deposit" */
export function purposeLabel(submission: Pick<PaymentSubmission, 'purpose' | 'loanNumber' | 'dues'>) {
  if (submission.purpose === 'loan') return `Loan ${submission.loanNumber ?? ''}`.trim();
  if (submission.purpose === 'dues') return `Dues (${submission.dues.length})`;
  return PURPOSE_LABELS.savings;
}

/** A reference number as the server keeps it: letters and digits only, upper case. */
export const normalizeReference = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const paymentProofPath = (id: number) => `/api/payment-submissions/${id}/proof`;
export const channelQrPath = (channel: PaymentChannelName) => `/api/payment-channels/${channel}/qr`;

export const fetchMyOnlinePayments = () => apiGet<MyOnlinePayments & { success: boolean }>('/api/payment-submissions/me');

export async function submitOnlinePayment(input: {
  purpose: PaymentPurpose; channel: PaymentChannelName; referenceNumber: string; paidOn: string; proof: File;
  loanId?: number; dueIds?: number[]; amount?: string;
}) {
  const form = new FormData();
  form.append('purpose', input.purpose);
  form.append('channel', input.channel);
  form.append('referenceNumber', input.referenceNumber);
  form.append('paidOn', input.paidOn);
  if (input.loanId) form.append('loanId', String(input.loanId));
  if (input.dueIds?.length) form.append('dueIds', input.dueIds.join(','));
  if (input.amount) form.append('amount', input.amount);
  form.append('proof', input.proof);
  return apiPost<{ data: PaymentSubmission; message: string }>('/api/payment-submissions', form);
}

export function fetchOnlinePayments({ status = 'pending', page = 1, limit = 20 }: { status?: SubmissionStatus | 'all'; page?: number; limit?: number } = {}) {
  const params = new URLSearchParams({ status, page: String(page), limit: String(limit) });
  return apiGet<{ data: PaymentSubmission[]; counts: Record<SubmissionStatus, number>; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/payment-submissions?${params}`);
}

export const approveOnlinePayment = (id: number, notes = '') => apiPost<{ data: PaymentSubmission; message: string }>(`/api/payment-submissions/${id}/approve`, { confirmed: true, notes });
export const rejectOnlinePayment = (id: number, reason: string) => apiPost<{ data: PaymentSubmission; message: string }>(`/api/payment-submissions/${id}/reject`, { reason });
export const readOnlinePaymentAgain = (id: number) => apiPost<{ data: PaymentSubmission; message: string }>(`/api/payment-submissions/${id}/read-again`);

export const fetchPaymentChannels = () => apiGet<{ data: PaymentChannel[] }>('/api/payment-channels');

export function savePaymentChannel(channel: PaymentChannelName, input: { accountName: string; accountNumber: string; enabled: boolean; qr?: File | null }) {
  const form = new FormData();
  form.append('accountName', input.accountName);
  form.append('accountNumber', input.accountNumber);
  form.append('enabled', String(input.enabled));
  if (input.qr) form.append('qr', input.qr);
  return apiFetch<{ data: PaymentChannel; message: string }>(`/api/payment-channels/${channel}`, { method: 'PUT', body: form });
}
