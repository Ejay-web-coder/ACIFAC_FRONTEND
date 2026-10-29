import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Ban, CalendarClock, ChevronDown, History, LoaderCircle, Lock, MapPin, Pencil, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { formatDate, formatDateTime } from '../../../utils/dateTime';
import { ActivityStatusBadge, AttendanceBadge, FIELD } from '../../../app/components/attendance/shared';
import {
  ATTENDANCE_LABELS, cancelActivity, fetchActivity, fetchActivityHistory, finalizeAttendance, rateLabel, timeRange,
  type ActivityDetails, type ActivityHistoryEntry,
} from '../../../app/services/attendanceApi';
import { ActivityFormModal } from './ActivityFormModal';
import { AttendanceSheet } from './AttendanceSheet';
import { confirmAction } from '../../../app/components/common/ConfirmDialog';

/** One activity: its details and counts, the attendance list (recorded here),
 * Finalize, Edit and Cancel, and the history of changes. */
export function ActivityModal({ activityId, startRecording = false, onClose, onChanged }: {
  activityId: number;
  /** Opened with "Record Attendance": scroll to the member list. */
  startRecording?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [details, setDetails] = useState<ActivityDetails | null>(null);
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [sheetKey, setSheetKey] = useState(0);
  const [dialog, setDialog] = useState<'edit' | 'finalize' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ActivityHistoryEntry[] | null>(null);

  const load = useCallback(() => {
    fetchActivity(activityId)
      .then((response) => { setDetails(response.data); setError(''); })
      .catch((reason: Error) => setError(reason.message || 'Unable to load the activity.'));
  }, [activityId]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['activities', 'activity_attendance'], load);

  const loadHistory = useCallback(() => {
    fetchActivityHistory(activityId).then((response) => setHistory(response.data)).catch(() => setHistory([]));
  }, [activityId]);
  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory, sheetKey, details?.updatedAt]);

  // "Record Attendance" opens straight at the member list.
  const loaded = Boolean(details);
  useEffect(() => {
    if (!startRecording || !loaded) return;
    window.requestAnimationFrame(() => {
      document.getElementById('attendance-sheet')?.scrollIntoView({ block: 'start' });
      document.getElementById('attendance-search')?.focus({ preventScroll: true });
    });
  }, [startRecording, loaded]);

  const afterChange = () => { load(); setSheetKey((key) => key + 1); onChanged(); };
  const requestClose = async () => {
    if (pendingCount && !(await confirmAction(`Close without saving? ${pendingCount} attendance ${pendingCount === 1 ? 'change is' : 'changes are'} not saved yet.`, { confirmLabel: 'Close without saving', danger: true }))) return;
    onClose();
  };

  const finalize = async () => {
    if (!details || busy) return;
    setBusy(true);
    try {
      const { data } = await finalizeAttendance(details.id);
      toast.success('Attendance finalized', { description: `${data.markedAbsent} unmarked ${data.markedAbsent === 1 ? 'member was' : 'members were'} recorded absent. The activity is completed.` });
      setDialog(null);
      afterChange();
    } catch (finalizeError) {
      toast.error(errorMessage(finalizeError, 'Unable to finalize the attendance.'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!details || busy) return;
    if (cancelReason.trim().length < 3) { toast.error('Give the reason the activity is cancelled.'); return; }
    setBusy(true);
    try {
      await cancelActivity(details.id, cancelReason.trim());
      toast.success('Activity cancelled', { description: `${details.title} is no longer counted in attendance.` });
      setDialog(null);
      setCancelReason('');
      afterChange();
    } catch (cancelError) {
      toast.error(errorMessage(cancelError, 'Unable to cancel the activity.'));
    } finally {
      setBusy(false);
    }
  };

  const notMarkedLeftOut = details ? details.unmarked - details.toMarkAbsent : 0;
  const notice = !details ? null
    : details.status === 'cancelled'
      ? { tone: 'red', text: `This activity was cancelled${details.cancellationReason ? `: ${details.cancellationReason}` : ''}. Attendance cannot be recorded, and it is not counted in any attendance rate.` }
      : !details.recordable
        ? { tone: 'gray', text: `Attendance can be recorded from the day of the activity, ${formatDate(details.activityDate)}.` }
        : details.final
          ? { tone: 'green', text: `Attendance is final${details.finalizedBy ? ` (finalized by ${details.finalizedBy}` : ''}${details.finalizedAt ? ` on ${formatDateTime(details.finalizedAt)})` : details.finalizedBy ? ')' : ''}. A record can still be corrected: each correction needs a reason and is kept in the change history.` }
          : { tone: 'amber', text: `Mark the members who came, then Finalize Attendance. Until then nobody is counted absent. Finalizing records the ${details.toMarkAbsent} active ${details.toMarkAbsent === 1 ? 'member' : 'members'} not marked as absent.` };
  const NOTICE_STYLE: Record<string, string> = {
    red: 'border-red-200 bg-red-50 text-red-800', gray: 'border-gray-200 bg-gray-50 text-gray-700', green: 'border-green-200 bg-green-50 text-green-900', amber: 'border-amber-200 bg-amber-50 text-amber-900',
  };

  // The dialogs opened from here are siblings of this window, not children:
  // on phones `.acf-modal > *` restyles every direct child as a bottom sheet.
  return (
    <>
      <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="activity-title"
        onKeyDown={(event) => { if (event.key === 'Escape' && !dialog) requestClose(); }}>
        {/* Phones: the whole window scrolls and only the save bar stays pinned; larger screens keep the header and buttons in place. */}
        <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl sm:overflow-hidden">
          <div className="shrink-0 bg-green-700 px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-100">{details?.categoryLabel ?? 'Activity'}</p>
                <h2 id="activity-title" className="text-xl font-bold sm:text-2xl">{details?.title ?? 'Loading…'}</h2>
                {details && (
                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-green-50">
                    <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" />{formatDate(details.activityDate)} · {timeRange(details.startTime, details.endTime)}</span>
                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{details.venue}</span>
                    {details.organizer && <span className="inline-flex items-center gap-1.5"><UserRound className="h-4 w-4" />{details.organizer}</span>}
                  </p>
                )}
              </div>
              <button type="button" onClick={requestClose} className="rounded-lg p-2 text-green-50 hover:bg-green-800" aria-label="Close the activity"><X className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="flex-1 space-y-4 bg-gray-50 p-4 sm:overflow-y-auto sm:p-5">
            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
            {!details && !error && <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the activity…</p>}
            {details && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ActivityStatusBadge activity={details} />
                  <p className="text-xs text-gray-500">Created by {details.createdBy ?? 'the office'} · {formatDateTime(details.createdAt)}</p>
                </div>
                {details.description && <p className="whitespace-pre-line rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">{details.description}</p>}

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {(['present', 'late', 'excused', 'absent'] as const).map((status) => (
                    <div key={status} className="rounded-xl border border-gray-200 bg-white p-3">
                      <p className="text-xs text-gray-500">{ATTENDANCE_LABELS[status]}</p>
                      <p className="text-xl font-bold tabular-nums text-gray-900">{details[status]}</p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">Not marked</p>
                    <p className="text-xl font-bold tabular-nums text-gray-900">{details.status === 'cancelled' ? '' : details.unmarked}</p>
                  </div>
                  <div className="rounded-xl bg-green-700 p-3 text-white">
                    <p className="text-xs text-green-100">Attendance rate</p>
                    <p className="text-xl font-bold tabular-nums">{details.final ? rateLabel(details.rate) : ''}</p>
                    {!details.final && details.status !== 'cancelled' && <p className="text-[11px] text-green-100">after finalizing</p>}
                  </div>
                </div>

                {notice && <p className={`rounded-xl border px-4 py-3 text-sm ${NOTICE_STYLE[notice.tone]}`} role="status">{notice.text}</p>}

                <AttendanceSheet activity={details} refreshKey={sheetKey} onSaved={afterChange} onPendingChange={setPendingCount} />

                <section className="rounded-2xl border border-gray-200 bg-white">
                  <button type="button" onClick={() => setShowHistory((open) => !open)} aria-expanded={showHistory} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                    <span className="inline-flex items-center gap-2 font-semibold text-gray-900"><History className="h-4 w-4 text-green-700" />Change History</span>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                  </button>
                  {showHistory && (
                    <div className="border-t border-gray-100">
                      {!history ? <p className="p-4 text-sm text-gray-500">Loading…</p> : !history.length ? <p className="p-4 text-sm text-gray-500">No changes recorded yet.</p> : (
                        <ol className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
                          {history.map((entry) => (
                            <li key={entry.id} className="px-4 py-2.5 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-gray-900">{entry.label}</p>
                                <p className="text-xs text-gray-500">{formatDateTime(entry.at)}{entry.by ? ` · ${entry.by}` : ''}</p>
                              </div>
                              <p className="text-gray-600">{entry.description}</p>
                              {entry.from && entry.to && <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600"><AttendanceBadge status={entry.from} />→<AttendanceBadge status={entry.to} /></p>}
                              {entry.reason && <p className="mt-1 text-xs text-gray-600"><span className="font-semibold">Reason:</span> {entry.reason}</p>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          {details && (
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => setDialog('edit')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-green-600 px-4 text-sm font-semibold text-green-700 hover:bg-green-50"><Pencil className="h-4 w-4" />Edit</button>
                {details.status !== 'cancelled' && !details.final && (
                  <button type="button" onClick={() => setDialog('cancel')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"><Ban className="h-4 w-4" />Cancel Activity</button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex">
                {details.canFinalize && (
                  <button type="button" onClick={() => setDialog('finalize')} disabled={pendingCount > 0} title={pendingCount ? 'Save or discard your changes first' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">
                    <Lock className="h-4 w-4" />Finalize Attendance
                  </button>
                )}
                <button type="button" onClick={requestClose} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200">Close</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {details && dialog === 'edit' && (
        <ActivityFormModal activity={details} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); afterChange(); }} />
      )}

      {details && dialog === 'finalize' && (
        <ConfirmDialog
          title="Finalize the attendance?"
          confirmLabel={busy ? 'Finalizing…' : 'Finalize Attendance'}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => { void finalize(); }}
        >
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700">
            <li><strong>{details.toMarkAbsent}</strong> active {details.toMarkAbsent === 1 ? 'member who is' : 'members who are'} not marked will be recorded <strong>Absent</strong>.</li>
            {notMarkedLeftOut > 0 && <li>{notMarkedLeftOut} inactive, suspended or terminated {notMarkedLeftOut === 1 ? 'member is' : 'members are'} not marked and will be left out (not counted).</li>}
            <li>The activity becomes <strong>Completed</strong> and counts in attendance rates.</li>
            <li>Records can still be corrected afterwards; each correction needs a reason and is kept in the change history.</li>
          </ul>
        </ConfirmDialog>
      )}

      {details && dialog === 'cancel' && (
        <ConfirmDialog
          title="Cancel this activity?"
          tone="danger"
          confirmLabel={busy ? 'Cancelling…' : 'Cancel Activity'}
          busy={busy || cancelReason.trim().length < 3}
          onCancel={() => setDialog(null)}
          onConfirm={() => { void cancel(); }}
        >
          <p className="text-sm text-gray-700">A cancelled activity stays in the records but is never counted in attendance{details.recorded ? `; the ${details.recorded} attendance ${details.recorded === 1 ? 'record' : 'records'} saved for it are kept but not counted` : ''}.</p>
          <label className="mt-3 block text-sm font-medium text-gray-700">
            Reason <span className="text-red-600" aria-hidden="true">*</span>
            <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} autoFocus placeholder="e.g. Typhoon signal no. 2" className={`${FIELD} mt-1`} />
          </label>
        </ConfirmDialog>
      )}
    </>
  );
}

function ConfirmDialog({ title, children, confirmLabel, busy, tone = 'primary', onCancel, onConfirm }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  tone?: 'primary' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="attendance-confirm-title"
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-5 py-4"><h3 id="attendance-confirm-title" className="text-lg font-bold text-gray-900">{title}</h3></div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200">Go Back</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-700 hover:bg-green-800'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
