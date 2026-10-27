import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Archive, BadgePercent, CalendarClock, Lightbulb, LoaderCircle, Megaphone, RefreshCw, ShoppingCart, Sparkles, Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  EXPENSE_LABELS, fetchFleetAnalytics, fetchFleetRecommendations,
  type ExpenseCategory, type FleetAnalytics as FleetData, type FleetMachine, type FleetRecommendations, type Recommendation, type RecommendationType,
} from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { formatDate } from '../../../utils/dateTime';
import { Modal, secondaryButton } from './shared';

const peso = (value: number) => `${value < 0 ? '-' : ''}₱${Math.abs(value).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
const days = (value: number) => {
  const whole = Math.round(value);
  return `${whole.toLocaleString('en-PH')} ${whole === 1 ? 'day' : 'days'}`;
};

// Actual vs forecast machine-days: two steps of one green (checked with the
// data-viz palette validator: the light step still clears the white card).
const ACTUAL_COLOR = '#276221';
const FORECAST_COLOR = '#7cbf74';
const AXIS_TICK = { fontSize: 12, fill: '#5f6660' };
const TOOLTIP_STYLE = { borderRadius: 12, border: '1px solid #e4e7e4', boxShadow: '0 4px 12px -2px rgba(16,24,16,0.08)', fontSize: 13 };

const RECOMMENDATION: Record<RecommendationType, { label: string; icon: LucideIcon }> = {
  buy: { label: 'Buy more units', icon: ShoppingCart },
  rates: { label: 'Rental rates', icon: BadgePercent },
  retire: { label: 'Retire or sell', icon: Archive },
  maintenance: { label: 'Maintenance', icon: Wrench },
  schedule: { label: 'Scheduling', icon: CalendarClock },
  promote: { label: 'Find more work', icon: Megaphone },
  other: { label: 'Suggestion', icon: Lightbulb },
};

const STATUS_BADGE: Record<FleetMachine['status'], string> = {
  available: 'bg-green-100 text-green-800',
  'in-use': 'bg-blue-100 text-blue-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
};

/**
 * The machinery fleet on the Analytics page, in one card: utilization,
 * revenue, cost, bookings and downtime, in total and per machine, for the
 * picked period. The recommendations, the seasonal forecast
 * and the return on investment open in a window from "AI insights"; only then
 * (or on Refresh) is the AI asked.
 */
export function FleetAnalytics({ from, to, periodLabel, refreshKey }: { from: string; to: string; periodLabel: string; refreshKey: number }) {
  const [data, setData] = useState<FleetData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showInsights, setShowInsights] = useState(false);
  const [advice, setAdvice] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; result?: FleetRecommendations; label?: string; error?: string }>({ status: 'idle' });
  // Re-reads the figures when machinery records change (the AI is not asked again).
  const [changes, setChanges] = useState(0);
  useLiveRefresh(['machinery', 'rental_requests', 'machinery_operations', 'machinery_services', 'machinery_service_payments', 'machinery_expenses'], () => setChanges((count) => count + 1), 2000);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchFleetAnalytics(from, to)
      .then((next) => { if (active) { setData(next); setError(''); } })
      .catch((reason) => { if (active) setError(errorMessage(reason, 'Unable to load the machinery analytics.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, refreshKey, changes]);

  const askAdvice = () => {
    const label = periodLabel;
    setAdvice((current) => ({ ...current, status: 'loading', error: undefined }));
    fetchFleetRecommendations(from, to)
      .then((result) => setAdvice({ status: 'done', result, label }))
      .catch((reason) => setAdvice((current) => ({ ...current, status: 'error', error: errorMessage(reason, 'Unable to get recommendations.') })));
  };

  // The AI is asked when the window opens, unless it already answered for this period.
  const openInsights = () => {
    if (advice.status === 'idle' || (advice.status !== 'loading' && advice.label !== periodLabel)) askAdvice();
    setShowInsights(true);
  };

  useEffect(() => {
    if (!showInsights) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowInsights(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showInsights]);

  const fleet = data?.fleet;
  const machines = [...(data?.machines || [])].sort((a, b) => b.revenue - a.revenue || (b.utilization ?? -1) - (a.utilization ?? -1) || a.name.localeCompare(b.name));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="fleet-analytics-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="fleet-analytics-title" className="text-lg font-bold text-gray-900">Machinery Fleet</h2>
          <p className="mt-1 text-sm text-gray-500">Utilization, revenue, cost, bookings and downtime per machine · {periodLabel}</p>
        </div>
        <button type="button" onClick={openInsights} disabled={!data} aria-haspopup="dialog"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Sparkles className="h-4 w-4" />
          AI insights
        </button>
      </div>

      {error && !data && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="flex h-40 items-center justify-center gap-2 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading live data...</p>}

      {data && fleet && (
        // A refresh keeps the last figures on screen, dimmed, instead of a loading flash.
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label="Utilization" value={fleet.utilization === null ? '—' : `${fleet.utilization}%`} detail={fleet.ownedDays ? `${plural(fleet.usedDays, 'machine-day')} used of ${fleet.ownedDays.toLocaleString()}` : 'Period not started'} />
            <Tile label="Revenue" value={peso(fleet.revenue)} detail={fleet.uncollected > 0 ? `${peso(fleet.uncollected)} not yet collected` : `Rentals ${peso(fleet.rentalRevenue)} · services ${peso(fleet.serviceRevenue)}`} />
            <Tile label="Operating cost" value={peso(fleet.cost)} detail="Fuel, labor, repairs, other" />
            <Tile label="Net income" value={peso(fleet.net)} detail="Revenue less operating cost" negative={fleet.net < 0} />
            <Tile label="Bookings & jobs" value={(data.bookings.operations.scheduled + data.bookings.operations.ongoing + data.bookings.operations.completed + data.bookings.services.jobs).toLocaleString()}
              detail={data.bookings.requests.pendingNow ? `${plural(data.bookings.requests.pendingNow, 'request')} waiting for review` : 'No requests waiting'} />
            <Tile label="Downtime" value={days(fleet.downtimeDays)} detail={`${fleet.availability === null ? '—' : `${fleet.availability}%`} available · ${fleet.inMaintenance} in maintenance now`} />
          </div>

          <MachineTable machines={machines} fleet={fleet} />

          {showInsights && (
            <Modal title="AI insights" description={`Machinery Fleet · ${periodLabel}`} onClose={() => setShowInsights(false)} wide
              footer={<button type="button" onClick={() => setShowInsights(false)} className={secondaryButton}>Close</button>}>
              <div id="fleet-insights" className="space-y-8">
                <AdviceBlock advice={advice} periodLabel={periodLabel} onRefresh={askAdvice} />
                <ForecastBlock forecast={data.forecast} method={data.methodology.forecast} />
                <RoiBlock machines={machines} method={data.methodology.roi} />
              </div>
            </Modal>
          )}

          <details className="mt-6 text-sm text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">How these figures are calculated</summary>
            <dl className="mt-2 space-y-1.5">
              {(Object.entries(data.methodology) as Array<[keyof FleetData['methodology'], string]>).map(([key, text]) => (
                <div key={key}><dt className="inline font-medium capitalize text-gray-800">{key === 'roi' ? 'Return on investment' : key === 'rules' ? 'Recommendation rules' : key}: </dt><dd className="inline">{text}</dd></div>
              ))}
            </dl>
          </details>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, detail, negative = false }: { label: string; value: string; detail: string; negative?: boolean }) {
  return <div className="min-w-0 rounded-xl border border-gray-200 px-3 py-2.5">
    <p className="text-xs font-medium text-gray-600">{label}</p>
    <p className={`mt-0.5 truncate text-xl font-bold ${negative ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    <p className="mt-0.5 text-xs leading-snug text-gray-500">{detail}</p>
  </div>;
}

function UtilizationMeter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  return <div className="flex items-center gap-2">
    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-green-100" aria-hidden="true"><span className="block h-full rounded-full bg-green-600" style={{ width: `${Math.min(100, value)}%` }} /></span>
    <span className="tabular-nums">{value}%</span>
  </div>;
}

function MachineTable({ machines, fleet }: { machines: FleetMachine[]; fleet: FleetData['fleet'] }) {
  const costLine = (machine: FleetMachine) => (Object.entries(machine.costByCategory) as Array<[ExpenseCategory, number]>)
    .filter(([, amount]) => amount > 0).map(([category, amount]) => `${EXPENSE_LABELS[category].replace(' & maintenance', 's')} ${peso(amount)}`).join(' · ');
  return <div className="mt-6">
    <h3 className="text-sm font-semibold text-gray-900">Per machine</h3>
    {machines.length ? <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr><th className="px-3 py-2 font-medium">Machine</th><th className="px-3 py-2 font-medium">Bookings · jobs</th><th className="px-3 py-2 font-medium">Utilization</th><th className="px-3 py-2 text-right font-medium">Revenue</th><th className="px-3 py-2 text-right font-medium">Cost</th><th className="px-3 py-2 text-right font-medium">Net</th><th className="px-3 py-2 font-medium">Downtime</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {machines.map((machine) => (
            <tr key={machine.id} className="align-top">
              <td className="px-3 py-2.5">
                <p className="font-medium text-gray-900">{machine.name} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[machine.status]}`}>{machine.status}</span></p>
                <p className="text-xs text-gray-500">{machine.id} · {machine.type}{machine.pricingMode === 'per_service' ? ' · per service' : ` · ${peso(machine.dailyFee)}/day`}</p>
              </td>
              <td className="px-3 py-2.5 tabular-nums">{machine.bookings} · {machine.jobs}<p className="text-xs text-gray-500">{plural(machine.usedDays, 'day')} used</p></td>
              <td className="px-3 py-2.5"><UtilizationMeter value={machine.utilization} /></td>
              <td className="px-3 py-2.5 text-right tabular-nums">{peso(machine.revenue)}{machine.uncollected > 0 && <p className="text-xs text-amber-800">{peso(machine.uncollected)} uncollected</p>}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{peso(machine.cost)}{machine.cost > 0 && <p className="text-xs text-gray-500">{costLine(machine)}</p>}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${machine.net < 0 ? 'text-red-700' : 'text-gray-900'}`}>{peso(machine.net)}</td>
              <td className="px-3 py-2.5">
                <span className="tabular-nums">{machine.downtimeDays ? days(machine.downtimeDays) : '—'}</span>
                {machine.status === 'maintenance' && <p className="text-xs text-amber-800">{machine.downSince ? `Down since ${formatDate(machine.downSince, true)}` : 'Down (start not recorded)'}</p>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
          <tr>
            <td className="px-3 py-2">Fleet ({fleet.machines})</td>
            <td className="px-3 py-2 tabular-nums">{machines.reduce((sum, machine) => sum + machine.bookings, 0)} · {machines.reduce((sum, machine) => sum + machine.jobs, 0)}</td>
            <td className="px-3 py-2"><UtilizationMeter value={fleet.utilization} /></td>
            <td className="px-3 py-2 text-right tabular-nums">{peso(fleet.revenue)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{peso(fleet.cost)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${fleet.net < 0 ? 'text-red-700' : ''}`}>{peso(fleet.net)}</td>
            <td className="px-3 py-2 tabular-nums">{fleet.downtimeDays ? days(fleet.downtimeDays) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div> : <p className="mt-2 text-sm text-gray-500">No machinery recorded.</p>}
  </div>;
}

function AdviceBlock({ advice, periodLabel, onRefresh }: { advice: { status: string; result?: FleetRecommendations; label?: string; error?: string }; periodLabel: string; onRefresh: () => void }) {
  const result = advice.result;
  const loading = advice.status === 'loading';
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
        <Sparkles className="h-4 w-4 text-green-700" aria-hidden="true" />Recommendations
        {result && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${result.source === 'ai' ? 'bg-green-50 text-green-800 ring-green-200' : 'bg-gray-50 text-gray-700 ring-gray-200'}`}>{result.source === 'ai' ? 'AI' : 'Rule-based'}</span>}
      </h3>
      <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Analyzing…' : 'Refresh'}
      </button>
    </div>
    {loading && !result && <p className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-6 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Analyzing the fleet figures. This can take up to a minute.</p>}
    {advice.status === 'error' && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{advice.error}</p>}
    {result && <div className={loading ? 'opacity-60' : ''}>
      {result.notice && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{result.notice}</p>}
      {result.summary && <p className="mt-3 text-sm text-gray-700">{result.summary}</p>}
      {result.recommendations.length ? <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {result.recommendations.map((item, index) => <RecommendationCard key={index} item={item} />)}
      </ul> : <p className="mt-3 text-sm text-gray-500">Nothing to recommend yet. Record more bookings, services and expenses first.</p>}
      <p className="mt-3 text-xs text-gray-500">
        Suggestions to discuss, not decisions. {result.source === 'ai' ? 'Written by AI from the figures on this page' : result.methodology}
        {advice.label && advice.label !== periodLabel ? `. Made for ${advice.label}; press Refresh for ${periodLabel}.` : '.'}
      </p>
    </div>}
  </div>;
}

function RecommendationCard({ item }: { item: Recommendation }) {
  const { label, icon: Icon } = RECOMMENDATION[item.type];
  return <li className="rounded-xl border border-gray-200 p-3">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-800"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</span>
      <span className="font-medium capitalize text-gray-500">{item.priority} priority</span>
    </div>
    <p className="mt-2 font-semibold text-gray-900">{item.title}</p>
    {item.machine && <p className="text-xs text-gray-500">{item.machine}</p>}
    <p className="mt-1 text-sm text-gray-700">{item.reason}</p>
    {item.impact && <p className="mt-1 text-sm text-gray-600"><span className="font-medium text-gray-800">Expected: </span>{item.impact}</p>}
  </li>;
}

type ForecastRow = { label: string; value: number; kind: 'actual' | 'forecast'; soFar?: number; jobs?: number; basis?: string };

function ForecastBlock({ forecast, method }: { forecast: FleetData['forecast']; method: string }) {
  const complete = forecast.history.filter((row) => !row.partial);
  const current = forecast.history.find((row) => row.partial);
  const rows: ForecastRow[] = [
    ...complete.slice(-12).map((row) => ({ label: row.label, value: row.machineDays, jobs: row.jobs, kind: 'actual' as const })),
    ...forecast.forecast.map((row, index) => ({ label: row.label, value: row.machineDays, kind: 'forecast' as const, basis: row.basis, ...(index === 0 && current ? { soFar: current.machineDays } : {}) })),
  ];
  const hasHistory = complete.some((row) => row.machineDays > 0);
  return <div>
    <h3 className="text-base font-bold text-gray-900">Seasonal demand forecast</h3>
    <p className="mt-1 text-sm text-gray-500">Machine-days per month (bookings and services): the last 12 months and the next {forecast.forecast.length}.</p>
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
      <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: ACTUAL_COLOR }} />Actual</li>
      <li className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: FORECAST_COLOR }} />Forecast</li>
      {forecast.peakMonths.length > 0 && <li>Busiest months: <span className="font-semibold text-gray-900">{forecast.peakMonths.join(', ')}</span></li>}
    </ul>
    {forecast.insufficientData && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Fewer than 3 months of bookings and services are recorded, so this forecast is a rough guide only.</p>}
    <div className="mt-3 h-[260px]">{hasHistory ? <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 260 }}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="#e4e7e4" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#e4e7e4' }} minTickGap={8} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(139,202,132,0.12)' }} content={({ active, payload }) => {
          const row = active && payload?.length ? payload[0].payload as ForecastRow : null;
          return row ? <div className="space-y-0.5 bg-white p-3 text-[13px]" style={TOOLTIP_STYLE}>
            <p className="font-semibold text-gray-900">{row.label}</p>
            <p className="flex items-center gap-2 text-gray-600"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: row.kind === 'actual' ? ACTUAL_COLOR : FORECAST_COLOR }} />{row.kind === 'actual' ? 'Actual' : 'Forecast'}: <span className="font-semibold tabular-nums text-gray-900">{plural(row.value, 'machine-day')}</span></p>
            {row.jobs !== undefined && <p className="text-gray-500">{row.jobs.toLocaleString()} {row.jobs === 1 ? 'booking or job' : 'bookings and jobs'}</p>}
            {row.soFar !== undefined && <p className="text-gray-500">So far this month: {plural(row.soFar, 'machine-day')}</p>}
            {row.basis && <p className="text-xs text-gray-500">From {row.basis}</p>}
          </div> : null;
        }} />
        <Bar dataKey="value" name="Machine-days" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
          {rows.map((row) => <Cell key={`${row.kind}-${row.label}`} fill={row.kind === 'actual' ? ACTUAL_COLOR : FORECAST_COLOR} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer> : <p className="flex h-full items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-500">No bookings or services recorded in the last 12 months yet.</p>}</div>
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-gray-600">Show as a table</summary>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[360px] text-left text-sm">
        <thead className="text-xs uppercase text-gray-500"><tr><th className="py-1.5 font-medium">Month</th><th className="py-1.5 font-medium">Kind</th><th className="py-1.5 text-right font-medium">Machine-days</th></tr></thead>
        <tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={`${row.kind}-${row.label}`}><td className="py-1.5">{row.label}</td><td className="py-1.5 text-gray-600">{row.kind === 'actual' ? 'Actual' : `Forecast${row.soFar !== undefined ? ` (so far ${row.soFar})` : ''}`}</td><td className="py-1.5 text-right tabular-nums">{row.value}</td></tr>)}</tbody>
      </table></div>
    </details>
    <p className="mt-2 text-xs text-gray-500">{method}</p>
  </div>;
}

function RoiBlock({ machines, method }: { machines: FleetMachine[]; method: string }) {
  const rows = [...machines].sort((a, b) => (b.roi.earnedBack ?? -Infinity) - (a.roi.earnedBack ?? -Infinity) || a.name.localeCompare(b.name));
  const missing = rows.filter((machine) => machine.roi.status === 'no_cost').length;
  const payback = (roi: FleetMachine['roi']) => {
    if (roi.status === 'grant') return 'Grant';
    if (roi.status !== 'ok') return '—';
    if (roi.paybackYears === null) return <span className="text-red-700">Not paying back</span>;
    return <>{roi.paybackYears.toLocaleString()} yrs<p className="text-xs font-normal text-gray-500">{roi.yearsToPayback ? `${roi.yearsToPayback.toLocaleString()} yrs to go` : 'Paid back'}</p></>;
  };
  return <div>
    <h3 className="text-base font-bold text-gray-900">Return on investment per machine</h3>
    <p className="mt-1 text-sm text-gray-500">Since each machine was delivered, against what the cooperative paid for it.</p>
    {missing > 0 && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{plural(missing, 'machine')} {missing === 1 ? 'has' : 'have'} no purchase cost yet. Enter it in Machinery → Details &amp; rates (0 for a grant).</p>}
    <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr><th className="px-3 py-2 font-medium">Machine</th><th className="px-3 py-2 text-right font-medium">Purchase cost</th><th className="px-3 py-2 text-right font-medium">Revenue</th><th className="px-3 py-2 text-right font-medium">Costs</th><th className="px-3 py-2 text-right font-medium">Net</th><th className="px-3 py-2 text-right font-medium">Earned back</th><th className="px-3 py-2 text-right font-medium">Per year</th><th className="px-3 py-2 text-right font-medium">Payback</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(({ roi, id, name }) => (
            <tr key={id} className="align-top">
              <td className="px-3 py-2.5"><p className="font-medium text-gray-900">{name}</p><p className="text-xs text-gray-500">Since {formatDate(roi.inServiceFrom, true)} · {roi.yearsOwned.toLocaleString()} yrs</p></td>
              <td className="px-3 py-2.5 text-right tabular-nums">{roi.purchaseCost === null ? <span className="text-amber-800">Not entered</span> : roi.purchaseCost === 0 ? 'Grant' : peso(roi.purchaseCost)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{peso(roi.lifetimeRevenue)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{peso(roi.lifetimeCost)}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${roi.lifetimeNet < 0 ? 'text-red-700' : 'text-gray-900'}`}>{peso(roi.lifetimeNet)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{roi.earnedBack === null ? (roi.status === 'too_new' ? 'Too new' : '—') : `${roi.earnedBack}%`}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${(roi.roiPerYear ?? 0) < 0 ? 'text-red-700' : ''}`}>{roi.roiPerYear === null ? '—' : `${roi.roiPerYear}%`}</td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">{payback(roi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="mt-2 text-xs text-gray-500">{method}</p>
  </div>;
}
