import { useCallback, useEffect, useState } from 'react';
import { User, Bell, Shield, Database, Save } from 'lucide-react';
import { UserRole } from '../../app/App';
import { toast } from 'sonner';
import {
  fetchCurrentUser, updateNotificationPreferencesRequest, checkAdminContact, updateProfileRequest, type AuthUser,
} from '../../app/services/authApi';
import { ChangePasswordModal } from '../../app/components/ChangePasswordModal';
import { formatDateTime } from '../../utils/dateTime';
import { ProfilePhotoEditor } from '../../app/components/common/ProfilePhotoEditor';

interface SettingsProps {
  userRole: UserRole;
  mustChangePassword?: boolean;
}

export function Settings({ userRole, mustChangePassword = false }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'system'>(mustChangePassword ? 'security' : 'profile');
  const [account, setAccount] = useState<AuthUser | null>(null);
  const [profileData, setProfileData] = useState({ name: '', email: '', phone: '', position: '' });
  // The cooperative's positions, suggested for the Position field.
  const [positions, setPositions] = useState<string[]>([]);
  useEffect(() => { checkAdminContact({}).then((result) => setPositions(result.positions)).catch(() => undefined); }, []);
  const [notificationSettings, setNotificationSettings] = useState({ emailNotifications: true, smsNotifications: true, loanReminders: true });
  // A temporary password opens the change straight away.
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(mustChangePassword);

  const loadAccount = useCallback(() => {
    fetchCurrentUser()
      .then(({ user }) => {
        if (!user) return;
        setAccount(user);
        setProfileData({ name: user.display_name || '', email: user.email || '', phone: user.phone || '', position: user.position || '' });
        if (user.notification_preferences) setNotificationSettings(user.notification_preferences);
      })
      .catch((error: Error) => toast.error('Unable to load your profile', { description: error.message }));
  }, []);

  useEffect(() => { loadAccount(); }, [loadAccount]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfileRequest(profileData);
      toast.success('Profile updated successfully!');
      loadAccount();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update profile.');
    }
  };

  const handleSaveNotifications = async () => {
    try {
      await updateNotificationPreferencesRequest(notificationSettings);
      toast.success('Notification settings saved!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save notification settings.');
    }
  };

  const handleBackup = () => {
    toast.info('Backups are managed by Supabase', {
      description: 'The database is backed up automatically by the Supabase project (see Supabase dashboard → Database → Backups). This app does not create backup files.'
    });
  };

  // Only show admin settings
  if (userRole !== 'admin') {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        
        <p className="text-gray-600 mt-1">Manage your account and system preferences</p>
        {mustChangePassword && <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">You are using a temporary password. Change it under Security to continue using the system.</p>}
      </div>

      {/* Settings Container */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] border border-gray-200">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'profile'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <User className="w-5 h-5" />
              Profile
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'notifications'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Bell className="w-5 h-5" />
              Notifications
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'security'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Shield className="w-5 h-5" />
              Security
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'system'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Database className="w-5 h-5" />
              System
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <ProfilePhotoEditor visibilityNote="Shown in your top bar. Members never see administrator pictures." />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Profile Information</h2>
                <p className="mb-4 mt-1 text-sm text-gray-600">Your full name and position are shown with everything you do in the audit log, so both are required.</p>
                {!profileData.position.trim() && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Enter your position in the cooperative (for example Treasurer or Secretary) and save.</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Full Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Position <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      list="admin-positions"
                      placeholder="e.g. Treasurer"
                      value={profileData.position}
                      onChange={(e) => setProfileData({ ...profileData, position: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <datalist id="admin-positions">{positions.map((position) => <option key={position} value={position} />)}</datalist>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium"
                >
                  <Save className="w-5 h-5" />
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4">Notification Preferences</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Email Notifications</p>
                      <p className="text-sm text-gray-600">Receive updates via email</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.emailNotifications}
                        onChange={(e) => setNotificationSettings({ ...notificationSettings, emailNotifications: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">SMS Notifications</p>
                      <p className="text-sm text-gray-600">Loan payment reminders by text message to your mobile number.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.smsNotifications}
                        onChange={(e) => setNotificationSettings({ ...notificationSettings, smsNotifications: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Loan Payment Reminders</p>
                      <p className="text-sm text-gray-600">Get notified about upcoming loan payments</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.loanReminders}
                        onChange={(e) => setNotificationSettings({ ...notificationSettings, loanReminders: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSaveNotifications}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium"
                >
                  <Save className="w-5 h-5" />
                  Save Preferences
                </button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4">Security Settings</h2>
                <div className="space-y-4">
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Change Password</h3>
                    <p className="text-sm text-gray-600 mb-4">Update your password with a 6-digit code sent to your email or mobile number, or with your current password</p>
                    <button type="button" onClick={() => setShowChangePasswordModal(true)} className="rounded-xl bg-green-600 px-4 py-2 text-white hover:bg-green-700">
                      Change Password
                    </button>
                  </div>
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-600 mb-4">Add an extra layer of security to your account</p>
                    <button type="button" disabled className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed">
                      Not available yet
                    </button>
                  </div>
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Active Sessions</h3>
                    <p className="text-sm text-gray-600 mb-4">Manage your active login sessions</p>
                    <div className="text-sm text-gray-700">
                      <p>Signed in as {account?.username || ''}. Previous sign-in: {account?.last_login ? formatDateTime(account.last_login) : ''}.</p>
                      <p className="mt-1 text-gray-500">Sessions expire after 8 hours. Changing your password signs out every device.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* System Tab (Admin only) */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4">System Administration</h2>
                <div className="space-y-4">
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Database Backup</h3>
                    <p className="text-sm text-gray-600 mb-4">Create a backup of the entire database</p>
                    <button
                      onClick={handleBackup}
                      className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium"
                    >
                      Create Backup
                    </button>
                  </div>
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">System Information</h3>
                    <div className="text-sm text-gray-700 space-y-2 mt-4">
                      <p>Version: 1.0.0</p>
                      <p>Database: Supabase PostgreSQL (automatic backups managed by Supabase)</p>
                      <p>Signed-in administrator: {account?.username || ''}</p>
                    </div>
                  </div>
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Maintenance Mode</h3>
                    <p className="text-sm text-gray-600 mb-4">Enable maintenance mode for system updates</p>
                    <button type="button" disabled className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed">
                      Not available yet
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Opens once the account is loaded, so it knows the email and mobile number on file. */}
      {showChangePasswordModal && account && (
        <ChangePasswordModal email={account.notification_email ?? account.email ?? null} phone={account.phone ?? null} smsAvailable={Boolean(account.sms_available)} onClose={() => setShowChangePasswordModal(false)} />
      )}
    </div>
  );
}
