import { User, PhilippinePeso, TrendingUp, Calendar, AlertTriangle, CalendarCheck, ChevronRight, Receipt, AlertCircle } from 'lucide-react';
import { EmptyState, Skeleton, StatCard, StatusBadge } from '../../app/components/common/UiKit';
import { Link } from 'react-router-dom';
import { UserRole } from '../../app/App';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { sumMoney } from '../../utils/money';
import { formatDate } from '../../utils/dateTime';

interface MemberDashboardProps {
  userRole: UserRole;
}

export function MemberDashboard({ userRole }: MemberDashboardProps) {
  const { memberData, error } = useMyMemberData();

  if (userRole !== 'member') {
    return <div className="p-4 md:p-8 text-sm md:text-base">Access restricted to members only</div>;
  }

  if (error) return <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>;
  if (!memberData) {
    return (
      <div className="space-y-4 md:space-y-6" role="status" aria-label="Loading your member data">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const { member, loans, payments } = memberData;
  const activeLoans = loans.filter((loan) => loan.status === 'active' || loan.status === 'overdue');
  const loanBalance = sumMoney(activeLoans.map((loan) => loan.balance));
  const nextLoan = activeLoans.filter((loan) => loan.nextPaymentDate).sort((left, right) => String(left.nextPaymentDate).localeCompare(String(right.nextPaymentDate)))[0];
  const recentPayments = payments.slice(0, 3);

  const nextDue = nextLoan ? `₱${Number(nextLoan.nextAmountDue ?? nextLoan.monthlyPayment).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'None';
  const isOverdue = nextLoan?.status === 'overdue';
  const quickLinks = [
    { to: '/loan-status', icon: PhilippinePeso, title: 'My Loans', text: 'View loan details and payment history' },
    { to: '/member-profile', icon: User, title: 'My Profile', text: 'View and update your information' },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Welcome header */}
      <div className="relative overflow-hidden rounded-2xl bg-green-700 p-5 text-white shadow-[var(--shadow-card)] md:p-6">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-green-500/40" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-green-600/60" aria-hidden="true" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 md:h-14 md:w-14">
            <User className="h-6 w-6 md:h-7 md:w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold md:text-2xl">Welcome back, {(member.first_name || member.full_name).split(' ')[0]}!</h1>
            <p className="mt-0.5 truncate text-sm text-green-100">Member ID: {member.member_number || member.id}</p>
          </div>
        </div>
      </div>

      {/* Key figures: 2 columns on phones, 4 on desktops */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Total Loans" value={`₱${loanBalance.toLocaleString()}`} icon={PhilippinePeso} tone="dark" />
        <StatCard label="Share Capital" value={`₱${member.share_capital.toLocaleString()}`} icon={TrendingUp} />
        <StatCard label="Active Loans" value={activeLoans.length} icon={Receipt} tone="soft" />
        <StatCard label="Next Payment" value={nextDue} icon={Calendar} tone={isOverdue ? 'warning' : 'green'} detail={nextLoan ? `Due: ${formatDate(nextLoan.nextPaymentDate)}` : undefined} />
      </div>

      {/* Upcoming payment reminder */}
      <div className={`flex items-start gap-3 rounded-2xl border p-4 md:p-5 ${isOverdue ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`} role={isOverdue ? 'alert' : undefined}>
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isOverdue ? 'bg-amber-100 text-amber-700' : 'bg-white text-green-700 ring-1 ring-green-200'}`}>
          {isOverdue ? <AlertTriangle className="h-5 w-5" /> : <CalendarCheck className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <h3 className={`text-sm font-semibold md:text-base ${isOverdue ? 'text-amber-900' : 'text-green-900'}`}>Upcoming Payment Reminder</h3>
          <p className={`mt-1 text-sm ${isOverdue ? 'text-amber-800' : 'text-green-800'}`}>
            {!nextLoan ? 'You have no upcoming loan payments.' : nextLoan.status === 'overdue' ? `Your loan ${nextLoan.id} is overdue: ₱${nextLoan.overdueAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} is past due. Please settle it at the ACIFAC office.` : `Your next loan payment of ₱${Number(nextLoan.nextAmountDue ?? nextLoan.monthlyPayment).toLocaleString('en-PH', { minimumFractionDigits: 2 })} is due on ${formatDate(nextLoan.nextPaymentDate)}.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Quick links */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:order-2 lg:grid-cols-1 lg:content-start">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.to} to={link.to} className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:border-green-200 hover:shadow-[var(--shadow-raised)] md:p-5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white group-hover:bg-green-700"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{link.title}</span>
                  <span className="mt-0.5 block text-sm text-gray-600">{link.text}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-green-700" />
              </Link>
            );
          })}
        </div>

        {/* Recent transactions */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)] lg:order-1 lg:col-span-2">
          <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 md:px-5">
            <h2 className="text-base font-semibold text-gray-900">Recent Transactions</h2>
            <Link to="/transaction" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-green-700 hover:bg-green-50">View all<ChevronRight className="h-4 w-4" /></Link>
          </header>
          {recentPayments.length ? (
            <ul className="divide-y divide-gray-100">
              {recentPayments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700 ring-1 ring-green-100"><Receipt className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">Loan payment</p>
                      <p className="text-sm text-gray-500">{formatDate(payment.paymentDate)}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums text-gray-900">₱{Number(payment.amount).toLocaleString()}</p>
                    <StatusBadge status="completed" className="mt-1" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Receipt} title="No transactions yet" message="Your loan payments will appear here once they are recorded." compact />
          )}
        </section>
      </div>
    </div>
  );
}
