import { apiGet, apiPatch, apiPost } from '../../lib/api';

// Dues under the Membership Policy: PHP 250 share capital and PHP 50 savings
// per meeting, PHP 250 fine for an absence without a valid reason, PHP 500
// transfer fee. Amounts come from the server.

export type DueKind = 'share_capital' | 'savings' | 'absence_fine' | 'transfer_fee';
export type DueStatus = 'unpaid' | 'paid' | 'waived';

export const DUE_KIND_LABELS: Record<DueKind, string> = {
  share_capital: 'Share capital',
  savings: 'Savings',
  absence_fine: 'Absence fine',
  transfer_fee: 'Transfer fee',
};

export interface DuesRates { [kind: string]: { label: string; amount: number } }

export interface DuesSummary {
  charged: number;
  paid: number;
  waived: number;
  unpaid: number;
  unpaidCount: number;
  oldestUnpaid: string | null;
  unpaidShareCapital: number;
  unpaidSavings: number;
  unpaidFines: number;
  unpaidFees: number;
}

export interface Due {
  id: number;
  memberId: number;
  kind: DueKind;
  amount: number;
  dueDate: string;
  activityId: number | null;
  activityTitle: string | null;
  description: string;
  status: DueStatus;
  paymentId: number | null;
  paidOn: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  waivedBy: string | null;
}

export interface DuesPayment {
  id: number;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  notes: string;
  recordedBy: string | null;
  recordedByPosition?: string | null;
  duesCount: number;
}

export interface MemberDuesDetail {
  summary: DuesSummary;
  dues: Due[];
  payments: DuesPayment[];
  rates: DuesRates;
}

export interface MemberDuesRow extends DuesSummary {
  memberId: number;
  memberNumber: string | null;
  name: string;
  memberStatus: string;
  lastPaymentDate: string | null;
}

export interface DuesMeeting {
  id: number;
  title: string;
  activityDate: string;
  duesChargedAt: string | null;
  members: number;
  absent: number;
  charged: number;
  unpaid: number;
}

export type DuesFilter = 'owing' | 'settled' | 'all';
/** Dues are paid in cash only, at the office. */
export const DUES_PAYMENT_METHOD = 'Cash';

export const fetchMyDues = () => apiGet<MemberDuesDetail & { success: boolean }>('/api/dues/me');

export function fetchMemberDuesList({ search = '', filter = 'owing', page = 1, limit = 25 }: { search?: string; filter?: DuesFilter; page?: number; limit?: number }) {
  const params = new URLSearchParams({ filter, page: String(page), limit: String(limit) });
  if (search.trim()) params.set('search', search.trim());
  return apiGet<{ data: MemberDuesRow[]; totals: DuesSummary & { membersOwing: number }; rates: DuesRates; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/dues?${params}`);
}

export const fetchMemberDues = (memberId: number) => apiGet<MemberDuesDetail & { member: { id: number; memberNumber: string | null; name: string; status: string } }>(`/api/dues/members/${memberId}`);

export const recordDuesPayment = (body: { memberId: number; dueIds: number[]; paymentDate: string; paymentMethod: string; reference?: string; notes?: string }) =>
  apiPost<MemberDuesDetail & { message: string }>('/api/dues/payments', body);

export const addTransferFee = (body: { memberId: number; transferTo: string; date?: string; notes?: string }) =>
  apiPost<MemberDuesDetail & { message: string }>('/api/dues/transfer-fee', body);

export const waiveDue = (id: number, reason: string) => apiPatch<MemberDuesDetail & { message: string }>(`/api/dues/${id}/waive`, { reason });

export const fetchDuesMeetings = () => apiGet<{ data: DuesMeeting[]; rates: DuesRates }>('/api/dues/meetings');

export const chargeMeetingDues = (id: number) => apiPost<{ message: string; data: { members: number; added: number } }>(`/api/dues/meetings/${id}/charge`);
