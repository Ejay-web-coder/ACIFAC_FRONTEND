import { useCallback, useEffect, useState } from 'react';
import { Search, Plus, PhilippinePeso, Clock, CheckCircle, AlertCircle, X, Download, Eye, AlertTriangle, Receipt, XCircle, ClipboardList } from 'lucide-react';
import { EmptyState, StatCard, StatusBadge } from '../../app/components/common/UiKit';
import { UserRole } from '../../app/App';
import { toast } from 'sonner';
import { createAdminLoan, fetchAdminLoanRequests, fetchAdminLoans, fetchAdminPayments, recordAdminLoanPayment, reviewAdminLoanRequest, type AdminLoan, type AdminLoanRequest, type AdminPayment, type LoanSummary, type Pagination } from '../../app/services/authApi';
import { dateOnlyToday, formatDate, formatDateTime } from '../../utils/dateTime';
import { escapeHtml } from '../../utils/html';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { LoanApplicationWizard, type LoanApplicationPayload } from '../../app/components/LoanApplicationWizard';

type Loan = AdminLoan;
type Payment = AdminPayment;
type LoanRequest = AdminLoanRequest;

const PAGE_SIZE = 50;
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface LoansPaymentsProps {
  userRole: UserRole;
}

export function LoansPayments({ userRole }: LoansPaymentsProps) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loanRequests, setLoanRequests] = useState<LoanRequest[]>([]);
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
  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [loanPagination, setLoanPagination] = useState<Pagination | null>(null);
  const [paymentPagination, setPaymentPagination] = useState<Pagination | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  // Search and status filters run on the server; totals come from the whole table.
  const filteredLoans = loans;
  const filteredPayments = payments;
  const totalActive = summary?.activeLoans ?? 0;
  const totalDisbursed = summary?.totalDisbursed ?? 0;
  const totalOutstanding = summary?.totalOutstanding ?? 0;
  const totalCollected = summary?.totalCollected ?? 0;

  const canEdit = userRole === 'admin';

  const loadData = useCallback(async () => {
    try {
      const search = searchTerm.trim();
      const [loanData, paymentData, requestData] = await Promise.all([
        fetchAdminLoans({ limit: PAGE_SIZE, search, status: filterStatus === 'all' ? undefined : filterStatus }),
        fetchAdminPayments({ limit: PAGE_SIZE, search }),
        fetchAdminLoanRequests({ status: 'pending', limit: 100 }),
      ]);
      setLoans(loanData.loans);
      setSummary(loanData.summary);
      setLoanPagination(loanData.pagination);
      setPayments(paymentData.payments);
      setPaymentPagination(paymentData.pagination);
      setLoanRequests(requestData.requests);
    } catch (error) {
      toast.error('Unable to load loan data', { description: (error as Error).message });
    }
  }, [searchTerm, filterStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 250);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useLiveRefresh(['loans', 'loan_payments', 'loan_requests'], () => { void loadData(); });

  const loadMore = async (kind: 'loans' | 'payments') => {
    setLoadingMore(true);
    try {
      if (kind === 'loans' && loanPagination) {
        const next = await fetchAdminLoans({ page: loanPagination.page + 1, limit: PAGE_SIZE, search: searchTerm.trim(), status: filterStatus === 'all' ? undefined : filterStatus });
        setLoans((current) => [...current, ...next.loans]);
        setLoanPagination(next.pagination);
      } else if (kind === 'payments' && paymentPagination) {
        const next = await fetchAdminPayments({ page: paymentPagination.page + 1, limit: PAGE_SIZE, search: searchTerm.trim() });
        setPayments((current) => [...current, ...next.payments]);
        setPaymentPagination(next.pagination);
      }
    } catch (error) {
      toast.error('Unable to load more records', { description: (error as Error).message });
    } finally {
      setLoadingMore(false);
    }
  };

  const updateLoanRequestStatus = async (request: LoanRequest, status: 'approved' | 'declined') => {
    let reason: string | undefined;
    if (status === 'declined') {
      const answer = window.prompt(`Reason for declining ${request.memberName}'s request (optional):`, '');
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    try {
      await reviewAdminLoanRequest(Number(request.id), status, reason);
      await loadData();
      toast.success(status === 'approved' ? 'Loan request approved' : 'Loan request declined', {
        description: `${request.memberName}'s request #${request.id} was ${status}.`
      });
    } catch (error) {
      toast.error('Unable to review loan request', { description: (error as Error).message });
    }
  };

  const handleAgriculturalApplication = async (application: LoanApplicationPayload) => {
    const { loan } = await createAdminLoan(application);
    setShowAddLoanModal(false);
    await loadData();
    toast.success('Loan approved successfully', { description: `${loan.id} has been created using server-verified amounts.` });
  };

  const handleRecordPayment = (loan: Loan) => {
    setSelectedLoanForPayment(loan);
    // Default to what is currently due on the next installment (never more than the balance).
    const suggested = Math.min(loan.nextAmountDue ?? loan.monthlyPayment, loan.balance);
    setPaymentData({
      amount: suggested.toFixed(2),
      paymentDate: dateOnlyToday()
    });
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoanForPayment || isSubmittingPayment) return;

    const paymentAmount = paymentData.amount.trim();
    setIsSubmittingPayment(true);
    try {
      const { payment } = await recordAdminLoanPayment(selectedLoanForPayment.databaseId, { amount: paymentAmount, paymentDate: paymentData.paymentDate });
      await loadData();
      setShowPaymentModal(false);
      setSelectedLoanForPayment(null);
      setPaymentData({ amount: '', paymentDate: '' });
      toast.success('Payment recorded successfully!', { description: `${peso(payment.amount)} applied to ${selectedLoanForPayment.memberName}'s loan. Remaining balance: ${peso(payment.remainingBalance)}.` });
    } catch (error) {
      toast.error('Unable to record payment', { description: (error as Error).message });
    } finally {
      setIsSubmittingPayment(false);
    }
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
              <span class="receipt-value">${formatDate(payment.paymentDate)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Member Name:</span>
              <span class="receipt-value">${escapeHtml(payment.memberName)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Loan ID:</span>
              <span class="receipt-value">${escapeHtml(payment.loanNumber || String(payment.loanId))}</span>
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
            <p style="margin-top: 20px; color: #333;">Printed on ${formatDateTime(new Date())}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">Track loan disbursements and payment collections</p>
        {canEdit && (
          <button
            onClick={() => setShowAddLoanModal(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            New Loan
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard label="Active Loans" value={totalActive} icon={PhilippinePeso} tone="dark" />
        <StatCard label="Total Loans (with interest)" value={`₱${totalDisbursed.toLocaleString()}`} icon={CheckCircle} />
        <StatCard label="Total Balance" value={`₱${totalOutstanding.toLocaleString()}`} icon={Clock} tone="soft" />
        <StatCard label="Collected (This Month)" value={`₱${totalCollected.toLocaleString()}`} icon={PhilippinePeso} />
      </div>

      {/* Tabs */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="border-b border-gray-100 p-3 sm:p-4">
          <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Loan views">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'loans'}
              onClick={() => setActiveTab('loans')}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
                activeTab === 'loans'
                  ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Loans
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'payments'}
              onClick={() => setActiveTab('payments')}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
                activeTab === 'payments'
                  ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Payment History
            </button>
            {canEdit && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'requests'}
                onClick={() => setActiveTab('requests')}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
                activeTab === 'requests'
                  ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              >
                Loan Requests
                {loanRequests.some(request => request.status === 'pending') && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    {loanRequests.filter(request => request.status === 'pending').length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="border-b border-gray-100 px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <label className="relative block flex-1">
              <span className="sr-only">Search loans</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search by name or loan ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-4 text-sm"
              />
            </label>
            {activeTab === 'loans' && (
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                aria-label="Filter loans by status"
                className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm sm:w-44"
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
        <div className="p-3 sm:p-4 lg:p-5">
          {activeTab === 'loans' ? (
            <div className="space-y-4">
              {filteredLoans.map((loan) => (
                <div key={loan.id} className="rounded-2xl border border-gray-200 bg-white p-4 hover:border-green-200 hover:bg-green-50/20 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                        <h3 className="break-words font-bold text-gray-900">{loan.memberName}</h3>
                        <StatusBadge status={loan.status} />
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-700">
                          {loan.loanType}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">Loan ID: {loan.id}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-3 lg:grid-cols-5">
                        <div>
                          <p className="text-xs text-gray-500">Loan Amount</p>
                          <p className="text-sm font-medium text-gray-900">₱{loan.amount.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Total Repayment</p>
                          <p className="text-sm font-medium text-green-700">₱{loan.totalAmount.toLocaleString()}</p>
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
                      {loan.status !== 'paid' && loan.nextPaymentDate && (
                        <div className={`mt-3 flex items-start gap-2 rounded-xl p-3 ${loan.status === 'overdue' ? 'bg-red-50 ring-1 ring-red-100' : 'bg-green-50 ring-1 ring-green-100'}`}>
                          {loan.status === 'overdue' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />}
                          <p className={`text-sm ${loan.status === 'overdue' ? 'text-red-800' : 'text-green-800'}`}>
                            {loan.status === 'overdue'
                              ? `Overdue: ${peso(loan.overdueAmount)} across ${loan.overdueInstallments} installment${loan.overdueInstallments === 1 ? '' : 's'}. Oldest unpaid installment was due on ${formatDate(loan.nextPaymentDate)}.`
                              : `Next payment of ${peso(loan.nextAmountDue ?? loan.monthlyPayment)} due on ${formatDate(loan.nextPaymentDate)}`}
                          </p>
                        </div>
                      )}
                    </div>
                    {canEdit && loan.status !== 'paid' && (
                      <button
                        onClick={() => handleRecordPayment(loan)}
                          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 sm:ml-4 sm:w-auto">
                        Record Payment
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filteredLoans.length === 0 && <EmptyState icon={PhilippinePeso} title={searchTerm || filterStatus !== 'all' ? 'No loans match your filters' : 'No loans yet'} message={searchTerm || filterStatus !== 'all' ? 'Try a different search or status.' : 'Loans will appear here once they are released to members.'} />}
              {loanPagination && loanPagination.page < loanPagination.totalPages && (
                <div className="flex justify-center pt-2">
                  <button type="button" disabled={loadingMore} onClick={() => void loadMore('loans')} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                    {loadingMore ? 'Loading...' : `Load more (${loanPagination.total - loans.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'payments' ? (
            <div>
              <ul className="space-y-3 md:hidden">
                {filteredPayments.map((payment) => (
                  <li key={payment.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{payment.memberName}</p>
                        <p className="text-xs text-gray-500">{payment.id} · {formatDate(payment.paymentDate)}</p>
                      </div>
                      <p className="shrink-0 text-lg font-bold tabular-nums text-gray-900">₱{payment.amount.toLocaleString()}</p>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-xs">
                      <div><dt className="text-gray-500">Principal</dt><dd className="font-medium tabular-nums text-gray-900">₱{payment.principalPaid.toLocaleString()}</dd></div>
                      <div><dt className="text-gray-500">Interest</dt><dd className="font-medium tabular-nums text-gray-900">₱{payment.interestPaid.toLocaleString()}</dd></div>
                      <div><dt className="text-gray-500">Balance</dt><dd className="font-medium tabular-nums text-gray-900">₱{payment.remainingBalance.toLocaleString()}</dd></div>
                    </dl>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => handleViewReceipt(payment)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"><Eye className="h-4 w-4" />View</button>
                      <button type="button" onClick={() => handleDownloadReceipt(payment)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700"><Download className="h-4 w-4" />Download</button>
                    </div>
                  </li>
                ))}
              </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Payment ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Member</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Principal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Interest</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-green-50/40">
                      <td className="px-4 py-3 text-sm text-gray-900">{payment.id}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{payment.memberName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(payment.paymentDate)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">₱{payment.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">₱{payment.principalPaid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">₱{payment.interestPaid.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">₱{payment.remainingBalance.toLocaleString()}</td>
                      <td className="flex gap-2 px-4 py-3 text-sm">
                        <button
                          type="button"
                          onClick={() => handleViewReceipt(payment)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(payment)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-green-600 px-3 text-xs font-semibold text-white hover:bg-green-700"
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
              {filteredPayments.length === 0 && <EmptyState icon={Receipt} title="No payments recorded yet" message="Recorded loan payments and their receipts will appear here." />}
              {paymentPagination && paymentPagination.page < paymentPagination.totalPages && (
                <div className="flex justify-center pt-2">
                  <button type="button" disabled={loadingMore} onClick={() => void loadMore('payments')} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                    {loadingMore ? 'Loading...' : `Load more (${paymentPagination.total - payments.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900">Pending Loan Requests</h2>
                  <p className="text-sm text-gray-600 mt-1">Review applications submitted by members.</p>
                </div>
                <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
                  {loanRequests.filter(request => request.status === 'pending').length} pending
                </span>
              </div>
              {loanRequests.filter(request => request.status === 'pending').map(request => (
                <div key={request.id} className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-gray-900">{request.memberName}</h3>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{request.loanType}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Application {request.id} · Member ID: {request.memberNumber || request.memberId || '—'} · Submitted {formatDateTime(request.submittedAt)}</p>
                    <p className="text-sm text-gray-700 mt-2">₱{request.amount.toLocaleString()} for {request.term} months · {request.purpose}</p>
                    <p className="text-xs text-gray-500 mt-1">Monthly income: ₱{request.monthlyIncome.toLocaleString()}</p>
                    {request.farmArea !== undefined && (
                      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 min-[420px]:grid-cols-2 sm:grid-cols-4">
                        <span>Farm area: <strong>{Number(request.farmArea).toFixed(2)} ha</strong></span>
                        <span>Eligible: <strong>₱{Number(request.maximumEligibleAmount || 0).toLocaleString()}</strong></span>
                        <span>Interest: <strong>{request.interestRate}% / ₱{Number(request.calculatedInterest || 0).toLocaleString()}</strong></span>
                        <span>Total: <strong>₱{Number(request.totalRepayment || 0).toLocaleString()}</strong></span>
                        <span className="capitalize">Mode: <strong>{request.loanMode || 'cash'}</strong></span>
                        <span>Co-maker: <strong>{request.coMakerName || '—'}</strong></span>
                        <span>Collateral: <strong>{request.collateralType || '—'}</strong></span>
                      </div>
                    )}
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
                    <button type="button" onClick={() => updateLoanRequestStatus(request, 'declined')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 sm:flex-none"><XCircle className="h-4 w-4" />
                      Decline
                    </button>
                    <button type="button" onClick={() => updateLoanRequestStatus(request, 'approved')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 sm:flex-none"><CheckCircle className="h-4 w-4" />
                      Approve
                    </button>
                  </div>
                </div>
              ))}
              {loanRequests.filter(request => request.status === 'pending').length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300"><EmptyState icon={ClipboardList} title="No pending loan requests" message="Loan applications will appear here when members submit them." compact /></div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Loan Modal */}
      {showAddLoanModal && (
        <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-2 sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <LoanApplicationWizard
              allowMemberLookup
              submitLabel="Submit approved loan"
              onCancel={() => setShowAddLoanModal(false)}
              onSubmit={handleAgriculturalApplication}
            />
          </div>
        </div>
      )}
      {/* Payment Recording Modal */}
      {showPaymentModal && selectedLoanForPayment && (
        <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
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
                    min="0.01"
                    max={selectedLoanForPayment.balance}
                    step="0.01"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                {paymentData.amount && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-900">
                      New balance: <span className="font-bold">{peso(Math.max(0, Math.round(selectedLoanForPayment.balance * 100) - Math.round(Number(paymentData.amount) * 100)) / 100)}</span>
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
                  disabled={isSubmittingPayment}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium disabled:opacity-60"
                >
                  {isSubmittingPayment ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt View Modal */}
      {showReceiptModal && selectedPaymentForReceipt && (
        <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
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
                  <span className="text-gray-900">{formatDate(selectedPaymentForReceipt.paymentDate)}</span>
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
                <p className="text-xs text-gray-500 mt-4">Printed on {formatDateTime(new Date())}</p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => handleDownloadReceipt(selectedPaymentForReceipt)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium"
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
