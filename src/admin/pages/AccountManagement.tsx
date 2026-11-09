import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { History, KeyRound, Mail, Pencil, Phone, Plus, RefreshCw, Search, ShieldCheck, Store, UserCog, UserRound, X } from 'lucide-react';
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
import type { LayoutOutletContext } from '../../app/components/Layout';
import { Pagination } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { AdminAccountForm } from '../components/AdminAccountForm';
import { VendorAccountEditor, VendorAccountForm } from '../components/VendorAccountForms';
import { Modal } from '../components/machinery/shared';

/** onViewActivity: opens the audit log on one administrator's actions (given where the audit log is at hand). */
export function AccountManagement({ onViewActivity: viewActivityProp }: { onViewActivity?: (account: Account) => void } = {}) {
  // As its own page, the layout's audit log opens on the administrator.
  const layout = useOutletContext<LayoutOutletContext | undefined>();
  const onViewActivity = viewActivityProp ?? (layout?.viewAdminActivity ? (account: Account) => layout.viewAdminActivity(account.user_id) : undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  // Kadiwa store vendors: the form to make one, and the vendor whose name or password is being changed.
  const [showCreateVendor, setShowCreateVendor] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Account | null>(null);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  // Finding an account: words typed (name, username, email, mobile number, member number,
  // position or branch) and the kind of account.
  const [accountSearch, setAccountSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | Account['role']>('ALL');
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

  const searchWords = accountSearch.toLowerCase().split(/\s+/).filter(Boolean);
  const shownAccounts = accounts.filter((account) => {
    if (roleFilter !== 'ALL' && account.role !== roleFilter) return false;
    if (!searchWords.length) return true;
    const text = [account.full_name, account.first_name, account.last_name, account.username, account.email, account.phone, account.member_number, account.position, account.kadiwa_branch_name]
      .filter(Boolean).join(' ').toLowerCase();
    return searchWords.every((word) => text.includes(word));
  });
  const roleCount = (role: Account['role']) => accounts.filter((account) => account.role === role).length;
  const accountPages = usePagination(shownAccounts, { resetKey: `${accountSearch}|${roleFilter}` });
  const closeCreateMember = () => { if (isCreating) return; setShowCreate(false); setForm({ memberId: '', password: '', confirmPassword: '' }); setMemberSearch(''); };

  // Shared by the table and the phone cards.
  const accountName = (account: Account) => account.role === 'ADMIN' ? (
    <div className="flex items-start gap-2"><UserCog className="mt-0.5 h-4 w-4 shrink-0 text-green-700" /><div>
      <span className="font-medium text-gray-900">{account.full_name || account.username}</span>
      {account.position ? <span className="ml-2 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800 ring-1 ring-green-200">{account.position}</span>
        : <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">No position yet</span>}
      <span className="block text-xs text-gray-500">{account.created_by_name ? `Made by ${account.created_by_name}` : 'First administrator'}{account.last_activity_at ? ` · Last activity ${formatDateTime(account.last_activity_at)}` : ''}</span>
    </div></div>
  ) : account.role === 'VENDOR' ? (
    <div className="flex flex-wrap items-center gap-2"><Store className="h-4 w-4 shrink-0 text-amber-700" /><span className="font-medium text-gray-900">{account.full_name || account.username}</span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">Kadiwa vendor</span>{account.kadiwa_branch_name && <span className="text-xs text-gray-500">{account.kadiwa_branch_name}</span>}</div>
  ) : <div className="flex flex-wrap items-center gap-x-2"><UserRound className="h-4 w-4 shrink-0 text-gray-400" /><span className="font-medium text-gray-900">{account.first_name || ''} {account.last_name || ''}</span><span className="text-gray-500">{account.member_number}</span></div>;
  // What the account signs in with: members their email or mobile number; administrators keep their username.
  const signsInWith = (account: Account) => (
    <>
      <span className="block [overflow-wrap:anywhere]">{account.email || <span className="text-gray-400">No email</span>}</span>
      <span className="block text-xs text-gray-500">{account.phone || 'No mobile number'}{account.role !== 'MEMBER' ? ` · Username: ${account.username}` : ''}</span>
    </>
  );
  const accountRole = (account: Account) => <span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-blue-600" />{account.role}</span>;
  const accountStatus = (account: Account) => (
    <><span className={`rounded-full px-2 py-1 text-xs font-medium ${account.account_status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{account.account_status}</span>{account.must_change_password && <span className="ml-2 text-xs text-orange-600">Password change required</span>}</>
  );
  const accountActions = (account: Account) => (
    <div className="flex flex-wrap gap-2">{account.role === 'VENDOR'
      ? <button onClick={() => setEditingVendor(account)} title="Change the vendor's name or password" className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" />Name / password</button>
      : <button onClick={() => void resetPassword(account)} title="Reset password" className="rounded border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"><KeyRound className="h-4 w-4" /></button>}{account.role === 'ADMIN' && onViewActivity && <button onClick={() => onViewActivity(account)} title="Everything this administrator did, from the audit log" className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"><History className="h-3.5 w-3.5" />Activity</button>}{<button onClick={() => void updateStatus(account)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">{account.account_status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>}</div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button onClick={() => { setShowCreateVendor(true); setShowCreateAdmin(false); setShowCreate(false); }} className="inline-flex items-center gap-2 rounded-xl border border-amber-500 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50">
            <Store className="h-4 w-4" /> Create Vendor Account
          </button>
          <button onClick={() => { setShowCreateAdmin(true); setShowCreate(false); setShowCreateVendor(false); }} className="inline-flex items-center gap-2 rounded-xl border border-green-600 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50">
            <UserCog className="h-4 w-4" /> Create Admin Account
          </button>
          <button onClick={() => { setShowCreate(true); setShowCreateAdmin(false); setShowCreateVendor(false); }} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
            <Plus className="h-4 w-4" /> Create Member Account
          </button>
        </div>
      </div>

      {showCreateVendor && <VendorAccountForm onCreated={() => { setShowCreateVendor(false); void loadData(); }} onCancel={() => setShowCreateVendor(false)} />}
      {editingVendor && <VendorAccountEditor account={editingVendor} onClose={() => setEditingVendor(null)} onSaved={() => { setEditingVendor(null); void loadData(); }} />}

      {showCreateAdmin && <AdminAccountForm onCreated={() => { setShowCreateAdmin(false); void loadData(); }} onCancel={() => setShowCreateAdmin(false)} />}

      {showCreate && (
        <Modal title="Create Member Account" description="For a member already on the members list. They sign in with the email or mobile number in their member information." onClose={closeCreateMember}>
        <form onSubmit={createAccount}>
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
            <button type="button" disabled={isCreating} onClick={closeCreateMember} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
          </div>
        </form>
        </Modal>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
          <label className="relative block w-full md:max-w-md">
            <span className="sr-only">Search accounts</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Search name, username, email, mobile or member no." className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-9 text-sm focus:border-transparent focus:ring-2 focus:ring-green-500" />
            {accountSearch && <button type="button" onClick={() => setAccountSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>}
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of account">
            {([['ALL', 'All', accounts.length], ['ADMIN', 'Admins', roleCount('ADMIN')], ['MEMBER', 'Members', roleCount('MEMBER')], ['VENDOR', 'Vendors', roleCount('VENDOR')]] as const).map(([role, label, count]) => (
              <button key={role} type="button" onClick={() => setRoleFilter(role)} aria-pressed={roleFilter === role}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${roleFilter === role ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {label}<span className={`text-xs ${roleFilter === role ? 'text-green-100' : 'text-gray-400'}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Phones and tablets: one card per account, so nothing scrolls sideways. */}
        <ul className="divide-y divide-gray-100 lg:hidden">
          {isLoading ? <li className="px-4 py-8 text-center text-sm text-gray-500">Loading accounts...</li> : accountPages.pageItems.map((account) => (
            <li key={account.user_id} className="space-y-2 px-4 py-3 text-sm">
              {accountName(account)}
              <div className="text-gray-700">{signsInWith(account)}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {accountRole(account)}
                <span>{accountStatus(account)}</span>
                <span className="text-gray-500">Created {formatDateTime(account.account_created_at)}</span>
              </div>
              {accountActions(account)}
            </li>
          ))}
          {!isLoading && shownAccounts.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-500">{accounts.length ? 'No account matches the search.' : 'No login accounts found.'}</li>}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['Name', 'Email / Mobile number', 'Role', 'Status', 'Created', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 text-left font-semibold text-gray-600">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading accounts...</td></tr> : accountPages.pageItems.map((account) => (
              <tr key={account.user_id}>
                <td className="px-4 py-3">{accountName(account)}</td>
                <td className="px-4 py-3 text-gray-700">{signsInWith(account)}</td>
                <td className="px-4 py-3">{accountRole(account)}</td>
                <td className="px-4 py-3">{accountStatus(account)}</td>
                <td className="px-4 py-3 text-gray-600">{formatDateTime(account.account_created_at)}</td>
                <td className="px-4 py-3">{accountActions(account)}</td>
              </tr>
            ))}
            {!isLoading && shownAccounts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{accounts.length ? 'No account matches the search.' : 'No login accounts found.'}</td></tr>}
          </tbody>
        </table>
        </div>
        <Pagination page={accountPages.page} totalPages={accountPages.totalPages} total={accountPages.total} pageSize={accountPages.pageSize} onPageChange={accountPages.setPage} onPageSizeChange={accountPages.setPageSize} label="accounts" />
      </div>
    </div>
  );
}
