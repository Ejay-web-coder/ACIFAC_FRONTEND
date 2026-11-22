import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, Copy, HandCoins, ImageUp, Loader2, PiggyBank, ReceiptText, Smartphone } from 'lucide-react';
import { EmptyState, ListSkeleton, Pagination, StatusBadge } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { ProtectedImage } from '../../app/components/common/ProtectedImage';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { errorMessage } from '../../lib/api';
import { canvasToJpeg, cropTo } from '../../lib/imageQuality';
import { dateOnlyToday, formatDate, formatDateTime } from '../../utils/dateTime';
import { formatPeso, sumMoney } from '../../utils/money';
import { DUE_KIND_LABELS } from '../../app/services/duesApi';
import {
  channelQrPath, fetchMyOnlinePayments, normalizeReference, purposeLabel, submitOnlinePayment,
  type MyOnlinePayments, type PaymentChannelName, type PaymentPurpose,
} from '../../app/services/onlinePaymentApi';

// Pay online: the member pays a loan, dues or a savings deposit by GCash or
// Maya into the cooperative's account, then reports it here with the screenshot
// and the reference number. The office checks that the money arrived in the
// cooperative's account before it is recorded; until then it is "pending".

const PURPOSES: Array<{ value: PaymentPurpose; label: string; icon: typeof HandCoins }> = [
  { value: 'loan', label: 'My loan', icon: HandCoins },
  { value: 'dues', label: 'My dues', icon: ReceiptText },
  { value: 'savings', label: 'Savings deposit', icon: PiggyBank },
];
const readPurpose = (value: string | null): PaymentPurpose | null => (value === 'loan' || value === 'dues' || value === 'savings' ? value : null);

// A large screenshot is sent as a JPEG of at most 2400 px, still sharp enough to
// read, so the upload stays well under the server's limit. Smaller ones go as they are.
const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;
async function shrinkScreenshot(file: File) {
  if (file.size <= SHRINK_ABOVE_BYTES || typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  try {
    const blob = await canvasToJpeg(cropTo(bitmap, bitmap.width, bitmap.height, { maxEdge: 2400 }), 0.9);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'payment'}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
const input = 'w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-transparent focus:ring-2 focus:ring-green-600';

export function PayOnline() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<MyOnlinePayments | null>(null);
  const [loadError, setLoadError] = useState('');
  const [purpose, setPurpose] = useState<PaymentPurpose | null>(readPurpose(searchParams.get('for')));
  const [loanId, setLoanId] = useState<number | null>(null);
  const [dueIds, setDueIds] = useState<number[]>([]);
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState<PaymentChannelName | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(dateOnlyToday());
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    fetchMyOnlinePayments().then((response) => { setData(response); setLoadError(''); }).catch((error) => setLoadError(errorMessage(error, 'Unable to load your online payments.')));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['payment_submissions', 'payment_channels', 'loans', 'loan_payments', 'member_dues', 'savings_transactions'], load);

  const loans = data?.payable.loans ?? [];
  const dues = data?.payable.dues ?? [];
  const channels = data?.channels ?? [];
  const loan = loans.find((row) => row.id === loanId) ?? null;

  // Defaults once the data is in: the first loan and all its amount, every unpaid due, the first account.
  useEffect(() => {
    if (!data) return;
    if (!loanId && loans[0]) { setLoanId(loans[0].id); if (purpose === 'loan' || !purpose) setAmount(loans[0].payableNow ? loans[0].payableNow.toFixed(2) : ''); }
    setDueIds((current) => (current.length ? current.filter((id) => dues.some((due) => due.id === id)) : dues.map((due) => due.id)));
    if (!channel || !channels.some((row) => row.channel === channel)) setChannel(channels[0]?.channel ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (!proof) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(proof);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proof]);

  const choosePurpose = (value: PaymentPurpose) => {
    setPurpose(value);
    if (value === 'loan') setAmount(loan?.payableNow ? loan.payableNow.toFixed(2) : '');
    if (value === 'savings') setAmount('');
  };

  const duesTotal = sumMoney(dues.filter((due) => dueIds.includes(due.id)).map((due) => due.amount));
  const amountToSend = purpose === 'dues' ? duesTotal : Number(amount) || 0;
  const account = channels.find((row) => row.channel === channel) ?? null;
  const problem = useMemo(() => {
    if (!purpose) return 'Choose what you are paying.';
    if (purpose === 'loan' && !loan) return 'You have no loan with a balance to pay.';
    if (purpose === 'dues' && !dueIds.length) return 'Choose the dues you are paying.';
    if (purpose !== 'dues' && !(amountToSend > 0)) return 'Enter the amount you sent.';
    if (purpose === 'loan' && loan && Math.round(amountToSend * 100) > Math.round(loan.payableNow * 100)) return `At most ${formatPeso(loan.payableNow)} can be paid on this loan now.`;
    if (!account) return 'Choose GCash or Maya.';
    if (!proof) return 'Add the screenshot of your payment.';
    if (normalizeReference(reference).length < 6) return 'Enter the reference number shown on the payment.';
    if (!paidOn || paidOn > dateOnlyToday()) return 'Enter the date you paid (not in the future).';
    return '';
  }, [purpose, loan, dueIds, amountToSend, account, proof, reference, paidOn]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (problem || !purpose || !account || !proof) { toast.error(problem); return; }
    setSending(true);
    try {
      const result = await submitOnlinePayment({
        purpose, channel: account.channel, referenceNumber: reference, paidOn, proof: await shrinkScreenshot(proof),
        ...(purpose === 'loan' ? { loanId: loan?.id, amount: amountToSend.toFixed(2) } : purpose === 'dues' ? { dueIds } : { amount: amountToSend.toFixed(2) }),
      });
      toast.success(result.message);
      setProof(null);
      setReference('');
      setAmount('');
      setDueIds([]);
      load();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to send the payment.'));
    } finally {
      setSending(false);
    }
  };

  const copyNumber = () => {
    if (!account) return;
    navigator.clipboard?.writeText(account.accountNumber).then(() => toast.success('Number copied.')).catch(() => undefined);
  };

  const submissions = data?.submissions ?? [];
  const pages = usePagination(submissions);

  if (loadError) return <div className="p-4 text-sm text-red-600 md:p-8">{loadError}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <p className="text-gray-600">
        Pay your loan, your dues or a savings deposit by GCash or Maya. Send the money in your app first, then report it here with the screenshot.
        It is recorded once the office sees the money in the cooperative&apos;s account.
      </p>

      {!data ? <ListSkeleton rows={4} /> : !channels.length ? (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
          <EmptyState icon={Smartphone} title="Online payment is not available yet" message="Please pay at the ACIFAC office for now." />
        </section>
      ) : (
        <form onSubmit={submit} className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
            <h2 className="text-lg font-bold text-gray-900">1. What are you paying?</h2>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What you are paying">
              {PURPOSES.map((option) => {
                const disabled = (option.value === 'loan' && !loans.length) || (option.value === 'dues' && !dues.length);
                const Icon = option.icon;
                return (
                  <button key={option.value} type="button" role="radio" aria-checked={purpose === option.value} disabled={disabled} onClick={() => choosePurpose(option.value)}
                    className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${purpose === option.value ? 'border-green-600 bg-green-50 text-green-800 ring-1 ring-green-600' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            {!loans.length && !dues.length && <p className="text-xs text-gray-500">You have no loan balance or unpaid dues to pay right now.</p>}

            {purpose === 'loan' && loan && (
              <div className="space-y-3">
                {loans.length > 1 && (
                  <label className="block text-sm font-medium text-gray-700">Loan
                    <select className={`${input} mt-1`} value={loan.id} onChange={(event) => { const next = loans.find((row) => row.id === Number(event.target.value)); setLoanId(next?.id ?? null); setAmount(next?.payableNow.toFixed(2) ?? ''); }}>
                      {loans.map((row) => <option key={row.id} value={row.id}>{row.loanNumber}</option>)}
                    </select>
                  </label>
                )}
                <dl className="space-y-1 rounded-xl bg-gray-50 p-3 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-gray-600">Loan {loan.loanNumber}: balance</dt><dd className="tabular-nums">{formatPeso(loan.balance)}</dd></div>
                  {loan.penaltyDue > 0 && <div className="flex justify-between gap-3"><dt className="text-gray-600">Late penalty</dt><dd className="tabular-nums text-red-700">{formatPeso(loan.penaltyDue)}</dd></div>}
                  {loan.pendingAmount > 0 && <div className="flex justify-between gap-3"><dt className="text-gray-600">In payments the office is checking</dt><dd className="tabular-nums">− {formatPeso(loan.pendingAmount)}</dd></div>}
                  <div className="flex justify-between gap-3 border-t border-gray-200 pt-1 font-semibold"><dt>You can pay up to</dt><dd className="tabular-nums">{formatPeso(loan.payableNow)}</dd></div>
                </dl>
                <label className="block text-sm font-medium text-gray-700">Amount you are sending (₱)
                  <input type="number" inputMode="decimal" min="0.01" step="0.01" max={loan.payableNow} value={amount} onChange={(event) => setAmount(event.target.value)} className={`${input} mt-1`} required />
                </label>
                <p className="text-xs text-gray-500">The late penalty is paid first, then the loan.</p>
              </div>
            )}

            {purpose === 'dues' && (
              <div className="space-y-2">
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {dues.map((due) => (
                    <li key={due.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-green-700" checked={dueIds.includes(due.id)}
                          onChange={(event) => setDueIds((current) => (event.target.checked ? [...current, due.id] : current.filter((id) => id !== due.id)))} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-gray-900">{DUE_KIND_LABELS[due.kind]}: {due.description}</span>
                          <span className="block text-xs text-gray-500">{formatDate(due.dueDate)}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPeso(due.amount)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="flex justify-between text-sm font-semibold"><span>Total</span><span className="tabular-nums">{formatPeso(duesTotal)}</span></p>
                <p className="text-xs text-gray-500">Each due is paid in full. Dues already in a payment the office is checking are not listed.</p>
              </div>
            )}

            {purpose === 'savings' && (
              <label className="block text-sm font-medium text-gray-700">Amount you are depositing (₱)
                <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={`${input} mt-1`} required />
              </label>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
            <h2 className="text-lg font-bold text-gray-900">2. Send the money</h2>
            {channels.length > 1 && (
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Pay with">
                {channels.map((row) => (
                  <button key={row.channel} type="button" role="tab" aria-selected={channel === row.channel} onClick={() => setChannel(row.channel)}
                    className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${channel === row.channel ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
                    {row.channel}
                  </button>
                ))}
              </div>
            )}
            {account && (
              <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
                {account.hasQr && <ProtectedImage path={channelQrPath(account.channel)} alt={`The cooperative's ${account.channel} QR code`} className="h-48 w-48 shrink-0 bg-white ring-1 ring-gray-200" onClickOpen />}
                <div className="min-w-0 space-y-2 text-sm">
                  <p className="text-gray-600">Scan the QR code in your {account.channel} app, or send to:</p>
                  <p className="font-semibold text-gray-900">{account.accountName}</p>
                  <p className="flex items-center justify-center gap-2 sm:justify-start">
                    <span className="text-lg font-bold tabular-nums tracking-wide">{account.accountNumber}</span>
                    <button type="button" onClick={copyNumber} className="rounded-lg p-1.5 text-green-700 hover:bg-green-50" aria-label="Copy the number"><Copy className="h-4 w-4" /></button>
                  </p>
                  {amountToSend > 0 && <p className="rounded-xl bg-green-50 px-3 py-2 font-semibold text-green-900 ring-1 ring-green-100">Send exactly {formatPeso(amountToSend)}</p>}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-5 lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-900">3. Report the payment</h2>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-4 text-center text-sm text-gray-600 hover:border-green-600">
                  {preview ? <img src={preview} alt="Your payment screenshot" className="max-h-64 rounded-lg object-contain" /> : (
                    <>
                      <ImageUp className="h-7 w-7 text-green-700" aria-hidden="true" />
                      <span className="font-semibold text-gray-800">Add the screenshot of your payment</span>
                      <span className="text-xs">The {account?.channel ?? 'GCash or Maya'} confirmation showing the amount, the reference number and the date.</span>
                    </>
                  )}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setProof(event.target.files?.[0] ?? null)} />
                </label>
                {proof && <button type="button" onClick={() => setProof(null)} className="text-xs font-semibold text-gray-600 hover:underline">Choose another picture</button>}
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Reference number
                  <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. 1009 876 543210" autoComplete="off" className={`${input} mt-1 tabular-nums`} required />
                  <span className="mt-1 block text-xs text-gray-500">As shown on the payment (Ref No.). Each payment can be reported once.</span>
                </label>
                <label className="block text-sm font-medium text-gray-700">Date you paid
                  <input type="date" value={paidOn} max={dateOnlyToday()} onChange={(event) => setPaidOn(event.target.value)} className={`${input} mt-1`} required />
                </label>
                <p className="text-xs text-gray-500">The office checks the cooperative&apos;s {account?.channel ?? 'GCash or Maya'} account before recording it. You will be notified either way.</p>
                <button type="submit" disabled={sending || Boolean(problem)} title={problem || undefined}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  {sending ? 'Checking the screenshot…' : `Send to the office${amountToSend > 0 ? ` (${formatPeso(amountToSend)})` : ''}`}
                </button>
                {problem && !sending && <p className="text-xs text-amber-800">{problem}</p>}
              </div>
            </div>
          </section>
        </form>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <h2 className="border-b border-gray-100 px-4 py-3 text-lg font-bold text-gray-900">Your online payments</h2>
        {!data ? <ListSkeleton rows={3} /> : !submissions.length ? (
          <EmptyState icon={Smartphone} compact title="No online payments yet" message="Payments you report here are listed with what the office decided." />
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {pages.pageItems.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{purposeLabel(row)}</p>
                    <p className="text-xs text-gray-500">{row.channel} · Ref {row.reference} · paid {formatDate(row.paidOn)} · sent {formatDateTime(row.createdAt)}</p>
                    {row.status === 'rejected' && row.reviewNotes && <p className="mt-1 text-sm text-red-700">Not accepted: {row.reviewNotes}</p>}
                    {row.status === 'approved' && <p className="mt-1 text-xs text-green-800">Recorded {row.reviewedAt ? formatDateTime(row.reviewedAt) : ''}{row.reviewedBy ? ` by ${row.reviewedBy}` : ''}</p>}
                    {row.status === 'pending' && <p className="mt-1 text-xs text-amber-800">The office is checking that the money arrived.</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="font-bold tabular-nums text-gray-900">{formatPeso(row.amount)}</p>
                    <StatusBadge status={row.status} label={row.status === 'pending' ? 'Being checked' : row.status === 'approved' ? 'Recorded' : 'Not accepted'} />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="payments" />
          </>
        )}
      </section>
    </div>
  );
}
