import { useEffect, useState } from 'react';
import { RefreshCcw, X } from 'lucide-react';
import { fetchMemberLoanHistory, fetchMyLoanHistory, type MemberLoanHistory } from '../services/authApi';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../utils/dateTime';
import { StatusBadge } from './common/UiKit';

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
    ['Total paid', peso(summary.totalPaid), `${summary.payments} payment${summary.payments === 1 ? '' : 's'}`],
    ['Balance', peso(summary.outstandingBalance), summary.openLoans ? 'still owed on open loans' : 'nothing owed'],
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
                              <div><dt className="text-xs text-gray-500">With interest ({loan.interestRate}%)</dt><dd className="tabular-nums">{peso(loan.totalAmount)}</dd></div>
                              <div><dt className="text-xs text-gray-500">Paid</dt><dd className="tabular-nums text-green-700">{peso(loan.totalPaid)}</dd></div>
                              <div><dt className="text-xs text-gray-500">Balance</dt><dd className="font-semibold tabular-nums">{peso(loan.balance)}</dd></div>
                            </dl>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true"><div className="h-full bg-green-600" style={{ width: `${paidPercent}%` }} /></div>
                            {loan.renewedFromLoan && <p className="mt-2 text-xs text-amber-800">Restructured from {loan.renewedFromLoan}: {peso(loan.renewalDeduction ?? 0)} still owed on it was deducted; {peso(loan.netProceeds ?? 0)} released.</p>}
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : history.payments.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">No payments yet.</p> : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="text-left text-xs text-gray-500">
                        <tr><th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Loan</th><th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 pr-3 text-right font-medium">Principal</th><th className="py-2 pr-3 text-right font-medium">Interest</th><th className="py-2 text-right font-medium">Balance after</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {history.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td className="py-2 pr-3 whitespace-nowrap">{formatDate(payment.paymentDate)}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{payment.loanNumber}</td>
                            <td className="py-2 pr-3 text-right font-semibold tabular-nums">{peso(payment.amount)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{peso(payment.principalPaid)}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{peso(payment.interestPaid)}</td>
                            <td className="py-2 text-right tabular-nums">{peso(payment.remainingBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
        </div>
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}
