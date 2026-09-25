import { Users, PhilippinePeso, Tractor, Store, AlertCircle, AlertTriangle, Info, CheckCircle2, RefreshCw, Activity, UserPlus, ScanLine, BarChart3, ChevronRight } from 'lucide-react';
import { EmptyState, ListSkeleton, SectionCard, Skeleton, StatCard } from '../../app/components/common/UiKit';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { fetchAdminDashboard } from '../../app/services/authApi';
import { formatDateTime } from '../../utils/dateTime';
import { useLiveRefresh } from '../../lib/liveUpdates';

const stats = [
  {
    name: 'Total Loans',
    
    changeType: 'increase',
    icon: PhilippinePeso,
    href: '/admin/loans',
    color: 'orange',
    borderColor: 'border-l-4 border-l-orange-500'
  },
  {
    name: 'Machinery Operations',
    
    changeType: 'increase',
    icon: Tractor,
    href: '/admin/machinery',
    color: 'blue',
    borderColor: 'border-l-4 border-l-blue-500'
  },
  {
    name: 'Kadiwa Revenues',
    
    changeType: 'increase',
    icon: Store,
    href: '/admin/kadiwa',
    color: 'purple',
    borderColor: 'border-l-4 border-l-purple-500'
  },
];

type DashboardAlert = { id: string; message: string; type: 'warning' | 'info' | 'success' };
type DashboardActivity = { id: string; type: string; action: string; time: string };

export function AdminDashboard() {
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [totalLoans, setTotalLoans] = useState<number | null>(null);
  const [machineryOperations, setMachineryOperations] = useState<number | null>(null);
  const [kadiwaRevenue, setKadiwaRevenue] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [recentActivities, setRecentActivities] = useState<DashboardActivity[]>([]);
  const [loadError, setLoadError] = useState('');

  // One request returns every figure on this page (previously 9 requests).
  const loadDashboard = useCallback(() => {
    fetchAdminDashboard()
      .then(({ stats, alerts: serverAlerts, recentActivities: activities }) => {
        setTotalMembers(stats.totalMembers);
        setTotalLoans(stats.outstandingLoans);
        setMachineryOperations(stats.machineryOperations);
        setKadiwaRevenue(stats.kadiwaRevenue);
        setAlerts(serverAlerts);
        setRecentActivities(activities.map((activity) => ({ id: activity.id, type: activity.type, action: activity.action, time: formatDateTime(activity.at) })));
        setLoadError('');
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useLiveRefresh(['members', 'loans', 'loan_payments', 'loan_requests', 'rental_requests', 'machinery_operations', 'kadiwa_sales', 'kadiwa_inventory'], loadDashboard, 1000);

  const formatCurrency = (value: number | null) => value === null ? '—' : `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loading = totalMembers === null && !loadError;
  const dashboardStats = [
    { name: 'Total Members', value: totalMembers === null ? '—' : totalMembers.toLocaleString('en-PH'), icon: Users, href: '/admin/members', detail: 'Registered associates', tone: 'dark' as const },
    { name: stats[0].name, value: formatCurrency(totalLoans), icon: stats[0].icon, href: stats[0].href, detail: 'Outstanding balance', tone: 'green' as const },
    { name: stats[1].name, value: machineryOperations === null ? '—' : machineryOperations.toLocaleString('en-PH'), icon: stats[1].icon, href: stats[1].href, detail: 'Recorded operations', tone: 'soft' as const },
    { name: stats[2].name, value: formatCurrency(kadiwaRevenue), icon: stats[2].icon, href: stats[2].href, detail: 'Store revenue', tone: 'green' as const },
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

      {/* Key figures: 1 column on small phones, 2 on large phones/tablets, 4 on desktops */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {dashboardStats.map((stat) => (
          <StatCard key={stat.name} label={stat.name} value={stat.value} icon={stat.icon} href={stat.href} detail={stat.detail} tone={stat.tone} loading={loading} />
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
    </div>
  );
}
