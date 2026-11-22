import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { IdCard, LoaderCircle, Printer, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { formatDateTime } from '../../../utils/dateTime';
import { fetchMemberIdCard, reissueMemberIdCard, type IdCard as Card } from '../../../app/services/idCardApi';

/**
 * A member's ID card on their record: when it was issued, Print ID (a PDF at
 * ID card size, front then back) and Reissue for a lost or damaged card (a new
 * QR code; the old card stops working).
 */
export function MemberIdCardPanel({ memberId, terminated }: { memberId: number; terminated: boolean }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (terminated) return;
    fetchMemberIdCard(memberId).then((response) => { setCard(response.data); setError(''); }).catch((reason) => setError(errorMessage(reason, 'Unable to load the ID card.')));
  }, [memberId, terminated]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['members'], load);

  const print = async (current: Card) => {
    setPrinting(true);
    try {
      const { downloadIdCards, idCardFileName } = await import('../../../app/components/idcard/idCardPdf');
      await downloadIdCards([current], 'card', idCardFileName(current));
    } catch (reason) {
      toast.error(errorMessage(reason, 'Unable to make the ID card.'));
    } finally {
      setPrinting(false);
    }
  };

  const reissue = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const response = await reissueMemberIdCard(memberId, reason.trim());
      setCard(response.data);
      setReissuing(false);
      setReason('');
      toast.success('New ID card issued', { description: response.message });
    } catch (reason) {
      toast.error(errorMessage(reason, 'Unable to reissue the ID card.'));
    } finally {
      setSaving(false);
    }
  };

  if (terminated) {
    return <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600"><IdCard className="mr-1.5 inline h-4 w-4 align-[-3px]" />The membership was terminated, so there is no member ID card.</p>;
  }
  return (
    <section className="rounded-xl border border-green-200 bg-green-50/60 p-4" aria-labelledby={`member-id-card-${memberId}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 id={`member-id-card-${memberId}`} className="flex items-center gap-2 font-bold text-green-900"><IdCard className="h-5 w-5" />Member ID Card</h3>
          <p className="mt-0.5 text-sm text-green-900/80">
            {error || (card ? `Current card issued ${formatDateTime(card.issuedAt)}. Its QR holds only a random code, no personal details.${card.photo ? '' : ' No 2x2 photo on file: the card will say NO PHOTO.'}` : 'Loading...')}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={() => card && void print(card)} disabled={!card || printing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            {printing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Print ID
          </button>
          <button type="button" onClick={() => setReissuing((open) => !open)} disabled={!card} aria-expanded={reissuing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50">
            <RotateCcw className="h-4 w-4" />Reissue
          </button>
        </div>
      </div>
      {reissuing && card && (
        <form onSubmit={reissue} className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-white p-3">
          <p className="text-sm text-amber-900">Give {card.name} a new ID card? The QR on the old card <strong>stops working</strong> at once (attendance scans and look-ups), and the member is told. Print the new card afterwards.</p>
          <label className="block text-sm font-medium text-gray-700">Reason (optional, kept in the audit log)
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="e.g. Lost, damaged, faded" className="mt-1 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm" />
          </label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setReissuing(false)} disabled={saving} className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}Issue a new card
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
