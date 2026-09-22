import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
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
  Eye,
  EyeOff,
  Trash2,
  Menu,
  Wallet,
  ClipboardPlus,
  Megaphone,
} from 'lucide-react';
import { UserRole } from '../App';
import { fetchAdminAuditLogs, fetchAdminLoans, logoutRequest, type AuditLogEntry } from '../services/authApi';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from './ui/sheet';
import { useIsMobile } from './ui/use-mobile';
import { dateOnlyToday, formatDateTime } from '../../utils/dateTime';

const AccountManagement = lazy(() => import('../../admin/pages/AccountManagement').then((module) => ({ default: module.AccountManagement })));

interface LayoutProps {
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  setIsAuthenticated: (value: boolean) => void;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface AuditLog {
  id: string;
  user: string;
  action: string;
  resource: string;
  timestamp: string;
  details: string;
}

interface AuditLogRow {
  id: number;
  user_name_snapshot: string | null;
  user_role_snapshot: string | null;
  action: string;
  module: string;
  entity_type: string | null;
  entity_id: string | number | null;
  description: string;
  status: string;
  created_at: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
}

interface Member {
  id: string;
  memberId: string;
  emailOrNumber: string;
  password: string;
  createdAt: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  audience: 'All Members' | 'Admins Only';
  postedAt: string;
}

const initialAnnouncements: Announcement[] = [
  {
    id: 'ANN-001',
    title: 'Annual General Assembly',
    message: 'The annual general assembly will be held on September 20, 2026.',
    audience: 'All Members',
    postedAt: 'Today, 9:30 AM'
  },
  {
    id: 'ANN-002',
    title: 'Office Schedule',
    message: 'The cooperative office will be closed on September 15 for a holiday.',
    audience: 'All Members',
    postedAt: 'Yesterday, 2:15 PM'
  }
];

const announcementsStorageKey = 'acifac-announcements';

const adminNotifications: Notification[] = [
  {
    id: '1',
    title: 'Loan Application Received',
    message: 'Juan Dela Cruz has submitted a new loan application for ₱50,000',
    timestamp: '5 minutes ago',
    type: 'info'
  },
  {
    id: '2',
    title: 'Payment Received',
    message: 'Maria Santos has paid ₱5,000 for loan installment',
    timestamp: '1 hour ago',
    type: 'success'
  },
  {
    id: '3',
    title: 'Loan Approved',
    message: 'Pedro Reyes\'s loan application for ₱30,000 has been approved',
    timestamp: '2 hours ago',
    type: 'success'
  },
  {
    id: '4',
    title: 'Payment Reminder',
    message: 'Rosa Santos has an upcoming loan payment due in 3 days',
    timestamp: '3 hours ago',
    type: 'warning'
  },
];

const memberNotifications: Notification[] = [
  {
    id: '1',
    title: 'Loan Approved',
    message: 'Your loan application for ₱30,000 has been approved',
    timestamp: '2 hours ago',
    type: 'success'
  },
  {
    id: '2',
    title: 'Payment Reminder',
    message: 'Your loan payment is due in 3 days',
    timestamp: '3 hours ago',
    type: 'warning'
  },
  {
    id: '3',
    title: 'Payment Received',
    message: 'Your payment of ₱5,000 has been received successfully',
    timestamp: '5 hours ago',
    type: 'success'
  },
];

const mockMembers: Member[] = [
  {
    id: '1',
    memberId: 'MEM-001',
    emailOrNumber: 'juan@example.com',
    password: 'pass123456',
    createdAt: '2026-04-01'
  },
  {
    id: '2',
    memberId: 'MEM-002',
    emailOrNumber: '09123456789',
    password: 'secure789',
    createdAt: '2026-04-05'
  },
  {
    id: '3',
    memberId: 'MEM-003',
    emailOrNumber: 'maria@example.com',
    password: 'pass456abc',
    createdAt: '2026-04-10'
  },
];

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { name: 'Dashboard', href: '/member-dashboard', icon: LayoutDashboard, roles: ['member'] },
  { name: 'My Profile', href: '/member-profile', icon: User, roles: ['member'] },
  { name: 'Loan Status', href: '/loan-status', icon: PhilippinePeso, roles: ['member'] },
  { name: 'Transaction', href: '/transaction', icon: ArrowRightLeft, roles: ['member'] },
    { name: 'Rental Booking', href: '/rental-booking', icon: ClipboardPlus, roles: ['member'] },
  { name: 'Associates', href: '/membership', icon: Users, roles: ['admin'] },
  { name: 'Loans & Payments', href: '/loans', icon: PhilippinePeso, roles: ['admin'] },
  { name: 'Machinery Operations', href: '/machinery', icon: Tractor, roles: ['admin'] },
  { name: 'Kadiwa Store', href: '/kadiwa', icon: Store, roles: ['admin'] },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, roles: ['admin'] },
  { name: 'OCR Scanner', href: '/ocr', icon: ScanLine, roles: ['admin'] },
  { name: 'Total Savings', href: '/admin/savings', icon: Wallet, roles: ['admin'] },
  { name: 'Settings', href: '/settings', icon: SettingsIcon, roles: ['admin', 'member'] },
];

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
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    const storedAnnouncements = localStorage.getItem(announcementsStorageKey);

    if (!storedAnnouncements) return initialAnnouncements;

    try {
      const parsedAnnouncements = JSON.parse(storedAnnouncements) as Announcement[];
      return Array.isArray(parsedAnnouncements) ? parsedAnnouncements : initialAnnouncements;
    } catch {
      return initialAnnouncements;
    }
  });
  const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '', audience: 'All Members' as Announcement['audience'] });
  const [notifications, setNotifications] = useState<Notification[]>(
    userRole === 'admin' ? adminNotifications : memberNotifications
  );
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [showCreateMemberModal, setShowCreateMemberModal] = useState(false);
  const [members, setMembers] = useState<Member[]>(mockMembers);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [memberFormData, setMemberFormData] = useState({
    memberId: '',
    emailOrNumber: '',
    password: '',
    confirmPassword: ''
  });
  const [auditLogsSearch, setAuditLogsSearch] = useState('');
  const [auditLogsFilter, setAuditLogsFilter] = useState<string>('all');
  const [managedUsersSearch, setManagedUsersSearch] = useState('');

  useEffect(() => {
    if (userRole !== 'admin') return;

    fetchAdminLoans()
      .then(({ loans }) => {
        const todayKey = dateOnlyToday();
        const dueTodayNotifications: Notification[] = loans
          .filter((loan) =>
            (loan.status === 'active' || loan.status === 'overdue') &&
            loan.balance > 0 &&
            loan.dueDate.slice(0, 10) === todayKey
          )
          .map((loan) => ({
            id: `loan-due-today-${loan.databaseId}`,
            title: 'Loan payment due today',
            message: `${loan.memberName}'s loan ${loan.id} is due for payment today.`,
            timestamp: 'Today',
            type: 'warning' as const,
          }));

        setNotifications((current) => [
          ...dueTodayNotifications,
          ...current.filter((notification) => !notification.id.startsWith('loan-due-today-')),
        ]);
      })
      .catch(() => {
        // Keep the existing notifications visible when loan data is unavailable.
      });
  }, [userRole]);

  const visibleNotifications = userRole === 'member'
    ? [
        ...announcements
          .filter((announcement) => announcement.audience === 'All Members')
          .map((announcement) => ({
            id: `announcement-${announcement.id}`,
            title: announcement.title,
            message: announcement.message,
            timestamp: announcement.postedAt,
            type: 'info' as const,
          })),
        ...notifications,
      ]
    : notifications;

  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    localStorage.setItem(announcementsStorageKey, JSON.stringify(announcements));
  }, [announcements]);

  useEffect(() => {
    const handleAnnouncementsUpdated = (event: StorageEvent) => {
      if (event.key !== announcementsStorageKey || !event.newValue) return;

      try {
        const updatedAnnouncements = JSON.parse(event.newValue) as Announcement[];
        if (Array.isArray(updatedAnnouncements)) setAnnouncements(updatedAnnouncements);
      } catch {
      }
    };

    window.addEventListener('storage', handleAnnouncementsUpdated);
    return () => window.removeEventListener('storage', handleAnnouncementsUpdated);
  }, []);

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

  const filteredNavigation = navigation.filter(item =>
    item.roles.includes(userRole)
  );

  const current = navigation.find((n) => n.href === location.pathname)?.name || 'Dashboard';

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await logoutRequest();
      toast.success('Logged out successfully');
    } catch {
      toast.error('Unable to contact the server, but this session was cleared locally.');
    } finally {
      setUserRole('member');
      setIsAuthenticated(false);
      localStorage.removeItem('acifac-user-role');
      localStorage.removeItem('acifac-is-authenticated');
      setShowProfileMenu(false);
      window.location.replace('/login');
    }
  };

  const handleAnnouncementSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.message.trim()) {
      toast.error('Please complete the announcement title and message');
      return;
    }
    setAnnouncements((current) => [{
      id: `ANN-${Date.now()}`,
      title: announcementForm.title.trim(),
      message: announcementForm.message.trim(),
      audience: announcementForm.audience,
      postedAt: formatDateTime(new Date())
    }, ...current]);
    setAnnouncementForm({ title: '', message: '', audience: 'All Members' });
    toast.success('Announcement posted successfully');
  };

  const handleMemberFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMemberFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (memberFormData.password !== memberFormData.confirmPassword) {
      alert('Passwords do not match!');
      return;
    }
    if (!memberFormData.memberId || !memberFormData.emailOrNumber || !memberFormData.password) {
      alert('Please fill in all fields!');
      return;
    }
    // Add new member to the list
    const newMember: Member = {
      id: Date.now().toString(),
      memberId: memberFormData.memberId,
      emailOrNumber: memberFormData.emailOrNumber,
      password: memberFormData.password,
      createdAt: dateOnlyToday()
    };
    setMembers([...members, newMember]);
    alert(`Member account created successfully for Member ID: ${memberFormData.memberId}!`);
    setMemberFormData({
      memberId: '',
      emailOrNumber: '',
      password: '',
      confirmPassword: ''
    });
  };

  const handleDeleteMember = (memberId: string) => {
    if (confirm(`Are you sure you want to delete member ${memberId}?`)) {
      setMembers(members.filter(m => m.id !== memberId));
      alert(`Member ${memberId} has been deleted`);
    }
  };

  const togglePasswordVisibility = (memberId: string) => {
    const newSet = new Set(visiblePasswords);
    if (newSet.has(memberId)) {
      newSet.delete(memberId);
    } else {
      newSet.add(memberId);
    }
    setVisiblePasswords(newSet);
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
            timestamp: row.created_at ? new Date(row.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown',
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

  // Filter members based on search
  const filteredMembers = members.filter(member => 
    member.memberId.toLowerCase().includes(managedUsersSearch.toLowerCase()) ||
    member.emailOrNumber.toLowerCase().includes(managedUsersSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 md:flex md:h-screen md:overflow-hidden">
      {/* Sidebar - Hidden on Mobile, Shown on Desktop */}
      {!isMobile && (
        <aside className="hidden h-screen w-64 shrink-0 rounded-r-lg border-r border-gray-200 bg-white p-4 shadow-sm md:block lg:w-72 lg:p-6">
          <div className="mb-6 flex items-center gap-3">
            <img src="/logo.png" alt="ACIFAC Logo" className="h-16 w-16 rounded-full border object-cover lg:h-20 lg:w-20" />
            <div>
              <h3 className="text-lg font-bold">ACIFAC</h3>
              <p className="text-xs text-gray-500">Management System</p>
            </div>
          </div>

          <nav className="space-y-1">
            {filteredNavigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${location.pathname === item.href ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            ))}
          </nav>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar - Responsive */}
        <div className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
          <div className="px-3 py-3 sm:px-4 md:px-8 md:py-6">
            <div className="flex items-center justify-between gap-2 md:gap-4">
              {isMobile ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                    <SheetTrigger asChild>
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white shadow-sm transition-colors hover:bg-green-700"
                        aria-label="Open navigation"
                      >
                        <Menu className="h-5 w-5" />
                      </button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[85vw] max-w-[18rem] p-0">
                      <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                      <SheetDescription className="sr-only">Browse main navigation options</SheetDescription>
                      <div className="p-6">
                        <div className="mb-6 flex items-center gap-3">
                          <img src="/logo.png" alt="ACIFAC Logo" className="h-16 w-16 rounded-full border object-cover" />
                          <div>
                            <h3 className="text-lg font-bold">ACIFAC</h3>
                            <p className="text-xs text-gray-500">Management System</p>
                          </div>
                        </div>

                        <nav className="space-y-1">
                          {filteredNavigation.map((item) => (
                            <Link
                              key={item.name}
                              to={item.href}
                              onClick={() => setSidebarOpen(false)}
                              className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${location.pathname === item.href ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                              <item.icon className="h-5 w-5 flex-shrink-0" />
                              <span>{item.name}</span>
                            </Link>
                          ))}
                        </nav>
                      </div>
                    </SheetContent>
                  </Sheet>

                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg font-bold text-gray-900 sm:text-xl">{current}</h1>
                  </div>
                </div>
              ) : (
                <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-gray-900 md:text-3xl">{current}</h1>
              )}

              <div className="flex shrink-0 items-center gap-2 md:gap-4">
                {userRole === 'admin' && (
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowAnnouncements(!showAnnouncements);
                        setShowNotifications(false);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500/50 md:h-11 md:w-11"
                      aria-label="Announcements"
                      title="Announcements"
                    >
                      <Megaphone className="h-5 w-5" />
                      {announcements.length > 0 && <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-bold leading-none text-white">{announcements.length}</span>}
                    </button>
                  </div>
                )}
                {/* Notifications Button */}
                <div ref={notificationsRef} className="relative">
                  <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500/50 md:h-11 md:w-11"
                    aria-label="Notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {visibleNotifications.length > 0 && (
                      <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                        {visibleNotifications.length}
                      </span>
                    )}
                  </button>
                  
                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className="absolute right-0 top-12 z-50 w-[calc(100vw-1.5rem)] max-w-sm rounded-lg border border-gray-200 bg-white shadow-lg sm:w-80">
                      <div className="border-b border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-bold text-gray-900">Notifications</h3>
                          <button
                            onClick={() => setShowNotifications(false)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="max-h-96 overflow-y-auto">
                        {visibleNotifications.length > 0 ? (
                          <div className="divide-y divide-gray-200">
                            {visibleNotifications.map((notification) => (
                              <div key={notification.id} className={`border-l-4 p-4 transition-colors hover:bg-gray-50 ${
                                notification.type === 'success' ? 'border-l-green-500' :
                                notification.type === 'error' ? 'border-l-red-500' :
                                notification.type === 'warning' ? 'border-l-yellow-500' :
                                'border-l-blue-500'
                              }`}>
                                <div className="flex items-start gap-3">
                                  <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                                    notification.type === 'success' ? 'bg-green-500' :
                                    notification.type === 'error' ? 'bg-red-500' :
                                    notification.type === 'warning' ? 'bg-yellow-500' :
                                    'bg-blue-500'
                                  }`}></div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="truncate text-sm font-semibold text-gray-900">{notification.title}</h4>
                                    <p className="mt-1 text-sm text-gray-600 line-clamp-2">{notification.message}</p>
                                    <p className="mt-2 text-xs text-gray-500">{notification.timestamp}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center">
                            <p className="text-gray-500">No notifications yet</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Profile Menu */}
                <div ref={profileMenuRef} className="relative flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 md:gap-2 md:px-3">
                  <button
                    type="button"
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="flex items-center gap-2 py-1 text-sm hover:opacity-70"
                    aria-label="Profile menu"
                  >
                    <User className="h-5 w-5 flex-shrink-0 text-gray-600" />
                    <span className="hidden text-gray-700 capitalize truncate sm:inline">{userRole}</span>
                  </button>

                  {/* Profile Menu Dropdown */}
                  {showProfileMenu && (
                    <div className="absolute right-0 top-12 z-50 w-[calc(100vw-1.5rem)] max-w-[14rem] rounded-lg border border-gray-200 bg-white shadow-lg sm:w-56">
                      <div className="border-b border-gray-200 p-3">
                        <p className="text-xs text-gray-500">Logged in as</p>
                        <p className="text-sm font-semibold capitalize text-gray-900">{userRole}</p>
                      </div>
                      
                      {userRole === 'admin' && (
                        <>
                          <button
                            onClick={() => {
                              setShowAuditLogs(true);
                              setShowProfileMenu(false);
                            }}
                            className="flex w-full items-center gap-2 border-b border-gray-200 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <FileText className="h-4 w-4" />
                            Audit Logs
                          </button>
                          
                          <button
                            onClick={() => {
                              setShowManageUsersModal(true);
                              setShowProfileMenu(false);
                            }}
                            className="flex w-full items-center gap-2 border-b border-gray-200 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Users className="h-4 w-4" />
                            Manage Users
                          </button>
                        </>
                      )}
                      
                      <button
                        type="button"
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        aria-busy={isLoggingOut}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" />
                        {isLoggingOut ? 'Logging out...' : 'Logout'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area - Responsive Padding */}
        <main className="flex-1 px-3 py-4 sm:px-4 md:min-h-0 md:overflow-y-auto md:px-8 md:py-8">
          <div className="min-h-full"> 
            <Outlet />
          </div>
        </main>
      </div>

      {showAnnouncements && userRole === 'admin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 md:px-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-50 p-2"><Megaphone className="h-5 w-5 text-green-600" /></div>
                <div><h2 className="text-lg font-bold text-gray-900">Announcements</h2><p className="text-xs text-gray-500">Create and manage posted notices</p></div>
              </div>
              <button type="button" onClick={() => setShowAnnouncements(false)} className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close announcements"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <form onSubmit={handleAnnouncementSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div><h3 className="font-semibold text-gray-900">Create Announcement</h3><p className="mt-1 text-sm text-gray-600">Post a notice for your selected audience.</p></div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">Title<input required value={announcementForm.title} onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })} className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Announcement title" /></label>
                  <label className="text-sm font-medium text-gray-700">Audience<select value={announcementForm.audience} onChange={(event) => setAnnouncementForm({ ...announcementForm, audience: event.target.value as Announcement['audience'] })} className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"><option>All Members</option><option>Admins Only</option></select></label>
                  <div className="flex items-end"><p className="text-xs text-gray-500">All Members announcements appear in member notifications.</p></div>
                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">Message<textarea required value={announcementForm.message} onChange={(event) => setAnnouncementForm({ ...announcementForm, message: event.target.value })} className="mt-2 min-h-24 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Write your announcement" /></label>
                </div>
                <div className="flex justify-end"><button type="submit" className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"><Megaphone className="h-4 w-4" />Post Announcement</button></div>
              </form>

              <div className="mt-6"><h3 className="mb-3 font-semibold text-gray-900">Posted Announcements</h3>{announcements.length ? <div className="space-y-3">{announcements.map((announcement) => <article key={announcement.id} className="rounded-lg border border-gray-200 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h4 className="font-semibold text-gray-900">{announcement.title}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{announcement.message}</p></div><span className="w-fit shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{announcement.audience}</span></div><p className="mt-3 text-xs text-gray-500">{announcement.postedAt}</p></article>)}</div> : <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No announcements posted yet.</div>}</div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Modal - Responsive */}
      {showAuditLogs && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg md:text-xl font-bold text-gray-900">Audit Logs</h2>
              <button
                onClick={() => setShowAuditLogs(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              <div className="p-3 md:p-4 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Search by ID, User, Resource or Details..."
                      value={auditLogsSearch}
                      onChange={(e) => setAuditLogsSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                    />
                  </div>
                  <div>
                    <select
                      value={auditLogsFilter}
                      onChange={(e) => setAuditLogsFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                    >
                      <option value="all">All Actions</option>
                      <option value="CREATE">Create</option>
                      <option value="UPDATE">Update</option>
                      <option value="DELETE">Delete</option>
                      <option value="VIEW">View</option>
                      <option value="EXPORT">Export</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-2">{auditLogsLoading ? 'Loading audit logs...' : `Showing ${filteredAuditLogs.length} of ${auditLogs.length} records`}</p>
              </div>

              <div className="overflow-x-auto">
                {auditLogsLoading ? (
                  <div className="flex min-h-40 items-center justify-center text-sm text-gray-500">Loading audit log activity...</div>
                ) : (
                <table className="w-full min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-14 z-10">
                    <tr>
                      <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">User</th>
                      <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Resource</th>
                      <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Timestamp</th>
                      <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredAuditLogs.length > 0 ? (
                      filteredAuditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-3 md:px-6 py-3 text-xs md:text-sm text-gray-900 font-mono">{log.id}</td>
                          <td className="px-3 md:px-6 py-3 text-xs md:text-sm text-gray-600 hidden sm:table-cell">{log.user}</td>
                          <td className="px-3 md:px-6 py-3 text-xs md:text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                              log.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                              log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                              log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                              log.action === 'VIEW' ? 'bg-gray-100 text-gray-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-3 md:px-6 py-3 text-xs md:text-sm text-gray-600 hidden md:table-cell truncate">{log.resource}</td>
                          <td className="px-3 md:px-6 py-3 text-xs md:text-sm text-gray-500 hidden lg:table-cell whitespace-nowrap">{log.timestamp}</td>
                          <td className="px-3 md:px-6 py-3 text-xs md:text-sm text-gray-600 hidden xl:table-cell truncate">{log.details}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 md:px-6 py-8 text-center text-gray-500">
                          No audit logs found matching your search
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                )}
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 px-4 md:px-6 py-4">
              <button
                onClick={() => setShowAuditLogs(false)}
                className="px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showManageUsersModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Manage Users">
          <div className="mx-auto min-h-full max-w-7xl rounded-lg bg-gray-50 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
              <h2 className="text-lg font-bold text-gray-900">Manage Users</h2>
              <button type="button" onClick={() => setShowManageUsersModal(false)} className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Close Manage Users">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <Suspense fallback={<div className="py-12 text-center text-sm text-gray-500">Loading account management...</div>}>
                <AccountManagement />
              </Suspense>
            </div>
          </div>
        </div>
      )}

                    <div>
      </div>
    </div>
  );
}
