import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRightLeft, CalendarCheck, CheckCircle2, ChevronRight, CircleDollarSign, HandCoins, LoaderCircle, ReceiptText, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, ListSkeleton, Pagination, StatCard, StatusBadge } from '../../app/components/common/UiKit';
import { confirmAction } from '../../app/components/common/ConfirmDialog';
import { DuesRatesNote } from '../../app/components/DuesRatesNote';
import { PaymentReceiptModal } from '../components/receipt/PaymentReceiptModal';
import { duesReceipt, type PaymentReceipt } from '../components/receipt/paymentReceipt';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { errorMessage } from '../../lib/api';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';
import { formatPeso, sumMoney } from '../../utils/money';
import {
  addTransferFee, chargeMeetingDues, DUE_KIND_LABELS, DUES_PAYMENT_METHOD, fetchDuesMeetings, fetchMemberDues, fetchMemberDuesList, recordDuesPayment, waiveDue,
  type Due, type DuesFilter, type DuesMeeting, type DuesRates, type DuesSummary, type MemberDuesDetail, type MemberDuesRow,
} from '../../app/services/duesApi';

// Dues under the Membership Policy: what each member was charged (share
// capital and savings at every meeting, absence fines, transfer fees), what
// they paid and what they still owe. Meeting dues are added when a meeting's
// attendance is finalized under Attendance.

type Section = 'members' | 'meetings';
const INPUT = 'w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600';
const FILTERS: Array<{ value: DuesFilter; label: string }> = [
  { value: 'owing', label: 'Still owing' },
  { value: 'settled', label: 'Fully paid' },
  { value: 'all', label: 'All members' },
];

export function Dues() {
  const [section, setSection] = useState<Section>('members');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DuesFilter>('owing');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<MemberDuesRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<(DuesSummary & { membersOwing: number }) | null>(null);
  const [rates, setRates] = useState<DuesRates | null>(null);
  const [open, setOpen] = useState<{ id: number; name: string; memberNumber: string | null } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const response = await fetchMemberDuesList({ search: query, filter, page, limit: pageSize });
      setRows(response.data);
      setTotal(response.pagination.total);
      setTotals(response.totals);
      setRates(response.rates);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to load dues.'));
      setRows([]);
    }
  }, [query, filter, page, pageSize]);

  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['member_dues', 'member_dues_payments'], () => { void load(); setRefreshKey((key) => key + 1); });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">What each member was charged, has paid and still owes. Meeting dues are added when a meeting's attendance is finalized; collect them here.</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Still owed" value={formatPeso(totals?.unpaid ?? 0)} icon={CircleDollarSign} tone="warning" loading={!totals} detail={`${totals?.unpaidCount ?? 0} unpaid dues`} />
        <StatCard label="Members owing" value={String(totals?.membersOwing ?? 0)} icon={Users} loading={!totals} />
        <StatCard label="Collected" value={formatPeso(totals?.paid ?? 0)} icon={HandCoins} tone="dark" loading={!totals} />
        <StatCard label="Waived" value={formatPeso(totals?.waived ?? 0)} icon={CheckCircle2} loading={!totals} />
      </div>
      <DuesRatesNote rates={rates} />

      <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 sm:w-fit" role="tablist" aria-label="Dues views">
        {([['members', 'Members', Users], ['meetings', 'Meetings', CalendarCheck]] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => setSection(key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${section === key ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {section === 'members' ? (
        <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or member ID" aria-label="Search members" className={`${INPUT} pl-9`} />
            </div>
            <select value={filter} onChange={(event) => { setFilter(event.target.value as DuesFilter); setPage(1); }} aria-label="Which members" className={`${INPUT} sm:w-48`}>
              {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {!rows ? <ListSkeleton rows={5} /> : !rows.length ? (
            <EmptyState icon={ReceiptText} compact title={filter === 'owing' ? 'Nobody owes anything' : 'No members found'}
              message={filter === 'owing' ? 'Dues appear here once a meeting\'s attendance is finalized.' : 'Try another search or filter.'} />
          ) : (
            <>
              <ul className="divide-y divide-gray-100 md:hidden">
                {rows.map((row) => (
                  <li key={row.memberId}>
                    <button type="button" onClick={() => setOpen({ id: row.memberId, name: row.name, memberNumber: row.memberNumber })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-500">{row.memberNumber || '—'}{row.memberStatus === 'archived' ? ' · terminated' : ''}</p>
                        {row.unpaid > 0 && <p className="mt-0.5 text-xs text-gray-500">Oldest from {formatDate(row.oldestUnpaid)}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-right">
                        <div>
                          <p className={`font-bold tabular-nums ${row.unpaid > 0 ? 'text-amber-700' : 'text-green-700'}`}>{formatPeso(row.unpaid)}</p>
                          <p className="text-xs tabular-nums text-gray-500">paid {formatPeso(row.paid)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>{['Member', 'Share capital', 'Savings', 'Fines', 'Fees', 'Still owed', 'Paid', 'Oldest unpaid', ''].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => (
                      <tr key={row.memberId} className="hover:bg-gray-50">
                        <td className="px-4 py-3"><p className="font-medium text-gray-900">{row.name}</p><p className="text-xs text-gray-500">{row.memberNumber || '—'}{row.memberStatus === 'archived' ? ' · terminated' : ''}</p></td>
                        {[row.unpaidShareCapital, row.unpaidSavings, row.unpaidFines, row.unpaidFees].map((value, index) => <td key={index} className={`whitespace-nowrap px-4 py-3 tabular-nums ${value ? 'text-gray-900' : 'text-gray-400'}`}>{formatPeso(value)}</td>)}
                        <td className={`whitespace-nowrap px-4 py-3 font-bold tabular-nums ${row.unpaid > 0 ? 'text-amber-700' : 'text-green-700'}`}>{formatPeso(row.unpaid)}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{formatPeso(row.paid)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">{row.oldestUnpaid ? formatDate(row.oldestUnpaid) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setOpen({ id: row.memberId, name: row.name, memberNumber: row.memberNumber })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-green-600 px-3 text-sm font-semibold text-green-700 hover:bg-green-50">
                            {row.unpaid > 0 ? 'Collect' : 'Open'}<ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="members" />
            </>
          )}
        </section>
      ) : <MeetingsPanel refreshKey={refreshKey} onCharged={() => void load()} />}

      {open && <MemberDuesModal member={open} refreshKey={refreshKey} onChanged={() => void load()} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MeetingsPanel({ refreshKey, onCharged }: { refreshKey: number; onCharged: () => void }) {
  const [meetings, setMeetings] = useState<DuesMeeting[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(() => {
    fetchDuesMeetings().then((response) => setMeetings(response.data)).catch((error) => { toast.error(errorMessage(error, 'Unable to load meetings.')); setMeetings([]); });
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const charge = async (meeting: DuesMeeting) => {
    if (!(await confirmAction(`Add the dues of "${meeting.title}" (${formatDate(meeting.activityDate)}) for the ${meeting.members} members on its attendance list? Members absent without a valid reason also get the absence fine.`, { confirmLabel: 'Add dues' }))) return;
    setBusy(meeting.id);
    try {
      const response = await chargeMeetingDues(meeting.id);
      toast.success(response.message);
      load();
      onCharged();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to add the dues.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
      <div className="border-b border-gray-100 p-4">
        <h2 className="font-semibold text-gray-900">Meetings with final attendance</h2>
        <p className="mt-0.5 text-sm text-gray-500">Dues are added by themselves when a meeting is finalized. Meetings finalized before dues were kept in the system can be charged here.</p>
      </div>
      {!meetings ? <ListSkeleton rows={4} /> : !meetings.length ? (
        <EmptyState icon={CalendarCheck} compact title="No finalized meetings yet" message="Finalize a meeting's attendance under Attendance." />
      ) : (
        <ul className="divide-y divide-gray-100">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{meeting.title}</p>
                <p className="text-xs text-gray-500">{formatDate(meeting.activityDate)} · {meeting.members} members · {meeting.absent} absent without a valid reason</p>
              </div>
              {meeting.duesChargedAt ? (
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <span className="tabular-nums text-gray-600">{formatPeso(meeting.charged)} charged · <span className={meeting.unpaid ? 'font-semibold text-amber-700' : 'text-green-700'}>{formatPeso(meeting.unpaid)} unpaid</span></span>
                  <StatusBadge status="completed" label="Dues added" />
                </div>
              ) : (
                <button type="button" disabled={busy !== null} onClick={() => void charge(meeting)} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                  {busy === meeting.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}Add dues
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-sm font-medium text-gray-700">{label}<div className="mt-1.5">{children}</div>{hint && <p className="mt-1 text-xs font-normal text-gray-500">{hint}</p>}</label>;
}

const dueTitle = (due: Due) => (due.activityTitle ? `${DUE_KIND_LABELS[due.kind]}: ${due.activityTitle}` : due.description || DUE_KIND_LABELS[due.kind]);

function MemberDuesModal({ member, refreshKey, onChanged, onClose }: { member: { id: number; name: string; memberNumber: string | null }; refreshKey: number; onChanged: () => void; onClose: () => void }) {
  const [detail, setDetail] = useState<MemberDuesDetail | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [payment, setPayment] = useState({ paymentDate: dateOnlyToday(), reference: '', notes: '' });
  const [waiving, setWaiving] = useState<Due | null>(null);
  const [reason, setReason] = useState('');
  const [transfer, setTransfer] = useState<{ transferTo: string; date: string } | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchMemberDues(member.id).then((response) => setDetail(response)).catch((error) => toast.error(errorMessage(error, 'Unable to load the member\'s dues.')));
  }, [member.id]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const unpaid = useMemo(() => detail?.dues.filter((due) => due.status === 'unpaid') ?? [], [detail]);
  const settled = useMemo(() => detail?.dues.filter((due) => due.status !== 'unpaid') ?? [], [detail]);
  // A due no longer unpaid (paid elsewhere, live update) drops out of the selection.
  const chosen = unpaid.filter((due) => selected.has(due.id));
  const chosenTotal = sumMoney(chosen.map((due) => due.amount));
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allChosen = unpaid.length > 0 && chosen.length === unpaid.length;

  const after = (response: MemberDuesDetail & { message: string }) => {
    setDetail(response);
    setSelected(new Set());
    toast.success(response.message);
    onChanged();
  };

  const pay = async (event: FormEvent) => {
    event.preventDefault();
    if (!chosen.length || busy) return;
    const shareCapital = sumMoney(chosen.filter((due) => due.kind === 'share_capital').map((due) => due.amount));
    const savings = sumMoney(chosen.filter((due) => due.kind === 'savings').map((due) => due.amount));
    const parts = [shareCapital && `${formatPeso(shareCapital)} goes to share capital`, savings && `${formatPeso(savings)} to savings`].filter(Boolean).join(' and ');
    if (!(await confirmAction(`Record a payment of ${formatPeso(chosenTotal)} from ${member.name} for ${chosen.length} ${chosen.length === 1 ? 'due' : 'dues'}?${parts ? ` ${parts[0].toUpperCase()}${parts.slice(1)}.` : ''}`, { confirmLabel: 'Record payment' }))) return;
    setBusy(true);
    try {
      after(await recordDuesPayment({ memberId: member.id, dueIds: chosen.map((due) => due.id), paymentDate: payment.paymentDate, paymentMethod: DUES_PAYMENT_METHOD, reference: payment.reference.trim() || undefined, notes: payment.notes.trim() || undefined }));
      setPayment((current) => ({ ...current, reference: '', notes: '' }));
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to record the payment.'));
    } finally {
      setBusy(false);
    }
  };

  const waive = async (event: FormEvent) => {
    event.preventDefault();
    if (!waiving || busy) return;
    setBusy(true);
    try {
      after(await waiveDue(waiving.id, reason.trim()));
      setWaiving(null);
      setReason('');
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to waive the due.'));
    } finally {
      setBusy(false);
    }
  };

  const addFee = async (event: FormEvent) => {
    event.preventDefault();
    if (!transfer || busy) return;
    setBusy(true);
    try {
      after(await addTransferFee({ memberId: member.id, transferTo: transfer.transferTo.trim(), date: transfer.date }));
      setTransfer(null);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to add the transfer fee.'));
    } finally {
      setBusy(false);
    }
  };

  const summary = detail?.summary;
  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="member-dues-title">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">Dues</p>
            <h2 id="member-dues-title" className="truncate text-lg font-bold text-gray-900">{member.name}</h2>
            <p className="text-sm text-gray-500">Member ID: {member.memberNumber || '—'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard label="Still owed" value={formatPeso(summary?.unpaid ?? 0)} tone="warning" loading={!summary} />
            <StatCard label="Paid" value={formatPeso(summary?.paid ?? 0)} loading={!summary} />
            <StatCard label="Waived" value={formatPeso(summary?.waived ?? 0)} loading={!summary} />
          </div>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-900">Unpaid dues</h3>
              <button type="button" onClick={() => setTransfer({ transferTo: '', date: dateOnlyToday() })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <ArrowRightLeft className="h-4 w-4" />Transfer fee
              </button>
            </div>
            {transfer && (
              <form onSubmit={addFee} className="mb-3 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <Field label="Membership transferred to"><input required value={transfer.transferTo} onChange={(event) => setTransfer({ ...transfer, transferTo: event.target.value })} className={INPUT} placeholder="Full name of the new member" /></Field>
                <Field label="Date"><input type="date" required max={dateOnlyToday()} value={transfer.date} onChange={(event) => setTransfer({ ...transfer, date: event.target.value })} className={INPUT} /></Field>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="min-h-10 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">Add {formatPeso(detail?.rates.transfer_fee?.amount ?? 500)}</button>
                  <button type="button" onClick={() => setTransfer(null)} className="min-h-10 rounded-xl bg-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-300">Cancel</button>
                </div>
              </form>
            )}
            {!detail ? <ListSkeleton rows={3} /> : !unpaid.length ? (
              <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">Nothing unpaid.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <label className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" checked={allChosen} onChange={() => setSelected(allChosen ? new Set() : new Set(unpaid.map((due) => due.id)))} className="h-4 w-4 accent-green-600" />
                  Choose all ({formatPeso(summary?.unpaid ?? 0)})
                </label>
                <ul className="divide-y divide-gray-100">
                  {unpaid.map((due) => (
                    <li key={due.id} className="flex items-center gap-3 px-3 py-2.5">
                      <input type="checkbox" checked={selected.has(due.id)} onChange={() => toggle(due.id)} aria-label={`Pay ${dueTitle(due)}`} className="h-4 w-4 shrink-0 accent-green-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{dueTitle(due)}</p>
                        <p className="text-xs text-gray-500">{formatDate(due.dueDate)}</p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums text-gray-900">{formatPeso(due.amount)}</span>
                      <button type="button" onClick={() => { setWaiving(due); setReason(''); }} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800">Waive</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {waiving && (
              <form onSubmit={waive} className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">Waive <strong>{dueTitle(waiving)}</strong> ({formatPeso(waiving.amount)})? The member will not have to pay it. The reason is kept on record.</p>
                <Field label="Reason"><input required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} className={INPUT} placeholder="e.g. Board excused: flooded road" /></Field>
                <div className="flex gap-2">
                  <button type="submit" disabled={busy || reason.trim().length < 3} className="min-h-10 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">Waive</button>
                  <button type="button" onClick={() => setWaiving(null)} className="min-h-10 rounded-xl bg-white px-3 text-sm font-semibold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Cancel</button>
                </div>
              </form>
            )}
            {chosen.length > 0 && (
              <form onSubmit={pay} className="mt-3 space-y-3 rounded-xl border border-green-200 bg-green-50 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Payment date"><input type="date" required max={dateOnlyToday()} value={payment.paymentDate} onChange={(event) => setPayment({ ...payment, paymentDate: event.target.value })} className={INPUT} /></Field>
                  <Field label="Paid by"><input value={DUES_PAYMENT_METHOD} readOnly aria-readonly="true" title="Dues are paid in cash only" className={`${INPUT} cursor-default bg-gray-50 text-gray-700`} /></Field>
                  <Field label="OR / reference"><input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} className={INPUT} placeholder="Optional" /></Field>
                </div>
                <p className="text-xs text-green-900">The share capital part is recorded as a share capital contribution and the savings part as a savings deposit.</p>
                <button type="submit" disabled={busy} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 font-semibold text-white hover:bg-green-700 disabled:opacity-60 sm:w-auto">
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}Record payment of {formatPeso(chosenTotal)}
                </button>
              </form>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-gray-900">Payments</h3>
            {!detail ? <ListSkeleton rows={2} /> : !detail.payments.length ? <p className="text-sm text-gray-500">No dues payments yet.</p> : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {detail.payments.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{formatDate(item.paymentDate)} · {item.paymentMethod}{item.reference ? ` · ${item.reference}` : ''}</p>
                      <p className="text-xs text-gray-500">{item.duesCount} {item.duesCount === 1 ? 'due' : 'dues'}{item.recordedBy ? ` · recorded by ${item.recordedBy}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-semibold tabular-nums text-green-700">{formatPeso(item.amount)}</span>
                      <button type="button" onClick={() => setReceipt(duesReceipt(member, item, detail.dues))} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-green-700 hover:bg-green-50"><ReceiptText className="h-4 w-4" />Receipt</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {settled.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold text-gray-900">Paid and waived dues</h3>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {settled.map((due) => (
                  <li key={due.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{dueTitle(due)}</p>
                      <p className="text-xs text-gray-500">{formatDate(due.dueDate)}{due.status === 'paid' && due.paidOn ? ` · paid ${formatDate(due.paidOn)}` : ''}{due.status === 'waived' && due.waiveReason ? ` · ${due.waiveReason}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-gray-700">{formatPeso(due.amount)}</span>
                      <StatusBadge status={due.status === 'paid' ? 'paid' : 'closed'} label={due.status === 'paid' ? 'Paid' : 'Waived'} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      {receipt && <PaymentReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
