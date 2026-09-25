import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { lazy, Suspense } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  PhilippinePeso,
  Tractor,
  Store,
  BarChart3,
  ScanLine,
  Settings as SettingsIcon,
  Bell,
  User,
  X,
  LogOut,
  FileText,
  ArrowRightLeft,
  Menu,
  Wallet,
  ClipboardPlus,
  Megaphone,
  ChevronDown,
  Search,
  BellOff,
  type LucideIcon,
} from 'lucide-react';
import { UserRole } from '../App';
import {
  createAnnouncementRequest, fetchAdminAuditLogs, fetchAnnouncements, fetchNotifications, logoutRequest, markAllNotificationsRead,
  markNotificationRead, type AppNotification, type AuditLogEntry,
} from '../services/authApi';
import { closeLiveUpdates, useLiveRefresh } from '../../lib/liveUpdates';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from './ui/sheet';
import { useIsMobile } from './ui/use-mobile';
import { formatDateTime } from '../../utils/dateTime';
import { EmptyState, ListSkeleton } from './common/UiKit';
import { InstallAppButton } from './common/InstallAppButton';

const AccountManagement = lazy(() => import('../../admin/pages/AccountManagement').then((module) => ({ default: module.AccountManagement })));

interface LayoutProps {
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  setIsAuthenticated: (value: boolean) => void;
}

interface AuditLog {
  id: string;
  user: string;
  action: string;
  resource: string;
  timestamp: string;
  details: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  audience: 'All Members' | 'Admins Only';
  postedAt: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  group: 'Overview' | 'Members' | 'Operations' | 'Finance' | 'System' | 'My Account';
  /** Other routes that render the same page (used for the active state and title). */
  aliases?: string[];
  /** Label used in the phone bottom bar. */
  short?: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin'], group: 'Overview', aliases: ['/admin-dashboard', '/admin/dashboard'], short: 'Home' },
  { name: 'Dashboard', href: '/member-dashboard', icon: LayoutDashboard, roles: ['member'], group: 'Overview', aliases: ['/member/dashboard'], short: 'Home' },
  { name: 'My Profile', href: '/member-profile', icon: User, roles: ['member'], group: 'My Account', aliases: ['/member/profile'], short: 'Profile' },
  { name: 'Loan Status', href: '/loan-status', icon: PhilippinePeso, roles: ['member'], group: 'My Account', aliases: ['/member/loans'], short: 'Loans' },
  { name: 'Transaction', href: '/transaction', icon: ArrowRightLeft, roles: ['member'], group: 'My Account', aliases: ['/member/transactions'], short: 'Activity' },
  { name: 'Rental Booking', href: '/rental-booking', icon: ClipboardPlus, roles: ['member'], group: 'My Account', aliases: ['/member/rental-booking'], short: 'Rentals' },
  { name: 'Associates', href: '/membership', icon: Users, roles: ['admin'], group: 'Members', aliases: ['/admin/members'], short: 'Members' },
  { name: 'Loans & Payments', href: '/loans', icon: PhilippinePeso, roles: ['admin'], group: 'Finance', aliases: ['/admin/loans'], short: 'Loans' },
  { name: 'Savings', href: '/admin/savings', icon: Wallet, roles: ['admin'], group: 'Finance', short: 'Savings' },
  { name: 'Machinery Operations', href: '/machinery', icon: Tractor, roles: ['admin'], group: 'Operations', aliases: ['/admin/machinery'], short: 'Machinery' },
  { name: 'Kadiwa Store', href: '/kadiwa', icon: Store, roles: ['admin'], group: 'Operations', aliases: ['/admin/kadiwa'], short: 'Kadiwa' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, roles: ['admin'], group: 'Overview', aliases: ['/admin/analytics'], short: 'Analytics' },
  { name: 'OCR Scanner', href: '/ocr', icon: ScanLine, roles: ['admin'], group: 'System', aliases: ['/admin/ocr'], short: 'OCR' },
  { name: 'Settings', href: '/settings', icon: SettingsIcon, roles: ['admin', 'member'], group: 'System', aliases: ['/admin/settings', '/member/settings'], short: 'Settings' },
];

// The four destinations that live in the phone bottom bar; everything else is under "More".
const bottomNavHrefs: Record<UserRole, string[]> = {
  admin: ['/dashboard', '/membership', '/loans', '/kadiwa'],
  member: ['/member-dashboard', '/loan-status', '/transaction', '/member-profile'],
};

const groupOrder: NavItem['group'][] = ['Overview', 'My Account', 'Members', 'Finance', 'Operations', 'System'];

const isActive = (item: NavItem, pathname: string) => item.href === pathname || Boolean(item.aliases?.includes(pathname));

export function Layout({ userRole, setUserRole, setIsAuthenticated }: LayoutProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showManageUsersModal, setShowManageUsersModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '', audience: 'All Members' as Announcement['audience'] });
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsSearch, setAuditLogsSearch] = useState('');
  const [auditLogsFilter, setAuditLogsFilter] = useState<string>('all');

  // Notifications and announcements are stored in PostgreSQL and refreshed
  // through live updates, so they are the same on every device.
  const loadNotifications = useCallback(() => {
    fetchNotifications({ limit: 30 })
      .then(({ data, unreadCount: unread }) => {
        setNotifications(data);
        setUnreadCount(unread);
      })
      .catch(() => { /* keep the last loaded list */ });
  }, []);

  const loadAnnouncements = useCallback(() => {
    if (userRole !== 'admin') return;
    fetchAnnouncements()
      .then(({ data }) => setAnnouncements(data.map((announcement) => ({ ...announcement, id: String(announcement.id), postedAt: formatDateTime(announcement.postedAt) }))))
      .catch(() => { /* keep the last loaded list */ });
  }, [userRole]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);
  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);
  useLiveRefresh(['notifications'], loadNotifications);
  useLiveRefresh(['announcements'], loadAnnouncements);

  const visibleNotifications = notifications;

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
      markNotificationRead(notification.id).catch(() => loadNotifications());
    }
    if (notification.link) {
      setShowNotifications(false);
      navigate(notification.link);
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      loadNotifications();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update notifications.');
    }
  };

  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // Close menus on navigation.
  useEffect(() => {
    setSidebarOpen(false);
    setShowNotifications(false);
    setShowProfileMenu(false);
  }, [location.pathname]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setShowNotifications(false);
      }

      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape closes the open dropdown.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setShowNotifications(false);
      setShowProfileMenu(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const filteredNavigation = navigation.filter(item =>
    item.roles.includes(userRole)
  );

  const currentItem = navigation.find((item) => item.roles.includes(userRole) && isActive(item, location.pathname));
  const current = currentItem?.name || 'Dashboard';
  const bottomNav = bottomNavHrefs[userRole].map((href) => filteredNavigation.find((item) => item.href === href)).filter((item): item is NavItem => Boolean(item));
  const moreIsActive = !bottomNav.some((item) => isActive(item, location.pathname));
  const groupedNavigation = groupOrder
    .map((group) => ({ group, items: filteredNavigation.filter((item) => item.group === group) }))
    .filter(({ items }) => items.length > 0);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await logoutRequest();
      toast.success('Logged out successfully');
    } catch {
      toast.error('Unable to contact the server, but this session was cleared locally.');
    } finally {
      closeLiveUpdates();
      setUserRole('member');
      setIsAuthenticated(false);
      setShowProfileMenu(false);
      window.location.replace('/login');
    }
  };

  const handleAnnouncementSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.message.trim()) {
      toast.error('Please complete the announcement title and message');
      return;
    }
    try {
      await createAnnouncementRequest({ title: announcementForm.title.trim(), message: announcementForm.message.trim(), audience: announcementForm.audience });
      setAnnouncementForm({ title: '', message: '', audience: 'All Members' });
      loadAnnouncements();
      toast.success('Announcement posted successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to post announcement.');
    }
  };

  // Filter audit logs based on search and filter
  useEffect(() => {
    if (!showAuditLogs || userRole !== 'admin') return;

    let isMounted = true;
    const loadAuditLogs = async () => {
      setAuditLogsLoading(true);
      try {
        const response = await fetchAdminAuditLogs({ page: 1, limit: 50 });
        if (!isMounted) return;

        const rows = (response.data ?? []).map((row: AuditLogEntry): AuditLog => {
          const userName = row.user_name_snapshot || (row.user_id ? `User #${row.user_id}` : 'System');
          const summary = row.description || `${row.action} on ${row.entity_type || 'record'}`;
          const resource = row.entity_type ? `${row.entity_type} ${row.entity_id ?? ''}`.trim() : row.module;
          return {
            id: String(row.id),
            user: userName,
            action: row.action,
            resource,
            timestamp: row.created_at ? formatDateTime(row.created_at) : 'Unknown',
            details: summary,
          };
        });
        setAuditLogs(rows);
      } catch (error) {
        console.error('Failed to load audit logs:', error);
        setAuditLogs([]);
      } finally {
        if (isMounted) setAuditLogsLoading(false);
      }
    };

    void loadAuditLogs();
    return () => {
      isMounted = false;
    };
  }, [showAuditLogs, userRole]);

  const filteredAuditLogs = auditLogs.filter(log => {
    const matchesSearch =
      log.id.toLowerCase().includes(auditLogsSearch.toLowerCase()) ||
      log.user.toLowerCase().includes(auditLogsSearch.toLowerCase()) ||
      log.resource.toLowerCase().includes(auditLogsSearch.toLowerCase()) ||
      log.details.toLowerCase().includes(auditLogsSearch.toLowerCase());

    const matchesFilter = auditLogsFilter === 'all' || log.action.toUpperCase() === auditLogsFilter.toUpperCase();

    return matchesSearch && matchesFilter;
  });

  const roleLabel = userRole === 'admin' ? 'Administrator' : 'Member';
  const initial = userRole === 'admin' ? 'A' : 'M';

  const brand = (compact = false) => (
    <div className={`flex items-center gap-3 ${compact ? 'justify-center lg:justify-start' : ''}`}>
      <img src="/logo.png" alt="ACIFAC logo" className="h-11 w-11 shrink-0 rounded-full border border-green-100 object-cover" />
      <div className={compact ? 'hidden min-w-0 lg:block' : 'min-w-0'}>
        <p className="truncate text-base font-bold leading-tight text-green-800">ACIFAC</p>
        <p className="truncate text-xs text-gray-500">Management System</p>
      </div>
    </div>
  );

  const navLink = (item: NavItem, variant: 'sidebar' | 'drawer') => {
    const active = isActive(item, location.pathname);
    const Icon = item.icon;
    if (variant === 'sidebar') {
      return (
        <Link
          key={item.href}
          to={item.href}
          title={item.name}
          aria-current={active ? 'page' : undefined}
          className={`group relative flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 py-2 text-sm font-medium lg:justify-start ${active ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-green-50 hover:text-green-800'}`}
        >
          <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-gray-500 group-hover:text-green-700'}`} />
          <span className="hidden truncate lg:inline">{item.name}</span>
          <span className="sr-only lg:hidden">{item.name}</span>
        </Link>
      );
    }
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => setSidebarOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium ${active ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-green-50 active:bg-green-100'}`}
      >
        <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-green-700'}`} />
        <span className="truncate">{item.name}</span>
      </Link>
    );
  };

  const iconButton = 'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-600 hover:bg-green-50 hover:text-green-800 focus-visible:outline-green-600';

  return (
    <div className="min-h-screen bg-white md:flex md:h-screen md:overflow-hidden">
      {/* Sidebar: icon rail on tablets, full sidebar on desktops. Hidden on phones. */}
      {!isMobile && (
        <aside className="hidden h-screen w-[4.75rem] shrink-0 flex-col border-r border-gray-200 bg-white md:flex lg:w-64 xl:w-72" aria-label="Main navigation">
          <div className="flex h-16 items-center border-b border-gray-100 px-3 lg:px-5">{brand(true)}</div>
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 lg:px-4">
            {groupedNavigation.map(({ group, items }) => (
              <div key={group}>
                <p className="mb-1.5 hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 lg:block">{group}</p>
                <div className="space-y-1">{items.map((item) => navLink(item, 'sidebar'))}</div>
              </div>
            ))}
          </nav>
          <div className="border-t border-gray-100 p-3 lg:p-4">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              title="Log out"
              className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 lg:justify-start"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span className="hidden lg:inline">{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
              <span className="sr-only lg:hidden">Log out</span>
            </button>
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4 md:h-16 md:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {isMobile && <img src="/logo.png" alt="" className="h-9 w-9 shrink-0 rounded-full border border-green-100 object-cover" />}
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold leading-tight text-gray-900 min-[400px]:text-lg md:text-xl">{current}</h1>
                <p className="hidden truncate text-xs text-gray-500 sm:block">{userRole === 'admin' ? 'ACIFAC administration' : 'ACIFAC member portal'}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <InstallAppButton />
              {userRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAnnouncements(!showAnnouncements);
                    setShowNotifications(false);
                  }}
                  className={iconButton}
                  aria-label="Announcements"
                  title="Announcements"
                >
                  <Megaphone className="h-5 w-5" />
                  {announcements.length > 0 && <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-bold leading-none text-white">{announcements.length}</span>}
                </button>
              )}

              {/* Notifications */}
              <div ref={notificationsRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setShowNotifications(!showNotifications); setShowProfileMenu(false); }}
                  className={`${iconButton} ${showNotifications ? 'bg-green-50 text-green-800' : ''}`}
                  aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                  aria-expanded={showNotifications}
                  title="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="fixed inset-x-2 top-16 z-50 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-raised)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-13 sm:w-96" role="dialog" aria-label="Notifications">
                    <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                      <h3 className="text-base font-semibold text-gray-900">Notifications</h3>
                      {unreadCount > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">{unreadCount} new</span>}
                      {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50" aria-label="Mark all notifications as read">Mark all read</button>}
                      <button type="button" onClick={() => setShowNotifications(false)} className={`${unreadCount > 0 ? '' : 'ml-auto'} inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600`} aria-label="Close notifications">
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
                      {visibleNotifications.length > 0 ? (
                        <ul className="divide-y divide-gray-100">
                          {visibleNotifications.map((notification) => {
                            const dot = notification.severity === 'error' ? 'bg-red-500' : notification.severity === 'warning' ? 'bg-amber-500' : 'bg-green-500';
                            return (
                              <li key={notification.id}>
                                <div role="button" tabIndex={0} onClick={() => void openNotification(notification)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openNotification(notification); } }} className={`flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50 ${notification.readAt ? '' : 'bg-green-50/50'}`}>
                                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? 'bg-gray-300' : dot}`} aria-hidden="true" />
                                  <div className="min-w-0 flex-1">
                                    <p className={`truncate text-sm ${notification.readAt ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'}`}>{notification.title}</p>
                                    <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{notification.message}</p>
                                    <p className="mt-1 text-xs text-gray-400">{formatDateTime(notification.createdAt)}</p>
                                  </div>
                                  {!notification.readAt && <span className="sr-only">Unread</span>}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <EmptyState icon={BellOff} title="You're all caught up" message="New notifications about loans, payments and announcements will appear here." compact />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Profile menu */}
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifications(false); }}
                  className="flex h-11 items-center gap-2 rounded-xl pl-1 pr-1 hover:bg-green-50 sm:pr-2"
                  aria-label="Profile menu"
                  aria-expanded={showProfileMenu}
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">{initial}</span>
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block text-sm font-semibold text-gray-900">{roleLabel}</span>
                    <span className="block text-xs text-gray-500">Signed in</span>
                  </span>
                  <ChevronDown className={`hidden h-4 w-4 text-gray-400 transition-transform sm:block ${showProfileMenu ? 'rotate-180' : ''}`} />
                </button>

                {showProfileMenu && (
                  <div className="absolute right-0 top-13 z-50 w-60 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-[var(--shadow-raised)]" role="menu">
                    <div className="border-b border-gray-100 px-4 py-3">
                      <p className="text-xs text-gray-500">Logged in as</p>
                      <p className="text-sm font-semibold text-gray-900">{roleLabel}</p>
                    </div>

                    {userRole === 'admin' && (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowAuditLogs(true);
                            setShowProfileMenu(false);
                          }}
                          className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-gray-700 hover:bg-green-50"
                        >
                          <FileText className="h-4 w-4 text-green-700" />
                          Audit Logs
                        </button>

                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowManageUsersModal(true);
                            setShowProfileMenu(false);
                          }}
                          className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-gray-700 hover:bg-green-50"
                        >
                          <Users className="h-4 w-4 text-green-700" />
                          Manage Users
                        </button>
                      </>
                    )}

                    <Link to="/settings" role="menuitem" onClick={() => setShowProfileMenu(false)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-gray-700 hover:bg-green-50">
                      <SettingsIcon className="h-4 w-4 text-green-700" />
                      Settings
                    </Link>

                    <div className="my-1 border-t border-gray-100" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      aria-busy={isLoggingOut}
                      className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <LogOut className="h-4 w-4" />
                      {isLoggingOut ? 'Logging out...' : 'Log out'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="acf-bottom-safe flex-1 bg-gray-50/60 md:min-h-0 md:overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Phone bottom navigation */}
      {isMobile && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Primary">
          <ul className="grid grid-cols-5">
            {bottomNav.map((item) => {
              const active = isActive(item, location.pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link to={item.href} aria-current={active ? 'page' : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-green-700' : 'text-gray-500'}`}>
                    <span className={`inline-flex h-8 w-12 items-center justify-center rounded-full ${active ? 'bg-green-100' : ''}`}><Icon className="h-5 w-5" /></span>
                    <span className="max-w-full truncate px-1">{item.short ?? item.name}</span>
                  </Link>
                </li>
              );
            })}
            <li>
              <button type="button" onClick={() => setSidebarOpen(true)} aria-label="More pages and account options" aria-expanded={sidebarOpen} className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${moreIsActive ? 'text-green-700' : 'text-gray-500'}`}>
                <span className={`inline-flex h-8 w-12 items-center justify-center rounded-full ${moreIsActive ? 'bg-green-100' : ''}`}><Menu className="h-5 w-5" /></span>
                <span className="text-[11px] leading-none">More</span>
              </button>
            </li>
          </ul>
        </nav>
      )}

      {/* Phone navigation drawer: every destination plus account actions */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="flex w-[86vw] max-w-[20rem] flex-col gap-0 p-0">
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <SheetDescription className="sr-only">All ACIFAC pages and account options</SheetDescription>
            <div className="border-b border-gray-100 px-5 py-4">{brand()}</div>
            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="All pages">
              {groupedNavigation.map(({ group, items }) => (
                <div key={group}>
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group}</p>
                  <div className="space-y-1">{items.map((item) => navLink(item, 'drawer'))}</div>
                </div>
              ))}
            </nav>
            <div className="space-y-1 border-t border-gray-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {userRole === 'admin' && (
                <>
                  <button type="button" onClick={() => { setSidebarOpen(false); setShowAuditLogs(true); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-gray-700 hover:bg-green-50">
                    <FileText className="h-5 w-5 text-green-700" />Audit Logs
                  </button>
                  <button type="button" onClick={() => { setSidebarOpen(false); setShowManageUsersModal(true); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-gray-700 hover:bg-green-50">
                    <Users className="h-5 w-5 text-green-700" />Manage Users
                  </button>
                </>
              )}
              <button type="button" onClick={handleLogout} disabled={isLoggingOut} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">
                <LogOut className="h-5 w-5" />{isLoggingOut ? 'Logging out...' : 'Log out'}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {showAnnouncements && userRole === 'admin' && (
        <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-label="Announcements">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-green-50 p-2 ring-1 ring-green-100"><Megaphone className="h-5 w-5 text-green-700" /></div>
                <div><h2 className="text-lg font-bold text-gray-900">Announcements</h2><p className="text-xs text-gray-500">Create and manage posted notices</p></div>
              </div>
              <button type="button" onClick={() => setShowAnnouncements(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close announcements"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <form onSubmit={handleAnnouncementSubmit} className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                <div><h3 className="font-semibold text-gray-900">Create Announcement</h3><p className="mt-1 text-sm text-gray-600">Post a notice for your selected audience.</p></div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">Title<input required value={announcementForm.title} onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm" placeholder="Announcement title" /></label>
                  <label className="text-sm font-medium text-gray-700">Audience<select value={announcementForm.audience} onChange={(event) => setAnnouncementForm({ ...announcementForm, audience: event.target.value as Announcement['audience'] })} className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm"><option>All Members</option><option>Admins Only</option></select></label>
                  <div className="flex items-end"><p className="text-xs text-gray-500">All Members announcements appear in member notifications.</p></div>
                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">Message<textarea required value={announcementForm.message} onChange={(event) => setAnnouncementForm({ ...announcementForm, message: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Write your announcement" /></label>
                </div>
                <div className="flex justify-end"><button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 sm:w-auto"><Megaphone className="h-4 w-4" />Post Announcement</button></div>
              </form>

              <div className="mt-6"><h3 className="mb-3 font-semibold text-gray-900">Posted Announcements</h3>{announcements.length ? <div className="space-y-3">{announcements.map((announcement) => <article key={announcement.id} className="rounded-2xl border border-gray-200 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h4 className="font-semibold text-gray-900">{announcement.title}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{announcement.message}</p></div><span className="w-fit shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-200">{announcement.audience}</span></div><p className="mt-3 text-xs text-gray-500">{announcement.postedAt}</p></article>)}</div> : <div className="rounded-2xl border border-dashed border-gray-300"><EmptyState icon={Megaphone} title="No announcements yet" message="Announcements you post will be listed here." compact /></div>}</div>
            </div>
          </div>
        </div>
      )}

      {/* Audit logs */}
      {showAuditLogs && (
        <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-label="Audit logs">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-green-50 p-2 ring-1 ring-green-100"><FileText className="h-5 w-5 text-green-700" /></div>
                <div><h2 className="text-lg font-bold text-gray-900">Audit Logs</h2><p className="text-xs text-gray-500">{auditLogsLoading ? 'Loading audit logs...' : `Showing ${filteredAuditLogs.length} of ${auditLogs.length} records`}</p></div>
              </div>
              <button type="button" onClick={() => setShowAuditLogs(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close audit logs">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 border-b border-gray-100 bg-gray-50/70 p-3 sm:grid-cols-[1fr_12rem] md:px-6">
              <label className="relative">
                <span className="sr-only">Search audit logs</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by ID, user, resource or details"
                  value={auditLogsSearch}
                  onChange={(e) => setAuditLogsSearch(e.target.value)}
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm"
                />
              </label>
              <label>
                <span className="sr-only">Filter by action</span>
                <select
                  value={auditLogsFilter}
                  onChange={(e) => setAuditLogsFilter(e.target.value)}
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="all">All Actions</option>
                  <option value="CREATE">Create</option>
                  <option value="UPDATE">Update</option>
                  <option value="DELETE">Delete</option>
                  <option value="VIEW">View</option>
                  <option value="EXPORT">Export</option>
                </select>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto">
              {auditLogsLoading ? (
                <ListSkeleton rows={6} />
              ) : filteredAuditLogs.length === 0 ? (
                <EmptyState icon={FileText} title="No audit logs found" message="Try a different search or action filter." />
              ) : (
                <>
                  {/* Phones: one card per log entry */}
                  <ul className="divide-y divide-gray-100 md:hidden">
                    {filteredAuditLogs.map((log) => (
                      <li key={log.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${log.action === 'DELETE' ? 'bg-red-50 text-red-700 ring-red-200' : log.action === 'VIEW' ? 'bg-gray-100 text-gray-700 ring-gray-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>{log.action}</span>
                          <span className="text-xs text-gray-400">#{log.id}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-gray-900">{log.details}</p>
                        <p className="mt-1 text-xs text-gray-500">{log.user} · {log.resource}</p>
                        <p className="text-xs text-gray-400">{log.timestamp}</p>
                      </li>
                    ))}
                  </ul>
                  {/* Tablets and desktops: table */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e4e7e4]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 lg:px-6">ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">User</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Resource</th>
                          <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 lg:table-cell">Timestamp</th>
                          <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 xl:table-cell">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredAuditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-green-50/40">
                            <td className="px-4 py-3 font-mono text-xs text-gray-900 lg:px-6">{log.id}</td>
                            <td className="px-4 py-3 text-gray-600">{log.user}</td>
                            <td className="px-4 py-3">
                              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${log.action === 'DELETE' ? 'bg-red-50 text-red-700 ring-red-200' : log.action === 'VIEW' ? 'bg-gray-100 text-gray-700 ring-gray-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="max-w-[12rem] truncate px-4 py-3 text-gray-600">{log.resource}</td>
                            <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 lg:table-cell">{log.timestamp}</td>
                            <td className="hidden max-w-xs truncate px-4 py-3 text-gray-600 xl:table-cell" title={log.details}>{log.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-100 px-4 py-3 md:px-6">
              <button
                type="button"
                onClick={() => setShowAuditLogs(false)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showManageUsersModal && (
        <div className="acf-modal acf-modal-page fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Manage Users">
          <div className="mx-auto min-h-full max-w-7xl rounded-2xl bg-gray-50 shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-green-50 p-2 ring-1 ring-green-100"><Users className="h-5 w-5 text-green-700" /></div>
                <h2 className="text-lg font-bold text-gray-900">Manage Users</h2>
              </div>
              <button type="button" onClick={() => setShowManageUsersModal(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Close Manage Users">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <Suspense fallback={<ListSkeleton rows={5} />}>
                <AccountManagement />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
