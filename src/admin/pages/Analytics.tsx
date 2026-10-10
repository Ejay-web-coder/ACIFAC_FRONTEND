import { useEffect, useRef, useState } from 'react';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Download, AlertTriangle } from 'lucide-react';
import { UserRole } from '../../app/App';
import { fetchAnalytics, type AnalyticsData } from '../../app/services/authApi';
import { FleetAnalytics } from '../components/machinery/FleetAnalytics';
import { toast } from 'sonner';

const COLORS = ['#276221', '#52a447', '#8bca84', '#3b8132', '#acd8a7', '#5bb450'];
// Shared chart styling in the ACIFAC palette.
const AXIS_TICK = { fontSize: 12, fill: '#5f6660' };
const TOOLTIP_STYLE = { borderRadius: 12, border: '1px solid #e4e7e4', boxShadow: '0 4px 12px -2px rgba(16,24,16,0.08)', fontSize: 13 };
// Charts sit in fixed 300px-tall boxes; a positive starting size avoids recharts' -1x-1 warning before the container is measured.
const CHART_INITIAL_SIZE = { width: 1, height: 300 };
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface AnalyticsProps { userRole: UserRole; }

function dateKey(year: number, month: number, day: number) {
  // Date accepts day 0 as the final day of the preceding month. This is used
  // by getPeriod for the end of a month/quarter, while avoiding invalid URLs
  // such as 2026-10-00.
  const value = new Date(year, month, day);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function getPeriod(range: 'month' | 'quarter' | 'year', month: number, year: number) {
  if (range === 'year') return { from: dateKey(year, 0, 1), to: dateKey(year, 11, 31) };
  if (range === 'quarter') {
    const quarterStart = Math.floor(month / 3) * 3;
    return { from: dateKey(year, quarterStart, 1), to: dateKey(year, quarterStart + 3, 0) };
  }
  return { from: dateKey(year, month, 1), to: dateKey(year, month + 1, 0) };
}

function formatCurrency(value: number) {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function downloadCsv(data: AnalyticsData) {
  const rows = [
    ['Metric', 'Value'],
    ['Period', `${data.period.from} to ${data.period.to}`],
    ['Active Members', data.summary.activeMembers],
    ['New Members', data.summary.newMembers],
    ['Operating Revenue', data.summary.totalOperatingRevenue],
    ['Loan Payments', data.summary.loanPayments],
    ['Interest Collected', data.summary.interestCollected],
    ['Share Capital Contributions', data.summary.shareCapital],
    ['Machinery Revenue', data.summary.machineryRevenue],
    ['Kadiwa Net Sales', data.summary.kadiwaNetSales],
    ['Outstanding Loan Balance', data.summary.outstandingBalance],
    ['Overdue Loans', data.summary.overdueLoans],
    ['Loan Applications', data.summary.loanApplications],
    ['Pending Applications', data.summary.pendingLoanApplications],
    ['Requested Loan Amount', data.summary.requestedLoanAmount],
    ['Maximum Eligible Amount', data.summary.maximumEligibleAmount],
    ['Projected Repayment', data.summary.projectedRepayment],
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `acifac-analytics-${data.period.from}-to-${data.period.to}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function Analytics({ userRole: _userRole }: AnalyticsProps) {
  const today = new Date();
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year'>('month');
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Re-runs the analytics query only when underlying records change (no polling).
  useLiveRefresh(['members', 'loans', 'loan_payments', 'loan_requests', 'share_contributions', 'machinery_operations', 'kadiwa_sales'], () => setRefreshKey((key) => key + 1), 2000);
  const [loading, setLoading] = useState(true);
  const selectionRef = useRef({ month: selectedMonth, year: selectedYear });
  selectionRef.current = { month: selectedMonth, year: selectedYear };
  const calendarRef = useRef({ month: today.getMonth(), year: today.getFullYear() });

  // Live updates are off on serverless hosting, so re-fetch every minute while
  // the tab is visible and whenever it becomes visible again. When a new month
  // starts, follow it unless the admin had picked a different month.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = new Date();
      const previous = calendarRef.current;
      if (now.getMonth() !== previous.month || now.getFullYear() !== previous.year) {
        const { month, year } = selectionRef.current;
        if (month === previous.month && year === previous.year) {
          setSelectedMonth(now.getMonth());
          setSelectedYear(now.getFullYear());
        }
        calendarRef.current = { month: now.getMonth(), year: now.getFullYear() };
      }
      setRefreshKey((key) => key + 1);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const period = getPeriod(dateRange, selectedMonth, selectedYear);
  const periodLabel = dateRange === 'month'
    ? `${monthNames[selectedMonth]} ${selectedYear}`
    : dateRange === 'quarter'
      ? `Q${Math.floor(selectedMonth / 3) + 1} ${selectedYear}`
      : `Year ${selectedYear}`;

  useEffect(() => {
    let active = true;

    const loadAnalytics = (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      fetchAnalytics(period.from, period.to)
        .then((nextData) => {
          if (active) setData(nextData);
        })
        .catch((error) => {
          if (active) toast.error(error instanceof Error ? error.message : 'Unable to load analytics.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    loadAnalytics(refreshKey === 0);

    return () => {
      active = false;
    };
  }, [period.from, period.to, refreshKey]);

  const summary = data?.summary;
  const revenue = data?.revenue || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div><p className="mt-1 text-gray-600">Live cooperative performance for {periodLabel}</p></div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <select value={dateRange} onChange={(event) => setDateRange(event.target.value as typeof dateRange)} className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm"><option value="month">By Month</option><option value="quarter">By Quarter</option><option value="year">By Year</option></select>
          {dateRange === 'month' && <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))} className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}</select>}
          {dateRange === 'quarter' && <select value={Math.floor(selectedMonth / 3) * 3} onChange={(event) => setSelectedMonth(Number(event.target.value))} className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{[0, 3, 6, 9].map((index) => <option key={index} value={index}>Q{index / 3 + 1}</option>)}</select>}
          <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{[selectedYear - 2, selectedYear - 1, selectedYear, selectedYear + 1].map((year) => <option key={year} value={year}>{year}</option>)}</select>
          <button onClick={() => data && downloadCsv(data)} disabled={!data || loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /> Export CSV</button>
        </div>
      </div>

      {summary && summary.overdueLoans > 0 && <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /><span>{summary.overdueLoans} loan(s) are overdue with {formatCurrency(summary.outstandingBalance)} currently outstanding.</span></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartPanel title="Loan Disbursement"><BarChart data={data?.loans || []}><CartesianGrid strokeDasharray="3 3" stroke="#e4e7e4" vertical={false} /><XAxis tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#e4e7e4' }} dataKey="period" /><YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} /><Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,202,132,0.12)' }} formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="amount" name="Amount" fill="#52a447" radius={[6, 6, 0, 0]} maxBarSize={56} /></BarChart></ChartPanel>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6"><h2 className="mb-4 text-lg font-bold text-gray-900">Operating Revenue Breakdown</h2><div className="h-[300px]">{revenue.length ? <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_SIZE}><PieChart><Pie data={revenue} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${String(name ?? '')}: ${(Number(percent ?? 0) * 100).toFixed(0)}%`}>{revenue.map((entry, index) => <Cell key={entry.category} fill={COLORS[index % COLORS.length]} />)}</Pie><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /><Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,202,132,0.12)' }} formatter={(value) => formatCurrency(Number(value))} /></PieChart></ResponsiveContainer> : <EmptyState loading={loading} />}</div></div>
      </div>
      {/* Full width so a month's daily bars have room. */}
      <KadiwaChart rows={data?.sales || []} daily={dateRange === 'month'} loading={loading} />
      {/* Bookings, utilization, revenue and cost per machine, maintenance and downtime; the forecast, ROI and AI recommendations open from its button. */}
      <FleetAnalytics from={period.from} to={period.to} periodLabel={periodLabel} refreshKey={refreshKey} />
    </div>
  );
}

// Teal, orange and blue stay apart for color-blind viewers (checked with the
// data-viz palette validator); the store's greens and an orange do not.
const KADIWA_COLORS = { gross: '#1baf7a', expenses: '#eb6834', net: '#2a78d6' };
type KadiwaRow = AnalyticsData['sales'][number];

/**
 * Kadiwa sales against expenses, with the net income (total sold - cost of
 * goods - expenses) as the line between them. One month is plotted day by day
 * (the server fills days without a sale with 0); longer periods month by month.
 */
function KadiwaChart({ rows, daily, loading }: { rows: KadiwaRow[]; daily: boolean; loading: boolean }) {
  // No line point on a day without a sale, so the line does not dip to 0 between sale days.
  // No animation: the page re-fetches as sales come in, and bars growing in again each time would leave the line alone for a moment.
  const points = rows.map((row) => ({ ...row, net: row.transactions ? row.sales : null }));
  const total = (key: 'gross' | 'expenses' | 'sales') => rows.reduce((sum, row) => sum + row[key], 0);
  const totals: Array<[string, string, number]> = [
    ['Total sold', KADIWA_COLORS.gross, total('gross')],
    ['Expenses', KADIWA_COLORS.expenses, total('expenses')],
    ['Net income', KADIWA_COLORS.net, total('sales')],
  ];
  return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6">
    <h2 className="text-lg font-bold text-gray-900">{daily ? 'Kadiwa Daily Sales, Expenses and Net Income' : 'Kadiwa Sales, Expenses and Net Income'}</h2>
    {/* The legend, with the totals for the period. */}
    <ul className="mb-4 mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">{totals.map(([label, color, value]) => <li key={label} className="flex items-center gap-2 text-gray-600"><span aria-hidden="true" className={label === 'Net income' ? 'h-0.5 w-4 rounded-full' : 'h-3 w-3 rounded-sm'} style={{ background: color }} />{label} <span className={`font-semibold tabular-nums ${value < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(value)}</span></li>)}</ul>
    <div className="h-[300px]">{rows.length ? <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_SIZE}>
      <ComposedChart data={points} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e7e4" vertical={false} />
        <XAxis tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#e4e7e4' }} dataKey="period" minTickGap={12} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <ReferenceLine y={0} stroke="#c9cdc9" />
        <Tooltip cursor={{ fill: 'rgba(139,202,132,0.12)' }} content={({ active, payload }) => active && payload?.length ? <KadiwaTooltip row={payload[0].payload as KadiwaRow} /> : null} />
        <Bar dataKey="gross" name="Total sold" fill={KADIWA_COLORS.gross} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="expenses" name="Expenses" fill={KADIWA_COLORS.expenses} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Line type="linear" dataKey="net" name="Net income" stroke={KADIWA_COLORS.net} strokeWidth={2} dot={{ r: 4, fill: KADIWA_COLORS.net, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer> : <EmptyState loading={loading} />}</div>
  </div>;
}

function KadiwaTooltip({ row }: { row: KadiwaRow }) {
  const line = (label: string, color: string, value: number, strong = false) => <div className="flex items-center justify-between gap-6"><span className="flex items-center gap-2 text-gray-600"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span><span className={`tabular-nums ${strong ? 'font-semibold' : ''} ${value < 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(value)}</span></div>;
  return <div className="min-w-[200px] space-y-1 bg-white p-3 text-[13px]" style={TOOLTIP_STYLE}>
    <p className="font-semibold text-gray-900">{row.period}</p>
    {row.transactions ? <>
      {line('Total sold', KADIWA_COLORS.gross, row.gross)}
      {line('Expenses', KADIWA_COLORS.expenses, row.expenses)}
      {row.costOfGoods > 0 && line('Cost of store items', '#9ca3af', row.costOfGoods)}
      <div className="border-t border-gray-100 pt-1">{line('Net income', KADIWA_COLORS.net, row.sales, true)}</div>
    </> : <p className="text-gray-500">No sale</p>}
  </div>;
}

function ChartPanel({ title, children }: { title: string; children: React.ReactElement }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6"><h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_SIZE}>{children}</ResponsiveContainer></div></div>;
}

function EmptyState({ loading, message = 'No data for this period.' }: { loading: boolean; message?: string }) { return <div className="flex h-full items-center justify-center text-sm text-gray-500">{loading ? 'Loading live data...' : message}</div>; }
