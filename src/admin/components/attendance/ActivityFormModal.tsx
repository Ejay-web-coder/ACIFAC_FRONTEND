import { useState, type FormEvent, type ReactNode } from 'react';
import { CalendarPlus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../../lib/api';
import { dateOnlyToday } from '../../../utils/dateTime';
import { FIELD } from '../../../app/components/attendance/shared';
import {
  ACTIVITY_CATEGORIES, createActivity, updateActivity, type Activity, type ActivityInput, type ActivityStatus,
} from '../../../app/services/attendanceApi';

const EMPTY: ActivityInput = { title: '', category: '', activityDate: '', startTime: '08:00', endTime: '12:00', venue: '', description: '', organizer: '', status: 'scheduled', cancellationReason: '' };

// The same checks the server makes, so mistakes show next to the field.
function validate(form: ActivityInput, today: string, existing: Activity | null) {
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
  return errors;
}

/** Create Activity, or edit one (activity given). */
export function ActivityFormModal({ activity, onClose, onSaved }: { activity: Activity | null; onClose: () => void; onSaved: (activity: Activity) => void }) {
  const today = dateOnlyToday();
  const [form, setForm] = useState<ActivityInput>(() => activity
    ? { title: activity.title, category: activity.category, activityDate: activity.activityDate, startTime: activity.startTime, endTime: activity.endTime, venue: activity.venue, description: activity.description, organizer: activity.organizer, status: activity.status, cancellationReason: activity.cancellationReason ?? '' }
    : { ...EMPTY, activityDate: today });
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
    const found = validate(form, today, activity);
    setErrors(found);
    if (Object.values(found).some(Boolean) || saving) return;
    setSaving(true);
    try {
      const response = activity ? await updateActivity(activity.id, form) : await createActivity(form);
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
          <Field label="Venue" required error={errors.venue}>
            <input value={form.venue} onChange={(event) => set('venue', event.target.value)} maxLength={200} className={FIELD} placeholder="e.g. ACIFAC Hall, Barahan" />
          </Field>
          <Field label="Organizer" error={errors.organizer}>
            <input value={form.organizer} onChange={(event) => set('organizer', event.target.value)} maxLength={200} className={FIELD} placeholder="e.g. Board of Directors" />
          </Field>
          <Field label="Description" error={errors.description} className="sm:col-span-2">
            <textarea value={form.description} onChange={(event) => set('description', event.target.value)} maxLength={2000} rows={3} className={FIELD} placeholder="Agenda, topics or what the activity is about" />
          </Field>
          <Field label="Activity status" required error={errors.status} hint={final ? 'Attendance is final, so the activity stays completed.' : 'Finalizing the attendance also marks the activity completed.'}>
            <select value={form.status} onChange={(event) => set('status', event.target.value as ActivityStatus)} disabled={final} className={FIELD}>
              {statusOptions.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
            </select>
          </Field>
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

function Field({ label, required, error, hint, className = '', children }: { label: string; required?: boolean; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block text-sm font-medium text-gray-700 ${className}`}>
      <span>{label}{required && <span className="text-red-600" aria-hidden="true"> *</span>}</span>
      <span className="mt-1 block">{children}</span>
      {error ? <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{error}</span> : hint ? <span className="mt-1 block text-xs font-normal text-gray-500">{hint}</span> : null}
    </label>
  );
}
