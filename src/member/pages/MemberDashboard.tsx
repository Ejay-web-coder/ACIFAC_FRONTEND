import { useState } from 'react';
import { AlertCircle, AlertTriangle, Banknote, CalendarDays, ChevronRight, CircleCheck, TrendingUp, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../app/components/common/UiKit';
import { UserRole } from '../../app/App';
import { usePageHeading } from '../../app/components/pageHeading';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { sumMoney } from '../../utils/money';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';
import { UpcomingActivities } from '../components/UpcomingActivities';
import { useMyDividend } from '../components/MemberDividend';

interface MemberDashboardProps {
  userRole: UserRole;
}

const GOLD = '#f3c443';
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Whole days from today to a YYYY-MM-DD date (negative when it has passed). */
const daysUntil = (date: string) => Math.round((Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${dateOnlyToday()}T00:00:00Z`)) / 86400000);

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
  // This year's dividend and patronage refund so far, added to the savings.
  const { dividend, error: dividendError } = useMyDividend(undefined, userRole === 'member');
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3"><Skeleton className="col-span-2 h-32 rounded-2xl lg:col-span-1" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const { loans, payments } = memberData;
  const activeLoans = loans.filter((loan) => loan.status === 'active' || loan.status === 'overdue');
  const loanBalance = sumMoney(activeLoans.map((loan) => loan.balance));
  const nextLoan = activeLoans.filter((loan) => loan.nextPaymentDate).sort((left, right) => String(left.nextPaymentDate).localeCompare(String(right.nextPaymentDate)))[0];
  const recentPayments = payments.slice(0, 2);
  const isOverdue = nextLoan?.status === 'overdue';
  const nextAmount = nextLoan ? (isOverdue ? Number(nextLoan.overdueAmount) : Number(nextLoan.nextAmountDue ?? nextLoan.monthlyPayment)) : 0;
  const daysLeft = nextLoan?.nextPaymentDate ? daysUntil(String(nextLoan.nextPaymentDate)) : null;

  // Your total savings: the savings deposits, plus this year's dividend and patronage refund so far.
  const savings = memberData.savings?.total ?? 0;
  const dividendAmount = dividend?.dividend ?? 0;
  const patronageAmount = dividend?.patronage.refund ?? 0;
  const total = sumMoney([savings, dividendAmount, patronageAmount]);
  const ready = Boolean(dividend || dividendError);
  const year = dividend?.year ?? Number(dateOnlyToday().slice(0, 4));
  const share = (part: number) => (total > 0 ? `${(part / total) * 100}%` : '0%');
  const loansText = `${activeLoans.length} active ${activeLoans.length === 1 ? 'loan' : 'loans'}`;

  const breakdown = (
    <div className="rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 lg:p-4">
      <h2 className="text-sm font-bold">How your savings add up</h2>
      {/* The parts of the total, as one bar: savings, dividend, patronage refund. */}
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <span className="bg-white" style={{ width: share(savings) }} />
        <span style={{ width: share(dividendAmount), background: GOLD }} />
        <span className="bg-green-400" style={{ width: share(patronageAmount) }} />
      </div>
      <dl className="mt-2.5 space-y-1.5 text-xs lg:space-y-2 lg:text-sm">
        {([
          ['', 'bg-white', 'Savings deposits', peso(savings)],
          ['+', '', `Dividend for ${year}`, dividend ? peso(dividendAmount) : dividendError ? 'n/a' : '…'],
          ['+', 'bg-green-400', `Patronage refund for ${year}`, dividend ? peso(patronageAmount) : dividendError ? 'n/a' : '…'],
        ] as const).map(([sign, swatch, label, value]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-3 text-white/60" aria-hidden="true">{sign}</span>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${swatch}`} style={swatch ? undefined : { background: GOLD }} aria-hidden="true" />
            <dt className="min-w-0 flex-1 text-white/90">{label}</dt>
            <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-white/15 pt-2">
          <span className="w-3 text-white/60" aria-hidden="true">=</span>
          <dt className="min-w-0 flex-1 font-bold">Total savings</dt>
          <dd className="shrink-0 text-sm font-extrabold tabular-nums lg:text-base" style={{ color: GOLD }}>{ready ? peso(total) : '…'}</dd>
        </div>
      </dl>
      <p className="mt-2 hidden text-xs text-white/70 lg:block">
        {dividendError ? 'The dividend and patronage refund could not be loaded, so only your savings deposits are counted.' : `Dividend and patronage refund count what you have earned in ${year}${dividend?.yearComplete ? '' : ' so far'}.`}
      </p>
    </div>
  );

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

  // Fits one screen: the savings, the loan figures, then the recent transactions and activities.
  return (
    <div className="space-y-3 lg:space-y-4">
      {/* Your total savings */}
      <Link to="/member/savings" className="grid gap-3 rounded-3xl bg-[#1b3d26] p-4 text-white shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-raised)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-8 lg:p-7">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white/90 lg:text-lg">Your total savings</p>
          <div className="mt-1 text-[3.25rem] lg:mt-3 lg:text-[5.5rem]">
            {ready ? <BigMoney value={total} /> : <Skeleton className="h-14 w-60 rounded-xl bg-white/15 lg:h-24 lg:w-96" />}
          </div>
          <p className="mt-1.5 text-xs text-white/75 lg:mt-3 lg:text-sm">As of {formatDate(dateOnlyToday())}</p>
        </div>
        {breakdown}
      </Link>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        {/* Next loan payment: the reminder, with the days left. */}
        <section className={`col-span-2 rounded-2xl border p-3 shadow-[var(--shadow-card)] sm:p-4 lg:col-span-1 lg:p-5 ${isOverdue ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-[#fdf3d4]'}`} role={isOverdue ? 'alert' : undefined}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2.5 text-sm font-semibold text-gray-900">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white ring-1 ring-amber-200">{isOverdue ? <AlertTriangle className="h-4 w-4 text-red-700" /> : <CalendarDays className="h-4 w-4" />}</span>
              {isOverdue ? 'Overdue loan payment' : 'Next loan payment'}
            </h2>
            {daysLeft !== null && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isOverdue || daysLeft < 0 ? 'bg-red-100 text-red-800' : 'bg-white text-gray-800'}`}>
              {isOverdue || daysLeft < 0 ? 'Past due' : daysLeft === 0 ? 'Due today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
            </span>}
          </div>
          {nextLoan ? (
            <div className="mt-2 flex items-end justify-between gap-3 lg:block">
              <div className="min-w-0">
                <p className="truncate text-2xl font-extrabold tabular-nums text-gray-900 lg:text-3xl">{peso(nextAmount)}</p>
                <p className="text-sm font-medium text-gray-800">{isOverdue ? 'Please settle it at the ACIFAC office.' : `Due on ${formatDate(nextLoan.nextPaymentDate)}`}</p>
              </div>
              <Link to="/loan-status" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[#1b3d26] px-4 text-sm font-semibold text-white hover:bg-green-900 lg:mt-3">View loan details</Link>
            </div>
          ) : <p className="mt-2 text-sm text-gray-700">You have no loan payments due.</p>}
        </section>

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
