import { User, Mail, Phone, MapPin, Calendar, CreditCard } from 'lucide-react';
import { UserRole } from '../../app/App';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { sumMoney } from '../../utils/money';
import { formatDate } from '../../utils/dateTime';

interface MemberProfileProps {
  userRole: UserRole;
}

export function MemberProfile({ userRole }: MemberProfileProps) {
  const { memberData, error } = useMyMemberData();

  if (userRole !== 'member') {
    return <div className="p-8">Access restricted to members only</div>;
  }

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!memberData) return <div className="p-8 text-sm text-gray-500">Loading your member data...</div>;

  const { member, loans, payments, shareDetails } = memberData;
  const address = [member.address, member.barangay, member.municipality, member.province].filter(Boolean).join(', ');
  const totalLoanBalance = sumMoney(loans.map((loan) => loan.balance));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-gray-600 mt-1">View your personal and membership information</p>
      </div>

      {/* Profile Overview */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-start gap-6">
          <div className="p-6 bg-blue-50 rounded-full">
            <User className="w-16 h-16 text-blue-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{member.full_name}</h2>
            <p className="text-gray-600 mt-1">Member ID: {member.member_number || member.id}</p>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Personal Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Mail className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Email Address</p>
              <p className="font-medium text-gray-900">{member.email || 'Not provided'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Phone className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Phone Number</p>
              <p className="font-medium text-gray-900">{member.phone || 'Not provided'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <MapPin className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Address</p>
              <p className="font-medium text-gray-900">{address || 'Not provided'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Calendar className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Member Since</p>
              <p className="font-medium text-gray-900">{formatDate(member.membership_date)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Financial Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-blue-700">Share Capital</p>
            </div>
            <p className="text-2xl font-bold text-blue-900">
              ₱{member.share_capital.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-700">Savings Deposits</p>
            </div>
            <p className="text-2xl font-bold text-green-900">
              ₱{(memberData.savings?.total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-5 h-5 text-purple-600" />
              <p className="text-sm text-purple-700">Dividends Earned</p>
            </div>
            <p className="text-2xl font-bold text-purple-900">
              ₱{totalLoanBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-orange-600" />
              <p className="text-sm text-orange-700">Last Dividend</p>
            </div>
            <p className="text-lg font-bold text-orange-900">
              {loans.length} loan{loans.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-green-200 bg-green-50 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-green-900">My Share Contributions</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Share Capital</p><p className="mt-1 text-lg font-bold text-green-700">₱{shareDetails.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p></div>
          <div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Maximum</p><p className="mt-1 text-lg font-bold text-gray-900">₱{shareDetails.maximum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p></div>
          <div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Remaining</p><p className="mt-1 text-lg font-bold text-blue-700">₱{shareDetails.remaining.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p></div>
          <div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contributions</p><p className="mt-1 text-lg font-bold text-gray-900">{shareDetails.contributions.length}</p></div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-green-100"><div className="h-full rounded-full bg-green-600" style={{ width: `${Math.min(100, (shareDetails.total / shareDetails.maximum) * 100)}%` }} /></div>
        <div className="mt-5 overflow-x-auto"><h3 className="mb-3 font-semibold text-gray-900">Contribution History</h3><table className="min-w-full text-sm"><thead className="bg-green-100"><tr><th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Amount</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Payment Method</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Reference</th></tr></thead><tbody className="divide-y divide-green-100">{shareDetails.contributions.map((contribution) => <tr key={contribution.id}><td className="px-3 py-2 whitespace-nowrap">{formatDate(contribution.contributionDate)}</td><td className="px-3 py-2 font-medium text-green-700">₱{contribution.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td><td className="px-3 py-2">{contribution.paymentMethod || '—'}</td><td className="px-3 py-2">{contribution.referenceNumber || '—'}</td></tr>)}</tbody></table></div>
      </div>

      <div className="rounded-lg border border-green-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Loan Payments</h2>
            <p className="mt-1 text-sm text-gray-600">Payments linked to your member record</p>
          </div>
          <span className="w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Active</span>
        </div>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-green-50 p-5 sm:col-span-1">
            <div className="mb-2 flex items-center gap-2 text-green-700"><CreditCard className="h-5 w-5" /><p className="text-sm font-medium">Total Loan Balance</p></div>
            <p className="text-3xl font-bold text-green-900">₱{totalLoanBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-5"><p className="mb-2 text-sm font-medium text-gray-600">Last Payment</p><p className="text-2xl font-bold text-gray-900">{payments[0] ? `₱${Number(payments[0].amount).toLocaleString()}` : 'None'}</p></div>
          <div className="rounded-lg bg-gray-50 p-5"><p className="mb-2 text-sm font-medium text-gray-600">Payments</p><p className="text-2xl font-bold text-gray-900">{payments.length}</p></div>
        </div>
        <div className="overflow-x-auto">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent Loan Payments</h3>
          <table className="w-full min-w-[560px]"><thead className="border-y border-gray-200 bg-gray-50"><tr>{['Date', 'Amount', 'Remaining Balance', 'Status'].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">{payments.slice(0, 5).map((payment) => <tr key={payment.id}><td className="px-4 py-3 text-sm text-gray-600">{formatDate(payment.paymentDate)}</td><td className="px-4 py-3 text-sm font-semibold text-gray-900">₱{Number(payment.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td><td className="px-4 py-3 text-sm text-gray-900">₱{Number(payment.remainingBalance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td><td className="px-4 py-3"><span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Completed</span></td></tr>)}</tbody>
          </table>
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-bold text-blue-900 mb-2">Need to Update Your Information?</h3>
        <p className="text-sm text-blue-800">
          To update your personal information, please visit the ACIFAC office during business hours
          or contact us at <span className="font-medium">info@acifac.org</span> or{' '}
          <span className="font-medium">+63 XXX XXX XXXX</span>
        </p>
      </div>
    </div>
  );
}
