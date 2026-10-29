import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { createVendorAccountRequest, setVendorPasswordRequest, updateVendorAccountRequest, type Account } from '../../app/services/authApi';

const INPUT = 'mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2';
const PASSWORD_HINT = 'Use 8+ characters with uppercase, lowercase, number, and symbol.';

// A Kadiwa store vendor account: the name shown on the vendor's sales, a
// username to sign in with, and the password the administrator gives the vendor.
export function VendorAccountForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ fullName: '', username: '', password: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: event.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (form.password !== form.confirmPassword) { toast.error('The passwords do not match.'); return; }
    setSaving(true);
    try {
      const response = await createVendorAccountRequest({ ...form, username: form.username.trim().toLowerCase(), fullName: form.fullName.trim() });
      toast.success('Vendor account created', { description: response.message });
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create the vendor account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Create Kadiwa Vendor Account</h2>
      <p className="mb-4 text-sm text-gray-600">The vendor signs in with the username and this password, and can only send the store&apos;s daily sales and expenses for you to confirm.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Full name
          <input required minLength={3} maxLength={200} value={form.fullName} onChange={set('fullName')} placeholder="e.g. Rosa Santos" className={INPUT} />
        </label>
        <label className="text-sm font-medium text-gray-700">Username
          <input required minLength={3} maxLength={100} pattern="[a-zA-Z0-9._\-]{3,100}" value={form.username} onChange={set('username')} autoCapitalize="none" spellCheck={false} placeholder="e.g. rosa.santos" className={INPUT} />
          <span className="mt-1 block text-xs font-normal text-gray-500">Letters, numbers, dots, dashes or underscores.</span>
        </label>
        <label className="text-sm font-medium text-gray-700">Password
          <input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} className={INPUT} />
          <span className="mt-1 block text-xs font-normal text-gray-500">{PASSWORD_HINT}</span>
        </label>
        <label className="text-sm font-medium text-gray-700">Confirm password
          <input required minLength={8} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} className={INPUT} />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Creating...' : 'Create vendor account'}</button>
        <button type="button" disabled={saving} onClick={onCancel} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-60">Cancel</button>
      </div>
    </form>
  );
}

// Change a vendor's name or set a new password (the vendor is signed out and uses the new one).
export function VendorAccountEditor({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(account.full_name || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState<'name' | 'password' | null>(null);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving('name');
    try {
      const response = await updateVendorAccountRequest(account.user_id, fullName.trim());
      toast.success(response.message);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save the name.');
    } finally {
      setSaving(null);
    }
  };
  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (password !== confirmPassword) { toast.error('The passwords do not match.'); return; }
    setSaving('password');
    try {
      const response = await setVendorPasswordRequest(account.user_id, password, confirmPassword);
      toast.success(response.message);
      setPassword('');
      setConfirmPassword('');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to set the password.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="vendor-editor-title">
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="vendor-editor-title" className="text-lg font-bold text-gray-900">{account.full_name || account.username}</h2>
            <p className="text-sm text-gray-600">Kadiwa vendor · Username: {account.username}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={(event) => void saveName(event)} className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Full name
            <input required minLength={3} maxLength={200} value={fullName} onChange={(event) => setFullName(event.target.value)} className={INPUT} />
          </label>
          <button type="submit" disabled={saving !== null || fullName.trim() === (account.full_name || '')} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">{saving === 'name' ? 'Saving...' : 'Save name'}</button>
        </form>
        <form onSubmit={(event) => void savePassword(event)} className="space-y-2 border-t border-gray-100 pt-4">
          <p className="text-sm font-semibold text-gray-900">Set a new password</p>
          <p className="text-xs text-gray-500">The vendor is signed out and signs in again with the new password. {PASSWORD_HINT}</p>
          <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" aria-label="New password" className={INPUT} />
          <input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" aria-label="Confirm new password" className={INPUT} />
          <button type="submit" disabled={saving !== null} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">{saving === 'password' ? 'Setting...' : 'Set password'}</button>
        </form>
      </div>
    </div>
  );
}
