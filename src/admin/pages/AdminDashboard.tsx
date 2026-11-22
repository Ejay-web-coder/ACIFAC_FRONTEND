import { Users, PhilippinePeso, TrendingUp, Tractor, AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, Activity, UserPlus, ScanLine, BarChart3, ChevronRight, ClipboardList, PackageMinus, CalendarClock, CalendarCheck } from 'lucide-react';
import { EmptyState, ListSkeleton, SectionCard, Skeleton, StatCard } from '../../app/components/common/UiKit';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { fetchAdminDashboard, type AdminDashboardData } from '../../app/services/authApi';
import { formatDateTime } from '../../utils/dateTime';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { MemberAccountsCard, ShareCapitalChart, ShareCapitalMembersModal, type ShareCapitalLevel } from '../components/dashboard/MemberCards';
import { CapitalBreakdownModal, NetIncomeBreakdownModal, OtherIncomeModal } from '../components/dashboard/FinanceBreakdown';

type Stats = AdminDashboardData['stats'];
// The window open over the dashboard: a breakdown, or Other Income opened from one.
type FinanceView = 'capital' | 'income' | 'other';

type AttentionTone = 'urgent' | 'todo' | 'info';
// What needs the admin's attention, most serious first; each opens the page
// where it is handled. The tone is how a count above zero is shown: overdue
// loans are urgent, reviews and restocking are to-dos, the rest is to know.
const ATTENTION: Array<{ key: keyof Stats; label: string; detail: string; action: string; href: string; tone: AttentionTone; icon: ComponentType<{ className?: string }> }> = [
  { key: 'overdueLoans', label: 'Overdue loans', detail: 'Past due, not fully paid', action: 'Follow up', href: '/admin/loans?status=overdue', tone: 'urgent', icon: AlertTriangle },
  { key: 'pendingLoanRequests', label: 'Loan applications', detail: 'Waiting for review', action: 'Review', href: '/admin/loans?tab=requests', tone: 'todo', icon: ClipboardList },
  { key: 'pendingRentalRequests', label: 'Rental requests', detail: 'Machinery, waiting for review', action: 'Review', href: '/admin/machinery', tone: 'todo', icon: Tractor },
  { key: 'lowStockItems', label: 'Low-stock items', detail: 'Kadiwa, at or below reorder level', action: 'Restock', href: '/admin/kadiwa', tone: 'todo', icon: PackageMinus },
  { key: 'loansDueThisWeek', label: 'Loans due this week', detail: 'A payment due in the next 7 days', action: 'View loans', href: '/admin/loans?status=active', tone: 'info', icon: CalendarClock },
  { key: 'scheduledOperations', label: 'Machinery bookings', detail: 'Scheduled, not started yet', action: 'View bookings', href: '/admin/machinery', tone: 'info', icon: CalendarCheck },
];

const TONE_STYLE: Record<AttentionTone | 'none', { box: string; value: string }> = {
  urgent: { box: 'border-red-200 bg-red-50 text-red-900 hover:border-red-300', value: 'text-red-700' },
  todo: { box: 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300', value: 'text-amber-800' },
  info: { box: 'border-green-200 bg-green-50 text-green-900 hover:border-green-300', value: 'text-green-800' },
  none: { box: 'border-gray-200 bg-white text-gray-600 hover:border-gray-300', value: 'text-gray-400' },
};

const QUICK_ACTIONS = [
  { title: 'Add Members', text: 'Register member', href: '/admin/members', icon: UserPlus },
  { title: 'Scan Docs', text: 'Use OCR', href: '/admin/ocr', icon: ScanLine },
  { title: 'Reports', text: 'View analytics', href: '/admin/analytics', icon: BarChart3 },
];

const formatCurrency = (value: number | null | undefined) => value === null || value === undefined ? '' : `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  // Capital or Net Income breakdown; Other Income returns to the breakdown it was opened from.
  const [view, setView] = useState<FinanceView | null>(null);
  const [otherFrom, setOtherFrom] = useState<FinanceView | null>(null);
  const recordOther = (from: FinanceView) => { setOtherFrom(from); setView('other'); };
  // The share capital band whose members are listed (a clicked bar).
  const [openBand, setOpenBand] = useState<ShareCapitalLevel['key'] | null>(null);
  const [loadError, setLoadError] = useState('');

  // One request returns every figure on this page.
  const loadDashboard = useCallback(() => {
    fetchAdminDashboard()
      .then((next) => { setData(next); setLoadError(''); })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useLiveRefresh([
    'members', 'users', 'share_contributions', 'loans', 'loan_payments', 'loan_requests', 'rental_requests', 'machinery_operations', 'kadiwa_sales', 'kadiwa_inventory',
    'machinery_services', 'machinery_service_payments', 'machinery_expenses', 'machinery_period_balances',
    'savings_transactions', 'member_dues', 'member_dues_payments', 'other_income',
  ], loadDashboard, 1000);

  const stats = data?.stats;
  const loading = !data && !loadError;

  return (
    <div className="space-y-5 md:space-y-6">
      {loadError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Unable to load dashboard data: {loadError}</p>
          <button type="button" onClick={loadDashboard} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-3 font-semibold text-red-700 hover:bg-red-100"><RefreshCw className="h-4 w-4" />Retry</button>
        </div>
      )}

      {/* Key figures: 2 columns on phones and tablets (net income full width), 3 on desktops */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
        <StatCard label="Total Members" value={stats ? stats.totalMembers.toLocaleString('en-PH') : ''} icon={Users} href="/admin/members" detail="Active members" tone="dark" loading={loading} />
        <StatCard label="Capital" value={formatCurrency(stats?.capital?.total ?? stats?.outstandingLoans)} icon={PhilippinePeso} onClick={() => setView('capital')} detail={<BreakdownHint>Share capital, savings, loans, machinery, Kadiwa Store and others</BreakdownHint>} tone="green" loading={loading} />
        <div className="col-span-2 lg:col-span-1">
          <StatCard label="Net Income" value={formatCurrency(stats?.netIncome)} icon={TrendingUp} onClick={() => setView('income')} detail={<BreakdownHint>Sources, statutory funds, dividends and patronage refunds</BreakdownHint>} tone="soft" loading={loading} />
        </div>
      </div>

      {/* Wide screens: attention across the top, then the share capital chart with
          Member Accounts and the quick actions beside it, then recent activity.
          Phones, tablets and small laptops: quick actions first, then the rest in that order. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 xl:gap-6">
        <div className="order-2 xl:order-none xl:col-span-3"><AttentionCard stats={stats} loading={loading} /></div>
        <div className="order-4 xl:order-none xl:col-span-2 xl:row-span-2">
          <ShareCapitalChart levels={data?.shareCapitalLevels || []} loading={loading} onSelect={setOpenBand} />
        </div>
        <div className="order-3 xl:order-none">
          <MemberAccountsCard registered={stats?.registeredMembers} unregistered={stats?.unregisteredMembers} loading={loading} />
        </div>
        <div className="order-1 xl:order-none">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Quick actions</h2>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 xl:grid-cols-1">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.title} to={action.href} className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:border-green-200 hover:shadow-[var(--shadow-raised)] sm:p-4 xl:flex-row xl:gap-4 xl:text-left">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white group-hover:bg-green-700"><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{action.title}</span>
                    <span className="hidden truncate text-xs text-gray-500 sm:block">{action.text}</span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-gray-400 group-hover:text-green-700 xl:block" />
                </Link>
              );
            })}
          </div>
        </div>
        <div className="order-5 xl:order-none xl:col-span-3">
          <SectionCard title="Recent Activities" description="Latest records across the cooperative" bodyClassName="p-0">
            {loading ? (
              <ListSkeleton rows={4} />
            ) : data?.recentActivities.length ? (
              <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto">
                {data.recentActivities.map((activity) => (
                  <li key={activity.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700 ring-1 ring-green-100"><Activity className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{activity.type}</span>
                        <span className="text-xs text-gray-400">{formatDateTime(activity.at)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-800">{activity.action}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Activity} title="No recent activity" message="New members, loans, payments and sales will appear here." compact />
            )}
          </SectionCard>
        </div>
      </div>

      {openBand && <ShareCapitalMembersModal band={openBand} onClose={() => setOpenBand(null)} />}
      {view === 'capital' && stats && <CapitalBreakdownModal stats={stats} onClose={() => setView(null)} onRecordOther={() => recordOther('capital')} />}
      {view === 'income' && stats && <NetIncomeBreakdownModal stats={stats} onClose={() => setView(null)} onRecordOther={() => recordOther('income')} />}
      {view === 'other' && <OtherIncomeModal onClose={() => setView(otherFrom)} onChanged={loadDashboard} />}
    </div>
  );
}

/** Under a card's total: what it is made of, and that clicking shows the breakdown. */
function BreakdownHint({ children }: { children: ReactNode }) {
  return (
    <span className="block">
      {children}
      <span className="mt-1 flex items-center gap-0.5 font-semibold text-green-700">Click for the breakdown<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
    </span>
  );
}

/** One tile per item that may need the admin, with its count; a tile opens the page where it is handled. */
function AttentionCard({ stats, loading }: { stats?: Stats; loading: boolean }) {
  const toDo = stats ? ATTENTION.filter((item) => item.tone !== 'info').reduce((sum, item) => sum + Number(stats[item.key]), 0) : 0;
  return (
    <SectionCard
      title="Needs your attention"
      description={!stats ? 'Checking loans, requests and stock…' : toDo ? `${toDo.toLocaleString()} ${toDo === 1 ? 'item needs' : 'items need'} action. Click a tile to open it.` : 'Nothing needs action right now.'}
    >
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{ATTENTION.map((item) => <Skeleton key={item.key} className="h-32 w-full rounded-xl" />)}</div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {ATTENTION.map((item) => {
            const count = Number(stats?.[item.key] ?? 0);
            const style = TONE_STYLE[count ? item.tone : 'none'];
            const Icon = count ? item.icon : CheckCircle2;
            return (
              <li key={item.key} className="min-w-0">
                <Link to={item.href} className={`group flex h-full flex-col rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] ${style.box}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold leading-tight">{item.label}</span>
                    <Icon className={`h-4 w-4 shrink-0 ${count ? '' : 'text-green-600'}`} aria-hidden="true" />
                  </span>
                  <span className={`mt-1 text-3xl font-bold leading-none ${style.value}`}>{count.toLocaleString()}</span>
                  <span className="mt-1.5 text-xs leading-snug opacity-80">{item.detail}</span>
                  <span className="mt-auto inline-flex items-center gap-0.5 pt-2 text-xs font-semibold">
                    {count ? item.action : 'All clear'}
                    {count > 0 && <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
