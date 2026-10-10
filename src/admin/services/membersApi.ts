import type { Member } from '../pages/MembershipManagement';
import { apiFetch, apiGet, apiPatch, apiPost, apiPut } from '../../lib/api';
import type { Pagination } from '../../app/services/authApi';
import type { OcrIdReading, VerificationCheck } from './ocrApi';

// Children were first saved as text: "Ana (7); Ben (Age not provided)".
function parseChildrenText(text: string) {
  return text.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = /^(.*?)\s*\(([^)]*)\)$/.exec(part);
    const age = match ? match[2].trim() : '';
    return { name: (match ? match[1] : part).trim(), age: /^age not provided$/i.test(age) ? '' : age };
  });
}

function readAdditionalInfo(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim()) {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return {};
}

function readTermination(value: unknown): MemberTermination | null {
  const termination = readAdditionalInfo(value);
  return typeof termination.type === 'string' ? termination as unknown as MemberTermination : null;
}

const rowList =<T extends Record<string, string>>(value: unknown, keys: Array<keyof T>): T[] => (Array.isArray(value) ? value : [])
  .map((item) => Object.fromEntries(keys.map((key) => [key, String((item as Record<string, unknown>)?.[key as string] ?? '')])) as T);

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

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
    termination: readTermination(record.termination ?? readAdditionalInfo(record.additional_info).termination),
    idDocumentName: record.id_document_name ? String(record.id_document_name) : null,
    idDocumentType: record.id_document_type ? String(record.id_document_type) : null,
    idDocumentSize: record.id_document_size ? Number(record.id_document_size) : null,
    hasIdDocument: Boolean(record.has_id_document ?? record.id_document_name),
    signatureCount: Number(record.signature_count || 0),
    createdAt: String(record.created_at || ''),
    updatedAt: String(record.updated_at || ''),
    shareDetails: record.shareDetails as Member['shareDetails'],
    profile: {
      firstName: String(record.first_name || ''),
      middleName: String(record.middle_name || ''),
      lastName: String(record.last_name || ''),
      suffix: String(record.suffix || ''),
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
      ...(() => {
        const info = readAdditionalInfo(record.additional_info);
        const text = (key: string) => String(info[key] ?? '');
        const childrenList = rowList<{ name: string; age: string }>(info.children, ['name', 'age']);
        return {
          motherMaidenName: text('motherMaidenName'),
          motherLastName: text('motherLastName'),
          motherFirstName: text('motherFirstName'),
          motherMiddleName: text('motherMiddleName'),
          childrenList: childrenList.length ? childrenList : parseChildrenText(String(record.children ?? '')),
          incomeSources: rowList<{ source: string; amount: string }>(info.incomeSources, ['source', 'amount']),
          membershipType: text('membershipType'),
          separationDate: text('separationDate'),
          bodResolution: text('bodResolution'),
          membershipFee: text('membershipFee'),
          dateReceived: text('dateReceived'),
          preMembershipSeminar: text('preMembershipSeminar'),
          paymentOfMembershipFee: text('paymentOfMembershipFee'),
          orNumber: text('orNumber'),
          initialPaidUpCapital: text('initialPaidUpCapital'),
          seminarOrNumber: text('seminarOrNumber'),
          seminarCertifiedBy: text('seminarCertifiedBy'),
          feeCertifiedBy: text('feeCertifiedBy'),
          capitalOrNumber: text('capitalOrNumber'),
          capitalCertifiedBy: text('capitalCertifiedBy'),
        };
      })(),
    },
  };
}

export function fetchMembers(search = '', limit = 100, options: { page?: number; status?: string } = {}) {
  const params = new URLSearchParams({ page: String(options.page || 1), limit: String(limit) });
  if (search.trim()) params.set('search', search.trim());
  if (options.status) params.set('status', options.status);
  return apiGet<{ data: Record<string, unknown>[]; pagination: MembersResponse['pagination'] }>(`/api/members?${params.toString()}`).then((response) => ({
    ...response,
    data: response.data.map(mapMember),
  }));
}

export function fetchArchivedMembers(search = '') {
  const params = new URLSearchParams({ page: '1', limit: '100' });
  if (search.trim()) params.set('search', search.trim());
  return apiGet<{ data: Record<string, unknown>[]; pagination: MembersResponse['pagination'] }>(`/api/members/archived?${params.toString()}`).then((response) => ({
    ...response,
    data: response.data.map(mapMember),
  }));
}

export function fetchMemberStatistics() {
  return apiGet<ApiResponse<MemberStatistics>>('/api/members/statistics');
}

// Kept well under the backend limit (200) so each request finishes inside the serverless time limit.
export const MEMBER_IMPORT_BATCH_SIZE = 50;

export interface MemberImportRow {
  row_number: number;
  [field: string]: string | number | undefined;
}

export interface MemberImportResult {
  row: number;
  success: boolean;
  id?: number;
  memberNumber?: string;
  name?: string;
  errors?: string[];
}

export function importMembersRequest(rows: MemberImportRow[]) {
  return apiPost<ApiResponse<{ imported: number; failed: number; results: MemberImportResult[] }>>('/api/members/import', { rows });
}

/** The applicant's valid ID file (a back-to-back copy with 3 specimen signatures) and AI's reading of it in the form. */
export interface MemberIdUpload {
  file: File;
  readingId: number;
  /** The admin compared the flagged ID details with the applicant. */
  acknowledgeIdWarnings: boolean;
}

function appendMemberId(form: FormData, id: MemberIdUpload) {
  form.append('id_document_reading', String(id.readingId));
  form.append('idDocument', id.file);
  if (id.acknowledgeIdWarnings) form.append('acknowledge_id_warnings', 'true');
}

/** AI reads the applicant's valid ID picked in Add Member or Edit Member. */
export function readMemberId(file: File, source: 'upload' | 'camera') {
  const form = new FormData();
  form.append('source', source);
  form.append('idDocument', file);
  return apiPost<{ readingId: number; reading: OcrIdReading; message: string }>('/api/members/id-reading', form);
}

/** How the ID read so far compares with the applicant on the form. */
export function previewMemberIdChecks(payload: { idReading: number; firstName: string; middleName: string; lastName: string; dateOfBirth: string; idNumber: string }) {
  return apiPost<{ checks: VerificationCheck[] }>('/api/members/id-checks', payload);
}

export function createMemberRequest(payload: Record<string, unknown>, idDocument: MemberIdUpload, profilePhoto: File | null = null) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== null && value !== undefined) form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  appendMemberId(form, idDocument);
  if (profilePhoto) form.append('profilePhoto', profilePhoto);
  return apiFetch<ApiResponse<Record<string, unknown>>>('/api/members', { method: 'POST', body: form }).then((response) => ({ ...response, data: mapMember(response.data) }));
}

/** Edit Member: replaces the 2x2 photo and/or the valid ID; null keeps the file on record. */
export function replaceMemberDocumentsRequest(id: number, files: { photo: File | null; idDocument: MemberIdUpload | null }) {
  const form = new FormData();
  if (files.idDocument) appendMemberId(form, files.idDocument);
  if (files.photo) form.append('profilePhoto', files.photo);
  return apiFetch<ApiResponse<Record<string, unknown>>>(`/api/members/${id}/documents`, { method: 'POST', body: form }).then((response) => ({ ...response, data: mapMember(response.data) }));
}

export function updateMemberRequest(id: number, payload: Record<string, unknown>) {
  return apiPut<ApiResponse<Record<string, unknown>>>(`/api/members/${id}`, payload).then((response) => ({ ...response, data: mapMember(response.data) }));
}

/** Termination of membership under the by-laws: automatic, voluntary, or involuntary for one of the causes. */
export type TerminationType = 'automatic' | 'voluntary' | 'involuntary';
export type InvoluntaryCause = 'noPatronage' | 'failedObligations' | 'violatedBylaws' | 'injuriousAct';
export interface MemberTermination {
  type: TerminationType;
  cause?: InvoluntaryCause;
  /** The day the membership was terminated (also the Separation date on the form). */
  date?: string;
}

/** Terminates the membership: the member moves to the terminated list. */
export function terminateMemberRequest(id: number, termination: { type: TerminationType; cause?: InvoluntaryCause }) {
  return apiPatch<{ success: boolean; message: string }>(`/api/members/${id}/archive`, { terminationType: termination.type, cause: termination.cause });
}

export function restoreMemberRequest(id: number) {
  return apiPatch<{ success: boolean; message: string }>(`/api/members/${id}/restore`);
}

export function fetchMemberRequest(id: number) {
  return apiGet<ApiResponse<Record<string, unknown>>>(`/api/members/${id}`).then((response) => ({ ...response, data: mapMember(response.data) }));
}

export function addShareContributionRequest(id: number, payload: { amount: number; contributionDate: string; paymentMethod?: string; referenceNumber?: string; notes?: string }) {
  return apiPost<ApiResponse<ShareDetails> & { contribution: { id: number; memberId: number; amount: number; date: string; paymentMethod: string | null; reference: string | null; notes: string } }>(`/api/members/${id}/share-contributions`, payload);
}

export interface SavingsRecord {
  id: number;
  memberId: number;
  memberName: string;
  memberNumber: string;
  date: string;
  amount: number;
  type: 'Deposit' | 'Withdrawal';
  createdAt?: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  status: 'Completed' | 'Pending';
}

/** totalAmount is the savings balance (deposits minus withdrawals); today and thisMonth are deposits. */
export interface SavingsSummary { totalAmount: number; totalRecords: number; members: number; today: number; thisMonth: number; withdrawals?: number }

export function fetchSavingsRecords(params: { page?: number; limit?: number; search?: string; memberId?: number; date?: string } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '' && value !== null) search.set(key, String(value));
  return apiGet<ApiResponse<SavingsRecord[]> & { summary: SavingsSummary; pagination: Pagination }>(`/api/members/savings${search.toString() ? `?${search}` : ''}`);
}

export function createSavingsRequest(payload: { memberId: number; amount: string; date: string; paymentMethod?: string; reference?: string; notes?: string }) {
  return apiPost<ApiResponse<SavingsRecord> & { memberTotal: number }>('/api/members/savings', payload);
}

/** Takes money out of a member's savings; the server refuses more than the balance. */
export function createSavingsWithdrawal(payload: { memberId: number; amount: string; date: string; paymentMethod?: string; reference?: string; notes?: string }) {
  return apiPost<ApiResponse<SavingsRecord> & { memberTotal: number }>('/api/members/savings/withdrawals', payload);
}

/** A member with savings entries: the balance (deposits minus withdrawals) and the totals. */
export interface SavingsMember {
  id: number;
  memberNumber: string;
  memberName: string;
  balance: number;
  deposits: number;
  withdrawals: number;
  transactions: number;
  lastTransactionDate: string | null;
}

/** Members with savings, by name; search matches the name or the member ID. */
export function fetchSavingsMembers(params: { search?: string; page?: number; limit?: number } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '' && value !== null) search.set(key, String(value));
  return apiGet<ApiResponse<SavingsMember[]> & { pagination: Pagination }>(`/api/members/savings/members${search.toString() ? `?${search}` : ''}`);
}

/** One entry of a member's savings history, with the balance after it. */
export interface MemberSavingsEntry {
  id: number;
  type: 'Deposit' | 'Withdrawal';
  amount: number;
  balance: number;
  date: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  recordedBy: string | null;
  createdAt?: string;
}

/** maintainingBalance must stay in savings (PHP 500, or 0 for a terminated member); withdrawable is the most a withdrawal can take now. */
export interface MemberSavingsSummary { balance: number; deposits: number; withdrawals: number; transactions: number; maintainingBalance: number; withdrawable: number }

/** One member's savings history, newest first. */
export function fetchMemberSavings(id: number, params: { page?: number; limit?: number } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  return apiGet<ApiResponse<MemberSavingsEntry[]> & { member: { id: number; memberNumber: string; memberName: string; status: string }; summary: MemberSavingsSummary; pagination: Pagination }>(`/api/members/${id}/savings${search.toString() ? `?${search}` : ''}`);
}

export const memberDocumentPath = (memberId: number, kind: 'id-document' | 'photo' | `signature-${1 | 2 | 3}`) => `/api/members/${memberId}/documents/${kind}`;
