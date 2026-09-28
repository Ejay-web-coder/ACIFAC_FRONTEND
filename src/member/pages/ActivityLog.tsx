import { useEffect, useState, type ComponentType } from 'react';
import { History, LogIn, PhilippinePeso, PiggyBank, Search, ShieldAlert, Tractor, UserRound, X } from 'lucide-react';
import { EmptyState, ListSkeleton, Pagination, SectionCard, StatCard } from '../../app/components/common/UiKit';
import { formatDateTime } from '../../utils/dateTime';
import { errorMessage } from '../../lib/api';
import type { Pagination as PageInfo } from '../../app/services/authApi';
import { fetchMyActivity, type ActivityCategory, type ActivityEntry, type ActivityFilters } from '../services/activityApi';

// The member's own activity log: sign-ins, profile changes, savings, loans and
// machinery rentals, whether done by the member or by the ACIFAC office.

const CATEGORIES: Array<{ value: ActivityCategory; label: string; icon: ComponentType<{ className?: string }> }> = [
  { value: 'security', label: 'Sign-in & security', icon: LogIn },
  { value: 'profile', label: 'Profile & membership', icon: UserRound },
  { value: 'savings', label: 'Savings & share capital', icon: PiggyBank },
  { value: 'loans', label: 'Loans & payments', icon: PhilippinePeso },
  { value: 'machinery', label: 'Machinery rentals', icon: Tractor },
];
const iconFor = (category: ActivityCategory) => CATEGORIES.find((item) => item.value === category)?.icon ?? History;

const EMPTY_FILTERS: Required<Pick<ActivityFilters, 'search' | 'category' | 'actor' | 'status' | 'fromDate' | 'toDate'>> = {
  search: '', category: '', actor: '', status: '', fromDate: '', toDate: '',
};
const field = 'h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/30';

export function ActivityLog() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState(''); // typed text; applied after a short pause
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [summary, setSummary] = useState<{ lastSignIn: string | null; failedSignIns30Days: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => (current.search === search.trim() ? current : { ...current, search: search.trim() })), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Any filter change starts again from page 1.
  useEffect(() => { setPage(1); }, [filters, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMyActivity({ ...filters, page, limit: pageSize })
      .then((response) => {
        if (cancelled) return;
        setEntries(response.data);
        setPageInfo(response.pagination);
        setSummary(response.summary);
        setError('');
      })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Unable to load your activity.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, page, pageSize]);

  const update = (key: keyof typeof EMPTY_FILTERS, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const filtered = Object.values(filters).some(Boolean) || Boolean(search);
  const clear = () => { setSearch(''); setFilters(EMPTY_FILTERS); };
  const dateError = filters.fromDate && filters.toDate && filters.fromDate > filters.toDate;

  return (
    <div className="space-y-4 md:space-y-6">
      <p className="text-sm text-gray-600">Everything that happens on your account: your sign-ins and changes, and what the ACIFAC office recorded for you.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Last sign-in" value={summary?.lastSignIn ? formatDateTime(summary.lastSignIn) : '—'} icon={LogIn} loading={!summary && loading} />
        <StatCard label="Failed sign-in attempts (30 days)" value={summary?.failedSignIns30Days ?? 0} icon={ShieldAlert} tone={summary && summary.failedSignIns30Days > 0 ? 'warning' : 'green'} detail={summary && summary.failedSignIns30Days > 0 ? 'If these were not you, change your password in Settings.' : undefined} loading={!summary && loading} />
        <StatCard label={filtered ? 'Matching entries' : 'Entries'} value={pageInfo?.total ?? 0} icon={History} loading={!pageInfo && loading} />
      </div>

      <SectionCard>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="relative lg:col-span-2">
            <span className="sr-only">Search activity</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity..." className={`${field} pl-9`} />
          </label>
          <select aria-label="Category" value={filters.category} onChange={(event) => update('category', event.target.value)} className={field}>
            <option value="">All activity</option>
            {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select aria-label="Done by" value={filters.actor} onChange={(event) => update('actor', event.target.value)} className={field}>
            <option value="">Everyone</option>
            <option value="me">Only you</option>
            <option value="office">Only the ACIFAC office</option>
          </select>
          <select aria-label="Result" value={filters.status} onChange={(event) => update('status', event.target.value)} className={field}>
            <option value="">All results</option>
            <option value="SUCCESS">Successful</option>
            <option value="FAILED">Failed</option>
          </select>
          <button type="button" onClick={clear} disabled={!filtered} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <X className="h-4 w-4" />Clear filters
          </button>
          <label className="text-xs font-medium text-gray-600 lg:col-span-3">From
            <input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={(event) => update('fromDate', event.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-xs font-medium text-gray-600 lg:col-span-3">To
            <input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={(event) => update('toDate', event.target.value)} className={`${field} mt-1`} />
          </label>
        </div>
        {dateError && <p className="mt-2 text-sm text-red-700">The "From" date must be on or before the "To" date.</p>}
      </SectionCard>

      <SectionCard title="Activity" bodyClassName="p-0">
        {loading && !entries.length ? <ListSkeleton rows={5} />
          : error ? <p className="p-6 text-sm text-red-700">{error}</p>
            : entries.length === 0 ? <EmptyState icon={History} title={filtered ? 'No activity matches these filters' : 'No activity yet'} message={filtered ? 'Try a different category, date range or search.' : 'Your sign-ins and account activity will appear here.'} />
              : (
                <ul className={`divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
                  {entries.map((entry) => {
                    const Icon = iconFor(entry.category);
                    const failed = entry.status === 'failed';
                    return (
                      <li key={entry.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
                        <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${failed ? 'bg-red-50 text-red-600 ring-red-100' : 'bg-green-50 text-green-700 ring-green-100'}`}><Icon className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{entry.label}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.actor === 'you' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{entry.actor === 'you' ? 'You' : 'ACIFAC office'}</span>
                            {failed && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Failed</span>}
                          </div>
                          {entry.description && <p className="mt-0.5 break-words text-sm text-gray-600">{entry.description}</p>}
                          {entry.changes.length > 0 && <p className="mt-0.5 text-sm text-gray-600">Changed: {entry.changes.join(', ')}</p>}
                          <p className="mt-1 text-xs text-gray-500">
                            {formatDateTime(entry.at)}
                            {entry.device && <> · {entry.device}</>}
                            {entry.ipAddress && <> · IP {entry.ipAddress}</>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
        {pageInfo && <Pagination page={pageInfo.page} totalPages={pageInfo.totalPages} total={pageInfo.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} label="entries" />}
      </SectionCard>
    </div>
  );
}
