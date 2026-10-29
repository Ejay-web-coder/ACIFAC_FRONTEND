import { useEffect, type ReactNode } from 'react';
import { Ban, CircleCheck, CircleHelp, LoaderCircle, RefreshCcw, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AnalyticsData, CreditVerdict, MemberCreditAdvice } from '../../app/services/authApi';
import { StatusBadge } from '../../app/components/common/UiKit';
import { formatDate } from '../../utils/dateTime';
import { Modal, secondaryButton } from './machinery/shared';

type Member = AnalyticsData['memberAnalytics'][number];
export type AdviceState = { status: 'loading' | 'done' | 'error'; result?: MemberCreditAdvice; error?: string };

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

// Each verdict has a label and an icon as well as a color, so the color is never the only cue.
const VERDICT: Record<CreditVerdict, { label: string; icon: LucideIcon; className: string }> = {
  lend: { label: 'Can lend', icon: CircleCheck, className: 'bg-green-50 text-green-800 ring-green-200' },
  caution: { label: 'Lend with caution', icon: TriangleAlert, className: 'bg-amber-50 text-amber-900 ring-amber-200' },
  do_not_lend: { label: 'Do not lend for now', icon: Ban, className: 'bg-red-50 text-red-800 ring-red-200' },
  no_history: { label: 'Not enough history', icon: CircleHelp, className: 'bg-gray-50 text-gray-700 ring-gray-200' },
};

function Figure({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: string; tone?: 'bad' | 'warn' }) {
  return <div className="min-w-0 rounded-xl border border-gray-200 px-3 py-2">
    <p className="text-xs font-medium text-gray-600">{label}</p>
    <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-800' : 'text-gray-900'}`}>{value}</p>
    {detail && <p className="text-xs text-gray-500">{detail}</p>}
  </div>;
}

/**
 * The member clicked in the Member Credit History, kept short: the lending
 * suggestion in one line, four repayment figures, and one line per loan.
 */
export function MemberCreditAdviceModal({ member, advice, onRefresh, onClose }: { member: Member; advice: AdviceState; onRefresh: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const result = advice.result;
  const loading = advice.status === 'loading';
  const verdict = result ? VERDICT[result.verdict] : null;

  return (
    <Modal title={member.memberName} description={`${member.memberId ?? 'No member ID'} · ${plural(member.totalLoans, 'loan')}`} onClose={onClose}
      footer={<button type="button" onClick={onClose} className={secondaryButton}>Close</button>}>
      <div className="space-y-5">
        <section aria-label="Lending suggestion" aria-busy={loading} className={`rounded-xl border border-gray-200 p-4 ${loading && result ? 'opacity-60' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            {verdict
              ? <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${verdict.className}`}><verdict.icon className="h-4 w-4" aria-hidden="true" />{verdict.label}</span>
              : <span className="flex items-center gap-2 text-sm text-gray-500" role="status">{loading && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}{loading ? 'Checking…' : 'No suggestion'}</span>}
            <button type="button" onClick={onRefresh} disabled={loading} title="Refresh" aria-label="Refresh the suggestion" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
          {advice.status === 'error' && <p className="mt-2 text-sm text-red-700" role="alert">{advice.error}</p>}
          {result && <p className="mt-2 text-sm text-gray-800">{result.suggestion}</p>}
        </section>

        <section aria-label="Repayment record" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure label="Paid on time" value={member.installmentsDue ? `${member.onTimePayments} of ${member.installmentsDue}` : ''} />
          <Figure label="Paid late" value={member.latePayments} tone={member.latePayments ? 'bad' : undefined} />
          <Figure label="Overdue" value={member.overdueInstallments} tone={member.overdueInstallments ? 'bad' : undefined} />
          <Figure label="Balance" value={peso(member.outstandingBalance)} detail={`of ${peso(member.totalBorrowed)}`} tone={member.restructuredLoans ? 'warn' : undefined} />
        </section>

        <section aria-labelledby="credit-loans-title">
          <h3 id="credit-loans-title" className="text-sm font-semibold text-gray-900">Loans</h3>
          {member.loanHistory.length ? (
            <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {member.loanHistory.map((loan) => (
                <li key={loan.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-900">{loan.loanNumber} <span className="font-normal text-gray-500">· {formatDate(loan.dateApproved, true)}</span></p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="tabular-nums text-gray-600">{loan.balance > 0 && loan.status !== 'paid' ? `${peso(loan.balance)} left of ${peso(loan.amount)}` : peso(loan.amount)}</span>
                    {loan.restructureCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-200"><RefreshCcw className="h-3 w-3" aria-hidden="true" />Restructured</span>}
                    <StatusBadge status={loan.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-gray-500">No loans yet.</p>}
        </section>
      </div>
    </Modal>
  );
}
