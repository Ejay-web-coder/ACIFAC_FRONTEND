import { ArrowDownLeft, ArrowUpRight, Calendar, FileText, Download, Eye, PiggyBank, Tractor } from 'lucide-react';
import { useState } from 'react';
import { UserRole } from '../../app/App';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { PagedList } from '../../app/components/common/PagedList';
import { sumMoney } from '../../utils/money';
import { dateOnlySortValue, formatDate, formatDateTime } from '../../utils/dateTime';
import { escapeHtml } from '../../utils/html';

interface TransactionProps {
  userRole: UserRole;
}

type TransactionType = 'savings' | 'payment' | 'debt' | 'rental';
type TransactionStatus = 'completed' | 'pending' | 'approved' | 'declined' | 'scheduled' | 'ongoing';

interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  description: string;
  // Extra line under the description, e.g. a rental's booking period.
  detail?: string;
  amount: number;
  // Balance after this entry (savings total or loan balance); null for rentals.
  balance: number | null;
  balanceLabel: string;
  status: TransactionStatus;
  paymentMethod: string;
  reference: string;
}

// How each kind of entry looks. `sign` is what it means for the member.
const TYPE_STYLE: Record<TransactionType, { label: string; icon: typeof ArrowUpRight; chip: string; text: string; amount: string; sign: string }> = {
  savings: { label: 'Savings', icon: PiggyBank, chip: 'bg-green-100', text: 'text-green-800', amount: 'text-green-600', sign: '+' },
  payment: { label: 'Loan Payment', icon: ArrowUpRight, chip: 'bg-red-100', text: 'text-red-800', amount: 'text-red-600', sign: '-' },
  debt: { label: 'Loan', icon: ArrowDownLeft, chip: 'bg-orange-100', text: 'text-orange-800', amount: 'text-orange-600', sign: '+' },
  rental: { label: 'Rental', icon: Tractor, chip: 'bg-blue-100', text: 'text-blue-800', amount: 'text-blue-600', sign: '' },
};

const STATUS_STYLE: Record<TransactionStatus, string> = {
  completed: 'bg-green-100 text-green-800',
  approved: 'bg-green-100 text-green-800',
  scheduled: 'bg-blue-100 text-blue-800',
  ongoing: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  declined: 'bg-red-100 text-red-800',
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Transaction({ userRole }: TransactionProps) {
  const { memberData, error } = useMyMemberData();
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);


  if (userRole !== 'member') {
    return <div className="p-8">Access restricted to members only</div>;
  }

  if (error) {
    return <div className="p-4 md:p-8 text-sm text-red-600">{error}</div>;
  }

  if (!memberData) {
    return <div className="p-4 md:p-8 text-sm text-gray-500">Loading your transactions...</div>;
  }

  // Savings deposits carry the running savings total after each deposit.
  let savingsRunning = 0;
  const savingsRows: Transaction[] = [...memberData.savings.transactions]
    .sort((a, b) => dateOnlySortValue(a.date) - dateOnlySortValue(b.date) || a.id - b.id)
    .map((deposit) => {
      savingsRunning += Number(deposit.amount);
      return {
        id: `SAV-${deposit.id}`,
        date: deposit.date,
        type: 'savings' as const,
        category: 'Savings Deposit',
        description: deposit.notes ? `Savings Deposit - ${deposit.notes}` : 'Savings Deposit',
        amount: Number(deposit.amount),
        balance: savingsRunning,
        balanceLabel: 'Savings Balance',
        status: 'completed' as const,
        paymentMethod: deposit.paymentMethod || 'Recorded by ACIFAC Admin',
        reference: deposit.reference || `SAV-${deposit.id}`,
      };
    });

  const rentalRows: Transaction[] = memberData.rentalRequests.map((rental) => ({
    id: `RENT-${rental.id}`,
    date: rental.startDate,
    type: 'rental' as const,
    category: 'Machinery Rental',
    description: `${rental.machineryName} rental`,
    detail: `${formatDate(rental.startDate)} to ${formatDate(rental.endDate)} · ${rental.duration} day${rental.duration === 1 ? '' : 's'}`,
    amount: Number(rental.rentalFee),
    balance: null,
    balanceLabel: '',
    // An approved booking follows its operation: scheduled, ongoing, completed.
    status: rental.status === 'approved' ? (rental.operationStatus || 'approved') : rental.status,
    paymentMethod: 'Rental fee payable to ACIFAC',
    reference: `RENT-${rental.id}`,
  }));

  const transactions: Transaction[] = [
    ...savingsRows,
    ...rentalRows,
    ...memberData.loans.map((loan) => ({
      id: `LOAN-${loan.id}`,
      date: loan.dateApproved,
      type: 'debt' as const,
      category: 'Loan Disbursement',
      description: `Loan Disbursement - ${loan.id}`,
      amount: Number(loan.amount),
      balance: Number(loan.balance),
      balanceLabel: 'Loan Balance',
      status: 'completed' as const,
      paymentMethod: 'Recorded by ACIFAC Admin',
      reference: loan.id,
    })),
    ...memberData.payments.map((payment) => ({
      id: `PAY-${payment.id}`,
      date: payment.paymentDate,
      type: 'payment' as const,
      category: 'Loan Payment',
      description: `Loan Payment - ${payment.loanNumber || `Loan #${payment.loanId}`}`,
      amount: Number(payment.amount),
      balance: Number(payment.remainingBalance),
      balanceLabel: 'Remaining Loan Balance',
      status: 'completed' as const,
      paymentMethod: 'Recorded by ACIFAC Admin',
      reference: `PAY-${payment.id}`,
    })),
  ];

  const filteredTransactions = transactions.filter(txn => {
    if (filterType === 'all') return true;
    return txn.type === filterType;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    if (sortBy === 'date') {
      return dateOnlySortValue(b.date) - dateOnlySortValue(a.date);
    } else {
      return b.amount - a.amount;
    }
  });

  const totalPayment = sumMoney(transactions.filter(txn => txn.type === 'payment').map(txn => txn.amount));
  const totalDebt = sumMoney(transactions.filter(txn => txn.type === 'debt').map(txn => txn.amount));
  const netBalance = totalDebt - totalPayment;
  const totalSavings = Number(memberData.savings.total);
  // Fees of bookings the cooperative accepted (pending and declined ones are not owed).
  const totalRentalFees = sumMoney(transactions.filter(txn => txn.type === 'rental' && txn.status !== 'pending' && txn.status !== 'declined').map(txn => txn.amount));

  const handleViewReceipt = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setShowReceiptModal(true);
  };

  const handleDownloadReceipt = (txn: Transaction) => {
    const receiptContent = generateReceiptHTML(txn);
    const element = document.createElement('a');
    const file = new Blob([receiptContent], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    element.download = `Receipt-${txn.id}.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const generateReceiptHTML = (txn: Transaction) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Transaction Receipt - ${escapeHtml(txn.id)}</title>
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
            <h1 class="receipt-title">TRANSACTION RECEIPT</h1>
            <p class="receipt-subtitle">ACIFAC Cooperative</p>
          </div>
          
          <div class="receipt-section">
            <div class="receipt-row">
              <span class="receipt-label">Receipt Number:</span>
              <span class="receipt-value">${escapeHtml(txn.id)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Date & Time:</span>
              <span class="receipt-value">${formatDate(txn.date)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Type:</span>
              <span class="receipt-value">${escapeHtml(TYPE_STYLE[txn.type].label)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Category:</span>
              <span class="receipt-value">${escapeHtml(txn.category)}</span>
            </div>
          </div>

          <div class="receipt-section">
            <div class="receipt-row">
              <span class="receipt-label">Description:</span>
              <span class="receipt-value">${escapeHtml(txn.detail ? `${txn.description} (${txn.detail})` : txn.description)}</span>
            </div>
          </div>

          <div class="receipt-summary">
            <h3 style="margin-top: 0;">Transaction Details</h3>
            <div class="receipt-row">
              <span class="receipt-label">Amount:</span>
              <span class="receipt-value amount">${peso(txn.amount)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Payment Method:</span>
              <span class="receipt-value">${escapeHtml(txn.paymentMethod)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Reference:</span>
              <span class="receipt-value">${escapeHtml(txn.reference)}</span>
            </div>
            <div class="receipt-row" style="border-bottom: 2px solid #333; font-weight: bold;">
              <span class="receipt-label">Status:</span>
              <span class="receipt-value">${capitalize(txn.status)}</span>
            </div>
            ${txn.balance === null ? '' : `<div class="receipt-row">
              <span class="receipt-label">${escapeHtml(txn.balanceLabel)}:</span>
              <span class="receipt-value amount">${peso(txn.balance)}</span>
            </div>`}
          </div>

          <div class="receipt-footer">
            <p>Thank you for your transaction!</p>
            <p>This is a computer-generated receipt. No signature is required.</p>
            <p style="margin-top: 20px; color: #333;">Printed on ${formatDateTime(new Date())}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-card)] p-3.5 sm:p-6 border-l-4 border-l-green-500">
          <p className="mb-1 text-xs font-medium leading-snug text-gray-600 sm:mb-2 sm:text-sm">Total Savings</p>
          <p className="break-words text-xl font-bold tabular-nums text-green-600 sm:text-2xl">{peso(totalSavings)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-card)] p-3.5 sm:p-6 border-l-4 border-l-red-500">
          <p className="mb-1 text-xs font-medium leading-snug text-gray-600 sm:mb-2 sm:text-sm">Total Loan Payments</p>
          <p className="break-words text-xl font-bold tabular-nums text-red-600 sm:text-2xl">{peso(totalPayment)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-card)] p-3.5 sm:p-6 border-l-4 border-l-orange-500">
          <p className="mb-1 text-xs font-medium leading-snug text-gray-600 sm:mb-2 sm:text-sm">Net Loan Balance</p>
          <p className="break-words text-xl font-bold tabular-nums text-orange-600 sm:text-2xl">{peso(netBalance)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-card)] p-3.5 sm:p-6 border-l-4 border-l-blue-500">
          <p className="mb-1 text-xs font-medium leading-snug text-gray-600 sm:mb-2 sm:text-sm">Machinery Rental Fees</p>
          <p className="break-words text-xl font-bold tabular-nums text-blue-600 sm:text-2xl">{peso(totalRentalFees)}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-card)] p-3 sm:p-4">
        <div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
            <div className="min-w-0">
              <label className="block text-sm text-gray-600 mb-2">Filter Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 text-sm sm:w-56"
              >
                <option value="all">All Transactions</option>
                <option value="savings">Savings Deposits</option>
                <option value="rental">Machinery Rentals</option>
                <option value="payment">Loan Payments</option>
                <option value="debt">Loan Disbursements</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className="block text-sm text-gray-600 mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 text-sm sm:w-56"
              >
                <option value="date">Date (Newest)</option>
                <option value="amount">Amount (Highest)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-card)] overflow-hidden">
        <PagedList items={sortedTransactions} resetKey={`${filterType}|${sortBy}`} label="transactions">{(pageItems) => (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Description</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Date & Time</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Category</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Amount</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((txn) => (
                <tr key={txn.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    {(() => {
                      const style = TYPE_STYLE[txn.type];
                      const Icon = style.icon;
                      return (
                        <div className={`inline-flex items-center gap-2 whitespace-nowrap px-3 py-1 rounded-lg ${style.chip}`}>
                          <Icon className={`w-5 h-5 ${style.amount}`} />
                          <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="min-w-[14rem]">
                      <p className="font-medium text-gray-900">{txn.description}</p>
                      {txn.detail && <p className="text-xs text-gray-600 mt-0.5">{txn.detail}</p>}
                      <p className="text-xs text-gray-600 mt-1">Ref: {txn.reference}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 whitespace-nowrap text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      {formatDate(txn.date)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="whitespace-nowrap px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {txn.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className={`whitespace-nowrap text-lg font-bold ${TYPE_STYLE[txn.type].amount}`}>
                      {TYPE_STYLE[txn.type].sign}{peso(txn.amount)}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[txn.status]}`}>
                      {capitalize(txn.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewReceipt(txn)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition"
                        title="View Receipt"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      <button
                        onClick={() => handleDownloadReceipt(txn)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg text-xs font-medium transition"
                        title="Download Receipt"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}</PagedList>
        {sortedTransactions.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-500">No transactions found</p>
          </div>
        )}
      </div>

      {/* Receipt View Modal */}
      {showReceiptModal && selectedTransaction && (
        <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Transaction Receipt</h2>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>
            
            <div className="p-8">
              <div className="border-b-2 border-gray-300 pb-6 mb-6 text-center">
                <h1 className="text-3xl font-bold text-gray-900">TRANSACTION RECEIPT</h1>
                <p className="text-gray-600 mt-2">ACIFAC Cooperative</p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Receipt Number:</span>
                  <span className="text-gray-900">{selectedTransaction.id}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Date & Time:</span>
                  <span className="text-gray-900">{formatDate(selectedTransaction.date)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Type:</span>
                  <span className="text-gray-900">{TYPE_STYLE[selectedTransaction.type].label}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Category:</span>
                  <span className="text-gray-900">{selectedTransaction.category}</span>
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex justify-between py-2">
                  <span className="font-semibold text-gray-700">Description:</span>
                  <span className="text-right text-gray-900">{selectedTransaction.description}{selectedTransaction.detail && <span className="block text-sm text-gray-600">{selectedTransaction.detail}</span>}</span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Transaction Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2">
                    <span className="text-gray-700">Amount:</span>
                    <span className="font-medium text-gray-900">{peso(selectedTransaction.amount)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-700">Payment Method:</span>
                    <span className="font-medium text-gray-900">{selectedTransaction.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-700">Reference:</span>
                    <span className="font-medium text-gray-900">{selectedTransaction.reference}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-b-2 border-gray-300 my-3">
                    <span className="text-lg font-bold text-gray-900">Status:</span>
                    <span className="text-lg font-bold text-gray-900">{capitalize(selectedTransaction.status)}</span>
                  </div>
                  {selectedTransaction.balance !== null && (
                    <div className="flex justify-between py-2">
                      <span className="text-gray-700">{selectedTransaction.balanceLabel}:</span>
                      <span className="font-medium text-gray-900">{peso(selectedTransaction.balance)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center text-sm text-gray-600 space-y-2 py-6 border-t border-gray-200">
                <p>Thank you for your transaction!</p>
                <p>This is a computer-generated receipt. No signature is required.</p>
                <p className="text-xs text-gray-500 mt-4">Printed on {formatDateTime(new Date())}</p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => handleDownloadReceipt(selectedTransaction)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Additional Info */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-card)] p-6">
        <div className="flex items-start gap-4">
          <FileText className="w-5 h-5 text-blue-600 mt-1" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Transaction Details</h4>
            <p className="text-sm text-gray-600">
              Your savings deposits, machinery rental bookings, loan disbursements and loan payments are all listed here for record-keeping, reconciliation, and audit purposes. 
              You can download a receipt for any transaction to keep for your records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
