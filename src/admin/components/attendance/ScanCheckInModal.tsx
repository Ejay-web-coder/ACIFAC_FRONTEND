import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleAlert, CircleCheck, Clock3, LoaderCircle, ScanQrCode, UserRound, X } from 'lucide-react';
import { errorMessage } from '../../../lib/api';
import { fetchProtectedImage } from '../../../lib/profilePhoto';
import { scanFeedback } from '../../../lib/scanFeedback';
import { QrScanner } from '../../../app/components/common/QrScanner';
import { memberDocumentPath } from '../../services/membersApi';
import { NOT_A_MEMBER_ID, parseIdCardCode } from '../../../app/services/idCardApi';
import { ATTENDANCE_LABELS, formatClock, scanCheckIn, type Activity, type ActivityDetails, type ScanCheckInResult } from '../../../app/services/attendanceApi';

interface Shown {
  key: number;
  tone: 'present' | 'late' | 'repeat' | 'error';
  title: string;
  detail: string;
  member?: ScanCheckInResult['member'];
}

const TONE: Record<Shown['tone'], string> = {
  present: 'border-green-300 bg-green-50 text-green-900',
  late: 'border-amber-300 bg-amber-50 text-amber-900',
  repeat: 'border-sky-200 bg-sky-50 text-sky-900',
  error: 'border-red-300 bg-red-50 text-red-800',
};

/**
 * Check-in at the door: each member's ID card (or the QR on their phone) is
 * scanned and the member is recorded present at that time, or late after the
 * start time. The camera stays on for the next member. A second scan of the
 * same card only says the member already checked in. Members never scanned are
 * recorded absent when the attendance is finalized; excused members are still
 * marked by hand in the list.
 */
export function ScanCheckInModal({ activity, onClose }: { activity: ActivityDetails; onClose: () => void }) {
  const [counts, setCounts] = useState<Pick<Activity, 'present' | 'late' | 'recorded'>>({ present: activity.present, late: activity.late, recorded: activity.recorded });
  const [shown, setShown] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<Shown[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const busyRef = useRef(false);
  // The scanner reads a card in view several times a second: one check-in per card every few seconds.
  const lastRead = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const keyRef = useRef(0);
  const photoRef = useRef<string | null>(null);

  const showPhoto = useCallback((url: string | null) => {
    if (photoRef.current) URL.revokeObjectURL(photoRef.current);
    photoRef.current = url;
    setPhoto(url);
  }, []);
  // Closed: free the photo, and drop any photo still downloading.
  useEffect(() => () => { keyRef.current = -1; if (photoRef.current) URL.revokeObjectURL(photoRef.current); }, []);

  const report = useCallback((next: Omit<Shown, 'key'>) => {
    keyRef.current += 1;
    const entry = { ...next, key: keyRef.current };
    setShown(entry);
    setRecent((current) => [entry, ...current].slice(0, 8));
    scanFeedback(next.tone === 'error' ? 'error' : next.tone === 'repeat' ? 'repeat' : 'ok');
  }, []);

  const handle = useCallback(async (text: string) => {
    if (busyRef.current) return;
    const now = Date.now();
    if (text === lastRead.current.text && now - lastRead.current.at < 3000) return;
    lastRead.current = { text, at: now };
    if (!parseIdCardCode(text)) { showPhoto(null); report({ tone: 'error', title: NOT_A_MEMBER_ID, detail: 'Scan the QR on the back of the member ID card, or on the member\'s phone (My ID).' }); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const { data } = await scanCheckIn(activity.id, text);
      const { member, record } = data;
      const at = record.checkInTime ? formatClock(record.checkInTime) : '';
      setCounts({ present: data.activity.present, late: data.activity.late, recorded: data.activity.recorded });
      showPhoto(null);
      report(data.alreadyCheckedIn
        ? { tone: 'repeat', title: member.name, detail: `Already checked in${at ? ` at ${at}` : ''} (${ATTENDANCE_LABELS[record.status]}).`, member }
        : {
          tone: record.status === 'late' ? 'late' : 'present',
          title: member.name,
          detail: `${ATTENDANCE_LABELS[record.status]}${at ? ` · checked in at ${at}` : ''}${data.previousStatus ? ` · was marked ${ATTENDANCE_LABELS[data.previousStatus].toLowerCase()}` : ''}`,
          member,
        });
      // The photo of this scan only: a slow download never lands on the next member's result.
      const scanKey = keyRef.current;
      if (member.hasPhoto) {
        void fetchProtectedImage(memberDocumentPath(member.id, 'photo')).then((url) => {
          if (keyRef.current === scanKey) showPhoto(url);
          else if (url) URL.revokeObjectURL(url);
        }).catch(() => undefined);
      }
    } catch (error) {
      showPhoto(null);
      report({ tone: 'error', title: 'Not checked in', detail: errorMessage(error, 'The check-in could not be saved. Scan the card again.') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [activity.id, report, showPhoto]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    lastRead.current = { text: '', at: 0 };
    void handle(text);
  };

  const Icon = !shown ? ScanQrCode : shown.tone === 'error' ? CircleAlert : shown.tone === 'late' ? Clock3 : CircleCheck;
  return (
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="scan-check-in-title">
      <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 bg-green-700 px-5 py-3 text-white">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-100">Scan check-in</p>
            <h2 id="scan-check-in-title" className="truncate text-lg font-bold">{activity.title}</h2>
            <p className="text-sm text-green-50">Present until {formatClock(activity.startTime)}, late after it · {counts.present} present · {counts.late} late · {counts.recorded} of {activity.members} recorded</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-green-50 hover:bg-green-800" aria-label="Close the check-in scanner"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <QrScanner onScan={(text) => { void handle(text); }} />
            <form onSubmit={submitTyped} className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Code from a handheld scanner</span>
                <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Handheld scanner: click here, then scan" className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm" />
              </label>
              <button type="submit" disabled={!typed.trim() || busy} className="min-h-11 shrink-0 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">Check in</button>
            </form>
            <p className="text-xs text-gray-500">Members not scanned are recorded absent when you finalize the attendance{activity.category === 'meeting' ? ', with the absence fine under Dues' : ''}. Mark excused members by hand in the list.</p>
          </div>
          <div className="space-y-3">
            <div aria-live="assertive" className={`flex min-h-36 items-center gap-4 rounded-2xl border-2 p-4 ${shown ? TONE[shown.tone] : 'border-dashed border-gray-300 bg-gray-50 text-gray-600'}`}>
              {shown?.member ? (
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white bg-white shadow-sm">
                  {photo ? <img src={photo} alt={`${shown.member.name}'s 2x2 photo`} className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center text-gray-400"><UserRound className="h-10 w-10" aria-label={shown.member.hasPhoto ? 'Loading the photo' : 'No photo on file'} /></div>}
                </div>
              ) : <Icon className="h-10 w-10 shrink-0" />}
              <div className="min-w-0">
                {busy ? <p className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin" />Checking in...</p> : shown ? (
                  <>
                    <p className="text-xl font-bold leading-tight">{shown.title}</p>
                    {shown.member?.memberNumber && <p className="text-sm opacity-80">{shown.member.memberNumber}</p>}
                    <p className="mt-1 text-sm font-semibold">{shown.detail}</p>
                    {shown.member && <p className="mt-1 text-xs opacity-75">Check that the photo is the person at the door.</p>}
                  </>
                ) : <p className="text-sm">Hold each member&apos;s ID card, or the QR on their phone (My ID), in the box. The camera stays on for the next member.</p>}
              </div>
            </div>
            {recent.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-sm font-semibold text-gray-900">Last scans</h3>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {recent.map((entry) => (
                    <li key={entry.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-gray-900">{entry.title}</span>
                      <span className={`shrink-0 text-xs font-semibold ${entry.tone === 'error' ? 'text-red-700' : entry.tone === 'late' ? 'text-amber-700' : entry.tone === 'repeat' ? 'text-sky-700' : 'text-green-700'}`}>
                        {entry.tone === 'error' ? 'Refused' : entry.tone === 'repeat' ? 'Already in' : entry.detail.split(' · ')[0]}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
        <div className="flex shrink-0 justify-end border-t border-gray-200 px-4 py-3">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200 sm:w-auto">Done scanning</button>
        </div>
      </div>
    </div>
  );
}
