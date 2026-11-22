import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDollarSign, HandCoins, ReceiptText, Smartphone } from 'lucide-react';
import { EmptyState, ListSkeleton, Pagination, StatCard, StatusBadge } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../utils/dateTime';
import { formatPeso } from '../../utils/money';
import { DUE_KIND_LABELS, fetchMyDues, type Due, type MemberDuesDetail } from '../../app/services/duesApi';
import { DuesRatesNote } from '../../app/components/DuesRatesNote';

// The member's dues under the Membership Policy: share capital and savings
// for every meeting, absence fines and transfer fees, what is paid and what
// is still owed. Payments are made at the ACIFAC office, or by GCash or Maya
// from Pay online.

type View = 'unpaid' | 'all' | 'payments';
const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'all', label: 'All dues' },
  { value: 'payments', label: 'Payments' },
];

const dueTitle = (due: Due) => (due.activityTitle ? `${DUE_KIND_LABELS[due.kind]}: ${due.activityTitle}` : due.description || DUE_KIND_LABELS[due.kind]);

export function MemberDues() {
  const [detail, setDetail] = useState<MemberDuesDetail | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('unpaid');

  const load = useCallback(() => {
    fetchMyDues().then((response) => { setDetail(response); setError(''); }).catch((reason) => setError(errorMessage(reason, 'Unable to load your dues.')));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['member_dues', 'member_dues_payments'], load);

  const dues = view === 'unpaid' ? detail?.dues.filter((due) => due.status === 'unpaid') ?? [] : detail?.dues ?? [];
  const pages = usePagination(dues, { resetKey: view });
  const paymentPages = usePagination(detail?.payments ?? [], { resetKey: view });
  const summary = detail?.summary;

  if (error) return <div className="p-4 text-sm text-red-600 md:p-8">{error}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-gray-600">Your dues as a member of ACIFAC. Pay them at the ACIFAC office, or online by GCash or Maya; payments the office records appear here.</p>
        {Boolean(summary?.unpaid) && (
          <Link to="/member/pay-online?for=dues" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800">
            <Smartphone className="h-4 w-4" aria-hidden="true" />Pay online
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Still to pay" value={formatPeso(summary?.unpaid)} icon={CircleDollarSign} tone={summary?.unpaid ? 'warning' : 'dark'} loading={!detail}
          detail={summary?.unpaid ? `${summary.unpaidCount} unpaid ${summary.unpaidCount === 1 ? 'due' : 'dues'}, the oldest from ${formatDate(summary.oldestUnpaid)}` : 'Nothing to pay'} />
        <StatCard label="Paid" value={formatPeso(summary?.paid)} icon={HandCoins} loading={!detail} detail={`${detail?.payments.length ?? 0} ${detail?.payments.length === 1 ? 'payment' : 'payments'}`} />
        <StatCard label="Waived" value={formatPeso(summary?.waived)} icon={CheckCircle2} loading={!detail} detail="Excused by the board" />
      </div>
      <DuesRatesNote rates={detail?.rates ?? null} />

      <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="border-b border-gray-100 p-3 sm:p-4">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 sm:inline-grid" role="tablist" aria-label="Dues">
            {VIEWS.map((option) => (
              <button key={option.value} type="button" role="tab" aria-selected={view === option.value} onClick={() => setView(option.value)}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${view === option.value ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {!detail ? <ListSkeleton rows={4} /> : view === 'payments' ? (
          !detail.payments.length ? <EmptyState icon={HandCoins} compact title="No payments yet" message="Dues payments recorded by the office will appear here." /> : (
            <>
              <ul className="divide-y divide-gray-100">
                {paymentPages.pageItems.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{formatDate(item.paymentDate)}</p>
                      <p className="text-xs text-gray-500">{item.paymentMethod}{item.reference ? ` · ${item.reference}` : ''} · {item.duesCount} {item.duesCount === 1 ? 'due' : 'dues'}</p>
                    </div>
                    <p className="shrink-0 font-bold tabular-nums text-green-700">{formatPeso(item.amount)}</p>
                  </li>
                ))}
              </ul>
              <Pagination page={paymentPages.page} totalPages={paymentPages.totalPages} total={paymentPages.total} pageSize={paymentPages.pageSize} onPageChange={paymentPages.setPage} onPageSizeChange={paymentPages.setPageSize} label="payments" />
            </>
          )
        ) : !dues.length ? (
          <EmptyState icon={ReceiptText} compact title={view === 'unpaid' ? 'You have no unpaid dues' : 'No dues yet'} message="Dues are added after each meeting's attendance is final." />
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {pages.pageItems.map((due) => (
                <li key={due.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{dueTitle(due)}</p>
                    <p className="text-xs text-gray-500">
                      {formatDate(due.dueDate)}
                      {due.status === 'paid' && due.paidOn ? ` · paid ${formatDate(due.paidOn)}` : ''}
                      {due.status === 'waived' && due.waiveReason ? ` · waived: ${due.waiveReason}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className={`font-bold tabular-nums ${due.status === 'unpaid' ? 'text-amber-700' : 'text-gray-700'}`}>{formatPeso(due.amount)}</p>
                    <StatusBadge status={due.status === 'waived' ? 'closed' : due.status} label={due.status === 'unpaid' ? 'Unpaid' : due.status === 'paid' ? 'Paid' : 'Waived'} />
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="dues" />
          </>
        )}
      </section>
    </div>
  );
}
