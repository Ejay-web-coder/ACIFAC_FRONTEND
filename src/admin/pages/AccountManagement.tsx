import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Copy, KeyRound, Mail, Pencil, Phone, Plus, RefreshCw, Search, Store, UserCog, UserRound, X,
} from 'lucide-react';
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
import { dateOnlyToday, formatDate, formatDateTime, formatTime } from '../../utils/dateTime';
import { useIsMobile } from '../../app/components/ui/use-mobile';
import { useFillScreen } from '../../app/components/pageHeading';
import { copyText } from '../../utils/clipboard';
import { AdminAccountForm } from '../components/AdminAccountForm';
import { VendorAccountEditor, VendorAccountForm } from '../components/VendorAccountForms';
import { Modal } from '../components/machinery/shared';

type RoleFilter = 'ALL' | Account['role'];
type CreateKind = 'MEMBER' | 'ADMIN' | 'VENDOR';

// The list shows each kind of account in its own group, in this order.
const GROUPS: { role: Account['role']; label: string; one: string; many: string }[] = [
  { role: 'ADMIN', label: 'Admins', one: 'admin', many: 'admins' },
  { role: 'VENDOR', label: 'Kadiwa vendors', one: 'vendor', many: 'vendors' },
  { role: 'MEMBER', label: 'Members', one: 'member', many: 'members' },
];
// How many accounts a group shows before "Show more": few when every kind is listed, more when one kind is picked.
const FIRST_SHOWN_ALL = 5;
const FIRST_SHOWN_ONE_KIND = 25;
const SHOW_MORE_STEP = 25;

const CREATE_OPTIONS: { kind: CreateKind; title: string; text: string; icon: typeof UserRound; tone: string }[] = [
  { kind: 'MEMBER', title: 'Member account', text: 'For a cooperative member with a member no.', icon: UserRound, tone: 'bg-green-50 text-green-700' },
  { kind: 'ADMIN', title: 'Admin account', text: 'For office staff who manage the records', icon: UserCog, tone: 'bg-green-50 text-green-700' },
  { kind: 'VENDOR', title: 'Kadiwa vendor account', text: 'For someone who sells at a Kadiwa store', icon: Store, tone: 'bg-amber-50 text-amber-700' },
];

function useIsDesktop() {
  const query = '(min-width: 1024px)';
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    onChange();
    return () => list.removeEventListener('change', onChange);
  }, []);
  return matches;
}

const nameOf = (account: Account) =>
  (account.role === 'MEMBER' ? `${account.first_name || ''} ${account.last_name || ''}`.trim() : account.full_name) || account.username;
const firstNameOf = (account: Account) => (account.role === 'MEMBER' ? account.first_name : nameOf(account).split(/\s+/)[0]) || account.username;
const initialsOf = (account: Account) => {
  const words = nameOf(account).split(/\s+/).filter((word) => /^[A-Za-z]/.test(word));
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked.map((word) => word[0]).join('').toUpperCase() || account.username.slice(0, 2).toUpperCase();
};
const lastSeenOf = (account: Account) => account.last_activity_at || account.last_login;
const hasContact = (account: Account) => Boolean(account.email || account.phone);

/** "today, 4:34 PM", "yesterday, 7:08 PM", or the date for anything older. */
function whenText(value: string | null | undefined) {
  const time = value ? timestampOf(value) : Number.NaN;
  if (!value || Number.isNaN(time)) return '';
  const day = dateOnlyToday(new Date(time));
  const today = dateOnlyToday();
  const yesterday = dateOnlyToday(new Date(Date.now() - 86_400_000));
  if (day === today) return `today ${formatTime(value)}`;
  if (day === yesterday) return `yesterday ${formatTime(value)}`;
  return formatDate(value, true);
}
function timestampOf(value: string) {
  // Same reading as the date helpers: a bare "YYYY-MM-DD HH:MM" is Manila time.
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? new Date(value.replace(' ', 'T') + '+08:00').getTime() : new Date(value).getTime();
}
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const statusLabel = (account: Account) => account.account_status === 'ACTIVE' ? 'Active' : account.account_status === 'LOCKED' ? 'Locked' : 'Disabled';
const statusDot = (account: Account) => account.account_status === 'ACTIVE' ? 'bg-green-600' : account.account_status === 'LOCKED' ? 'bg-red-500' : 'bg-gray-400';

function Avatar({ account, size = 'md' }: { account: Account; size?: 'md' | 'lg' }) {
  const tone = account.role === 'VENDOR' ? 'bg-amber-100 text-amber-800' : account.role === 'ADMIN' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700';
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-bold ${tone} ${size === 'lg' ? 'h-16 w-16 text-xl sm:h-[4.5rem] sm:w-[4.5rem]' : 'h-10 w-10 text-sm'}`}>
      {initialsOf(account)}
      {size === 'md' && <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white lg:hidden ${statusDot(account)}`} aria-hidden="true" />}
    </span>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone: 'green' | 'amber' | 'gray' | 'red' }) {
  const tones = { green: 'bg-green-50 text-green-800 ring-green-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200', gray: 'bg-gray-100 text-gray-700 ring-gray-200', red: 'bg-red-50 text-red-700 ring-red-200' };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}

function StatusChip({ account }: { account: Account }) {
  const tone = account.account_status === 'ACTIVE' ? 'green' : account.account_status === 'LOCKED' ? 'red' : 'gray';
  return <Chip tone={tone}><span className={`h-1.5 w-1.5 rounded-full ${statusDot(account)}`} />{statusLabel(account)}</Chip>;
}

/** Label and value: side by side on phones, stacked in the wide detail cards. */
function Field({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 sm:block sm:py-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="flex min-w-0 items-center justify-end gap-2 text-right text-sm font-semibold text-gray-900 sm:mt-0.5 sm:justify-between sm:text-left">
        <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>{action}
      </dd>
    </div>
  );
}

function CopyButton({ value, what }: { value: string; what: string }) {
  const copy = async () => {
    if (await copyText(value)) toast.success(`${what} copied`);
    else toast.error(`Could not copy the ${what.toLowerCase()}.`);
  };
  return <button type="button" onClick={() => void copy()} title={`Copy ${what.toLowerCase()}`} aria-label={`Copy ${what.toLowerCase()}`} className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700"><Copy className="h-3.5 w-3.5" /></button>;
}

function CreateMenu({ onPick, className = '' }: { onPick: (kind: CreateKind) => void; className?: string }) {
  return (
    <div role="menu" className={`w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl ${className}`}>
      {CREATE_OPTIONS.map(({ kind, title, text, icon: Icon, tone }) => (
        <button key={kind} type="button" role="menuitem" onClick={() => onPick(kind)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-green-50 focus:bg-green-50 focus:outline-none">
          <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0"><span className="block text-sm font-semibold text-gray-900">{title}</span><span className="block text-xs text-gray-500">{text}</span></span>
        </button>
      ))}
    </div>
  );
}

export function AccountManagement() {
  useFillScreen();
  const isDesktop = useIsDesktop();
  const isPhone = useIsMobile();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  // Kadiwa store vendors: the form to make one, and the vendor whose name or password is being changed.
  const [showCreateVendor, setShowCreateVendor] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Account | null>(null);
  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Resetting a password or disabling an account is confirmed in a window first.
  const [confirming, setConfirming] = useState<{ kind: 'reset' | 'disable'; account: Account } | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  // Finding an account: words typed (name, username, email, mobile number, member number,
  // position or branch) and the kind of account.
  const [accountSearch, setAccountSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [moreShown, setMoreShown] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<'top' | 'fab' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ memberId: '' });
  // The temporary password the server made for the member just given an account, shown once to copy.
  const [createdPassword, setCreatedPassword] = useState<{ title?: string; name: string; signIn: string; password: string } | null>(null);

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
  useEffect(() => { setMoreShown({}); }, [accountSearch, roleFilter]);

  // The create menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      const box = menuOpen === 'top' ? menuRef.current : fabRef.current;
      if (box && !box.contains(event.target as Node)) setMenuOpen(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const openCreate = (kind: CreateKind) => {
    setMenuOpen(null);
    setShowCreate(kind === 'MEMBER');
    setShowCreateAdmin(kind === 'ADMIN');
    setShowCreateVendor(kind === 'VENDOR');
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    try {
      const response = await createMemberAccountRequest({ memberId: Number(form.memberId) });
      for (const warning of response.warnings ?? []) toast.warning(warning);
      if (response.temporaryPassword && selectedMember) {
        setCreatedPassword({
          name: `${selectedMember.first_name || ''} ${selectedMember.last_name || ''}`.trim(),
          signIn: [selectedMember.email, selectedMember.phone].filter(Boolean).join(' or '),
          password: response.temporaryPassword,
        });
      } else {
        toast.success('Member account created.');
      }
      setForm({ memberId: '' });
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
    setBusyId(account.user_id);
    try {
      await updateAccountStatusRequest(account.user_id, status);
      toast.success(status === 'ACTIVE' ? 'Account enabled.' : 'Account disabled.');
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update account status.');
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (account: Account) => {
    setBusyId(account.user_id);
    try {
      const response = await resetMemberPasswordRequest(account.user_id);
      if (response.temporaryPassword) {
        setCreatedPassword({
          title: 'Password reset',
          name: nameOf(account),
          signIn: [account.email, account.phone].filter(Boolean).join(' or ') || account.username,
          password: response.temporaryPassword,
        });
      } else {
        toast.success(response.message);
      }
      void loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      setBusyId(null);
    }
  };

  const searchWords = accountSearch.toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSearch = (account: Account) => {
    if (!searchWords.length) return true;
    const text = [account.full_name, account.first_name, account.last_name, account.username, account.email, account.phone, account.member_number, account.position, account.kadiwa_branch_name]
      .filter(Boolean).join(' ').toLowerCase();
    return searchWords.every((word) => text.includes(word));
  };
  const searched = accounts.filter(matchesSearch);
  const shownAccounts = searched.filter((account) => roleFilter === 'ALL' || account.role === roleFilter);
  const roleCount = (role: Account['role']) => searched.filter((account) => account.role === role).length;
  const groups = GROUPS
    .filter((group) => roleFilter === 'ALL' || roleFilter === group.role)
    .map((group) => {
      const all = shownAccounts.filter((account) => account.role === group.role);
      const limit = (roleFilter === 'ALL' ? FIRST_SHOWN_ALL : FIRST_SHOWN_ONE_KIND) + (moreShown[group.role] ?? 0);
      return { ...group, all, shown: all.slice(0, limit) };
    })
    .filter((group) => group.all.length > 0);

  // Wide screens always show someone's details; phones open them when a row is tapped.
  const picked = accounts.find((account) => account.user_id === selectedId);
  const selected = picked ?? (isDesktop ? groups[0]?.shown[0] : undefined);
  const detailOpen = Boolean(selected) && !isDesktop;
  const pick = (account: Account) => {
    setSelectedId(account.user_id);
    if (!isDesktop) window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (selectedId !== null && !isLoading && !accounts.some((account) => account.user_id === selectedId)) setSelectedId(null);
  }, [accounts, isLoading, selectedId]);

  const closeCreateMember = () => { if (isCreating) return; setShowCreate(false); setForm({ memberId: '' }); setMemberSearch(''); };

  const listSubtitle = (account: Account) => {
    if (account.role === 'ADMIN') {
      const seen = lastSeenOf(account);
      return `${account.position || 'No position yet'}, ${seen ? `active ${whenText(seen)}` : 'not signed in yet'}`;
    }
    if (account.role === 'VENDOR') return `${account.kadiwa_branch_name || 'No store'}, ${hasContact(account) ? `username ${account.username}` : 'no email or mobile'}`;
    return `Member no. ${account.member_number || '—'}`;
  };
  // Phones: a badge beside the name and a shorter second line, as in the app's other lists.
  const phoneBadge = (account: Account) => account.role === 'ADMIN'
    ? (account.position ? <Chip tone="green">{account.position}</Chip> : <Chip tone="amber">No position</Chip>)
    : account.role === 'VENDOR' && account.kadiwa_branch_name ? <Chip tone="amber">{account.kadiwa_branch_name}</Chip> : null;
  const phoneLines = (account: Account) => {
    const seen = lastSeenOf(account);
    if (account.role === 'ADMIN') return <span>{seen ? `Active ${whenText(seen)}` : 'Not signed in yet'}</span>;
    if (account.role === 'VENDOR') return <><span className="block">Username {account.username}</span>{!hasContact(account) && <span className="block font-semibold text-amber-700">No email or mobile yet</span>}</>;
    return <span>Member no. {account.member_number || '—'}</span>;
  };

  // The account's main button, beside the name: full-width solid green on phones; on wide
  // screens a lighter green, so it doesn't look like Create account.
  const accountButtons = (account: Account) => {
    const busy = busyId === account.user_id;
    const size = 'h-11 w-full sm:h-10 sm:w-auto';
    const main = 'bg-green-700 text-white hover:bg-green-800 lg:bg-green-100 lg:text-green-900 lg:ring-1 lg:ring-inset lg:ring-green-200 lg:hover:bg-green-200';
    const name = nameOf(account);
    return (
      <>
        {account.role === 'VENDOR'
          ? <button type="button" onClick={() => setEditingVendor(account)} title={`Change ${name}'s name or password`} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ${size} ${main}`}><Pencil className="h-4 w-4" />Change name or password</button>
          : <button type="button" onClick={() => setConfirming({ kind: 'reset', account })} disabled={busy} title={`Reset ${name}'s password`} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60 ${size} ${main}`}><KeyRound className="h-4 w-4" />Reset password</button>}
      </>
    );
  };

  const header = (
    <div className="flex flex-none items-center justify-end gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => void loadData()} disabled={isLoading} aria-label="Refresh" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 sm:px-3">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span>
        </button>
        <div ref={menuRef} className="relative hidden md:block">
          <button type="button" onClick={() => setMenuOpen(menuOpen === 'top' ? null : 'top')} aria-haspopup="menu" aria-expanded={menuOpen === 'top'} className="inline-flex h-10 items-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-800">
            <Plus className="h-4 w-4" />Create account<ChevronDown className={`h-4 w-4 transition-transform ${menuOpen === 'top' ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen === 'top' && <CreateMenu onPick={openCreate} className="absolute right-0 top-full z-30 mt-2" />}
        </div>
      </div>
    </div>
  );

  const list = (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)] lg:flex lg:h-full lg:min-h-0 lg:flex-col" aria-label="Accounts">
      <div className="space-y-3 border-b border-gray-100 p-3 sm:p-4">
        <label className="relative block">
          <span className="sr-only">Search accounts</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="search" value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Name, username, email, mobile or member no." className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-9 text-sm focus:border-transparent focus:bg-white focus:ring-2 focus:ring-green-500" />
          {accountSearch && <button type="button" onClick={() => setAccountSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>}
        </label>
        <div className="flex gap-1.5" role="group" aria-label="Kind of account">
          {([['ALL', 'All', searched.length], ['ADMIN', 'Admins', roleCount('ADMIN')], ['MEMBER', 'Members', roleCount('MEMBER')], ['VENDOR', 'Vendors', roleCount('VENDOR')]] as const).map(([role, label, count]) => (
            <button key={role} type="button" onClick={() => setRoleFilter(role)} aria-pressed={roleFilter === role}
              className={`inline-flex h-9 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 text-[13px] font-semibold sm:text-sm ${roleFilter === role ? 'border-green-800 bg-green-800 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
              {label} <span className={roleFilter === role ? 'text-green-100' : 'text-gray-500'}>{count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {isLoading && accounts.length === 0 ? (
          <ul className="space-y-1 p-3" aria-label="Loading accounts">
            {[0, 1, 2, 3, 4].map((key) => <li key={key} className="flex items-center gap-3 px-1 py-2"><span className="acf-skeleton h-10 w-10 !rounded-full" /><span className="flex-1 space-y-1.5"><span className="acf-skeleton block h-3.5 w-2/3" /><span className="acf-skeleton block h-3 w-1/2" /></span></li>)}
          </ul>
        ) : groups.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">{accounts.length ? 'No account matches the search.' : 'No login accounts yet.'}</p>
        ) : groups.map((group) => {
          const hidden = group.all.length - group.shown.length;
          return (
            <div key={group.role} className="border-b border-gray-100 last:border-b-0 lg:border-b-0">
              <h3 className="flex items-center justify-between bg-gray-50 px-4 py-2 text-xs font-bold text-gray-700 lg:bg-transparent lg:pb-1 lg:pt-3 lg:font-semibold lg:text-gray-500">
                {group.label}<span className="font-semibold text-gray-500 lg:hidden">{group.all.length}</span>
              </h3>
              <ul className="lg:space-y-1 lg:px-2">
                {group.shown.map((account) => {
                  const active = selected?.user_id === account.user_id && isDesktop;
                  return (
                    <li key={account.user_id} className="border-t border-gray-100 first:border-t-0 lg:border-0">
                      <button type="button" onClick={() => pick(account)} aria-current={active ? 'true' : undefined}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors lg:rounded-xl lg:border lg:px-2.5 lg:py-2 ${active ? 'lg:border-green-700 lg:bg-green-50' : 'hover:bg-gray-50 lg:border-transparent'}`}>
                        <Avatar account={account} />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`truncate text-sm font-semibold ${account.account_status === 'ACTIVE' ? 'text-gray-900' : 'text-gray-500'}`}>{nameOf(account)}</span>
                            <span className="hidden shrink-0 sm:inline lg:hidden">{phoneBadge(account)}</span>
                            {account.account_status !== 'ACTIVE' && <span className="hidden shrink-0 lg:inline"><Chip tone={account.account_status === 'LOCKED' ? 'red' : 'gray'}>{statusLabel(account)}</Chip></span>}
                          </span>
                          <span className="block truncate text-xs text-gray-500 lg:hidden">{phoneLines(account)}</span>
                          <span className="hidden truncate text-xs text-gray-500 lg:block">{listSubtitle(account)}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 lg:hidden" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hidden > 0 && (
                <button type="button" onClick={() => setMoreShown({ ...moreShown, [group.role]: (moreShown[group.role] ?? 0) + SHOW_MORE_STEP })} className="w-full px-4 py-3 text-left text-xs font-bold text-green-700 hover:bg-green-50 lg:px-4">
                  Show {Math.min(hidden, SHOW_MORE_STEP)} more {Math.min(hidden, SHOW_MORE_STEP) === 1 ? group.one : group.many}{hidden > SHOW_MORE_STEP ? ` of ${hidden}` : ''}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const detail = (account: Account) => {
    const first = firstNameOf(account);
    const busy = busyId === account.user_id;
    const seen = lastSeenOf(account);

    // Something the admin should know or do about this account.
    const notice = account.role === 'VENDOR' && !hasContact(account)
      ? { title: 'No email or mobile number', text: `${first} signs in with the username only. If ${first} forgets the password, set a new one with Change name or password.` }
      : account.role === 'MEMBER' && !hasContact(account)
        ? { title: 'No email or mobile number', text: `${first} signs in with the email or mobile number in the member information. Add one in Members so ${first} can sign in.` }
        : account.must_change_password
          ? { title: 'Temporary password', text: `${first} has to choose a new password on the next sign-in.` }
          : null;

    const history = [
      seen ? { dot: 'bg-green-600', title: `Last active`, when: seen } : null,
      account.last_login && account.last_login !== seen ? { dot: 'bg-gray-300', title: 'Last signed in', when: account.last_login } : null,
      { dot: 'bg-gray-300', title: account.created_by_name ? `Account created by ${account.created_by_name}` : account.role === 'ADMIN' ? 'First administrator account' : 'Account created', when: account.account_created_at },
    ].filter((item): item is { dot: string; title: string; when: string } => Boolean(item));

    return (
      <article className="space-y-3 sm:space-y-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-white lg:p-6 lg:shadow-[var(--shadow-card)]" aria-label={`${nameOf(account)} details`}>
        {/* Who */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)] lg:border-0 lg:p-0 lg:shadow-none">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
            <Avatar account={account} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold text-gray-900 [overflow-wrap:anywhere] sm:text-2xl">{nameOf(account)}</h3>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                {account.role === 'ADMIN' && (account.position ? <Chip tone="green">{account.position}</Chip> : <Chip tone="amber">No position yet</Chip>)}
                {account.role === 'ADMIN' && <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600"><UserCog className="h-3.5 w-3.5" />Admin</span>}
                {account.role === 'VENDOR' && <Chip tone="amber"><Store className="h-3 w-3" />Kadiwa vendor</Chip>}
                {account.role === 'MEMBER' && <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600"><UserRound className="h-3.5 w-3.5" />Member</span>}
                <StatusChip account={account} />
              </div>
              {account.role === 'VENDOR' && account.kadiwa_branch_name && <p className="mt-1 text-sm text-gray-500">{account.kadiwa_branch_name}</p>}
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:self-center">{accountButtons(account)}</div>
          </div>
        </div>

        {notice && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-start gap-2 text-sm font-bold text-gray-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{notice.title}</p>
            <p className="mt-1 pl-6 text-sm text-gray-700">{notice.text}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:border-0 sm:bg-gray-50">
            <h4 className="text-sm font-bold text-gray-900">Contact</h4>
            <dl className="mt-2 divide-y divide-gray-100 sm:mt-3 sm:space-y-3 sm:divide-y-0">
              <Field label="Email" action={account.email ? <CopyButton value={account.email} what="Email" /> : undefined}>
                {account.email || <span className="font-normal text-gray-400">Not added</span>}
              </Field>
              <Field label="Mobile" action={account.phone ? <CopyButton value={account.phone} what="Mobile number" /> : undefined}>
                {account.phone || <span className="font-normal text-gray-400">Not added</span>}
              </Field>
            </dl>
          </section>
          <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:border-0 sm:bg-gray-50">
            <h4 className="text-sm font-bold text-gray-900">Sign-in</h4>
            <dl className="mt-2 divide-y divide-gray-100 sm:mt-3 sm:space-y-3 sm:divide-y-0">
              {account.role === 'MEMBER'
                ? <Field label="Member no.">{account.member_number || '—'}</Field>
                : <Field label="Username">{account.username}</Field>}
              {account.role === 'MEMBER' && <Field label="Signs in with"><span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" />/<Phone className="h-3.5 w-3.5 text-gray-400" />Email or mobile</span></Field>}
              {account.role === 'VENDOR' && <Field label="Store">{account.kadiwa_branch_name || <span className="font-normal text-gray-400">None</span>}</Field>}
              <Field label="Last activity">{seen ? capitalize(whenText(seen)) : <span className="font-normal text-gray-400">Not signed in yet</span>}</Field>
            </dl>
          </section>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h4 className="text-sm font-bold text-gray-900">History</h4>
          <ol className="mt-3 space-y-3">
            {history.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                <span className="min-w-0"><span className="block text-sm font-semibold text-gray-900">{item.title}</span><span className="block text-xs text-gray-500">{formatDateTime(item.when)}</span></span>
              </li>
            ))}
          </ol>
        </section>

        {account.account_status === 'ACTIVE' ? (
          <section className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h4 className="text-sm font-bold text-red-800">Disable this account</h4><p className="mt-0.5 text-xs text-gray-600">{first} won't be able to sign in while the account is disabled.</p></div>
            <button type="button" onClick={() => setConfirming({ kind: 'disable', account })} disabled={busy} className="h-10 shrink-0 rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">Disable account</button>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h4 className="text-sm font-bold text-gray-900">This account is {statusLabel(account).toLowerCase()}</h4><p className="mt-0.5 text-xs text-gray-600">Enable it so {first} can sign in again.</p></div>
            <button type="button" onClick={() => void updateStatus(account)} disabled={busy} className="h-10 shrink-0 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60">Enable account</button>
          </section>
        )}
      </article>
    );
  };

  return (
    // Wide screens: the page fills the content area exactly (useFillScreen), and the list and
    // the details each scroll inside their own panel, so the page itself never scrolls.
    <div className="space-y-4 sm:space-y-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:space-y-0 lg:gap-4">
      {detailOpen && selected ? (
        <>
          <button type="button" onClick={() => setSelectedId(null)} className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-semibold text-green-800 hover:bg-green-50">
            <ChevronLeft className="h-5 w-5" />Accounts
          </button>
          {detail(selected)}
        </>
      ) : (
        <>
          {header}
          <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(17rem,22rem)_1fr] lg:grid-rows-1">
            {list}
            {isDesktop && (selected ? detail(selected) : (
              <div className="hidden rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500 lg:block lg:h-full">{isLoading ? 'Loading accounts...' : 'Pick an account to see its details.'}</div>
            ))}
          </div>
        </>
      )}

      {/* Phones: the create button floats above the bottom navigation. */}
      {!detailOpen && (
        <div ref={fabRef} className="fixed right-4 z-30 md:hidden" style={{ bottom: isPhone ? 'calc(5rem + env(safe-area-inset-bottom))' : '1.5rem' }}>
          {menuOpen === 'fab' && <CreateMenu onPick={openCreate} className="absolute bottom-full right-0 mb-2" />}
          <button type="button" onClick={() => setMenuOpen(menuOpen === 'fab' ? null : 'fab')} aria-haspopup="menu" aria-expanded={menuOpen === 'fab'} className="inline-flex h-12 items-center gap-2 rounded-full bg-green-700 px-5 text-sm font-semibold text-white shadow-lg shadow-green-900/20 hover:bg-green-800">
            <Plus className={`h-5 w-5 transition-transform ${menuOpen === 'fab' ? 'rotate-45' : ''}`} />Create account
          </button>
        </div>
      )}
      {/* Room so the floating button never covers the last row. */}
      {!detailOpen && <div className="h-16 md:hidden" aria-hidden="true" />}

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
            <p className="flex items-start gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-gray-700 md:col-span-2">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
              <span>A temporary password is made automatically. You'll see it right after, and it stays in your notifications to copy. The member changes it on first sign-in.</span>
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={isCreating || nothingToSignInWith} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">{isCreating ? 'Creating...' : 'Create account'}</button>
            <button type="button" disabled={isCreating} onClick={closeCreateMember} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
          </div>
        </form>
        </Modal>
      )}

      {createdPassword && (
        <Modal title={createdPassword.title ?? 'Member account created'} description={`Give ${createdPassword.name} this temporary password. They sign in with ${createdPassword.signIn} and choose a new password right away.`} onClose={() => setCreatedPassword(null)}>
          <div className="space-y-3">
            <div className="flex flex-col gap-2 rounded-2xl border border-green-200 bg-green-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-green-800">Temporary password</p>
                <code className="mt-1 block select-all font-mono text-2xl font-bold tracking-wider text-gray-900 [overflow-wrap:anywhere]">{createdPassword.password}</code>
              </div>
              <button type="button" onClick={() => void copyText(createdPassword.password).then((copied) => copied ? toast.success('Temporary password copied') : toast.error('Could not copy. Select the password and copy it instead.'))}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800">
                <Copy className="h-4 w-4" />Copy password
              </button>
            </div>
            <p className="text-xs text-gray-500">It's also saved in your notifications (the bell) until the member sets their own password.</p>
            <div className="flex justify-end"><button type="button" onClick={() => setCreatedPassword(null)} className="h-10 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">Done</button></div>
          </div>
        </Modal>
      )}

      {confirming && (() => {
        const { kind, account } = confirming;
        const name = nameOf(account);
        const first = firstNameOf(account);
        const busy = busyId === account.user_id;
        const close = () => { if (!busy) setConfirming(null); };
        const run = async () => {
          if (kind === 'reset') await resetPassword(account);
          else await updateStatus(account);
          setConfirming(null);
        };
        return (
          <Modal
            title={kind === 'reset' ? `Reset ${name}'s password?` : `Disable ${name}'s account?`}
            onClose={close}
            footer={(
              <>
                <button type="button" onClick={close} disabled={busy} className="h-10 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">Cancel</button>
                <button type="button" onClick={() => void run()} disabled={busy}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 ${kind === 'reset' ? 'bg-green-700 hover:bg-green-800' : 'bg-red-600 hover:bg-red-700'}`}>
                  {kind === 'reset' ? <KeyRound className="h-4 w-4" /> : null}
                  {busy ? (kind === 'reset' ? 'Resetting...' : 'Disabling...') : kind === 'reset' ? 'Reset password' : 'Disable account'}
                </button>
              </>
            )}
          >
            <div className="flex items-start gap-3">
              <Avatar account={account} />
              <div className="min-w-0 space-y-2 text-sm text-gray-700">
                {kind === 'reset' ? (
                  <>
                    <p>{first}'s current password stops working right away and {first} is signed out on every device.</p>
                    <p>A new temporary password is made and shown to you, and saved in your notifications to copy. Nothing is emailed. Give it to {first}, who must choose a new password on the next sign-in.</p>
                  </>
                ) : (
                  <p>{first} won't be able to sign in and is signed out on every device. You can enable the account again at any time.</p>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
