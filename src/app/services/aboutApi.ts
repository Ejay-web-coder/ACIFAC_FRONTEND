import { apiDelete, apiGet, apiPost, apiPut } from '../../lib/api';

/** The About page's Mission & Vision, as the office writes it (blank until filled in). */
export interface AboutContent {
  mission: string;
  vision: string;
  coreValues: string;
  updatedAt: string | null;
  /** Only sent to administrators. */
  updatedBy: string | null;
}

export const fetchAbout = () => apiGet<AboutContent>('/api/about');
export const saveAbout = (payload: Pick<AboutContent, 'mission' | 'vision' | 'coreValues'>) =>
  apiPut<AboutContent & { message: string }>('/api/about', payload);

/** A policy of the cooperative: a title, an optional introduction and its numbered rules (a rule may have several lines). */
export interface Policy {
  id: number;
  title: string;
  /** Shown above the rules ('' when there is none). */
  intro: string;
  items: string[];
  sortOrder: number;
  updatedAt: string;
  /** Only sent to administrators. */
  updatedBy?: string | null;
}
export type PolicyInput = Pick<Policy, 'title' | 'intro' | 'items'>;

export const fetchPolicies = () => apiGet<{ data: Policy[] }>('/api/policies');
export const createPolicy = (payload: PolicyInput) => apiPost<{ data: Policy; message: string }>('/api/policies', payload);
export const updatePolicy = (id: number, payload: PolicyInput) => apiPut<{ data: Policy; message: string }>(`/api/policies/${id}`, payload);
export const deletePolicy = (id: number) => apiDelete<{ message: string }>(`/api/policies/${id}`);
