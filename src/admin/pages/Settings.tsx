import { useCallback, useEffect, useState } from 'react';
import { User, Bell, Shield, Database, Save, FileText, Upload, Eye, Trash2 } from 'lucide-react';
import { UserRole } from '../../app/App';
import { toast } from 'sonner';
import {
  changePasswordRequest, deleteLegalDocumentRequest, fetchCurrentUser, fetchLegalDocuments, updateNotificationPreferencesRequest,
  updateProfileRequest, uploadLegalDocumentRequest, type AuthUser, type LegalDocumentRecord,
} from '../../app/services/authApi';
import { openProtectedFile } from '../../lib/api';
import { closeLiveUpdates } from '../../lib/liveUpdates';
import { formatDate, formatDateTime } from '../../utils/dateTime';

interface SettingsProps {
  userRole: UserRole;
  mustChangePassword?: boolean;
}

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function Settings({ userRole, mustChangePassword = false }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'system' | 'legal'>(mustChangePassword ? 'security' : 'profile');
  const [legalDocuments, setLegalDocuments] = useState<LegalDocumentRecord[]>([]);
  const [documentCategory, setDocumentCategory] = useState('Registration');
  const [account, setAccount] = useState<AuthUser | null>(null);
  const [profileData, setProfileData] = useState({ name: '', email: '', phone: '', position: '' });
  const [notificationSettings, setNotificationSettings] = useState({ emailNotifications: true, smsNotifications: false, loanReminders: true });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isUploading, setIsUploading] = useState(false);

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

  const loadDocuments = useCallback(() => {
    fetchLegalDocuments()
      .then(({ data }) => setLegalDocuments(data))
      .catch(() => { /* the legal tab shows an empty state */ });
  }, []);

  useEffect(() => {
    loadAccount();
    if (!mustChangePassword) loadDocuments();
  }, [loadAccount, loadDocuments, mustChangePassword]);

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

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    try {
      await changePasswordRequest(passwordForm);
      toast.success('Password changed successfully. Please sign in again.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      // The server ends every session after a password change.
      closeLiveUpdates();
      window.setTimeout(() => window.location.replace('/login'), 800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to change password.');
    }
  };

  const handleBackup = () => {
    toast.info('Backups are managed by Supabase', {
      description: 'The database is backed up automatically by the Supabase project (see Supabase dashboard → Database → Backups). This app does not create backup files.'
    });
  };

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsUploading(true);
    try {
      await uploadLegalDocumentRequest(file, documentCategory);
      toast.success('Legal document uploaded', { description: `${file.name} is stored privately.` });
      loadDocuments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to upload document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDocumentView = (document: LegalDocumentRecord) => {
    openProtectedFile(`/api/legal-documents/${document.id}/file`).catch((error: Error) => toast.error(error.message));
  };

  const handleDocumentDelete = async (document: LegalDocumentRecord) => {
    if (!window.confirm(`Delete "${document.name}"? This cannot be undone.`)) return;
    try {
      await deleteLegalDocumentRequest(document.id);
      toast.success('Document deleted');
      loadDocuments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete document.');
    }
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
        {mustChangePassword && <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">You are using a temporary password. Change it below to continue using the system.</p>}
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
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <User className="w-5 h-5" />
              Profile
            </button>
            <button
              onClick={() => setActiveTab('legal')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'legal'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-5 h-5" />
              Legal Documents
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
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Position
                    </label>
                    <input
                      type="text"
                      value={profileData.position}
                      onChange={(e) => setProfileData({ ...profileData, position: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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
                    <form onSubmit={handleChangePassword} className="grid gap-3 sm:grid-cols-3">
                      {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((field) => (
                        <input key={field} required type="password" placeholder={field === 'currentPassword' ? 'Current password' : field === 'newPassword' ? 'New password' : 'Confirm password'} value={passwordForm[field]} onChange={(event) => setPasswordForm({ ...passwordForm, [field]: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
                      ))}
                      <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 sm:col-span-3 sm:justify-self-start">
                        Change Password
                      </button>
                    </form>
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
                      <p>Signed in as {account?.username || '—'}. Previous sign-in: {account?.last_login ? formatDateTime(account.last_login) : '—'}.</p>
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
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                    >
                      Create Backup
                    </button>
                  </div>
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">System Information</h3>
                    <div className="text-sm text-gray-700 space-y-2 mt-4">
                      <p>Version: 1.0.0</p>
                      <p>Database: Supabase PostgreSQL (automatic backups managed by Supabase)</p>
                      <p>Signed-in administrator: {account?.username || '—'}</p>
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

          {/* Legal Documents Tab */}
          {activeTab === 'legal' && (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Cooperative Legal Documents</h2>
                  <p className="mt-1 text-sm text-gray-600">Keep registration, governance, and compliance documents available to administrators.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select value={documentCategory} onChange={(e) => setDocumentCategory(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option>Registration</option>
                    <option>Governance</option>
                    <option>Compliance</option>
                    <option>Financial</option>
                    <option>Other</option>
                  </select>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                    <Upload className="h-4 w-4" />
                    {isUploading ? 'Uploading...' : 'Upload Document'}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" disabled={isUploading} onChange={handleDocumentUpload} className="sr-only" />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {legalDocuments.map((document) => (
                  <div key={document.id} className="rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-lg bg-blue-50 p-3"><FileText className="h-5 w-5 text-blue-600" /></div>
                        <div className="min-w-0"><h3 className="truncate font-medium text-gray-900">{document.name}</h3><p className="mt-1 text-xs text-gray-500">{document.category} · {formatSize(document.fileSize)}</p></div>
                      </div>
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Available</span>
                    </div>
                    <p className="mt-4 text-xs text-gray-500">Uploaded {formatDate(document.uploadedAt)}{document.uploadedBy ? ` by ${document.uploadedBy}` : ''}</p>
                    <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-3">
                      <button type="button" onClick={() => handleDocumentView(document)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"><Eye className="h-4 w-4" />View</button>
                      <button type="button" onClick={() => void handleDocumentDelete(document)} className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800"><Trash2 className="h-4 w-4" />Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              {!legalDocuments.length && <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center"><FileText className="mx-auto h-10 w-10 text-gray-400" /><p className="mt-3 text-sm font-medium text-gray-700">No legal documents uploaded</p><p className="mt-1 text-sm text-gray-500">Upload a cooperative document to see it here.</p></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
