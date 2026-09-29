import { useCallback, useEffect, useState } from 'react';
import { User, Bell, Shield, Save } from 'lucide-react';
import { toast } from 'sonner';
import { fetchCurrentUser, updateNotificationPreferencesRequest, updateProfileRequest } from '../../app/services/authApi';
import { ProfilePhotoEditor } from '../../app/components/common/ProfilePhotoEditor';
import { ChangePasswordModal } from '../../app/components/ChangePasswordModal';

export function MemberSettings({ mustChangePassword = false }: { mustChangePassword?: boolean }) {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security'>(mustChangePassword ? 'security' : 'profile');
  const [profileData, setProfileData] = useState({ name: '', phone: '', membershipNumber: '' });
  const [notificationEmail, setNotificationEmail] = useState<string | null>(null);
  // The saved number (not the one being edited) and whether codes can be texted to it.
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({ emailNotifications: true, smsNotifications: true, loanReminders: true });
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(mustChangePassword);

  const loadAccount = useCallback(() => {
    fetchCurrentUser()
      .then(({ user }) => {
        if (!user) return;
        setProfileData({ name: user.display_name || '', phone: user.phone || '', membershipNumber: user.member_number || '' });
        if (user.notification_preferences) setNotificationSettings(user.notification_preferences);
        setNotificationEmail(user.notification_email || null);
        setSavedPhone(user.phone || null);
        setSmsAvailable(Boolean(user.sms_available));
      })
      .catch((error: Error) => toast.error('Unable to load your profile', { description: error.message }));
  }, []);

  useEffect(() => { loadAccount(); }, [loadAccount]);

  // Members can update their own contact details; their name and membership
  // record are maintained by the cooperative office.
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfileRequest({ phone: profileData.phone });
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-gray-600 mt-1">Manage your account preferences</p>
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
              <ProfilePhotoEditor visibilityNote="Shown in your top bar and to ACIFAC administrators on your member record." />
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-gray-50 text-gray-600 focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-gray-50 text-gray-600 cursor-not-allowed"
                    />
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
                  <div className="flex items-center justify-between gap-4 p-4 border border-gray-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Email Notifications</p>
                      <p className="text-sm text-gray-600">Receive emails when savings, share capital, loans, payments or machinery rentals are recorded on your account</p>
                      <p className="mt-1 text-xs text-gray-500">{notificationEmail ? <>Sent to <span className="font-medium text-gray-700">{notificationEmail}</span>. To change it, contact the ACIFAC office.</> : 'No email address is on file. Ask the ACIFAC office to add one to receive emails.'}</p>
                    </div>
                    <label className="relative inline-flex shrink-0 items-center cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="Email notifications"
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
                      <p className="text-sm text-gray-600">Loan payment reminders by text message to your mobile number.</p>
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
                      <p className="text-sm text-gray-600">Get notified about upcoming loan payments (in the app, and by email when email notifications are on)</p>
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
                    <button
                      onClick={() => setShowChangePasswordModal(true)}
                      className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700"
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

      {showChangePasswordModal && (
        <ChangePasswordModal email={notificationEmail} phone={savedPhone} smsAvailable={smsAvailable} onClose={() => setShowChangePasswordModal(false)} />
      )}
    </div>
  );
}
