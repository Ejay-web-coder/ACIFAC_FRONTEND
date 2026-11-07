import { apiGet, apiPut } from '../../lib/api';

/** Who holds each position on the organizational chart: position key -> name (vacant positions are left out). */
export interface OrgChart {
  positions: Record<string, string>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const fetchOrgChart = () => apiGet<OrgChart>('/api/org-chart');
/** Saves the names given; a blank name leaves the position vacant. */
export const saveOrgChart = (positions: Record<string, string>) => apiPut<OrgChart & { message: string }>('/api/org-chart', { positions });
