import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// The Kadiwa chart of Analytics, shared by the office (one branch or all) and
// the vendor's own Analytics page.

const AXIS_TICK = { fontSize: 12, fill: '#5f6660' };
const TOOLTIP_STYLE = { borderRadius: 12, border: '1px solid #e4e7e4', boxShadow: '0 4px 12px -2px rgba(16,24,16,0.08)', fontSize: 13 };
const CHART_INITIAL_SIZE = { width: 1, height: 300 };
const formatCurrency = (value: number) => `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
function EmptyState({ loading, message = 'No data for this period.' }: { loading: boolean; message?: string }) { return <div className="flex h-full items-center justify-center text-sm text-gray-500">{loading ? 'Loading live data...' : message}</div>; }

/** One day (or month) of the chart: goods sold (gross), cost of the store items, net income (sales), expenses and number of sales. */
export interface KadiwaChartRow { period: string; gross: number; costOfGoods: number; sales: number; expenses: number; transactions: number }

// Teal, orange and blue stay apart for color-blind viewers (checked with the
// data-viz palette validator); the store's greens and an orange do not.
const KADIWA_COLORS = { gross: '#1baf7a', expenses: '#eb6834', net: '#2a78d6' };
type KadiwaRow = KadiwaChartRow;

/**
 * Kadiwa sales against expenses, with the net income (total sold - cost of
 * goods - expenses) as the line between them. One month is plotted day by day
 * (the server fills days without a sale with 0); longer periods month by month.
 */
export function KadiwaChart({ rows, daily, loading }: { rows: KadiwaRow[]; daily: boolean; loading: boolean }) {
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


