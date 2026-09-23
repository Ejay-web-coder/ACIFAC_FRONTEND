import { ArrowDownLeft, ArrowUpRight, Calendar, FileText, Download, Eye } from 'lucide-react';
import { useState } from 'react';
import { UserRole } from '../../app/App';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { sumMoney } from '../../utils/money';
import { dateOnlySortValue, formatDate, formatDateTime } from '../../utils/dateTime';

interface TransactionProps {
  userRole: UserRole;
}

interface Transaction {
  id: string;
  date: string;
  type: 'payment' | 'debt';
  category: string;
  description: string;
  amount: number;
  balance: number;
  status: 'completed' | 'pending' | 'failed';
  paymentMethod: string;
  reference: string;
}

export function Transaction({ userRole }: TransactionProps) {
  const { memberData, error } = useMyMemberData();
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [filterType, setFilterType] = useState<'all' | 'payment' | 'debt'>('all');
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

  const transactions: Transaction[] = [
    ...memberData.loans.map((loan) => ({
      id: `LOAN-${loan.id}`,
      date: loan.dateApproved,
      type: 'debt' as const,
      category: 'Loan Disbursement',
      description: `Loan Disbursement - ${loan.id}`,
      amount: Number(loan.amount),
      balance: Number(loan.balance),
      status: 'completed' as const,
      paymentMethod: 'Recorded by ACIFAC Admin',
      reference: loan.id,
    })),
    ...memberData.payments.map((payment) => {
      return {
        id: `PAY-${payment.id}`,
        date: payment.paymentDate,
        type: 'payment' as const,
        category: 'Loan Payment',
        description: `Loan Payment - ${payment.loanNumber || `Loan #${payment.loanId}`}`,
        amount: Number(payment.amount),
        balance: Number(payment.remainingBalance),
        status: 'completed' as const,
        paymentMethod: 'Recorded by ACIFAC Admin',
        reference: `PAY-${payment.id}`,
      };
    }),
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
        <title>Transaction Receipt - ${txn.id}</title>
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
              <span class="receipt-value">${txn.id}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Date & Time:</span>
              <span class="receipt-value">${formatDate(txn.date)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Type:</span>
              <span class="receipt-value">${txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Category:</span>
              <span class="receipt-value">${txn.category}</span>
            </div>
          </div>

          <div class="receipt-section">
            <div class="receipt-row">
              <span class="receipt-label">Description:</span>
              <span class="receipt-value">${txn.description}</span>
            </div>
          </div>

          <div class="receipt-summary">
            <h3 style="margin-top: 0;">Transaction Details</h3>
            <div class="receipt-row">
              <span class="receipt-label">Amount:</span>
              <span class="receipt-value amount">₱${txn.amount.toLocaleString()}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Payment Method:</span>
              <span class="receipt-value">${txn.paymentMethod}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Reference:</span>
              <span class="receipt-value">${txn.reference}</span>
            </div>
            <div class="receipt-row" style="border-bottom: 2px solid #333; font-weight: bold;">
              <span class="receipt-label">Status:</span>
              <span class="receipt-value">${txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}</span>
            </div>
            <div class="receipt-row">
              <span class="receipt-label">Current Balance:</span>
              <span class="receipt-value amount">₱${txn.balance.toLocaleString()}</span>
            </div>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-l-red-500">
          <p className="text-gray-600 text-sm font-medium mb-2">Total Loan Payments</p>
          <p className="text-2xl font-bold text-red-600">₱{totalPayment.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-l-orange-500">
          <p className="text-gray-600 text-sm font-medium mb-2">Total Loan Disbursement</p>
          <p className="text-2xl font-bold text-orange-600">₱{totalDebt.toLocaleString()}</p>
        </div>
        <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${netBalance >= 0 ? 'border-l-green-500' : 'border-l-blue-500'}`}>
          <p className="text-gray-600 text-sm font-medium mb-2">Net Loan Balance</p>
          <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-blue-600'}`}>
            ₱{netBalance.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-l-purple-500">
          <p className="text-gray-600 text-sm font-medium mb-2">Total Transactions</p>
            <p className="text-3xl font-bold text-purple-600">{transactions.length}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-2">Filter Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Loan Transactions</option>
                <option value="payment">Loan Payments Only</option>
                <option value="debt">Loan Disbursements Only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-2">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="date">Date (Newest)</option>
                <option value="amount">Amount (Highest)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
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
              {sortedTransactions.map((txn) => (
                <tr key={txn.id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg ${txn.type === 'payment' ? 'bg-red-100' : 'bg-orange-100'}`}>
                      {txn.type === 'payment' ? (
                        <ArrowUpRight className={`w-5 h-5 text-red-600`} />
                      ) : (
                        <ArrowDownLeft className={`w-5 h-5 text-orange-600`} />
                      )}
                      <span className={`text-sm font-medium ${txn.type === 'payment' ? 'text-red-800' : 'text-orange-800'}`}>
                        {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{txn.description}</p>
                      <p className="text-xs text-gray-600 mt-1">Ref: {txn.reference}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      {formatDate(txn.date)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {txn.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className={`text-lg font-bold ${txn.type === 'payment' ? 'text-red-600' : 'text-orange-600'}`}>
                      {txn.type === 'payment' ? '-' : '+'}₱{txn.amount.toLocaleString()}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      txn.status === 'completed' ? 'bg-green-100 text-green-800' :
                      txn.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {txn.status.charAt(0).toUpperCase() + txn.status.slice(1)}
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
        {sortedTransactions.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-gray-500">No transactions found</p>
          </div>
        )}
      </div>

      {/* Receipt View Modal */}
      {showReceiptModal && selectedTransaction && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
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
                  <span className="text-gray-900">{selectedTransaction.type.charAt(0).toUpperCase() + selectedTransaction.type.slice(1)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="font-semibold text-gray-700">Category:</span>
                  <span className="text-gray-900">{selectedTransaction.category}</span>
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex justify-between py-2">
                  <span className="font-semibold text-gray-700">Description:</span>
                  <span className="text-gray-900">{selectedTransaction.description}</span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Transaction Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2">
                    <span className="text-gray-700">Amount:</span>
                    <span className="font-medium text-gray-900">₱{selectedTransaction.amount.toLocaleString()}</span>
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
                    <span className="text-lg font-bold text-green-600">{selectedTransaction.status.charAt(0).toUpperCase() + selectedTransaction.status.slice(1)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-700">Current Balance:</span>
                    <span className="font-medium text-gray-900">₱{selectedTransaction.balance.toLocaleString()}</span>
                  </div>
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
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-4">
          <FileText className="w-5 h-5 text-blue-600 mt-1" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">Loan Transaction Details</h4>
            <p className="text-sm text-gray-600">
              All loan transactions including loan payments and disbursements are recorded and can be used for record-keeping, reconciliation, and audit purposes. 
              You can download a receipt for any transaction to keep for your records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
