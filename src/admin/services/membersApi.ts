import type { Member } from '../pages/MembershipManagement';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export interface MemberStatistics {
  totalMembers: number;
  totalShareCapital: number;
  newThisMonth: number;
  archivedMembers: number;
}

export interface ShareContribution {
  id: number;
  memberId: number;
  amount: number;
  contributionDate: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  notes: string;
  createdAt: string;
  recordedBy: number | null;
  recordedByName: string | null;
}

export interface ShareDetails {
  contributions: ShareContribution[];
  total: number;
  maximum: number;
  remaining: number;
}

export interface MembersResponse {
  data: Member[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

function mapMember(record: Record<string, unknown>): Member {
  return {
    id: Number(record.id),
    name: String(record.full_name || `${record.first_name || ''} ${record.last_name || ''}`).trim(),
    memberId: String(record.member_number || ''),
    email: String(record.email || ''),
    phone: String(record.phone || ''),
    address: String(record.address || ''),
    dateJoined: String(record.membership_date || ''),
    shareCapital: Number(record.share_capital || 0),
    status: (record.status as Member['status']) || 'active',
    archivedAt: record.archived_at ? String(record.archived_at) : null,
    archivedBy: record.archived_by_username ? String(record.archived_by_username) : null,
    idDocumentName: record.id_document_name ? String(record.id_document_name) : null,
    idDocumentType: record.id_document_type ? String(record.id_document_type) : null,
    idDocumentSize: record.id_document_size ? Number(record.id_document_size) : null,
    createdAt: String(record.created_at || ''),
    updatedAt: String(record.updated_at || ''),
    shareDetails: record.shareDetails as Member['shareDetails'],
    profile: {
      firstName: String(record.first_name || ''),
      middleName: String(record.middle_name || ''),
      lastName: String(record.last_name || ''),
      birthday: String(record.date_of_birth || ''),
      gender: String(record.gender || ''),
      cpNo: String(record.phone || ''),
      permanentAddress: String(record.address || ''),
      barangay: String(record.barangay || ''),
      municipality: String(record.municipality || ''),
      province: String(record.province || ''),
      civilStatus: String(record.civil_status || ''),
      highestEducation: String(record.education || ''),
      idType: String(record.id_type || ''),
      idNo: String(record.id_number || ''),
      rsbsaNo: String(record.rsbsa_no || ''),
      livelihood: String(record.livelihood || ''),
      farmArea: String(record.farm_area_ha ?? ''),
      cornArea: String(record.corn_area_ha ?? ''),
      palayArea: String(record.palay_area_ha ?? ''),
      yearlyIncome: String(record.yearly_income ?? ''),
      spouseName: String(record.spouse_name || ''),
      spouseAge: String(record.spouse_age ?? ''),
      spouseContact: String(record.spouse_contact || ''),
      children: String(record.children ?? ''),
      emergencyContact: String(record.emergency_contact || ''),
    },
  };
}

async function memberFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Request failed');
  return payload as T;
}

export function fetchMembers(search = '', limit = 100) {
  const params = new URLSearchParams({ page: '1', limit: String(limit) });
  if (search.trim()) params.set('search', search.trim());
  return memberFetch<{ data: Record<string, unknown>[]; pagination: MembersResponse['pagination'] }>(`/api/members?${params.toString()}`).then((response) => ({
    ...response,
    data: response.data.map(mapMember),
  }));
}

export function fetchArchivedMembers(search = '') {
  const params = new URLSearchParams({ page: '1', limit: '100' });
  if (search.trim()) params.set('search', search.trim());
  return memberFetch<{ data: Record<string, unknown>[]; pagination: MembersResponse['pagination'] }>(`/api/members/archived?${params.toString()}`).then((response) => ({
    ...response,
    data: response.data.map(mapMember),
  }));
}

export function fetchMemberStatistics() {
  return memberFetch<ApiResponse<MemberStatistics>>('/api/members/statistics');
}

export function createMemberRequest(payload: Record<string, unknown>, document: File | null, profilePhoto: File | null = null) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined) form.append(key, String(value));
  });
  if (document) form.append('idDocument', document);
  if (profilePhoto) form.append('profilePhoto', profilePhoto);
  return memberFetch<ApiResponse<Record<string, unknown>>>('/api/members', { method: 'POST', body: form }).then((response) => ({ ...response, data: mapMember(response.data) }));
}

export function updateMemberRequest(id: number, payload: Record<string, unknown>) {
  return memberFetch<ApiResponse<Record<string, unknown>>>(`/api/members/${id}`, { method: 'PUT', body: JSON.stringify(payload) }).then((response) => ({ ...response, data: mapMember(response.data) }));
}

export function archiveMemberRequest(id: number) {
  return memberFetch<{ success: boolean; message: string }>(`/api/members/${id}/archive`, { method: 'PATCH' });
}

export function restoreMemberRequest(id: number) {
  return memberFetch<{ success: boolean; message: string }>(`/api/members/${id}/restore`, { method: 'PATCH' });
}

export function fetchMemberRequest(id: number) {
  return memberFetch<ApiResponse<Record<string, unknown>>>(`/api/members/${id}`).then((response) => ({ ...response, data: mapMember(response.data) }));
}

export function addShareContributionRequest(id: number, payload: { amount: number; contributionDate: string; paymentMethod?: string; referenceNumber?: string; notes?: string }) {
  return memberFetch<ApiResponse<ShareDetails> & { contribution: { id: number; memberId: number; amount: number; date: string; paymentMethod: string | null; reference: string | null; notes: string } }>(`/api/members/${id}/share-contributions`, { method: 'POST', body: JSON.stringify(payload) });
}

export interface SavingsRecord {
  id: number;
  memberId: number;
  memberName: string;
  memberNumber: string;
  date: string;
  amount: number;
  type: 'Deposit' | 'Savings Contribution';
  paymentMethod: string;
  reference: string;
  notes: string;
  status: 'Completed' | 'Pending';
}

export function fetchSavingsRecords() {
  return memberFetch<ApiResponse<SavingsRecord[]>>('/api/members/savings');
}
