export type UserRole = 'ADMIN' | 'MEMBER';

export interface AuthUser {
  id?: number;
  member_id?: number;
  username?: string;
  email?: string;
  role?: UserRole;
  account_status?: string;
  must_change_password?: boolean;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data as T;
}

export async function loginRequest(payload: { usernameOrEmail: string; password: string }) {
  return apiFetch<{ message: string; user?: AuthUser; role?: UserRole; mustChangePassword?: boolean }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function logoutRequest() {
  return apiFetch<{ message: string }>('/api/auth/logout', {
    method: 'POST',
  });
}

export interface AnalyticsData {
  period: { from: string; to: string };
  summary: {
    activeMembers: number;
    newMembers: number;
    shareCapital: number;
    loanPayments: number;
    interestCollected: number;
    machineryRevenue: number;
    kadiwaNetSales: number;
    totalOperatingRevenue: number;
    outstandingBalance: number;
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
}

export function fetchAnalytics(from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  return apiFetch<AnalyticsData>(`/api/admin/analytics?${params.toString()}`);
}

export async function forgotPasswordRequest(payload: { usernameOrEmail: string }) {
  return apiFetch<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resetPasswordRequest(payload: { token: string; newPassword: string; confirmPassword: string }) {
  return apiFetch<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function changePasswordRequest(payload: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  return apiFetch<{ message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCurrentUser() {
  return apiFetch<{ user?: AuthUser }>('/api/auth/me');
}

export interface MyMemberData {
  shareDetails: {
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
  };
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
  };
  loans: Array<{
    id: number;
    loan_number: string;
    loan_type: string;
    amount: string | number;
    balance: string | number;
    interest_rate: string | number;
    term: number;
    status: 'active' | 'paid' | 'overdue';
    date_approved: string;
    due_date: string;
    next_payment_date: string | null;
    monthly_payment: string | number;
  }>;
  loanRequests: Array<{
    id: number;
    loan_type: string;
    amount: string | number;
    term: number;
    purpose: string;
    monthly_income: string | number;
    status: 'pending' | 'approved' | 'declined';
    submitted_at: string;
    reviewed_at: string | null;
  }>;
  payments: Array<{
    id: number;
    loan_id: number;
    amount: string | number;
    payment_date: string;
    principal_paid: string | number;
    interest_paid: string | number;
    remaining_balance: string | number;
  }>;
}

export async function fetchMyMemberData() {
  const response = await apiFetch<{ data: MyMemberData }>('/api/members/me');
  return response.data;
}

export async function createMyLoanRequest(payload: {
  loanType: string;
  amount: string | number;
  term: string | number;
  purpose: string;
  [key: string]: unknown;
}) {
  return apiFetch<{ request: unknown }>('/api/members/me/loan-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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
  const query = new URLSearchParams({ search: search.trim(), limit: '10', page: '1' });
  const response = await apiFetch<{ data: MemberSuggestion[] }>(`/api/members?${query.toString()}`);
  return response.data;
}

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

export async function fetchAdminAccounts() {
  return apiFetch<{ accounts: Account[] }>('/api/admin/accounts');
}

export async function fetchAvailableMembers() {
  return apiFetch<{ members: AvailableMember[] }>('/api/admin/members/available');
}

export async function createMemberAccountRequest(payload: { memberId: number; username: string; password: string; confirmPassword: string }) {
  return apiFetch<{ message: string; user: AuthUser }>('/api/admin/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAccountStatusRequest(id: number, status: Account['account_status']) {
  return apiFetch<{ message: string }>(`/api/admin/accounts/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function resetMemberPasswordRequest(id: number) {
  return apiFetch<{ message: string }>(`/api/admin/accounts/${id}/reset-password`, {
    method: 'POST',
  });
}

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
  user_agent: string | null;
  status: string;
  created_at: string;
}

export async function fetchAdminAuditLogs(params?: { page?: number; limit?: number; search?: string; action?: string; module?: string; role?: string; status?: string; userId?: string | number; fromDate?: string; toDate?: string; }) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.action) query.set('action', params.action);
  if (params?.module) query.set('module', params.module);
  if (params?.role) query.set('role', params.role);
  if (params?.status) query.set('status', params.status);
  if (params?.userId !== undefined && params.userId !== null && params.userId !== '') query.set('userId', String(params.userId));
  if (params?.fromDate) query.set('fromDate', params.fromDate);
  if (params?.toDate) query.set('toDate', params.toDate);

  return apiFetch<{ success: boolean; data: AuditLogEntry[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/admin/audit-logs${query.toString() ? `?${query.toString()}` : ''}`);
}

export interface AdminLoan {
  databaseId: number;
  id: string;
  memberId: string | number | null;
  memberName: string;
  loanType: 'agricultural' | 'personal' | 'emergency';
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
}

export interface AdminPayment {
  id: number;
  loanId: number;
  memberName: string;
  amount: number;
  paymentDate: string;
  principalPaid: number;
  interestPaid: number;
  remainingBalance: number;
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
  status: 'pending' | 'approved' | 'declined';
  farmArea?: number;
  maximumEligibleAmount?: number;
  interestRate?: number;
  calculatedInterest?: number;
  totalRepayment?: number;
  loanMode?: string;
  coMakerName?: string | null;
  collateralType?: string | null;
}

export async function fetchAdminLoans() {
  const data = await apiFetch<{ loans: AdminLoan[]; payments: AdminPayment[]; requests: AdminLoanRequest[] }>('/api/admin/loans');
  return {
    loans: data.loans.map((loan) => ({ ...loan, amount: Number(loan.amount), totalAmount: Number(loan.totalAmount), totalInterest: Number(loan.totalInterest), balance: Number(loan.balance), interestRate: Number(loan.interestRate), monthlyPayment: Number(loan.monthlyPayment) })),
    payments: data.payments.map((payment) => ({ ...payment, amount: Number(payment.amount), principalPaid: Number(payment.principalPaid), interestPaid: Number(payment.interestPaid), remainingBalance: Number(payment.remainingBalance) })),
    requests: data.requests.map((request) => ({
      ...request,
      amount: Number(request.amount),
      monthlyIncome: Number(request.monthlyIncome),
      farmArea: request.farmArea === undefined || request.farmArea === null ? undefined : Number(request.farmArea),
      maximumEligibleAmount: request.maximumEligibleAmount === undefined || request.maximumEligibleAmount === null ? undefined : Number(request.maximumEligibleAmount),
      interestRate: request.interestRate === undefined || request.interestRate === null ? undefined : Number(request.interestRate),
      calculatedInterest: request.calculatedInterest === undefined || request.calculatedInterest === null ? undefined : Number(request.calculatedInterest),
      totalRepayment: request.totalRepayment === undefined || request.totalRepayment === null ? undefined : Number(request.totalRepayment),
    })),
  };
}

export async function createAdminLoan(payload: {
  memberId: string | number;
  loanType: string;
  amount: string | number;
  term: string | number;
  [key: string]: unknown;
}) {
  const data = await apiFetch<{ loan: AdminLoan }>('/api/admin/loans', { method: 'POST', body: JSON.stringify(payload) });
  return {
    ...data,
    loan: {
      ...data.loan,
      amount: Number(data.loan.amount),
      totalAmount: Number(data.loan.totalAmount),
      totalInterest: Number(data.loan.totalInterest),
      balance: Number(data.loan.balance),
      interestRate: Number(data.loan.interestRate),
      monthlyPayment: Number(data.loan.monthlyPayment),
    },
  };
}

export async function reviewAdminLoanRequest(id: number, status: 'approved' | 'declined') {
  return apiFetch<{ message: string }>(`/api/admin/loan-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function recordAdminLoanPayment(id: number, payload: { amount: number; paymentDate: string }) {
  return apiFetch<{ payment: AdminPayment }>(`/api/admin/loans/${id}/payments`, { method: 'POST', body: JSON.stringify(payload) });
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

export async function fetchAdminMachinery() {
  const data = await apiFetch<{ requests: RentalRequest[]; operations: MachineryOperation[] }>('/api/machinery');
  return {
    requests: data.requests.map((request) => ({ ...request, rentalFee: Number(request.rentalFee), duration: Number(request.duration) })),
    operations: data.operations.map((operation) => ({ ...operation, rentalFee: Number(operation.rentalFee), duration: Number(operation.duration) })),
  };
}

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

export function fetchKadiwaData() {
  return apiFetch<{ inventory: KadiwaInventoryItem[]; sales: KadiwaSale[] }>('/api/kadiwa').then((data) => ({
    inventory: data.inventory.map((item) => ({ ...item, stock: Number(item.stock), price: Number(item.price), reorderLevel: Number(item.reorderLevel) })),
    sales: data.sales.map((sale) => ({ ...sale, groceries: Number(sale.groceries), vegetables: Number(sale.vegetables), meat: Number(sale.meat), totalExpenses: Number(sale.totalExpenses), netSales: Number(sale.netSales) })),
  }));
}

export function createKadiwaSale(payload: { encoderName: string; groceriesPrice: number; vegetablesPrice: number; meatPrice: number; totalExpenses: number }) {
  return apiFetch<{ sale: KadiwaSale }>('/api/kadiwa/sales', { method: 'POST', body: JSON.stringify(payload) });
}

export function createKadiwaInventory(payload: Omit<KadiwaInventoryItem, 'id'>) {
  return apiFetch<{ item: KadiwaInventoryItem }>('/api/kadiwa/inventory', { method: 'POST', body: JSON.stringify(payload) });
}

export function restockKadiwaInventory(id: string, quantity: number) {
  return apiFetch<{ item: KadiwaInventoryItem }>(`/api/kadiwa/inventory/${id}/restock`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
}

export async function reviewRentalRequest(id: number, status: 'approved' | 'declined') {
  return apiFetch<{ message: string }>(`/api/machinery/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function createRentalRequest(payload: { machineryId: string; startDate: string; endDate: string; purpose: string; notes: string; memberDatabaseId?: number }) {
  return apiFetch<{ request: RentalRequest }>('/api/machinery/requests', { method: 'POST', body: JSON.stringify(payload) });
}
