import { useEffect, useState } from 'react';
import { PhilippinePeso, Calendar, CheckCircle, TrendingDown, Plus } from 'lucide-react';
import { UserRole } from '../../app/App';
import { createMyLoanRequest, fetchMyMemberData } from '../../app/services/authApi';
import { toast } from 'sonner';
import { formatDate } from '../../utils/dateTime';
import { LoanApplicationWizard, type LoanApplicationPayload } from '../../app/components/LoanApplicationWizard';
import type { Member } from '../../admin/pages/MembershipManagement';

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
}

export function LoanStatus({ userRole }: LoanStatusProps) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loanRequests, setLoanRequests] = useState<LoanRequest[]>([]);
  const [applicationMember, setApplicationMember] = useState<Member | null>(null);
  const [showApplyLoanForm, setShowApplyLoanForm] = useState(false);
  const [activeSection, setActiveSection] = useState<'loans' | 'applications' | 'payments'>('loans');
  const [loanApplication, setLoanApplication] = useState({
    loanType: 'Agricultural',
    amount: 25000,
    term: 12,
    purpose: '',
    monthlyIncome: 20000
  });

  useEffect(() => {
    const loadLoanData = () => fetchMyMemberData().then((data) => {
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
        id: loan.loan_number,
        loanType: loan.loan_type,
        amount: Number(loan.amount),
        totalAmount: Number((Number(loan.amount) * (1 + Number(loan.interest_rate) / 100)).toFixed(2)),
        totalInterest: Number((Number(loan.amount) * Number(loan.interest_rate) / 100).toFixed(2)),
        balance: Number(loan.balance),
        interestRate: Number(loan.interest_rate),
        term: Number(loan.term),
        monthlyPayment: Number(loan.monthly_payment),
        dateApproved: loan.date_approved,
        dueDate: loan.due_date,
        nextPaymentDate: loan.next_payment_date || '',
        status: loan.status,
        paymentsMade: data.payments.filter((payment) => payment.loan_id === loan.id).length,
        paymentsRemaining: Math.max(0, Number(loan.term) - data.payments.filter((payment) => payment.loan_id === loan.id).length),
      })));
      setPayments(data.payments.map((payment) => ({
        id: String(payment.id),
        loanId: String(payment.loan_id),
        amount: Number(payment.amount),
        paymentDate: payment.payment_date,
        principalPaid: Number(payment.principal_paid),
        interestPaid: Number(payment.interest_paid),
        remainingBalance: Number(payment.remaining_balance),
      })));
      setLoanRequests((data.loanRequests ?? []).map((request) => ({
        id: request.id,
        loanType: request.loan_type,
        amount: Number(request.amount),
        term: request.term,
        purpose: request.purpose,
        monthlyIncome: Number(request.monthly_income),
        submittedAt: request.submitted_at,
        status: request.status,
      })));
    }).catch((error: Error) => toast.error('Unable to load loan status', { description: error.message }));

    loadLoanData();
    window.addEventListener('focus', loadLoanData);
    const refreshTimer = window.setInterval(loadLoanData, 30000);
    return () => {
      window.removeEventListener('focus', loadLoanData);
      window.clearInterval(refreshTimer);
    };
  }, []);

  if (userRole !== 'member') {
    return <div className="p-8">Access restricted to members only</div>;
  }

  const handleApplicationChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setLoanApplication(prev => ({
      ...prev,
      [name]: name === 'amount' || name === 'term' || name === 'monthlyIncome' ? Number(value) : value
    }));
  };

  const handleApplyLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { request } = await createMyLoanRequest(loanApplication);
      const submittedRequest = request as { id: number; loanType: string; amount: number; term: number; purpose: string; monthlyIncome: number; submittedAt: string; status: 'pending' | 'approved' | 'declined' };
      setLoanRequests((current) => [{ ...submittedRequest }, ...current]);
      setShowApplyLoanForm(false);
      setLoanApplication({ loanType: 'Agricultural', amount: 25000, term: 12, purpose: '', monthlyIncome: 20000 });
      toast.success('Loan application submitted', { description: 'The cooperative team will review your request.' });
    } catch (error) {
      toast.error('Unable to submit loan application', { description: (error as Error).message });
    }
  };

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
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          <Plus className="w-5 h-5" />
          Apply Loan
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <PhilippinePeso className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Repayment (with interest)</p>
              <p className="text-2xl font-bold text-gray-900">
                ₱{loans.reduce((sum, l) => sum + l.totalAmount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-50 rounded-lg">
              <TrendingDown className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Outstanding Balance</p>
              <p className="text-2xl font-bold text-gray-900">
                ₱{loans.reduce((sum, l) => sum + l.balance, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Paid</p>
              <p className="text-2xl font-bold text-gray-900">
                ₱{payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Next Payment</p>
              <p className="text-2xl font-bold text-gray-900">
                ₱{loans.find((loan) => loan.status === 'active')?.monthlyPayment.toLocaleString() || '0'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-gray-200 bg-gray-100 p-2 shadow-sm sm:grid-cols-3">
        {[
          { key: 'loans', label: 'Active Loans' },
          { key: 'applications', label: 'Loan Applications' },
          { key: 'payments', label: 'Payment History' }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveSection(tab.key as 'loans' | 'applications' | 'payments')}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
              activeSection === tab.key
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200'
                : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSection === 'loans' && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Active Loans</h2>
          <div className="space-y-4">
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
                    <p className="text-sm text-gray-600">Approved on {loan.dateApproved}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Maturity Date</p>
                    <p className="font-bold text-gray-900">{loan.dueDate}</p>
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
                    <p className="text-sm font-medium text-gray-900">{loan.interestRate}% per annum</p>
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
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Loan Applications</h2>
            <div className="space-y-3">
              {loanRequests.map((request) => (
                <div key={request.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-gray-200 rounded-lg p-4">
                  <div>
                    <p className="font-medium text-gray-900">{request.loanType} loan - ₱{request.amount.toLocaleString()}</p>
                    <p className="text-sm text-gray-600">Submitted on {request.submittedAt}</p>
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
          </div>
        ) : (
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Loan Applications</h2>
            <p className="text-sm text-gray-600">There are no loan applications yet.</p>
          </div>
        )
      )}

      {activeSection === 'payments' && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Payment History</h2>
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
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{payment.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{payment.paymentDate}</td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {applicationMember && <LoanApplicationWizard
              initialMember={applicationMember}
              submitLabel="Submit application"
              onCancel={() => setShowApplyLoanForm(false)}
              onSubmit={async (application: LoanApplicationPayload) => {
                const { request } = await createMyLoanRequest(application);
                setLoanRequests((current) => [{ ...(request as LoanRequest) }, ...current]);
                setShowApplyLoanForm(false);
                toast.success('Loan application submitted', { description: 'The cooperative team will review your request.' });
              }}
            />}
          </div>
        </div>
      )}
      {false && showApplyLoanForm && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-xl font-bold text-gray-900">Apply for a Loan</h2>
              <button
                type="button"
                onClick={() => setShowApplyLoanForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApplyLoanSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loan Type</label>
                <select
                  name="loanType"
                  value={loanApplication.loanType}
                  onChange={handleApplicationChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="Agricultural">Agricultural</option>
                  <option value="Personal">Personal</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Business">Business</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loan Amount</label>
                  <input
                    type="number"
                    name="amount"
                    value={loanApplication.amount}
                    onChange={handleApplicationChange}
                    min="1000"
                    step="1000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term (months)</label>
                  <input
                    type="number"
                    name="term"
                    value={loanApplication.term}
                    onChange={handleApplicationChange}
                    min="1"
                    max="60"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Income</label>
                <input
                  type="number"
                  name="monthlyIncome"
                  value={loanApplication.monthlyIncome}
                  onChange={handleApplicationChange}
                  min="0"
                  step="1000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                <textarea
                  name="purpose"
                  value={loanApplication.purpose}
                  onChange={handleApplicationChange}
                  rows={4}
                  required
                  placeholder="Describe why you need the loan"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Submit Application
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplyLoanForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
