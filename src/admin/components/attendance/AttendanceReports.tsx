import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, Download, FileBarChart, LoaderCircle, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { EmptyState, Pagination } from '../../../app/components/common/UiKit';
import { AttendanceBadge, downloadCsv, FIELD, RATE_RULE } from '../../../app/components/attendance/shared';
import { ParticipationProfile } from '../../../app/components/attendance/ParticipationProfile';
import {
  ACTIVITY_CATEGORIES, ATTENDANCE_LABELS, ATTENDANCE_STATUSES, CATEGORY_LABELS, fetchAttendanceRecords, fetchParticipationReport, formatClock, rateLabel,
  type ActivityCategory, type AttendanceRecord, type AttendanceStatus, type ParticipationCounts, type ParticipationRow,
} from '../../../app/services/attendanceApi';

interface ReportFilters { member: string; category: ActivityCategory | ''; status: AttendanceStatus | ''; from: string; to: string }
const NO_FILTERS: ReportFilters = { member: '', category: '', status: '', from: '', to: '' };

// Filters shared by the history and the participation report. The member
// search is applied after a short pause in typing.
function useReportFilters() {
  const [filters, setFilters] = useState<ReportFilters>(NO_FILTERS);
  const [memberInput, setMemberInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    const timer = window.setTimeout(() => { setFilters((current) => (current.member === memberInput.trim() ? current : { ...current, member: memberInput.trim() })); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [memberInput]);
  const set = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const clear = () => { setFilters(NO_FILTERS); setMemberInput(''); setPage(1); };
  const active = Object.values(filters).some(Boolean);
  return { filters, set, clear, active, memberInput, setMemberInput, page, setPage, pageSize, setPageSize };
}

function FilterBar({ state, statusLabel, children }: { state: ReturnType<typeof useReportFilters>; statusLabel: string; children?: ReactNode }) {
  const { filters, set } = state;
  const invalidPeriod = Boolean(filters.from && filters.to && filters.from > filters.to);
  return (
    <div className="space-y-2 border-b border-gray-100 p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <label className="col-span-2 text-xs font-semibold text-gray-600 lg:col-span-1">Member
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={state.memberInput} onChange={(event) => state.setMemberInput(event.target.value)} placeholder="Name or member ID" className={`${FIELD} pl-9`} />
          </span>
        </label>
        <label className="text-xs font-semibold text-gray-600">Category
          <select value={filters.category} onChange={(event) => set('category', event.target.value as ActivityCategory | '')} className={`${FIELD} mt-1`}>
            <option value="">All categories</option>
            {ACTIVITY_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">{statusLabel}
          <select value={filters.status} onChange={(event) => set('status', event.target.value as AttendanceStatus | '')} className={`${FIELD} mt-1`}>
            <option value="">Any status</option>
            {ATTENDANCE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-600">From
          <input type="date" value={filters.from} onChange={(event) => set('from', event.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-gray-600">To
          <input type="date" value={filters.to} onChange={(event) => set('to', event.target.value)} className={`${FIELD} mt-1`} />
        </label>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          {state.active && <button type="button" onClick={state.clear} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold text-gray-600 hover:bg-gray-100"><X className="h-4 w-4" />Clear</button>}
          {children}
        </div>
      </div>
      {invalidPeriod && <p className="text-xs font-medium text-red-600" role="alert">The "From" date must not be after the "To" date.</p>}
    </div>
  );
}

const exportButton = (exporting: boolean, disabled: boolean, onClick: () => void) => (
  <button type="button" onClick={onClick} disabled={exporting || disabled} className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-green-600 px-3 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50">
    {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export CSV
  </button>
);

const periodName = (filters: ReportFilters) => `${filters.from || 'start'}-to-${filters.to || dateOnlyToday()}`;

/** Every attendance record of activities that were not cancelled, newest first. */
export function AttendanceHistory({ onOpenActivity, onOpenMember }: { onOpenActivity: (id: number) => void; onOpenMember: (id: number) => void }) {
  const state = useReportFilters();
  const { filters, page, pageSize } = state;
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<Record<AttendanceStatus | 'total', number> | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const invalidPeriod = Boolean(filters.from && filters.to && filters.from > filters.to);

  useEffect(() => {
    if (invalidPeriod) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchAttendanceRecords({ ...filters, page, limit: pageSize })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data);
        setSummary(response.summary);
        setTotalPages(Math.max(1, response.pagination.totalPages));
        setError('');
      })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message || 'Unable to load the attendance history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, page, pageSize, tick, invalidPeriod]);
  useLiveRefresh(['activities', 'activity_attendance'], useCallback(() => setTick((value) => value + 1), []));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data } = await fetchAttendanceRecords({ ...filters, all: true });
      downloadCsv(`acifac-attendance-records-${periodName(filters)}.csv`, [
        ['Activity Date', 'Start Time', 'Activity', 'Category', 'Venue', 'Member ID', 'Member Name', 'Attendance', 'Check-in Time', 'Remarks', 'Attendance Final', 'Recorded By'],
        ...data.map((row) => [row.activityDate, formatClock(row.startTime), row.title, row.categoryLabel, row.venue, row.memberNumber, row.memberName, ATTENDANCE_LABELS[row.status],
          row.checkInTime ? formatClock(row.checkInTime) : '', row.remarks, row.final ? 'Yes' : 'No', row.source === 'finalization' ? 'Finalization (not marked)' : row.recordedBy]),
      ]);
      toast.success('Attendance history exported', { description: `${data.length} ${data.length === 1 ? 'record' : 'records'}` });
    } catch (exportError) {
      toast.error(errorMessage(exportError, 'Unable to export the attendance history.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-labelledby="attendance-history-title">
      <div className="border-b border-gray-100 px-4 pt-4">
        <h2 id="attendance-history-title" className="text-lg font-bold text-gray-900">Attendance History</h2>
        <p className="pb-1 text-sm text-gray-600">Every attendance record of activities that were not cancelled. Filter by member, category, status or activity date.</p>
      </div>
      <FilterBar state={state} statusLabel="Attendance status">{exportButton(exporting, !summary?.total, () => { void exportCsv(); })}</FilterBar>
      {summary && (
        <p className="flex flex-wrap gap-2 px-4 pt-3 text-xs">
          {ATTENDANCE_STATUSES.map((status) => <span key={status.value} className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-700">{status.label} <span className="tabular-nums">{summary[status.value]}</span></span>)}
          <span className="rounded-full bg-green-50 px-2.5 py-1 font-semibold text-green-800 ring-1 ring-green-100">Total <span className="tabular-nums">{summary.total}</span></span>
        </p>
      )}
      {error ? <p className="p-6 text-sm text-red-600" role="alert">{error}</p>
        : loading && !rows.length ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the history…</p>
          : !rows.length ? <EmptyState icon={ClipboardList} title={state.active ? 'No record matches these filters' : 'No attendance recorded yet'} message={state.active ? 'Try other filters or clear them.' : 'Records appear here after attendance is saved for an activity.'} compact />
            : (
              <div className={loading ? 'opacity-60' : ''}>
                <ul className="mt-2 divide-y divide-gray-100 md:hidden">
                  {rows.map((row) => (
                    <li key={row.id} className="space-y-1 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => onOpenMember(row.memberId)} className="min-w-0 text-left">
                          <p className="font-semibold text-gray-900">{row.memberName}</p>
                          <p className="text-xs text-gray-500">{row.memberNumber}</p>
                        </button>
                        <AttendanceBadge status={row.status} />
                      </div>
                      <button type="button" onClick={() => onOpenActivity(row.activityId)} className="text-left text-sm text-green-800 hover:underline">{row.title}</button>
                      <p className="text-xs text-gray-500">{formatDate(row.activityDate, true)} · {row.categoryLabel}{!row.final && <span className="font-medium text-amber-700"> · Not final</span>}</p>
                      {(row.checkInTime || row.remarks) && <p className="text-xs text-gray-600">{row.checkInTime ? `Checked in ${formatClock(row.checkInTime)}. ` : ''}{row.remarks}</p>}
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto md:block">
                  <table className="mt-2 w-full min-w-[960px] text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                      <tr>{['Date', 'Activity', 'Member', 'Attendance', 'Check-in', 'Remarks', 'Recorded By'].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row) => (
                        <tr key={row.id} className="align-top hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(row.activityDate, true)}</td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => onOpenActivity(row.activityId)} className="text-left font-medium text-gray-900 hover:text-green-800 hover:underline">{row.title}</button>
                            <p className="text-xs text-gray-500">{row.categoryLabel}{!row.final && <span className="font-medium text-amber-700"> · Not final</span>}</p>
                          </td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => onOpenMember(row.memberId)} className="text-left font-medium text-gray-900 hover:text-green-800 hover:underline">{row.memberName}</button>
                            <p className="text-xs text-gray-500">{row.memberNumber}</p>
                          </td>
                          <td className="px-4 py-3"><AttendanceBadge status={row.status} /></td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.checkInTime ? formatClock(row.checkInTime) : ''}</td>
                          <td className="px-4 py-3 text-gray-600">{row.remarks || ''}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{row.source === 'finalization' ? 'Not marked; absent at finalization' : row.recordedBy ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
      <Pagination page={page} totalPages={totalPages} total={summary?.total ?? 0} pageSize={pageSize} onPageChange={state.setPage} onPageSizeChange={(size) => { state.setPageSize(size); state.setPage(1); }} label="records" />
    </section>
  );
}

/** Each member's participation: eligible activities, each status, attended
 * and the attendance rate, counting completed activities with final attendance. */
export function ParticipationReport({ onOpenMember }: { onOpenMember: (id: number) => void }) {
  const state = useReportFilters();
  const { filters, page, pageSize } = state;
  const [sort, setSort] = useState<'name' | 'rate'>('name');
  const [rows, setRows] = useState<ParticipationRow[]>([]);
  const [summary, setSummary] = useState<(ParticipationCounts & { members: number; activities: number }) | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const invalidPeriod = Boolean(filters.from && filters.to && filters.from > filters.to);

  useEffect(() => {
    if (invalidPeriod) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchParticipationReport({ ...filters, sort, page, limit: pageSize })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data);
        setSummary(response.summary);
        setTotalPages(Math.max(1, response.pagination.totalPages));
        setError('');
      })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message || 'Unable to load the participation report.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, sort, page, pageSize, tick, invalidPeriod]);
  useLiveRefresh(['activities', 'activity_attendance'], useCallback(() => setTick((value) => value + 1), []));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data, summary: totals } = await fetchParticipationReport({ ...filters, sort, all: true });
      downloadCsv(`acifac-participation-report-${filters.category || 'all-categories'}-${periodName(filters)}.csv`, [
        ['Member ID', 'Member Name', 'Eligible Activities', 'Present', 'Late', 'Excused', 'Absent', 'Attended', 'Attendance Rate (%)', 'Last Attended'],
        ...data.map((row) => [row.memberNumber, row.name, row.eligible, row.present, row.late, row.excused, row.absent, row.attended, row.rate ?? 'N/A', row.lastAttended ?? '']),
        ['', `Total (${totals.members} ${totals.members === 1 ? 'member' : 'members'}, ${totals.activities} ${totals.activities === 1 ? 'activity' : 'activities'} counted)`, totals.eligible, totals.present, totals.late, totals.excused, totals.absent, totals.attended, totals.rate ?? 'N/A', ''],
        [],
        ['', `Category: ${filters.category ? CATEGORY_LABELS[filters.category] : 'All'}; activity dates: ${filters.from || 'start'} to ${filters.to || 'today'}${filters.status ? `; members with at least one ${ATTENDANCE_LABELS[filters.status].toLowerCase()}` : ''}`],
        ['', RATE_RULE],
      ]);
      toast.success('Participation report exported', { description: `${data.length} ${data.length === 1 ? 'member' : 'members'}` });
    } catch (exportError) {
      toast.error(errorMessage(exportError, 'Unable to export the participation report.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-labelledby="participation-report-title">
      <div className="flex flex-col gap-2 border-b border-gray-100 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="participation-report-title" className="text-lg font-bold text-gray-900">Member Participation Report</h2>
          <p className="pb-1 text-sm text-gray-600">Activity counts and attendance percentage of each member. Select a member to see their full attendance.</p>
        </div>
        <label className="pb-2 text-xs font-semibold text-gray-600">Sort
          <select value={sort} onChange={(event) => { setSort(event.target.value as 'name' | 'rate'); state.setPage(1); }} className={`${FIELD} mt-1 sm:w-48`}>
            <option value="name">By name</option>
            <option value="rate">Lowest attendance first</option>
          </select>
        </label>
      </div>
      <FilterBar state={state} statusLabel="Members with a record of">{exportButton(exporting, !summary?.members, () => { void exportCsv(); })}</FilterBar>
      {summary && (
        <div className="grid grid-cols-2 gap-2 px-4 pt-3 sm:grid-cols-4">
          {[
            ['Members', String(summary.members)],
            ['Activities counted', String(summary.activities)],
            ['Attended / eligible', `${summary.attended} / ${summary.eligible}`],
            ['Overall rate', rateLabel(summary.rate)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-inset ring-gray-100">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
            </div>
          ))}
        </div>
      )}
      {error ? <p className="p-6 text-sm text-red-600" role="alert">{error}</p>
        : loading && !rows.length ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the report…</p>
          : !rows.length ? <EmptyState icon={FileBarChart} title={state.active ? 'No member matches these filters' : 'No finalized activity yet'} message={state.active ? 'Try other filters or clear them.' : 'The report counts completed activities whose attendance is final.'} compact />
            : (
              <div className={loading ? 'opacity-60' : ''}>
                <ul className="mt-2 divide-y divide-gray-100 md:hidden">
                  {rows.map((row) => (
                    <li key={row.memberId}>
                      <button type="button" onClick={() => onOpenMember(row.memberId)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-green-50/40">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-gray-900">{row.name}</p>
                          <p className="text-xs text-gray-500">{row.memberNumber} · {row.attended} of {row.eligible} attended · {row.excused} excused · {row.absent} absent</p>
                        </div>
                        <p className="text-right text-lg font-bold tabular-nums text-green-800">{rateLabel(row.rate)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto md:block">
                  <table className="mt-2 w-full min-w-[920px] text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        {['Member', 'Eligible', 'Present', 'Late', 'Excused', 'Absent', 'Attended', 'Rate', 'Last Attended'].map((heading, index) => (
                          <th key={heading} className={`px-4 py-3 font-medium ${index === 0 || index === 8 ? 'text-left' : 'text-right'}`}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row) => (
                        <tr key={row.memberId} onClick={() => onOpenMember(row.memberId)} className="cursor-pointer hover:bg-green-50/40">
                          <td className="px-4 py-3"><p className="font-medium text-gray-900">{row.name}</p><p className="text-xs text-gray-500">{row.memberNumber}{row.memberStatus !== 'active' ? ` · ${row.memberStatus === 'archived' ? 'terminated' : row.memberStatus}` : ''}</p></td>
                          {[row.eligible, row.present, row.late, row.excused, row.absent, row.attended].map((value, index) => <td key={index} className="px-4 py-3 text-right tabular-nums text-gray-700">{value}</td>)}
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{rateLabel(row.rate)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.lastAttended ? formatDate(row.lastAttended, true) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
      <Pagination page={page} totalPages={totalPages} total={summary?.members ?? 0} pageSize={pageSize} onPageChange={state.setPage} onPageSizeChange={(size) => { state.setPageSize(size); state.setPage(1); }} label="members" />
      <p className="px-4 pb-4 pt-2 text-xs text-gray-500">{RATE_RULE}</p>
    </section>
  );
}

/** A member's participation, opened from the history or the report. */
export function MemberParticipationModal({ memberId, onClose }: { memberId: number; onClose: () => void }) {
  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-label="Member attendance"
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <p className="font-semibold text-gray-900">Member Attendance</p>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close member attendance"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-3 sm:p-5">
          <ParticipationProfile memberId={memberId} variant="office" showMember />
        </div>
      </div>
    </div>
  );
}
