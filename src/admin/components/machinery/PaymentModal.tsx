import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  fetchService, receivePayment, voidPayment,
  type MachineryService, type PaymentStatus, type ServicePayment,
} from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { Modal, PaymentBadge, inputClass, labelClass, peso, primaryButton, secondaryButton } from './shared';
import { confirmAction } from '../../../app/components/common/ConfirmDialog';

/** What is being paid for: its fee, what has been paid so far and who pays. */
interface Account { fee: number; amountPaid: number; balance: number; paymentStatus: PaymentStatus; payer: string }
interface PaymentEntry { id: number; amount: number; paymentDate: string; notes: string; recordedBy: string | null }
type Loaded = { account: Account; payments: PaymentEntry[] };

// The payment window of a service: how to load, receive and void its payments.
function PaymentsDialog({ initial, description, feeLabel, paidOff, load, receive, remove, onClose, onChanged }: {
  initial: Account;
  description: string;
  feeLabel: string;
  paidOff: string;
  load: () => Promise<Loaded>;
  receive: (payment: { amount: string; paymentDate: string; notes: string }) => Promise<Loaded>;
  remove: (paymentId: number) => Promise<Loaded>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [account, setAccount] = useState(initial);
  const [payments, setPayments] = useState<PaymentEntry[] | null>(null);
  const [amount, setAmount] = useState(initial.balance > 0 ? initial.balance.toFixed(2) : '');
  const [paymentDate, setPaymentDate] = useState(dateOnlyToday());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // Loaded once when the window opens.
  const loadOnce = useRef(load);

  useEffect(() => {
    loadOnce.current().then((data) => { setAccount(data.account); setPayments(data.payments); }).catch((error) => toast.error(errorMessage(error, 'Unable to load payments.')));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await receive({ amount, paymentDate, notes: notes.trim() });
      setAccount(data.account);
      setPayments(data.payments);
      setAmount(data.account.balance > 0 ? data.account.balance.toFixed(2) : '');
      setNotes('');
      toast.success('Payment received', { description: `${peso(Number(amount))} from ${data.account.payer}. Balance ${peso(data.account.balance)}.` });
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to record the payment.'));
    } finally {
      setBusy(false);
    }
  };

  const voidEntry = async (payment: PaymentEntry) => {
    if (!(await confirmAction(`Void the ${peso(payment.amount)} payment of ${formatDate(payment.paymentDate)}? The balance goes back up.`, { confirmLabel: 'Void payment', danger: true }))) return;
    setBusy(true);
    try {
      const data = await remove(payment.id);
      setAccount(data.account);
      setPayments(data.payments);
      setAmount(data.account.balance.toFixed(2));
      toast.success('Payment voided');
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to void the payment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Receive Payment" description={description} onClose={onClose}
      footer={<button type="button" onClick={onClose} className={secondaryButton}>Close</button>}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{feeLabel}</p><p className="font-bold tabular-nums text-gray-900">{peso(account.fee)}</p></div>
        <div className="rounded-xl bg-green-50 p-3"><p className="text-xs text-gray-500">Paid</p><p className="font-bold tabular-nums text-green-800">{peso(account.amountPaid)}</p></div>
        <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-gray-500">Balance</p><p className="font-bold tabular-nums text-amber-900">{peso(account.balance)}</p></div>
      </div>
      <div className="mt-3 flex justify-center"><PaymentBadge status={account.paymentStatus} /></div>

      {account.balance > 0 ? (
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
      ) : <p className="mt-5 rounded-xl bg-green-50 p-3 text-center text-sm text-green-800">{paidOff}</p>}

      <h3 className="mt-6 text-sm font-semibold text-gray-900">Payment history</h3>
      {payments === null ? <p className="mt-2 text-sm text-gray-500">Loading…</p> : payments.length === 0 ? <p className="mt-2 text-sm text-gray-500">No payments yet.</p> : (
        <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-semibold tabular-nums text-gray-900">{peso(payment.amount)} <span className="font-normal text-gray-500">· {formatDate(payment.paymentDate)}</span></p>
                {(payment.notes || payment.recordedBy) && <p className="truncate text-xs text-gray-500">{[payment.notes, payment.recordedBy && `by ${payment.recordedBy}`].filter(Boolean).join(' · ')}</p>}
              </div>
              <button type="button" onClick={() => void voidEntry(payment)} disabled={busy} className="shrink-0 text-xs font-semibold text-red-700 hover:text-red-900">Void</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

const serviceAccount = (service: MachineryService): Account => ({ fee: service.feeAmount, amountPaid: service.amountPaid, balance: service.balance, paymentStatus: service.paymentStatus, payer: service.clientName });
const fromService = (data: { service: MachineryService; payments: ServicePayment[] }): Loaded => ({ account: serviceAccount(data.service), payments: data.payments });

export function PaymentModal({ service, onClose, onChanged }: { service: MachineryService; onClose: () => void; onChanged: () => void }) {
  return (
    <PaymentsDialog initial={serviceAccount(service)} description={`${service.clientName} · ${service.serviceType} on ${formatDate(service.serviceDate)}`}
      feeLabel="Fee" paidOff="This service is fully paid."
      load={async () => fromService(await fetchService(service.id))}
      receive={async (payment) => fromService(await receivePayment(service.id, payment))}
      remove={async (paymentId) => fromService(await voidPayment(service.id, paymentId))}
      onClose={onClose} onChanged={onChanged} />
  );
}
