import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarClock, X } from 'lucide-react';
import { toast } from 'sonner';
import { restructureAdminLoan, type AdminLoan } from '../../app/services/authApi';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../utils/dateTime';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (value: number) => Math.round(value * 100);
// The loan policy's interest, the default on a restructured balance.
const POLICY_RATE = '2.5';

/**
 * Restructures an open loan: what is still owed is given a new monthly
 * schedule from today, plus interest on it. The server does the arithmetic;
 * this window shows the same figures beforehand.
 */
export function RestructureLoanModal({ loan, onClose, onDone }: { loan: AdminLoan; onClose: () => void; onDone: (loan: AdminLoan) => void }) {
  const [term, setTerm] = useState('6');
  const [rate, setRate] = useState(POLICY_RATE);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const months = Number(term);
  const termValid = Number.isInteger(months) && months >= 1 && months <= 60;
  const rateValid = /^\d{1,2}(\.\d{1,2})?$/.test(rate.trim());
  // Same rounding as the server: interest rounded to the centavo, equal
  // installments rounded to the centavo, the last one absorbing the difference.
  const addedCents = rateValid ? Math.round((cents(loan.balance) * Number(rate)) / 100) : 0;
  const totalCents = cents(loan.balance) + addedCents;
  const monthlyCents = termValid ? Math.round(totalCents / months) : 0;
  const lastCents = termValid ? totalCents - monthlyCents * (months - 1) : 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!termValid || !rateValid || !reason.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await restructureAdminLoan(loan.databaseId, { term: months, interestRate: rate.trim(), reason: reason.trim() });
      toast.success('Loan restructured', { description: `${loan.memberName}: ${peso(updated.balance)} over ${months} month${months === 1 ? '' : 's'}, ${peso(updated.monthlyPayment)} a month.` });
      onDone(updated);
    } catch (error) {
      toast.error('Unable to restructure the loan', { description: errorMessage(error, 'Please try again.') });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-green-500';
  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="restructure-title">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <h2 id="restructure-title" className="text-xl font-bold text-gray-900">Restructure Loan</h2>
            <p className="mt-1 text-sm text-gray-600">{loan.memberName} · {loan.id}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm">
              <div><p className="text-xs text-gray-500">Balance still owed</p><p className="text-lg font-bold text-gray-900">{peso(loan.balance)}</p></div>
              <div><p className="text-xs text-gray-500">Current monthly payment</p><p className="text-lg font-bold text-gray-900">{peso(loan.monthlyPayment)}</p></div>
              {loan.overdueInstallments > 0 && (
                <p className="col-span-2 flex items-start gap-2 text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{peso(loan.overdueAmount)} of it is overdue, across {loan.overdueInstallments} installment{loan.overdueInstallments === 1 ? '' : 's'}.</p>
              )}
              {loan.restructureCount > 0 && (
                <p className="col-span-2 text-gray-600">Already restructured {loan.restructureCount === 1 ? 'once' : `${loan.restructureCount} times`}, last on {formatDate(loan.lastRestructuredOn)}.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-gray-700">New term (months) *
                <input type="number" required min={1} max={60} step={1} value={term} onChange={(event) => setTerm(event.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block text-sm font-medium text-gray-700">Interest on the balance (%) *
                <input inputMode="decimal" required value={rate} onChange={(event) => setRate(event.target.value)} className={`mt-1 ${inputClass}`} aria-invalid={!rateValid || undefined} />
              </label>
            </div>
            <p className="-mt-2 text-xs text-gray-500">Interest is charged once on the balance carried over, like a new loan ({POLICY_RATE}% is the loan policy). Enter 0 for none.</p>

            <label className="block text-sm font-medium text-gray-700">Reason *
              <textarea required rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className={`mt-1 ${inputClass}`} placeholder="e.g., Typhoon damaged the crop; harvest delayed" />
            </label>

            {termValid && rateValid && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                <p className="font-semibold">New schedule</p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
                  <dt>Balance carried over</dt><dd className="text-right tabular-nums">{peso(loan.balance)}</dd>
                  <dt>Interest ({Number(rate)}%)</dt><dd className="text-right tabular-nums">{peso(addedCents / 100)}</dd>
                  <dt className="font-semibold">New balance</dt><dd className="text-right font-semibold tabular-nums">{peso(totalCents / 100)}</dd>
                  <dt>Monthly payment</dt><dd className="text-right tabular-nums">{peso(monthlyCents / 100)} × {months}{lastCents !== monthlyCents ? ` (last ${peso(lastCents / 100)})` : ''}</dd>
                </dl>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-green-800"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />The first payment falls due about one month from today, on a day the office receives payments.</p>
              </div>
            )}
            <p className="text-xs text-gray-500">The unpaid installments are replaced by the new schedule; payments already made stay. Installments that were already past due still count as late in the member&apos;s credit history. The member is notified.</p>
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving || !termValid || !rateValid || !reason.trim()} className="rounded-xl bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Restructuring...' : 'Restructure Loan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
