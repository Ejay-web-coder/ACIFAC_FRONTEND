import { useState } from 'react';
import { AlertCircle, Banknote, ChevronRight, CircleCheck, TrendingUp, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../app/components/common/UiKit';
import { UserRole } from '../../app/App';
import { usePageHeading } from '../../app/components/pageHeading';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { sumMoney } from '../../utils/money';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';
import { UpcomingActivities } from '../components/UpcomingActivities';

interface MemberDashboardProps {
  userRole: UserRole;
}

const GOLD = '#f3c443';
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ₱ 10,073.80 as on a price tag: a gold peso sign, the pesos large, the centavos raised.
function BigMoney({ value }: { value: number }) {
  const [pesos, centavos] = value.toFixed(2).split('.');
  return (
    <p className="flex items-start font-extrabold leading-none tracking-tight tabular-nums" aria-label={peso(value)}>
      <span className="mr-1.5 mt-[0.35em] text-[0.45em]" style={{ color: GOLD }} aria-hidden="true">₱</span>
      <span aria-hidden="true">{Number(pesos).toLocaleString('en-PH')}</span>
      <span className="mt-[0.15em] text-[0.4em]" aria-hidden="true">.{centavos}</span>
    </p>
  );
}

// A small figure card: two across on phones, with a line saying what the figure means.
function FigureCard({ icon: Icon, label, value, detail, link }: { icon: LucideIcon; label: string; value: string; detail: string; link?: { to: string; label: string } }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-[var(--shadow-card)] sm:p-4 lg:p-5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-800 ring-1 ring-green-100 lg:h-9 lg:w-9"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <h2 className="truncate text-sm font-semibold text-gray-800">{label}</h2>
      </div>
      <p className="mt-2 truncate text-lg font-extrabold tabular-nums text-gray-900 sm:text-xl lg:mt-3 lg:text-3xl">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500 lg:text-sm">{detail}</p>
      {link && <Link to={link.to} className="mt-auto hidden items-center gap-0.5 pt-2 text-sm font-semibold text-green-800 hover:underline lg:inline-flex">{link.label}<ChevronRight className="h-4 w-4" /></Link>}
    </section>
  );
}

export function MemberDashboard({ userRole }: MemberDashboardProps) {
  const { memberData, error } = useMyMemberData();
  // Phones: the recent transactions and the upcoming activities share one card.
  const [listTab, setListTab] = useState<'transactions' | 'activities'>('transactions');
  const member = memberData?.member;
  usePageHeading(member ? { title: `Welcome back, ${(member.first_name || member.full_name).split(' ')[0]}`, subtitle: `Member ID ${member.member_number || member.id}` } : null);

  if (userRole !== 'member') {
    return <div className="p-4 md:p-8 text-sm md:text-base">Access restricted to members only</div>;
  }

  if (error) return <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>;
  if (!memberData || !member) {
    return (
      <div className="space-y-3 lg:space-y-4" role="status" aria-label="Loading your member data">
        <Skeleton className="h-56 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const { loans, payments } = memberData;
  const activeLoans = loans.filter((loan) => loan.status === 'active' || loan.status === 'overdue');
  const loanBalance = sumMoney(activeLoans.map((loan) => loan.balance));
  const recentPayments = payments.slice(0, 2);

  // Your total savings: the savings deposits (dividends and patronage refunds are confidential: the office only).
  const total = memberData.savings?.total ?? 0;
  const loansText = `${activeLoans.length} active ${activeLoans.length === 1 ? 'loan' : 'loans'}`;

  const transactionsList = recentPayments.length ? (
    <ul className="divide-y divide-gray-100">
      {recentPayments.map((payment) => (
        <li key={payment.id} className="flex items-center gap-3 px-4 py-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-800 ring-1 ring-green-100"><CircleCheck className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">Loan payment</p>
            <p className="text-xs text-gray-500">{formatDate(payment.paymentDate)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-6">
            <p className="text-sm font-bold tabular-nums text-gray-900">{peso(Number(payment.amount))}</p>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">Completed</span>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <p className="flex flex-1 items-center justify-center px-4 py-5 text-center text-sm text-gray-500">No transactions yet. Your loan payments appear here once recorded.</p>
  );

  // Fits one screen: the savings, the loan balance and share capital, then the recent transactions and activities.
  return (
    <div className="space-y-3 lg:space-y-4">
      {/* Your total savings */}
      <Link to="/member/savings" className="block rounded-3xl bg-[#1b3d26] p-4 text-white shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-raised)] lg:p-7">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white/90 lg:text-lg">Your total savings</p>
          <div className="mt-1 text-[3.25rem] lg:mt-3 lg:text-[5.5rem]">
            <BigMoney value={total} />
          </div>
          <p className="mt-1.5 text-xs text-white/75 lg:mt-3 lg:text-sm">As of {formatDate(dateOnlyToday())}</p>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <FigureCard icon={Banknote} label="Loan balance" value={peso(loanBalance)} detail={`Still owed on ${loansText}`} link={{ to: '/loan-status', label: 'See loan status' }} />
        <FigureCard icon={TrendingUp} label="Share capital" value={peso(member.share_capital)} detail="Your paid-up share in the cooperative" />
      </div>

      {/* Phones: one card with two tabs. Wide screens: the two cards side by side. */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)] lg:hidden" aria-label="Recent transactions and upcoming activities">
        <div className="flex items-center gap-1 border-b border-gray-100 p-1.5" role="tablist">
          {([['transactions', 'Recent transactions'], ['activities', 'Upcoming activities']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={listTab === key} onClick={() => setListTab(key)}
              className={`min-h-9 flex-1 rounded-lg px-2 text-sm font-semibold ${listTab === key ? 'bg-green-50 text-green-900 ring-1 ring-green-200' : 'text-gray-600 hover:bg-gray-50'}`}>{label}</button>
          ))}
          <Link to={listTab === 'transactions' ? '/transaction' : '/member/attendance'} className="inline-flex min-h-9 shrink-0 items-center rounded-lg px-1.5 text-green-800 hover:bg-green-50" aria-label={listTab === 'transactions' ? 'View all transactions' : 'My attendance'}><ChevronRight className="h-5 w-5" /></Link>
        </div>
        {listTab === 'transactions' ? transactionsList : <UpcomingActivities limit={2} embedded />}
      </section>
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-labelledby="recent-transactions-title">
          <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
            <h2 id="recent-transactions-title" className="text-base font-bold text-gray-900">Recent transactions</h2>
            <Link to="/transaction" className="inline-flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-green-800 hover:bg-green-50">View all<ChevronRight className="h-4 w-4" /></Link>
          </header>
          {transactionsList}
        </section>
        <UpcomingActivities limit={2} />
      </div>
    </div>
  );
}
