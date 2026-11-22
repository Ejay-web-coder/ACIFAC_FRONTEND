import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, ScanQrCode, X } from 'lucide-react';
import { errorMessage } from '../../../lib/api';
import { scanFeedback } from '../../../lib/scanFeedback';
import { QrScanner } from '../common/QrScanner';
import { findMemberByQr, NOT_A_MEMBER_ID, parseIdCardCode, type ScannedMember } from '../../services/idCardApi';

/**
 * Finds a member by their ID card: the camera reads the QR on the card (or on
 * the member's phone, My ID), or a handheld scanner types it into the code box.
 * onFound gets the member; the caller closes the dialog.
 */
export function ScanMemberDialog({ title = 'Scan member ID', hint, onFound, onClose }: {
  title?: string;
  /** What happens with the member, e.g. "Their dues open." */
  hint?: string;
  onFound: (member: ScannedMember) => void | Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [typed, setTyped] = useState('');
  const busyRef = useRef(false);
  // A refused code still in front of the camera is read again and again: say so once.
  const lastRefused = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const handle = useCallback(async (text: string) => {
    if (busyRef.current) return;
    const now = Date.now();
    if (text === lastRefused.current.text && now - lastRefused.current.at < 3000) return;
    const refuse = (message: string) => {
      lastRefused.current = { text, at: Date.now() };
      setProblem(message);
      scanFeedback('error');
    };
    const code = parseIdCardCode(text);
    if (!code) { refuse(NOT_A_MEMBER_ID); return; }
    busyRef.current = true;
    setBusy(true);
    setProblem('');
    try {
      const { data } = await findMemberByQr(code);
      scanFeedback('ok');
      await onFound(data);
    } catch (error) {
      refuse(errorMessage(error, 'The member could not be found.'));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [onFound]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busyRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    lastRefused.current = { text: '', at: 0 };
    void handle(text);
  };

  return (
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="scan-member-title">
      <div className="flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="scan-member-title" className="flex items-center gap-2 text-lg font-bold text-gray-900"><ScanQrCode className="h-5 w-5 text-green-700" />{title}</h2>
            <p className="mt-0.5 text-sm text-gray-600">Hold the member&apos;s ID card, or the QR on their phone (My ID), in the box.{hint ? ` ${hint}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50" aria-label="Close the scanner"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          <QrScanner onScan={(text) => { void handle(text); }} />
          <div aria-live="polite" className="min-h-6">
            {busy ? <p className="flex items-center gap-2 text-sm text-gray-600"><LoaderCircle className="h-4 w-4 animate-spin" />Looking up the member...</p>
              : problem ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{problem}</p> : null}
          </div>
          <form onSubmit={submitTyped} className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Code from a handheld scanner</span>
              <input value={typed} onChange={(event) => setTyped(event.target.value)} disabled={busy} autoComplete="off" spellCheck={false}
                placeholder="Handheld scanner: click here, then scan" className="h-11 w-full rounded-xl border border-gray-300 px-3 text-sm" />
            </label>
            <button type="submit" disabled={busy || !typed.trim()} className="min-h-11 shrink-0 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">Find</button>
          </form>
        </div>
      </div>
    </div>
  );
}
