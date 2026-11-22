import { useCallback, useEffect, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CircleDollarSign, Landmark, PhilippinePeso, PiggyBank, Plus, Store, Trash2, Tractor, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminDashboardData } from '../../../app/services/authApi';
import { deleteOtherIncome, fetchOtherIncome, OTHER_INCOME_SOURCES, recordOtherIncome, type OtherIncomeEntry } from '../../../app/services/otherIncomeApi';
import { confirmAction } from '../../../app/components/common/ConfirmDialog';
import { errorMessage } from '../../../lib/api';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';

type Stats = AdminDashboardData['stats'];
type Icon = ComponentType<{ className?: string }>;

const peso = (value: number | null | undefined) => `₱${Number(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shorter names for the statutory funds.
const FUND_NAMES: Record<string, string> = { reserve: 'Reserve Fund', education: 'Education & Training', community: 'Community Development', optional: 'Optional Fund' };

// What each part of the capital is, and where it is kept.
const CAPITAL_PARTS: Record<string, { text: string; href?: string; module?: string; icon: Icon }> = {
  shareCapital: { text: 'Share capital the members contributed.', href: '/admin/savings', module: 'Savings & Share Capital', icon: Landmark },
  savings: { text: 'Members\' savings: deposits less withdrawals.', href: '/admin/savings', module: 'Savings & Share Capital', icon: PiggyBank },
  loans: { text: 'Loan payments collected less the loans released: below zero while money lent out is still to be collected.', href: '/admin/loans', module: 'Loans & Payments', icon: PhilippinePeso },
  machinery: { text: 'Rental and service fees collected and other machinery income, less machinery expenses.', href: '/admin/machinery', module: 'Machinery Operations', icon: Tractor },
  kadiwa: { text: 'Net sales: sales less the expenses entered with each sale.', href: '/admin/kadiwa', module: 'Kadiwa Store', icon: Store },
};

// Where the net income comes from.
const INCOME_SOURCES: Array<{ key: 'kadiwa' | 'machinery' | 'loans'; title: string; text: string; href: string; module: string; icon: Icon }> = [
  { key: 'kadiwa', title: 'Kadiwa Store income', text: 'Net sales: sales less the expenses entered with each sale.', href: '/admin/kadiwa', module: 'Kadiwa Store', icon: Store },
  { key: 'machinery', title: 'Machinery income', text: 'Rental fees of rentals that have started, service fees collected and other income, less machinery expenses.', href: '/admin/machinery', module: 'Machinery Operations', icon: Tractor },
  { key: 'loans', title: 'Loan income', text: 'Interest and late penalties collected from loan payments. Principal repaid is not income.', href: '/admin/loans', module: 'Loans & Payments', icon: PhilippinePeso },
];

/** A window over the dashboard: Escape or a click outside closes it. */
function Window({ id, title, subtitle, onClose, children, footer, wide = false }: {
  id: string; title: string; subtitle: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby={id} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`flex max-h-[92vh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id={id} className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={`Close ${title}`}><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer}
      </div>
    </div>
  );
}

/** One line of a breakdown: icon, title and amount, what it is, and a link to its module. */
function PartRow({ icon: PartIcon, title, amount, text, href, module, children }: {
  icon: Icon; title: string; amount: number; text: string; href?: string; module?: string; children?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700 ring-1 ring-green-100"><PartIcon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-gray-900">{title}</p>
          <p className={`shrink-0 text-lg font-bold tabular-nums ${amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>{peso(amount)}</p>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{text}</p>
        {href && <Link to={href} className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-green-700 hover:underline">Open {module}<ChevronRight className="h-3.5 w-3.5" /></Link>}
        {children}
      </div>
    </li>
  );
}

/** Others: membership fees, absence fines and transfer fees, and other income the office records. */
function OthersRow({ stats, onRecord }: { stats: Stats; onRecord: () => void }) {
  const others = stats.othersBreakdown ?? { membershipFees: 0, duesFines: 0, recorded: 0 };
  const total = stats.netIncomeBreakdown.others ?? others.membershipFees + others.duesFines + others.recorded;
  return (
    <PartRow icon={Wallet} title="Others" amount={total} text="Other money that came into the cooperative:">
      <dl className="mt-1.5 space-y-0.5 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
        <div className="flex justify-between gap-3"><dt>Membership fees (members&apos; forms)</dt><dd className="tabular-nums">{peso(others.membershipFees)}</dd></div>
        <div className="flex justify-between gap-3"><dt><Link to="/admin/dues" className="hover:underline">Absence fines and transfer fees collected (Dues)</Link></dt><dd className="tabular-nums">{peso(others.duesFines)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Other income recorded by the office</dt><dd className="tabular-nums">{peso(others.recorded)}</dd></div>
      </dl>
      <button type="button" onClick={onRecord} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-green-600 px-3 text-xs font-semibold text-green-700 hover:bg-green-50">
        <Plus className="h-3.5 w-3.5" />Record other income (donations, grants, interest…)
      </button>
    </PartRow>
  );
}

function TotalBar({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t-2 border-gray-200 bg-gray-50 px-5 py-4">
      <p className="font-bold text-gray-900">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${amount < 0 ? 'text-red-600' : 'text-green-800'}`}>{peso(amount)}</p>
    </div>
  );
}

/** Where the cooperative's money is: share capital, savings, loans, machinery, Kadiwa Store and others. */
export function CapitalBreakdownModal({ stats, onClose, onRecordOther }: { stats: Stats; onClose: () => void; onRecordOther: () => void }) {
  const parts = stats.capital?.parts ?? [];
  return (
    <Window id="capital-title" title="Capital" subtitle="The cash the cooperative holds, all records to date" onClose={onClose} footer={<TotalBar label="Total Capital" amount={stats.capital?.total ?? 0} />}>
      <ul className="divide-y divide-gray-100">
        {parts.map((part) => part.key === 'others'
          ? <OthersRow key={part.key} stats={stats} onRecord={onRecordOther} />
          : <PartRow key={part.key} icon={CAPITAL_PARTS[part.key]?.icon ?? CircleDollarSign} title={part.label} amount={part.amount} text={CAPITAL_PARTS[part.key]?.text ?? ''} href={CAPITAL_PARTS[part.key]?.href} module={CAPITAL_PARTS[part.key]?.module} />)}
      </ul>
    </Window>
  );
}

/** Where the net income comes from, then how it is set aside and shared out. */
export function NetIncomeBreakdownModal({ stats, onClose, onRecordOther }: { stats: Stats; onClose: () => void; onRecordOther: () => void }) {
  const shares = stats.netIncomeShares ?? [];
  return (
    <Window id="net-income-title" title="Net Income" subtitle="All records to date, by source" onClose={onClose}>
      <ul className="divide-y divide-gray-100">
        {INCOME_SOURCES.map((source) => (
          <PartRow key={source.key} icon={source.icon} title={source.title} amount={stats.netIncomeBreakdown[source.key]} text={source.text} href={source.href} module={source.module} />
        ))}
        <OthersRow stats={stats} onRecord={onRecordOther} />
      </ul>
      <TotalBar label="Total Net Income" amount={stats.netIncome} />
      <section className="px-5 py-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">How it is set aside and shared out</h3>
        <dl className="mt-2 space-y-1 text-sm">
          {stats.statutoryFunds.map((fund) => (
            <div key={fund.key} className="flex justify-between gap-3"><dt className="text-gray-700">{FUND_NAMES[fund.key] ?? fund.label} ({fund.percent}%)</dt><dd className="tabular-nums text-gray-900">{peso(fund.amount)}</dd></div>
          ))}
          {shares.map((share, index) => (
            <div key={share.key} className={`flex justify-between gap-3 font-semibold text-green-800 ${index === 0 ? 'mt-1 border-t border-gray-200 pt-2' : ''}`}><dt>{share.label} ({share.percent}%)</dt><dd className="tabular-nums">{peso(share.amount)}</dd></div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-gray-500">Statutory funds are set aside first; dividends on share capital and patronage refunds are shared out to the members.</p>
      </section>
    </Window>
  );
}

const inputClass = 'mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200';

/** The other income the office records: the list, a form to add one, and deleting one recorded by mistake. */
export function OtherIncomeModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [entries, setEntries] = useState<OtherIncomeEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ receivedOn: dateOnlyToday(), source: '', amount: '', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchOtherIncome()
      .then((result) => { setEntries(result.entries); setTotal(result.total); setLoadError(''); })
      .catch((error) => setLoadError(errorMessage(error, 'Unable to load other income.')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const amountValid = /^\d+(\.\d{1,2})?$/.test(form.amount.trim()) && Number(form.amount) > 0;
  const ready = Boolean(form.receivedOn) && form.source.trim() !== '' && amountValid;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    try {
      await recordOtherIncome({ receivedOn: form.receivedOn, source: form.source.trim(), amount: form.amount.trim(), reference: form.reference.trim() || undefined, notes: form.notes.trim() || undefined });
      toast.success('Other income recorded', { description: `${form.source.trim()}: ${peso(Number(form.amount))}` });
      setForm({ receivedOn: dateOnlyToday(), source: '', amount: '', reference: '', notes: '' });
      load();
      onChanged();
    } catch (error) {
      toast.error('Unable to record the other income', { description: errorMessage(error, 'Please try again.') });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: OtherIncomeEntry) => {
    if (!(await confirmAction(`Delete ${entry.source} of ${peso(entry.amount)} (${formatDate(entry.receivedOn)})? Only delete an entry recorded by mistake; the audit log keeps it.`, { confirmLabel: 'Delete', danger: true }))) return;
    setDeleting(entry.id);
    try {
      await deleteOtherIncome(entry.id);
      toast.success('Other income deleted');
      load();
      onChanged();
    } catch (error) {
      toast.error('Unable to delete it', { description: errorMessage(error, 'Please try again.') });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Window id="other-income-title" title="Other Income" subtitle="Money from outside the cooperative's modules: donations, grants, bank interest, rent…" onClose={onClose} wide
      footer={<TotalBar label="Recorded other income" amount={total} />}>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 border-b border-gray-200 px-5 py-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Date received *
          <input type="date" required max={dateOnlyToday()} value={form.receivedOn} onChange={(event) => setForm({ ...form, receivedOn: event.target.value })} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700">Amount (₱) *
          <input inputMode="decimal" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" aria-invalid={(form.amount !== '' && !amountValid) || undefined} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">Source *
          <input list="other-income-sources" required maxLength={200} value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="e.g., Donation from the municipality" className={inputClass} />
          <datalist id="other-income-sources">{OTHER_INCOME_SOURCES.map((source) => <option key={source} value={source} />)}</datalist>
        </label>
        <label className="text-sm font-medium text-gray-700">Reference / OR No. <span className="font-normal text-gray-500">(optional)</span>
          <input maxLength={100} value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700">Notes <span className="font-normal text-gray-500">(optional)</span>
          <input maxLength={1000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} />
        </label>
        <div className="flex items-end justify-end sm:col-span-2">
          <button type="submit" disabled={!ready || saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" />{saving ? 'Recording…' : 'Record other income'}
          </button>
        </div>
      </form>
      <div className="px-5 py-4">
        {loadError ? <p className="text-sm text-red-700">{loadError}</p>
          : entries === null ? <p className="text-sm text-gray-500">Loading…</p>
            : entries.length === 0 ? <p className="text-sm text-gray-500">No other income recorded yet.</p>
              : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium text-gray-900" title={entry.source}>{entry.source}</p>
                          <p className="shrink-0 font-semibold tabular-nums text-gray-900">{peso(entry.amount)}</p>
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatDate(entry.receivedOn)}{entry.reference ? ` · Ref. ${entry.reference}` : ''}{entry.recordedBy ? ` · Recorded by ${entry.recordedBy}` : ''}
                        </p>
                        {entry.notes && <p className="mt-0.5 break-words text-xs text-gray-600">{entry.notes}</p>}
                      </div>
                      <button type="button" onClick={() => void remove(entry)} disabled={deleting === entry.id} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50" aria-label={`Delete ${entry.source}`} title="Recorded by mistake: delete it">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
      </div>
    </Window>
  );
}
