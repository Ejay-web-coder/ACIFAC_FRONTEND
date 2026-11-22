import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import { fetchAdminLoanDetail, type AdminPayment } from '../../app/services/authApi';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../utils/dateTime';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The payments recorded on one loan, newest first. `version` changes reload it
 * (after a payment). onReceipt opens the receipt of one payment.
 */
export function LoanPaymentsList({ loanId, version, onReceipt }: { loanId: number; version: unknown; onReceipt?: (payment: AdminPayment) => void }) {
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchAdminLoanDetail(loanId)
      .then((data) => { if (active) { setPayments(data.payments); setError(''); } })
      .catch((reason) => { if (active) setError(errorMessage(reason, 'Unable to load the payments.')); });
    return () => { active = false; };
  }, [loanId, version]);

  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!payments) return <p className="py-4 text-center text-sm text-gray-500">Loading payments...</p>;
  if (payments.length === 0) return <p className="py-4 text-center text-sm text-gray-500">No payments recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="text-left text-xs text-gray-500">
          <tr><th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 text-right font-medium">Amount</th><th className="py-2 pr-3 text-right font-medium">Principal</th><th className="py-2 pr-3 text-right font-medium">Interest</th><th className="py-2 pr-3 text-right font-medium">Penalty</th><th className="py-2 pr-3 text-right font-medium">Balance after</th><th className="py-2 font-medium">Recorded by</th>{onReceipt && <th className="py-2"><span className="sr-only">Receipt</span></th>}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td className="whitespace-nowrap py-2 pr-3">{formatDate(payment.paymentDate)}</td>
              <td className="py-2 pr-3 text-right font-semibold tabular-nums">{peso(payment.amount)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{peso(payment.principalPaid)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{peso(payment.interestPaid)}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${payment.penaltyPaid > 0 ? 'text-red-700' : 'text-gray-400'}`}>{peso(payment.penaltyPaid)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{peso(payment.remainingBalance)}</td>
              <td className="py-2 text-gray-600">{payment.recordedBy ?? ''}</td>
              {onReceipt && (
                <td className="py-2 text-right">
                  <button type="button" onClick={() => onReceipt(payment)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-green-700 hover:bg-green-50" aria-label={`Receipt of the payment of ${formatDate(payment.paymentDate)}`}>
                    <Receipt className="h-4 w-4" />Receipt
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
