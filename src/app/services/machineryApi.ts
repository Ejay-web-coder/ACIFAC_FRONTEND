import { apiDelete, apiGet, apiPatch, apiPost, apiPut, toNumber } from '../../lib/api';
import type { Pagination } from './authApi';

// ----- Per-service machinery work (PhilMech utilization report) ---------------------------
// Amounts, areas and bags arrive as exact decimal strings and are turned into
// numbers here for display; the backend does every calculation.

export type CroppingPeriod = '1st' | '2nd' | '3rd';
export type ClientCategory = 'member' | 'non_member';
export type ServiceUnit = 'per_ha' | 'per_100_bags' | 'per_day';
export type PaymentStatus = 'unpaid' | 'partial' | 'full';
export type MachineCondition = 'operational' | 'non_operational' | 'always_repair' | 'idle';
export type PricingMode = 'per_day' | 'per_service';
export type ExpenseCategory = 'fuel' | 'labor' | 'repair_maintenance' | 'other';

export const CROPPING_PERIODS: CroppingPeriod[] = ['1st', '2nd', '3rd'];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['fuel', 'labor', 'repair_maintenance', 'other'];
export const EXPENSE_LABELS: Record<ExpenseCategory, string> = { fuel: 'Fuel', labor: 'Labor', repair_maintenance: 'Repair & maintenance', other: 'Other' };
export const CONDITION_LABELS: Record<MachineCondition, string> = { operational: 'Operational', non_operational: 'Non-operational', always_repair: 'Always under repair', idle: 'Idle' };
export const UNIT_LABELS: Record<ServiceUnit, string> = { per_ha: 'per hectare', per_100_bags: 'bags per 100 bags', per_day: 'per day' };

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "₱3,800.00/ha", "10 bags per 100", "₱600.00/day"
export function rateLabel(unit: ServiceUnit, rate: number) {
  if (unit === 'per_100_bags') return `${rate.toLocaleString('en-PH', { maximumFractionDigits: 2 })} bags per 100`;
  return `${peso(rate)}/${unit === 'per_ha' ? 'ha' : 'day'}`;
}

export interface ServiceRate {
  id: number;
  machineryId: string;
  serviceType: string;
  unit: ServiceUnit;
  memberRate: number;
  nonMemberRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  servicesUsingRate: number;
}

export interface MachineryService {
  id: number;
  machineryId: string;
  machineryName: string;
  serviceType: string;
  serviceDate: string;
  croppingPeriod: CroppingPeriod;
  year: number;
  clientCategory: ClientCategory;
  memberDatabaseId: number | null;
  memberNumber: string | null;
  clientName: string;
  clientAddress: string;
  unit: ServiceUnit;
  areaHa: number;
  days: number | null;
  totalBags: number | null;
  feeBags: number | null;
  bagValue: number | null;
  kgPerBag: number | null;
  pricePerKg: number | null;
  rateUsed: number;
  computedFeeAmount: number | null;
  feeAmount: number;
  feeOverrideReason: string | null;
  amountPaid: number;
  balance: number;
  paymentStatus: PaymentStatus;
  rentalRequestId: number | null;
  notes: string;
  lastPaymentDate: string | null;
}

export interface ServicePayment { id: number; serviceId: number; amount: number; paymentDate: string; notes: string; recordedBy: string | null }

export interface MachineryExpense {
  id: number;
  machineryId: string;
  machineryName: string;
  expenseDate: string;
  croppingPeriod: CroppingPeriod;
  year: number;
  category: ExpenseCategory;
  amount: number;
  description: string;
}

export interface PeriodBalance { id: number; machineryId: string; machineryName: string; croppingPeriod: CroppingPeriod; year: number; beginningCash: number; otherIncome: number; notes: string }

export interface ServiceQuote {
  unit: ServiceUnit;
  rateUsed: number;
  feeAmount: number;
  feeBags: number | null;
  bagValue: number | null;
  rate: { id: number; serviceType: string; memberRate: number; nonMemberRate: number; effectiveFrom: string; effectiveTo: string | null };
}

export interface ServicePayload {
  machineryId: string;
  serviceType: string;
  serviceDate: string;
  croppingPeriod: CroppingPeriod;
  year: number;
  clientCategory: ClientCategory;
  memberDatabaseId?: number | null;
  clientName?: string;
  clientAddress?: string;
  areaHa?: string;
  days?: string;
  totalBags?: string;
  bagValue?: string;
  kgPerBag?: string;
  pricePerKg?: string;
  feeAmount?: string;
  feeOverrideReason?: string;
  amountPaid?: string;
  paymentDate?: string;
  rentalRequestId?: number | null;
  notes?: string;
}

const numberOrNull = (value: unknown) => (value === null || value === undefined ? null : toNumber(value));

const mapService = (row: Record<string, unknown>): MachineryService => ({
  ...(row as unknown as MachineryService),
  year: toNumber(row.year),
  areaHa: toNumber(row.areaHa),
  days: numberOrNull(row.days),
  totalBags: numberOrNull(row.totalBags),
  feeBags: numberOrNull(row.feeBags),
  bagValue: numberOrNull(row.bagValue),
  kgPerBag: numberOrNull(row.kgPerBag),
  pricePerKg: numberOrNull(row.pricePerKg),
  rateUsed: toNumber(row.rateUsed),
  computedFeeAmount: numberOrNull(row.computedFeeAmount),
  feeAmount: toNumber(row.feeAmount),
  amountPaid: toNumber(row.amountPaid),
  balance: toNumber(row.balance),
});

const mapRate = (row: Record<string, unknown>): ServiceRate => ({ ...(row as unknown as ServiceRate), memberRate: toNumber(row.memberRate), nonMemberRate: toNumber(row.nonMemberRate) });
const mapPayment = (row: Record<string, unknown>): ServicePayment => ({ ...(row as unknown as ServicePayment), amount: toNumber(row.amount) });
const mapExpense = (row: Record<string, unknown>): MachineryExpense => ({ ...(row as unknown as MachineryExpense), amount: toNumber(row.amount), year: toNumber(row.year) });

const query = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export async function quoteService(payload: Pick<ServicePayload, 'machineryId' | 'serviceType' | 'serviceDate' | 'clientCategory' | 'areaHa' | 'days' | 'totalBags' | 'bagValue' | 'kgPerBag' | 'pricePerKg'>) {
  const data = await apiPost<{ quote: Record<string, unknown> }>('/api/machinery/services/quote', payload);
  const quote = data.quote;
  const rate = quote.rate as Record<string, unknown>;
  return {
    ...(quote as unknown as ServiceQuote),
    rateUsed: toNumber(quote.rateUsed),
    feeAmount: toNumber(quote.feeAmount),
    feeBags: numberOrNull(quote.feeBags),
    bagValue: numberOrNull(quote.bagValue),
    rate: { ...(rate as unknown as ServiceQuote['rate']), memberRate: toNumber(rate.memberRate), nonMemberRate: toNumber(rate.nonMemberRate) },
  };
}

export async function fetchServices(params: { machineryId?: string; croppingPeriod?: string; year?: number | string; paymentStatus?: string; search?: string; page?: number; limit?: number }) {
  const data = await apiGet<{ services: Record<string, unknown>[]; totals: Record<string, unknown>; pagination: Pagination }>(`/api/machinery/services${query(params)}`);
  return {
    services: data.services.map(mapService),
    totals: { count: toNumber(data.totals.count), areaHa: toNumber(data.totals.areaHa), feeAmount: toNumber(data.totals.feeAmount), amountPaid: toNumber(data.totals.amountPaid), balance: toNumber(data.totals.balance) },
    pagination: data.pagination,
  };
}

export async function fetchService(id: number) {
  const data = await apiGet<{ service: Record<string, unknown>; payments: Record<string, unknown>[] }>(`/api/machinery/services/${id}`);
  return { service: mapService(data.service), payments: data.payments.map(mapPayment) };
}

export const createService = async (payload: ServicePayload) => mapService((await apiPost<{ service: Record<string, unknown> }>('/api/machinery/services', payload)).service);
export const updateService = async (id: number, payload: ServicePayload) => mapService((await apiPatch<{ service: Record<string, unknown> }>(`/api/machinery/services/${id}`, payload)).service);
export const deleteService = (id: number) => apiDelete<{ message: string }>(`/api/machinery/services/${id}`);

export async function receivePayment(id: number, payload: { amount: string; paymentDate: string; notes?: string }) {
  const data = await apiPost<{ service: Record<string, unknown>; payments: Record<string, unknown>[] }>(`/api/machinery/services/${id}/payments`, payload);
  return { service: mapService(data.service), payments: data.payments.map(mapPayment) };
}

export async function voidPayment(id: number, paymentId: number) {
  const data = await apiDelete<{ service: Record<string, unknown>; payments: Record<string, unknown>[] }>(`/api/machinery/services/${id}/payments/${paymentId}`);
  return { service: mapService(data.service), payments: data.payments.map(mapPayment) };
}

export interface ExpensePayload { machineryId: string; expenseDate: string; croppingPeriod: CroppingPeriod; year: number; category: ExpenseCategory; amount: string; description: string }

export async function fetchExpenses(params: { machineryId?: string; croppingPeriod?: string; year?: number | string; category?: string }) {
  const data = await apiGet<{ expenses: Record<string, unknown>[]; totals: Record<string, unknown> }>(`/api/machinery/expenses${query(params)}`);
  return {
    expenses: data.expenses.map(mapExpense),
    totals: Object.fromEntries(Object.entries(data.totals).map(([key, value]) => [key, toNumber(value)])) as Record<ExpenseCategory | 'total', number>,
  };
}
export const createExpense = async (payload: ExpensePayload) => mapExpense((await apiPost<{ expense: Record<string, unknown> }>('/api/machinery/expenses', payload)).expense);
export const updateExpense = async (id: number, payload: ExpensePayload) => mapExpense((await apiPatch<{ expense: Record<string, unknown> }>(`/api/machinery/expenses/${id}`, payload)).expense);
export const deleteExpense = (id: number) => apiDelete<{ message: string }>(`/api/machinery/expenses/${id}`);

export const fetchRates = async (machineryId: string) => (await apiGet<{ rates: Record<string, unknown>[] }>(`/api/machinery/${encodeURIComponent(machineryId)}/rates`)).rates.map(mapRate);
export const createRate = async (machineryId: string, payload: { serviceType: string; unit: ServiceUnit; memberRate: string; nonMemberRate: string; effectiveFrom: string; effectiveTo?: string | null }) =>
  mapRate((await apiPost<{ rate: Record<string, unknown> }>(`/api/machinery/${encodeURIComponent(machineryId)}/rates`, payload)).rate);
export const updateRate = async (rateId: number, payload: Partial<{ memberRate: string; nonMemberRate: string; effectiveFrom: string; effectiveTo: string | null }>) =>
  mapRate((await apiPatch<{ rate: Record<string, unknown> }>(`/api/machinery/rates/${rateId}`, payload)).rate);
export const deleteRate = (rateId: number) => apiDelete<{ message: string }>(`/api/machinery/rates/${rateId}`);

export async function fetchPeriodBalances(croppingPeriod: CroppingPeriod, year: number) {
  const data = await apiGet<{ balances: Record<string, unknown>[] }>(`/api/machinery/period-balances${query({ croppingPeriod, year })}`);
  return data.balances.map((row) => ({ ...(row as unknown as PeriodBalance), beginningCash: toNumber(row.beginningCash), otherIncome: toNumber(row.otherIncome) }));
}
export const savePeriodBalance = (payload: { machineryId: string; croppingPeriod: CroppingPeriod; year: number; beginningCash: string; otherIncome: string; notes?: string }) =>
  apiPut<{ balance: PeriodBalance }>('/api/machinery/period-balances', payload);

export const updateMachine = (id: string, payload: Partial<{ deliveryDate: string | null; condition: MachineCondition | null; parentMachineryId: string | null; pricingMode: PricingMode; dailyFee: string }>) =>
  apiPatch<{ machinery: Record<string, unknown> }>(`/api/machinery/${encodeURIComponent(id)}`, payload);

// ----- PhilMech report ------------------------------------------------------------------------------

export interface ReportWarning { level: 'error' | 'warning' | 'info'; code: string; message: string }

export interface ReportClient {
  serviceId: number;
  machineryId: string;
  name: string;
  address: string;
  category: 'M' | 'NM';
  serviceType: string;
  serviceDate: string;
  unit: ServiceUnit;
  areaHa: number;
  totalBags: number | null;
  feeBags: number | null;
  rateUsed: number;
  totalAmount: number;
  cashCollection: number;
  paymentStatus: PaymentStatus;
  accountsReceivable: number;
}

export interface ReportMachine {
  machineryId: string;
  name: string;
  type: string;
  deliveryDate: string | null;
  condition: MachineCondition | null;
  implements: Array<{ id: string; name: string }>;
  rates: Array<{ serviceType: string; unit: ServiceUnit; memberRate: number; nonMemberRate: number; effectiveFrom: string; effectiveTo: string | null }>;
  summary: {
    farmers: { member: number; nonMember: number; total: number };
    areaHa: { member: number; nonMember: number; total: number };
    bags: { member: number; nonMember: number; total: number };
    grossIncome: { collected: number; collectibles: number; total: number };
    operatingExpenses: number;
    availableFunds: number;
  };
  cashFlow: {
    beginningCash: number;
    serviceFeesCollected: number;
    otherIncome: number;
    totalInflows: number;
    totalSourceOfCash: number;
    outflows: Record<ExpenseCategory, number>;
    totalOutflows: number;
    netCashFlow: number;
  };
  clients: ReportClient[];
  clientTotals: { areaHa: number; totalAmount: number; cashCollection: number; accountsReceivable: number };
  warnings: ReportWarning[];
}

export interface PhilmechReport {
  croppingPeriod: CroppingPeriod;
  year: number;
  fromMonth: number | null;
  toMonth: number | null;
  window: { from: string; to: string; label: string; monthsChosen: boolean };
  machines: ReportMachine[];
}

// Every numeric string in the report becomes a number (dates and names stay text).
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;
function numbersIn<T>(value: T, key = ''): T {
  if (Array.isArray(value)) return value.map((entry) => numbersIn(entry)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, numbersIn(entry, name)])) as T;
  if (typeof value === 'string' && NUMERIC_TEXT.test(value) && !['machineryId', 'id', 'name', 'address', 'serviceType'].includes(key)) return Number(value) as T;
  return value;
}

export async function fetchPhilmechReport(params: { croppingPeriod: CroppingPeriod; year: number; fromMonth?: number | null; toMonth?: number | null; machineryId?: string }) {
  const data = await apiGet<{ report: PhilmechReport }>(`/api/machinery/reports/philmech${query(params)}`);
  return numbersIn(data.report);
}
