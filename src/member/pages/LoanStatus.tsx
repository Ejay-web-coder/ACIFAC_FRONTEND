import { useCallback, useEffect, useState } from 'react';
import { PhilippinePeso, Calendar, CheckCircle, TrendingDown, Plus } from 'lucide-react';
import { EmptyState, StatCard } from '../../app/components/common/UiKit';
import { PagedList } from '../../app/components/common/PagedList';
import { UserRole } from '../../app/App';
import { createMyLoanRequest, fetchMyMemberData } from '../../app/services/authApi';
import { toast } from 'sonner';
import { formatDate, formatDateTime } from '../../utils/dateTime';
import { LoanApplicationWizard, type LoanApplicationPayload } from '../../app/components/LoanApplicationWizard';
import type { Member } from '../../admin/pages/MembershipManagement';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { sumMoney } from '../../utils/money';

interface LoanStatusProps {
  userRole: UserRole;
}

interface Loan {
  id: string;
  loanType: string;
  amount: number;
  totalAmount: number;
  totalInterest: number;
  balance: number;
  interestRate: number;
  term: number;
  monthlyPayment: number;
  dateApproved: string;
  dueDate: string;
  nextPaymentDate: string;
  status: 'active' | 'paid' | 'overdue';
  paymentsMade: number;
  paymentsRemaining: number;
  totalPaid: number;
  overdueAmount: number;
  nextAmountDue: number | null;
}

interface Payment {
  id: string;
  loanId: string;
  amount: number;
  paymentDate: string;
  principalPaid: number;
  interestPaid: number;
  remainingBalance: number;
}

interface LoanRequest {
  id: number;
  loanType: string;
  amount: number;
  term: number;
  purpose: string;
  monthlyIncome: number;
  submittedAt: string;
  status: 'pending' | 'approved' | 'declined';
  reviewNotes?: string | null;
  totalRepayment?: number;
}

export function LoanStatus({ userRole }: LoanStatusProps) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loanRequests, setLoanRequests] = useState<LoanRequest[]>([]);
  const [applicationMember, setApplicationMember] = useState<Member | null>(null);
  const [showApplyLoanForm, setShowApplyLoanForm] = useState(false);
  const [activeSection, setActiveSection] = useState<'loans' | 'applications' | 'payments'>('loans');


  const loadLoanData = useCallback(() => fetchMyMemberData().then((data) => {
      setApplicationMember({
        id: data.member.id,
        name: data.member.full_name,
        memberId: data.member.member_number || String(data.member.id),
        email: data.member.email || '',
        phone: data.member.phone || '',
        address: data.member.address || '',
        dateJoined: data.member.membership_date,
        shareCapital: Number(data.member.share_capital || 0),
        status: data.member.status as Member['status'],
        archivedAt: null, archivedBy: null, idDocumentName: null, idDocumentType: null, idDocumentSize: null,
        createdAt: '', updatedAt: '',
        profile: {
          firstName: data.member.first_name || '', middleName: data.member.middle_name || '', lastName: data.member.last_name || '',
          birthday: data.member.date_of_birth || '', gender: data.member.gender || '', cpNo: data.member.phone || '',
          permanentAddress: data.member.address || '', barangay: data.member.barangay || '', municipality: data.member.municipality || '',
          province: data.member.province || '', civilStatus: data.member.civil_status || '', highestEducation: '', idType: '', idNo: '', rsbsaNo: '', livelihood: data.member.livelihood || '',
          farmArea: String(data.member.farm_area_ha ?? ''), cornArea: '', palayArea: '', yearlyIncome: '', spouseName: '', spouseAge: '', spouseContact: '', children: '', emergencyContact: '',
        },
      } as Member);
      setLoans(data.loans.map((loan) => ({
        id: loan.id,
        loanType: loan.loanType,
        amount: loan.amount,
        totalAmount: loan.totalAmount,
        totalInterest: loan.totalInterest,
        balance: loan.balance,
        interestRate: loan.interestRate,
        term: Number(loan.term),
        monthlyPayment: loan.monthlyPayment,
        dateApproved: loan.dateApproved,
        dueDate: loan.dueDate,
        nextPaymentDate: loan.nextPaymentDate || '',
        status: loan.status,
        paymentsMade: loan.paidInstallments,
        paymentsRemaining: Math.max(0, Number(loan.term) - loan.paidInstallments),
        totalPaid: loan.totalPaid,
        overdueAmount: loan.overdueAmount,
        nextAmountDue: loan.nextAmountDue,
      })));
      setPayments(data.payments.map((payment) => ({
        id: String(payment.id),
        loanId: payment.loanNumber || String(payment.loanId),
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        principalPaid: payment.principalPaid,
        interestPaid: payment.interestPaid,
        remainingBalance: payment.remainingBalance,
      })));
      setLoanRequests((data.loanRequests ?? []).map((request) => ({
        id: request.id,
        loanType: request.loanType,
        amount: request.amount,
        term: request.term,
        purpose: request.purpose,
        monthlyIncome: request.monthlyIncome,
        submittedAt: request.submittedAt,
        status: request.status,
        reviewNotes: request.reviewNotes,
        totalRepayment: request.totalRepayment,
      })));
    }).catch((error: Error) => toast.error('Unable to load loan status', { description: error.message })), []);

  useEffect(() => { void loadLoanData(); }, [loadLoanData]);
  // Refreshes when an admin approves, declines or records a payment (no polling).
  useLiveRefresh(['loans', 'loan_payments', 'loan_requests'], () => { void loadLoanData(); });

  if (userRole !== 'member') {
    return <div className="p-8">Access restricted to members only</div>;
  }



  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          
          <p className="text-gray-600 mt-1">View your loan details and payment history</p>
        </div>

        <button
          type="button"
          onClick={() => {
            setActiveSection('applications');
            setShowApplyLoanForm(true);
          }}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Apply Loan
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard label="Total Repayment (with interest)" value={`₱${sumMoney(loans.map((l) => l.totalAmount)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} icon={PhilippinePeso} tone="dark" />
        <StatCard label="Outstanding Balance" value={`₱${sumMoney(loans.map((l) => l.balance)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} icon={TrendingDown} tone="soft" />
        <StatCard label="Total Paid" value={`₱${sumMoney(payments.map((p) => p.amount)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} icon={CheckCircle} />
        <StatCard label="Next Payment" value={`₱${loans.find((loan) => loan.status === 'active')?.monthlyPayment.toLocaleString() || '0'}`} icon={Calendar} />
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 sm:grid sm:grid-cols-3" role="tablist" aria-label="Loan sections">
        {[
          { key: 'loans', label: 'Active Loans' },
          { key: 'applications', label: 'Loan Applications' },
          { key: 'payments', label: 'Payment History' }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveSection(tab.key as 'loans' | 'applications' | 'payments')}
            role="tab"
            aria-selected={activeSection === tab.key}
            className={`inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-all duration-200 ${
              activeSection === tab.key
                ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200'
                : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSection === 'loans' && (
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Active Loans</h2>
          <div className="space-y-4">
            {loans.filter(l => l.status === 'active' || l.status === 'overdue').length === 0 && <EmptyState icon={PhilippinePeso} title="No active loans" message="Loans released to you will appear here with their balance and next due date." compact />}
            {loans.filter(l => l.status === 'active' || l.status === 'overdue').map((loan) => (
              <div key={loan.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-gray-900">{loan.id}</h3>
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full capitalize">
                        {loan.loanType}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full capitalize ${
                        loan.status === 'overdue' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {loan.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">Approved on {formatDate(loan.dateApproved)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Maturity Date</p>
                    <p className="font-bold text-gray-900">{formatDate(loan.dueDate)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500">Original Amount</p>
                    <p className="text-sm font-medium text-gray-900">₱{loan.amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Repayment</p>
                    <p className="text-sm font-medium text-green-700">₱{loan.totalAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Current Balance</p>
                    <p className="text-sm font-medium text-gray-900">₱{loan.balance.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Interest Rate</p>
                    <p className="text-sm font-medium text-gray-900">{loan.interestRate}% flat (whole term)</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Monthly Payment</p>
                    <p className="text-sm font-medium text-gray-900">₱{loan.monthlyPayment.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600">Payment Progress</p>
                    <p className="text-sm font-medium text-gray-900">
                      {loan.paymentsMade} of {loan.term} payments made
                    </p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${(loan.paymentsMade / loan.term) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-yellow-600" />
                    <p className="text-sm text-yellow-800">
                      Next payment of ₱{loan.monthlyPayment.toLocaleString()} due on {formatDate(loan.nextPaymentDate)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'applications' && (
        loanRequests.length > 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Loan Applications</h2>
            <PagedList items={loanRequests} pageSize={5} label="applications" pagerClassName="-mx-6 -mb-6 mt-4">{(pageItems) => (
            <div className="space-y-3">
              {pageItems.map((request) => (
                <div key={request.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-gray-200 rounded-lg p-4">
                  <div>
                    <p className="font-medium text-gray-900">{request.loanType} loan - ₱{request.amount.toLocaleString()}</p>
                    <p className="text-sm text-gray-600">Submitted on {formatDateTime(request.submittedAt)}</p>
                    {request.status === 'declined' && request.reviewNotes && <p className="text-sm text-red-700">Reason: {request.reviewNotes}</p>}
                  </div>
                  <span className={`px-3 py-1 text-xs rounded-full capitalize w-fit ${
                    request.status === 'approved' ? 'bg-green-100 text-green-800' :
                    request.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {request.status}
                  </span>
                </div>
              ))}
            </div>
            )}</PagedList>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Loan Applications</h2>
            <p className="text-sm text-gray-600">There are no loan applications yet.</p>
          </div>
        )
      )}

      {activeSection === 'payments' && (
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Payment History</h2>
          <PagedList items={payments} label="payments" pagerClassName="-mx-6 -mb-6 mt-4">{(pageItems) => (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Principal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interest</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pageItems.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{payment.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(payment.paymentDate)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      ₱{payment.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      ₱{payment.principalPaid.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      ₱{payment.interestPaid.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      ₱{payment.remainingBalance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}</PagedList>
        </div>
      )}

      {/* Loan Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-bold text-blue-900 mb-2">Payment Information</h3>
        <div className="text-sm text-blue-800 space-y-1">
          <p>• Payments can be made at the ACIFAC office during business hours (Mon-Fri, 8:00 AM - 5:00 PM)</p>
          <p>• Late payments may incur additional charges</p>
          <p>• For payment concerns, please contact the cooperative office</p>
          <p>• Keep your payment receipts for your records</p>
        </div>
      </div>

      {showApplyLoanForm && (
        <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {applicationMember && <LoanApplicationWizard
              initialMember={applicationMember}
              hideEmail
              submitLabel="Submit application"
              onCancel={() => setShowApplyLoanForm(false)}
              onSubmit={async (application: LoanApplicationPayload) => {
                await createMyLoanRequest(application);
                setShowApplyLoanForm(false);
                void loadLoanData().catch(() => undefined);
                toast.success('Loan application submitted', { description: 'The cooperative team will review your request.' });
              }}
            />}
          </div>
        </div>
      )}
    </div>
  );
}
