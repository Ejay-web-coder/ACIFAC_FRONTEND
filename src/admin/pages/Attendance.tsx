import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CalendarCheck, CalendarClock, CalendarDays, CalendarPlus, ClipboardCheck, ClipboardList, FileBarChart, History, LoaderCircle, MapPin, Percent, Search, Users, X,
} from 'lucide-react';
import { UserRole } from '../../app/App';
import { EmptyState, Pagination, StatCard } from '../../app/components/common/UiKit';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { formatDate } from '../../utils/dateTime';
import { ActivityStatusBadge, FIELD, RATE_RULE } from '../../app/components/attendance/shared';
import {
  ACTIVITY_CATEGORIES, fetchActivities, fetchAttendanceDashboard, rateLabel, timeRange,
  type Activity, type ActivityCategory, type ActivityStatus, type AttendanceDashboardSummary,
} from '../../app/services/attendanceApi';
import type { Pagination as PageInfo } from '../../app/services/authApi';
import { ActivityFormModal } from '../components/attendance/ActivityFormModal';
import { ActivityModal } from '../components/attendance/ActivityModal';
import { AttendanceHistory, MemberParticipationModal, ParticipationReport } from '../components/attendance/AttendanceReports';

type Section = 'activities' | 'history' | 'reports';
const SECTIONS: Array<{ key: Section; label: string; icon: typeof CalendarCheck }> = [
  { key: 'activities', label: 'Activities', icon: CalendarCheck },
  { key: 'history', label: 'Attendance History', icon: History },
  { key: 'reports', label: 'Participation Report', icon: FileBarChart },
];
type StatusFilter = ActivityStatus | 'needs_finalizing' | '';
interface Filters { from: string; to: string; category: ActivityCategory | ''; status: StatusFilter; search: string }
const NO_FILTERS: Filters = { from: '', to: '', category: '', status: '', search: '' };

// How many came, as the table and the phone cards show it.
function attendanceSummary(activity: Activity) {
  if (activity.status === 'cancelled') return { main: 'Not counted', detail: activity.recorded ? `${activity.recorded} records kept` : '' };
  if (activity.final) return { main: `${activity.attended} of ${activity.recorded} attended`, detail: `${rateLabel(activity.rate)} attendance` };
  if (activity.recorded) return { main: `${activity.attended} attended`, detail: `${activity.recorded} marked · not final` };
  return { main: 'Not recorded yet', detail: '' };
}

export function Attendance({ userRole }: { userRole: UserRole }) {
  const [section, setSection] = useState<Section>('activities');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [summary, setSummary] = useState<AttendanceDashboardSummary | null>(null);
  const [upcoming, setUpcoming] = useState<Activity[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [openActivity, setOpenActivity] = useState<{ id: number; record: boolean } | null>(null);
  const [openMember, setOpenMember] = useState<number | null>(null);
  const invalidPeriod = Boolean(filters.from && filters.to && filters.from > filters.to);

  useEffect(() => {
    const timer = window.setTimeout(() => { setFilters((current) => (current.search === searchInput.trim() ? current : { ...current, search: searchInput.trim() })); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // The cards and upcoming activities follow the period and category; the table also follows status and search.
  useEffect(() => {
    if (invalidPeriod) return undefined;
    let cancelled = false;
    fetchAttendanceDashboard({ from: filters.from, to: filters.to, category: filters.category })
      .then((response) => { if (!cancelled) { setSummary(response.data.summary); setUpcoming(response.data.upcoming); } })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message || 'Unable to load the attendance dashboard.'); });
    return () => { cancelled = true; };
  }, [filters.from, filters.to, filters.category, tick, invalidPeriod]);

  useEffect(() => {
    if (invalidPeriod) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchActivities({ ...filters, page, limit: pageSize })
      .then((response) => {
        if (cancelled) return;
        setActivities(response.data);
        setPageInfo(response.pagination);
        setToday(response.today);
        setError('');
      })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message || 'Unable to load the activities.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, page, pageSize, tick, invalidPeriod]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  useLiveRefresh(['activities', 'activity_attendance'], reload);

  if (userRole !== 'admin') return <div className="p-8">Access restricted to administrators only</div>;

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const filtered = Object.values(filters).some(Boolean);
  const canRecord = (activity: Activity) => activity.status !== 'cancelled' && Boolean(today) && activity.activityDate <= today;
  const open = (activity: Activity, record = false) => setOpenActivity({ id: activity.id, record });

  const cards = [
    { label: 'Scheduled Activities', value: summary?.scheduled, icon: CalendarClock, detail: 'not held yet' },
    { label: 'Completed Activities', value: summary?.completed, icon: CalendarCheck, detail: summary ? `${summary.ratedActivities} with final attendance` : undefined },
    { label: 'Attendance Entries', value: summary?.attendanceEntries, icon: ClipboardCheck, detail: 'records saved' },
    { label: 'Members Participated', value: summary?.membersParticipated, icon: Users, detail: 'present or late at least once' },
    { label: 'Average Attendance Rate', value: summary ? rateLabel(summary.averageRate) : undefined, icon: Percent, detail: 'of activities with final attendance', tone: 'dark' as const },
    { label: 'Upcoming Activities', value: summary?.upcoming, icon: CalendarDays, detail: 'scheduled from today' },
  ];

  const actionButtons = (activity: Activity) => (
    <div className="flex items-center justify-end gap-1.5">
      {canRecord(activity) && (
        <button type="button" onClick={(event) => { event.stopPropagation(); open(activity, true); }} className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700" aria-label={`Record attendance for ${activity.title}`}>
          <ClipboardList className="h-3.5 w-3.5" />{activity.final ? 'Correct' : 'Record'}
        </button>
      )}
      <button type="button" onClick={(event) => { event.stopPropagation(); open(activity); }} className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50" aria-label={`Open ${activity.title}`}>Details</button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">Members' attendance at community development, educational and training activities, and meetings</p>
        <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700">
          <CalendarPlus className="h-4 w-4" />Create Activity
        </button>
      </div>

      <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 sm:w-fit" role="tablist" aria-label="Attendance views">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`attendance-tab-${key}`}
            aria-selected={section === key}
            aria-controls={`attendance-panel-${key}`}
            onClick={() => setSection(key)}
            className={`inline-flex min-h-10 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none ${section === key ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* Each panel stays mounted so it keeps its filters and page when switching. */}
      <div role="tabpanel" id="attendance-panel-activities" aria-labelledby="attendance-tab-activities" hidden={section !== 'activities'} className="space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)]" aria-label="Filters">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.4fr)_auto] lg:items-end">
            <label className="text-xs font-semibold text-gray-600">From
              <input type="date" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} className={`${FIELD} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-gray-600">To
              <input type="date" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} className={`${FIELD} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-gray-600">Category
              <select value={filters.category} onChange={(event) => setFilter('category', event.target.value as ActivityCategory | '')} className={`${FIELD} mt-1`}>
                <option value="">All categories</option>
                {ACTIVITY_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-600">Status
              <select value={filters.status} onChange={(event) => setFilter('status', event.target.value as StatusFilter)} className={`${FIELD} mt-1`}>
                <option value="">All statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="needs_finalizing">Attendance not final (past)</option>
              </select>
            </label>
            <label className="col-span-2 text-xs font-semibold text-gray-600 lg:col-span-1">Search
              <span className="relative mt-1 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Title, venue or organizer" className={`${FIELD} pl-9`} />
              </span>
            </label>
            {filtered && (
              <button type="button" onClick={() => { setFilters(NO_FILTERS); setSearchInput(''); setPage(1); }} className="col-span-2 inline-flex min-h-10 items-center lg:col-span-1 justify-center gap-1 rounded-xl px-3 text-sm font-semibold text-gray-600 hover:bg-gray-100"><X className="h-4 w-4" />Clear</button>
            )}
          </div>
          {invalidPeriod && <p className="mt-2 text-xs font-medium text-red-600" role="alert">The "From" date must not be after the "To" date.</p>}
          <p className="mt-2 text-xs text-gray-500">The cards below follow the dates and category; the table also follows the status and search.</p>
        </section>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value ?? ''} icon={card.icon} detail={card.detail} tone={card.tone} loading={!summary} />
          ))}
        </div>

        {summary && summary.needsFinalizing > 0 && filters.status !== 'needs_finalizing' && (
          <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between" role="status">
            <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {summary.needsFinalizing} past {summary.needsFinalizing === 1 ? 'activity has' : 'activities have'} attendance that is not final yet, so {summary.needsFinalizing === 1 ? 'it is' : 'they are'} not counted in attendance rates.
            </p>
            <button type="button" onClick={() => setFilter('status', 'needs_finalizing')} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700">Show {summary.needsFinalizing === 1 ? 'it' : 'them'}</button>
          </div>
        )}

        {upcoming.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" className="border-b border-gray-100 px-4 py-3 font-bold text-gray-900">Upcoming Activities</h2>
            <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((activity) => (
                <li key={activity.id}>
                  <button type="button" onClick={() => open(activity)} className="h-full w-full rounded-xl border border-gray-200 p-3 text-left hover:border-green-300 hover:bg-green-50/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700">{activity.categoryLabel}</p>
                    <p className="font-semibold text-gray-900">{activity.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600"><CalendarClock className="h-4 w-4 shrink-0" />{formatDate(activity.activityDate, true)} · {timeRange(activity.startTime, activity.endTime)}</p>
                    <p className="flex items-center gap-1.5 text-sm text-gray-600"><MapPin className="h-4 w-4 shrink-0" />{activity.venue}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-labelledby="activities-title">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 id="activities-title" className="font-bold text-gray-900">Activities</h2>
            <p className="text-sm text-gray-600">Open an activity for its attendance list. Record attendance from the day of the activity, then finalize it.</p>
          </div>
          {loading && !activities.length ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading activities…</p>
            : !activities.length ? (
              <EmptyState
                icon={CalendarCheck}
                title={filtered ? 'No activity matches these filters' : 'No activities yet'}
                message={filtered ? 'Try other filters or clear them.' : 'Create the first meeting, training or community activity to start recording attendance.'}
                action={!filtered && <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"><CalendarPlus className="h-4 w-4" />Create Activity</button>}
              />
            ) : (
              <div className={loading ? 'opacity-60' : ''}>
                {/* Phones: one card per activity */}
                <ul className="divide-y divide-gray-100 lg:hidden">
                  {activities.map((activity) => {
                    const count = attendanceSummary(activity);
                    return (
                      <li key={activity.id} className="space-y-2 px-4 py-3">
                        <button type="button" onClick={() => open(activity)} className="block w-full text-left">
                          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">{activity.categoryLabel}</p>
                          <p className="font-semibold text-gray-900">{activity.title}</p>
                          <p className="text-sm text-gray-600">{formatDate(activity.activityDate, true)} · {timeRange(activity.startTime, activity.endTime)}</p>
                          <p className="text-sm text-gray-600">{activity.venue}</p>
                        </button>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <ActivityStatusBadge activity={activity} />
                          <p className="text-sm"><span className="font-semibold text-gray-900">{count.main}</span>{count.detail && <span className="text-gray-500"> · {count.detail}</span>}</p>
                        </div>
                        {actionButtons(activity)}
                      </li>
                    );
                  })}
                </ul>
                {/* Desktops: table */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[1000px] text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr>{['Activity', 'Category', 'Date', 'Venue', 'Attendance', 'Status', ''].map((heading, index) => <th key={heading || index} className="px-4 py-3 font-medium">{heading || <span className="sr-only">Actions</span>}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activities.map((activity) => {
                        const count = attendanceSummary(activity);
                        return (
                          <tr key={activity.id} onClick={() => open(activity)} className="cursor-pointer align-top hover:bg-green-50/40">
                            <td className="px-4 py-3"><p className="font-semibold text-gray-900">{activity.title}</p>{activity.organizer && <p className="text-xs text-gray-500">{activity.organizer}</p>}</td>
                            <td className="px-4 py-3 text-gray-700">{activity.categoryLabel}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(activity.activityDate, true)}<p className="text-xs text-gray-500">{timeRange(activity.startTime, activity.endTime)}</p></td>
                            <td className="px-4 py-3 text-gray-700">{activity.venue}</td>
                            <td className="px-4 py-3"><p className="font-semibold text-gray-900">{count.main}</p>{count.detail && <p className="text-xs text-gray-500">{count.detail}</p>}</td>
                            <td className="px-4 py-3"><ActivityStatusBadge activity={activity} /></td>
                            <td className="px-4 py-3">{actionButtons(activity)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          {pageInfo && <Pagination page={pageInfo.page} totalPages={pageInfo.totalPages} total={pageInfo.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="activities" />}
        </section>
        <p className="text-xs text-gray-500">{RATE_RULE}</p>
      </div>

      <div role="tabpanel" id="attendance-panel-history" aria-labelledby="attendance-tab-history" hidden={section !== 'history'}>
        <AttendanceHistory onOpenActivity={(id) => setOpenActivity({ id, record: false })} onOpenMember={setOpenMember} />
      </div>
      <div role="tabpanel" id="attendance-panel-reports" aria-labelledby="attendance-tab-reports" hidden={section !== 'reports'}>
        <ParticipationReport onOpenMember={setOpenMember} />
      </div>

      {showCreate && (
        <ActivityFormModal activity={null} onClose={() => setShowCreate(false)} onSaved={(activity) => { setShowCreate(false); reload(); setOpenActivity({ id: activity.id, record: false }); }} />
      )}
      {openActivity && <ActivityModal activityId={openActivity.id} startRecording={openActivity.record} onClose={() => setOpenActivity(null)} onChanged={reload} />}
      {openMember !== null && <MemberParticipationModal memberId={openMember} onClose={() => setOpenMember(null)} />}
    </div>
  );
}
