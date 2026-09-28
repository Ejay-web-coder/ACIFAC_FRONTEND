import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { fetchService, receivePayment, voidPayment, type MachineryService, type ServicePayment } from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { Modal, PaymentBadge, inputClass, labelClass, peso, primaryButton, secondaryButton } from './shared';

export function PaymentModal({ service: initial, onClose, onChanged }: { service: MachineryService; onClose: () => void; onChanged: () => void }) {
  const [service, setService] = useState(initial);
  const [payments, setPayments] = useState<ServicePayment[] | null>(null);
  const [amount, setAmount] = useState(initial.balance > 0 ? initial.balance.toFixed(2) : '');
  const [paymentDate, setPaymentDate] = useState(dateOnlyToday());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchService(initial.id).then((data) => { setService(data.service); setPayments(data.payments); }).catch((error) => toast.error(errorMessage(error, 'Unable to load payments.')));
  }, [initial.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await receivePayment(service.id, { amount, paymentDate, notes: notes.trim() });
      setService(data.service);
      setPayments(data.payments);
      setAmount(data.service.balance > 0 ? data.service.balance.toFixed(2) : '');
      setNotes('');
      toast.success('Payment received', { description: `${peso(Number(amount))} from ${data.service.clientName}. Balance ${peso(data.service.balance)}.` });
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to record the payment.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (payment: ServicePayment) => {
    if (!window.confirm(`Void the ${peso(payment.amount)} payment of ${formatDate(payment.paymentDate)}? The balance goes back up.`)) return;
    setBusy(true);
    try {
      const data = await voidPayment(service.id, payment.id);
      setService(data.service);
      setPayments(data.payments);
      setAmount(data.service.balance.toFixed(2));
      toast.success('Payment voided');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to void the payment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Receive Payment" description={`${service.clientName} · ${service.serviceType} on ${formatDate(service.serviceDate)}`} onClose={onClose}
      footer={<button type="button" onClick={onClose} className={secondaryButton}>Close</button>}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Fee</p><p className="font-bold tabular-nums text-gray-900">{peso(service.feeAmount)}</p></div>
        <div className="rounded-xl bg-green-50 p-3"><p className="text-xs text-gray-500">Paid</p><p className="font-bold tabular-nums text-green-800">{peso(service.amountPaid)}</p></div>
        <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-gray-500">Balance</p><p className="font-bold tabular-nums text-amber-900">{peso(service.balance)}</p></div>
      </div>
      <div className="mt-3 flex justify-center"><PaymentBadge status={service.paymentStatus} /></div>

      {service.balance > 0 ? (
        <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={labelClass}>Amount (₱)
            <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>Payment date
            <input required type="date" max={dateOnlyToday()} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className={inputClass} placeholder="e.g. OR number" />
          </label>
          <div className="sm:col-span-3"><button type="submit" disabled={busy} className={`${primaryButton} w-full`}>{busy ? 'Saving…' : 'Receive payment'}</button></div>
        </form>
      ) : <p className="mt-5 rounded-xl bg-green-50 p-3 text-center text-sm text-green-800">This service is fully paid.</p>}

      <h3 className="mt-6 text-sm font-semibold text-gray-900">Payment history</h3>
      {payments === null ? <p className="mt-2 text-sm text-gray-500">Loading…</p> : payments.length === 0 ? <p className="mt-2 text-sm text-gray-500">No payments yet.</p> : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-semibold tabular-nums text-gray-900">{peso(payment.amount)} <span className="font-normal text-gray-500">· {formatDate(payment.paymentDate)}</span></p>
                {(payment.notes || payment.recordedBy) && <p className="truncate text-xs text-gray-500">{[payment.notes, payment.recordedBy && `by ${payment.recordedBy}`].filter(Boolean).join(' · ')}</p>}
              </div>
              <button type="button" onClick={() => void remove(payment)} disabled={busy} className="shrink-0 text-xs font-semibold text-red-700 hover:text-red-900">Void</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
