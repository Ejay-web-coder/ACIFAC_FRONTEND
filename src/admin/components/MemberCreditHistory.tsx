import { useCallback, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { fetchMemberCreditAdvice, type AnalyticsData } from '../../app/services/authApi';
import { Pagination } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { errorMessage } from '../../lib/api';
import { MemberCreditAdviceModal, type AdviceState } from './MemberCreditAdviceModal';

type Member = AnalyticsData['memberAnalytics'][number];

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

const FILTERS = {
  borrowers: { label: 'Members with loans', test: (member: Member) => member.totalLoans > 0 },
  overdue: { label: 'Overdue now', test: (member: Member) => member.overdueInstallments > 0 },
  late: { label: 'With late payments', test: (member: Member) => member.latePayments > 0 },
  restructured: { label: 'Restructured loans', test: (member: Member) => member.restructuredLoans > 0 },
  all: { label: 'All members', test: () => true },
} as const;
type FilterKey = keyof typeof FILTERS;

const SORTS = {
  late: { label: 'Most late payments', compare: (a: Member, b: Member) => b.latePayments - a.latePayments || b.overdueInstallments - a.overdueInstallments },
  balance: { label: 'Largest balance', compare: (a: Member, b: Member) => b.outstandingBalance - a.outstandingBalance },
  name: { label: 'Name', compare: (a: Member, b: Member) => a.memberName.localeCompare(b.memberName) },
} as const;
type SortKey = keyof typeof SORTS;

/**
 * Each member's borrowing record, all loans to date. Clicking a member opens
 * a short AI suggestion on lending to them again, from how they repaid, with
 * their repayment record and loans.
 */
export function MemberCreditHistory({ members, methodology, loading }: { members: Member[]; methodology?: Record<string, unknown>; loading: boolean }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('borrowers');
  const [sort, setSort] = useState<SortKey>('late');
  const [openId, setOpenId] = useState<number | null>(null);
  // The suggestion asked for each member, kept while the page is open (Refresh asks again).
  const [advice, setAdvice] = useState<Record<number, AdviceState>>({});

  const term = search.trim().toLowerCase();
  const shown = useMemo(() => members
    .filter(FILTERS[filter].test)
    .filter((member) => !term || member.memberName.toLowerCase().includes(term) || (member.memberId ?? '').toLowerCase().includes(term))
    .sort(SORTS[sort].compare), [members, filter, term, sort]);
  const pages = usePagination(shown, { pageSize: 10, resetKey: `${filter}|${term}|${sort}` });

  const askAdvice = useCallback((memberId: number) => {
    setAdvice((current) => ({ ...current, [memberId]: { ...current[memberId], status: 'loading', error: undefined } }));
    fetchMemberCreditAdvice(memberId)
      .then((result) => setAdvice((current) => ({ ...current, [memberId]: { status: 'done', result } })))
      .catch((reason) => setAdvice((current) => ({ ...current, [memberId]: { ...current[memberId], status: 'error', error: errorMessage(reason, 'Unable to get the suggestion.') } })));
  }, []);
  const openMember = (memberId: number) => {
    if (!advice[memberId] || advice[memberId].status === 'error') askAdvice(memberId);
    setOpenId(memberId);
  };
  const closeMember = useCallback(() => setOpenId(null), []);
  const openMemberRow = members.find((member) => member.databaseId === openId);

  const borrowers = members.filter((member) => member.totalLoans > 0);
  const sum = (key: 'installmentsDue' | 'onTimePayments' | 'latePayments' | 'restructuredLoans') => members.reduce((total, member) => total + member[key], 0);
  const due = sum('installmentsDue');
  const onTimeRate = due ? Math.round((sum('onTimePayments') / due) * 1000) / 10 : null;
  const tiles: Array<[string, string, string]> = [
    ['Members with loans', borrowers.length.toLocaleString(), `of ${plural(members.length, 'member')}`],
    ['On-time payments', onTimeRate === null ? '' : `${onTimeRate}%`, `of ${plural(due, 'installment')} due`],
    ['Late payments', sum('latePayments').toLocaleString(), plural(members.filter(FILTERS.late.test).length, 'member')],
    ['Restructured loans', sum('restructuredLoans').toLocaleString(), plural(members.filter(FILTERS.restructured.test).length, 'member')],
  ];
  const notes = ['onTimePaymentRate', 'latePayments', 'restructuredLoans']
    .map((key) => [key, methodology?.[key]] as const).filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string');
  const NOTE_LABELS: Record<string, string> = { onTimePaymentRate: 'On time', latePayments: 'Late', restructuredLoans: 'Restructured' };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="credit-history-title">
      <h2 id="credit-history-title" className="text-lg font-bold text-gray-900">Member Credit History</h2>
      <p className="mt-1 text-sm text-gray-500">Borrowing record of each member, all loans to date (terminated members left out). Click a member for a lending suggestion from how they repay.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, detail]) => (
          <div key={label} className="min-w-0 rounded-xl border border-gray-200 px-3 py-2.5">
            <p className="text-xs font-medium text-gray-600">{label}</p>
            <p className="mt-0.5 text-xl font-bold text-gray-900">{loading && !members.length ? '…' : value}</p>
            <p className="mt-0.5 text-xs leading-snug text-gray-500">{detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search by name or member ID</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or member ID" className="h-11 w-full rounded-xl border border-gray-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
        </label>
        <select value={filter} onChange={(event) => setFilter(event.target.value as FilterKey)} aria-label="Show" className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => <option key={key} value={key}>{FILTERS[key].label}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort by" className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">
          {(Object.keys(SORTS) as SortKey[]).map((key) => <option key={key} value={key}>Sort: {SORTS[key].label}</option>)}
        </select>
      </div>

      {!shown.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-3 py-8 text-center text-sm text-gray-500">{loading ? 'Loading live data...' : term ? `No member matches “${search.trim()}”.` : 'No members to show.'}</p>
      ) : <>
        {/* Phones: one card per member */}
        <ul className="mt-4 space-y-3 md:hidden">
          {pages.pageItems.map((member) => (
            <li key={member.databaseId}>
              <button type="button" onClick={() => openMember(member.databaseId)} aria-haspopup="dialog" className="w-full rounded-xl border border-gray-200 p-3 text-left hover:border-green-300 hover:bg-green-50/40">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-green-800">{member.memberName}</span>
                    <span className="block text-xs text-gray-500">{member.memberId ?? ''} · {plural(member.totalLoans, 'loan')}</span>
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                </span>
                <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-gray-500">Balance</span><span className="text-right font-medium tabular-nums text-gray-900">{peso(member.outstandingBalance)}</span>
                  <span className="text-gray-500">Restructured</span><span className="text-right tabular-nums text-gray-900">{member.restructuredLoans}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-gray-200 md:block">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Loans</th>
                <th className="px-3 py-2 text-right font-medium">Borrowed</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-center font-medium">Restructured</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pages.pageItems.map((member) => (
                <tr key={member.databaseId} className="align-top">
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => openMember(member.databaseId)} aria-haspopup="dialog" className="text-left font-medium text-green-800 underline-offset-2 hover:underline">{member.memberName}</button>
                    <p className="text-xs text-gray-500">{member.memberId ?? ''}</p>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{member.totalLoans}<p className="text-xs text-gray-500">{member.activeLoans} open · {member.completedLoans} paid</p></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{peso(member.totalBorrowed)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">{peso(member.outstandingBalance)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{member.restructuredLoans ? <span className="font-semibold text-amber-800">{member.restructuredLoans}</span> : <span className="text-gray-400">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="members" />
      </>}

      {notes.length > 0 && (
        <details className="mt-4 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium text-gray-700">How these figures are calculated</summary>
          <dl className="mt-2 space-y-1.5">
            {notes.map(([key, text]) => <div key={key}><dt className="inline font-medium text-gray-800">{NOTE_LABELS[key]}: </dt><dd className="inline">{text}</dd></div>)}
          </dl>
        </details>
      )}

      {openMemberRow && advice[openMemberRow.databaseId] && (
        <MemberCreditAdviceModal member={openMemberRow} advice={advice[openMemberRow.databaseId]} onRefresh={() => askAdvice(openMemberRow.databaseId)} onClose={closeMember} />
      )}
    </section>
  );
}
