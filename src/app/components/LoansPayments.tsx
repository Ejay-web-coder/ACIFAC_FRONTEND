import { useEffect, useState } from 'react';
import { Search, Plus, PhilippinePeso, Clock, CheckCircle, AlertCircle, X, Download, Eye } from 'lucide-react';
import { UserRole } from '../App';
import { dateOnlyToday } from '../../utils/dateTime';
import { toast } from 'sonner';

interface Loan {
  id: string;
  memberId: string;
  memberName: string;
  loanType: 'agricultural' | 'personal' | 'emergency';
  amount: number;
  balance: number;
  interestRate: number;
  term: number;
  status: 'active' | 'paid' | 'overdue';
  dateApproved: string;
  dueDate: string;
  nextPaymentDate: string;
  monthlyPayment: number;
}

interface Payment {
  id: string;
  loanId: string;
  memberName: string;
  amount: number;
  paymentDate: string;
  principalPaid: number;
  interestPaid: number;
  remainingBalance: number;
}

interface LoanRequest {
  id: string;
  memberName: string;
  memberId: string;
  loanType: string;
  amount: number;
  term: number;
  purpose: string;
  monthlyIncome: number;
  submittedAt: string;
  status: 'pending' | 'approved' | 'declined';
}

const loanRequestStorageKey = 'acifac-loan-requests';

const readLoanRequests = (): LoanRequest[] => {
  try {
    return JSON.parse(localStorage.getItem(loanRequestStorageKey) || '[]') as LoanRequest[];
  } catch {
    return [];
  }
};

const mockLoans: Loan[] = [
  {
    id: 'L-2024-001',
    memberId: 'ACIFAC-2024-001',
    memberName: 'Juan Dela Cruz',
    loanType: 'agricultural',
    amount: 50000,
    balance: 35000,
    interestRate: 8,
    term: 12,
    status: 'active',
    dateApproved: '2024-01-15',
    dueDate: '2025-01-15',
    nextPaymentDate: '2026-05-15',
    monthlyPayment: 4500
  },
  {
    id: 'L-2024-002',
    memberId: 'ACIFAC-2024-002',
    memberName: 'Maria Santos',
    loanType: 'personal',
    amount: 30000,
    balance: 15000,
    interestRate: 10,
    term: 12,
    status: 'active',
    dateApproved: '2024-02-20',
    dueDate: '2025-02-20',
    nextPaymentDate: '2026-05-20',
    monthlyPayment: 2800
  },
  {
    id: 'L-2024-003',
    memberId: 'ACIFAC-2024-003',
    memberName: 'Pedro Reyes',
    loanType: 'emergency',
    amount: 20000,
    balance: 5000,
    interestRate: 6,
    term: 6,
    status: 'active',
    dateApproved: '2024-03-10',
    dueDate: '2024-09-10',
    nextPaymentDate: '2026-05-10',
    monthlyPayment: 3500
  },
  {
    id: 'L-2023-045',
    memberId: 'ACIFAC-2023-025',
    memberName: 'Ana Garcia',
    loanType: 'agricultural',
    amount: 100000,
    balance: 0,
    interestRate: 8,
    term: 24,
    status: 'paid',
    dateApproved: '2023-04-05',
    dueDate: '2025-04-05',
    nextPaymentDate: '-',
    monthlyPayment: 0
  },
];

const mockPayments: Payment[] = [
  {
    id: 'P-001',
    loanId: 'L-2024-001',
    memberName: 'Juan Dela Cruz',
    amount: 4500,
    paymentDate: '2026-04-15',
    principalPaid: 4000,
    interestPaid: 500,
    remainingBalance: 35000
  },
  {
    id: 'P-002',
    loanId: 'L-2024-002',
    memberName: 'Maria Santos',
    amount: 2800,
    paymentDate: '2026-04-20',
    principalPaid: 2500,
    interestPaid: 300,
    remainingBalance: 15000
  },
];

interface LoansPaymentsProps {
  userRole: UserRole;
}

export function LoansPayments({ userRole }: LoansPaymentsProps) {
  const [loans, setLoans] = useState<Loan[]>(mockLoans);
  const [loanRequests, setLoanRequests] = useState<LoanRequest[]>(readLoanRequests);
  const [activeTab, setActiveTab] = useState<'loans' | 'payments' | 'requests'>('loans');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paid' | 'overdue'>('all');
  const [showAddLoanModal, setShowAddLoanModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState<Loan | null>(null);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<Payment | null>(null);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentDate: dateOnlyToday()
  });
  const [loanFormData, setLoanFormData] = useState({
    memberName: '',
    memberId: '',
    loanType: 'agricultural' as 'agricultural' | 'personal' | 'emergency',
    amount: '',
    interestRate: '8',
    term: '12'
  });

  const filteredLoans = loans.filter(loan => {
    const matchesSearch = loan.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         loan.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || loan.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const filteredPayments = mockPayments.filter(payment =>
    payment.memberName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalActive = loans.filter(l => l.status === 'active').length;
  const totalDisbursed = loans.reduce((sum, l) => sum + l.amount, 0);
  const totalOutstanding = loans.reduce((sum, l) => sum + l.balance, 0);
  const totalCollected = mockPayments.reduce((sum, p) => sum + p.amount, 0);

  const canEdit = userRole === 'admin';

  useEffect(() => {
    const refreshRequests = () => setLoanRequests(readLoanRequests());
    window.addEventListener('storage', refreshRequests);
    window.addEventListener('acifac-loan-request', refreshRequests);
    return () => {
      window.removeEventListener('storage', refreshRequests);
      window.removeEventListener('acifac-loan-request', refreshRequests);
    };
  }, []);

  const updateLoanRequestStatus = (request: LoanRequest, status: 'approved' | 'declined') => {
    const updatedRequests = loanRequests.map(current =>
      current.id === request.id ? { ...current, status } : current
    );
    setLoanRequests(updatedRequests);
    localStorage.setItem(loanRequestStorageKey, JSON.stringify(updatedRequests));

    if (status === 'approved') {
      const amount = request.amount;
      const monthlyPayment = Math.round((amount * 1.08) / request.term);
      const newLoan: Loan = {
        id: `L-2026-${String(loans.length + 1).padStart(3, '0')}`,
        memberId: request.memberId,
        memberName: request.memberName,
        loanType: request.loanType.toLowerCase() as Loan['loanType'],
        amount,
        balance: amount,
        interestRate: 8,
        term: request.term,
        status: 'active',
        dateApproved: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + request.term * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        monthlyPayment
      };
      setLoans(currentLoans => [...currentLoans, newLoan]);
    }

    toast.success(status === 'approved' ? 'Loan request approved' : 'Loan request declined', {
      description: `${request.memberName}'s request ${request.id} was ${status}.`
    });
  };

  const handleAddLoan = (e: React.FormEvent) => {
    e.preventDefault();

    const amount = Number(loanFormData.amount);
    const interestRate = Number(loanFormData.interestRate);
    const term = Number(loanFormData.term);
    const monthlyPayment = Math.round((amount * (1 + interestRate / 100)) / term);

    const newLoan: Loan = {
      id: `L-2024-${String(loans.length + 1).padStart(3, '0')}`,
      memberId: loanFormData.memberId,
      memberName: loanFormData.memberName,
      loanType: loanFormData.loanType,
      amount: amount,
      balance: amount,
      interestRate: interestRate,
      term: term,
      status: 'active',
      dateApproved: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + term * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      monthlyPayment: monthlyPayment
    };

    setLoans([...loans, newLoan]);
    setShowAddLoanModal(false);
    setLoanFormData({
      memberName: '',
      memberId: '',
      loanType: 'agricultural',
      amount: '',
      interestRate: '8',
      term: '12'
    });
    toast.success('Loan approved successfully!', {
      description: `${newLoan.id} for ₱${amount.toLocaleString()} has been disbursed`
    });
  };

  const handleRecordPayment = (loan: Loan) => {
    setSelectedLoanForPayment(loan);
    setPaymentData({
      amount: loan.monthlyPayment.toString(),
      paymentDate: dateOnlyToday()
    });
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoanForPayment) return;

    const paymentAmount = Number(paymentData.amount);
    const newBalance = Math.max(0, selectedLoanForPayment.balance - paymentAmount);
    const loanStatus = newBalance === 0 ? 'paid' : selectedLoanForPayment.status;

    setLoans(loans.map(l => 
      l.id === selectedLoanForPayment.id 
        ? {
            ...l,
            balance: newBalance,
            status: loanStatus,
            nextPaymentDate: newBalance > 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : '-'
          }
        : l
    ));

    setShowPaymentModal(false);
    setSelectedLoanForPayment(null);
    setPaymentData({ amount: '', paymentDate: '' });
    
    toast.success('Payment recorded successfully!', {
      description: `₱${paymentAmount.toLocaleString()} payment applied to ${selectedLoanForPayment.memberName}'s loan`
    });
  };

  const handleViewReceipt = (payment: Payment) => {
    setSelectedPaymentForReceipt(payment);
    setShowReceiptModal(true);
  };

  const handleDownloadReceipt = (payment: Payment) => {
    const receiptContent = generateReceiptHTML(payment);
    const element = document.createElement('a');
    const file = new Blob([receiptContent], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    element.download = `Receipt-${payment.id}.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success('Receipt downloaded!', {
      description: `Receipt for payment ${payment.id} has been downloaded`
    });
  };

  const generateReceiptHTML = (payment: Payment) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Receipt - ${payment.id}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .receipt-container { border: 1px solid #ddd; border-radius: 8px; padding: 30px; background: white; }
          .receipt-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .receipt-title { font-size: 24px; font-weight: bold; margin: 0; }
          .receipt-subtitle { color: #666; margin: 5px 0 0 0; }
          .receipt-section { margin: 20px 0; }
          .receipt-label { font-weight: bold; color: #333; }
          .receipt-value { color: #666; margin-left: 10px; }
          .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .receipt-summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .receipt-total { font-size: 18px; font-weight: bold; color: #28a745; }
          .receipt-footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
          .amount { text-align: right; }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="receipt-header">
            <h1 class="receipt-title">PAYMENT RECEIPT</h1>
            <p class="receipt-subtitle">ACIFAC Cooperative</p>
          </div>
          
          <div class="receipt-section">
            <div class="receipt-row">
              <span class="receipt-label">Receipt Number:</span>
              <span class="receipt-value">${payment.id}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Date:</span>
              <span class="receipt-value">${payment.paymentDate}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Member Name:</span>
              <span class="receipt-value">${payment.memberName}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Loan ID:</span>
              <span class="receipt-value">${payment.loanId}</span>
            </div>
          </div>

          <div class="receipt-summary">
            <h3 style="margin-top: 0;">Payment Details</h3>
            <div class="receipt-row">
              <span class="receipt-label">Principal Paid:</span>
              <span class="receipt-value amount">₱${payment.principalPaid.toLocaleString()}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Interest Paid:</span>
              <span class="receipt-value amount">₱${payment.interestPaid.toLocaleString()}</span>
            </div>
            <div class="receipt-row" style="border-bottom: 2px solid #333; font-weight: bold;">
              <span class="receipt-label">Total Payment:</span>
              <span class="receipt-value amount receipt-total">₱${payment.amount.toLocaleString()}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Remaining Balance:</span>
              <span class="receipt-value amount">₱${payment.remainingBalance.toLocaleString()}</span>
            </div>
          </div>

          <div class="receipt-footer">
            <p>Thank you for your payment!</p>
            <p>This is a computer-generated receipt. No signature is required.</p>
            <p style="margin-top: 20px; color: #333;">Printed on ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          
          <p className="text-gray-600 mt-1">Track loan disbursements and payment collections</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddLoanModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            <Plus className="w-5 h-5" />
            New Loan
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <PhilippinePeso className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Active Loans</p>
              <p className="text-2xl font-bold text-gray-900">{totalActive}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Loans</p>
              <p className="text-2xl font-bold text-gray-900">₱{totalDisbursed.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-50 rounded-lg">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Balance</p>
              <p className="text-2xl font-bold text-gray-900">₱{totalOutstanding.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-lg">
              <PhilippinePeso className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Collected (This Month)</p>
              <p className="text-2xl font-bold text-gray-900">₱{totalCollected.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('loans')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'loans'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Loans
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'payments'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Payment History
            </button>
            {canEdit && (
              <button
                onClick={() => setActiveTab('requests')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'requests'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Loan Requests
                {loanRequests.some(request => request.status === 'pending') && (
                  <span className="ml-2 rounded-full bg-orange-100 px-2 py-1 text-xs text-orange-800">
                    {loanRequests.filter(request => request.status === 'pending').length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or loan ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            {activeTab === 'loans' && (
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'loans' ? (
            <div className="space-y-4">
              {filteredLoans.map((loan) => (
                <div key={loan.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-gray-900">{loan.memberName}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          loan.status === 'active' ? 'bg-green-100 text-green-800' :
                          loan.status === 'paid' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {loan.status}
                        </span>
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full capitalize">
                          {loan.loanType}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">Loan ID: {loan.id}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Loan Amount</p>
                          <p className="text-sm font-medium text-gray-900">₱{loan.amount.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Balance</p>
                          <p className="text-sm font-medium text-gray-900">₱{loan.balance.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Interest Rate</p>
                          <p className="text-sm font-medium text-gray-900">{loan.interestRate}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Monthly Payment</p>
                          <p className="text-sm font-medium text-gray-900">₱{loan.monthlyPayment.toLocaleString()}</p>
                        </div>
                      </div>
                      {loan.status === 'active' && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                          <p className="text-xs text-blue-600">
                            Next payment of ₱{loan.monthlyPayment.toLocaleString()} due on {loan.nextPaymentDate}
                          </p>
                        </div>
                      )}
                    </div>
                    {canEdit && loan.status === 'active' && (
                      <button 
                        onClick={() => handleRecordPayment(loan)}
                        className="ml-4 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium">
                        Record Payment
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'payments' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Principal</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interest</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{payment.id}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{payment.memberName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{payment.paymentDate}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">₱{payment.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">₱{payment.principalPaid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">₱{payment.interestPaid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">₱{payment.remainingBalance.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm flex gap-2">
                        <button
                          onClick={() => handleViewReceipt(payment)}
                          className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        <button
                          onClick={() => handleDownloadReceipt(payment)}
                          className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-xs font-medium"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Pending Loan Requests</h2>
                  <p className="text-sm text-gray-600 mt-1">Review applications submitted by members.</p>
                </div>
                <span className="px-3 py-1 text-sm font-medium rounded-full bg-orange-100 text-orange-800">
                  {loanRequests.filter(request => request.status === 'pending').length} pending
                </span>
              </div>
              {loanRequests.filter(request => request.status === 'pending').map(request => (
                <div key={request.id} className="border border-gray-200 rounded-lg p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-gray-900">{request.memberName}</h3>
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">{request.loanType}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{request.id} · {request.memberId} · Submitted {request.submittedAt}</p>
                    <p className="text-sm text-gray-700 mt-2">₱{request.amount.toLocaleString()} for {request.term} months · {request.purpose}</p>
                    <p className="text-xs text-gray-500 mt-1">Monthly income: ₱{request.monthlyIncome.toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => updateLoanRequestStatus(request, 'declined')} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium">
                      Decline
                    </button>
                    <button type="button" onClick={() => updateLoanRequestStatus(request, 'approved')} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                      Approve
                    </button>
                  </div>
                </div>
              ))}
              {loanRequests.filter(request => request.status === 'pending').length === 0 && (
                <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No pending loan requests.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Loan Modal */}
      {showAddLoanModal && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">New Loan Application</h2>
              <button
                onClick={() => setShowAddLoanModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddLoan}>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Member Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={loanFormData.memberName}
                      onChange={(e) => setLoanFormData({ ...loanFormData, memberName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter member name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Member ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={loanFormData.memberId}
                      onChange={(e) => setLoanFormData({ ...loanFormData, memberId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="ACIFAC-XXXX-XXX"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Loan Type *
                    </label>
                    <select
                      required
                      value={loanFormData.loanType}
                      onChange={(e) => setLoanFormData({ ...loanFormData, loanType: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="agricultural">Agricultural</option>
                      <option value="personal">Personal</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Loan Amount *
                    </label>
                    <input
                      type="number"
                      required
                      min="1000"
                      step="1000"
                      value={loanFormData.amount}
                      onChange={(e) => setLoanFormData({ ...loanFormData, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Interest Rate (%) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      max="20"
                      step="0.5"
                      value={loanFormData.interestRate}
                      onChange={(e) => setLoanFormData({ ...loanFormData, interestRate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="8"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Term (months) *
                    </label>
                    <select
                      required
                      value={loanFormData.term}
                      onChange={(e) => setLoanFormData({ ...loanFormData, term: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="6">6 months</option>
                      <option value="12">12 months</option>
                      <option value="18">18 months</option>
                      <option value="24">24 months</option>
                    </select>
                  </div>
                </div>
                {loanFormData.amount && loanFormData.interestRate && loanFormData.term && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                      Estimated monthly payment:
                      <span className="font-bold ml-2">
                        ₱{Math.round((Number(loanFormData.amount) * (1 + Number(loanFormData.interestRate) / 100)) / Number(loanFormData.term)).toLocaleString()}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddLoanModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Approve Loan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Recording Modal */}
      {showPaymentModal && selectedLoanForPayment && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Record Payment</h2>
              <p className="text-sm text-gray-600 mt-2">
                {selectedLoanForPayment.memberName} - {selectedLoanForPayment.id}
              </p>
            </div>
            <form onSubmit={handlePaymentSubmit}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Current Balance
                  </label>
                  <p className="text-2xl font-bold text-gray-900">
                    ₱{selectedLoanForPayment.balance.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Amount *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="100"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentData.paymentDate}
                    onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                {paymentData.amount && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-900">
                      New balance: <span className="font-bold">₱{Math.max(0, selectedLoanForPayment.balance - Number(paymentData.amount)).toLocaleString()}</span>
                    </p>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedLoanForPayment(null);
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt View Modal */}
      {showReceiptModal && selectedPaymentForReceipt && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Payment Receipt</h2>
              <button
                onClick={() => {
                  setShowReceiptModal(false);
                  setSelectedPaymentForReceipt(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8">
              <div className="border-b-2 border-gray-300 pb-6 mb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900">PAYMENT RECEIPT</h1>
                <p className="text-gray-600 mt-2">ACIFAC Cooperative</p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Receipt Number:</span>
                  <span className="text-gray-900">{selectedPaymentForReceipt.id}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Date:</span>
                  <span className="text-gray-900">{selectedPaymentForReceipt.paymentDate}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Member Name:</span>
                  <span className="text-gray-900">{selectedPaymentForReceipt.memberName}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Loan ID:</span>
                  <span className="text-gray-900">{selectedPaymentForReceipt.loanId}</span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2">
                    <span className="text-gray-700">Principal Paid:</span>
                    <span className="font-medium text-gray-900">₱{selectedPaymentForReceipt.principalPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-700">Interest Paid:</span>
                    <span className="font-medium text-gray-900">₱{selectedPaymentForReceipt.interestPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-b-2 border-gray-300 my-3">
                    <span className="text-lg font-bold text-gray-900">Total Payment:</span>
                    <span className="text-2xl font-bold text-green-600">₱{selectedPaymentForReceipt.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-700">Remaining Balance:</span>
                    <span className="font-medium text-gray-900">₱{selectedPaymentForReceipt.remainingBalance.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="text-center text-sm text-gray-600 space-y-2 py-6 border-t border-gray-200">
                <p>Thank you for your payment!</p>
                <p>This is a computer-generated receipt. No signature is required.</p>
                <p className="text-xs text-gray-500 mt-4">Printed on {new Date().toLocaleString()}</p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => handleDownloadReceipt(selectedPaymentForReceipt)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
              <button
                onClick={() => {
                  setShowReceiptModal(false);
                  setSelectedPaymentForReceipt(null);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
