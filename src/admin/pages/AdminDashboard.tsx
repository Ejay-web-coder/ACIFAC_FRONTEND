import { Users, PhilippinePeso, TrendingUp, Store, Tractor, X, AlertCircle, AlertTriangle, Info, CheckCircle2, RefreshCw, Activity, UserPlus, ScanLine, BarChart3, ChevronRight } from 'lucide-react';
import { EmptyState, ListSkeleton, SectionCard, Skeleton, StatCard } from '../../app/components/common/UiKit';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { fetchAdminDashboard, type AdminDashboardData } from '../../app/services/authApi';
import { formatDateTime } from '../../utils/dateTime';
import { useLiveRefresh } from '../../lib/liveUpdates';

type NetIncome = { total: number; parts: AdminDashboardData['stats']['netIncomeBreakdown']; funds: AdminDashboardData['stats']['statutoryFunds'] };

// Where the net income comes from, as shown when the Net Income card is clicked.
const INCOME_SOURCES = [
  { key: 'kadiwa', title: 'Kadiwa Store income', text: 'Net sales: sales less the expenses entered with each sale.', href: '/admin/kadiwa', module: 'Kadiwa Store', icon: Store },
  { key: 'machinery', title: 'Machinery income', text: 'Rental fees of rentals that have started, service fees collected and other income, less machinery expenses.', href: '/admin/machinery', module: 'Machinery Operations', icon: Tractor },
  { key: 'loans', title: 'Loan income', text: 'Interest collected from loan payments. Principal repaid is not income.', href: '/admin/loans', module: 'Loans & Payments', icon: PhilippinePeso },
] as const;

// Shorter names for the narrow card.
const FUND_NAMES: Record<string, string> = { reserve: 'Reserve Fund', education: 'Education & Training', community: 'Community Development', optional: 'Optional Fund' };

type DashboardAlert = { id: string; message: string; type: 'warning' | 'info' | 'success' };
type DashboardActivity = { id: string; type: string; action: string; time: string };

export function AdminDashboard() {
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [totalLoans, setTotalLoans] = useState<number | null>(null);
  const [netIncome, setNetIncome] = useState<NetIncome | null>(null);
  const [showIncome, setShowIncome] = useState(false);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [recentActivities, setRecentActivities] = useState<DashboardActivity[]>([]);
  const [loadError, setLoadError] = useState('');

  // One request returns every figure on this page (previously 9 requests).
  const loadDashboard = useCallback(() => {
    fetchAdminDashboard()
      .then(({ stats, alerts: serverAlerts, recentActivities: activities }) => {
        setTotalMembers(stats.totalMembers);
        setTotalLoans(stats.outstandingLoans);
        setNetIncome({ total: stats.netIncome, parts: stats.netIncomeBreakdown, funds: stats.statutoryFunds });
        setAlerts(serverAlerts);
        setRecentActivities(activities.map((activity) => ({ id: activity.id, type: activity.type, action: activity.action, time: formatDateTime(activity.at) })));
        setLoadError('');
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useLiveRefresh([
    'members', 'loans', 'loan_payments', 'loan_requests', 'rental_requests', 'machinery_operations', 'kadiwa_sales', 'kadiwa_inventory',
    'machinery_services', 'machinery_service_payments', 'machinery_expenses', 'machinery_period_balances',
  ], loadDashboard, 1000);

  const formatCurrency = (value: number | null) => value === null ? '—' : `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loading = totalMembers === null && !loadError;
  // The statutory funds set aside from the net income, under its total.
  const netIncomeFunds = netIncome && (
    <span className="mt-1 grid gap-0.5">
      {netIncome.funds.map((fund) => (
        <span key={fund.key} className="flex justify-between gap-3">
          <span>{FUND_NAMES[fund.key] ?? fund.label} ({fund.percent}%)</span>
          <span className="tabular-nums text-gray-700">{formatCurrency(fund.amount)}</span>
        </span>
      ))}
    </span>
  );
  const dashboardStats = [
    { name: 'Total Members', value: totalMembers === null ? '—' : totalMembers.toLocaleString('en-PH'), icon: Users, href: '/admin/members', detail: 'Registered members', tone: 'dark' as const },
    { name: 'Total Loans', value: formatCurrency(totalLoans), icon: PhilippinePeso, href: '/admin/loans', detail: 'Outstanding balance', tone: 'green' as const },
    { name: 'Net Income', value: formatCurrency(netIncome?.total ?? null), icon: TrendingUp, detail: netIncomeFunds || 'Statutory funds from the net income', tone: 'soft' as const, wide: true, onClick: () => setShowIncome(true) },
  ];

  const quickActions = [
    { title: 'Add Members', text: 'Register member', href: '/admin/members', icon: UserPlus },
    { title: 'Scan Docs', text: 'Use OCR', href: '/admin/ocr', icon: ScanLine },
    { title: 'Reports', text: 'View analytics', href: '/admin/analytics', icon: BarChart3 },
  ];

  const alertStyle = {
    warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle, iconClass: 'text-amber-600' },
    info: { box: 'border-green-200 bg-green-50 text-green-900', icon: Info, iconClass: 'text-green-700' },
    success: { box: 'border-green-200 bg-green-50 text-green-900', icon: CheckCircle2, iconClass: 'text-green-700' },
  } as const;

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
        {dashboardStats.map((stat) => (
          <div key={stat.name} className={'wide' in stat ? 'col-span-2 lg:col-span-1' : undefined}>
            <StatCard label={stat.name} value={stat.value} icon={stat.icon} href={'href' in stat ? stat.href : undefined} onClick={'onClick' in stat ? stat.onClick : undefined} detail={stat.detail} tone={stat.tone} loading={loading} />
          </div>
        ))}
      </div>

      {/* Quick actions: horizontal on phones, sidebar column on desktops */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
        <div className="order-2 space-y-5 lg:order-1 lg:col-span-2">
          <SectionCard title="Alerts & Notifications" description="Items that may need your attention">
            {loading ? (
              <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : alerts.length ? (
              <ul className="space-y-2.5">
                {alerts.map((alert) => {
                  const style = alertStyle[alert.type] ?? alertStyle.info;
                  const Icon = style.icon;
                  return (
                    <li key={alert.id} className={`flex items-start gap-3 rounded-xl border p-3 ${style.box}`}>
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
                      <p className="text-sm">{alert.message}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={CheckCircle2} title="No alerts right now" message="Overdue loans, low stock and other items needing attention will show here." compact />
            )}
          </SectionCard>

          <SectionCard title="Recent Activities" description="Latest records across the cooperative" bodyClassName="p-0">
            {loading ? (
              <ListSkeleton rows={4} />
            ) : recentActivities.length ? (
              <ul className="max-h-[26rem] divide-y divide-gray-100 overflow-y-auto">
                {recentActivities.map((activity) => (
                  <li key={activity.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700 ring-1 ring-green-100"><Activity className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{activity.type}</span>
                        <span className="text-xs text-gray-400">{activity.time}</span>
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

        <div className="order-1 lg:order-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Quick actions</h2>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:grid-cols-1">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.title} to={action.href} className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 text-center shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:border-green-200 hover:shadow-[var(--shadow-raised)] sm:p-4 lg:flex-row lg:gap-4 lg:text-left">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white group-hover:bg-green-700"><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{action.title}</span>
                    <span className="hidden truncate text-xs text-gray-500 sm:block">{action.text}</span>
                  </span>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-gray-400 group-hover:text-green-700 lg:block" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      {showIncome && netIncome && (
        <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="net-income-title" onClick={(event) => { if (event.target === event.currentTarget) setShowIncome(false); }}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <h2 id="net-income-title" className="text-xl font-bold text-gray-900">Net Income</h2>
                <p className="mt-0.5 text-sm text-gray-600">All records to date, by source</p>
              </div>
              <button type="button" onClick={() => setShowIncome(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close net income window"><X className="h-5 w-5" /></button>
            </div>
            <ul className="divide-y divide-gray-100">
              {INCOME_SOURCES.map((source) => {
                const amount = netIncome.parts[source.key];
                const Icon = source.icon;
                return (
                  <li key={source.key} className="flex items-start gap-3 px-5 py-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700 ring-1 ring-green-100"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-semibold text-gray-900">{source.title}</p>
                        <p className={`shrink-0 text-lg font-bold tabular-nums ${amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(amount)}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">{source.text}</p>
                      <Link to={source.href} className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-green-700 hover:underline">Open {source.module}<ChevronRight className="h-3.5 w-3.5" /></Link>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-baseline justify-between gap-3 border-t-2 border-gray-200 bg-gray-50 px-5 py-4">
              <p className="font-bold text-gray-900">Total Net Income</p>
              <p className={`text-2xl font-bold tabular-nums ${netIncome.total < 0 ? 'text-red-600' : 'text-green-800'}`}>{formatCurrency(netIncome.total)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
