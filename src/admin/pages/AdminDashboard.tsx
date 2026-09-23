import { Users, PhilippinePeso, Tractor, Store, TrendingUp, AlertCircle } from 'lucide-react';
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

  const dashboardStats = [
    {
      name: 'Total Members',
      value: totalMembers === null ? '—' : String(totalMembers),
      change: '',
      changeType: 'increase',
      icon: Users,
      href: '/admin/members',
      color: 'green',
      borderColor: 'border-l-4 border-l-green-500'
    },
    { ...stats[0], value: formatCurrency(totalLoans) },
    { ...stats[1], value: machineryOperations === null ? '—' : String(machineryOperations) },
    { ...stats[2], value: formatCurrency(kadiwaRevenue) },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {loadError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Unable to load dashboard data: {loadError}</p>}
      {/* Stats Grid - Responsive */}
      <div className="grid w-full grid-cols-1 gap-3 min-w-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {dashboardStats.map((stat) => {
          const colorClasses = {
            blue: 'bg-blue-50 text-blue-600',
            green: 'bg-green-50 text-green-600',
            orange: 'bg-orange-50 text-orange-600',
            purple: 'bg-purple-50 text-purple-600',
          }[stat.color];

          const Icon = stat.icon;

          return (
            <Link
              key={stat.name}
              to={stat.href}
              aria-label={`Open ${stat.name}`}
              className={`w-full min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:p-5 ${stat.borderColor}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className={`p-3 rounded-lg flex-shrink-0 ${colorClasses}`}>
                  <Icon className="w-5 md:w-6 h-5 md:h-6" />
                </div>
                {stat.change && (
                  <div className="flex items-center gap-1 text-green-600 flex-shrink-0">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs md:text-sm font-medium">{stat.change}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 md:mt-4">
                <p className="text-xs md:text-sm text-gray-600">{stat.name}</p>
                <p className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Alerts and Recent Activities Section - Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Alerts & Activities Card */}
        <div className="lg:col-span-2 bg-white rounded-lg p-4 md:p-6 shadow-sm border border-gray-200">
          {/* Alerts */}
          <div>
            <h2 className="text-base md:text-lg font-bold text-gray-900 mb-3 md:mb-4">Alerts & Notifications</h2>
            <div className="space-y-2 md:space-y-3">
              {alerts.map((alert) => {
                const typeColors = {
                  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
                  info: 'bg-blue-50 border-blue-200 text-blue-800',
                  success: 'bg-green-50 border-green-200 text-green-800',
                }[alert.type];

                return (
                  <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${typeColors}`}>
                    <AlertCircle className="w-4 md:w-5 h-4 md:h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-xs md:text-sm">{alert.message}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Activities */}
          <div className="mt-5 md:mt-6 border-t pt-4 md:pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activities</h3>
            <div className="space-y-3 md:space-y-4 max-h-64 overflow-y-auto">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start justify-between gap-3 pb-3 md:pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded mb-1 md:mb-2">
                      {activity.type}
                    </span>
                    <p className="text-xs md:text-sm text-gray-900 line-clamp-2">{activity.action}</p>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0 ml-2">{activity.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions - Responsive Stack */}
        <div className="flex min-w-0 flex-col gap-3 md:flex-col lg:gap-4">
          <Link to="/admin/members" className="min-w-0 w-full rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:p-6">
            <Users className="mx-auto mb-2 h-7 w-7 text-blue-600 md:mb-3 md:h-8 md:w-8" />
            <h3 className="text-sm font-bold text-gray-900 md:text-base">Add Members</h3>
            <p className="mt-1 text-xs text-gray-600 md:text-sm">Register member</p>
          </Link>
          <Link to="/admin/ocr" className="min-w-0 w-full rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:p-6">
            <TrendingUp className="mx-auto mb-2 h-7 w-7 text-green-600 md:mb-3 md:h-8 md:w-8" />
            <h3 className="text-sm font-bold text-gray-900 md:text-base">Scan Docs</h3>
            <p className="mt-1 text-xs text-gray-600 md:text-sm">Use OCR</p>
          </Link>
          <Link to="/admin/analytics" className="min-w-0 w-full rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 md:p-6">
            <TrendingUp className="mx-auto mb-2 h-7 w-7 text-purple-600 md:mb-3 md:h-8 md:w-8" />
            <h3 className="text-sm font-bold text-gray-900 md:text-base">Reports</h3>
            <p className="mt-1 text-xs text-gray-600 md:text-sm">View analytics</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
