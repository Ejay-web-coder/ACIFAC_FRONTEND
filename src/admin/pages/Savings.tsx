import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Eye, Filter, Plus, Search, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { fetchMembers, fetchSavingsRecords } from '../services/membersApi';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';

type SavingsView = 'total' | 'add' | 'history';
type TransactionType = 'Deposit' | 'Savings Contribution';
interface SavingsRecord { id: string; date: string; memberId: string; memberName: string; type: TransactionType; amount: number; reference: string; notes: string; status: 'Completed' | 'Pending'; }
const types: TransactionType[] = ['Deposit'];
const peso = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export function Savings({ userRole, view }: { userRole: UserRole; view: SavingsView }) {
  const [records, setRecords] = useState<SavingsRecord[]>([]);
  const [members, setMembers] = useState<Array<{ id: number; memberId: string; memberName: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [form, setForm] = useState({ member: '', memberId: '', amount: '', date: dateOnlyToday(), type: 'Deposit' as TransactionType, reference: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const loadSavings = async () => {
      try {
        const [savingsResponse, membersResponse] = await Promise.all([
          fetchSavingsRecords(),
          fetchMembers('', 300),
        ]);

        const savingsList = savingsResponse.data
          .filter((item) => item.type === 'Deposit')
          .map((item) => ({
            id: String(item.id),
            date: item.date,
            memberId: String(item.memberNumber || item.memberId),
            memberName: item.memberName,
            type: item.type,
            amount: item.amount,
            reference: item.reference,
            notes: item.notes,
            status: item.status,
          }));

        setRecords(savingsList);
        setMembers(
          membersResponse.data.map((member) => ({
            id: member.id,
            memberId: member.memberId,
            memberName: member.name,
          }))
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to load savings records.');
      } finally {
        setIsLoading(false);
      }
    };

    loadSavings();
  }, []);

  const total = records.reduce((sum, record) => sum + record.amount, 0);
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

    try {
      const newRecord: SavingsRecord = {
        id: `SAV-${Date.now()}`,
        date: form.date,
        memberId: selected.memberId,
        memberName: selected.memberName,
        type: 'Deposit',
        amount: Number(form.amount),
        reference: form.reference || `SAV-${form.date.replaceAll('-', '')}`,
        notes: form.notes,
        status: 'Completed',
      };

      setRecords((current) => [newRecord, ...current]);
      toast.success('Savings recorded successfully');
      setForm({ member: '', memberId: '', amount: '', date: dateOnlyToday(), type: 'Deposit', reference: '', notes: '' });
      setErrors({});
      setShowAddModal(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save savings.');
    }
  };

  if (view === 'add') return <AddSavings form={form} errors={errors} update={update} submit={submit} members={members} />;
  if (view === 'history') return <History records={filtered} members={members} search={search} setSearch={setSearch} memberFilter={memberFilter} setMemberFilter={setMemberFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} />;
  return <>
    <Overview records={records} members={members} total={total} filtered={filtered} search={search} setSearch={setSearch} memberFilter={memberFilter} setMemberFilter={setMemberFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} onAddSavings={() => setShowAddModal(true)} />
    {showAddModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="add-savings-title">
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

function Header({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-green-600"></p><h2 className="mt-1 text-2xl font-bold text-gray-900">{title}</h2><p className="mt-1 text-sm text-gray-600">{description}</p></div>{action}</div>; }
function Summary({ title, value, icon: Icon, color }: { title: string; value: string; icon: typeof Wallet; color: string }) { return <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${color}`}><Icon className="h-5 w-5" /></div><p className="text-sm text-gray-600">{title}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>; }
function Overview({ records, members, total, filtered, search, setSearch, memberFilter, setMemberFilter, typeFilter, setTypeFilter, dateFilter, setDateFilter, onAddSavings }: { records: SavingsRecord[]; members: Array<{ id: number; memberId: string; memberName: string }>; total: number; filtered: SavingsRecord[]; search: string; setSearch: (value: string) => void; memberFilter: string; setMemberFilter: (value: string) => void; typeFilter: string; setTypeFilter: (value: string) => void; dateFilter: string; setDateFilter: (value: string) => void; onAddSavings: () => void }) { const [showHistory, setShowHistory] = useState(false); const today = records.filter((record) => record.date === dateOnlyToday()).reduce((sum, record) => sum + record.amount, 0); const month = records.filter((record) => record.date.startsWith(dateOnlyToday().slice(0, 7))).reduce((sum, record) => sum + record.amount, 0); const membersWithSavings = new Set(records.map((record) => record.memberId)).size; return <div className="space-y-6"><Header title="Savings Deposits" description="Member savings deposits only. Share capital is tracked separately in member records." action={<button type="button" onClick={onAddSavings} className="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"><Plus className="h-4 w-4" />Add Savings</button>} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><Summary title="Total Savings" value={peso(total)} icon={Wallet} color="bg-green-50 text-green-700" /><Summary title="Members with Savings" value={String(membersWithSavings)} icon={Wallet} color="bg-blue-50 text-blue-700" /><Summary title="Today's Savings" value={peso(today)} icon={Plus} color="bg-orange-50 text-orange-700" /><Summary title="This Month" value={peso(month)} icon={Wallet} color="bg-purple-50 text-purple-700" /></div><div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold text-gray-900">Recent Savings Activity</h3><button type="button" onClick={() => setShowHistory(current => !current)} className="text-sm font-medium text-green-700 hover:text-green-800">{showHistory ? 'Hide history' : 'View history'}</button></div>{showHistory ? <History records={filtered} members={members} search={search} setSearch={setSearch} memberFilter={memberFilter} setMemberFilter={setMemberFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} /> : records.length ? <div className="space-y-3">{records.slice(0, 5).map((record) => <div key={record.id} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{record.memberName}</p><p className="text-xs text-gray-500">{record.type} · {formatDate(record.date)}</p></div><span className="shrink-0 text-sm font-semibold text-green-700">+{peso(record.amount)}</span></div>)}</div> : <p className="py-8 text-center text-sm text-gray-500">No savings records yet.</p>}</div></div>; }
function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <label className="block text-sm font-medium text-gray-700">{label}<div className="mt-2">{children}</div>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</label>; }
function AddSavings({ form, errors, update, submit, onCancel, members }: { form: { member: string; memberId: string; amount: string; date: string; type: TransactionType; reference: string; notes: string }; errors: Record<string, string>; update: (field: string, value: string) => void; submit: (event: FormEvent) => void; onCancel?: () => void; members: Array<{ id: number; memberId: string; memberName: string }> }) { return <form onSubmit={submit} className="space-y-4 p-6"><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Member" error={errors.member}><select value={form.member} onChange={(event) => { const selected = members.find((member) => member.memberName === event.target.value); update('member', event.target.value); update('memberId', selected?.memberId || ''); }} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600"><option value="">Select member</option>{members.map((member) => <option key={member.memberId}>{member.memberName}</option>)}</select></Field><Field label="Member ID"><input readOnly value={form.memberId} className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2" placeholder="Auto-filled" /></Field><Field label="Savings Amount" error={errors.amount}><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => update('amount', event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600" placeholder="0.00" /></Field><Field label="Date" error={errors.date}><input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600" /></Field><Field label="Transaction Type"><select value={form.type} onChange={(event) => update('type', event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600">{types.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Reference"><input value={form.reference} onChange={(event) => update('reference', event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600" placeholder="Optional reference" /></Field><div className="md:col-span-2"><Field label="Notes"><textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600" placeholder="Optional notes" /></Field></div></div><div className="flex gap-3 border-t border-gray-200 pt-4"><button type="submit" className="flex-1 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700">Add Savings</button><button type="button" onClick={onCancel} className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300">Cancel</button></div></form>; }
function History({ records, members, search, setSearch, memberFilter, setMemberFilter, typeFilter, setTypeFilter, dateFilter, setDateFilter }: { records: SavingsRecord[]; members: Array<{ id: number; memberId: string; memberName: string }>; search: string; setSearch: (value: string) => void; memberFilter: string; setMemberFilter: (value: string) => void; typeFilter: string; setTypeFilter: (value: string) => void; dateFilter: string; setDateFilter: (value: string) => void }) { return <div className="space-y-6"><Header title="Savings History" description="Review member deposit transactions separately from share capital contributions" /><div className="rounded-lg border border-gray-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-gray-200 p-4 xl:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search member, ID, or reference" className="input-style pl-9" /></div><div className="flex flex-col gap-2 sm:flex-row"><div className="flex items-center gap-2"><Filter className="h-4 w-4 shrink-0 text-gray-500" /><select value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} className="input-style"><option value="all">All Members</option>{members.map((member) => <option key={member.memberId} value={member.memberId}>{member.memberName}</option>)}</select></div><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="input-style"><option value="all">All Types</option>{types.map((type) => <option key={type}>{type}</option>)}</select><input type="date" aria-label="Filter by date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="input-style" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px]"><thead className="bg-gray-50"><tr>{['Date', 'Member ID', 'Member Name', 'Transaction Type', 'Amount', 'Reference / Notes', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{heading}</th>)}</tr></thead><tbody className="divide-y divide-gray-200">{records.length ? records.map((record) => <tr key={record.id} className="hover:bg-gray-50"><td className="px-4 py-3 text-sm text-gray-600">{formatDate(record.date)}</td><td className="px-4 py-3 text-sm text-gray-600">{record.memberId}</td><td className="px-4 py-3 text-sm font-medium text-gray-900">{record.memberName}</td><td className="px-4 py-3 text-sm text-gray-600">{record.type}</td><td className="px-4 py-3 text-sm font-semibold text-gray-900">{peso(record.amount)}</td><td className="px-4 py-3 text-sm text-gray-600">{record.reference}{record.notes && <span className="block text-xs text-gray-400">{record.notes}</span>}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${record.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{record.status}</span></td><td className="px-4 py-3"><button type="button" onClick={() => toast.info(`Savings ${record.reference}`, { description: `${record.memberName} · ${peso(record.amount)}` })} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"><Eye className="h-4 w-4" />View</button></td></tr>) : <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">No savings records match your filters.</td></tr>}</tbody></table></div></div></div>; }
