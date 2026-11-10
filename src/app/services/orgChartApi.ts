import { apiDelete, apiFetch, apiGet, apiPut } from '../../lib/api';

/** The boxes of the organizational chart; an added committee's box is its key ('c-…'). */
export type OrgChartGroup = 'audit' | 'election' | 'bod' | 'officers' | 'ethics' | 'education' | 'gad' | 'mediation' | 'manager' | 'staff' | `c-${string}`;

/** A committee the office added to the chart. */
export interface OrgChartCommittee { key: `c-${string}`; title: string }

/** One position on the chart: its role, who holds it (blank = vacant) and whether it has a 2x2 picture. */
export interface OrgChartEntry {
  id: number;
  group: OrgChartGroup;
  role: string;
  name: string;
  hasPhoto: boolean;
  /** Added by the office (can be removed); the printed chart's positions cannot. */
  custom: boolean;
  updatedAt: string;
}

export interface OrgChart {
  entries: OrgChartEntry[];
  committees: OrgChartCommittee[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export const fetchOrgChart = () => apiGet<OrgChart>('/api/org-chart');
/** Saves the whole chart: entries without an id are added; added entries and committees left out are removed. */
export const saveOrgChart = (entries: Array<{ id?: number; group: OrgChartGroup; role: string; name: string }>, committees: OrgChartCommittee[]) =>
  apiPut<OrgChart & { message: string }>('/api/org-chart', { entries, committees });
export function uploadOrgChartPhoto(id: number, file: File) {
  const form = new FormData();
  form.append('photo', file);
  return apiFetch<OrgChart>(`/api/org-chart/${id}/photo`, { method: 'POST', body: form });
}
export const deleteOrgChartPhoto = (id: number) => apiDelete<OrgChart>(`/api/org-chart/${id}/photo`);
export const orgChartPhotoPath = (entry: Pick<OrgChartEntry, 'id' | 'updatedAt'>) => `/api/org-chart/${entry.id}/photo?v=${encodeURIComponent(entry.updatedAt)}`;
