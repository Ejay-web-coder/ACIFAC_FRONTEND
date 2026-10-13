import { useEffect, type ReactNode } from 'react';
import { Ban, CircleCheck, CircleHelp, LoaderCircle, RefreshCcw, RefreshCw, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AnalyticsData, CreditVerdict, MemberCreditAdvice } from '../../app/services/authApi';
import { StatusBadge } from '../../app/components/common/UiKit';
import { formatDate } from '../../utils/dateTime';
import { Modal, secondaryButton } from './machinery/shared';

type Member = AnalyticsData['memberAnalytics'][number];
export type AdviceState = { status: 'loading' | 'done' | 'error'; result?: MemberCreditAdvice; error?: string };

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const peso2 = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
 * The member clicked in the Member Credit History: a short AI suggestion on
 * lending to them again, from how they repaid, then their repayment record
 * and loans.
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
      <div className="space-y-6">
        <section aria-labelledby="credit-advice-title" aria-busy={loading}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="credit-advice-title" className="flex items-center gap-2 text-base font-bold text-gray-900">
              <Sparkles className="h-4 w-4 text-green-700" aria-hidden="true" />Lending suggestion
              {result && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${result.source === 'ai' ? 'bg-green-50 text-green-800 ring-green-200' : 'bg-gray-50 text-gray-700 ring-gray-200'}`}>{result.source === 'ai' ? 'AI' : 'Rule-based'}</span>}
            </h3>
            <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />{loading ? 'Analyzing…' : 'Refresh'}
            </button>
          </div>

          {loading && !result && <p className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-6 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Reading how this member repays. This can take up to a minute.</p>}
          {advice.status === 'error' && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{advice.error}</p>}

          {result && verdict && <div className={`mt-3 rounded-xl border border-gray-200 p-4 ${loading ? 'opacity-60' : ''}`}>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${verdict.className}`}><verdict.icon className="h-4 w-4" aria-hidden="true" />{verdict.label}</span>
            <p className="mt-2 text-base leading-relaxed text-gray-900">{result.suggestion}</p>
            {result.reasons.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-gray-600">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
            {result.notice && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{result.notice}</p>}
            <p className="mt-3 text-xs text-gray-500">
              A suggestion to discuss, not a decision. {result.source === 'ai' ? 'Written by AI from this member\'s repayment figures only (their name is not sent).' : result.methodology}
            </p>
          </div>}
        </section>

        <section aria-labelledby="credit-record-title">
          <h3 id="credit-record-title" className="text-sm font-semibold text-gray-900">Repayment record</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Figure label="Paid on time" value={member.installmentsDue ? `${member.onTimePayments} of ${member.installmentsDue}` : '—'} detail={member.installmentsDue ? `${member.onTimePaymentRate}% of installments due` : 'Nothing due yet'} />
            <Figure label="Paid late" value={member.latePayments} tone={member.latePayments ? 'bad' : undefined}
              detail={result?.facts.installments.averageDaysLate ? `${plural(result.facts.installments.averageDaysLate, 'day')} late on average` : undefined} />
            <Figure label="Overdue now" value={member.overdueInstallments} tone={member.overdueInstallments ? 'bad' : undefined} detail="installments" />
            <Figure label="Balance" value={peso(member.outstandingBalance)} detail={`of ${peso(member.totalBorrowed)} borrowed`} tone={member.restructuredLoans ? 'warn' : undefined} />
          </div>
        </section>

        <section aria-labelledby="credit-loans-title">
          <h3 id="credit-loans-title" className="text-sm font-semibold text-gray-900">Loans</h3>
          {member.loanHistory.length ? (
            <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {member.loanHistory.map((loan) => (
                <li key={loan.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{loan.loanNumber} <span className="font-normal text-gray-500">· {formatDate(loan.dateApproved, true)}</span></p>
                    <p className="text-xs text-gray-500">{peso2(loan.amount)} borrowed · {peso2(loan.totalPaid)} paid in {plural(loan.paymentCount, 'payment')}{loan.balance > 0 && loan.status !== 'paid' ? ` · ${peso2(loan.balance)} left` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-gray-600">{loan.onTimePayments} on time · <span className={loan.latePayments ? 'font-semibold text-red-700' : ''}>{loan.latePayments} late</span></span>
                    {loan.restructureCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-200"><RefreshCcw className="h-3 w-3" aria-hidden="true" />Restructured{loan.restructureCount > 1 ? ` ×${loan.restructureCount}` : ''}</span>}
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
