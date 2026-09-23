import { useCallback, useEffect, useState } from 'react';
import { User, Bell, Shield, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { changePasswordRequest, fetchCurrentUser, updateNotificationPreferencesRequest, updateProfileRequest } from '../../app/services/authApi';
import { closeLiveUpdates } from '../../lib/liveUpdates';

export function MemberSettings({ mustChangePassword = false }: { mustChangePassword?: boolean }) {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security'>(mustChangePassword ? 'security' : 'profile');
  const [profileData, setProfileData] = useState({ name: '', email: '', phone: '', membershipNumber: '' });
  const [notificationSettings, setNotificationSettings] = useState({ emailNotifications: true, smsNotifications: false, loanReminders: true });
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(mustChangePassword);
  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const loadAccount = useCallback(() => {
    fetchCurrentUser()
      .then(({ user }) => {
        if (!user) return;
        setProfileData({ name: user.display_name || '', email: user.email || '', phone: user.phone || '', membershipNumber: user.member_number || '' });
        if (user.notification_preferences) setNotificationSettings(user.notification_preferences);
      })
      .catch((error: Error) => toast.error('Unable to load your profile', { description: error.message }));
  }, []);

  useEffect(() => { loadAccount(); }, [loadAccount]);

  // Members can update their own contact details; their name and membership
  // record are maintained by the cooperative office.
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfileRequest({ email: profileData.email, phone: profileData.phone });
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

  const handlePasswordFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      toast.error('New passwords do not match!');
      return;
    }
    if (!passwordFormData.currentPassword || !passwordFormData.newPassword) {
      toast.error('Please fill in all fields!');
      return;
    }
    if (passwordFormData.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters with upper and lower case letters, a number and a symbol.');
      return;
    }
    try {
      await changePasswordRequest(passwordFormData);
      toast.success('Password changed successfully! Please sign in again.');
      // The server ends every session after a password change.
      closeLiveUpdates();
      window.setTimeout(() => window.location.replace('/login'), 800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to change password.');
      return;
    }
    setPasswordFormData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setShowChangePasswordModal(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-gray-600 mt-1">Manage your account preferences</p>
      </div>

      {/* Settings Container */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'profile'
                  ? 'border-green-600 text-green-600'
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
                  ? 'border-green-600 text-green-600'
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
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Shield className="w-5 h-5" />
              Security
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4">Profile Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileData.name}
                      readOnly
                      title="Your name is maintained by the ACIFAC office"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Membership Number
                    </label>
                    <input
                      type="text"
                      value={profileData.membershipNumber}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
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
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">SMS Notifications</p>
                      <p className="text-sm text-gray-600">Receive updates via SMS (saved as a preference; SMS delivery is not set up yet)</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.smsNotifications}
                        onChange={(e) => setNotificationSettings({ ...notificationSettings, smsNotifications: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
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
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSaveNotifications}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
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
                    <p className="text-sm text-gray-600 mb-4">Update your password to keep your account secure</p>
                    <button
                      onClick={() => setShowChangePasswordModal(true)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Change Password
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Change Password</h2>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setPasswordFormData({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: ''
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordFormData.currentPassword}
                  onChange={handlePasswordFormChange}
                  placeholder="Enter current password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordFormData.newPassword}
                  onChange={handlePasswordFormChange}
                  placeholder="Enter new password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordFormData.confirmPassword}
                  onChange={handlePasswordFormChange}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setPasswordFormData({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: ''
                    });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
                >
                  Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
