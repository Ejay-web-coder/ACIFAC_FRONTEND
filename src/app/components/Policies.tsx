import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { createPolicy, deletePolicy, fetchPolicies, updatePolicy, type Policy, type PolicyInput } from '../services/aboutApi';
import { formatDateTime } from '../../utils/dateTime';
import { confirmAction } from './common/ConfirmDialog';
import { EmptyState } from './common/UiKit';

// The About page's Policy tab: the cooperative's policies as text, each a
// title and numbered rules. Administrators add, edit and remove them; members
// read them.

const input = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-green-500';
const secondary = 'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60';
const primary = 'inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60';
const outline = 'inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-green-600 bg-white px-4 text-sm font-semibold text-green-700 hover:bg-green-50';

const anchor = (id: number) => `policy-${id}`;

export function Policies({ editable }: { editable: boolean }) {
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [error, setError] = useState('');
  // The policy being edited: its id, or 'new' for one being added.
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  useEffect(() => {
    fetchPolicies().then(({ data }) => { setPolicies(data); setError(''); }).catch((reason: Error) => setError(reason.message || 'Unable to load the policies.'));
  }, []);

  const remove = async (policy: Policy) => {
    if (!(await confirmAction(`Remove "${policy.title}"? Members will no longer see it.`, { confirmLabel: 'Remove', danger: true }))) return;
    try {
      await deletePolicy(policy.id);
      setPolicies((current) => current?.filter((item) => item.id !== policy.id) ?? null);
      toast.success('Policy removed');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to remove the policy.');
    }
  };

  if (error && !policies) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>;
  if (!policies) return <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the policies…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {policies.length > 1 ? (
          <nav aria-label="Policies" className="flex flex-wrap gap-2">
            {policies.map((policy) => (
              <button key={policy.id} type="button" onClick={() => document.getElementById(anchor(policy.id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800">
                {policy.title}
              </button>
            ))}
          </nav>
        ) : <p className="text-sm text-gray-600">The cooperative’s policies.</p>}
        {editable && editing === null && <button type="button" onClick={() => setEditing('new')} className={`${primary} shrink-0`}><Plus className="h-4 w-4" />Add policy</button>}
      </div>

      {editing === 'new' && (
        <PolicyEditor
          onCancel={() => setEditing(null)}
          onSave={async (payload) => {
            const { data } = await createPolicy(payload);
            setPolicies((current) => [...(current ?? []), data]);
            setEditing(null);
            toast.success('Policy added');
          }}
        />
      )}

      {!policies.length && editing !== 'new' && (
        <div className="rounded-2xl border border-dashed border-gray-300">
          <EmptyState icon={FileText} title="No policies yet" message={editable ? 'Click Add policy to write one.' : 'The office has not added any policies yet.'} compact />
        </div>
      )}

      {policies.map((policy) => (editing === policy.id ? (
        <PolicyEditor
          key={policy.id}
          policy={policy}
          onCancel={() => setEditing(null)}
          onSave={async (payload) => {
            const { data } = await updatePolicy(policy.id, payload);
            setPolicies((current) => current?.map((item) => (item.id === data.id ? data : item)) ?? null);
            setEditing(null);
            toast.success('Policy saved');
          }}
        />
      ) : (
        <section key={policy.id} id={anchor(policy.id)} className="scroll-mt-4 rounded-2xl border border-gray-200 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-lg font-bold text-gray-900">{policy.title}</h2>
            {editable && editing === null && (
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setEditing(policy.id)} className={outline}><Pencil className="h-4 w-4" />Edit</button>
                <button type="button" onClick={() => void remove(policy)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Remove</button>
              </div>
            )}
          </div>
          {policy.intro && <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">{policy.intro.split(/\n{2,}/).map((part, index) => <p key={index} className="whitespace-pre-line">{part}</p>)}</div>}
          <ol className="mt-4 space-y-2.5">
            {policy.items.map((item, index) => (
              <li key={index} className="flex gap-3 text-sm leading-relaxed text-gray-800 sm:text-base">
                <span className="w-7 shrink-0 text-right font-semibold tabular-nums text-green-700">{index + 1}.</span>
                <span className="min-w-0 whitespace-pre-line">{item}</span>
              </li>
            ))}
          </ol>
          {editable && <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">Last updated {formatDateTime(policy.updatedAt)}{policy.updatedBy ? ` by ${policy.updatedBy}` : ''}</p>}
        </section>
      )))}
    </div>
  );
}

function PolicyEditor({ policy, onSave, onCancel }: { policy?: Policy; onSave: (payload: PolicyInput) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(policy?.title ?? '');
  const [intro, setIntro] = useState(policy?.intro ?? '');
  const [items, setItems] = useState<string[]>(policy?.items.length ? policy.items : ['']);
  const [saving, setSaving] = useState(false);

  const setItem = (index: number, value: string) => setItems((current) => current.map((item, i) => (i === index ? value : item)));
  const move = (index: number, by: -1 | 1) => setItems((current) => {
    const next = [...current];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    return next;
  });

  const save = async () => {
    const rules = items.map((item) => item.trim()).filter(Boolean);
    if (!title.trim()) { toast.error('Enter the title of the policy.'); return; }
    if (!rules.length) { toast.error('Enter at least one rule.'); return; }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), intro: intro.trim(), items: rules });
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to save the policy.');
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border-2 border-green-200 bg-green-50/30 p-5 sm:p-6">
      <label className="block">
        <span className="text-sm font-semibold text-gray-900">Title</span>
        <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="For example Loan Policy" className={`mt-1.5 ${input} bg-white`} />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-gray-900">Introduction</span>
        <span className="ml-2 text-xs text-gray-500">Optional, shown above the rules (for example the program’s vision and mission).</span>
        <textarea value={intro} rows={3} maxLength={5000} onChange={(event) => setIntro(event.target.value)} className={`mt-1.5 ${input} resize-y bg-white`} />
      </label>
      <div>
        <p className="text-sm font-semibold text-gray-900">Rules <span className="ml-1 text-xs font-normal text-gray-500">Numbered in this order. A rule can have more than one line (press Enter).</span></p>
        <ol className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="w-7 shrink-0 pt-2 text-right text-sm font-semibold tabular-nums text-green-700">{index + 1}.</span>
              <textarea
                value={item}
                rows={Math.min(6, Math.max(1, item.split('\n').length))}
                maxLength={2000}
                onChange={(event) => setItem(index, event.target.value)}
                aria-label={`Rule ${index + 1}`}
                className={`${input} min-w-0 flex-1 resize-y bg-white`}
              />
              <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} title="Move up" aria-label={`Move rule ${index + 1} up`} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} title="Move down" aria-label={`Move rule ${index + 1} down`} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => setItems((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : ['']))} title="Remove rule" aria-label={`Remove rule ${index + 1}`} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setItems((current) => [...current, ''])} className="mt-2 ml-9 inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-900"><Plus className="h-4 w-4" />Add rule</button>
      </div>
      <div className="flex justify-end gap-2 border-t border-green-100 pt-4">
        <button type="button" onClick={onCancel} disabled={saving} className={secondary}><X className="h-4 w-4" />Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving} className={primary}><Save className="h-4 w-4" />{saving ? 'Saving…' : policy ? 'Save policy' : 'Add policy'}</button>
      </div>
    </section>
  );
}
