import { apiGet } from '../../lib/api';
import type { Pagination } from '../../app/services/authApi';

/** sales: a Kadiwa vendor's sales (sent, confirmed, rejected). */
export type ActivityCategory = 'security' | 'profile' | 'savings' | 'loans' | 'machinery' | 'sales';

export interface ActivityEntry {
  id: number;
  at: string;
  action: string;
  label: string;
  category: ActivityCategory;
  actor: 'you' | 'office';
  status: 'success' | 'failed';
  description: string;
  changes: string[];
  device: string | null;
  ipAddress: string | null;
  /** The amount of money, for payments, savings, contributions and loans. */
  amount?: number | null;
}

export interface ActivityFilters {
  search?: string;
  category?: ActivityCategory | '';
  actor?: 'me' | 'office' | '';
  status?: 'SUCCESS' | 'FAILED' | '';
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface ActivityResponse {
  success: boolean;
  data: ActivityEntry[];
  pagination: Pagination;
  summary: { lastSignIn: string | null; lastSignInDevice?: string | null; failedSignIns30Days: number };
  categories: Partial<Record<ActivityCategory, string>>;
}

function load(path: string, filters: ActivityFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
  return apiGet<ActivityResponse>(`${path}?${params.toString()}`);
}

/** The signed-in member's activity log. */
export const fetchMyActivity = (filters: ActivityFilters) => load('/api/members/me/activity', filters);
/** The signed-in Kadiwa vendor's activity log. */
export const fetchVendorActivity = (filters: ActivityFilters) => load('/api/vendor/activity', filters);
