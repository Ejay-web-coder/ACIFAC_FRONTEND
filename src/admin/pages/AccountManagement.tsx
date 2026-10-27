import { useEffect, useState } from 'react';
import { History, KeyRound, Mail, Phone, Plus, RefreshCw, Search, ShieldCheck, UserCog, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveRefresh } from '../../lib/liveUpdates';
import {
  Account,
  AvailableMember,
  createMemberAccountRequest,
  fetchAdminAccounts,
  fetchAvailableMembers,
  resetMemberPasswordRequest,
  updateAccountStatusRequest,
} from '../../app/services/authApi';
import { formatDateTime } from '../../utils/dateTime';
import { Pagination } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { AdminAccountForm } from '../components/AdminAccountForm';

/** onViewActivity: opens the audit log on one administrator's actions (given where the audit log is at hand). */
export function AccountManagement({ onViewActivity }: { onViewActivity?: (account: Account) => void } = {}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [form, setForm] = useState({ memberId: '', password: '', confirmPassword: '' });

  const filteredMembers = availableMembers.filter((member) => {
    const search = memberSearch.trim().toLowerCase();
    if (!search) return true;
    return [member.member_number, member.first_name, member.last_name, member.email, member.phone]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
  // The member signs in with the email and mobile number in their member information.
  const selectedMember = availableMembers.find((member) => String(member.id) === form.memberId);
  const nothingToSignInWith = Boolean(selectedMember && !selectedMember.email && !selectedMember.phone);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [accountResponse, memberResponse] = await Promise.all([fetchAdminAccounts(), fetchAvailableMembers()]);
      setAccounts(accountResponse.accounts);
      setAvailableMembers(memberResponse.members);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load account management data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);
  useLiveRefresh(['users', 'members'], () => { void loadData(); }, 800);

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isCreating) return;
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setIsCreating(true);
    try {
      const response = await createMemberAccountRequest({ memberId: Number(form.memberId), password: form.password, confirmPassword: form.confirmPassword });
      toast.success('Member account created. The member signs in with their email or mobile number and must change the temporary password on first login.');
      for (const warning of response.warnings ?? []) toast.warning(warning);
      setForm({ memberId: '', password: '', confirmPassword: '' });
      setMemberSearch('');
      setShowCreate(false);
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setIsCreating(false);
    }
  };

  const updateStatus = async (account: Account) => {
    const status = account.account_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateAccountStatusRequest(account.user_id, status);
      toast.success(`Account ${status.toLowerCase()}.`);
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update account status.');
    }
  };

  const resetPassword = async (account: Account) => {
    try {
      const response = await resetMemberPasswordRequest(account.user_id);
      toast.success(response.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reset password.');
    }
  };

  const accountPages = usePagination(accounts);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Management</h1>
          <p className="mt-1 text-sm text-gray-600">Administrator and member login accounts. Administrators share one role; each acts under their own name and position, recorded in the audit log.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={() => { setShowCreateAdmin(true); setShowCreate(false); }} className="inline-flex items-center gap-2 rounded-xl border border-green-600 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50">
            <UserCog className="h-4 w-4" /> Create Admin Account
          </button>
          <button onClick={() => { setShowCreate(true); setShowCreateAdmin(false); }} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
            <Plus className="h-4 w-4" /> Create Member Account
          </button>
        </div>
      </div>

      {showCreateAdmin && <AdminAccountForm onCreated={() => { setShowCreateAdmin(false); void loadData(); }} onCancel={() => setShowCreateAdmin(false)} />}

      {showCreate && (
        <form onSubmit={createAccount} className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Member Account</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">Select member
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search member..." className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3" />
              </div>
              <select required value={form.memberId} onChange={(event) => setForm({ ...form, memberId: event.target.value })} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2">
                <option value="">Choose an existing member</option>
                {filteredMembers.map((member) => <option key={member.id} value={member.id}>{member.member_number || member.id} - {member.first_name} {member.last_name}</option>)}
              </select>
              <span className="mt-1 block text-xs text-gray-500">Showing {filteredMembers.length} of {availableMembers.length} members</span>
            </label>
            <div className="text-sm font-medium text-gray-700">Signs in with
              <div className={`mt-1 space-y-1.5 rounded-xl border bg-white px-3 py-2.5 font-normal ${nothingToSignInWith ? 'border-red-300' : 'border-gray-200'}`}>
                {selectedMember ? (
                  <>
                    <p className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-gray-400" /><span className={`truncate ${selectedMember.email ? 'text-gray-900' : 'text-gray-400'}`}>{selectedMember.email || 'No email'}</span></p>
                    <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-gray-400" /><span className={selectedMember.phone ? 'text-gray-900' : 'text-gray-400'}>{selectedMember.phone || 'No mobile number'}</span></p>
                  </>
                ) : <p className="text-gray-500">Choose a member to see their email and mobile number.</p>}
              </div>
              <span className={`mt-1 block text-xs font-normal ${nothingToSignInWith ? 'text-red-600' : 'text-gray-500'}`}>
                {nothingToSignInWith ? 'Add an email or mobile number in this member\'s information first.' : 'From the member\'s information. The member signs in with either one.'}
              </span>
            </div>
            <label className="text-sm font-medium text-gray-700">Temporary password
              <input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" />
              <span className="mt-1 block text-xs font-normal text-gray-500">Use 8+ characters with uppercase, lowercase, number, and symbol.</span>
            </label>
            <label className="text-sm font-medium text-gray-700">Confirm password
              <input required minLength={8} type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={isCreating || nothingToSignInWith} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">{isCreating ? 'Creating...' : 'Create account'}</button>
            <button type="button" disabled={isCreating} onClick={() => setShowCreate(false)} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['Name', 'Email / Mobile number', 'Role', 'Status', 'Created', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-left font-semibold text-gray-600">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading accounts...</td></tr> : accountPages.pageItems.map((account) => (
              <tr key={account.user_id}>
                <td className="px-4 py-3">{account.role === 'ADMIN' ? (
                  <div className="flex items-start gap-2"><UserCog className="mt-0.5 h-4 w-4 shrink-0 text-green-700" /><div>
                    <span className="font-medium text-gray-900">{account.full_name || account.username}</span>
                    {account.position ? <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800 ring-1 ring-green-200">{account.position}</span>
                      : <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">No position yet</span>}
                    <span className="block text-xs text-gray-500">{account.created_by_name ? `Made by ${account.created_by_name}` : 'First administrator'}{account.last_activity_at ? ` · Last activity ${formatDateTime(account.last_activity_at)}` : ''}</span>
                  </div></div>
                ) : <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-gray-400" /><span className="font-medium text-gray-900">{account.first_name || ''} {account.last_name || ''}</span><span className="text-gray-500">{account.member_number}</span></div>}</td>
                {/* What the account signs in with: members their email or mobile number; administrators keep their username. */}
                <td className="px-4 py-3 text-gray-700">
                  <span className="block">{account.email || <span className="text-gray-400">No email</span>}</span>
                  <span className="block text-xs text-gray-500">{account.phone || 'No mobile number'}{account.role === 'ADMIN' ? ` · Username: ${account.username}` : ''}</span>
                </td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-blue-600" />{account.role}</span></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${account.account_status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{account.account_status}</span>{account.must_change_password && <span className="ml-2 text-xs text-orange-600">Password change required</span>}</td>
                <td className="px-4 py-3 text-gray-600">{formatDateTime(account.account_created_at)}</td>
                <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => void resetPassword(account)} title="Reset password" className="rounded border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"><KeyRound className="h-4 w-4" /></button>{account.role === 'ADMIN' && onViewActivity && <button onClick={() => onViewActivity(account)} title="Everything this administrator did, from the audit log" className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"><History className="h-3.5 w-3.5" />Activity</button>}{<button onClick={() => void updateStatus(account)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">{account.account_status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>}</div></td>
              </tr>
            ))}
            {!isLoading && accounts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No login accounts found.</td></tr>}
          </tbody>
        </table>
        </div>
        <Pagination page={accountPages.page} totalPages={accountPages.totalPages} total={accountPages.total} pageSize={accountPages.pageSize} onPageChange={accountPages.setPage} onPageSizeChange={accountPages.setPageSize} label="accounts" />
      </div>
    </div>
  );
}
