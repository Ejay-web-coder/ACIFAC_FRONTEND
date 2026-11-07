import { useEffect, useState, type ComponentType } from 'react';
import { CalendarDays, CheckCircle2, ChevronDown, Clock, Landmark, Lock, LogIn, LogOut, Monitor, PiggyBank, Search, Send, ShieldAlert, ShoppingCart, Tractor, UserRound, History, KeyRound, XCircle } from 'lucide-react';
import { EmptyState, ListSkeleton } from '../../app/components/common/UiKit';
import { addDateOnlyDays, dateOnlyToday, formatDate, formatTime } from '../../utils/dateTime';
import { errorMessage } from '../../lib/api';
import { fetchMyActivity, type ActivityEntry, type ActivityFilters, type ActivityResponse } from '../services/activityApi';

// The member's own activity log: sign-ins, changes they made, and what the
// ACIFAC office recorded for them, newest first and grouped by day.

type Icon = ComponentType<{ className?: string }>;

// The quick views across the top of the list (a page can give its own).
export type ActivityView = { value: string; label: string; short: string; filters: Pick<ActivityFilters, 'category' | 'actor' | 'status'> };
const VIEWS: ActivityView[] = [
  { value: 'everything', label: 'Everything', short: 'Everything', filters: {} },
  { value: 'signins', label: 'Sign-ins and sign-outs', short: 'Sign-ins', filters: { category: 'security' } },
  { value: 'mine', label: 'Changes I made', short: 'Changes I made', filters: { actor: 'me' } },
  { value: 'office', label: 'Recorded by the office', short: 'By the office', filters: { actor: 'office' } },
  { value: 'failed', label: 'Failed attempts', short: 'Failed attempts', filters: { status: 'FAILED' } },
];

type DateRange = 'any' | 'today' | '7' | '30' | 'year' | 'custom';
const RANGES: Array<{ value: DateRange; label: string }> = [
  { value: 'any', label: 'Any date' }, { value: 'today', label: 'Today' }, { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' }, { value: 'year', label: 'This year' }, { value: 'custom', label: 'Choose dates' },
];
const PAGE_SIZE = 10;
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function iconFor(entry: ActivityEntry): Icon {
  if (entry.action === 'KADIWA_SALE_REJECTED') return XCircle;
  if (entry.action === 'KADIWA_SALE_CONFIRMED') return CheckCircle2;
  if (entry.action === 'KADIWA_SALE_SUBMITTED') return Send;
  if (entry.status === 'failed') return ShieldAlert;
  if (entry.action === 'LOGIN') return LogIn;
  if (entry.action === 'LOGOUT' || entry.action === 'SESSION_EXPIRED') return LogOut;
  if (entry.category === 'security') return KeyRound;
  if (entry.category === 'profile') return UserRound;
  if (entry.category === 'savings') return PiggyBank;
  if (entry.category === 'loans') return Landmark;
  if (entry.category === 'machinery') return Tractor;
  if (entry.category === 'sales') return ShoppingCart;
  return History;
}

// "Today at 1:44 PM", "Yesterday at 9:02 AM", else the date and time.
function whenText(at: string) {
  const day = dateOnlyToday(new Date(at));
  const today = dateOnlyToday();
  const time = formatTime(at);
  if (day === today) return `Today at ${time}`;
  if (day === addDateOnlyDays(today, -1)) return `Yesterday at ${time}`;
  return `${formatDate(day)} at ${time}`;
}
const longDay = (day: string) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
const shortDay = (day: string) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

/** onChangePassword: opens the password form (Settings > Security). fetcher and
 * views: another account's log (a Kadiwa vendor's), with its own quick views. */
export function ActivityLog({ onChangePassword, fetcher = fetchMyActivity, views = VIEWS, subtitle }: {
  onChangePassword?: () => void;
  fetcher?: (filters: ActivityFilters) => Promise<ActivityResponse>;
  views?: ActivityView[];
  /** null: no heading (the page's name is already in the top bar). */
  subtitle?: string | null;
} = {}) {
  const [view, setView] = useState<string>('everything');
  const [range, setRange] = useState<DateRange>('any');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState(''); // the search, applied after a short pause
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ lastSignIn: string | null; lastSignInDevice?: string | null; failedSignIns30Days: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setApplied(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const today = dateOnlyToday();
  const dates = range === 'today' ? { fromDate: today, toDate: today }
    : range === '7' ? { fromDate: addDateOnlyDays(today, -6), toDate: today }
      : range === '30' ? { fromDate: addDateOnlyDays(today, -29), toDate: today }
        : range === 'year' ? { fromDate: `${today.slice(0, 4)}-01-01`, toDate: today }
          : range === 'custom' ? { fromDate: custom.from, toDate: custom.to }
            : { fromDate: '', toDate: '' };
  const filterKey = JSON.stringify([view, applied, dates]);

  // Any change of view, search or dates starts again from the newest entries.
  useEffect(() => { setPage(1); }, [filterKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const filters = (views.find((item) => item.value === view) ?? views[0]).filters;
    fetcher({ ...filters, search: applied, ...dates, page, limit: PAGE_SIZE })
      .then((response) => {
        if (cancelled) return;
        // "Show older activity" adds the next page under the ones shown.
        setEntries((current) => (page === 1 ? response.data : [...current, ...response.data.filter((entry) => !current.some((shown) => shown.id === entry.id))]));
        setTotal(response.pagination.total);
        setSummary(response.summary);
        setError('');
      })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Unable to load your activity.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page]);

  const failed = summary?.failedSignIns30Days ?? 0;
  const viewLabel = (views.find((item) => item.value === view) ?? views[0]).label;
  const filtered = view !== 'everything' || Boolean(applied) || range !== 'any';
  // Today, Yesterday, then everything older together.
  const groups: Array<{ key: string; title: string; detail?: string; detailShort?: string; items: ActivityEntry[] }> = [];
  for (const entry of entries) {
    const day = dateOnlyToday(new Date(entry.at));
    const key = day === today ? 'today' : day === addDateOnlyDays(today, -1) ? 'yesterday' : 'earlier';
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = key === 'today' ? { key, title: 'Today', detail: longDay(day), detailShort: shortDay(day), items: [] }
        : key === 'yesterday' ? { key, title: 'Yesterday', detail: longDay(day), detailShort: shortDay(day), items: [] }
          : { key, title: 'Earlier', items: [] };
      groups.push(group);
    }
    group.items.push(entry);
  }

  const chip = (item: ActivityView) => {
    const on = view === item.value;
    const warn = item.value === 'failed';
    return (
      <button key={item.value} type="button" onClick={() => setView(item.value)} aria-pressed={on}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${on ? 'border-[#1b3d26] bg-[#1b3d26] text-white' : warn ? 'border-orange-200 bg-white text-gray-800 hover:bg-orange-50' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}>
        <span className="sm:hidden">{item.short}</span><span className="hidden sm:inline">{item.label}</span>
        {warn && failed > 0 && <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800'}`}>{failed}</span>}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {subtitle !== null && (
        <div>
          <h2 className="text-xl font-bold text-gray-900">Activity log</h2>
          <p className="text-sm text-gray-600">{subtitle ?? 'Every sign-in and change on your account, plus what the ACIFAC office recorded for you.'} Newest first.</p>
        </div>
      )}

      {/* Your last sign-in, and failed sign-ins in the last 30 days. */}
      <div className={`grid grid-cols-1 gap-3 ${failed > 0 ? 'md:grid-cols-2' : ''}`}>
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-5" aria-label="Your last sign-in">
          <div className="flex items-start gap-3 md:block">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700 ring-1 ring-green-100 md:hidden"><LogIn className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-700"><span className="hidden h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-700 ring-1 ring-green-100 md:inline-flex"><LogIn className="h-4 w-4" /></span>Your last sign-in</p>
              <p className="mt-1 text-xl font-bold text-gray-900 md:mt-3 md:text-3xl">{summary?.lastSignIn ? whenText(summary.lastSignIn) : loading ? '…' : 'No sign-in yet'}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                {summary?.lastSignIn && <span className="hidden md:inline">{longDay(dateOnlyToday(new Date(summary.lastSignIn)))}</span>}
                {summary?.lastSignInDevice && <span className="inline-flex items-center gap-1"><Monitor className="h-4 w-4" />{summary.lastSignInDevice}</span>}
              </p>
            </div>
          </div>
        </section>

        {failed > 0 && (
          <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 sm:p-5" aria-label="Failed sign-in attempts">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-gray-800"><span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-orange-800 ring-1 ring-orange-200"><ShieldAlert className="h-4 w-4" /></span>Failed sign-in attempts</p>
                <p className="mt-2 flex items-baseline gap-2"><span className="text-3xl font-bold text-gray-900">{failed}</span><span className="text-sm font-semibold text-gray-700">in the last 30 days</span></p>
                <p className="mt-1 text-sm text-gray-700">Someone tried to sign in to your account and failed. If it wasn&apos;t you, change your password now.</p>
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 lg:w-48 lg:grid-cols-1">
                {onChangePassword && (
                  <button type="button" onClick={onChangePassword} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#7c2d12] px-3 text-sm font-semibold text-white hover:bg-[#6b260f]"><Lock className="h-4 w-4" />Change password</button>
                )}
                <button type="button" onClick={() => setView('failed')} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-orange-300 bg-white px-3 text-sm font-semibold text-gray-800 hover:bg-orange-100">See the {failed} {failed === 1 ? 'attempt' : 'attempts'}</button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Search, dates and the quick views. */}
      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-[var(--shadow-card)] sm:p-4" aria-label="Find activity">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search activity</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Search, like "password" or "loan payment"' className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
          </label>
          <label className="relative hidden sm:block">
            <span className="sr-only">Date</span>
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <select value={range} onChange={(event) => setRange(event.target.value as DateRange)} className="h-11 appearance-none rounded-xl border border-gray-300 bg-white pl-9 pr-9 text-sm font-semibold text-gray-800">
              {RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-gray-600 sm:inline">Show</span>
          <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-0.5 sm:flex-wrap sm:overflow-visible" role="group" aria-label="Show">{views.map(chip)}</div>
        </div>
        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-2 sm:max-w-md">
            <label className="text-xs font-medium text-gray-600">From<input type="date" value={custom.from} max={custom.to || today} onChange={(event) => setCustom({ ...custom, from: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-gray-300 px-2 text-sm" /></label>
            <label className="text-xs font-medium text-gray-600">To<input type="date" value={custom.to} min={custom.from || undefined} max={today} onChange={(event) => setCustom({ ...custom, to: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-gray-300 px-2 text-sm" /></label>
          </div>
        )}
      </section>

      {/* The entries, grouped by day. */}
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-label="Activity">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 sm:px-5">
          <h3 className="hidden font-bold text-gray-900 sm:block">{viewLabel}</h3>
          {/* Phones: the date list sits here, beside the count. */}
          <label className="relative sm:hidden">
            <span className="sr-only">Date</span>
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <select value={range} onChange={(event) => setRange(event.target.value as DateRange)} className="h-9 appearance-none rounded-xl border border-gray-300 bg-white pl-8 pr-7 text-sm font-semibold text-gray-800">
              {RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          </label>
          <p className="text-sm text-gray-500">{total} {total === 1 ? 'entry' : 'entries'}</p>
        </div>

        {loading && !entries.length ? <ListSkeleton rows={5} />
          : error ? <p className="p-6 text-sm text-red-700">{error}</p>
            : !entries.length ? <EmptyState icon={History} title={filtered ? 'No activity matches' : 'No activity yet'} message={filtered ? 'Try another view, search or date.' : 'Your sign-ins and account activity will appear here.'} />
              : (
                <div className={loading ? 'opacity-60' : ''}>
                  {groups.map((group) => (
                    <div key={group.key}>
                      <p className="border-b border-gray-100 bg-[#f4f6f1] px-4 py-2 text-sm font-semibold text-gray-900 sm:px-5">
                        {group.title}
                        {group.detail && <span className="ml-2 text-xs font-normal text-gray-500"><span className="sm:hidden">{group.detailShort}</span><span className="hidden sm:inline">{group.detail}</span></span>}
                      </p>
                      <ul className="divide-y divide-gray-100">
                        {group.items.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
                      </ul>
                    </div>
                  ))}
                  {entries.length < total && (
                    <div className="flex justify-center border-t border-gray-100 p-4">
                      <button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading} className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60 sm:w-auto">
                        {loading ? 'Loading…' : 'Show older activity'}
                      </button>
                    </div>
                  )}
                </div>
              )}
      </section>
    </div>
  );
}

function EntryRow({ entry }: { entry: ActivityEntry }) {
  const Icon = iconFor(entry);
  const failed = entry.status === 'failed';
  const mine = entry.actor === 'you';
  const day = dateOnlyToday(new Date(entry.at));
  const recent = day === dateOnlyToday() || day === addDateOnlyDays(dateOnlyToday(), -1);
  // Today and yesterday show the time; older entries their date.
  const when = recent ? formatTime(entry.at) : formatDate(day);
  const whenShort = recent ? formatTime(entry.at) : formatDate(day, true).replace(/,\s*\d{4}$/, '');
  const tone = failed ? 'bg-red-50 text-red-600 ring-red-100' : mine ? 'bg-green-50 text-green-700 ring-green-100' : 'bg-blue-50 text-blue-700 ring-blue-100';
  const badge = failed
    ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Failed</span>
    : mine ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">You</span>
      : <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 ring-1 ring-blue-100">ACIFAC office</span>;
  const device = entry.device && <span className="inline-flex items-center gap-1"><Monitor className="h-3.5 w-3.5" />{entry.device}</span>;
  const ip = entry.ipAddress && <span>IP {entry.ipAddress}</span>;
  const amount = entry.amount !== null && entry.amount !== undefined && <span className="font-bold tabular-nums text-gray-900">{peso(entry.amount)}</span>;

  return (
    <li className="flex gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
      <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">{entry.label}<span className="hidden sm:inline">{badge}</span></p>
          {/* Phones: the time or date on the right; larger screens: the amount. */}
          <span className="shrink-0 text-sm font-semibold text-gray-700 sm:hidden">{whenShort}</span>
          {amount && <span className="hidden shrink-0 text-base sm:inline">{amount}</span>}
        </div>
        {entry.description && <p className="mt-0.5 break-words text-sm text-gray-600">{entry.description}</p>}
        {entry.changes.length > 0 && <p className="mt-0.5 text-sm text-gray-600">Changed: {entry.changes.join(', ')}</p>}
        <p className="mt-1 hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 sm:flex">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{when}</span>{device}{ip}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 sm:hidden">{badge}{amount}{device}{ip}</p>
      </div>
    </li>
  );
}
