import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { LoaderCircle, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchOrgChart, saveOrgChart, type OrgChart } from '../services/orgChartApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { formatDateTime } from '../../utils/dateTime';

// The cooperative's organizational chart, laid out like the printed chart in
// the office: the General Assembly, the elected Audit and Election Committees
// and Board of Directors, the appointed officers and committees, and the
// management staff. Administrators edit the names; everyone else only reads it.

const THREE: Array<[string, string]> = [['chair', 'Chairperson'], ['vice', 'Vice Chairperson'], ['secretary', 'Secretary']];
type Slot = { key: string; role: string };
const slots = (prefix: string, roles: Array<[string, string]>): Slot[] => roles.map(([key, role]) => ({ key: `${prefix}.${key}`, role }));

const AUDIT = slots('audit', THREE);
const ELECTION = slots('election', THREE);
const BOARD = slots('bod', [['chair', 'Chairperson'], ['vice', 'Vice Chairperson'], ['director1', 'Director'], ['director2', 'Director'], ['director3', 'Director']]);
const COMMITTEES: Array<{ title: string; slots: Slot[] }> = [
  { title: 'Ethics Committee', slots: slots('ethics', THREE) },
  { title: 'Education & Training Committee', slots: slots('education', THREE) },
  { title: 'GAD Committee', slots: slots('gad', THREE) },
  { title: 'Mediation & Conciliation Committee', slots: slots('mediation', THREE) },
];
const STAFF = slots('staff', [['accountant', 'Accountant'], ['bookkeeper', 'Bookkeeper'], ['collector', 'Collector'], ['cashier', 'Cashier']]);

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

type Names = Record<string, string>;
interface SlotProps { names: Names; editing: boolean; onChange: (key: string, value: string) => void }

// One position: a picture spot with the initials, the name and the role.
function Person({ slot, names, editing, onChange, starred = false }: SlotProps & { slot: Slot; starred?: boolean }) {
  const name = names[slot.key] ?? '';
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold ${name ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-400'}`} aria-hidden="true">{name ? initials(name) : ''}</span>
      <span className="min-w-0 flex-1">
        {editing ? (
          <input value={name} onChange={(event) => onChange(slot.key, event.target.value)} maxLength={200} placeholder="Name (blank = vacant)"
            aria-label={`${slot.role}`} className="h-8 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        ) : (
          <span className={`block truncate text-sm font-semibold ${name ? 'text-gray-900' : 'italic text-gray-400'}`} title={name || undefined}>{name || 'Vacant'}</span>
        )}
        <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">{starred && <span className="text-green-700">* </span>}{slot.role}</span>
      </span>
    </li>
  );
}

function Box({ title, children, tone = 'light', dashed = false }: { title: string; children: ReactNode; tone?: 'light' | 'dark'; dashed?: boolean }) {
  return (
    <section className={`overflow-hidden rounded-xl bg-white shadow-sm ${dashed ? 'border-2 border-dashed border-green-600/60' : 'border-2 border-green-700/70'}`} aria-label={title}>
      <h3 className={`px-3 py-1.5 text-center text-xs font-extrabold uppercase tracking-wide ${tone === 'dark' ? 'bg-green-800 text-white' : 'bg-green-100 text-green-900'}`}>{title}</h3>
      <ul className="divide-y divide-gray-100">{children}</ul>
    </section>
  );
}

const Down = ({ dashed = false, className = '' }: { dashed?: boolean; className?: string }) => (
  <div className={`mx-auto h-6 w-0 border-l-2 ${dashed ? 'border-dashed border-green-600/70' : 'border-green-700'} ${className}`} aria-hidden="true" />
);

export function OrgChartView({ names, editing = false, onChange = () => undefined }: { names: Names; editing?: boolean; onChange?: (key: string, value: string) => void }) {
  const p = { names, editing, onChange };
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
        <div><Down className="hidden lg:block" /><Box title="Audit Committee">{AUDIT.map((slot) => <Person key={slot.key} slot={slot} {...p} />)}</Box></div>
        <div>
          <Down className="hidden lg:block" />
          <Box title="Board of Directors" tone="dark">{BOARD.map((slot) => <Person key={slot.key} slot={slot} {...p} />)}</Box>
          <Down dashed />
          <div className="grid grid-cols-2 gap-3">
            <Box title="* Secretary" dashed><Person slot={{ key: 'officer.secretary', role: 'Secretary' }} starred {...p} /></Box>
            <Box title="* Treasurer" dashed><Person slot={{ key: 'officer.treasurer', role: 'Treasurer' }} starred {...p} /></Box>
          </div>
        </div>
        <div><Down className="hidden lg:block" /><Box title="Election Committee">{ELECTION.map((slot) => <Person key={slot.key} slot={slot} {...p} />)}</Box></div>
      </div>

      {/* The committees the board appoints. */}
      <Down dashed />
      <div className="mx-auto hidden h-0 w-[76%] border-t-2 border-dashed border-green-600/70 lg:block" aria-hidden="true" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COMMITTEES.map((committee) => (
          <div key={committee.title}>
            <Down dashed className="hidden lg:block" />
            <Box title={committee.title} dashed>{committee.slots.map((slot) => <Person key={slot.key} slot={slot} {...p} />)}</Box>
          </div>
        ))}
      </div>

      {/* Management staff. */}
      <Down dashed />
      <div className="flex justify-center">
        <div className="rounded-xl border-2 border-green-800 bg-white px-5 py-1.5 text-center text-base font-extrabold uppercase tracking-wide text-gray-900 shadow sm:text-xl">Management Staff</div>
      </div>
      <Down />
      <div className="mx-auto max-w-sm"><Box title="General Manager" tone="dark"><Person slot={{ key: 'staff.manager', role: 'General Manager' }} {...p} /></Box></div>
      <Down dashed />
      <div className="mx-auto hidden h-0 w-[76%] border-t-2 border-dashed border-green-600/70 lg:block" aria-hidden="true" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {STAFF.map((slot) => (
          <div key={slot.key}>
            <Down dashed className="hidden lg:block" />
            <Box title={slot.role} dashed><Person slot={slot} {...p} /></Box>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The chart with its data; `editable`: the administrator's Edit / Save. */
export function OrgChartPanel({ editable = false }: { editable?: boolean }) {
  const [chart, setChart] = useState<OrgChart | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Names | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetchOrgChart().then((data) => { setChart(data); setError(''); }).catch((reason: Error) => setError(reason.message || 'Unable to load the chart.'));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['org_chart_positions'], () => { if (!draft) load(); });

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const saved = await saveOrgChart(draft);
      setChart(saved);
      setDraft(null);
      toast.success('Chart saved');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to save the chart.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !chart) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>;
  if (!chart) return <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the chart…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">{chart.updatedAt ? `Last updated ${formatDateTime(chart.updatedAt)}${editable && chart.updatedBy ? ` by ${chart.updatedBy}` : ''}` : 'The names will show here once the office fills in the chart.'}</p>
        {editable && (draft ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(null)} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200"><X className="h-4 w-4" />Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save chart'}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setDraft({ ...chart.positions })} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-green-600 bg-white px-4 text-sm font-semibold text-green-700 hover:bg-green-50"><Pencil className="h-4 w-4" />Edit chart</button>
        ))}
      </div>
      {draft && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Type the name of whoever holds each position. Leave a name blank for a vacant position, then Save chart.</p>}
      <OrgChartView names={draft ?? chart.positions} editing={Boolean(draft)} onChange={(key, value) => setDraft((current) => ({ ...(current ?? {}), [key]: value }))} />
    </div>
  );
}
