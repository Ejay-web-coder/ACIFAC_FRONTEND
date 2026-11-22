import { apiDelete, apiGet, apiPost } from '../../lib/api';

// Other income of the cooperative: money from outside its modules (donations,
// grants, bank interest, rent of the hall, ...), recorded by the office. Part
// of "Others" in the Dashboard's Net Income and Capital. Administrators only.

export interface OtherIncomeEntry {
  id: number;
  receivedOn: string;
  source: string;
  amount: number;
  reference: string | null;
  notes: string;
  recordedBy: string | null;
  createdAt: string;
}

/** Suggestions for the source; anything else may be typed. */
export const OTHER_INCOME_SOURCES = ['Donation', 'Grant / subsidy', 'Bank interest', 'Rent of hall or equipment', 'Sale of old assets', 'Refund'];

const mapEntry = (row: Record<string, unknown>): OtherIncomeEntry => ({ ...(row as unknown as OtherIncomeEntry), amount: Number(row.amount ?? 0) });

export async function fetchOtherIncome() {
  const data = await apiGet<{ data: Record<string, unknown>[]; total: string }>('/api/other-income');
  return { entries: data.data.map(mapEntry), total: Number(data.total) };
}

export async function recordOtherIncome(payload: { receivedOn: string; source: string; amount: string; reference?: string; notes?: string }) {
  const data = await apiPost<{ data: Record<string, unknown> }>('/api/other-income', payload);
  return mapEntry(data.data);
}

export const deleteOtherIncome = (id: number) => apiDelete<{ success: boolean }>(`/api/other-income/${id}`);
