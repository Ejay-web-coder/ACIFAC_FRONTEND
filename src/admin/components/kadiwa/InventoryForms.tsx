import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createKadiwaInventory, deleteKadiwaInventory, updateKadiwaInventory,
  type KadiwaInventoryInput, type KadiwaInventoryItem, type KadiwaSizeUnit,
} from '../../../app/services/authApi';
import { KadiwaBlankForm } from './KadiwaBlankForm';

// Products are kept like the store's inventory notebook: the product and its
// size, the quantity, the selling price and the cost price, with
// quantity x cost price as the line total.
export const SIZE_UNITS: KadiwaSizeUnit[] = ['mL', 'L', 'mg', 'g', 'kg'];
export const COUNT_UNITS = ['pc', 'pack', 'bottle', 'can', 'sachet', 'box', 'kg'];
export const CATEGORIES: KadiwaInventoryItem['category'][] = ['Groceries', 'Vegetables', 'Meat', 'Other'];

const MONEY = /^\d+(\.\d{1,2})?$/;
const SIZE = /^\d+(\.\d{1,3})?$/;
const MAX_ROWS = 200;
const DRAFT_KEY = 'acifac.kadiwa.inventorySheet';
// FIELD has no width or side padding, so a fixed-width box (a unit picker) is not overridden.
const FIELD = 'min-w-0 rounded-lg border border-gray-300 bg-white py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600';
const INPUT = `${FIELD} w-full px-2.5`;
const UNIT_PICKER = `${FIELD} shrink-0 px-1.5`;

export const peso = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const trimNumber = (value: number) => String(Number(value.toFixed(3)));

/** "150 g", or '' when the product has no size. */
export function sizeLabel(item: Pick<KadiwaInventoryItem, 'sizeValue' | 'sizeUnit'>) {
  return item.sizeValue !== null && item.sizeUnit ? `${trimNumber(item.sizeValue)} ${item.sizeUnit}` : '';
}

/** "Century Tuna 150 g" */
export function productLabel(item: Pick<KadiwaInventoryItem, 'name' | 'sizeValue' | 'sizeUnit'>) {
  const size = sizeLabel(item);
  return size ? `${item.name} ${size}` : item.name;
}

/** The stock's value at cost price (at the selling price for an older product with no cost price yet). */
export const lineValue = (item: Pick<KadiwaInventoryItem, 'stock' | 'price' | 'costPrice'>) => Math.round(item.stock * (item.costPrice ?? item.price) * 100) / 100;

/** Net income on one unit sold: selling price - cost price; null without a cost price. */
export const unitProfit = (item: Pick<KadiwaInventoryItem, 'price' | 'costPrice'>) => (item.costPrice === null ? null : Math.round((item.price - item.costPrice) * 100) / 100);

const quantity = (value: number) => trimNumber(value);

interface SheetRow { key: number; name: string; sizeValue: string; sizeUnit: KadiwaSizeUnit; unit: string; stock: string; price: string; costPrice: string }

const blankRow = (key: number, from?: SheetRow): SheetRow => ({ key, name: '', sizeValue: '', sizeUnit: from?.sizeUnit ?? 'g', unit: from?.unit ?? 'pc', stock: '', price: '', costPrice: '' });
const isBlank = (row: SheetRow) => !row.name.trim() && !row.sizeValue.trim() && !row.stock.trim() && !row.price.trim() && !row.costPrice.trim();
const rowTotal = (row: SheetRow) => {
  const count = Number(row.stock);
  const each = Number(row.costPrice.trim() ? row.costPrice : row.price);
  return Number.isFinite(count) && Number.isFinite(each) ? Math.round(count * each * 100) / 100 : 0;
};

function rowProblems(row: SheetRow) {
  const problems: string[] = [];
  if (!row.name.trim()) problems.push('Enter the product.');
  if (row.sizeValue.trim() && (!SIZE.test(row.sizeValue.trim()) || Number(row.sizeValue) <= 0)) problems.push('The size must be a number like 150 or 1.5.');
  if (!MONEY.test(row.stock.trim())) problems.push('Enter the quantity (up to two decimals).');
  if (!MONEY.test(row.price.trim())) problems.push('Enter the selling price.');
  if (!row.costPrice.trim()) problems.push('Enter the cost price.');
  else if (!MONEY.test(row.costPrice.trim())) problems.push('The cost price must be an amount like 35 or 35.50.');
  return problems;
}

function readDraft(): { rows: SheetRow[]; category: KadiwaInventoryItem['category']; reorderLevel: string } | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    if (!saved || !Array.isArray(saved.rows) || !saved.rows.length) return null;
    return { rows: saved.rows.map((row: SheetRow, index: number) => ({ ...blankRow(index + 1), ...row, key: index + 1 })), category: CATEGORIES.includes(saved.category) ? saved.category : 'Groceries', reorderLevel: String(saved.reorderLevel ?? '5') };
  } catch {
    return null;
  }
}
function writeDraft(value: { rows: SheetRow[]; category: string; reorderLevel: string } | null) {
  try {
    if (value && value.rows.some((row) => !isBlank(row))) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage unavailable: the sheet still works, it is only not kept */ }
}

// Adds many products at once, one line each, like a page of the notebook.
// What is typed is kept in this browser until it is saved or cleared.
export function AddInventorySheet({ onClose, onSaved }: { onClose: () => void; onSaved: (items: KadiwaInventoryItem[]) => void }) {
  const draft = useMemo(readDraft, []);
  const [rows, setRows] = useState<SheetRow[]>(() => draft?.rows ?? [1, 2, 3].map((key) => blankRow(key)));
  const [category, setCategory] = useState<KadiwaInventoryItem['category']>(draft?.category ?? 'Groceries');
  const [reorderLevel, setReorderLevel] = useState(draft?.reorderLevel ?? '5');
  const [showProblems, setShowProblems] = useState(false);
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(Math.max(...rows.map((row) => row.key)) + 1);
  const [focusKey, setFocusKey] = useState<number | null>(null);

  useEffect(() => { writeDraft({ rows, category, reorderLevel }); }, [rows, category, reorderLevel]);

  const filled = rows.filter((row) => !isBlank(row));
  const total = filled.reduce((sum, row) => sum + rowTotal(row), 0);
  const problems = new Map(rows.map((row) => [row.key, isBlank(row) ? [] : rowProblems(row)]));
  const reorderOk = MONEY.test(reorderLevel.trim());

  const update = (key: number, field: keyof Omit<SheetRow, 'key'>, value: string) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    setServerError('');
  };
  const addRow = () => {
    if (rows.length >= MAX_ROWS) { toast.error(`Save these ${MAX_ROWS} lines first, then add more.`); return; }
    const key = nextKey.current++;
    setRows((current) => [...current, blankRow(key, current[current.length - 1])]);
    setFocusKey(key);
  };
  const removeRow = (key: number) => setRows((current) => (current.length === 1 ? [blankRow(nextKey.current++, current[0])] : current.filter((row) => row.key !== key)));

  const close = () => {
    if (filled.length && !window.confirm(`Close the sheet? ${filled.length === 1 ? 'The line you typed stays in this browser until you save or clear it.' : `The ${filled.length} lines you typed stay in this browser until you save or clear them.`}`)) return;
    onClose();
  };
  const clear = () => {
    if (filled.length && !window.confirm('Clear every line of this sheet?')) return;
    nextKey.current = 4;
    setRows([1, 2, 3].map((key) => blankRow(key)));
    setShowProblems(false);
    setServerError('');
  };

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Enter moves to the next line (adding one at the end) instead of saving.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement;
    if (event.key !== 'Enter' || target.tagName !== 'INPUT') return;
    event.preventDefault();
    const index = rows.findIndex((row) => String(row.key) === target.dataset.row);
    if (index === -1) return;
    if (index === rows.length - 1) addRow();
    else document.getElementById(`inventory-row-${rows[index + 1].key}-name`)?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setShowProblems(true);
    if (!filled.length) { setServerError('Type at least one product.'); return; }
    if (!reorderOk || filled.some((row) => rowProblems(row).length)) { setServerError('Fix the lines marked in red.'); return; }
    // Blank lines are dropped first, so "Row 3" from the server is line 3 here.
    setRows(filled);
    setSaving(true);
    try {
      const response = await createKadiwaInventory(filled.map((row): KadiwaInventoryInput => ({
        name: row.name.trim(), category, sizeValue: row.sizeValue.trim(), sizeUnit: row.sizeValue.trim() ? row.sizeUnit : '',
        unit: row.unit, stock: row.stock.trim(), price: row.price.trim(), costPrice: row.costPrice.trim(), reorderLevel: reorderLevel.trim(),
      })));
      writeDraft(null);
      toast.success(`${response.items.length} ${response.items.length === 1 ? 'product' : 'products'} added`, { description: `Inventory value ${peso(response.items.reduce((sum, item) => sum + lineValue(item), 0))}` });
      onSaved(response.items);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Unable to save the inventory.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-inventory-title">
      <form onSubmit={(event) => void submit(event)} onKeyDown={onKeyDown} noValidate className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 id="add-inventory-title" className="text-lg font-bold text-gray-900">Add Inventory</h2>
            <p className="text-sm text-gray-600">One line per product, like the inventory notebook: product, size, quantity, selling price and cost price. The total is quantity × cost price.</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close add inventory"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3 sm:px-6">
          <label className="text-sm font-medium text-gray-700">Category
            <select value={category} onChange={(event) => setCategory(event.target.value as KadiwaInventoryItem['category'])} className={`${FIELD} mt-1 block w-40 px-2.5`}>
              {CATEGORIES.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">Low stock at
            <input inputMode="decimal" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} className={`${FIELD} mt-1 block w-28 px-2.5 ${showProblems && !reorderOk ? 'border-red-400' : ''}`} aria-describedby="reorder-hint" />
          </label>
          <p id="reorder-hint" className="pb-2 text-xs text-gray-500">These apply to every line. Each product can be changed later with Edit.</p>
          <div className="w-full border-t border-gray-200 pt-3">
            <KadiwaBlankForm formName="Add Inventory form" onPrint={() => import('./kadiwaFormPdf').then((pdf) => pdf.downloadInventoryFormPdf())} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 sm:px-4">
          <div className="hidden grid-cols-[2rem_minmax(0,2.4fr)_minmax(0,1.5fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2 px-2 pb-2 text-xs font-medium uppercase text-gray-500 lg:grid">
            <span>#</span><span>Product</span><span>Size</span><span>Quantity</span><span>Selling Price</span><span>Cost Price</span><span className="text-right">Total</span><span />
          </div>
          <ol className="space-y-2">
            {rows.map((row, index) => {
              const rowErrors = showProblems ? problems.get(row.key) ?? [] : [];
              const bad = (text: string) => rowErrors.some((problem) => problem.includes(text));
              return (
                <li key={row.key} className={`rounded-xl border p-2 lg:border-0 lg:p-0 ${rowErrors.length ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-[2rem_minmax(0,2.4fr)_minmax(0,1.5fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] lg:items-center lg:px-2">
                    <span className="col-span-2 text-xs font-semibold text-gray-500 lg:col-span-1 lg:text-sm">{index + 1}</span>
                    <Cell label="Product" className="col-span-2 lg:col-span-1">
                      <input id={`inventory-row-${row.key}-name`} data-row={row.key} autoFocus={row.key === focusKey} value={row.name} onChange={(event) => update(row.key, 'name', event.target.value)} maxLength={200} placeholder="e.g. Century Tuna" className={`${INPUT} ${bad('product') ? 'border-red-400' : ''}`} />
                    </Cell>
                    <Cell label="Size">
                      <div className="flex gap-1">
                        <input data-row={row.key} inputMode="decimal" value={row.sizeValue} onChange={(event) => update(row.key, 'sizeValue', event.target.value)} placeholder="150" aria-label={`Size of line ${index + 1}`} className={`${INPUT} ${bad('size') ? 'border-red-400' : ''}`} />
                        <select value={row.sizeUnit} onChange={(event) => update(row.key, 'sizeUnit', event.target.value)} aria-label={`Size unit of line ${index + 1}`} className={`${UNIT_PICKER} w-16`}>
                          {SIZE_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                        </select>
                      </div>
                    </Cell>
                    <Cell label="Quantity">
                      <div className="flex gap-1">
                        <input data-row={row.key} inputMode="decimal" value={row.stock} onChange={(event) => update(row.key, 'stock', event.target.value)} placeholder="0" aria-label={`Quantity of line ${index + 1}`} className={`${INPUT} ${bad('quantity') ? 'border-red-400' : ''}`} />
                        <select value={row.unit} onChange={(event) => update(row.key, 'unit', event.target.value)} aria-label={`Counted in, line ${index + 1}`} className={`${UNIT_PICKER} w-20`}>
                          {COUNT_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
                        </select>
                      </div>
                    </Cell>
                    <Cell label="Selling Price">
                      <input data-row={row.key} inputMode="decimal" value={row.price} onChange={(event) => update(row.key, 'price', event.target.value)} placeholder="0.00" aria-label={`Selling price of line ${index + 1}`} className={`${INPUT} ${bad('selling price') ? 'border-red-400' : ''}`} />
                    </Cell>
                    <Cell label="Cost Price">
                      <input data-row={row.key} inputMode="decimal" value={row.costPrice} onChange={(event) => update(row.key, 'costPrice', event.target.value)} placeholder="0.00" aria-label={`Cost price of line ${index + 1}`} className={`${INPUT} ${bad('cost price') ? 'border-red-400' : ''}`} />
                    </Cell>
                    <p className="self-center text-sm font-semibold tabular-nums text-gray-900 lg:text-right"><span className="text-xs font-normal text-gray-500 lg:hidden">Total </span>{isBlank(row) ? '—' : peso(rowTotal(row))}</p>
                    <button type="button" onClick={() => removeRow(row.key)} className="justify-self-end rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove line ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {rowErrors.length > 0 && <p className="px-2 pt-1 text-xs text-red-600 lg:pl-12">{rowErrors.join(' ')}</p>}
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={addRow} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50"><Plus className="h-4 w-4" />Add line</button>
        </div>

        <div className="space-y-3 border-t border-gray-200 px-4 py-3 sm:px-6">
          {serverError && <p className="text-sm text-red-600" role="alert">{serverError}</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">{filled.length} {filled.length === 1 ? 'product' : 'products'} · Total <span className="text-lg font-bold tabular-nums text-gray-900">{peso(total)}</span></p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={clear} className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-gray-600 hover:bg-gray-100">Clear sheet</button>
              <button type="button" onClick={close} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving…' : 'Save Inventory'}</button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function Cell({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`min-w-0 ${className}`}><span className="mb-1 block text-xs font-medium text-gray-600 lg:sr-only">{label}</span>{children}</div>;
}

// Edits one product. The quantity is changed here only after counting the
// stock; sales and restocks change it on their own.
export function EditInventoryItem({ item, onClose, onSaved }: { item: KadiwaInventoryItem; onClose: () => void; onSaved: (item: KadiwaInventoryItem) => void }) {
  // The quantity when the form was opened; the server refuses a count if it has changed since.
  const [openedStock] = useState(quantity(item.stock));
  const [values, setValues] = useState({
    name: item.name, category: item.category, sizeValue: item.sizeValue === null ? '' : trimNumber(item.sizeValue), sizeUnit: (item.sizeUnit ?? 'g') as KadiwaSizeUnit,
    unit: item.unit, stock: openedStock, price: item.price.toFixed(2), costPrice: item.costPrice === null ? '' : item.costPrice.toFixed(2), reorderLevel: quantity(item.reorderLevel),
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof values, value: string) => { setValues((current) => ({ ...current, [field]: value })); setError(''); };
  const countUnits = COUNT_UNITS.includes(item.unit) ? COUNT_UNITS : [item.unit, ...COUNT_UNITS];
  const stockChanged = values.stock.trim() !== openedStock;
  const preview = Number(values.stock) * Number(values.costPrice.trim() ? values.costPrice : values.price);
  const margin = MONEY.test(values.price.trim()) && MONEY.test(values.costPrice.trim()) ? Math.round((Number(values.price) - Number(values.costPrice)) * 100) / 100 : Number.NaN;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!values.name.trim()) return setError('Enter the product name.');
    if (values.sizeValue.trim() && (!SIZE.test(values.sizeValue.trim()) || Number(values.sizeValue) <= 0)) return setError('The size must be a number like 150 or 1.5.');
    if (!MONEY.test(values.stock.trim())) return setError('The quantity must be zero or more, with up to two decimals.');
    if (!MONEY.test(values.price.trim())) return setError('Enter the selling price.');
    if (!values.costPrice.trim()) return setError('Enter the cost price.');
    if (!MONEY.test(values.costPrice.trim())) return setError('The cost price must be an amount like 35 or 35.50.');
    if (!MONEY.test(values.reorderLevel.trim())) return setError('The low-stock level must be zero or more.');
    setSaving(true);
    try {
      const response = await updateKadiwaInventory(item.id, {
        name: values.name.trim(), category: values.category, sizeValue: values.sizeValue.trim(), sizeUnit: values.sizeValue.trim() ? values.sizeUnit : '',
        unit: values.unit, price: values.price.trim(), costPrice: values.costPrice.trim(), reorderLevel: values.reorderLevel.trim(),
        ...(stockChanged ? { stock: values.stock.trim(), expectedStock: openedStock } : {}),
      });
      toast.success(`${productLabel(response.item)} saved`, stockChanged ? { description: `Counted stock: ${quantity(response.item.stock)} ${response.item.unit}` } : undefined);
      onSaved(response.item);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-inventory-title">
      <form onSubmit={(event) => void submit(event)} noValidate className="flex max-h-[95vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">{item.id}</p>
            <h2 id="edit-inventory-title" className="truncate text-lg font-bold text-gray-900">Edit {productLabel(item)}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close edit product"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
          <Field label="Product" className="sm:col-span-2"><input value={values.name} onChange={(event) => set('name', event.target.value)} maxLength={200} className={INPUT} /></Field>
          <Field label="Size (leave blank if none)">
            <div className="flex gap-1">
              <input inputMode="decimal" value={values.sizeValue} onChange={(event) => set('sizeValue', event.target.value)} placeholder="150" className={INPUT} />
              <select value={values.sizeUnit} onChange={(event) => set('sizeUnit', event.target.value)} aria-label="Size unit" className={`${UNIT_PICKER} w-20`}>{SIZE_UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select>
            </div>
          </Field>
          <Field label="Category">
            <select value={values.category} onChange={(event) => set('category', event.target.value)} className={INPUT}>{CATEGORIES.map((option) => <option key={option}>{option}</option>)}</select>
          </Field>
          <Field label="Quantity on hand" hint={stockChanged ? `Was ${openedStock} ${item.unit}. Saving records this as a physical count.` : 'Change only after counting the stock. Sales and Restock update it on their own.'}>
            <div className="flex gap-1">
              <input inputMode="decimal" value={values.stock} onChange={(event) => set('stock', event.target.value)} className={`${INPUT} ${stockChanged ? 'border-amber-400 bg-amber-50' : ''}`} />
              <select value={values.unit} onChange={(event) => set('unit', event.target.value)} aria-label="Counted in" className={`${UNIT_PICKER} w-24`}>{countUnits.map((unit) => <option key={unit}>{unit}</option>)}</select>
            </div>
          </Field>
          <Field label="Low stock at"><input inputMode="decimal" value={values.reorderLevel} onChange={(event) => set('reorderLevel', event.target.value)} className={INPUT} /></Field>
          <Field label={`Selling price per ${values.unit}`}><input inputMode="decimal" value={values.price} onChange={(event) => set('price', event.target.value)} className={INPUT} /></Field>
          <Field label={`Cost price per ${values.unit}`}><input inputMode="decimal" value={values.costPrice} onChange={(event) => set('costPrice', event.target.value)} className={INPUT} /></Field>
          <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700 sm:col-span-2">Total: <strong className="tabular-nums">{Number.isFinite(preview) ? peso(Math.round(preview * 100) / 100) : '—'}</strong> <span className="text-gray-500">(quantity × cost price)</span>
            {Number.isFinite(margin) && <span className="block text-gray-600">Net income per {values.unit} sold: <strong className={`tabular-nums ${margin < 0 ? 'text-red-700' : 'text-green-700'}`}>{peso(margin)}</strong> (selling price − cost price)</span>}
          </p>
        </div>
        <div className="space-y-2 border-t border-gray-200 px-4 py-3 sm:px-6">
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Asks before deleting a product. A product already sold stays in its past sales.
export function DeleteInventoryItem({ item, onClose, onDeleted }: { item: KadiwaInventoryItem; onClose: () => void; onDeleted: (id: string) => void }) {
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const label = productLabel(item);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !deleting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleting, onClose]);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteKadiwaInventory(item.id);
      toast.success(`${result.name} deleted`, { description: result.keptForPastSales ? `Its ${result.pastSales} past ${result.pastSales === 1 ? 'sale still shows' : 'sales still show'} it in Sales History.` : 'It was removed from the inventory.' });
      onDeleted(item.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete the product.');
      setDeleting(false);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-inventory-title" aria-describedby="delete-inventory-details">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-100 p-2.5"><AlertTriangle className="h-5 w-5 text-red-700" /></div>
          <div className="min-w-0">
            <h2 id="delete-inventory-title" className="text-lg font-bold text-gray-900">Delete {label}?</h2>
            <div id="delete-inventory-details" className="mt-2 space-y-2 text-sm text-gray-600">
              {item.stock > 0
                ? <p>It still has <strong className="text-gray-900">{quantity(item.stock)} {item.unit}</strong> in stock, worth <strong className="text-gray-900">{peso(lineValue(item))}</strong>{item.costPrice !== null ? ' at cost' : ''}. Deleting takes it out of the inventory and its totals.</p>
                : <p>It has no stock left. Deleting takes it out of the inventory.</p>}
              <p>It can no longer be sold in New Sale. Past sales that sold it keep showing it in Sales History.</p>
              <p>This cannot be undone. To sell it again, add it again with Add Inventory.</p>
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={deleting} autoFocus className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60">Cancel</button>
          <button type="button" onClick={() => void remove()} disabled={deleting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="h-4 w-4" />{deleting ? 'Deleting…' : 'Delete product'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return <label className={`block text-sm font-medium text-gray-700 ${className}`}>{label}<div className="mt-1">{children}</div>{hint && <p className="mt-1 text-xs font-normal text-gray-500">{hint}</p>}</label>;
}
