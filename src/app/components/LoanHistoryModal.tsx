import { useEffect, useState } from 'react';
import { Receipt, RefreshCcw, X } from 'lucide-react';
import { fetchMemberLoanHistory, fetchMyLoanHistory, type AdminPayment, type MemberLoanHistory } from '../services/authApi';
import { errorMessage } from '../../lib/api';
import { formatDate, paymentTimeLabel } from '../../utils/dateTime';
import { PaymentReceiptModal } from '../../admin/components/receipt/PaymentReceiptModal';
import { loanPaymentReceipt, type PaymentReceipt } from '../../admin/components/receipt/paymentReceipt';
import { StatusBadge } from './common/UiKit';
import { interestRateLabel } from '../../lib/loanPolicy';
import { RecordedLoanProceeds, recordedRelease } from './LoanProceeds';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A member's loan summary: totals, every loan, and every payment on them.
 * Opened by an admin from Loans & Payments (memberId) and by the member from
 * their own Loan Status page (no memberId). Both read the same figures.
 */
export function LoanHistoryModal({ memberId, memberName, onClose }: { memberId?: number; memberName?: string; onClose: () => void }) {
  const [history, setHistory] = useState<MemberLoanHistory | null>(null);
  const [error, setError] = useState('');
  const [section, setSection] = useState<'loans' | 'payments'>('loans');
  // The receipt open over the summary (Escape closes only the receipt).
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const receiptButton = (payment: AdminPayment, className: string) => (
    <button type="button" onClick={() => setReceipt(loanPaymentReceipt(payment))} className={`inline-flex items-center justify-center gap-1 font-semibold text-green-700 hover:bg-green-50 ${className}`} aria-label={`Receipt of the payment of ${formatDate(payment.paymentDate)}`}>
      <Receipt className="h-4 w-4" aria-hidden="true" />Receipt
    </button>
  );

  useEffect(() => {
    let active = true;
    (memberId ? fetchMemberLoanHistory(memberId) : fetchMyLoanHistory())
      .then((data) => { if (active) setHistory(data); })
      .catch((reason) => { if (active) setError(errorMessage(reason, 'Unable to load the loan history.')); });
    return () => { active = false; };
  }, [memberId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const summary = history?.summary;
  const cards = summary ? [
    ['Loans', `${summary.loans}`, `${summary.openLoans} open · ${summary.paidLoans} paid${summary.overdueLoans ? ` · ${summary.overdueLoans} overdue` : ''}`],
    ['Total borrowed', peso(summary.totalBorrowed), `${peso(summary.totalInterest)} interest`],
    ['Total paid', peso(summary.totalPaid), `${summary.payments} payment${summary.payments === 1 ? '' : 's'}${summary.penaltyPaid > 0 ? ` · ${peso(summary.penaltyPaid)} late penalties apart` : ''}`],
    ['Balance', peso(summary.outstandingBalance), summary.penaltyDue > 0 ? `+ ${peso(summary.penaltyDue)} late penalty due` : summary.openLoans ? 'still owed on open loans' : 'nothing owed'],
  ] : [];

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="loan-history-title" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <h2 id="loan-history-title" className="text-xl font-bold text-gray-900">Loan Summary</h2>
            <p className="mt-1 text-sm text-gray-600">
              {history?.member.name ?? memberName ?? 'My loans'}
              {history?.member.memberNumber && ` · ${history.member.memberNumber}`}
              {history?.member.farmArea ? ` · ${history.member.farmArea} ha` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>
            : !history ? <p className="py-10 text-center text-sm text-gray-500">Loading loan history...</p>
            : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {cards.map(([label, value, note]) => (
                    <div key={label} className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-lg font-bold text-gray-900">{value}</p>
                      <p className="text-xs text-gray-500">{note}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-2 border-b border-gray-200" role="tablist">
                  {(['loans', 'payments'] as const).map((key) => (
                    <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => setSection(key)}
                      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${section === key ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                      {key === 'loans' ? `Loans (${history.loans.length})` : `Payment history (${history.payments.length})`}
                    </button>
                  ))}
                </div>

                {section === 'loans' ? (
                  history.loans.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">No loans yet.</p> : (
                    <ul className="mt-3 space-y-3">
                      {history.loans.map((loan) => {
                        const paidPercent = loan.totalAmount > 0 ? Math.min(100, (loan.totalPaid / loan.totalAmount) * 100) : 0;
                        return (
                          <li key={loan.databaseId} className="rounded-xl border border-gray-200 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-gray-900">{loan.id}</p>
                              <StatusBadge status={loan.status} />
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-700">{loan.loanType}</span>
                              {loan.restructureCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"><RefreshCcw className="h-3 w-3" aria-hidden="true" />Restructured</span>}
                            </div>
                            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                              <div><dt className="text-xs text-gray-500">Approved</dt><dd>{formatDate(loan.dateApproved)}</dd></div>
                              <div><dt className="text-xs text-gray-500">Due</dt><dd>{formatDate(loan.dueDate)}</dd></div>
                              <div><dt className="text-xs text-gray-500">Amount</dt><dd className="tabular-nums">{peso(loan.amount)}</dd></div>
                              <div><dt className="text-xs text-gray-500">With interest ({interestRateLabel(loan.interestRate, loan.term)})</dt><dd className="tabular-nums">{peso(loan.totalAmount)}</dd></div>
                              <div><dt className="text-xs text-gray-500">Paid</dt><dd className="tabular-nums text-green-700">{peso(loan.totalPaid)}</dd></div>
                              <div><dt className="text-xs text-gray-500">Balance</dt><dd className="font-semibold tabular-nums">{peso(loan.balance)}</dd></div>
                            </dl>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true"><div className="h-full bg-green-600" style={{ width: `${paidPercent}%` }} /></div>
                            {loan.status !== 'paid' && loan.penaltyDays > 0 && <p className="mt-2 text-xs font-medium text-red-700">Late penalty: {peso(loan.penaltyDue)} due ({loan.penaltyDays} day{loan.penaltyDays === 1 ? '' : 's'} past the grace period) · due now {peso(loan.amountDueNow)}</p>}
                            {loan.status === 'overdue' && loan.penaltyPerDay > 0 && loan.penaltyDays === 0 && loan.graceEndsOn && <p className="mt-2 text-xs text-amber-800">Grace period until {formatDate(loan.graceEndsOn)}; then {peso(loan.penaltyPerDay)} a day until paid in full.</p>}
                            {loan.status === 'paid' && loan.penaltyPaid > 0 && <p className="mt-2 text-xs text-gray-600">Late penalty paid: {peso(loan.penaltyPaid)}</p>}
                            {loan.renewedFromLoan && <p className="mt-2 text-xs text-amber-800">Restructured from {loan.renewedFromLoan}: {peso(loan.renewalDeduction ?? 0)} still owed on it was deducted{recordedRelease(loan) ? ' from the proceeds' : `; ${peso(loan.netProceeds ?? 0)} released`}.</p>}
                            {recordedRelease(loan) && <div className="mt-2"><RecordedLoanProceeds loan={loan} /></div>}
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : history.payments.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">No payments yet.</p> : (
                  <>
                  {/* Phones: one card per payment, so nothing scrolls sideways. */}
                  <ul className="mt-3 space-y-2 sm:hidden">
                    {history.payments.map((payment) => (
                      <li key={payment.id} className="rounded-xl border border-gray-200 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">{formatDate(payment.paymentDate)}</p>
                            <p className="text-xs text-gray-500">{[paymentTimeLabel(payment.paymentDate, payment.createdAt), payment.loanNumber].filter(Boolean).join(' · ')}</p>
                          </div>
                          <p className="font-semibold tabular-nums text-gray-900">{peso(payment.amount)}</p>
                        </div>
                        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div><dt className="text-gray-500">Principal</dt><dd className="tabular-nums text-gray-900">{peso(payment.principalPaid)}</dd></div>
                          <div><dt className="text-gray-500">Interest</dt><dd className="tabular-nums text-gray-900">{peso(payment.interestPaid)}</dd></div>
                          <div className="text-right"><dt className="text-gray-500">Balance after</dt><dd className="tabular-nums text-gray-900">{peso(payment.remainingBalance)}</dd></div>
                        </dl>
                        {payment.penaltyPaid > 0 && <p className="mt-1 text-xs text-red-700">Late penalty: {peso(payment.penaltyPaid)} of this payment</p>}
                        {receiptButton(payment, 'mt-2 min-h-10 w-full rounded-xl border border-green-600 px-3 text-sm')}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="text-left text-xs text-gray-500">
                        <tr><th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Loan</th><th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 pr-3 text-right font-medium">Principal</th><th className="py-2 pr-3 text-right font-medium">Interest</th><th className="py-2 pr-3 text-right font-medium">Penalty</th><th className="py-2 pr-3 text-right font-medium">Balance after</th><th className="py-2"><span className="sr-only">Receipt</span></th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {history.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="py-2 pr-3 whitespace-nowrap">{formatDate(payment.paymentDate)}{paymentTimeLabel(payment.paymentDate, payment.createdAt) && <span className="block text-xs text-gray-500">{paymentTimeLabel(payment.paymentDate, payment.createdAt)}</span>}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{payment.loanNumber}</td>
                            <td className="py-2 pr-3 text-right font-semibold tabular-nums">{peso(payment.amount)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{peso(payment.principalPaid)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{peso(payment.interestPaid)}</td>
                            <td className={`py-2 pr-3 text-right tabular-nums ${payment.penaltyPaid > 0 ? 'text-red-700' : 'text-gray-400'}`}>{peso(payment.penaltyPaid)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{peso(payment.remainingBalance)}</td>
                            <td className="py-2 text-right">{receiptButton(payment, 'min-h-9 rounded-lg px-2 text-xs')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </>
            )}
        </div>
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">Close</button>
        </div>
        {/* Inside the panel, so a click on the receipt does not reach the backdrop. */}
        {receipt && <PaymentReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
      </div>
    </div>
  );
}
