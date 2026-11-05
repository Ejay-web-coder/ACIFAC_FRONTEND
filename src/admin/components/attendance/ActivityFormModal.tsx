import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarPlus, Save, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../../lib/api';
import { dateOnlyToday } from '../../../utils/dateTime';
import { FIELD } from '../../../app/components/attendance/shared';
import {
  ACTIVITY_CATEGORIES, createActivity, fetchActivity, updateActivity, type Activity, type ActivityDetails, type ActivityInput, type ActivityInvitee, type ActivityStatus,
} from '../../../app/services/attendanceApi';
import { searchMembers, type MemberSuggestion } from '../../../app/services/authApi';

const EMPTY: ActivityInput = { title: '', category: '', activityDate: '', startTime: '08:00', endTime: '12:00', venue: '', description: '', organizer: '', status: 'scheduled', cancellationReason: '', attendeeScope: 'all' };

// The same checks the server makes, so mistakes show next to the field.
function validate(form: ActivityInput, today: string, existing: Activity | null, invitees: ActivityInvitee[] | null) {
  const errors: Partial<Record<keyof ActivityInput, string>> = {};
  if (!form.title.trim()) errors.title = 'Activity title is required.';
  if (!form.category) errors.category = 'Choose a category.';
  if (!form.activityDate) errors.activityDate = 'Choose the activity date.';
  if (!form.startTime) errors.startTime = 'Start time is required.';
  if (!form.endTime) errors.endTime = 'End time is required.';
  else if (form.startTime && form.endTime <= form.startTime) errors.endTime = 'The end time must be later than the start time.';
  if (!form.venue.trim()) errors.venue = 'Venue is required.';
  if (form.status === 'completed' && form.activityDate > today) errors.status = 'An activity on a future date cannot be completed yet.';
  if (form.status === 'cancelled' && existing?.status !== 'cancelled' && (form.cancellationReason ?? '').trim().length < 3) errors.cancellationReason = 'Give the reason the activity is cancelled.';
  if (form.attendeeScope === 'selected' && invitees && !invitees.length) errors.attendeeScope = 'Choose at least one member who must attend.';
  return errors;
}

/** Create Activity, or edit one (activity given). */
export function ActivityFormModal({ activity, onClose, onSaved }: { activity: Activity | null; onClose: () => void; onSaved: (activity: Activity) => void }) {
  const today = dateOnlyToday();
  const [form, setForm] = useState<ActivityInput>(() => activity
    ? { title: activity.title, category: activity.category, activityDate: activity.activityDate, startTime: activity.startTime, endTime: activity.endTime, venue: activity.venue, description: activity.description, organizer: activity.organizer, status: activity.status, cancellationReason: activity.cancellationReason ?? '', attendeeScope: activity.attendeeScope ?? 'all' }
    : { ...EMPTY, activityDate: today });
  // The members who must attend (selected members only); null while an edited activity's are loading.
  const [invitees, setInvitees] = useState<ActivityInvitee[] | null>(() => {
    if (!activity || activity.attendeeScope !== 'selected') return [];
    return 'invitees' in activity ? (activity as ActivityDetails).invitees : null;
  });
  useEffect(() => {
    if (invitees !== null || !activity) return;
    fetchActivity(activity.id).then((response) => setInvitees(response.data.invitees)).catch(() => toast.error('Unable to load the members who must attend.'));
  }, [activity, invitees]);
  const [errors, setErrors] = useState<Partial<Record<keyof ActivityInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const final = Boolean(activity?.final);
  const set = <K extends keyof ActivityInput>(key: K, value: ActivityInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // New activities are scheduled or completed; cancelling is for one that will not take place.
  const statusOptions: Array<{ value: ActivityStatus; label: string; disabled?: boolean }> = [
    { value: 'scheduled', label: 'Scheduled', disabled: final },
    { value: 'completed', label: form.activityDate > today ? 'Completed (after the activity date)' : 'Completed', disabled: form.activityDate > today },
    ...(activity ? [{ value: 'cancelled' as const, label: 'Cancelled', disabled: final }] : []),
  ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate(form, today, activity, invitees);
    setErrors(found);
    if (Object.values(found).some(Boolean) || saving) return;
    setSaving(true);
    try {
      // memberIds is left out while an edited activity's members have not loaded, so they stay as they are.
      const input: ActivityInput = { ...form, memberIds: form.attendeeScope === 'selected' && invitees ? invitees.map((member) => member.id) : undefined };
      const response = activity ? await updateActivity(activity.id, input) : await createActivity(input);
      toast.success(activity ? 'Activity updated' : 'Activity created', { description: `${response.data.title} · ${response.data.categoryLabel}` });
      onSaved(response.data);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the activity.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="activity-form-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <form onSubmit={submit} noValidate className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="activity-form-title" className="text-xl font-bold text-gray-900">{activity ? 'Edit Activity' : 'Create Activity'}</h2>
            <p className="mt-0.5 text-sm text-gray-600">{activity ? activity.title : 'A meeting, training or community activity whose attendance will be recorded.'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close the activity form"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <Field label="Activity title" required error={errors.title} className="sm:col-span-2">
            <input value={form.title} onChange={(event) => set('title', event.target.value)} maxLength={200} className={FIELD} placeholder="e.g. Monthly General Meeting" autoFocus />
          </Field>
          <Field label="Category" required error={errors.category}>
            <select value={form.category} onChange={(event) => set('category', event.target.value as ActivityInput['category'])} className={FIELD}>
              <option value="">Choose a category</option>
              {ACTIVITY_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </Field>
          <Field label="Activity date" required error={errors.activityDate} hint={final ? 'Attendance is final, so the date stays.' : undefined}>
            <input type="date" value={form.activityDate} onChange={(event) => set('activityDate', event.target.value)} disabled={final} className={FIELD} />
          </Field>
          <Field label="Start time" required error={errors.startTime}>
            <input type="time" value={form.startTime} onChange={(event) => set('startTime', event.target.value)} className={FIELD} />
          </Field>
          <Field label="End time" required error={errors.endTime}>
            <input type="time" value={form.endTime} onChange={(event) => set('endTime', event.target.value)} className={FIELD} />
          </Field>
          <Field label="Venue" required error={errors.venue} className="sm:col-span-2">
            <input value={form.venue} onChange={(event) => set('venue', event.target.value)} maxLength={200} className={FIELD} placeholder="e.g. ACIFAC Hall, Barahan" />
          </Field>
          <Field label="Description" error={errors.description} className="sm:col-span-2">
            <textarea value={form.description} onChange={(event) => set('description', event.target.value)} maxLength={2000} rows={3} className={FIELD} placeholder="Agenda, topics or what the activity is about" />
          </Field>
          <Field label="Activity status" required error={errors.status} hint={final ? 'Attendance is final, so the activity stays completed.' : 'Finalizing the attendance also marks the activity completed.'}>
            <select value={form.status} onChange={(event) => set('status', event.target.value as ActivityStatus)} disabled={final} className={FIELD}>
              {statusOptions.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <AttendeePicker scope={form.attendeeScope} invitees={invitees} locked={final} error={errors.attendeeScope}
              onScopeChange={(scope) => set('attendeeScope', scope)}
              onInviteesChange={(next) => { setInvitees(next); setErrors((current) => ({ ...current, attendeeScope: undefined })); }} />
          </div>
          {form.status === 'cancelled' && activity?.status !== 'cancelled' && (
            <Field label="Reason for cancelling" required error={errors.cancellationReason}>
              <input value={form.cancellationReason ?? ''} onChange={(event) => set('cancellationReason', event.target.value)} maxLength={500} className={FIELD} placeholder="e.g. Typhoon signal no. 2" />
            </Field>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
            {activity ? <Save className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}
            {saving ? 'Saving…' : activity ? 'Save Changes' : 'Create Activity'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Who must attend: every member, or only the members chosen here (searched by name or member ID).
function AttendeePicker({ scope, invitees, locked, error, onScopeChange, onInviteesChange }: {
  scope: ActivityInput['attendeeScope'];
  invitees: ActivityInvitee[] | null;
  locked: boolean;
  error?: string;
  onScopeChange: (scope: ActivityInput['attendeeScope']) => void;
  onInviteesChange: (invitees: ActivityInvitee[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MemberSuggestion[]>([]);
  const latest = useRef(0);
  useEffect(() => {
    const text = search.trim();
    if (scope !== 'selected' || text.length < 2) { setResults([]); return undefined; }
    const timer = window.setTimeout(() => {
      const id = ++latest.current;
      searchMembers(text).then((rows) => { if (id === latest.current) setResults(rows); }).catch(() => toast.error('Unable to search members.'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, scope]);

  const chosen = invitees ?? [];
  const isChosen = (id: number) => chosen.some((member) => member.id === id);
  const toggle = (member: MemberSuggestion) => onInviteesChange(isChosen(member.id)
    ? chosen.filter((item) => item.id !== member.id)
    : [...chosen, { id: member.id, memberNumber: member.member_number, name: member.full_name }]);
  const addAll = () => onInviteesChange([...chosen, ...results.filter((member) => !isChosen(member.id)).map((member) => ({ id: member.id, memberNumber: member.member_number, name: member.full_name }))]);

  return (
    <fieldset className="rounded-xl border border-gray-200 p-3" disabled={locked}>
      <legend className="px-1 text-sm font-medium text-gray-700">Who must attend <span className="text-red-600" aria-hidden="true">*</span></legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {([['all', 'All members', 'Everyone who is a member on the activity date'], ['selected', 'Selected members only', 'Only the members you choose; the others are not counted']] as const).map(([value, label, hint]) => (
          <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-2.5 text-sm ${scope === value ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <input type="radio" name="attendee-scope" checked={scope === value} onChange={() => onScopeChange(value)} className="mt-0.5 h-4 w-4 accent-green-600" />
            <span><span className="block font-semibold text-gray-900">{label}</span><span className="block text-xs text-gray-500">{hint}</span></span>
          </label>
        ))}
      </div>
      {locked && <p className="mt-2 text-xs text-gray-500">Attendance is final, so who must attend stays.</p>}
      {scope === 'selected' && (
        <div className="mt-3 space-y-2">
          {invitees === null ? <p className="text-sm text-gray-500">Loading the members…</p> : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a member by name or member ID" aria-label="Search members to add" className={`${FIELD} pl-9`} />
              </div>
              {results.length > 0 && (
                <div className="rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5 text-xs text-gray-500">
                    <span>Tick the members who must attend</span>
                    <button type="button" onClick={addAll} className="font-semibold text-green-700 hover:underline">Add all {results.length}</button>
                  </div>
                  <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto">
                    {results.map((member) => (
                      <li key={member.id}>
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                          <input type="checkbox" checked={isChosen(member.id)} onChange={() => toggle(member)} className="h-4 w-4 accent-green-600" />
                          <span className="font-medium text-gray-900">{member.full_name}</span>
                          {member.member_number && <span className="text-xs text-gray-500">{member.member_number}</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs font-semibold text-gray-700">{chosen.length} {chosen.length === 1 ? 'member' : 'members'} chosen</p>
              {chosen.length > 0 && (
                <ul className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {chosen.map((member) => (
                    <li key={member.id} className="inline-flex items-center gap-1 rounded-full bg-green-100 py-1 pl-2.5 pr-1 text-xs font-medium text-green-900">
                      {member.name}
                      <button type="button" onClick={() => onInviteesChange(chosen.filter((item) => item.id !== member.id))} className="rounded-full p-0.5 hover:bg-green-200" aria-label={`Remove ${member.name}`}><X className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs font-medium text-red-600" role="alert">{error}</p>}
    </fieldset>
  );
}

function Field({ label, required, error, hint, className = '', children }: { label: string; required?: boolean; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block text-sm font-medium text-gray-700 ${className}`}>
      <span>{label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}</span>
      <span className="mt-1 block">{children}</span>
      {error ? <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{error}</span> : hint ? <span className="mt-1 block text-xs font-normal text-gray-500">{hint}</span> : null}
    </label>
  );
}
