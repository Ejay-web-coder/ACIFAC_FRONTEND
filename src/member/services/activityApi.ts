import { apiGet } from '../../lib/api';
import type { Pagination } from '../../app/services/authApi';

export type ActivityCategory = 'security' | 'profile' | 'savings' | 'loans' | 'machinery';

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

export function fetchMyActivity(filters: ActivityFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
  return apiGet<{
    success: boolean;
    data: ActivityEntry[];
    pagination: Pagination;
    summary: { lastSignIn: string | null; failedSignIns30Days: number };
    categories: Record<ActivityCategory, string>;
  }>(`/api/members/me/activity?${params.toString()}`);
}
