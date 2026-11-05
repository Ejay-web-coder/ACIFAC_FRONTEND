import { ArrowDownLeft, ArrowUpRight, Calendar, Download, Eye, PiggyBank, Tractor, Wallet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { PagedList } from '../../app/components/common/PagedList';
import { COOPERATIVE_NAME, drawPdfLogo, loadPdfLogo } from '../../lib/pdfLogo';
import { dateOnlySortValue, formatDate, formatDateTime } from '../../utils/dateTime';

interface TransactionProps {
  userRole: UserRole;
}

type TransactionType = 'savings' | 'withdrawal' | 'payment' | 'debt' | 'rental';
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

// The filter chips on phones (the same choices as the Filter Type list).
const FILTERS: Array<['all' | TransactionType, string]> = [
  ['all', 'All'], ['payment', 'Loan payments'], ['debt', 'Loans'], ['rental', 'Rentals'], ['savings', 'Savings'], ['withdrawal', 'Withdrawals'],
];

// How each kind of entry looks. `sign` is what it means for the member.
const TYPE_STYLE: Record<TransactionType, { label: string; icon: typeof ArrowUpRight; chip: string; text: string; amount: string; sign: string }> = {
  savings: { label: 'Savings', icon: PiggyBank, chip: 'bg-green-100', text: 'text-green-800', amount: 'text-green-600', sign: '+' },
  withdrawal: { label: 'Savings Withdrawal', icon: Wallet, chip: 'bg-amber-100', text: 'text-amber-800', amount: 'text-amber-600', sign: '-' },
  payment: { label: 'Loan Payment', icon: ArrowUpRight, chip: 'bg-red-100', text: 'text-red-800', amount: 'text-red-600', sign: '-' },
  debt: { label: 'Loan', icon: ArrowDownLeft, chip: 'bg-orange-100', text: 'text-orange-800', amount: 'text-orange-600', sign: '+' },
  rental: { label: 'Rental', icon: Tractor, chip: 'bg-blue-100', text: 'text-blue-800', amount: 'text-blue-600', sign: '' },
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The built-in PDF fonts have no peso sign or narrow spaces (Intl puts one before AM/PM).
const pdfText = (value: string) => value.replace(/₱/g, 'PHP ').replace(/[\u00A0\u2009\u202F]/g, ' ');

// Builds the same receipt as the View modal as an A4 PDF and saves it.
async function downloadReceiptPdf(txn: Transaction) {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadPdfLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `Transaction Receipt - ${txn.id}` });

  const left = 20;
  const right = 190;
  const center = (left + right) / 2;
  const lineHeight = 5;
  // The cooperative's logo above the title.
  let y = drawPdfLogo(doc, logo, center - 11, 10, 22) ? 41 : 28;

  const valueLines = (value: string): string[] => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    return doc.splitTextToSize(pdfText(value), 95);
  };
  const rowHeight = (value: string) => (valueLines(value).length - 1) * lineHeight + 8.5;
  const row = (label: string, value: string, x0: number, x1: number, strong = false) => {
    const lines = valueLines(value);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51);
    doc.text(label, x0, y);
    doc.setFont('helvetica', strong ? 'bold' : 'normal');
    doc.setTextColor(strong ? 17 : 85);
    doc.text(lines, x1, y, { align: 'right' });
    const separator = y + (lines.length - 1) * lineHeight + 2.5;
    doc.setDrawColor(strong ? 51 : 225);
    doc.setLineWidth(strong ? 0.5 : 0.2);
    doc.line(x0, separator, x1, separator);
    y = separator + 6;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(17);
  doc.text('TRANSACTION RECEIPT', center, y, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(102);
  doc.setFontSize(9.5);
  doc.text(COOPERATIVE_NAME, center, y, { align: 'center' });
  y += 7;
  doc.setDrawColor(51);
  doc.setLineWidth(0.6);
  doc.line(left, y, right, y);
  y += 11;

  row('Receipt Number:', txn.id, left, right);
  row('Date & Time:', formatDate(txn.date), left, right);
  row('Type:', TYPE_STYLE[txn.type].label, left, right);
  row('Category:', txn.category, left, right);
  row('Description:', txn.detail ? `${txn.description} (${txn.detail})` : txn.description, left, right);

  const details: [string, string, boolean?][] = [
    ['Amount:', peso(txn.amount)],
    ['Payment Method:', txn.paymentMethod],
    ['Reference:', txn.reference],
    ['Status:', capitalize(txn.status), true],
  ];
  if (txn.balance !== null) details.push([`${txn.balanceLabel}:`, peso(txn.balance)]);

  // The shaded box is drawn first, so its height is measured before the rows.
  y += 4;
  const boxTop = y;
  const boxHeight = 16 + details.reduce((sum, [, value]) => sum + rowHeight(value), 0);
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(left, boxTop, right - left, boxHeight, 2, 2, 'F');
  y = boxTop + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(17);
  doc.text('Transaction Details', left + 6, y);
  y += 9;
  details.forEach(([label, value, strong]) => row(label, value, left + 6, right - 6, strong));

  y = boxTop + boxHeight + 12;
  doc.setDrawColor(221);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(102);
  doc.text('This is a computer-generated receipt. No signature is required.', center, y, { align: 'center' });
  y += 9;
  doc.setFontSize(9);
  doc.setTextColor(51);
  doc.text(pdfText(`Printed on ${formatDateTime(new Date())}`), center, y, { align: 'center' });

  doc.save(`Receipt-${txn.id}.pdf`);
}

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

  // Savings deposits and withdrawals carry the savings balance after each entry.
  let savingsRunning = 0;
  const savingsRows: Transaction[] = [...memberData.savings.transactions]
    .sort((a, b) => dateOnlySortValue(a.date) - dateOnlySortValue(b.date) || a.id - b.id)
    .map((deposit) => {
      const withdrawal = deposit.type === 'Withdrawal';
      const category = withdrawal ? 'Savings Withdrawal' : 'Savings Deposit';
      savingsRunning += withdrawal ? -Number(deposit.amount) : Number(deposit.amount);
      return {
        id: `SAV-${deposit.id}`,
        date: deposit.date,
        type: withdrawal ? 'withdrawal' as const : 'savings' as const,
        category,
        description: deposit.notes ? `${category} - ${deposit.notes}` : category,
        amount: Number(deposit.amount),
        balance: typeof deposit.balance === 'number' ? deposit.balance : savingsRunning,
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

  const handleViewReceipt = (txn: Transaction) => {
    setSelectedTransaction(txn);
    setShowReceiptModal(true);
  };

  const handleDownloadReceipt = (txn: Transaction) => {
    downloadReceiptPdf(txn).catch(() => {
      toast.error('Unable to create the receipt PDF. Please try again.');
    });
  };

  return (
    <div className="space-y-4">
      {/* Phones: the kinds as chips, and the sort, in one strip. */}
      <div className="space-y-2 md:hidden">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1" role="group" aria-label="Show">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setFilterType(value)} aria-pressed={filterType === value}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filterType === value ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-green-50'}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span>{sortedTransactions.length} {sortedTransactions.length === 1 ? 'transaction' : 'transactions'}</span>
          <label className="flex items-center gap-1.5">Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-xs text-gray-700">
              <option value="date">Newest</option>
              <option value="amount">Highest amount</option>
            </select>
          </label>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-[var(--shadow-card)] overflow-hidden">
        {/* Tablets and desktops: the filter and sort above the table, in one bar. */}
        <div className="hidden flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 md:flex">
          <p className="text-sm text-gray-600"><span className="font-semibold text-gray-900">{sortedTransactions.length}</span> {sortedTransactions.length === 1 ? 'transaction' : 'transactions'} · tap View or Download for a receipt</p>
          <div className="flex items-center gap-2">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} aria-label="Filter type" className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm">
              <option value="all">All Transactions</option>
              <option value="savings">Savings Deposits</option>
              <option value="withdrawal">Savings Withdrawals</option>
              <option value="rental">Machinery Rentals</option>
              <option value="payment">Loan Payments</option>
              <option value="debt">Loan Disbursements</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} aria-label="Sort by" className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm">
              <option value="date">Date (Newest)</option>
              <option value="amount">Amount (Highest)</option>
            </select>
          </div>
        </div>
        <PagedList items={sortedTransactions} resetKey={`${filterType}|${sortBy}`} label="transactions">{(pageItems) => (
        <>
        {/* Phones: one row per transaction; tap it for the receipt. */}
        <ul className="divide-y divide-gray-100 md:hidden">
          {pageItems.map((txn) => {
            const style = TYPE_STYLE[txn.type];
            const Icon = style.icon;
            return (
              <li key={txn.id}>
                <button type="button" onClick={() => handleViewReceipt(txn)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50 active:bg-gray-100">
                  <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.chip}`}><Icon className={`h-5 w-5 ${style.amount}`} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{txn.description}</span>
                    <span className="block truncate text-xs text-gray-500">{formatDate(txn.date)} · {style.label}</span>
                  </span>
                  <span className={`shrink-0 text-right text-sm font-bold tabular-nums ${style.amount}`}>{style.sign}{peso(txn.amount)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="hidden md:block">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="w-[11rem] px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="w-[8.5rem] px-4 py-2.5">Date</th>
                <th className="w-[9rem] px-4 py-2.5 text-right">Amount</th>
                <th className="w-[11.5rem] px-4 py-2.5">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((txn) => (
                <tr key={txn.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-2.5">
                    {(() => {
                      const style = TYPE_STYLE[txn.type];
                      const Icon = style.icon;
                      return (
                        <div className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 ${style.chip}`}>
                          <Icon className={`h-4 w-4 shrink-0 ${style.amount}`} />
                          <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="truncate text-sm font-medium text-gray-900" title={txn.description}>{txn.description}</p>
                    <p className="truncate text-xs text-gray-500" title={[txn.detail, `Ref: ${txn.reference}`].filter(Boolean).join(' · ')}>{txn.detail ? `${txn.detail} · ` : ''}Ref: {txn.reference}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4 shrink-0" />{formatDate(txn.date)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <p className={`whitespace-nowrap text-base font-bold tabular-nums ${TYPE_STYLE[txn.type].amount}`}>
                      {TYPE_STYLE[txn.type].sign}{peso(txn.amount)}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
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
        </>
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

    </div>
  );
}
