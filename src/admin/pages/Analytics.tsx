import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { BarChart, Bar, ComposedChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ReferenceLine, Rectangle, ResponsiveContainer, type BarShapeProps, type LabelProps } from 'recharts';
import { Download, HandCoins, Store, Tractor, TrendingUp } from 'lucide-react';
import { UserRole } from '../../app/App';
import { fetchAnalytics, fetchRevenueTrend, type AnalyticsData, type RevenueGranularity, type RevenueTrend, type RevenueTrendRow } from '../../app/services/authApi';
import { StatCard } from '../../app/components/common/UiKit';
import { FleetAnalytics } from '../components/machinery/FleetAnalytics';
import { MemberCreditHistory } from '../components/MemberCreditHistory';
import { KadiwaProductInsights } from '../components/kadiwa/KadiwaProductInsights';
import { toast } from 'sonner';

// Shared chart styling in the ACIFAC palette.
const AXIS_TICK = { fontSize: 12, fill: '#5f6660' };
const TOOLTIP_STYLE = { borderRadius: 12, border: '1px solid #e4e7e4', boxShadow: '0 4px 12px -2px rgba(16,24,16,0.08)', fontSize: 13 };
// Charts sit in fixed 300px-tall boxes; a positive starting size avoids recharts' -1x-1 warning before the container is measured.
const CHART_INITIAL_SIZE = { width: 1, height: 300 };
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface AnalyticsProps { userRole: UserRole; }

// One area at a time, so the page stays short; the tab is kept in the address (?tab=loans).
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'loans', label: 'Loans' },
  { id: 'kadiwa', label: 'Kadiwa' },
  { id: 'machinery', label: 'Machinery' },
] as const;
type TabId = typeof TABS[number]['id'];

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

// Net income as the Dashboard counts it; a server from before it was sent gives the old sum.
const netIncomeOf = (summary: AnalyticsData['summary']) => summary.netIncome ?? summary.totalOperatingRevenue;
const machineryNetOf = (summary: AnalyticsData['summary']) => summary.machineryNetIncome ?? summary.machineryRevenue;

function formatCurrency(value: number) {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function downloadCsv(data: AnalyticsData) {
  const rows = [
    ['Metric', 'Value'],
    ['Period', `${data.period.from} to ${data.period.to}`],
    ['Active Members', data.summary.activeMembers],
    ['New Members', data.summary.newMembers],
    ['Net Income', netIncomeOf(data.summary)],
    ['Operating Revenue', data.summary.totalOperatingRevenue],
    ['Loan Payments', data.summary.loanPayments],
    ['Interest Collected', data.summary.interestCollected],
    ['Share Capital Contributions', data.summary.shareCapital],
    ['Machinery Net Income', machineryNetOf(data.summary)],
    ['Machinery Rental Fees', data.summary.machineryRevenue],
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabId = TABS.some((entry) => entry.id === searchParams.get('tab')) ? searchParams.get('tab') as TabId : 'overview';
  const selectTab = (id: TabId) => setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true });
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

      {/* The four headline figures for the period, above every tab. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Net income" value={summary ? formatCurrency(netIncomeOf(summary)) : ''} icon={TrendingUp} tone="dark" loading={loading && !summary} detail="Kadiwa, machinery and loan interest, as on the Dashboard" />
        <StatCard label="Outstanding loans" value={summary ? formatCurrency(summary.outstandingBalance) : ''} icon={HandCoins} loading={loading && !summary}
          tone={summary?.overdueLoans ? 'warning' : 'green'} detail={summary ? (summary.overdueLoans ? `${summary.overdueLoans} overdue` : 'None overdue') : undefined} onClick={() => selectTab('loans')} />
        <StatCard label="Kadiwa net income" value={summary ? formatCurrency(summary.kadiwaNetSales) : ''} icon={Store} loading={loading && !summary} detail="Sales less costs and expenses" onClick={() => selectTab('kadiwa')} />
        <StatCard label="Machinery net income" value={summary ? formatCurrency(machineryNetOf(summary)) : ''} icon={Tractor} loading={loading && !summary} detail="Rentals and services, less expenses" onClick={() => selectTab('machinery')} />
      </div>

      {/* Four equal tabs on a phone, so none is cut off. */}
      <nav aria-label="Analytics sections" className="grid grid-cols-4 gap-1 sm:flex">
        {TABS.map((entry) => (
          <button key={entry.id} type="button" onClick={() => selectTab(entry.id)} aria-current={tab === entry.id ? 'page' : undefined}
            className={`whitespace-nowrap rounded-xl px-1 py-2 text-[13px] font-semibold sm:px-4 sm:text-sm ${tab === entry.id ? 'bg-green-600 text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {entry.label}
          </button>
        ))}
      </nav>

      {/* Up to the end of the period picked above. */}
      {tab === 'overview' && <IncomeTrendChart to={period.to} refreshKey={refreshKey} />}
      {tab === 'loans' && <>
        <LoanDisbursementChart rows={data?.loans || []} loading={loading} />
        {/* All loans to date, whatever period is picked. */}
        <MemberCreditHistory members={data?.memberAnalytics || []} methodology={data?.methodology} loading={loading} />
      </>}
      {/* One month is shown day by day. */}
      {tab === 'kadiwa' && <>
        <KadiwaChart rows={data?.sales || []} daily={dateRange === 'month'} loading={loading} />
        <KadiwaProductInsights from={period.from} to={period.to} refreshKey={refreshKey} />
      </>}
      {/* Bookings, utilization, revenue and cost per machine; forecast, ROI and AI recommendations open from its button. */}
      {tab === 'machinery' && <FleetAnalytics from={period.from} to={period.to} periodLabel={periodLabel} refreshKey={refreshKey} />}
    </div>
  );
}

// A month's bar is blue when it went up from the month before and red when it
// went down, a pair that stays apart for color-blind viewers (checked with the
// data-viz palette validator); gray (3.4:1 on white) when it stayed the same.
// The signed change written above the bar says the same without color. Brand
// green is for the amounts alone, when the server sends no change.
const LOAN_COLORS = { amount: '#52a447', up: '#2a78d6', down: '#e34948', same: '#868e87' };
type LoanRow = AnalyticsData['loans'][number];
// The value axis is a fixed width, so the room each month gets is known.
const LOAN_AXIS_WIDTH = 64;
// About how wide one character of an 11px bar label is.
const LOAN_LABEL_CHAR_WIDTH = 6.6;
const compactPesos = (value: number) => `${value < 0 ? '−' : ''}₱${new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(value))}`;
const signedPesos = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCurrency(Math.abs(value))}`;
// "+₱86K", "−₱8.5K": short enough to sit above a bar.
const changeLabel = (value: number) => `${value > 0 ? '+' : '−'}₱${new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: Math.abs(value) >= 10000 ? 0 : 1 }).format(Math.abs(value))}`;

// "Sep 2026" for the month before a YYYY-MM month.
function monthBefore(month: string) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 2, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// "up ₱15,000 (+25%) from Sep 2026", in words for the summary, tooltip and table.
function describeChange(row: LoanRow) {
  const before = monthBefore(row.month);
  if (row.change === 0) return row.amount === 0 ? `none in ${before} either` : `same as ${before}`;
  const percent = row.changePercent === null ? '' : ` (${row.changePercent > 0 ? '+' : '−'}${Math.abs(row.changePercent)}%)`;
  return `${row.change > 0 ? 'up' : 'down'} ${formatCurrency(Math.abs(row.change))}${percent} from ${before}`;
}

/**
 * Loans disbursed month by month in one bar chart: each bar is the month's
 * total, colored by whether it went up or down from the month before, with
 * that change written above it. The server sends every month (₱0 without a
 * loan); the current month is marked "so far".
 */
function LoanDisbursementChart({ rows, loading }: { rows: LoanRow[]; loading: boolean }) {
  const thisMonth = currentMonth();
  const latest = rows.at(-1);
  const [chartWidth, setChartWidth] = useState(0);
  // A backend from before the change sends only the months with loans and no
  // change; then only the amounts are shown (the frontend may go live first).
  const compared = rows.every((row) => typeof row.month === 'string' && typeof row.change === 'number');
  // Every change is written above its bar when the labels fit side by side.
  // On a narrow chart (a phone) only the latest month and the two biggest
  // changes are, never two next to each other, so the labels do not collide.
  const band = rows.length ? (chartWidth - LOAN_AXIS_WIDTH - 8) / rows.length : 0;
  const allFit = rows.every((row) => !row.change || changeLabel(row.change).length * LOAN_LABEL_CHAR_WIDTH <= band - 4);
  const labeled = new Set<number>();
  if (compared && rows.length) {
    if (allFit) rows.forEach((row, index) => { if (row.change) labeled.add(index); });
    else {
      const byChange = rows.map((row, index) => index).filter((index) => rows[index].change).sort((a, b) => Math.abs(rows[b].change) - Math.abs(rows[a].change));
      for (const index of [rows.length - 1, ...byChange]) {
        if (labeled.size >= 3) break;
        if (rows[index].change && !labeled.has(index - 1) && !labeled.has(index + 1)) labeled.add(index);
      }
    }
  }
  const barColor = (row: LoanRow) => (!compared ? LOAN_COLORS.amount : row.change > 0 ? LOAN_COLORS.up : row.change < 0 ? LOAN_COLORS.down : LOAN_COLORS.same);
  const renderLabel = ({ viewBox, index }: LabelProps) => {
    const row = typeof index === 'number' ? rows[index] : undefined;
    if (!row || !row.change || !labeled.has(index as number) || !viewBox || !('width' in viewBox)) return null;
    const { x = 0, y = 0, width = 0 } = viewBox as { x?: number; y?: number; width?: number };
    return <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#374151">{changeLabel(row.change)}</text>;
  };
  const showSame = compared && rows.some((row) => row.change === 0 && row.amount > 0);

  return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6">
    <h2 className="text-lg font-bold text-gray-900">Loan Disbursement</h2>
    {rows.length > 0 && latest ? <>
      <p className="text-sm text-gray-500">{rows[0].period === latest.period ? latest.period : `${rows[0].period} to ${latest.period}`}, month by month</p>
      {compared && <>
        <p className="mt-2 text-sm text-gray-700"><span className="font-semibold">{latest.period}{latest.month === thisMonth ? ' so far' : ''}:</span> <span className="tabular-nums">{formatCurrency(latest.amount)}</span>, {describeChange(latest)}</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: LOAN_COLORS.up }} />Up from the month before</li>
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: LOAN_COLORS.down }} />Down</li>
          {showSame && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: LOAN_COLORS.same }} />Same</li>}
          <li className="text-gray-500">Above each bar: the change</li>
        </ul>
      </>}
      <div className="mt-3 h-[300px]"><ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_SIZE} onResize={(width) => setChartWidth(width)}>
        <BarChart data={rows} margin={{ top: 22, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e7e4" vertical={false} />
          <XAxis dataKey="period" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#e4e7e4' }} minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={LOAN_AXIS_WIDTH} tickFormatter={compactPesos} />
          <Tooltip cursor={{ fill: 'rgba(139,202,132,0.12)' }} content={({ active, payload }) => active && payload?.length ? <LoanTooltip row={payload[0].payload as LoanRow} partial={(payload[0].payload as LoanRow).month === thisMonth} compared={compared} /> : null} />
          {/* Colored through the bar's shape (Cell is deprecated). A month that fell to ₱0 keeps a thin red
              sliver, so its label sits on a mark of its own and not beside the month before. */}
          <Bar dataKey="amount" name="Disbursed" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}
            minPointSize={(value, index) => (compared && !value && rows[index]?.change ? 3 : 0)}
            shape={(props: BarShapeProps) => <Rectangle {...props} fill={barColor(props.payload as LoanRow)} />}>
            {compared && <LabelList dataKey="change" content={renderLabel} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer></div>

      {compared && <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-green-700 hover:text-green-800">View as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left">
            {/* The number of loans and the percentage are left out on a phone, so the change fits; the tooltip still has both. */}
            <thead className="text-xs text-gray-500"><tr><th className="py-1 pr-3 font-medium">Month</th><th className="hidden py-1 pr-3 text-right font-medium sm:table-cell">Loans</th><th className="py-1 pr-3 text-right font-medium">Disbursed</th><th className="py-1 pr-3 text-right font-medium">Change</th><th className="hidden py-1 text-right font-medium sm:table-cell">%</th></tr></thead>
            <tbody className="divide-y divide-gray-100 tabular-nums text-gray-700">
              {rows.map((row) => <tr key={row.month}>
                <td className="whitespace-nowrap py-1 pr-3">{row.period}{row.month === thisMonth ? ' (so far)' : ''}</td>
                <td className="hidden py-1 pr-3 text-right sm:table-cell">{row.count}</td>
                <td className="py-1 pr-3 text-right">{formatCurrency(row.amount)}</td>
                <td className="whitespace-nowrap py-1 pr-3 text-right">{signedPesos(row.change)}</td>
                <td className="hidden whitespace-nowrap py-1 text-right sm:table-cell">{row.changePercent === null ? '' : `${row.changePercent > 0 ? '+' : row.changePercent < 0 ? '−' : ''}${Math.abs(row.changePercent)}%`}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </details>}
    </> : <div className="h-[300px]"><EmptyState loading={loading} /></div>}
  </div>;
}

function LoanTooltip({ row, partial, compared }: { row: LoanRow; partial: boolean; compared: boolean }) {
  return <div className="min-w-[220px] space-y-1 bg-white p-3 text-[13px]" style={TOOLTIP_STYLE}>
    <p className="font-semibold text-gray-900">{row.period}{partial ? ' (so far)' : ''}</p>
    <div className="flex items-center justify-between gap-6"><span className="flex items-center gap-2 text-gray-600"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: LOAN_COLORS.amount }} />Disbursed</span><span className="font-semibold tabular-nums text-gray-900">{formatCurrency(row.amount)}</span></div>
    <p className="text-gray-500">{row.count} {row.count === 1 ? 'loan' : 'loans'}</p>
    {compared && <>
      <div className="flex items-center justify-between gap-6 border-t border-gray-100 pt-1"><span className="flex items-center gap-2 text-gray-600"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: row.change < 0 ? LOAN_COLORS.down : LOAN_COLORS.up }} />Change</span><span className="tabular-nums text-gray-900">{signedPesos(row.change)}</span></div>
      <p className="text-gray-500">{describeChange(row)}</p>
    </>}
  </div>;
}

// The three income sources, one line each: blue, orange and aqua, the first
// three slots of the validated categorical palette (they stay apart for
// color-blind viewers on white). The legend names each line with its total.
const INCOME_SERIES = [
  { key: 'kadiwa', label: 'Kadiwa net sales', color: '#2a78d6' },
  { key: 'machinery', label: 'Machinery (net)', color: '#eb6834' },
  { key: 'loanInterest', label: 'Loan interest', color: '#1baf7a' },
] as const;
const GRANULARITIES: Array<{ id: RevenueGranularity; label: string; span: string; column: string }> = [
  { id: 'day', label: 'Daily', span: 'Last 30 days', column: 'Day' },
  { id: 'month', label: 'Monthly', span: 'Last 12 months', column: 'Month' },
  { id: 'year', label: 'Yearly', span: 'Last 5 years', column: 'Year' },
];

/**
 * Net income over time from each module (as the Dashboard counts it), by day, month or year, ending with the
 * period picked at the top of the page (today at the latest).
 */
function IncomeTrendChart({ to, refreshKey }: { to: string; refreshKey: number }) {
  const [granularity, setGranularity] = useState<RevenueGranularity>('month');
  const [trend, setTrend] = useState<RevenueTrend | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRevenueTrend(granularity, to)
      .then((result) => { if (active) { setTrend(result); setError(''); } })
      .catch((reason: Error) => { if (active) setError(reason.message || 'Unable to load the income chart.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [granularity, to, refreshKey]);

  const rows = trend?.granularity === granularity ? trend.rows : [];
  const { span, column } = GRANULARITIES.find((entry) => entry.id === granularity)!;
  const last = rows.at(-1);
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Net income over time</h2>
        <p className="text-sm text-gray-500">{span}{last ? `, to ${last.label}` : ''}</p>
      </div>
      <div role="group" aria-label="Show by" className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        {GRANULARITIES.map((entry) => (
          <button key={entry.id} type="button" onClick={() => setGranularity(entry.id)} aria-pressed={granularity === entry.id}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${granularity === entry.id ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
            {entry.label}
          </button>
        ))}
      </div>
    </div>

    {trend && rows.length > 0 && <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {INCOME_SERIES.map((series) => <li key={series.key} className="flex items-center gap-2 text-gray-600">
        <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: series.color }} />{series.label}
        <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(trend.totals[series.key])}</span>
      </li>)}
      <li className="text-gray-600">Total <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(trend.totals.total)}</span></li>
    </ul>}

    <div className={`mt-4 h-[320px] ${loading && rows.length ? 'opacity-60' : ''}`}>
      {rows.length ? <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_SIZE}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#eef0ee" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#e4e7e4' }} minTickGap={16} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={compactPesos} />
          <Tooltip cursor={{ stroke: '#9ca39d', strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? <IncomeTooltip row={payload[0].payload as RevenueTrendRow} /> : null} />
          {INCOME_SERIES.map((series) => <Line key={series.key} type="linear" dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2}
            dot={granularity === 'day' ? false : { r: 4, fill: series.color, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer> : <EmptyState loading={loading} message={error || 'No income in this period.'} />}
    </div>

    {rows.length > 0 && <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-medium text-green-700 hover:text-green-800">View as table</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="min-w-full text-left">
          <thead className="sticky top-0 bg-white text-xs text-gray-500"><tr><th className="py-1 pr-3 font-medium">{column}</th>{INCOME_SERIES.map((series) => <th key={series.key} className="py-1 pr-3 text-right font-medium">{series.label}</th>)}<th className="py-1 text-right font-medium">Total</th></tr></thead>
          <tbody className="divide-y divide-gray-100 tabular-nums text-gray-700">
            {[...rows].reverse().map((row) => <tr key={row.start}>
              <td className="whitespace-nowrap py-1 pr-3">{row.label}</td>
              {INCOME_SERIES.map((series) => <td key={series.key} className="py-1 pr-3 text-right">{formatCurrency(row[series.key])}</td>)}
              <td className="py-1 text-right font-semibold text-gray-900">{formatCurrency(row.total)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </details>}
  </section>;
}

function IncomeTooltip({ row }: { row: RevenueTrendRow }) {
  return <div className="min-w-[210px] space-y-1 bg-white p-3 text-[13px]" style={TOOLTIP_STYLE}>
    <p className="font-semibold text-gray-900">{row.label}</p>
    {INCOME_SERIES.map((series) => <div key={series.key} className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 text-gray-600"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: series.color }} />{series.label}</span>
      <span className="tabular-nums text-gray-900">{formatCurrency(row[series.key])}</span>
    </div>)}
    <div className="flex justify-between gap-6 border-t border-gray-100 pt-1"><span className="text-gray-600">Total</span><span className="font-semibold tabular-nums text-gray-900">{formatCurrency(row.total)}</span></div>
  </div>;
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


function EmptyState({ loading, message = 'No data for this period.' }: { loading: boolean; message?: string }) { return <div className="flex h-full items-center justify-center text-sm text-gray-500">{loading ? 'Loading live data...' : message}</div>; }
