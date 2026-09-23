import { apiDelete, apiFetch, apiGet, apiPatch, apiPost, toNumber } from '../../lib/api';

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
export const forgotPasswordRequest = (payload: { usernameOrEmail: string }) => apiPost<{ message: string }>('/api/auth/forgot-password', payload);
export const resetPasswordRequest = (payload: { token: string; newPassword: string; confirmPassword: string }) => apiPost<{ message: string }>('/api/auth/reset-password', payload);
export const changePasswordRequest = (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => apiPost<{ message: string }>('/api/auth/change-password', payload);
export const updateProfileRequest = (payload: { name?: string; email?: string; phone?: string; position?: string }) => apiPatch<{ message: string; profile: Record<string, string | null> }>('/api/auth/profile', payload);
export const updateNotificationPreferencesRequest = (payload: NotificationPreferences) => apiPatch<{ message: string; preferences: NotificationPreferences }>('/api/auth/notification-preferences', payload);

// ----- Loans ------------------------------------------------------------------

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
  status: 'paid' | 'paid_late' | 'overdue' | 'partial' | 'upcoming';
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

export async function createAdminLoan(payload: { memberId: string | number; loanType: string; amount: string | number; term: string | number; [key: string]: unknown }) {
  const data = await apiPost<{ loan: Record<string, unknown> }>('/api/admin/loans', payload);
  return { loan: mapLoan(data.loan) };
}

export const reviewAdminLoanRequest = (id: number, status: 'approved' | 'declined', reason?: string) =>
  apiPatch<{ message: string }>(`/api/admin/loan-requests/${id}`, { status, reason });

export async function recordAdminLoanPayment(id: number, payload: { amount: number | string; paymentDate: string }) {
  const data = await apiPost<{ payment: Record<string, unknown> }>(`/api/admin/loans/${id}/payments`, payload);
  return { payment: mapPayment(data.payment) };
}

export interface LoanQuote {
  maximumEligibleAmount: number;
  calculatedInterest: number;
  totalRepayment: number;
  monthlyPayment: number;
  interestRate: number;
  withinLimit: boolean;
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
  savings: { total: number; transactions: Array<{ id: number; amount: number; date: string; paymentMethod: string | null; reference: string | null; notes: string }> };
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

export function createMyLoanRequest(payload: { loanType: string; amount: string | number; term: string | number; purpose: string; [key: string]: unknown }) {
  return apiPost<{ request: Record<string, unknown> }>('/api/members/me/loan-requests', payload);
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
  user_id: number;
  username: string;
  role: UserRole;
  account_status: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  must_change_password: boolean;
  last_login: string | null;
  account_created_at: string;
}

export interface AvailableMember {
  id: number;
  member_number: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export const fetchAdminAccounts = () => apiGet<{ accounts: Account[] }>('/api/admin/accounts');
export const fetchAvailableMembers = () => apiGet<{ members: AvailableMember[] }>('/api/admin/members/available');
export const createMemberAccountRequest = (payload: { memberId: number; username: string; password: string; confirmPassword: string }) => apiPost<{ message: string; user: AuthUser }>('/api/admin/accounts', payload);
export const updateAccountStatusRequest = (id: number, status: Account['account_status']) => apiPatch<{ message: string }>(`/api/admin/accounts/${id}/status`, { status });
export const resetMemberPasswordRequest = (id: number) => apiPost<{ message: string }>(`/api/admin/accounts/${id}/reset-password`);

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_name_snapshot: string | null;
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
  stats: { totalMembers: number; outstandingLoans: number; machineryOperations: number; kadiwaRevenue: number };
  alerts: Array<{ id: string; message: string; type: 'warning' | 'info' }>;
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
  membership: Array<{ period: string; members: number }>;
  loans: Array<{ period: string; amount: number; count: number }>;
  revenue: Array<{ category: string; amount: number }>;
  machinery: Array<{ name: string; operations: number; days: number; revenue: number }>;
  sales: Array<{ period: string; sales: number; expenses: number; transactions: number }>;
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
    savings: number;
    assessment: string;
    recommendation: string;
    reasons: string[];
    loanHistory: Array<{ id: number; loanNumber: string; amount: number; balance: number; status: string; dateApproved: string; dueDate: string; paymentCount: number; totalPaid: number }>;
  }>;
  repaymentRatings: Array<{ rating: string; members: number }>;
  loanCapacity: Array<{ assessment: string; members: number }>;
  methodology?: Record<string, unknown>;
}

export const fetchAnalytics = (from: string, to: string) => apiGet<AnalyticsData>(`/api/admin/analytics${query({ from, to })}`);

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
}

export interface RentalRequest {
  id: number;
  machineryId: string;
  machineryName: string;
  memberName: string;
  memberId: string;
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
  memberName: string;
  memberId: string;
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
    machinery: data.machinery.map((row) => ({ ...(row as unknown as Machinery), dailyFee: toNumber(row.dailyFee) })),
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
export const createRentalRequest = (payload: { machineryId: string; startDate: string; endDate: string; purpose: string; notes: string; memberDatabaseId?: number }) =>
  apiPost<{ request: RentalRequest }>('/api/machinery/requests', payload);

// ----- Kadiwa ------------------------------------------------------------------------------------

export interface KadiwaSaleItem { inventoryId: string; name: string; quantity: number; unit: string; unitPrice: number; lineTotal: number }

export interface KadiwaSale {
  id: string;
  date: string;
  encoder: string;
  groceries: number;
  vegetables: number;
  meat: number;
  totalExpenses: number;
  netSales: number;
  paymentMethod: 'cash';
  status: 'completed' | 'pending';
  items: KadiwaSaleItem[];
}

export interface KadiwaInventoryItem {
  id: string;
  name: string;
  category: 'Groceries' | 'Vegetables' | 'Meat' | 'Other';
  stock: number;
  price: number;
  reorderLevel: number;
  unit: string;
}

export interface KadiwaSummary { todaySales: number; todayRevenue: number; totalNetSales: number; inventoryValue: number; lowStockItems: number }

const mapSale = (sale: Record<string, unknown>): KadiwaSale => ({
  ...(sale as unknown as KadiwaSale),
  groceries: toNumber(sale.groceries),
  vegetables: toNumber(sale.vegetables),
  meat: toNumber(sale.meat),
  totalExpenses: toNumber(sale.totalExpenses),
  netSales: toNumber(sale.netSales),
  items: ((sale.items as Record<string, unknown>[]) || []).map((item) => ({ ...(item as unknown as KadiwaSaleItem), quantity: toNumber(item.quantity), unitPrice: toNumber(item.unitPrice), lineTotal: toNumber(item.lineTotal) })),
});
const mapInventory = (item: Record<string, unknown>): KadiwaInventoryItem => ({ ...(item as unknown as KadiwaInventoryItem), stock: toNumber(item.stock), price: toNumber(item.price), reorderLevel: toNumber(item.reorderLevel) });

export async function fetchKadiwaData(params: { page?: number; limit?: number } = {}) {
  const data = await apiGet<{ inventory: Record<string, unknown>[]; sales: Record<string, unknown>[]; pagination: Pagination; summary: Record<string, unknown> }>(`/api/kadiwa${query(params)}`);
  return {
    inventory: data.inventory.map(mapInventory),
    sales: data.sales.map(mapSale),
    pagination: data.pagination,
    summary: Object.fromEntries(Object.entries(data.summary).map(([key, value]) => [key, toNumber(value)])) as unknown as KadiwaSummary,
  };
}

export async function createKadiwaSale(payload: { encoderName: string; groceriesPrice: number; vegetablesPrice: number; meatPrice: number; totalExpenses: number; items: Array<{ inventoryId: string; quantity: string }> }) {
  const data = await apiPost<{ sale: Record<string, unknown> }>('/api/kadiwa/sales', payload);
  return { sale: mapSale(data.sale) };
}

export async function createKadiwaInventory(payload: Omit<KadiwaInventoryItem, 'id'>) {
  const data = await apiPost<{ item: Record<string, unknown> }>('/api/kadiwa/inventory', payload);
  return { item: mapInventory(data.item) };
}

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
