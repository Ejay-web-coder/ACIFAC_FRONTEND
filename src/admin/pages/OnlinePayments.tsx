import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Smartphone, X, XCircle } from 'lucide-react';
import { EmptyState, ListSkeleton, Pagination, StatusBadge } from '../../app/components/common/UiKit';
import { ProtectedImage } from '../../app/components/common/ProtectedImage';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { errorMessage } from '../../lib/api';
import { formatDate, formatDateTime } from '../../utils/dateTime';
import { formatPeso } from '../../utils/money';
import { DUE_KIND_LABELS } from '../../app/services/duesApi';
import {
  approveOnlinePayment, fetchOnlinePayments, fetchPaymentChannels, paymentProofPath, purposeLabel, readOnlinePaymentAgain, rejectOnlinePayment,
  type PaymentChannel, type PaymentSubmission, type SubmissionStatus,
} from '../../app/services/onlinePaymentApi';

// Online Payments: GCash and Maya payments members reported with a screenshot.
// The screenshot is shown beside what AI read on it and the problems found.
// A screenshot can be faked, so the treasurer checks the cooperative's own
// GCash or Maya app before approving; approving records the payment as the
// office records any payment. Rejecting tells the member the reason.

type View = SubmissionStatus | 'all';
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'pending', label: 'To check' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];
const QUICK_REASONS = [
  'The money did not arrive in the cooperative\'s account.',
  'The amount that arrived is different from the amount reported.',
  'The screenshot is unclear. Please send a clearer one.',
  'The reference number does not match the payment.',
];

const statusLabel = (status: SubmissionStatus) => (status === 'pending' ? 'To check' : status === 'approved' ? 'Approved' : 'Rejected');

function FlagSummary({ row }: { row: PaymentSubmission }) {
  const errors = row.flags?.filter((flag) => flag.severity === 'error').length ?? 0;
  const warnings = (row.flags?.length ?? 0) - errors;
  if (errors) return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{errors} {errors === 1 ? 'problem' : 'problems'}</span>;
  if (warnings) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{warnings} to look at</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800 ring-1 ring-green-200"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Screenshot agrees</span>;
}

export function OnlinePayments() {
  const [view, setView] = useState<View>('pending');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchOnlinePayments>> | null>(null);
  const [error, setError] = useState('');
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchOnlinePayments({ status: view, page, limit: pageSize })
      .then((response) => { setResult(response); setError(''); })
      .catch((reason) => setError(errorMessage(reason, 'Unable to load the online payments.')));
  }, [view, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchPaymentChannels().then((response) => setChannels(response.data)).catch(() => undefined); }, []);
  useLiveRefresh(['payment_submissions', 'payment_channels'], load);

  const rows = result?.data ?? [];
  const open = rows.find((row) => row.id === openId) ?? null;
  const counts = result?.counts;
  const noChannel = channels.length > 0 && !channels.some((channel) => channel.enabled);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <p className="text-gray-600">
        GCash and Maya payments members reported with a screenshot. Before approving, open the cooperative&apos;s own GCash or Maya app and check that the money arrived:
        a screenshot can be faked. Approving records the payment; rejecting tells the member why.
      </p>
      {noChannel && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Members cannot pay online yet: set up the cooperative&apos;s GCash or Maya account in <Link to="/settings?tab=payments" className="font-semibold underline">Settings → Online Payments</Link>.
        </p>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="border-b border-gray-100 p-3 sm:p-4">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1 sm:inline-grid" role="tablist" aria-label="Online payments">
            {VIEWS.map((option) => (
              <button key={option.value} type="button" role="tab" aria-selected={view === option.value} onClick={() => { setView(option.value); setPage(1); }}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${view === option.value ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
                {option.label}{option.value !== 'all' && counts ? ` (${counts[option.value]})` : ''}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="p-4 text-sm text-red-600">{error}</p> : !result ? <ListSkeleton rows={4} /> : !rows.length ? (
          <EmptyState icon={Smartphone} compact title={view === 'pending' ? 'Nothing to check' : 'No payments here'} message={view === 'pending' ? 'Payments members report online appear here.' : 'Payments the office decided appear here.'} />
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {rows.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => setOpenId(row.id)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-gray-900">{row.memberName} <span className="font-normal text-gray-500">{row.memberNumber}</span></p>
                      <p className="text-sm text-gray-700">{purposeLabel(row)} · {row.channel} · Ref {row.reference}</p>
                      <p className="text-xs text-gray-500">Paid {formatDate(row.paidOn)} · reported {formatDateTime(row.createdAt)}</p>
                      {row.status === 'pending' ? <FlagSummary row={row} /> : row.reviewNotes && <p className="text-xs text-gray-600">{row.status === 'rejected' ? 'Reason' : 'Note'}: {row.reviewNotes}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <p className="text-lg font-bold tabular-nums text-gray-900">{formatPeso(row.amount)}</p>
                      <StatusBadge status={row.status} label={statusLabel(row.status)} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={page} totalPages={result.pagination.totalPages} total={result.pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="payments" />
          </>
        )}
      </section>

      {open && <ReviewModal row={open} channel={channels.find((channel) => channel.channel === open.channel) ?? null} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function ReviewModal({ row, channel, onClose, onChanged }: { row: PaymentSubmission; channel: PaymentChannel | null; onClose: () => void; onChanged: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | 'read' | null>(null);
  const reading = row.reading ?? null;
  const pending = row.status === 'pending';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (kind: 'approve' | 'reject' | 'read') => {
    setBusy(kind);
    try {
      const response = kind === 'approve' ? await approveOnlinePayment(row.id, notes) : kind === 'reject' ? await rejectOnlinePayment(row.id, reason) : await readOnlinePaymentAgain(row.id);
      toast.success(response.message);
      onChanged();
      if (kind !== 'read') onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save.'));
    } finally {
      setBusy(null);
    }
  };

  // What the member reported beside what AI read on the screenshot.
  const compare: Array<[string, string, string]> = [
    ['Amount', formatPeso(row.amount), reading?.amount ? formatPeso(Number(reading.amount)) : ''],
    ['Reference number', row.reference, reading?.referenceNumber ?? ''],
    ['Date paid', formatDate(row.paidOn), reading?.date ? `${formatDate(reading.date)}${reading.time ? ` ${reading.time}` : ''}` : ''],
    ['Sent to', channel ? `${channel.accountName} ${channel.accountNumber}` : row.channel, [reading?.recipientName, reading?.recipientNumber].filter(Boolean).join(' ')],
    ['App', row.channel, reading?.app && reading.app !== 'unknown' ? reading.app : ''],
    ['Payment status', '', reading?.status && reading.status !== 'unknown' ? reading.status : ''],
  ];

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="online-payment-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="online-payment-title" className="text-lg font-bold text-gray-900">{row.channel} payment of {formatPeso(row.amount)}</h2>
            <p className="text-sm text-gray-600">{row.memberName} {row.memberNumber ? `(${row.memberNumber})` : ''} · {purposeLabel(row)} · reported {formatDateTime(row.createdAt)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <ProtectedImage path={paymentProofPath(row.id)} alt={`Screenshot of the ${row.channel} payment`} className="max-h-[70vh] w-full bg-gray-50 ring-1 ring-gray-200" onClickOpen />
            <p className="mt-1 text-center text-xs text-gray-500">Click the picture to open it full size.</p>
          </div>

          <div className="space-y-4">
            {row.flags && row.flags.length > 0 ? (
              <ul className="space-y-1.5">
                {row.flags.map((flag) => (
                  <li key={`${flag.code}-${flag.message}`} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${flag.severity === 'error' ? 'bg-red-50 text-red-800 ring-1 ring-red-100' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'}`}>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{flag.message}
                  </li>
                ))}
              </ul>
            ) : row.flags && <p className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-900 ring-1 ring-green-100"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />The screenshot agrees with what the member reported. Still check the cooperative&apos;s app.</p>}

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-3 py-2 font-semibold"></th><th className="px-3 py-2 font-semibold">Reported</th><th className="px-3 py-2 font-semibold">On the screenshot (AI)</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {compare.map(([label, reported, read]) => (
                    <tr key={label}>
                      <th scope="row" className="px-3 py-2 text-left font-medium text-gray-600">{label}</th>
                      <td className="px-3 py-2 tabular-nums text-gray-900">{reported}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-900">{read || <span className="text-gray-400">{reading?.error ? 'not read' : '—'}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reading && !reading.error && typeof reading.confidence === 'number' && <p className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-500">AI is {reading.confidence}% sure of its reading.</p>}
            </div>

            {row.purpose === 'dues' && (
              <div>
                <p className="mb-1 text-sm font-semibold text-gray-700">Dues it pays</p>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
                  {row.dues.map((due) => (
                    <li key={due.id} className="flex justify-between gap-3 px-3 py-2"><span>{DUE_KIND_LABELS[due.kind]}: {due.description} <span className="text-xs text-gray-500">{formatDate(due.dueDate)}</span></span><span className="tabular-nums">{formatPeso(due.amount)}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {pending ? (
              <div className="space-y-4">
                {reading?.error && (
                  <button type="button" onClick={() => void act('read')} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    {busy === 'read' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Have AI read the screenshot again
                  </button>
                )}
                <div className="space-y-2 rounded-xl border border-green-200 bg-green-50/50 p-3">
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-900">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-green-700" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                    <span>I checked the cooperative&apos;s {row.channel} app: <strong>{formatPeso(row.amount)}</strong> with reference <strong>{row.reference}</strong> arrived.</span>
                  </label>
                  <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Note (optional)" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => void act('approve')} disabled={!confirmed || busy !== null}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Approve and record the payment
                  </button>
                </div>
                <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-3">
                  <p className="text-sm font-semibold text-gray-900">Or reject it: the member is told the reason.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REASONS.map((text) => <button key={text} type="button" onClick={() => setReason(text)} className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-gray-400">{text}</button>)}
                  </div>
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} placeholder="Reason (required)" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => void act('reject')} disabled={reason.trim().length < 3 || busy !== null}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Reject
                  </button>
                </div>
              </div>
            ) : (
              <p className={`rounded-xl px-3 py-2 text-sm ${row.status === 'approved' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>
                {statusLabel(row.status)} {row.reviewedAt ? formatDateTime(row.reviewedAt) : ''}{row.reviewedBy ? ` by ${row.reviewedBy}${row.reviewedByPosition ? ` (${row.reviewedByPosition})` : ''}` : ''}.
                {row.reviewNotes ? ` ${row.status === 'rejected' ? 'Reason' : 'Note'}: ${row.reviewNotes}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
