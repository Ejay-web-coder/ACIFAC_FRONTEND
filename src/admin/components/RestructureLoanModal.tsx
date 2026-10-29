import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarClock, X } from 'lucide-react';
import { toast } from 'sonner';
import { restructureAdminLoan, type AdminLoan } from '../../app/services/authApi';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../utils/dateTime';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (value: number) => Math.round(value * 100);
// The loan policy: restructuring once 80% is paid; a new loan of at most
// ₱50,000 a hectare at 2.5% interest, charged once.
const MIN_PAID_PERCENT = 80;
const MAX_PER_HECTARE = 50000;
const POLICY_RATE = 2.5;

/**
 * Restructures a loan the borrower has paid at least 80% of into a new loan:
 * what is still owed is deducted from the new loan, which closes the old one,
 * and the borrower receives the rest. The server does the arithmetic; this
 * window shows the same figures beforehand.
 */
export function RestructureLoanModal({ loan, onClose, onDone }: { loan: AdminLoan; onClose: () => void; onDone: (loan: AdminLoan) => void }) {
  const [amount, setAmount] = useState(String(loan.amount));
  const [farmArea, setFarmArea] = useState(loan.farmArea ? String(loan.farmArea) : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const balanceCents = cents(loan.balance);
  const paidCents = cents(loan.totalPaid);
  const totalCents = paidCents + balanceCents;
  const paidPercent = totalCents > 0 ? Math.floor((paidCents * 1000) / totalCents) / 10 : 0;
  const eligible = paidCents * 100 >= totalCents * MIN_PAID_PERCENT;
  const neededCents = Math.max(0, Math.ceil((totalCents * MIN_PAID_PERCENT) / 100) - paidCents);

  const areaValid = /^\d+(\.\d{1,2})?$/.test(farmArea.trim()) && Number(farmArea) > 0;
  const maxCents = areaValid ? Math.round(Number(farmArea) * MAX_PER_HECTARE * 100) : 0;
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
  const amountCents = amountValid ? cents(Number(amount)) : 0;
  const amountError = !amountValid || !areaValid ? ''
    : amountCents > maxCents ? `At most ${peso(maxCents / 100)} for ${Number(farmArea)} hectare${Number(farmArea) === 1 ? '' : 's'}.`
    : amountCents <= balanceCents ? `Must be more than the ${peso(loan.balance)} still owed, which is deducted from it.`
    : '';
  // Same rounding as the server: interest rounded to the centavo.
  const interestCents = Math.round((amountCents * POLICY_RATE) / 100);
  const ready = eligible && amountValid && areaValid && !amountError && reason.trim() !== '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      const { loan: created } = await restructureAdminLoan(loan.databaseId, { amount: amount.trim(), farmArea: farmArea.trim(), reason: reason.trim() });
      toast.success('Loan restructured', {
        description: `${loan.memberName}: ${loan.id} is closed. New loan ${created.id} of ${peso(created.amount)}; ${peso(created.netProceeds ?? 0)} released, due by ${formatDate(created.dueDate)}.`,
      });
      onDone(created);
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
              <div><p className="text-xs text-gray-500">Paid so far</p><p className="text-lg font-bold text-gray-900">{peso(loan.totalPaid)}</p><p className="text-xs text-gray-500">{paidPercent}% of {peso(totalCents / 100)}</p></div>
              <div><p className="text-xs text-gray-500">Still owed</p><p className="text-lg font-bold text-gray-900">{peso(loan.balance)}</p></div>
              <div className="col-span-2 h-2 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
                <div className={`h-full ${eligible ? 'bg-green-600' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, paidPercent)}%` }} />
              </div>
              {loan.overdueInstallments > 0 && (
                <p className="col-span-2 flex items-start gap-2 text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{peso(loan.overdueAmount)} of it is overdue.</p>
              )}
            </div>

            {!eligible ? (
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                A loan can be restructured once at least {MIN_PAID_PERCENT}% of it is paid. {peso(neededCents / 100)} more is needed.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-gray-700">New loan amount (₱) *
                    <input inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} className={`mt-1 ${inputClass}`} aria-invalid={Boolean(amountError) || undefined} />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">Farm area (hectares) *
                    <input inputMode="decimal" required value={farmArea} onChange={(event) => setFarmArea(event.target.value)} className={`mt-1 ${inputClass}`} aria-invalid={(farmArea !== '' && !areaValid) || undefined} />
                  </label>
                </div>
                <p className="-mt-2 text-xs text-gray-500">{amountError ? <span className="text-red-700">{amountError}</span> : `At most ₱${MAX_PER_HECTARE.toLocaleString('en-PH')} a hectare${areaValid ? `: ${peso(maxCents / 100)}` : ''}.`}</p>

                <label className="block text-sm font-medium text-gray-700">Reason *
                  <textarea required rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className={`mt-1 ${inputClass}`} placeholder="e.g., Next cropping season" />
                </label>

                {amountValid && areaValid && !amountError && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                    <p className="font-semibold">New loan</p>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
                      <dt>Loan amount</dt><dd className="text-right tabular-nums">{peso(amountCents / 100)}</dd>
                      <dt>Less still owed on {loan.id}</dt><dd className="text-right tabular-nums">− {peso(loan.balance)}</dd>
                      <dt className="font-semibold">Released to the member</dt><dd className="text-right font-semibold tabular-nums">{peso((amountCents - balanceCents) / 100)}</dd>
                      <dt className="pt-1">Interest ({POLICY_RATE}%)</dt><dd className="pt-1 text-right tabular-nums">{peso(interestCents / 100)}</dd>
                      <dt>To repay</dt><dd className="text-right tabular-nums">{peso((amountCents + interestCents) / 100)}</dd>
                    </dl>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-green-800"><CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />Due in full about 6 months from today, on a day the office receives payments.</p>
                  </div>
                )}
                <p className="text-xs text-gray-500">The amount still owed is recorded as the last payment of {loan.id}, which is then fully paid. Installments that were already past due still count as late in the member&apos;s credit history. The member is notified.</p>
              </>
            )}
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">{eligible ? 'Cancel' : 'Close'}</button>
            {eligible && (
              <button type="submit" disabled={saving || !ready} className="rounded-xl bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Restructuring...' : 'Restructure Loan'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
