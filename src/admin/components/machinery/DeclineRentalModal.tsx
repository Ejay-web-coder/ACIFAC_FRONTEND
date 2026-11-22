import { useEffect, useState } from 'react';
import { XCircle } from 'lucide-react';
import type { RentalRequest } from '../../../app/services/authApi';
import { formatDate } from '../../../utils/dateTime';

// The same minimum the server asks for.
const MIN_REASON = 3;

// Why the booking is declined (required). A member is told the reason by email,
// text message and notification; for a non-member it is kept on record only.
export function DeclineRentalModal({ request, saving, onCancel, onDecline }: {
  request: RentalRequest;
  saving: boolean;
  onCancel: () => void;
  onDecline: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const tooShort = reason.trim().length < MIN_REASON;
  const member = request.clientCategory !== 'non_member';
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, saving]);
  return (
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="decline-rental-title">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          if (!tooShort) onDecline(reason.trim());
        }}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><XCircle className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 id="decline-rental-title" className="text-lg font-bold text-slate-900">Decline {request.memberName}&apos;s booking?</h3>
            <p className="text-sm text-slate-600">{request.machineryName} · {formatDate(request.startDate)} to {formatDate(request.endDate)}</p>
          </div>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-700">Reason for declining
          <textarea
            autoFocus
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. The machine is under repair on those days."
            aria-invalid={tried && tooShort}
            aria-describedby="decline-rental-help"
            className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${tried && tooShort ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-red-400 focus:ring-red-200'}`}
          />
        </label>
        <p id="decline-rental-help" className={`mt-1 text-xs ${tried && tooShort ? 'text-red-600' : 'text-slate-500'}`}>
          {tried && tooShort
            ? 'Write the reason for declining.'
            : member
              ? 'The member gets this reason by email, text message and notification.'
              : 'Non-members are not notified; the reason is kept on record.'}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"><XCircle className="h-4 w-4" />{saving ? 'Declining…' : 'Decline booking'}</button>
        </div>
      </form>
    </div>
  );
}
