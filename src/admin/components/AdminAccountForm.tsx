import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, LoaderCircle, Mail, Phone, Send, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { checkAdminContact, confirmAdminContactCode, createAdminAccountRequest, sendAdminContactCode, type AdminContactCheck } from '../../app/services/authApi';

// A new administrator account. Every administrator has the same ADMIN role,
// but their own name and position in the cooperative, both required: the
// audit log records everything they do under them. The email and mobile
// number must be free (no other account or member record has them), and each
// is proved with a 6-digit code sent to it, which the new administrator reads
// out (the number only when text messages are set up on the server).

const OTHER = '__other__';
const INPUT = 'mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm';
const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);
const suggestUsername = (name: string) => name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean)
  .filter((_, index, words) => index === 0 || index === words.length - 1).join('.').replace(/[^a-z0-9.]/g, '');

interface ContactState { verificationId: number | null; sentTo: string; code: string; verified: boolean; busy: '' | 'send' | 'verify'; waitUntil: number }
const freshContact = (): ContactState => ({ verificationId: null, sentTo: '', code: '', verified: false, busy: '', waitUntil: 0 });

export function AdminAccountForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ fullName: '', positionChoice: '', positionOther: '', username: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [checks, setChecks] = useState<AdminContactCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [email, setEmail] = useState<ContactState>(freshContact);
  const [phone, setPhone] = useState<ContactState>(freshContact);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(Date.now());

  const position = form.positionChoice === OTHER ? form.positionOther.trim() : form.positionChoice;
  const username = usernameTouched ? form.username : suggestUsername(form.fullName);
  const smsAvailable = checks?.smsAvailable ?? true;

  // Conflicts are checked as the details are typed (after a short pause).
  useEffect(() => {
    const timer = setTimeout(() => {
      setChecking(true);
      checkAdminContact({ email: form.email.trim() || undefined, phone: form.phone.trim() || undefined, username: username || undefined })
        .then(setChecks).catch(() => undefined).finally(() => setChecking(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [form.email, form.phone, username]);

  // The countdown before another code can be sent.
  useEffect(() => {
    if (Math.max(email.waitUntil, phone.waitUntil) <= now) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [email.waitUntil, phone.waitUntil, now]);

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    // A changed email or number must be verified again.
    if (key === 'email') setEmail(freshContact());
    if (key === 'phone') setPhone(freshContact());
  };

  const sendCode = async (channel: 'email' | 'sms') => {
    const [state, setState, value] = channel === 'email' ? [email, setEmail, form.email] : [phone, setPhone, form.phone];
    if (state.busy) return;
    setState({ ...state, busy: 'send' });
    try {
      const sent = await sendAdminContactCode(channel, value.trim(), form.fullName.trim());
      setState({ ...freshContact(), verificationId: sent.verificationId, sentTo: sent.sentTo, waitUntil: Date.now() + 60000 });
      setNow(Date.now());
      toast.success(sent.message);
    } catch (error) {
      setState({ ...state, busy: '' });
      toast.error(errorText(error, 'The code could not be sent.'));
    }
  };

  const verifyCode = async (channel: 'email' | 'sms') => {
    const [state, setState] = channel === 'email' ? [email, setEmail] : [phone, setPhone];
    if (!state.verificationId || state.busy) return;
    setState({ ...state, busy: 'verify' });
    try {
      await confirmAdminContactCode(state.verificationId, state.code.trim());
      setState({ ...state, busy: '', verified: true });
      toast.success(channel === 'email' ? 'Email verified.' : 'Mobile number verified.');
    } catch (error) {
      setState({ ...state, busy: '' });
      toast.error(errorText(error, 'The code could not be checked.'));
    }
  };

  const problems = useMemo(() => {
    const list: string[] = [];
    if (form.fullName.trim().length < 3) list.push('the full name');
    if (!position) list.push('the position');
    if (!username || checks?.username?.problem) list.push('a free username');
    if (!email.verified) list.push('a verified email');
    if (smsAvailable ? !phone.verified : !form.phone.trim() || Boolean(checks?.phone?.problem)) list.push(smsAvailable ? 'a verified mobile number' : 'a free mobile number');
    if (!form.password || form.password !== form.confirmPassword) list.push('matching passwords');
    return list;
  }, [form, position, username, checks, email.verified, phone.verified, smsAvailable]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problems.length || creating) return;
    setCreating(true);
    try {
      const created = await createAdminAccountRequest({
        fullName: form.fullName.trim(), position, username, email: form.email.trim(), phone: form.phone.trim(),
        password: form.password, confirmPassword: form.confirmPassword, emailVerificationId: email.verificationId, phoneVerificationId: phone.verificationId,
      });
      toast.success('Administrator account created', { description: created.message });
      onCreated();
    } catch (error) {
      toast.error(errorText(error, 'The account could not be created.'));
    } finally {
      setCreating(false);
    }
  };

  const contact = (channel: 'email' | 'sms') => {
    const isEmail = channel === 'email';
    const state = isEmail ? email : phone;
    const value = isEmail ? form.email : form.phone;
    const problem = (isEmail ? checks?.email : checks?.phone)?.problem;
    const Icon = isEmail ? Mail : Phone;
    const wait = Math.max(0, Math.ceil((state.waitUntil - now) / 1000));
    const canSend = Boolean(value.trim()) && !problem && !checking && !state.verified && wait === 0 && (isEmail || smsAvailable);
    return (
      <div className="text-sm font-medium text-gray-700">
        <span className="flex items-center gap-1.5"><Icon className="h-4 w-4 text-gray-400" />{isEmail ? 'Email' : 'Mobile number'} <span className="text-red-600">*</span></span>
        <div className="mt-1 flex gap-2">
          <input type={isEmail ? 'email' : 'tel'} required value={value} onChange={(event) => update(isEmail ? 'email' : 'phone', event.target.value)} placeholder={isEmail ? 'name@example.com' : '0917 123 4567'}
            disabled={state.verified} aria-invalid={Boolean(problem) || undefined}
            className={`${INPUT} mt-0 flex-1 ${problem ? 'border-red-400' : state.verified ? 'border-green-400 bg-green-50' : 'border-gray-300'}`} />
          {(isEmail || smsAvailable) && !state.verified && (
            <button type="button" onClick={() => void sendCode(channel)} disabled={!canSend || Boolean(state.busy)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-green-600 px-3 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50">
              {state.busy === 'send' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{wait ? `${wait}s` : state.verificationId ? 'Resend' : 'Send code'}
            </button>
          )}
          {state.verified && <button type="button" onClick={() => update(isEmail ? 'email' : 'phone', value)} className="shrink-0 rounded-xl border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50">Change</button>}
        </div>
        {problem ? <span className="mt-1 flex items-start gap-1 text-xs font-normal text-red-600"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{problem}</span>
          : state.verified ? <span className="mt-1 flex items-center gap-1 text-xs font-normal text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Verified and not used by any other account or member.</span>
            : !isEmail && !smsAvailable ? <span className="mt-1 block text-xs font-normal text-gray-500">Text messages are not set up, so the number is only checked against other accounts and members.</span>
              : <span className="mt-1 block text-xs font-normal text-gray-500">{value.trim() && !checking && checks ? 'Free to use. ' : ''}Send a code and ask the new administrator to read it to you.</span>}
        {state.verificationId && !state.verified && (
          <div className="mt-2 flex gap-2">
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={state.code} placeholder={`Code sent to ${state.sentTo}`}
              onChange={(event) => (isEmail ? setEmail : setPhone)({ ...state, code: event.target.value.replace(/\D/g, '') })} className={`${INPUT} mt-0 flex-1 border-gray-300 tracking-widest`} />
            <button type="button" onClick={() => void verifyCode(channel)} disabled={state.code.length !== 6 || Boolean(state.busy)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {state.busy === 'verify' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Verify
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-lg border border-green-200 bg-green-50/60 p-5 shadow-sm" noValidate>
      <h2 className="text-lg font-semibold text-gray-900">Create Administrator Account</h2>
      <p className="mt-1 text-sm text-gray-600">All administrators have the same access. Each one acts under their own name and position, and everything they do is recorded in the audit log.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Full name <span className="text-red-600">*</span>
          <input required value={form.fullName} onChange={(event) => update('fullName', event.target.value)} placeholder="e.g. Liza M. Ramos" className={`${INPUT} border-gray-300`} />
        </label>
        <label className="text-sm font-medium text-gray-700">Position in the cooperative <span className="text-red-600">*</span>
          <select required value={form.positionChoice} onChange={(event) => update('positionChoice', event.target.value)} className={`${INPUT} border-gray-300`}>
            <option value="">Choose a position</option>
            {(checks?.positions ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
            <option value={OTHER}>Other (type it in)</option>
          </select>
          {form.positionChoice === OTHER && <input required value={form.positionOther} onChange={(event) => update('positionOther', event.target.value)} placeholder="Type the position" className={`${INPUT} border-gray-300`} />}
        </label>
        <label className="text-sm font-medium text-gray-700">Username <span className="text-red-600">*</span>
          <input required value={username} onChange={(event) => { setUsernameTouched(true); update('username', event.target.value.toLowerCase()); }} placeholder="first.last"
            className={`${INPUT} ${checks?.username?.problem ? 'border-red-400' : 'border-gray-300'}`} />
          <span className={`mt-1 block text-xs font-normal ${checks?.username?.problem ? 'text-red-600' : 'text-gray-500'}`}>{checks?.username?.problem || 'They can also sign in with the email or the mobile number.'}</span>
        </label>
        <div className="hidden md:block" />
        {contact('email')}
        {contact('sms')}
        <label className="text-sm font-medium text-gray-700">Temporary password <span className="text-red-600">*</span>
          <input required type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} className={`${INPUT} border-gray-300`} />
          <span className="mt-1 block text-xs font-normal text-gray-500">8+ characters with uppercase, lowercase, number and symbol. They must change it at first sign-in.</span>
        </label>
        <label className="text-sm font-medium text-gray-700">Confirm password <span className="text-red-600">*</span>
          <input required type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)}
            className={`${INPUT} ${form.confirmPassword && form.confirmPassword !== form.password ? 'border-red-400' : 'border-gray-300'}`} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={problems.length > 0 || creating} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
          {creating && <LoaderCircle className="h-4 w-4 animate-spin" />}{creating ? 'Creating...' : 'Create administrator'}
        </button>
        <button type="button" disabled={creating} onClick={onCancel} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-60">Cancel</button>
        {problems.length > 0 && <span className="text-xs text-gray-600">Still needed: {problems.join(', ')}.</span>}
      </div>
    </form>
  );
}
