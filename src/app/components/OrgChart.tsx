import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteOrgChartPhoto, fetchOrgChart, orgChartPhotoPath, saveOrgChart, uploadOrgChartPhoto,
  type OrgChart, type OrgChartCommittee, type OrgChartEntry, type OrgChartGroup,
} from '../services/orgChartApi';
import { fetchProtectedImage } from '../../lib/profilePhoto';
import { formatDateTime } from '../../utils/dateTime';

// The cooperative's organizational chart, laid out like the printed chart in
// the office: the General Assembly, the elected Audit and Election Committees
// and Board of Directors, the appointed officers and committees, and the
// management staff. Each position has a name and a 2x2 picture. Administrators
// edit the names, add positions and committees and set the pictures; everyone
// else only reads it.

/** An entry as shown or edited; key is the id, or a temporary key for one added and not saved yet. */
interface Draft { key: string; id?: number; group: OrgChartGroup; role: string; name: string; hasPhoto: boolean; custom: boolean; updatedAt: string }
const toDraft = (entry: OrgChartEntry): Draft => ({ key: String(entry.id), ...entry });

const COMMITTEES: Array<{ group: OrgChartGroup; title: string }> = [
  { group: 'ethics', title: 'Ethics Committee' },
  { group: 'education', title: 'Education & Training Committee' },
  { group: 'gad', title: 'GAD Committee' },
  { group: 'mediation', title: 'Mediation & Conciliation Committee' },
];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_COMMITTEES = 20;
// A key for a committee added while editing; the server keeps it ('c-' + letters and digits).
const newCommitteeKey = (): OrgChartCommittee['key'] => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

interface Editing {
  editing: boolean;
  onChange: (key: string, patch: Partial<Draft>) => void;
  onRemove: (key: string) => void;
  onAdd: (group: OrgChartGroup, role: string) => void;
  onPhoto: (entry: Draft, file: File | null) => void;
  busyPhoto: string | null;
  onAddCommittee: () => void;
  onRenameCommittee: (key: OrgChartCommittee['key'], title: string) => void;
  onRemoveCommittee: (key: OrgChartCommittee['key']) => void;
}

// The 2x2 picture (initials until one is set). While editing, it can be clicked to choose one.
function Picture({ entry, editing, onPhoto, busy }: { entry: Draft; editing: boolean; onPhoto: Editing['onPhoto']; busy: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!entry.hasPhoto || !entry.id) { setUrl(null); return undefined; }
    let active = true;
    let made: string | null = null;
    fetchProtectedImage(orgChartPhotoPath({ id: entry.id, updatedAt: entry.updatedAt })).then((result) => {
      if (!active) { if (result) URL.revokeObjectURL(result); return; }
      made = result;
      setUrl(result);
    }).catch(() => undefined);
    return () => { active = false; if (made) URL.revokeObjectURL(made); };
  }, [entry.hasPhoto, entry.id, entry.updatedAt]);

  const face = url
    ? <img src={url} alt={entry.name ? `${entry.name}, ${entry.role}` : entry.role} className="h-full w-full object-cover" />
    : <span className={`text-sm font-bold ${entry.name ? 'text-green-800' : 'text-gray-400'}`}>{entry.name ? initials(entry.name) : ''}</span>;
  const box = `relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md border ${entry.name ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`;
  if (!editing) return <span className={box} aria-hidden={!url}>{face}</span>;
  const saved = Boolean(entry.id);
  return (
    <span className="flex shrink-0 flex-col items-center gap-0.5">
      <button type="button" onClick={() => input.current?.click()} disabled={!saved || busy} className={`${box} group disabled:cursor-not-allowed`}
        title={saved ? 'Choose a 2x2 picture' : 'Save the chart first, then add the picture'} aria-label={`2x2 picture of ${entry.role}`}>
        {face}
        <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </span>
      </button>
      {entry.hasPhoto && <button type="button" onClick={() => onPhoto(entry, null)} disabled={busy} className="text-[11px] font-semibold text-red-700 hover:underline">Remove</button>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onPhoto(entry, file); }} />
    </span>
  );
}

// One position: the picture, the name and the role.
function Person({ entry, starred = false, ...edit }: Editing & { entry: Draft; starred?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <Picture entry={entry} editing={edit.editing} onPhoto={edit.onPhoto} busy={edit.busyPhoto === entry.key} />
      <span className="min-w-0 flex-1 space-y-1">
        {edit.editing ? (
          <>
            <input value={entry.name} onChange={(event) => edit.onChange(entry.key, { name: event.target.value })} maxLength={200} placeholder="Name (blank = vacant)"
              aria-label={`Name of the ${entry.role}`} className="h-8 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            {entry.custom ? (
              <span className="flex gap-1">
                <input value={entry.role} onChange={(event) => edit.onChange(entry.key, { role: event.target.value })} maxLength={120} placeholder="Position, e.g. Director"
                  aria-label="Position" className="h-7 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button type="button" onClick={() => edit.onRemove(entry.key)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-red-700 hover:bg-red-50" aria-label={`Remove ${entry.role || 'this position'}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            ) : <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">{starred && <span className="text-green-700">* </span>}{entry.role}</span>}
          </>
        ) : (
          <>
            <span className={`block break-words text-sm font-semibold leading-snug ${entry.name ? 'text-gray-900' : 'italic text-gray-400'}`} title={entry.name || undefined}>{entry.name || 'Vacant'}</span>
            <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">{starred && <span className="text-green-700">* </span>}{entry.role}</span>
          </>
        )}
      </span>
    </li>
  );
}

function Box({ title, heading, children, tone = 'light', dashed = false, footer }: { title: string; heading?: ReactNode; children: ReactNode; tone?: 'light' | 'dark'; dashed?: boolean; footer?: ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-xl bg-white shadow-sm ${dashed ? 'border-2 border-dashed border-green-600/60' : 'border-2 border-green-700/70'}`} aria-label={title}>
      {heading ?? <h3 className={`px-3 py-1.5 text-center text-xs font-extrabold uppercase tracking-wide ${tone === 'dark' ? 'bg-green-800 text-white' : 'bg-green-100 text-green-900'}`}>{title}</h3>}
      <ul className="divide-y divide-gray-100">{children}</ul>
      {footer}
    </section>
  );
}

const AddButton = ({ onClick, label = 'Add position' }: { onClick: () => void; label?: string }) => (
  <button type="button" onClick={onClick} className="flex w-full items-center justify-center gap-1.5 border-t border-dashed border-green-300 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50"><Plus className="h-3.5 w-3.5" />{label}</button>
);

const Down = ({ dashed = false, className = '' }: { dashed?: boolean; className?: string }) => (
  <div className={`mx-auto h-6 w-0 border-l-2 ${dashed ? 'border-dashed border-green-600/70' : 'border-green-700'} ${className}`} aria-hidden="true" />
);

export function OrgChartView({ entries, committees, ...edit }: Editing & { entries: Draft[]; committees: OrgChartCommittee[] }) {
  const of = (group: OrgChartGroup) => entries.filter((entry) => entry.group === group);
  // A box listing its positions, with Add position while editing.
  const listBox = (group: OrgChartGroup, title: string, options: { tone?: 'light' | 'dark'; dashed?: boolean; newRole?: string; heading?: ReactNode } = {}) => (
    <Box title={title} heading={options.heading} tone={options.tone} dashed={options.dashed} footer={edit.editing ? <AddButton onClick={() => edit.onAdd(group, options.newRole ?? '')} /> : undefined}>
      {of(group).map((entry) => <Person key={entry.key} entry={entry} {...edit} />)}
    </Box>
  );
  // Boxes of one position each (the officers, the staff), with Add while editing.
  const tiles = (group: OrgChartGroup, starred: boolean) => [
    ...of(group).map((entry) => (
      <div key={entry.key}>
        <Down dashed className="hidden lg:block" />
        <Box title={`${starred ? '* ' : ''}${entry.role || 'New position'}`} dashed><Person entry={entry} starred={starred} {...edit} /></Box>
      </div>
    )),
    ...(edit.editing ? [<div key="add" className="flex items-end"><button type="button" onClick={() => edit.onAdd(group, '')} className="flex min-h-20 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-green-300 bg-white/60 text-sm font-semibold text-green-700 hover:bg-green-50"><Plus className="h-4 w-4" />Add position</button></div>] : []),
  ];

  // While editing, an added committee's name is typed in its heading, beside Remove committee.
  const committeeHeading = (committee: OrgChartCommittee) => (edit.editing ? (
    <div className="flex items-center gap-1 bg-green-100 px-2 py-1">
      <input value={committee.title} onChange={(event) => edit.onRenameCommittee(committee.key, event.target.value)} maxLength={120} placeholder="Committee name"
        aria-label="Committee name" className="h-7 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 text-center text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-green-500" />
      <button type="button" onClick={() => edit.onRemoveCommittee(committee.key)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-red-700 hover:bg-red-50"
        aria-label={`Remove the committee ${committee.title}`.trim()} title="Remove this committee and its positions"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  ) : undefined);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-sky-50 via-green-50 to-green-100/60 p-4 sm:p-6">
      {/* Title and legend, as on the printed chart. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <img src="/logo.png" alt="ACIFAC logo" className="h-14 w-14 shrink-0 rounded-full border-2 border-white object-cover shadow sm:h-20 sm:w-20" />
          <div>
            <p className="text-base font-extrabold uppercase leading-tight text-gray-800 sm:text-2xl">Amnay Cabagan Irrigators &amp; Farmers Agriculture Cooperative</p>
            <p className="text-lg font-extrabold text-green-800 sm:text-2xl">(ACIFAC)</p>
          </div>
        </div>
        <ul className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 rounded-xl bg-white/70 px-3 py-2 text-xs text-gray-700 lg:flex-col" aria-label="Legend">
          <li className="flex items-center gap-2"><span className="w-6 border-t-2 border-green-700" />Elected</li>
          <li className="flex items-center gap-2"><span className="w-6 border-t-2 border-dashed border-green-600" />Appointed</li>
          <li className="flex items-center gap-2"><span className="w-6 text-center font-bold text-green-700">*</span>Outside the BOD</li>
        </ul>
      </div>

      {/* General Assembly, over the elected committees and the board. */}
      <div className="mt-6 flex justify-center">
        <div className="rounded-xl border-2 border-green-800 bg-white px-6 py-2 text-center text-lg font-extrabold uppercase tracking-wide text-gray-900 shadow sm:text-2xl">General Assembly</div>
      </div>
      <Down />
      <div className="mx-auto hidden h-0 w-[66%] border-t-2 border-green-700 lg:block" aria-hidden="true" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr_1fr] lg:items-start">
        <div><Down className="hidden lg:block" />{listBox('audit', 'Audit Committee', { newRole: 'Member' })}</div>
        <div>
          <Down className="hidden lg:block" />
          {listBox('bod', 'Board of Directors', { tone: 'dark', newRole: 'Director' })}
          <Down dashed />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">{tiles('officers', true)}</div>
        </div>
        <div><Down className="hidden lg:block" />{listBox('election', 'Election Committee', { newRole: 'Member' })}</div>
      </div>

      {/* The committees the board appoints. */}
      <Down dashed />
      <div className="mx-auto hidden h-0 w-[76%] border-t-2 border-dashed border-green-600/70 lg:block" aria-hidden="true" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
        {COMMITTEES.map((committee) => (
          <div key={committee.group}>
            <Down dashed className="hidden lg:block" />
            {listBox(committee.group, committee.title, { dashed: true, newRole: 'Member' })}
          </div>
        ))}
        {committees.map((committee) => (
          <div key={committee.key}>
            <Down dashed className="hidden lg:block" />
            {listBox(committee.key, committee.title || 'New committee', { dashed: true, newRole: 'Member', heading: committeeHeading(committee) })}
          </div>
        ))}
        {edit.editing && committees.length < MAX_COMMITTEES && (
          <div className="flex lg:pt-6">
            <button type="button" onClick={edit.onAddCommittee} className="flex min-h-32 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-green-300 bg-white/60 text-sm font-semibold text-green-700 hover:bg-green-50"><Plus className="h-4 w-4" />Add committee</button>
          </div>
        )}
      </div>

      {/* Management staff. */}
      <Down dashed />
      <div className="flex justify-center">
        <div className="rounded-xl border-2 border-green-800 bg-white px-5 py-1.5 text-center text-base font-extrabold uppercase tracking-wide text-gray-900 shadow sm:text-xl">Management Staff</div>
      </div>
      <Down />
      <div className="mx-auto max-w-sm">{listBox('manager', 'General Manager', { tone: 'dark', newRole: 'Assistant Manager' })}</div>
      <Down dashed />
      <div className="mx-auto hidden h-0 w-[76%] border-t-2 border-dashed border-green-600/70 lg:block" aria-hidden="true" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 lg:gap-4">{tiles('staff', false)}</div>
    </div>
  );
}

/** The chart with its data; `editable`: the administrator's Edit, Add position, pictures and Save. */
export function OrgChartPanel({ editable = false }: { editable?: boolean }) {
  const [chart, setChart] = useState<OrgChart | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [draftCommittees, setDraftCommittees] = useState<OrgChartCommittee[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  const newKey = useRef(0);

  const load = useCallback(() => {
    fetchOrgChart().then((data) => { setChart(data); setError(''); }).catch((reason: Error) => setError(reason.message || 'Unable to load the chart.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  // A picture is saved at once (the names wait for Save chart); the draft keeps what was typed.
  const applyPhotoResult = (result: OrgChart, key: string) => {
    setChart(result);
    const saved = result.entries.find((entry) => String(entry.id) === key);
    if (saved) setDraft((current) => current?.map((entry) => (entry.key === key ? { ...entry, hasPhoto: saved.hasPhoto, updatedAt: saved.updatedAt } : entry)) ?? null);
  };
  const onPhoto = async (entry: Draft, file: File | null) => {
    if (!entry.id || busyPhoto) return;
    if (file && file.size > MAX_PHOTO_BYTES) { toast.error('Choose a picture of at most 5 MB.'); return; }
    setBusyPhoto(entry.key);
    try {
      applyPhotoResult(file ? await uploadOrgChartPhoto(entry.id, file) : await deleteOrgChartPhoto(entry.id), entry.key);
      toast.success(file ? 'Picture saved' : 'Picture removed');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to save the picture.');
    } finally {
      setBusyPhoto(null);
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    const unnamed = draft.find((entry) => entry.custom && !entry.role.trim());
    if (unnamed) { toast.error('Enter the position of every position you added (for example Director), or remove it.'); return; }
    if (draftCommittees.some((committee) => !committee.title.trim())) { toast.error('Enter the name of every committee you added, or remove it.'); return; }
    setSaving(true);
    try {
      const saved = await saveOrgChart(
        draft.map((entry) => ({ id: entry.id, group: entry.group, role: entry.role.trim(), name: entry.name.trim() })),
        draftCommittees.map((committee) => ({ key: committee.key, title: committee.title.trim() })),
      );
      setChart(saved);
      setDraft(null);
      setDraftCommittees([]);
      toast.success('Chart saved');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to save the chart.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !chart) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>;
  if (!chart) return <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the chart…</p>;

  const shown = draft ?? chart.entries.map(toDraft);
  const shownCommittees = draft ? draftCommittees : chart.committees ?? [];
  const editing: Editing = {
    editing: Boolean(draft),
    busyPhoto,
    onPhoto: (entry, file) => { void onPhoto(entry, file); },
    onChange: (key, patch) => setDraft((current) => current?.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)) ?? null),
    onRemove: (key) => setDraft((current) => current?.filter((entry) => entry.key !== key) ?? null),
    onAdd: (group, role) => {
      newKey.current += 1;
      setDraft((current) => [...(current ?? []), { key: `new-${newKey.current}`, group, role, name: '', hasPhoto: false, custom: true, updatedAt: '' }]);
    },
    // A new committee starts with a chairperson, a vice chairperson and a secretary (each can be removed).
    onAddCommittee: () => {
      const key = newCommitteeKey();
      setDraftCommittees((current) => [...current, { key, title: '' }]);
      const roles = ['Chairperson', 'Vice Chairperson', 'Secretary'].map((role) => {
        newKey.current += 1;
        return { key: `new-${newKey.current}`, group: key, role, name: '', hasPhoto: false, custom: true, updatedAt: '' };
      });
      setDraft((current) => [...(current ?? []), ...roles]);
    },
    onRenameCommittee: (key, title) => setDraftCommittees((current) => current.map((committee) => (committee.key === key ? { ...committee, title } : committee))),
    onRemoveCommittee: (key) => {
      const committee = draftCommittees.find((item) => item.key === key);
      const filled = (draft ?? []).some((entry) => entry.group === key && (entry.name.trim() || entry.hasPhoto));
      if (filled && !window.confirm(`Remove the committee${committee?.title ? ` ${committee.title}` : ''} and all its positions? Their names and pictures are deleted when you save the chart.`)) return;
      setDraftCommittees((current) => current.filter((item) => item.key !== key));
      setDraft((current) => current?.filter((entry) => entry.group !== key) ?? null);
    },
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">{chart.updatedAt ? `Last updated ${formatDateTime(chart.updatedAt)}${editable && chart.updatedBy ? ` by ${chart.updatedBy}` : ''}` : 'The names will show here once the office fills in the chart.'}</p>
        {editable && (draft ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setDraft(null); setDraftCommittees([]); }} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200"><X className="h-4 w-4" />Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save chart'}</button>
          </div>
        ) : (
          <button type="button" onClick={() => { setDraft(chart.entries.map(toDraft)); setDraftCommittees(chart.committees ?? []); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-green-600 bg-white px-4 text-sm font-semibold text-green-700 hover:bg-green-50"><Pencil className="h-4 w-4" />Edit chart</button>
        ))}
      </div>
      {draft && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Type the names (blank = vacant), use Add position for a new one or Add committee for a new committee box, and click a picture square to choose a 2x2 picture (saved at once). Then Save chart. A new position gets its picture after the chart is saved.</p>}
      <OrgChartView entries={shown} committees={shownCommittees} {...editing} />
    </div>
  );
}
