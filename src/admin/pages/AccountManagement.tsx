import { useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
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

export function AccountManagement() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [form, setForm] = useState({ memberId: '', username: '', password: '', confirmPassword: '' });

  const filteredMembers = availableMembers.filter((member) => {
    const search = memberSearch.trim().toLowerCase();
    if (!search) return true;
    return [member.member_number, member.first_name, member.last_name, member.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });

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
      await createMemberAccountRequest({ memberId: Number(form.memberId), username: form.username, password: form.password, confirmPassword: form.confirmPassword });
      toast.success('Member account created. The member must change the temporary password on first login.');
      setForm({ memberId: '', username: '', password: '', confirmPassword: '' });
      setMemberSearch('');
      setShowCreate(false);
      await loadData();
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
      await loadData();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Management</h1>
          <p className="mt-1 text-sm text-gray-600">Manage member login accounts and credentials.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Create Member Account
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={createAccount} className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Member Account</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">Select member
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search member..." className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3" />
              </div>
              <select required value={form.memberId} onChange={(event) => setForm({ ...form, memberId: event.target.value })} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                <option value="">Choose an existing member</option>
                {filteredMembers.map((member) => <option key={member.id} value={member.id}>{member.member_number || member.id} - {member.first_name} {member.last_name}</option>)}
              </select>
              <span className="mt-1 block text-xs text-gray-500">Showing {filteredMembers.length} of {availableMembers.length} members</span>
            </label>
            <label className="text-sm font-medium text-gray-700">Username
              <input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-gray-700">Temporary password
              <input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
              <span className="mt-1 block text-xs font-normal text-gray-500">Use 8+ characters with uppercase, lowercase, number, and symbol.</span>
            </label>
            <label className="text-sm font-medium text-gray-700">Confirm password
              <input required minLength={8} type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={isCreating} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{isCreating ? 'Creating...' : 'Create account'}</button>
            <button type="button" disabled={isCreating} onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['Member', 'Username', 'Role', 'Status', 'Created', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-left font-semibold text-gray-600">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading accounts...</td></tr> : accounts.map((account) => (
              <tr key={account.user_id}>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-gray-400" /><span className="font-medium text-gray-900">{account.first_name || ''} {account.last_name || ''}</span><span className="text-gray-500">{account.member_number || 'Admin'}</span></div></td>
                <td className="px-4 py-3 text-gray-700">{account.username}</td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-blue-600" />{account.role}</span></td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${account.account_status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{account.account_status}</span>{account.must_change_password && <span className="ml-2 text-xs text-orange-600">Password change required</span>}</td>
                <td className="px-4 py-3 text-gray-600">{formatDateTime(account.account_created_at)}</td>
                <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => void resetPassword(account)} title="Reset password" className="rounded border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"><KeyRound className="h-4 w-4" /></button>{account.role === 'MEMBER' && <button onClick={() => void updateStatus(account)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">{account.account_status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>}</div></td>
              </tr>
            ))}
            {!isLoading && accounts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No login accounts found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
