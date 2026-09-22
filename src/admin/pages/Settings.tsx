import { useState } from 'react';
import { User, Bell, Shield, Database, Save, FileText, Upload, Eye, Trash2 } from 'lucide-react';
import { UserRole } from '../../app/App';
import { toast } from 'sonner';
import { changePasswordRequest } from '../../app/services/authApi';

interface SettingsProps {
  userRole: UserRole;
}

interface LegalDocument {
  id: string;
  name: string;
  category: string;
  uploadedAt: string;
  size: string;
  file?: File;
}

const initialLegalDocuments: LegalDocument[] = [
  { id: 'DOC-001', name: 'ACIFAC Cooperative Registration', category: 'Registration', uploadedAt: 'April 12, 2026', size: '2.4 MB' },
  { id: 'DOC-002', name: 'Articles of Cooperation', category: 'Governance', uploadedAt: 'April 10, 2026', size: '1.8 MB' },
  { id: 'DOC-003', name: 'Bylaws and Amendments', category: 'Governance', uploadedAt: 'March 28, 2026', size: '980 KB' },
];

export function Settings({ userRole }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security' | 'system' | 'legal'>('profile');
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>(initialLegalDocuments);
  const [documentCategory, setDocumentCategory] = useState('Registration');
  const [profileData, setProfileData] = useState({
    name: 'Ejay Allado',
    email: 'alladoej@gmail.com',
    phone: '09918206769',
    position: 'System Administrator'
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    loanReminders: true
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Profile updated successfully!');
  };

  const handleSaveNotifications = () => {
    toast.success('Notification settings saved!');
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to change password.');
    }
  };

  const handleBackup = () => {
    toast.success('Database backup initiated!', {
      description: 'Backup will be available in the downloads folder'
    });
  };

  const handleDocumentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const document: LegalDocument = {
      id: `DOC-${Date.now()}`,
      name: file.name.replace(/\.[^/.]+$/, ''),
      category: documentCategory,
      uploadedAt: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      file,
    };
    setLegalDocuments((current) => [document, ...current]);
    event.target.value = '';
    toast.success('Legal document uploaded', { description: `${file.name} is available in this browser session.` });
  };

  const handleDocumentView = (document: LegalDocument) => {
    if (!document.file) {
      toast.info('Mock document preview', { description: `${document.name} is sample cooperative data.` });
      return;
    }
    window.open(URL.createObjectURL(document.file), '_blank', 'noopener,noreferrer');
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
                      <p className="text-sm text-gray-600">Receive updates via SMS</p>
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
                    <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                      Enable 2FA
                    </button>
                  </div>
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Active Sessions</h3>
                    <p className="text-sm text-gray-600 mb-4">Manage your active login sessions</p>
                    <div className="text-sm text-gray-700">
                      <p>Current session: Desktop - Chrome (Active now)</p>
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
                      <p>Last Backup: April 27, 2026</p>
                      <p>Database Size: 245 MB</p>
                      <p>Active Users: 3</p>
                    </div>
                  </div>
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Maintenance Mode</h3>
                    <p className="text-sm text-gray-600 mb-4">Enable maintenance mode for system updates</p>
                    <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                      Enable Maintenance Mode
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
                  </select>
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                    <Upload className="h-4 w-4" />
                    Upload Document
                    <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleDocumentUpload} className="sr-only" />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {legalDocuments.map((document) => (
                  <div key={document.id} className="rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="rounded-lg bg-blue-50 p-3"><FileText className="h-5 w-5 text-blue-600" /></div>
                        <div className="min-w-0"><h3 className="truncate font-medium text-gray-900">{document.name}</h3><p className="mt-1 text-xs text-gray-500">{document.category} · {document.size}</p></div>
                      </div>
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Available</span>
                    </div>
                    <p className="mt-4 text-xs text-gray-500">Uploaded {document.uploadedAt}</p>
                    <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-3">
                      <button type="button" onClick={() => handleDocumentView(document)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"><Eye className="h-4 w-4" />View</button>
                      <button type="button" onClick={() => setLegalDocuments((current) => current.filter((item) => item.id !== document.id))} className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800"><Trash2 className="h-4 w-4" />Remove</button>
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
