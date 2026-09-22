import { useEffect, useState } from 'react';
import { User, PhilippinePeso, TrendingUp, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserRole } from '../../app/App';
import { fetchMyMemberData, MyMemberData } from '../../app/services/authApi';
import { formatDate } from '../../utils/dateTime';

interface MemberDashboardProps {
  userRole: UserRole;
}

export function MemberDashboard({ userRole }: MemberDashboardProps) {
  const [memberData, setMemberData] = useState<MyMemberData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMyMemberData().then(setMemberData).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load member data.'));
  }, []);

  if (userRole !== 'member') {
    return <div className="p-4 md:p-8 text-sm md:text-base">Access restricted to members only</div>;
  }

  if (error) return <div className="p-4 md:p-8 text-sm text-red-600">{error}</div>;
  if (!memberData) return <div className="p-4 md:p-8 text-sm text-gray-500">Loading your member data...</div>;

  const { member, loans, payments } = memberData;
  const activeLoans = loans.filter((loan) => loan.status === 'active' || loan.status === 'overdue');
  const loanBalance = activeLoans.reduce((total, loan) => total + Number(loan.balance || 0), 0);
  const nextLoan = activeLoans.filter((loan) => loan.next_payment_date).sort((left, right) => String(left.next_payment_date).localeCompare(String(right.next_payment_date)))[0];
  const recentPayments = payments.slice(0, 3);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Welcome Header - Responsive */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-4 md:p-6 text-white">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="p-3 md:p-4 bg-white/20 rounded-full flex-shrink-0">
            <User className="w-6 md:w-8 h-6 md:h-8" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold">Welcome back, {(member.first_name || member.full_name).split(' ')[0]}!</h1>
            <p className="text-sm md:text-base text-blue-100 mt-1 truncate">Member ID: {member.member_number || member.id}</p>
          </div>
        </div>
      </div>

      {/* Member Info Cards - Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-red-50 rounded-lg flex-shrink-0">
              <PhilippinePeso className="w-5 md:w-6 h-5 md:h-6 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-600">Total Loans</p>
              <p className="font-bold text-gray-900 text-base md:text-lg">₱{loanBalance.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-green-50 rounded-lg flex-shrink-0">
              <TrendingUp className="w-5 md:w-6 h-5 md:h-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-600">Share Capital</p>
              <p className="font-bold text-gray-900 text-base md:text-lg">₱{member.share_capital.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-orange-50 rounded-lg flex-shrink-0">
              <PhilippinePeso className="w-5 md:w-6 h-5 md:h-6 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-600">Active Loans</p>
              <p className="font-bold text-gray-900 text-base md:text-lg">{activeLoans.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-purple-50 rounded-lg flex-shrink-0">
              <Calendar className="w-5 md:w-6 h-5 md:h-6 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-600">Next Payment</p>
              <p className="font-bold text-gray-900 text-base md:text-lg">{nextLoan ? `₱${Number(nextLoan.monthly_payment).toLocaleString()}` : 'None'}</p>
              {nextLoan && <p className="text-xs text-gray-500 mt-1">Due: {formatDate(nextLoan.next_payment_date)}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Payment Alert - Responsive */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 md:p-5">
        <div className="flex items-start gap-3">
          <Calendar className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-bold text-sm md:text-base text-yellow-900">Upcoming Payment Reminder</h3>
            <p className="text-xs md:text-sm text-yellow-800 mt-1">
              {nextLoan ? `Your next loan payment of ₱${Number(nextLoan.monthly_payment).toLocaleString()} is due on ${formatDate(nextLoan.next_payment_date)}.` : 'You have no upcoming loan payments.'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions - Responsive */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <Link
          to="/loan-status"
          className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow touch-target"
        >
          <PhilippinePeso className="w-6 md:w-8 h-6 md:h-8 text-blue-600 mb-2 md:mb-3" />
          <h3 className="font-bold text-gray-900 text-sm md:text-base">My Loans</h3>
          <p className="text-xs md:text-sm text-gray-600 mt-1">View loan details and payment history</p>
        </Link>

        <Link
          to="/member-profile"
          className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow touch-target"
        >
          <User className="w-6 md:w-8 h-6 md:h-8 text-purple-600 mb-2 md:mb-3" />
          <h3 className="font-bold text-gray-900 text-sm md:text-base">My Profile</h3>
          <p className="text-xs md:text-sm text-gray-600 mt-1">View and update your information</p>
        </Link>
      </div>

      {/* Recent Transactions - Responsive */}
      <div className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-200">
        <h2 className="text-base md:text-lg font-bold text-gray-900 mb-3 md:mb-4">Recent Transactions</h2>
        <div className="space-y-3 md:space-y-4 overflow-x-auto">
          {recentPayments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between pb-3 md:pb-4 border-b border-gray-100 last:border-0 last:pb-0 gap-2"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm md:text-base">Loan payment</p>
                <p className="text-xs md:text-sm text-gray-500">{formatDate(payment.payment_date)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900 text-sm md:text-base">₱{Number(payment.amount).toLocaleString()}</p>
                <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full inline-block mt-1">
                  Completed
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
