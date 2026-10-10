import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, LoaderCircle, RotateCcw, Save, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { EmptyState, Pagination } from '../../../app/components/common/UiKit';
import { AttendanceBadge, FIELD, FIELD_BOX } from '../../../app/components/attendance/shared';
import {
  ATTENDANCE_STATUSES, fetchActivityMembers, formatClock, isAttended, saveAttendance,
  type ActivityDetails, type ActivityMemberRow, type AttendanceStatus,
} from '../../../app/services/attendanceApi';

type Filter = AttendanceStatus | 'all' | 'unmarked';
interface Draft { status: AttendanceStatus; checkInTime: string; remarks: string }

const STATUS_BUTTON: Record<AttendanceStatus, string> = {
  present: 'bg-green-600 text-white shadow-sm',
  late: 'bg-amber-500 text-white shadow-sm',
  absent: 'bg-red-600 text-white shadow-sm',
  excused: 'bg-sky-600 text-white shadow-sm',
};
const MEMBER_STATUS: Record<string, string> = { inactive: 'Inactive', suspended: 'Suspended', archived: 'Terminated' };

const savedDraft = (row: ActivityMemberRow): Draft | null => (row.status ? { status: row.status, checkInTime: row.checkInTime ?? '', remarks: row.remarks ?? '' } : null);
const sameDraft = (a: Draft, b: Draft) => a.status === b.status && (isAttended(a.status) ? a.checkInTime : '') === (isAttended(b.status) ? b.checkInTime : '') && a.remarks.trim() === b.remarks.trim();

/** The members of an activity with their attendance. When the activity can be
 * recorded, each member is marked Present, Late, Absent or Excused; changes
 * stay on this page (across pages of the list) until Save. Nothing is saved
 * for members nobody marked: they are recorded absent only by Finalize. */
export function AttendanceSheet({ activity, onSaved, onPendingChange, refreshKey }: {
  activity: ActivityDetails;
  onSaved: () => void;
  onPendingChange: (count: number) => void;
  refreshKey: number;
}) {
  const editable = activity.recordable;
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<ActivityMemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [pending, setPending] = useState<Record<number, { row: ActivityMemberRow; draft: Draft }>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const pendingCount = Object.keys(pending).length;

  useEffect(() => { onPendingChange(pendingCount); }, [pendingCount, onPendingChange]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchActivityMembers(activity.id, { search, filter, page, limit: pageSize })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data);
        setTotal(response.pagination.total);
        setTotalPages(Math.max(1, response.pagination.totalPages));
        setError('');
      })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message || 'Unable to load the members.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activity.id, search, filter, page, pageSize, refreshKey, tick]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  useLiveRefresh(['activity_attendance', 'members'], reload);

  const current = (row: ActivityMemberRow) => pending[row.memberId]?.draft ?? savedDraft(row);
  const update = (row: ActivityMemberRow, patch: Partial<Draft>) => setPending((previous) => {
    const base = previous[row.memberId]?.draft ?? savedDraft(row);
    if (!base && !patch.status) return previous;
    const draft: Draft = { ...(base ?? { status: patch.status as AttendanceStatus, checkInTime: '', remarks: '' }), ...patch };
    if (!isAttended(draft.status)) draft.checkInTime = '';
    const saved = savedDraft(row);
    const next = { ...previous };
    if (saved && sameDraft(saved, draft)) delete next[row.memberId];
    else next[row.memberId] = { row, draft };
    return next;
  });
  const undo = (memberId: number) => setPending((previous) => {
    const next = { ...previous };
    delete next[memberId];
    return next;
  });
  const unmarkedOnPage = rows.filter((row) => !row.status && !pending[row.memberId]);
  const markPagePresent = () => setPending((previous) => {
    const next = { ...previous };
    for (const row of unmarkedOnPage) next[row.memberId] = { row, draft: { status: 'present', checkInTime: '', remarks: '' } };
    return next;
  });

  const save = async () => {
    if (!pendingCount || saving) return;
    if (activity.final && reason.trim().length < 3) {
      toast.error('Attendance for this activity is final. Give the reason for the correction.');
      return;
    }
    setSaving(true);
    try {
      const changes = Object.values(pending).map(({ row, draft }) => ({
        memberId: row.memberId,
        status: draft.status,
        checkInTime: isAttended(draft.status) && draft.checkInTime ? draft.checkInTime : null,
        remarks: draft.remarks.trim(),
      }));
      const { data } = await saveAttendance(activity.id, changes, activity.final ? reason.trim() : undefined);
      const description = [
        data.added && `${data.added} ${data.added === 1 ? 'member' : 'members'} recorded`,
        data.updated && `${data.updated} ${data.updated === 1 ? 'record' : 'records'} ${activity.final ? 'corrected' : 'changed'}`,
      ].filter(Boolean).join(' · ');
      toast.success('Attendance saved', { description: description || 'Nothing had changed.' });
      setPending({});
      setReason('');
      reload();
      onSaved();
    } catch (saveError) {
      toast.error(errorMessage(saveError, 'Unable to save the attendance.'));
    } finally {
      setSaving(false);
    }
  };

  const filters = useMemo<Array<{ value: Filter; label: string; count: number }>>(() => [
    { value: 'all', label: 'All', count: activity.members },
    { value: 'unmarked', label: 'Not marked', count: activity.unmarked },
    ...ATTENDANCE_STATUSES.map((status) => ({ value: status.value, label: status.label, count: activity[status.value] })),
  ], [activity]);

  return (
    <section id="attendance-sheet" className="scroll-mt-4 rounded-2xl border border-gray-200 bg-white" aria-labelledby="attendance-sheet-title">
      <div className="space-y-3 border-b border-gray-100 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="attendance-sheet-title" className="font-bold text-gray-900">{editable ? 'Record Attendance' : 'Attendance List'}</h3>
            <p className="text-sm text-gray-600">
              {editable ? 'Search a member by name or member ID, then mark them. Only the members you mark are saved.' : 'Members who were members on the activity date, with their attendance.'}
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input id="attendance-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or member ID" aria-label="Search members by name or member ID" className={`${FIELD} pl-9`} />
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Show members">
            {filters.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => { setFilter(option.value); setPage(1); }}
                aria-pressed={filter === option.value}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset ${filter === option.value ? 'bg-green-700 text-white ring-green-700' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}
              >
                {option.label}<span className={`tabular-nums ${filter === option.value ? 'text-green-100' : 'text-gray-500'}`}>{option.count}</span>
              </button>
            ))}
          </div>
          {editable && (
            <button type="button" onClick={markPagePresent} disabled={!unmarkedOnPage.length} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-green-600 px-3 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400">
              <CheckCheck className="h-4 w-4" />Mark {unmarkedOnPage.length || ''} unmarked on this page Present
            </button>
          )}
        </div>
      </div>

      {error ? <p className="p-6 text-sm text-red-600" role="alert">{error}</p>
        : loading && !rows.length ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading members…</p>
          : !rows.length ? <EmptyState icon={Users} title={search || filter !== 'all' ? 'No member matches' : 'No members to list'} message={search || filter !== 'all' ? 'Try another name, member ID or filter.' : 'Members whose membership began on or before the activity date appear here.'} compact />
            : (
              <ul className={`divide-y divide-gray-100 ${loading ? 'opacity-60' : ''}`}>
                {rows.map((row) => {
                  const value = current(row);
                  const changed = Boolean(pending[row.memberId]);
                  return (
                    <li key={row.memberId} className={`px-4 py-3 ${changed ? 'bg-amber-50/70' : ''}`}>
                      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_minmax(0,18rem)] lg:items-center">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900">{row.name}</p>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                            <span>{row.memberNumber || `Member #${row.memberId}`}</span>
                            {MEMBER_STATUS[row.memberStatus] && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600" title="Not recorded absent automatically when the attendance is finalized">{MEMBER_STATUS[row.memberStatus]}</span>}
                            {changed ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-800">Unsaved
                                <button type="button" onClick={() => undo(row.memberId)} className="inline-flex items-center gap-0.5 rounded px-1 text-amber-900 underline-offset-2 hover:underline" aria-label={`Undo the change for ${row.name}`}><RotateCcw className="h-3 w-3" />Undo</button>
                              </span>
                            ) : row.source === 'finalization' ? <span>Not marked; recorded absent at finalization</span>
                              : row.recordedBy ? <span>Saved by {row.recordedBy}</span> : null}
                          </p>
                        </div>
                        {editable ? (
                          <div className="grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1" role="group" aria-label={`Attendance of ${row.name}`}>
                            {ATTENDANCE_STATUSES.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => update(row, { status: option.value })}
                                aria-pressed={value?.status === option.value}
                                className={`min-h-9 rounded-lg px-1 text-xs font-semibold transition-colors ${value?.status === option.value ? STATUS_BUTTON[option.value] : 'text-gray-700 hover:bg-white'}`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div>{value ? <AttendanceBadge status={value.status} /> : <span className="text-sm text-gray-400">Not marked</span>}</div>
                        )}
                        {editable ? (
                          // Phones show the inputs once the member is marked, so unmarked rows stay short.
                          <div className={`gap-2 ${value ? 'flex' : 'hidden lg:flex'}`}>
                            {value && isAttended(value.status) && (
                              <input type="time" value={value.checkInTime} onChange={(event) => update(row, { checkInTime: event.target.value })} aria-label={`Check-in time of ${row.name}`} title="Check-in time (optional)" className={`${FIELD_BOX} w-[7.5rem] shrink-0 px-2`} />
                            )}
                            <input
                              value={value?.remarks ?? ''}
                              onChange={(event) => update(row, { remarks: event.target.value })}
                              disabled={!value}
                              maxLength={500}
                              placeholder={value ? 'Remarks (optional)' : 'Mark first, then add remarks'}
                              aria-label={`Remarks for ${row.name}`}
                              className={`${FIELD} min-w-0`}
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">
                            {value?.checkInTime && <>Checked in {formatClock(value.checkInTime)}{value.remarks ? ' · ' : ''}</>}
                            {value?.remarks}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="members" />

      {editable && (
        // On phones the bar only shows while there is something to save.
        <div className={`sticky bottom-0 z-10 space-y-2 rounded-b-2xl border-t border-gray-200 bg-white/95 p-3 backdrop-blur sm:block sm:p-4 ${pendingCount ? '' : 'hidden'}`}>
          {activity.final && pendingCount > 0 && (
            <label className="block text-sm font-medium text-gray-700">
              Reason for the correction <span className="text-red-600" aria-hidden="true">*</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="e.g. Checked against the signed logbook" className={`${FIELD} mt-1`} />
            </label>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600" aria-live="polite">
              {pendingCount ? <><span className="font-semibold text-amber-800">{pendingCount} unsaved {pendingCount === 1 ? 'change' : 'changes'}</span>{activity.final ? ' · attendance is final, so the reason is kept with each correction' : ''}</> : 'All changes are saved.'}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={() => { setPending({}); setReason(''); }} disabled={!pendingCount || saving} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50">Discard</button>
              <button type="button" onClick={() => { void save(); }} disabled={!pendingCount || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
