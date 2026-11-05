import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Wallet } from 'lucide-react';
import { EmptyState, ListSkeleton, Pagination, StatCard } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { dateOnlySortValue, formatDate } from '../../utils/dateTime';
import { formatPeso, sumMoney } from '../../utils/money';

// The member's savings: the balance, every deposit (savings history) and every
// withdrawal (withdrawal history), as recorded by the office.

type View = 'all' | 'deposits' | 'withdrawals';
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'deposits', label: 'Savings History' },
  { value: 'withdrawals', label: 'Withdrawal History' },
];

export function MemberSavings() {
  const { memberData, error } = useMyMemberData();
  const [view, setView] = useState<View>('all');

  // Oldest first to work out the balance after each entry, then newest first to list them.
  const entries = (() => {
    let running = 0;
    return [...(memberData?.savings.transactions ?? [])]
      .sort((a, b) => dateOnlySortValue(a.date) - dateOnlySortValue(b.date) || a.id - b.id)
      .map((entry) => {
        const withdrawal = entry.type === 'Withdrawal';
        running = sumMoney([running, withdrawal ? -entry.amount : entry.amount]);
        return { ...entry, withdrawal, balance: typeof entry.balance === 'number' ? entry.balance : running };
      })
      .reverse();
  })();
  const deposits = entries.filter((entry) => !entry.withdrawal);
  const withdrawals = entries.filter((entry) => entry.withdrawal);
  const shown = view === 'deposits' ? deposits : view === 'withdrawals' ? withdrawals : entries;
  const pages = usePagination(shown, { resetKey: view });

  if (error) return <div className="p-4 text-sm text-red-600 md:p-8">{error}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <p className="text-gray-600">Your savings deposits and withdrawals, as recorded by the ACIFAC office. If something is wrong, please tell the office.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Savings balance" value={formatPeso(memberData?.savings.total)} icon={PiggyBank} tone="dark" loading={!memberData} detail="Deposits less withdrawals" />
        <StatCard label="Total deposited" value={formatPeso(sumMoney(deposits.map((entry) => entry.amount)))} icon={ArrowDownLeft} loading={!memberData} detail={`${deposits.length} ${deposits.length === 1 ? 'deposit' : 'deposits'}`} />
        <StatCard label="Total withdrawn" value={formatPeso(sumMoney(withdrawals.map((entry) => entry.amount)))} icon={ArrowUpRight} tone="warning" loading={!memberData} detail={`${withdrawals.length} ${withdrawals.length === 1 ? 'withdrawal' : 'withdrawals'}`} />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="border-b border-gray-100 p-3 sm:p-4">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 sm:inline-grid" role="tablist" aria-label="Savings records">
            {VIEWS.map((option) => (
              <button key={option.value} type="button" role="tab" aria-selected={view === option.value} onClick={() => setView(option.value)}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${view === option.value ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {!memberData ? <ListSkeleton rows={4} />
          : !shown.length ? (
            <EmptyState icon={Wallet} compact
              title={view === 'withdrawals' ? 'No withdrawals yet' : view === 'deposits' ? 'No savings deposits yet' : 'No savings records yet'}
              message="Deposits and withdrawals recorded by the office will appear here." />
          ) : (
            <>
              {/* Phones: one card per entry */}
              <ul className="divide-y divide-gray-100 md:hidden">
                {pages.pageItems.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{entry.withdrawal ? 'Withdrawal' : 'Deposit'}</p>
                      <p className="text-xs text-gray-500">{formatDate(entry.date)}{entry.reference ? ` · ${entry.reference}` : ''}</p>
                      {entry.notes && <p className="mt-0.5 text-sm text-gray-600">{entry.notes}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-bold tabular-nums ${entry.withdrawal ? 'text-amber-700' : 'text-green-700'}`}>{entry.withdrawal ? '-' : '+'}{formatPeso(entry.amount)}</p>
                      <p className="text-xs tabular-nums text-gray-500">Balance {formatPeso(entry.balance)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Tablets and desktops: table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>{['Date', 'Type', 'Amount', 'Balance', 'Method', 'Reference', 'Notes'].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pages.pageItems.map((entry) => (
                      <tr key={entry.id}>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(entry.date)}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${entry.withdrawal ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>{entry.withdrawal ? 'Withdrawal' : 'Deposit'}</span></td>
                        <td className={`whitespace-nowrap px-4 py-3 font-semibold tabular-nums ${entry.withdrawal ? 'text-amber-700' : 'text-green-700'}`}>{entry.withdrawal ? '-' : '+'}{formatPeso(entry.amount)}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">{formatPeso(entry.balance)}</td>
                        <td className="px-4 py-3 text-gray-600">{entry.paymentMethod || '—'}</td>
                        <td className="px-4 py-3 text-gray-600">{entry.reference || '—'}</td>
                        <td className="max-w-xs px-4 py-3 text-gray-600">{entry.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="records" />
            </>
          )}
      </section>
    </div>
  );
}
