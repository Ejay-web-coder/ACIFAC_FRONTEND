import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Eye, Filter, LoaderCircle, Plus, Search, Users, Wallet, X } from 'lucide-react';
import { EmptyState, Pagination, StatCard } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import {
  createSavingsRequest, createSavingsWithdrawal, fetchMembers, fetchMemberSavings, fetchSavingsMembers, fetchSavingsRecords,
  type MemberSavingsEntry, type MemberSavingsSummary, type SavingsMember,
} from '../services/membersApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';

type SavingsView = 'total' | 'add' | 'history';
type TransactionType = 'Deposit' | 'Withdrawal';
interface SavingsRecord { id: string; date: string; memberId: string; memberName: string; type: TransactionType; amount: number; reference: string; notes: string; status: 'Completed' | 'Pending'; paymentMethod?: string; }
// Savings deposits and withdrawals have their own ledger (savings_transactions); share capital is separate.
const types: TransactionType[] = ['Deposit', 'Withdrawal'];
const METHODS = ['Cash', 'Deposit', 'GCash', 'Bank Transfer', 'Check', 'Other'];
const peso = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (type: TransactionType, amount: number) => `${type === 'Withdrawal' ? '−' : '+'}${peso(amount)}`;
const MONEY = /^\d+(\.\d{1,2})?$/;
const INPUT = 'w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600';

export function Savings({ userRole, view }: { userRole: UserRole; view: SavingsView }) {
  const [records, setRecords] = useState<SavingsRecord[]>([]);
  const [members, setMembers] = useState<Array<{ id: number; memberId: string; memberName: string }>>([]);
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [form, setForm] = useState({ member: '', memberId: '', amount: '', date: dateOnlyToday(), type: 'Deposit' as TransactionType, reference: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  // The member whose savings window is open.
  const [openMember, setOpenMember] = useState<{ id: number; memberNumber: string; memberName: string } | null>(null);
  // Bumped after every deposit or withdrawal so the members list reloads.
  const [refreshKey, setRefreshKey] = useState(0);

  const [serverTotals, setServerTotals] = useState<{ total: number; today: number; month: number; members: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadSavings = useCallback(async () => {
    try {
      const [savingsResponse, membersResponse] = await Promise.all([
        fetchSavingsRecords({ limit: 100 }),
        fetchMembers('', 100),
      ]);

      setRecords(savingsResponse.data.map((item) => ({
        id: String(item.id),
        date: item.date,
        memberId: String(item.memberNumber || item.memberId),
        memberName: item.memberName,
        type: item.type,
        amount: item.amount,
        reference: item.reference,
        notes: item.notes,
        status: item.status,
        paymentMethod: item.paymentMethod,
      })));
      setServerTotals({ total: savingsResponse.summary.totalAmount, today: savingsResponse.summary.today, month: savingsResponse.summary.thisMonth, members: savingsResponse.summary.members });
      setMembers(membersResponse.data.map((member) => ({ id: member.id, memberId: member.memberId, memberName: member.name })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load savings records.');
    }
  }, []);

  useEffect(() => { void loadSavings(); }, [loadSavings]);
  useLiveRefresh(['savings_transactions', 'members'], () => { void loadSavings(); setRefreshKey((key) => key + 1); });

  const afterChange = () => { void loadSavings(); setRefreshKey((key) => key + 1); };

  // The savings balance of every member (deposits minus withdrawals), not only the rows loaded on this page.
  const total = serverTotals?.total ?? 0;
  const filtered = useMemo(() => records.filter((record) => {
    const query = search.toLowerCase();
    return (!query || `${record.memberId} ${record.memberName} ${record.reference} ${record.notes}`.toLowerCase().includes(query)) && (memberFilter === 'all' || record.memberId === memberFilter) && (typeFilter === 'all' || record.type === typeFilter) && (!dateFilter || record.date === dateFilter);
  }), [records, search, memberFilter, typeFilter, dateFilter]);

  if (userRole !== 'admin') return <div className="p-8">Access restricted to administrators only</div>;

  const update = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.member) next.member = 'Member is required.';
    if (!form.amount || Number(form.amount) <= 0) next.amount = 'Amount must be greater than 0.';
    if (!form.date) next.date = 'Date is required.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const selected = members.find((member) => member.memberName === form.member);
    if (!selected) {
      toast.error('Please select a valid member.');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);
    try {
      const response = await createSavingsRequest({
        memberId: selected.id,
        amount: form.amount,
        date: form.date,
        paymentMethod: 'Deposit',
        reference: form.reference.trim() || undefined,
        notes: form.notes,
      });
      afterChange();
      toast.success('Savings recorded successfully', { description: `${selected.memberName}'s total savings are now ${peso(response.memberTotal)}.` });
      setForm({ member: '', memberId: '', amount: '', date: dateOnlyToday(), type: 'Deposit', reference: '', notes: '' });
      setErrors({});
      setShowAddModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save savings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (view === 'add') return <AddSavings form={form} errors={errors} update={update} submit={submit} members={members} />;
  if (view === 'history') return <History records={filtered} members={members} search={search} setSearch={setSearch} memberFilter={memberFilter} setMemberFilter={setMemberFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} />;
  return <>
    <div className="space-y-6">
      <Header description="Member savings deposits and withdrawals. Share capital is tracked separately in member records." action={<button type="button" onClick={() => setShowAddModal(true)} className="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"><Plus className="h-4 w-4" />Add Savings</button>} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total Savings" value={peso(total)} icon={Wallet} tone="dark" />
        <StatCard label="Members with Savings" value={String(serverTotals?.members ?? 0)} icon={Users} />
        <StatCard label="Deposits Today" value={peso(serverTotals?.today ?? 0)} icon={Plus} />
        <StatCard label="Deposits This Month" value={peso(serverTotals?.month ?? 0)} icon={Wallet} />
      </div>
      <SavingsMembers refreshKey={refreshKey} onOpen={setOpenMember} />
      <RecentActivity records={records} filtered={filtered} members={members} search={search} setSearch={setSearch} memberFilter={memberFilter} setMemberFilter={setMemberFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} />
    </div>
    {openMember && <MemberSavingsModal member={openMember} refreshKey={refreshKey} onChanged={afterChange} onClose={() => setOpenMember(null)} />}
    {showAddModal && <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="add-savings-title">
      <div className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 id="add-savings-title" className="text-xl font-bold text-gray-900">Add Savings</h2>
          <button type="button" onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close add savings form">
            <X className="h-5 w-5" />
          </button>
        </div>
        <AddSavings form={form} errors={errors} update={update} submit={submit} onCancel={() => setShowAddModal(false)} members={members} />
      </div>
    </div>}
  </>;
}

// Every member with savings, searched by name or member ID on the server.
function SavingsMembers({ refreshKey, onOpen }: { refreshKey: number; onOpen: (member: SavingsMember) => void }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<SavingsMember[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSavingsMembers({ search, page, limit: pageSize })
      .then((response) => {
        if (cancelled) return;
        setRows(response.data);
        setTotal(response.pagination.total);
        setTotalPages(Math.max(1, response.pagination.totalPages));
        setError('');
      })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message || 'Unable to load members with savings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, page, pageSize, refreshKey]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-sm" aria-labelledby="savings-members-title">
      <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 id="savings-members-title" className="font-bold text-gray-900">Members with Savings</h3>
          <p className="text-sm text-gray-600">Select a member to see their savings history, total and withdrawals.</p>
        </div>
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or member ID" aria-label="Search members with savings by name or member ID" className="input-style pl-9" />
        </div>
      </div>

      {error ? <p className="p-6 text-sm text-red-600">{error}</p>
        : loading && !rows.length ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading members…</p>
          : !rows.length ? <EmptyState icon={Wallet} title={search ? 'No members match your search' : 'No members with savings yet'} message={search ? 'Try another name or member ID.' : 'Members appear here after their first savings deposit.'} compact />
            : <>
              {/* Phone: one card per member */}
              <ul className="divide-y divide-gray-100 md:hidden">
                {rows.map((member) => (
                  <li key={member.id}>
                    <button type="button" onClick={() => onOpen(member)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-green-50/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">{member.memberName}</p>
                        <p className="text-xs text-gray-500">{member.memberNumber} · {member.transactions} {member.transactions === 1 ? 'entry' : 'entries'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums text-green-700">{peso(member.balance)}</p>
                        <p className="text-xs text-gray-500">Balance</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                    </button>
                  </li>
                ))}
              </ul>
              {/* Tablet and up: a table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-gray-50">
                    <tr>{['Member ID', 'Member Name', 'Deposits', 'Withdrawals', 'Balance', 'Last Entry', ''].map((heading, index) => <th key={heading || index} className={`px-4 py-3 text-xs font-medium uppercase text-gray-500 ${index >= 2 && index <= 4 ? 'text-right' : 'text-left'}`}>{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((member) => (
                      <tr key={member.id} onClick={() => onOpen(member)} className="cursor-pointer hover:bg-green-50/40">
                        <td className="px-4 py-3 text-sm text-gray-600">{member.memberNumber}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{member.memberName}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{peso(member.deposits)}</td>
                        <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{member.withdrawals ? peso(member.withdrawals) : '—'}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-green-700">{peso(member.balance)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{member.lastTransactionDate ? formatDate(member.lastTransactionDate) : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(member); }} className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800" aria-label={`View savings of ${member.memberName}`}><Eye className="h-4 w-4" />View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="members" />
            </>}
    </section>
  );
}

// One member's savings: the balance, the totals, every deposit and withdrawal
// with the balance after it, and the Withdraw / Deposit form.
function MemberSavingsModal({ member, refreshKey, onChanged, onClose }: { member: { id: number; memberNumber: string; memberName: string }; refreshKey: number; onChanged: () => void; onClose: () => void }) {
  const [entries, setEntries] = useState<MemberSavingsEntry[]>([]);
  const [summary, setSummary] = useState<MemberSavingsSummary | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'withdraw' | 'deposit' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMemberSavings(member.id, { page, limit: pageSize })
      .then((response) => {
        if (cancelled) return;
        setEntries(response.data);
        setSummary(response.summary);
        setTotalPages(Math.max(1, response.pagination.totalPages));
        setError('');
      })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message || 'Unable to load the savings history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [member.id, page, pageSize, refreshKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !action) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [action, onClose]);

  const balance = summary?.balance ?? 0;

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="member-savings-title">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">Savings</p>
            <h2 id="member-savings-title" className="truncate text-lg font-bold text-gray-900">{member.memberName}</h2>
            <p className="text-sm text-gray-500">Member ID: {member.memberNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close savings window"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-green-700 p-4 text-white">
              <p className="text-sm text-green-100">Total Savings</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{summary ? peso(balance) : '—'}</p>
              <p className="mt-1 text-xs text-green-100">{summary ? `${summary.transactions} ${summary.transactions === 1 ? 'entry' : 'entries'}` : ''}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="flex items-center gap-1.5 text-sm text-gray-600"><ArrowDownLeft className="h-4 w-4 text-green-600" />Total Deposits</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{summary ? peso(summary.deposits) : '—'}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="flex items-center gap-1.5 text-sm text-gray-600"><ArrowUpRight className="h-4 w-4 text-amber-600" />Total Withdrawals</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{summary ? peso(summary.withdrawals) : '—'}</p>
            </div>
          </div>

          {action ? (
            <SavingsEntryForm
              kind={action}
              member={member}
              balance={balance}
              onCancel={() => setAction(null)}
              onSaved={() => { setAction(null); setPage(1); onChanged(); }}
            />
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => setAction('withdraw')} disabled={!summary || balance <= 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-gray-300"><ArrowUpRight className="h-4 w-4" />Withdraw</button>
              <button type="button" onClick={() => setAction('deposit')} disabled={!summary} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-green-600 px-4 py-2 font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Add Deposit</button>
              {summary && balance <= 0 && <p className="self-center text-sm text-gray-500">No savings left to withdraw.</p>}
            </div>
          )}

          <div className="rounded-xl border border-gray-200">
            <h3 className="border-b border-gray-200 px-4 py-3 font-bold text-gray-900">Savings History</h3>
            {error ? <p className="p-6 text-sm text-red-600">{error}</p>
              : loading && !entries.length ? <p className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading history…</p>
                : !entries.length ? <p className="p-8 text-center text-sm text-gray-500">No savings entries yet.</p>
                  : <>
                    <ul className="divide-y divide-gray-100 sm:hidden">
                      {entries.map((entry) => (
                        <li key={entry.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <TypeBadge type={entry.type} />
                              <p className="mt-1 text-xs text-gray-500">{formatDate(entry.date)} · {entry.paymentMethod}</p>
                              <p className="truncate text-xs text-gray-500">{entry.reference}{entry.notes && ` · ${entry.notes}`}</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold tabular-nums ${entry.type === 'Withdrawal' ? 'text-amber-700' : 'text-green-700'}`}>{signed(entry.type, entry.amount)}</p>
                              <p className="text-xs tabular-nums text-gray-500">Balance {peso(entry.balance)}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full min-w-[640px]">
                        <thead className="bg-gray-50">
                          <tr>{['Date', 'Type', 'Amount', 'Balance', 'Method', 'Reference / Notes'].map((heading, index) => <th key={heading} className={`px-4 py-2.5 text-xs font-medium uppercase text-gray-500 ${index === 2 || index === 3 ? 'text-right' : 'text-left'}`}>{heading}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {entries.map((entry) => (
                            <tr key={entry.id}>
                              <td className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-600">{formatDate(entry.date)}</td>
                              <td className="px-4 py-2.5"><TypeBadge type={entry.type} /></td>
                              <td className={`whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold tabular-nums ${entry.type === 'Withdrawal' ? 'text-amber-700' : 'text-green-700'}`}>{signed(entry.type, entry.amount)}</td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm tabular-nums text-gray-900">{peso(entry.balance)}</td>
                              <td className="px-4 py-2.5 text-sm text-gray-600">{entry.paymentMethod}</td>
                              <td className="px-4 py-2.5 text-sm text-gray-600">{entry.reference}{entry.notes && <span className="block text-xs text-gray-400">{entry.notes}</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination page={page} totalPages={totalPages} total={summary?.transactions ?? entries.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="entries" />
                  </>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: TransactionType }) {
  return type === 'Withdrawal'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"><ArrowUpRight className="h-3 w-3" />Withdrawal</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"><ArrowDownLeft className="h-3 w-3" />Deposit</span>;
}

// Records a withdrawal (never more than the balance) or a deposit for the open member.
function SavingsEntryForm({ kind, member, balance, onCancel, onSaved }: { kind: 'withdraw' | 'deposit'; member: { id: number; memberName: string }; balance: number; onCancel: () => void; onSaved: () => void }) {
  const withdraw = kind === 'withdraw';
  const [values, setValues] = useState({ amount: '', date: dateOnlyToday(), paymentMethod: withdraw ? 'Cash' : 'Deposit', reference: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof values, value: string) => { setValues((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: '' })); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const amount = values.amount.trim();
    if (!MONEY.test(amount) || Number(amount) <= 0) next.amount = 'Enter an amount greater than 0 with up to two decimals.';
    else if (withdraw && Math.round(Number(amount) * 100) > Math.round(balance * 100)) next.amount = `The withdrawal cannot be more than the balance of ${peso(balance)}.`;
    if (!values.date) next.date = 'Date is required.';
    else if (values.date > dateOnlyToday()) next.date = 'The date cannot be in the future.';
    setErrors(next);
    if (Object.values(next).some(Boolean) || saving) return;
    setSaving(true);
    try {
      const payload = { memberId: member.id, amount, date: values.date, paymentMethod: values.paymentMethod, reference: values.reference.trim() || undefined, notes: values.notes.trim() };
      const response = withdraw ? await createSavingsWithdrawal(payload) : await createSavingsRequest(payload);
      toast.success(withdraw ? 'Withdrawal recorded' : 'Deposit recorded', { description: `${member.memberName}'s total savings are now ${peso(response.memberTotal)}.` });
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save.');
      setErrors({ form: error instanceof Error ? error.message : 'Unable to save.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className={`rounded-xl border p-4 ${withdraw ? 'border-amber-200 bg-amber-50/60' : 'border-green-200 bg-green-50/60'}`} aria-label={withdraw ? 'Withdraw savings' : 'Add a savings deposit'}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-gray-900">{withdraw ? 'Withdraw Savings' : 'Add Deposit'}</h3>
        {withdraw && <p className="text-sm text-gray-700">Available: <strong className="tabular-nums">{peso(balance)}</strong></p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={withdraw ? 'Withdrawal Amount' : 'Deposit Amount'} error={errors.amount}>
          <div className="flex gap-2">
            <input inputMode="decimal" value={values.amount} onChange={(event) => set('amount', event.target.value)} className={`${INPUT} bg-white`} placeholder="0.00" autoFocus />
            {withdraw && <button type="button" onClick={() => set('amount', balance.toFixed(2))} className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 text-sm font-medium text-amber-800 hover:bg-amber-100">All</button>}
          </div>
        </Field>
        <Field label="Date" error={errors.date}><input type="date" max={dateOnlyToday()} value={values.date} onChange={(event) => set('date', event.target.value)} className={`${INPUT} bg-white`} /></Field>
        <Field label={withdraw ? 'Paid Out By' : 'Payment Method'}><select value={values.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value)} className={`${INPUT} bg-white`}>{METHODS.map((method) => <option key={method}>{method}</option>)}</select></Field>
        <Field label="Reference"><input value={values.reference} onChange={(event) => set('reference', event.target.value)} className={`${INPUT} bg-white`} placeholder="Optional OR / voucher number" /></Field>
        <div className="sm:col-span-2"><Field label="Notes"><input value={values.notes} onChange={(event) => set('notes', event.target.value)} className={`${INPUT} bg-white`} placeholder="Optional notes" /></Field></div>
      </div>
      {errors.form && <p className="mt-3 text-sm text-red-600">{errors.form}</p>}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 py-2 font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className={`inline-flex min-h-11 items-center justify-center rounded-xl px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${withdraw ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}>{saving ? 'Saving…' : withdraw ? 'Record Withdrawal' : 'Record Deposit'}</button>
      </div>
    </form>
  );
}

function Header({ title, description, action }: { title?: string; description: string; action?: ReactNode }) { return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-green-600"></p>{title && <h2 className="mt-1 text-2xl font-bold text-gray-900">{title}</h2>}<p className="mt-1 text-sm text-gray-600">{description}</p></div>{action}</div>; }
function RecentActivity({ records, filtered, members, search, setSearch, memberFilter, setMemberFilter, typeFilter, setTypeFilter, dateFilter, setDateFilter }: { records: SavingsRecord[]; filtered: SavingsRecord[]; members: Array<{ id: number; memberId: string; memberName: string }>; search: string; setSearch: (value: string) => void; memberFilter: string; setMemberFilter: (value: string) => void; typeFilter: string; setTypeFilter: (value: string) => void; dateFilter: string; setDateFilter: (value: string) => void }) { const [showHistory, setShowHistory] = useState(false); return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold text-gray-900">Recent Savings Activity</h3><button type="button" onClick={() => setShowHistory(current => !current)} className="text-sm font-medium text-green-700 hover:text-green-800">{showHistory ? 'Hide history' : 'View history'}</button></div>{showHistory ? <History records={filtered} members={members} search={search} setSearch={setSearch} memberFilter={memberFilter} setMemberFilter={setMemberFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} /> : records.length ? <div className="space-y-3">{records.slice(0, 5).map((record) => <div key={record.id} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{record.memberName}</p><p className="text-xs text-gray-500">{record.type} · {formatDate(record.date)}</p></div><span className={`shrink-0 text-sm font-semibold ${record.type === 'Withdrawal' ? 'text-amber-700' : 'text-green-700'}`}>{signed(record.type, record.amount)}</span></div>)}</div> : <p className="py-8 text-center text-sm text-gray-500">No savings records yet.</p>}</div>; }
function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <label className="block text-sm font-medium text-gray-700">{label}<div className="mt-2">{children}</div>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</label>; }
function AddSavings({ form, errors, update, submit, onCancel, members }: { form: { member: string; memberId: string; amount: string; date: string; type: TransactionType; reference: string; notes: string }; errors: Record<string, string>; update: (field: string, value: string) => void; submit: (event: FormEvent) => void; onCancel?: () => void; members: Array<{ id: number; memberId: string; memberName: string }> }) { return <form onSubmit={submit} className="space-y-4 p-6"><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Member" error={errors.member}><select value={form.member} onChange={(event) => { const selected = members.find((member) => member.memberName === event.target.value); update('member', event.target.value); update('memberId', selected?.memberId || ''); }} className={INPUT}><option value="">Select member</option>{members.map((member) => <option key={member.memberId}>{member.memberName}</option>)}</select></Field><Field label="Member ID"><input readOnly value={form.memberId} className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2" placeholder="Auto-filled" /></Field><Field label="Savings Amount" error={errors.amount}><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => update('amount', event.target.value)} className={INPUT} placeholder="0.00" /></Field><Field label="Date" error={errors.date}><input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} className={INPUT} /></Field><Field label="Reference"><input value={form.reference} onChange={(event) => update('reference', event.target.value)} className={INPUT} placeholder="Optional reference" /></Field><div className="md:col-span-2"><Field label="Notes"><textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} className={`min-h-24 ${INPUT}`} placeholder="Optional notes" /></Field></div></div><p className="text-xs text-gray-500">To withdraw, open the member in Members with Savings.</p><div className="flex gap-3 border-t border-gray-200 pt-4"><button type="submit" className="flex-1 rounded-xl bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700">Add Savings</button><button type="button" onClick={onCancel} className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300">Cancel</button></div></form>; }
function History({ records, members, search, setSearch, memberFilter, setMemberFilter, typeFilter, setTypeFilter, dateFilter, setDateFilter }: { records: SavingsRecord[]; members: Array<{ id: number; memberId: string; memberName: string }>; search: string; setSearch: (value: string) => void; memberFilter: string; setMemberFilter: (value: string) => void; typeFilter: string; setTypeFilter: (value: string) => void; dateFilter: string; setDateFilter: (value: string) => void }) { const pages = usePagination(records, { resetKey: `${search}|${memberFilter}|${typeFilter}|${dateFilter}` }); return <div className="space-y-6"><Header title="Savings History" description="Review member deposits and withdrawals separately from share capital contributions" /><div className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]"><div className="flex flex-col gap-3 border-b border-gray-200 p-4 xl:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member, ID, or reference" className="input-style pl-9" /></div><div className="flex flex-col gap-2 sm:flex-row"><div className="flex items-center gap-2"><Filter className="h-4 w-4 shrink-0 text-gray-500" /><select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} className="input-style"><option value="all">All Members</option>{members.map((member) => <option key={member.memberId} value={member.memberId}>{member.memberName}</option>)}</select></div><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input-style"><option value="all">All Types</option>{types.map((type) => <option key={type}>{type}</option>)}</select><input type="date" aria-label="Filter by date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="input-style" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[960px]"><thead className="bg-gray-50"><tr>{['Date', 'Member ID', 'Member Name', 'Transaction Type', 'Amount', 'Reference / Notes', 'Status'].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-200">{records.length ? pages.pageItems.map((record) => <tr key={record.id} className="hover:bg-gray-50"><td className="px-4 py-3 text-sm text-gray-600">{formatDate(record.date)}</td><td className="px-4 py-3 text-sm text-gray-600">{record.memberId}</td><td className="px-4 py-3 text-sm font-medium text-gray-900">{record.memberName}</td><td className="px-4 py-3"><TypeBadge type={record.type} /></td><td className={`px-4 py-3 text-sm font-semibold ${record.type === 'Withdrawal' ? 'text-amber-700' : 'text-gray-900'}`}>{signed(record.type, record.amount)}</td><td className="px-4 py-3 text-sm text-gray-600">{record.reference}{record.notes && <span className="block text-xs text-gray-400">{record.notes}</span>}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${record.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{record.status}</span></td></tr>) : <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">No savings records match your filters.</td></tr>}</tbody></table></div><Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="entries" /></div></div>; }
