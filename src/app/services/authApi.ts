import { apiDelete, apiFetch, apiGet, apiPatch, apiPost, toNumber } from '../../lib/api';
import type { OcrIdReading, VerificationCheck } from '../../admin/services/ocrApi';

export type UserRole = 'ADMIN' | 'MEMBER';

export interface Pagination { page: number; limit: number; total: number; totalPages: number }

export interface NotificationPreferences { emailNotifications: boolean; smsNotifications: boolean; loanReminders: boolean }

export interface AuthUser {
  id?: number;
  member_id?: number | null;
  username?: string;
  email?: string | null;
  role?: UserRole;
  account_status?: string;
  must_change_password?: boolean;
  last_login?: string | null;
  full_name?: string | null;
  display_name?: string;
  phone?: string | null;
  position?: string | null;
  member_number?: string | null;
  notification_preferences?: NotificationPreferences;
  // Address member activity emails are sent to (login email, else member record).
  notification_email?: string | null;
  // Whether a password change code can be texted to `phone`.
  sms_available?: boolean;
}

const query = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

// ----- Authentication -------------------------------------------------------

export function loginRequest(payload: { usernameOrEmail: string; password: string }) {
  return apiPost<{ message: string; user?: AuthUser; role?: UserRole; mustChangePassword?: boolean }>('/api/auth/login', payload);
}
export const logoutRequest = () => apiPost<{ message: string }>('/api/auth/logout');
export const fetchCurrentUser = () => apiGet<{ user?: AuthUser }>('/api/auth/me');
// Forgot password: the code is emailed or texted, to whichever the person
// typed, and checked on the server only. After a correct code the server sets
// an httpOnly cookie that authorises the reset, so the page never holds the
// code's proof.
export type ResetAddress = { email: string } | { phone: string };
export const forgotPasswordRequest = (payload: ResetAddress) =>
  apiPost<{ message: string; expiresInSeconds: number; resendAvailableInSeconds: number }>('/api/auth/forgot-password', payload);
export const verifyResetCodeRequest = (payload: ResetAddress & { code: string }) => apiPost<{ message: string; expiresInSeconds: number }>('/api/auth/verify-reset-code', payload);
// Emailed links (account setup, office resets) pass their token; after a verified code none is needed.
export const resetPasswordRequest = (payload: { token?: string; newPassword: string; confirmPassword: string }) => apiPost<{ message: string }>('/api/auth/reset-password', payload);

export interface SessionStatus { idleTimeoutSeconds: number; idleExpiresInSeconds: number; sessionExpiresInSeconds: number }
// 'passive' checks the session without counting as activity.
export const fetchSessionStatus = (mode: 'active' | 'passive') => apiFetch<SessionStatus>('/api/auth/session', { headers: { 'X-Session-Activity': mode } });
// Signed in: a code to the account's own email or mobile number, used in place of the current password.
export const sendPasswordChangeCodeRequest = (channel: 'email' | 'sms') =>
  apiPost<{ message: string; sentTo: string; expiresInSeconds: number; resendAvailableInSeconds: number }>('/api/auth/change-password/code', { channel });
export const changePasswordRequest = (payload: ({ currentPassword: string } | { code: string }) & { newPassword: string; confirmPassword: string }) =>
  apiPost<{ message: string }>('/api/auth/change-password', payload);
export const updateProfileRequest = (payload: { name?: string; email?: string; phone?: string; position?: string }) => apiPatch<{ message: string; profile: Record<string, string | null> }>('/api/auth/profile', payload);
export const updateNotificationPreferencesRequest = (payload: NotificationPreferences) => apiPatch<{ message: string; preferences: NotificationPreferences }>('/api/auth/notification-preferences', payload);

// ----- Loans ------------------------------------------------------------------

/** Whose valid ID: the borrower's or the co-maker's. */
export type LoanIdHolder = 'borrower' | 'coMaker';

/** A valid ID kept with a loan application or loan: AI's reading and how it compared with the borrower or co-maker. */
export interface LoanIdDocument {
  fileName: string;
  mimeType: string;
  size: number;
  source: 'upload' | 'camera';
  reading: OcrIdReading;
  checks: VerificationCheck[];
  /** Set when the ID came with a scanned loan form. */
  scanId?: number;
}

export type LoanIdDocuments = Partial<Record<LoanIdHolder, LoanIdDocument>>;

export const loanIdPath = (kind: 'loans' | 'loan-requests', id: number | string, holder: LoanIdHolder) => `/api/admin/${kind}/${id}/id-documents/${holder}`;

/** The borrower's signature from the form's Borrower Signature line. Scanned paper forms have none. */
export interface LoanSignature {
  fileName: string;
  mimeType: string;
  size: number;
  /** The date on the Borrower Signature line. */
  signedOn: string;
}

export const loanSignaturePath = (kind: 'loans' | 'loan-requests', id: number | string) => `/api/admin/${kind}/${id}/borrower-signature`;

export interface AdminLoan {
  databaseId: number;
  id: string;
  memberDatabaseId: number | null;
  memberId: string | number | null;
  memberName: string;
  loanType: string;
  amount: number;
  totalAmount: number;
  totalInterest: number;
  balance: number;
  interestRate: number;
  term: number;
  status: 'active' | 'paid' | 'overdue';
  dateApproved: string;
  dueDate: string;
  nextPaymentDate: string | null;
  monthlyPayment: number;
  totalPaid: number;
  paymentCount: number;
  overdueAmount: number;
  overdueInstallments: number;
  paidInstallments: number;
  nextAmountDue: number | null;
  purpose?: string | null;
  farmArea?: number | null;
  idDocuments?: LoanIdDocuments;
  borrowerSignature?: LoanSignature | null;
  /** How many times the loan was given a new schedule, and the last time. */
  restructureCount: number;
  lastRestructuredOn: string | null;
}

export interface AdminPayment {
  id: number;
  loanId: number;
  loanNumber: string;
  memberName: string;
  amount: number;
  paymentDate: string;
  principalPaid: number;
  interestPaid: number;
  remainingBalance: number;
  createdAt?: string;
  recordedBy?: string | null;
}

export interface AdminLoanRequest {
  id: number;
  memberName: string;
  memberId: string | number | null;
  memberNumber?: string | null;
  loanType: string;
  amount: number;
  term: number;
  purpose: string;
  monthlyIncome: number;
  submittedAt: string;
  reviewedAt?: string | null;
  status: 'pending' | 'approved' | 'declined';
  reviewNotes?: string | null;
  farmArea?: number;
  maximumEligibleAmount?: number;
  interestRate?: number;
  calculatedInterest?: number;
  totalRepayment?: number;
  loanMode?: string;
  coMakerName?: string | null;
  collateralType?: string | null;
  idDocuments?: LoanIdDocuments;
  borrowerSignature?: LoanSignature | null;
}

export interface LoanSummary {
  totalLoans: number;
  activeLoans: number;
  overdueLoans: number;
  paidLoans: number;
  totalDisbursed: number;
  totalPrincipal: number;
  totalOutstanding: number;
  totalCollected: number;
  pendingRequests: number;
}

export interface LoanInstallment {
  id: number;
  number: number;
  dueDate: string;
  amountDue: number;
  principalDue: number;
  interestDue: number;
  amountPaid: number;
  lastPaymentDate: string | null;
  paidDate: string | null;
  /** restructured: replaced by a restructuring's new schedule, no longer due. */
  status: 'paid' | 'paid_late' | 'overdue' | 'partial' | 'upcoming' | 'restructured';
}

const optionalNumber = (value: unknown) => (value === null || value === undefined ? undefined : Number(value));

export function mapLoan(loan: Record<string, unknown>): AdminLoan {
  return {
    ...(loan as unknown as AdminLoan),
    amount: toNumber(loan.amount),
    totalAmount: toNumber(loan.totalAmount),
    totalInterest: toNumber(loan.totalInterest),
    balance: toNumber(loan.balance),
    interestRate: toNumber(loan.interestRate),
    monthlyPayment: toNumber(loan.monthlyPayment),
    totalPaid: toNumber(loan.totalPaid),
    overdueAmount: toNumber(loan.overdueAmount),
    nextAmountDue: loan.nextAmountDue === null || loan.nextAmountDue === undefined ? null : toNumber(loan.nextAmountDue),
    farmArea: optionalNumber(loan.farmArea) ?? null,
  };
}

export function mapPayment(payment: Record<string, unknown>): AdminPayment {
  return {
    ...(payment as unknown as AdminPayment),
    amount: toNumber(payment.amount),
    principalPaid: toNumber(payment.principalPaid),
    interestPaid: toNumber(payment.interestPaid),
    remainingBalance: toNumber(payment.remainingBalance),
  };
}

export function mapLoanRequest(request: Record<string, unknown>): AdminLoanRequest {
  return {
    ...(request as unknown as AdminLoanRequest),
    amount: toNumber(request.amount),
    monthlyIncome: toNumber(request.monthlyIncome),
    farmArea: optionalNumber(request.farmArea),
    maximumEligibleAmount: optionalNumber(request.maximumEligibleAmount),
    interestRate: optionalNumber(request.interestRate),
    calculatedInterest: optionalNumber(request.calculatedInterest),
    totalRepayment: optionalNumber(request.totalRepayment),
  };
}

export async function fetchAdminLoans(params: { page?: number; limit?: number; search?: string; status?: string } = {}) {
  const data = await apiGet<{ loans: Record<string, unknown>[]; pagination: Pagination; summary: Record<string, unknown> }>(`/api/admin/loans${query(params)}`);
  const summary = Object.fromEntries(Object.entries(data.summary).map(([key, value]) => [key, toNumber(value)])) as unknown as LoanSummary;
  return { loans: data.loans.map(mapLoan), pagination: data.pagination, summary };
}

export async function fetchAdminPayments(params: { page?: number; limit?: number; search?: string } = {}) {
  const data = await apiGet<{ payments: Record<string, unknown>[]; pagination: Pagination }>(`/api/admin/loan-payments${query(params)}`);
  return { payments: data.payments.map(mapPayment), pagination: data.pagination };
}

export async function fetchAdminLoanRequests(params: { page?: number; limit?: number; status?: string } = {}) {
  const data = await apiGet<{ requests: Record<string, unknown>[]; pagination: Pagination }>(`/api/admin/loan-requests${query(params)}`);
  return { requests: data.requests.map(mapLoanRequest), pagination: data.pagination };
}

export async function fetchAdminLoanDetail(id: number) {
  const data = await apiGet<{ loan: Record<string, unknown>; installments: Record<string, unknown>[]; payments: Record<string, unknown>[] }>(`/api/admin/loans/${id}`);
  return {
    loan: mapLoan(data.loan),
    installments: data.installments.map((row) => ({ ...(row as unknown as LoanInstallment), amountDue: toNumber(row.amountDue), principalDue: toNumber(row.principalDue), interestDue: toNumber(row.interestDue), amountPaid: toNumber(row.amountPaid) })),
    payments: data.payments.map(mapPayment),
  };
}

/** The borrower's and co-maker's ID files, with the readings AI made of them in the form, and the borrower's signature. */
export interface LoanApplicationIds {
  borrower: { file: File; readingId: number };
  coMaker: { file: File; readingId: number };
  /** A picture of the signature on the form's Borrower Signature line. */
  borrowerSignature: File;
  /** An admin releasing the loan confirms the flagged ID details were compared. */
  acknowledgeIdWarnings?: boolean;
}

// The application (paper-form layout: cashAmount, the server adds the in-kind
// farm inputs) with the borrower's and co-maker's ID files and the borrower's signature.
function loanApplicationForm(payload: Record<string, unknown>, ids: LoanApplicationIds) {
  const form = new FormData();
  form.append('application', JSON.stringify(payload));
  for (const holder of ['borrower', 'coMaker'] as const) {
    form.append(`${holder}IdReading`, String(ids[holder].readingId));
    form.append(`${holder}Id`, ids[holder].file);
  }
  form.append('borrowerSignature', ids.borrowerSignature);
  if (ids.acknowledgeIdWarnings) form.append('acknowledgeIdWarnings', 'true');
  return form;
}

export async function createAdminLoan(payload: { memberId: string | number; loanType: string; amount?: string | number; cashAmount?: string; term: string | number; [key: string]: unknown }, ids: LoanApplicationIds) {
  const data = await apiPost<{ loan: Record<string, unknown> }>('/api/admin/loans', loanApplicationForm(payload, ids));
  return { loan: mapLoan(data.loan) };
}

/** AI reads a borrower's or co-maker's ID picked in the loan form. */
export function readLoanId(file: File, holder: LoanIdHolder, source: 'upload' | 'camera') {
  const form = new FormData();
  form.append('holder', holder);
  form.append('source', source);
  form.append('idDocument', file);
  return apiPost<{ readingId: number; reading: OcrIdReading; message: string }>('/api/loans/id-reading', form);
}

/** How the IDs read so far compare with the borrower and co-maker on the form. */
export function previewLoanIdChecks(payload: { memberId?: number; borrowerIdReading?: number | null; coMakerIdReading?: number | null; borrowerAddress: string; borrowerAge: string; coMakerName: string; coMakerAddress: string }) {
  return apiPost<{ checks: VerificationCheck[] }>('/api/loans/id-checks', payload);
}

export const reviewAdminLoanRequest = (id: number, status: 'approved' | 'declined', reason?: string) =>
  apiPatch<{ message: string }>(`/api/admin/loan-requests/${id}`, { status, reason });

export async function recordAdminLoanPayment(id: number, payload: { amount: number | string; paymentDate: string }) {
  const data = await apiPost<{ payment: Record<string, unknown> }>(`/api/admin/loans/${id}/payments`, payload);
  return { payment: mapPayment(data.payment) };
}

/** Gives an open loan a new schedule for what is still owed, from today: term months, plus interestRate% of that balance. */
export async function restructureAdminLoan(id: number, payload: { term: number; interestRate: string; reason: string }) {
  const data = await apiPost<{ loan: Record<string, unknown> }>(`/api/admin/loans/${id}/restructure`, payload);
  return mapLoan(data.loan);
}

export interface LoanQuote {
  maximumEligibleAmount: number;
  calculatedInterest: number;
  totalRepayment: number;
  monthlyPayment: number;
  interestRate: number;
  withinLimit: boolean;
}

/** When the office receives loan payments: ISO weekdays (1 = Monday) and open/close in minutes after midnight, Manila time. */
export interface PaymentHours { days: number[]; open: number; close: number; label: string; openNow: boolean }

export async function fetchPaymentHours(): Promise<PaymentHours> {
  return (await apiGet<{ policy: { paymentHours: PaymentHours } }>('/api/loans/policy')).policy.paymentHours;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** ISO weekday (1 = Monday) of a YYYY-MM-DD date. */
export const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const weekdayName = (date: string) => WEEKDAYS[isoWeekday(date) - 1];
export const isPaymentDay = (hours: PaymentHours, date: string) => hours.days.includes(isoWeekday(date));

/** Whether the office is open at `now`, in Manila time (the server checks again). */
export function officeOpenAt(hours: PaymentHours, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((part) => [part.type, part.value]));
  const day = WEEKDAYS.findIndex((name) => name.startsWith(parts.weekday)) + 1;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return hours.days.includes(day) && minutes >= hours.open && minutes < hours.close;
}

export async function fetchLoanQuote(payload: { farmArea: string; amount: string; term: string | number }): Promise<LoanQuote> {
  const data = await apiPost<{ quote: Record<string, unknown> }>('/api/loans/quote', payload);
  return {
    maximumEligibleAmount: toNumber(data.quote.maximumEligibleAmount),
    calculatedInterest: toNumber(data.quote.calculatedInterest),
    totalRepayment: toNumber(data.quote.totalRepayment),
    monthlyPayment: toNumber(data.quote.monthlyPayment),
    interestRate: toNumber(data.quote.interestRate),
    withinLimit: Boolean(data.quote.withinLimit),
  };
}

// ----- Member self-service ------------------------------------------------------

export interface MemberRentalRequest {
  id: number;
  machineryId: string;
  machineryName: string;
  purpose: string;
  startDate: string;
  endDate: string;
  duration: number;
  rentalFee: number;
  notes: string;
  status: 'pending' | 'approved' | 'declined';
  submittedAt: string;
  reviewedAt: string | null;
  operationStatus: 'scheduled' | 'ongoing' | 'completed' | null;
}

export interface ShareDetails {
  contributions: Array<{
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
  }>;
  total: number;
  maximum: number;
  remaining: number;
}

export interface MyMemberData {
  shareDetails: ShareDetails;
  member: {
    id: number;
    member_number: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    barangay: string | null;
    municipality: string | null;
    province: string | null;
    date_of_birth: string | null;
    gender: string | null;
    civil_status?: string | null;
    livelihood?: string | null;
    farm_area_ha?: string | number | null;
    membership_date: string;
    share_capital: number;
    status: string;
    full_name: string;
    has_id_document?: boolean;
  };
  loans: AdminLoan[];
  loanRequests: AdminLoanRequest[];
  payments: AdminPayment[];
  rentalRequests: MemberRentalRequest[];
  /** total is the deposits minus the withdrawals; balance is the savings after each entry. */
  savings: { total: number; transactions: Array<{ id: number; type?: 'Deposit' | 'Withdrawal'; amount: number; balance?: number; date: string; paymentMethod: string | null; reference: string | null; notes: string }> };
}

export async function fetchMyMemberData(): Promise<MyMemberData> {
  const response = await apiGet<{ data: Omit<MyMemberData, 'loans' | 'payments' | 'loanRequests' | 'rentalRequests'> & { loans: Record<string, unknown>[]; payments: Record<string, unknown>[]; loanRequests: Record<string, unknown>[]; rentalRequests: Record<string, unknown>[] } }>('/api/members/me');
  const data = response.data;
  return {
    ...data,
    loans: data.loans.map(mapLoan),
    payments: data.payments.map(mapPayment),
    loanRequests: data.loanRequests.map(mapLoanRequest),
    rentalRequests: data.rentalRequests.map((row) => ({ ...(row as unknown as MemberRentalRequest), rentalFee: toNumber(row.rentalFee), duration: toNumber(row.duration) })),
  };
}

/** The member's estimated dividend for a calendar year (to date for the current year). */
export interface MemberDividend {
  year: number;
  from: string;
  /** The day the figures run to: December 31, or today for the current year. */
  asOf: string;
  yearComplete: boolean;
  /** The first year a dividend can be shown for (the year the member joined). */
  firstYear: number;
  rates: { statutory: number; dividendPool: number; patronageRefundPool: number };
  netIncome: number;
  netIncomeParts: { kadiwa: number; machinery: number; loans: number };
  statutoryFunds: Array<{ key: string; label: string; percent: number; amount: number }>;
  statutoryTotal: number;
  netSurplus: number;
  dividendPool: number;
  patronageRefundPool: number;
  memberShareCapital: number;
  totalShareCapital: number;
  /** Member share capital / total paid-up share capital (0 to 1). */
  shareRatio: number;
  dividend: number;
  patronage: MemberPatronageRefund;
}

export type ActivityPoints = { meeting: number; community_development: number; education_training: number };

/** The member's estimated patronage refund for the same year: the patronage refund pool shared by business and participation points. */
export interface MemberPatronageRefund {
  rules: { pesosPerBusinessPoint: number; activityPoints: ActivityPoints };
  /** Percent of the pool shared by each kind of points (100 and 0 when no member has points of one kind). */
  weights: { business: number; participation: number };
  businessPool: number;
  participationPool: number;
  /** The member's business with the cooperative in pesos, by service. */
  business: { machinery: number; loans: number; kadiwa?: number; total: number };
  businessPoints: number;
  /** All current members' business and points. */
  totalBusiness: number;
  totalBusinessPoints: number;
  /** Activities attended, by category. */
  attended: ActivityPoints;
  participationPoints: number;
  totalParticipationPoints: number;
  businessShare: number;
  participationShare: number;
  /** The member's share of the whole pool, both parts weighted together (0 to 1). */
  poolShare: number;
  businessRefund: number;
  participationRefund: number;
  refund: number;
}

export async function fetchMyDividend(year?: number) {
  return (await apiGet<{ data: MemberDividend }>(`/api/members/me/dividend${year ? `?year=${year}` : ''}`)).data;
}

export function createMyLoanRequest(payload: { loanType: string; amount?: string | number; cashAmount?: string; term: string | number; purpose: string; [key: string]: unknown }, ids: LoanApplicationIds) {
  return apiPost<{ request: Record<string, unknown> }>('/api/members/me/loan-requests', loanApplicationForm(payload, ids));
}

export interface MemberSuggestion {
  id: number;
  member_number: string | null;
  first_name: string | null;
  middle_name?: string | null;
  last_name: string | null;
  suffix?: string | null;
  full_name: string;
}

export async function searchMembers(search: string) {
  const response = await apiGet<{ data: MemberSuggestion[] }>(`/api/members${query({ search: search.trim(), limit: 10, page: 1 })}`);
  return response.data;
}

// ----- Accounts & audit ---------------------------------------------------------

export interface Account {
  member_id: number | null;
  member_number: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  /** The member information's mobile number, else the account's: members sign in with it or their email. */
  phone: string | null;
  user_id: number;
  username: string;
  role: UserRole;
  account_status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  must_change_password: boolean;
  last_login: string | null;
  account_created_at: string;
  /** Administrators: their name and position in the cooperative, who made the account, and their latest action in the audit log. */
  full_name?: string | null;
  position?: string | null;
  created_by_name?: string | null;
  last_activity_at?: string | null;
}

/** An email, number or username already taken (problem), or null when it is free. */
export interface ContactCheck { problem: string | null }
export interface AdminContactCheck {
  positions: string[];
  /** Whether codes can be sent: by text message to the number, by email to the address. */
  smsAvailable: boolean;
  emailAvailable: boolean;
  email?: ContactCheck;
  phone?: ContactCheck;
  username?: ContactCheck;
}

export const checkAdminContact = (params: { email?: string; phone?: string; username?: string }) => apiGet<AdminContactCheck>(`/api/admin/accounts/admin-check${query(params)}`);
export const sendAdminContactCode = (channel: 'email' | 'sms', value: string, name: string) =>
  apiPost<{ verificationId: number; channel: 'email' | 'sms'; sentTo: string; expiresInMinutes: number; message: string }>('/api/admin/accounts/admin-verifications', { channel, value, name });
export const confirmAdminContactCode = (verificationId: number, code: string) => apiPost<{ verified: boolean; message: string }>(`/api/admin/accounts/admin-verifications/${verificationId}/confirm`, { code });
export const createAdminAccountRequest = (payload: {
  fullName: string; position: string; username: string; email: string; phone: string; password: string; confirmPassword: string;
  emailVerificationId: number | null; phoneVerificationId: number | null;
}) => apiPost<{ message: string; user: AuthUser }>('/api/admin/accounts/admins', payload);

export interface AvailableMember {
  id: number;
  member_number: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export const fetchAdminAccounts = () => apiGet<{ accounts: Account[] }>('/api/admin/accounts');
export const fetchAvailableMembers = () => apiGet<{ members: AvailableMember[] }>('/api/admin/members/available');
// No username: the member signs in with the email and mobile number in their member information.
export const createMemberAccountRequest = (payload: { memberId: number; password: string; confirmPassword: string }) => apiPost<{ message: string; user: AuthUser; warnings: string[] }>('/api/admin/accounts', payload);
export const updateAccountStatusRequest = (id: number, status: Account['account_status']) => apiPatch<{ message: string }>(`/api/admin/accounts/${id}/status`, { status });
export const resetMemberPasswordRequest = (id: number) => apiPost<{ message: string }>(`/api/admin/accounts/${id}/reset-password`);

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_name_snapshot: string | null;
  /** Full name of whoever did the action (profile name, or the member's name); null for system actions. */
  user_full_name: string | null;
  /** An administrator's position in the cooperative when they acted (Treasurer, Secretary, ...). */
  user_position?: string | null;
  user_role_snapshot: string | null;
  action: string;
  module: string;
  entity_type: string | null;
  entity_id: string | number | null;
  description: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  target_user_id: number | null;
  ip_address: string | null;
  status: string;
  created_at: string;
}

export function fetchAdminAuditLogs(params: { page?: number; limit?: number; search?: string; action?: string; module?: string; role?: string; status?: string; userId?: string | number; fromDate?: string; toDate?: string } = {}) {
  return apiGet<{ success: boolean; data: AuditLogEntry[]; pagination: Pagination }>(`/api/admin/audit-logs${query(params)}`);
}

// ----- Dashboard & analytics ---------------------------------------------------------

export interface AdminDashboardData {
  stats: {
    /** Active members. */
    totalMembers: number;
    /** Members (terminated ones left out) with a login account, and without one. */
    registeredMembers: number;
    unregisteredMembers: number;
    outstandingLoans: number;
    /** What needs the admin's attention now. */
    overdueLoans: number;
    loansDueThisWeek: number;
    pendingLoanRequests: number;
    pendingRentalRequests: number;
    scheduledOperations: number;
    lowStockItems: number;
    /** All time: Kadiwa net sales + machinery income less expenses + loan interest collected. */
    netIncome: number;
    netIncomeBreakdown: { kadiwa: number; machinery: number; loans: number };
    /** Reserve 10%, Education & Training 10%, Community Development 3%, Optional 7% of the net income. */
    statutoryFunds: Array<{ key: string; label: string; percent: number; amount: number }>;
  };
  /** Members (terminated ones left out) by their share capital now, lowest band first; max is exclusive, null for the PHP 20,000 maximum. */
  shareCapitalLevels: Array<{ key: 'below1k' | 'from1kTo5k' | 'from5kTo15k' | 'from15kTo20k' | 'maximum'; min: number; max: number | null; members: number }>;
  recentActivities: Array<{ id: string; type: string; action: string; at: string }>;
}

export const fetchAdminDashboard = () => apiGet<AdminDashboardData>('/api/admin/dashboard');

export interface AnalyticsData {
  period: { from: string; to: string };
  summary: {
    activeMembers: number;
    totalMembers: number;
    archivedMembers: number;
    newMembers: number;
    shareCapital: number;
    totalShareCapital: number;
    loanPayments: number;
    totalLoanPayments: number;
    interestCollected: number;
    machineryRevenue: number;
    kadiwaNetSales: number;
    totalOperatingRevenue: number;
    /** Net income for the period as the Dashboard counts it (services/netIncome.js); machinery net of its expenses. */
    netIncome?: number;
    machineryNetIncome?: number;
    outstandingBalance: number;
    totalLoans: number;
    activeLoans: number;
    completedLoans: number;
    overdueLoans: number;
    loanApplications: number;
    pendingLoanApplications: number;
    requestedLoanAmount: number;
    maximumEligibleAmount: number;
    projectedRepayment: number;
    paymentToOutstandingRate: number;
  };
  /** Loans disbursed per month (every month, 0 without a loan; 12 months up to the period's end, or the period's own months for a year), with the change from the month before. changePercent is null when the month before had none. */
  loans: Array<{ period: string; month: string; amount: number; count: number; previous: number; change: number; changePercent: number | null }>;
  revenue: Array<{ category: string; amount: number }>;
  machinery: Array<{ name: string; operations: number; days: number; revenue: number }>;
  /** Kadiwa per day (one month) or per month: goods sold (gross), cost of the store items, expenses, and the net income (sales = gross - expenses - costOfGoods). */
  sales: Array<{ period: string; gross: number; costOfGoods: number; sales: number; expenses: number; transactions: number }>;
  memberAnalytics: Array<{
    databaseId: number;
    memberId: string | null;
    memberName: string;
    totalLoans: number;
    completedLoans: number;
    activeLoans: number;
    totalBorrowed: number;
    totalPaid: number;
    outstandingBalance: number;
    overdueLoans: number;
    overduePayments: number;
    paymentCount: number;
    installmentsDue: number;
    onTimePayments: number;
    latePayments: number;
    onTimePaymentRate: number;
    repaymentRating: string;
    shareCapital: number;
    assessment: string;
    recommendation: string;
    reasons: string[];
    overdueInstallments: number;
    /** Loans given a new schedule, and how many times in all. */
    restructuredLoans: number;
    restructurings: number;
    loanHistory: Array<{
      id: number; loanNumber: string; amount: number; balance: number; status: string; dateApproved: string; dueDate: string; paymentCount: number; totalPaid: number;
      onTimePayments: number; latePayments: number; restructureCount: number;
    }>;
  }>;
  repaymentRatings: Array<{ rating: string; members: number }>;
  loanCapacity: Array<{ assessment: string; members: number }>;
  methodology?: Record<string, unknown>;
}

export const fetchAnalytics = (from: string, to: string) => apiGet<AnalyticsData>(`/api/admin/analytics${query({ from, to })}`);

/** Operating revenue per day (last 30 days), month (last 12) or year (last 5), up to `to`, one figure per source. */
export type RevenueGranularity = 'day' | 'month' | 'year';
export interface RevenueTrendRow { start: string; label: string; kadiwa: number; machinery: number; loanInterest: number; total: number }
export interface RevenueTrend {
  granularity: RevenueGranularity;
  from: string;
  to: string;
  rows: RevenueTrendRow[];
  totals: { kadiwa: number; machinery: number; loanInterest: number; total: number };
}
export const fetchRevenueTrend = (granularity: RevenueGranularity, to: string) => apiGet<RevenueTrend>(`/api/admin/analytics/revenue${query({ granularity, to })}`);

/** Kadiwa products in a period: best sellers (store items and the day's goods) and store items running out. */
export interface KadiwaProductRow {
  id: string | null; name: string; kind: 'store' | 'goods'; unit: string | null; quantity: number; amount: number; saleDays: number;
  share?: number; stock?: number; reorderLevel?: number; perDay?: number; daysLeft?: number | null;
}
export interface KadiwaProducts {
  period: { from: string; to: string; days: number };
  summary: { totalSales: number; storeItems: number; storeItemsSold: number };
  bestSellers: KadiwaProductRow[];
  runningOut: KadiwaProductRow[];
  runningOutDays: number;
}
export const fetchKadiwaProducts = (from: string, to: string) => apiGet<KadiwaProducts>(`/api/admin/analytics/kadiwa-products${query({ from, to })}`);

export type CreditVerdict = 'lend' | 'caution' | 'do_not_lend' | 'no_history';

/** A short suggestion on lending to a member again, from how they repaid: the AI's, or rule-based when it cannot answer. */
export interface MemberCreditAdvice {
  source: 'ai' | 'rules';
  verdict: CreditVerdict;
  suggestion: string;
  reasons: string[];
  /** Why the rule-based suggestion is shown instead of the AI's (empty when the AI answered). */
  notice: string;
  methodology: string;
  generatedAt: string;
  facts: {
    loans: { total: number; open: number; fullyPaid: number; restructured: number; totalBorrowed: number; outstandingBalance: number };
    installments: { due: number; onTime: number; late: number; overdueNow: number; onTimeRate: number | null; averageDaysLate: number; mostDaysLate: number };
  };
}

export const fetchMemberCreditAdvice = (memberId: number) => apiPost<MemberCreditAdvice>(`/api/admin/analytics/members/${memberId}/credit-advice`);

export interface ShareCapitalBandMember { id: number; memberNumber: string; memberName: string; status: string; shareCapital: number }
type ShareCapitalBand = Omit<AdminDashboardData['shareCapitalLevels'][number], 'members'>;
/** The members in one share capital band of the dashboard (a clicked bar), most share capital first. */
export const fetchShareCapitalBandMembers = (band: ShareCapitalBand['key']) => apiGet<{ band: ShareCapitalBand; members: ShareCapitalBandMember[] }>(`/api/admin/dashboard/share-capital/${band}`);

// ----- Machinery ---------------------------------------------------------------------------

export interface Machinery {
  id: string;
  name: string;
  type: string;
  status: 'available' | 'in-use' | 'maintenance';
  acquisitionDate?: string;
  lastMaintenance?: string | null;
  nextMaintenance?: string | null;
  dailyFee: number;
  deliveryDate?: string | null;
  condition?: 'operational' | 'non_operational' | 'always_repair' | 'idle' | null;
  // An implement (e.g. a Rotavator) names the machine it is attached to.
  parentMachineryId?: string | null;
  // per_service machines are paid per job (per hectare / per 100 bags), not booked by the day.
  pricingMode?: 'per_day' | 'per_service';
  // What the cooperative paid, for the ROI in Analytics: null = not entered, 0 = a grant.
  purchaseCost?: number | null;
}

/** A member's rental, or a non-member's recorded by the office with only a name (memberId null). */
export type RenterCategory = 'member' | 'non_member';

export interface RentalRequest {
  id: number;
  machineryId: string;
  machineryName: string;
  clientCategory: RenterCategory;
  /** The member's name, or the non-member's. */
  memberName: string;
  memberId: string | null;
  purpose: string;
  startDate: string;
  endDate: string;
  duration: number;
  rentalFee: number;
  notes: string;
  status: 'pending' | 'approved' | 'declined';
}

export interface MachineryOperation {
  id: number;
  machineryId: string;
  machineryName: string;
  clientCategory: RenterCategory;
  memberName: string;
  memberId: string | null;
  purpose: string;
  startDate: string;
  endDate: string;
  duration: number;
  rentalFee: number;
  status: 'ongoing' | 'completed' | 'scheduled';
}

export async function fetchAdminMachinery(params: { page?: number; limit?: number } = {}) {
  const data = await apiGet<{ machinery: Record<string, unknown>[]; requests: RentalRequest[]; operations: MachineryOperation[]; operationsPagination: Pagination; summary: Record<string, unknown> }>(`/api/machinery${query(params)}`);
  return {
    machinery: data.machinery.map((row) => ({ ...(row as unknown as Machinery), dailyFee: toNumber(row.dailyFee), purchaseCost: row.purchaseCost === null || row.purchaseCost === undefined ? null : toNumber(row.purchaseCost) })),
    requests: data.requests.map((request) => ({ ...request, rentalFee: toNumber(request.rentalFee), duration: toNumber(request.duration) })),
    operations: data.operations.map((operation) => ({ ...operation, rentalFee: toNumber(operation.rentalFee), duration: toNumber(operation.duration) })),
    operationsPagination: data.operationsPagination,
    summary: Object.fromEntries(Object.entries(data.summary).map(([key, value]) => [key, toNumber(value)])) as { totalOperations: number; ongoingOperations: number; scheduledOperations: number; totalRevenue: number; pendingRequests: number },
  };
}

export async function fetchMachineryCatalog() {
  const data = await apiGet<{ machinery: Record<string, unknown>[] }>('/api/machinery/catalog');
  return data.machinery.map((row) => ({ ...(row as unknown as Machinery), dailyFee: toNumber(row.dailyFee) }));
}

export const reviewRentalRequest = (id: number, status: 'approved' | 'declined') => apiPatch<{ message: string }>(`/api/machinery/requests/${id}`, { status });
export const completeMachineryOperation = (id: number) => apiPatch<{ operation: MachineryOperation }>(`/api/machinery/operations/${id}`, { status: 'completed' });
export const updateMachineryRequest = (id: string, payload: Partial<{ name: string; type: string; dailyFee: string | number; status: 'available' | 'maintenance'; lastMaintenance: string | null; nextMaintenance: string | null }>) => apiPatch<{ machinery: Machinery }>(`/api/machinery/${id}`, payload);
/** Members book for themselves; the office books for a member (memberDatabaseId) or a non-member (clientCategory 'non_member' and clientName). */
export const createRentalRequest = (payload: { machineryId: string; startDate: string; endDate: string; purpose: string; notes: string; memberDatabaseId?: number; clientCategory?: RenterCategory; clientName?: string }) =>
  apiPost<{ request: RentalRequest }>('/api/machinery/requests', payload);

// ----- Kadiwa ------------------------------------------------------------------------------------

/** A store item sold from the inventory, with the cost price it had when sold (null for sales before costs were recorded). */
export interface KadiwaSaleItem { inventoryId: string; name: string; quantity: number; unit: string; unitPrice: number; lineTotal: number; unitCost: number | null; lineCost: number | null }

/**
 * One line of the Kadiwa ng Pangulo daily sales form, or of the 15-day/monthly
 * report: the good, its unit, price, quantity sold and total amount. A report
 * line sold at more than one price has the lowest as `price` and the highest as `priceMax`.
 */
export interface KadiwaSalesLine { name: string; unit: string | null; category: KadiwaInventoryItem['category']; price: number | null; priceMax: number | null; quantity: number | null; amount: number }

/** A good offered on the sale form, with the unit and price it was last sold at. */
export interface KadiwaGood { name: string; unit: string | null; category: KadiwaInventoryItem['category']; price: number | null }

/** One expense of a sale: what it was for and the amount. */
export interface KadiwaSaleExpense { description: string; amount: number }

export interface KadiwaSale {
  id: string;
  /** Date of the sales (YYYY-MM-DD), as written on the form. */
  saleDate: string;
  /** When it was saved. */
  date: string;
  seller: string;
  groceries: number;
  vegetables: number;
  meat: number;
  totalExpenses: number;
  /** Cost price of the store items sold. */
  costOfGoods: number;
  /** Net income: goods sold - expenses - cost of goods. */
  netSales: number;
  paymentMethod: 'cash';
  status: 'completed' | 'pending';
  /** Store items sold from the inventory; counted in the GROCERIES line. */
  items: KadiwaSaleItem[];
  /** The expenses, one line each; empty for sales saved before expenses were listed (their total only). */
  expenses: KadiwaSaleExpense[];
  /** The goods typed on the daily form (without the store items). */
  goods: Array<{ name: string }>;
  /** The goods sold, as the daily form lists them. */
  lines: KadiwaSalesLine[];
  /** The members who bought that day and their patronage points (1 per PHP 100). */
  memberPurchases: KadiwaMemberPurchase[];
}

export interface KadiwaMemberPurchase { memberId: number; memberNumber: string; name: string; amount: number; points: number }
/** An active member found by member ID or name, for the member purchases of a sale. */
export interface KadiwaBuyer { id: number; memberNumber: string; name: string; barangay: string | null }

export const searchKadiwaMembers = (search: string) => apiGet<{ members: KadiwaBuyer[] }>(`/api/kadiwa/members${query({ search })}`);

export interface KadiwaSalesReport {
  lines: KadiwaSalesLine[];
  totals: { sales: number; days: number; gross: number; expenses: number; costOfGoods: number; net: number };
}

/** A good as typed on the sale form. */
export interface KadiwaSaleGoodInput { name: string; unit: string; category: KadiwaInventoryItem['category']; price: string; quantity: string; amount: string }

export type KadiwaSizeUnit = 'mL' | 'L' | 'mg' | 'g' | 'kg';

// One product line, like a line of the store's inventory notebook:
// Century Tuna 150 g, 13 pc, sold at ₱38, cost ₱35.
export interface KadiwaInventoryItem {
  id: string;
  name: string;
  category: 'Groceries' | 'Vegetables' | 'Meat' | 'Other';
  /** Content size of one unit (150 for 150 g); null when the product has no size. */
  sizeValue: number | null;
  sizeUnit: KadiwaSizeUnit | null;
  stock: number;
  /** What the stock is counted and sold in: pc, pack, bottle, kg ... */
  unit: string;
  /** Selling price per unit. */
  price: number;
  /** Cost price (puhunan) per unit; the stock is valued at it when set. */
  costPrice: number | null;
  reorderLevel: number;
}

/** A product as typed in the add sheet or the edit form. */
export interface KadiwaInventoryInput {
  name: string;
  category: KadiwaInventoryItem['category'];
  sizeValue: string;
  sizeUnit: KadiwaSizeUnit | '';
  unit: string;
  stock: string;
  price: string;
  costPrice: string;
  reorderLevel: string;
}

/** Today's sales: their number, the goods sold (revenue), the cost of the store items, the expenses and the net income. */
export interface KadiwaSummary {
  todaySales: number; todayRevenue: number; todayCost: number; todayExpenses: number; todayNetIncome: number;
  totalNetSales: number; inventoryValue: number; lowStockItems: number;
  /** Products saved before cost prices were required that still have none. */
  missingCostItems: number;
}

const mapSalesLine = (line: Record<string, unknown>): KadiwaSalesLine => ({
  ...(line as unknown as KadiwaSalesLine),
  price: toNumberOrNull(line.price),
  priceMax: toNumberOrNull(line.priceMax),
  quantity: toNumberOrNull(line.quantity),
  amount: toNumber(line.amount),
});
const mapSale = (sale: Record<string, unknown>): KadiwaSale => ({
  ...(sale as unknown as KadiwaSale),
  groceries: toNumber(sale.groceries),
  vegetables: toNumber(sale.vegetables),
  meat: toNumber(sale.meat),
  totalExpenses: toNumber(sale.totalExpenses),
  costOfGoods: toNumber(sale.costOfGoods),
  netSales: toNumber(sale.netSales),
  items: ((sale.items as Record<string, unknown>[]) || []).map((item) => ({ ...(item as unknown as KadiwaSaleItem), quantity: toNumber(item.quantity), unitPrice: toNumber(item.unitPrice), lineTotal: toNumber(item.lineTotal), unitCost: toNumberOrNull(item.unitCost), lineCost: toNumberOrNull(item.lineCost) })),
  lines: ((sale.lines as Record<string, unknown>[]) || []).map(mapSalesLine),
  goods: (sale.goods as Array<{ name: string }>) || [],
  expenses: ((sale.expenses as Record<string, unknown>[]) || []).map((line) => ({ description: String(line.description ?? ''), amount: toNumber(line.amount) })),
  memberPurchases: ((sale.memberPurchases as Record<string, unknown>[]) || []).map((line) => ({
    memberId: Number(line.memberId), memberNumber: String(line.memberNumber ?? ''), name: String(line.name ?? ''), amount: toNumber(line.amount), points: toNumber(line.points),
  })),
});
const toNumberOrNull = (value: unknown) => (value === null || value === undefined || value === '' ? null : toNumber(value));
const mapInventory = (item: Record<string, unknown>): KadiwaInventoryItem => ({ ...(item as unknown as KadiwaInventoryItem), sizeValue: toNumberOrNull(item.sizeValue), stock: toNumber(item.stock), price: toNumber(item.price), costPrice: toNumberOrNull(item.costPrice), reorderLevel: toNumber(item.reorderLevel) });

export async function fetchKadiwaData(params: { page?: number; limit?: number } = {}) {
  const data = await apiGet<{ inventory: Record<string, unknown>[]; sales: Record<string, unknown>[]; pagination: Pagination; summary: Record<string, unknown>; goods?: Record<string, unknown>[] }>(`/api/kadiwa${query(params)}`);
  return {
    inventory: data.inventory.map(mapInventory),
    sales: data.sales.map(mapSale),
    pagination: data.pagination,
    summary: Object.fromEntries(Object.entries(data.summary).map(([key, value]) => [key, toNumber(value)])) as unknown as KadiwaSummary,
    goods: (data.goods || []).map((good) => ({ ...(good as unknown as KadiwaGood), price: toNumberOrNull(good.price) })),
  };
}

// Sales dated from..to (YYYY-MM-DD, inclusive), newest first, with the report
// of every good sold in the period.
export async function fetchKadiwaSales(from: string, to: string) {
  const data = await apiGet<{ sales: Record<string, unknown>[]; report: { lines: Record<string, unknown>[]; totals: Record<string, unknown> } }>(`/api/kadiwa/sales${query({ from, to })}`);
  const totals = data.report.totals;
  return {
    sales: data.sales.map(mapSale),
    report: {
      lines: data.report.lines.map(mapSalesLine),
      totals: { sales: toNumber(totals.sales), days: toNumber(totals.days), gross: toNumber(totals.gross), expenses: toNumber(totals.expenses), costOfGoods: toNumber(totals.costOfGoods), net: toNumber(totals.net) },
    } satisfies KadiwaSalesReport,
  };
}

// The New Sale form sends `expenses` (their sum is the sale's expenses); Sell Products sends `totalExpenses`.
export async function createKadiwaSale(payload: { sellerName?: string; saleDate: string; goods: KadiwaSaleGoodInput[]; items: Array<{ inventoryId: string; quantity: string }>; expenses?: Array<{ description: string; amount: string }>; totalExpenses?: string; memberPurchases?: Array<{ memberId: number; amount: string }> }) {
  const data = await apiPost<{ sale: Record<string, unknown> }>('/api/kadiwa/sales', payload);
  return { sale: mapSale(data.sale) };
}

// Saves a whole sheet of products at once; nothing is saved when a row is refused.
export async function createKadiwaInventory(items: KadiwaInventoryInput[]) {
  const data = await apiPost<{ items: Record<string, unknown>[] }>('/api/kadiwa/inventory', { items });
  return { items: data.items.map(mapInventory) };
}

// `stock` is sent only to record a physical count, with the quantity the form
// was opened with as `expectedStock`.
export async function updateKadiwaInventory(id: string, payload: Omit<KadiwaInventoryInput, 'stock'> & { stock?: string; expectedStock?: string }) {
  const data = await apiPatch<{ item: Record<string, unknown> }>(`/api/kadiwa/inventory/${encodeURIComponent(id)}`, payload);
  return { item: mapInventory(data.item) };
}

// Deletes a product. One already sold is kept for its past sales (keptForPastSales) and leaves the inventory.
export const deleteKadiwaInventory = (id: string) =>
  apiDelete<{ id: string; name: string; keptForPastSales: boolean; pastSales: number }>(`/api/kadiwa/inventory/${encodeURIComponent(id)}`);

export async function restockKadiwaInventory(id: string, quantity: number) {
  const data = await apiPatch<{ item: Record<string, unknown> }>(`/api/kadiwa/inventory/${id}/restock`, { quantity });
  return { item: mapInventory(data.item) };
}

// ----- Notifications & announcements --------------------------------------------------------

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const fetchNotifications = (params: { page?: number; limit?: number; unread?: boolean } = {}) =>
  apiGet<{ data: AppNotification[]; unreadCount: number; pagination: Pagination }>(`/api/notifications${query({ page: params.page, limit: params.limit, unread: params.unread ? 'true' : undefined })}`);
export const markNotificationRead = (id: number) => apiPatch<{ success: boolean }>(`/api/notifications/${id}/read`);
export const markAllNotificationsRead = () => apiPatch<{ updated: number }>('/api/notifications/read-all');

export interface AnnouncementRecord { id: number; title: string; message: string; audience: 'All Members' | 'Admins Only'; postedAt: string; postedBy?: string | null }

export const fetchAnnouncements = () => apiGet<{ data: AnnouncementRecord[]; pagination: Pagination }>('/api/announcements?limit=50');
export const createAnnouncementRequest = (payload: { title: string; message: string; audience: AnnouncementRecord['audience'] }) => apiPost<{ data: AnnouncementRecord }>('/api/announcements', payload);
export const deleteAnnouncementRequest = (id: number) => apiDelete<{ success: boolean }>(`/api/announcements/${id}`);
export const markAnnouncementDoneRequest = (id: number) => apiPatch<{ success: boolean }>(`/api/announcements/${id}/done`, {});

// ----- Legal documents (admin settings) --------------------------------------------------------

export interface LegalDocumentRecord { id: number; name: string; category: string; fileName: string; mimeType: string; fileSize: number; uploadedAt: string; uploadedBy?: string | null }

export const fetchLegalDocuments = () => apiGet<{ data: LegalDocumentRecord[] }>('/api/legal-documents');
export function uploadLegalDocumentRequest(file: File, category: string) {
  const form = new FormData();
  form.append('document', file);
  form.append('category', category);
  return apiFetch<{ data: LegalDocumentRecord }>('/api/legal-documents', { method: 'POST', body: form });
}
export const deleteLegalDocumentRequest = (id: number) => apiDelete<{ success: boolean }>(`/api/legal-documents/${id}`);
