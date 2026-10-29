import { useEffect, useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { createFarmInput, fetchFarmInputs, FARM_INPUT_CATEGORIES, updateFarmInput, type FarmInput, type FarmInputCategory } from '../../app/services/authApi';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../utils/dateTime';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PRICE = /^\d+(\.\d{1,2})?$/;
type Draft = { category: FarmInputCategory; name: string; unit: string; unitPrice: string };
const blankDraft = (category: FarmInputCategory = 'fertilizer'): Draft => ({ category, name: '', unit: '', unitPrice: '' });
const draftValid = (draft: Draft) => draft.name.trim() !== '' && draft.unit.trim() !== '' && PRICE.test(draft.unitPrice.trim()) && Number(draft.unitPrice) > 0;

/**
 * The office's farm input price list for in-kind loans: products under each
 * row of the loan form's in-kind table, with their unit and unit price. Adding
 * a product or changing a price affects new applications only; a product no
 * longer sold is hidden from the form.
 */
export function FarmInputPricesModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<FarmInput[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState<Draft>(blankDraft());
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFarmInputs(true).then(setItems).catch((error) => setLoadError(errorMessage(error, 'Unable to load the price list.')));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const replace = (item: FarmInput) => setItems((current) => (current ?? []).map((row) => (row.id === item.id ? item : row)));
  const run = async (action: () => Promise<void>, failure: string) => {
    setSaving(true);
    try { await action(); } catch (error) { toast.error(failure, { description: errorMessage(error, 'Please try again.') }); } finally { setSaving(false); }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!draftValid(adding) || saving) return;
    void run(async () => {
      const item = await createFarmInput({ ...adding, name: adding.name.trim(), unit: adding.unit.trim(), unitPrice: adding.unitPrice.trim() });
      setItems((current) => [...(current ?? []), item]);
      setAdding(blankDraft(adding.category));
      toast.success('Added to the price list', { description: `${item.name}: ${peso(item.unitPrice)} per ${item.unit}.` });
    }, 'Unable to add the product');
  };

  const save = () => {
    if (!editing || !draftValid(editing.draft) || saving) return;
    const { id, draft } = editing;
    void run(async () => {
      const item = await updateFarmInput(id, { ...draft, name: draft.name.trim(), unit: draft.unit.trim(), unitPrice: draft.unitPrice.trim() });
      replace(item);
      setEditing(null);
      toast.success('Price list updated', { description: `${item.name}: ${peso(item.unitPrice)} per ${item.unit}.` });
    }, 'Unable to save the change');
  };

  const toggle = (item: FarmInput) => void run(async () => { replace(await updateFarmInput(item.id, { active: !item.active })); }, 'Unable to change the product');

  const input = 'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-green-500';
  const draftFields = (draft: Draft, change: (next: Draft) => void, autoFocus = false) => (
    <>
      <input aria-label="Product or description" value={draft.name} onChange={(event) => change({ ...draft, name: event.target.value })} placeholder="e.g. Urea 46-0-0" maxLength={500} className={input} autoFocus={autoFocus} />
      <input aria-label="Unit" value={draft.unit} onChange={(event) => change({ ...draft, unit: event.target.value })} placeholder="bag, kg, L" maxLength={50} className={input} />
      <input aria-label="Unit price" inputMode="decimal" value={draft.unitPrice} onChange={(event) => change({ ...draft, unitPrice: event.target.value })} placeholder="0.00" className={`${input} text-right`} />
    </>
  );

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="farm-input-title">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <h2 id="farm-input-title" className="text-xl font-bold text-gray-900">Farm Input Prices</h2>
            <p className="mt-1 text-sm text-gray-600">Products and unit prices offered in the in-kind table of the loan form. A new price applies to new applications only.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form onSubmit={add} className="rounded-xl border border-green-200 bg-green-50 p-3">
            <p className="mb-2 text-sm font-semibold text-green-900">Add a product</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr_6rem_7rem_auto]">
              <select aria-label="Kind of farm input" value={adding.category} onChange={(event) => setAdding({ ...adding, category: event.target.value as FarmInputCategory })} className={input}>
                {FARM_INPUT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {draftFields(adding, setAdding)}
              <button type="submit" disabled={saving || !draftValid(adding)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Plus className="h-4 w-4" />Add
              </button>
            </div>
          </form>

          {loadError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}</p>
            : !items ? <p className="py-10 text-center text-sm text-gray-500">Loading the price list...</p>
            : FARM_INPUT_CATEGORIES.map(([category, label]) => {
              const rows = items.filter((item) => item.category === category);
              return (
                <section key={category} className="mt-5">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">{label}</h3>
                  {rows.length === 0 ? <p className="mt-1 text-sm text-gray-500">No products yet: the form leaves this row to be filled in by hand.</p> : (
                    <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
                      {rows.map((item) => editing?.id === item.id ? (
                        <li key={item.id} className="grid grid-cols-1 gap-2 bg-gray-50 p-2 sm:grid-cols-[10rem_1fr_6rem_7rem_auto]">
                          <select aria-label="Kind of farm input" value={editing.draft.category} onChange={(event) => setEditing({ id: item.id, draft: { ...editing.draft, category: event.target.value as FarmInputCategory } })} className={input}>
                            {FARM_INPUT_CATEGORIES.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                          </select>
                          {draftFields(editing.draft, (draft) => setEditing({ id: item.id, draft }), true)}
                          <div className="flex gap-1">
                            <button type="button" onClick={save} disabled={saving || !draftValid(editing.draft)} className="inline-flex flex-1 items-center justify-center rounded-lg bg-green-600 px-2.5 py-1.5 text-white hover:bg-green-700 disabled:opacity-60" aria-label="Save"><Check className="h-4 w-4" /></button>
                            <button type="button" onClick={() => setEditing(null)} disabled={saving} className="inline-flex flex-1 items-center justify-center rounded-lg bg-gray-200 px-2.5 py-1.5 text-gray-700 hover:bg-gray-300" aria-label="Cancel"><X className="h-4 w-4" /></button>
                          </div>
                        </li>
                      ) : (
                        <li key={item.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm ${item.active ? '' : 'bg-gray-50 text-gray-500'}`}>
                          <span className="min-w-0 flex-1 font-medium">{item.name}{!item.active && <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">Hidden</span>}</span>
                          <span className="tabular-nums">{peso(item.unitPrice)} <span className="text-gray-500">/ {item.unit}</span></span>
                          <span className="text-xs text-gray-500" title={item.updatedBy ? `by ${item.updatedBy}` : undefined}>Updated {formatDate(item.updatedAt)}</span>
                          <span className="flex gap-1">
                            <button type="button" disabled={saving || Boolean(editing)} onClick={() => setEditing({ id: item.id, draft: { category: item.category, name: item.name, unit: item.unit, unitPrice: item.unitPrice.toFixed(2) } })}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Edit</button>
                            <button type="button" disabled={saving} onClick={() => toggle(item)} className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50">{item.active ? 'Hide' : 'Show'}</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
        </div>
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}
