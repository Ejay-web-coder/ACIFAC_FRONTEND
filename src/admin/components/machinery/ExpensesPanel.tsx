import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SectionCard } from '../../../app/components/common/UiKit';
import type { Machinery } from '../../../app/services/authApi';
import {
  CROPPING_PERIODS, EXPENSE_CATEGORIES, EXPENSE_LABELS, createExpense, deleteExpense, fetchExpenses, updateExpense,
  type CroppingPeriod, type ExpenseCategory, type MachineryExpense,
} from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { Modal, inputClass, labelClass, peso, primaryButton, secondaryButton, yearOptions } from './shared';

const selectClass = 'h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm';

function ExpenseModal({ machinery, expense, defaults, onClose, onSaved }: {
  machinery: Machinery[];
  expense: MachineryExpense | null;
  defaults: { machineryId: string; croppingPeriod: string; year: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    machineryId: expense?.machineryId ?? (defaults.machineryId || machinery[0]?.id || ''),
    expenseDate: expense?.expenseDate ?? dateOnlyToday(),
    croppingPeriod: (expense?.croppingPeriod ?? (defaults.croppingPeriod || '1st')) as CroppingPeriod,
    year: String(expense?.year ?? (defaults.year || dateOnlyToday().slice(0, 4))),
    category: (expense?.category ?? 'fuel') as ExpenseCategory,
    amount: expense ? expense.amount.toFixed(2) : '',
    description: expense?.description ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, year: Number(form.year), description: form.description.trim() };
      if (expense) await updateExpense(expense.id, payload);
      else await createExpense(payload);
      toast.success(expense ? 'Expense updated' : 'Expense recorded');
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the expense.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={expense ? 'Edit Expense' : 'Record Expense'} description="Operating expenses appear in the cash flow statement of their cropping." onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button type="submit" form="expense-form" disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Save expense'}</button></>}>
      <form id="expense-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>Machine
          <select required value={form.machineryId} onChange={(event) => set('machineryId', event.target.value)} className={inputClass}>
            {machinery.map((machine) => <option key={machine.id} value={machine.id}>{machine.name} ({machine.id}){machine.parentMachineryId ? ` · attached to ${machine.parentMachineryId}` : ''}</option>)}
          </select>
        </label>
        <label className={labelClass}>Category
          <select value={form.category} onChange={(event) => set('category', event.target.value)} className={inputClass}>
            {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{EXPENSE_LABELS[category]}</option>)}
          </select>
        </label>
        <label className={labelClass}>Amount (₱)
          <input required inputMode="decimal" value={form.amount} onChange={(event) => set('amount', event.target.value)} className={inputClass} placeholder="0.00" />
        </label>
        <label className={labelClass}>Date
          <input required type="date" max={dateOnlyToday()} value={form.expenseDate} onChange={(event) => { set('expenseDate', event.target.value); if (event.target.value) set('year', event.target.value.slice(0, 4)); }} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={labelClass}>Cropping
            <select value={form.croppingPeriod} onChange={(event) => set('croppingPeriod', event.target.value)} className={inputClass}>
              {CROPPING_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}
            </select>
          </label>
          <label className={labelClass}>Year
            <input required type="number" min={2000} max={2100} value={form.year} onChange={(event) => set('year', event.target.value)} className={inputClass} />
          </label>
        </div>
        <label className={`${labelClass} sm:col-span-2`}>Description
          <input value={form.description} onChange={(event) => set('description', event.target.value)} maxLength={1000} className={inputClass} placeholder="e.g. 20 L diesel, operator wage" />
        </label>
      </form>
    </Modal>
  );
}

export function ExpensesPanel({ machinery }: { machinery: Machinery[] }) {
  const currentYear = Number(dateOnlyToday().slice(0, 4));
  const [filters, setFilters] = useState({ machineryId: '', croppingPeriod: '', year: String(currentYear), category: '' });
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchExpenses>> | null>(null);
  const [editing, setEditing] = useState<MachineryExpense | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setData(await fetchExpenses(filters));
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to load expenses.'));
    }
  }, [filters]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['machinery_expenses'], () => { void load(); });

  const remove = async (expense: MachineryExpense) => {
    if (!window.confirm(`Delete the ${peso(expense.amount)} ${EXPENSE_LABELS[expense.category].toLowerCase()} expense of ${formatDate(expense.expenseDate)}?`)) return;
    try {
      await deleteExpense(expense.id);
      toast.success('Expense deleted');
      void load();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to delete the expense.'));
    }
  };

  const setFilter = (field: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [field]: value }));

  return (
    <SectionCard
      title="Operating expenses"
      description="Fuel, labor, repair & maintenance and other costs per machine. An implement's expenses count under its tractor in the report."
      actions={<button type="button" onClick={() => setEditing(null)} className={primaryButton}><Plus className="h-4 w-4" />Record Expense</button>}
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 gap-3 border-b border-gray-100 p-4 md:grid-cols-4">
        <select aria-label="Machine" value={filters.machineryId} onChange={(event) => setFilter('machineryId', event.target.value)} className={`${selectClass} col-span-2 md:col-span-1`}>
          <option value="">All machines</option>
          {machinery.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
        </select>
        <select aria-label="Cropping period" value={filters.croppingPeriod} onChange={(event) => setFilter('croppingPeriod', event.target.value)} className={selectClass}>
          <option value="">All croppings</option>
          {CROPPING_PERIODS.map((period) => <option key={period} value={period}>{period} cropping</option>)}
        </select>
        <select aria-label="Year" value={filters.year} onChange={(event) => setFilter('year', event.target.value)} className={selectClass}>
          <option value="">All years</option>
          {yearOptions(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select aria-label="Category" value={filters.category} onChange={(event) => setFilter('category', event.target.value)} className={selectClass}>
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{EXPENSE_LABELS[category]}</option>)}
        </select>
      </div>

      {data && (
        <dl className="grid grid-cols-2 gap-px bg-gray-100 text-center sm:grid-cols-5">
          {[...EXPENSE_CATEGORIES.map((category) => [EXPENSE_LABELS[category], data.totals[category]] as const), ['Total', data.totals.total] as const].map(([label, value]) => (
            <div key={label} className="bg-white px-3 py-3"><dt className="text-xs text-gray-500">{label}</dt><dd className={`font-bold tabular-nums ${label === 'Total' ? 'text-green-800' : 'text-gray-900'}`}>{peso(value)}</dd></div>
          ))}
        </dl>
      )}

      <div className="relative overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Machine</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data?.expenses ?? []).map((expense) => (
              <tr key={expense.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(expense.expenseDate, true)}<span className="block text-xs text-gray-500">{expense.croppingPeriod} cropping {expense.year}</span></td>
                <td className="px-4 py-3 text-gray-700">{expense.machineryName}</td>
                <td className="px-4 py-3 text-gray-700">{EXPENSE_LABELS[expense.category]}</td>
                <td className="px-4 py-3 text-gray-600">{expense.description || '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{peso(expense.amount)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button type="button" onClick={() => setEditing(expense)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800" aria-label="Edit expense"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => void remove(expense)} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700" aria-label="Delete expense"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {data && data.expenses.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No expenses match these filters.</td></tr>}
            {!data && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Loading expenses…</td></tr>}
          </tbody>
        </table>
      </div>

      {editing !== undefined && (
        <ExpenseModal machinery={machinery} expense={editing} defaults={filters} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void load(); }} />
      )}
    </SectionCard>
  );
}
