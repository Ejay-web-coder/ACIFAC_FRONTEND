import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Eye, LoaderCircle, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createKadiwaSale, fetchKadiwaSales,
  type KadiwaGood, type KadiwaInventoryItem, type KadiwaSale, type KadiwaSaleExpense, type KadiwaSaleGoodInput, type KadiwaSalesLine, type KadiwaSalesReport,
} from '../../../app/services/authApi';
import { addDateOnlyDays, dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { CATEGORIES, peso, productLabel } from './InventoryForms';
import { StoreItemsPicker, storeQuantityProblem, storeSelection, type StoreQuantities } from './StoreItemsPicker';

// Kadiwa sales follow the Kadiwa ng Pangulo daily sales form: the seller, the
// date, and each good sold with its unit, price, quantity and total amount.
// The history adds them up per day, per 15 days and per month, like the
// "September 1 to 15" summary.
export const GOODS_UNITS = ['KILO', 'TRAY', 'BALOT', 'PC', 'PACK', 'BOTTLE', 'SACK'];
const MONEY = /^\d+(\.\d{1,2})?$/;
const QUANTITY = /^\d+(\.\d{1,4})?$/;
const DRAFT_KEY = 'acifac.kadiwa.saleSheet';
const FIELD = 'min-w-0 rounded-lg border border-gray-300 bg-white py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600';
const INPUT = `${FIELD} w-full px-2.5`;

/** 0.75 -> "0.75", 34.46666 -> "34.4667" */
export const formatQuantity = (value: number | null) => (value === null ? '' : Number(value.toFixed(4)).toLocaleString('en-PH', { maximumFractionDigits: 4 }));
const plainAmount = (value: number) => value.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 });
const formatPrice = (line: Pick<KadiwaSalesLine, 'price' | 'priceMax'>) => (line.price === null ? '' : line.priceMax !== null ? `${plainAmount(line.price)} – ${plainAmount(line.priceMax)}` : plainAmount(line.price));
/** "2026-09-01" -> "SEPTEMBER 1, 2026", as the form writes its date. */
const formDate = (value: string) => formatDate(value).toUpperCase();
// "5 goods", "3 store items", "2 goods · 1 store item"; sales saved before goods were itemized count their lines.
const saleContents = (sale: KadiwaSale) => {
  const parts = [];
  if (sale.goods.length) parts.push(`${sale.goods.length} ${sale.goods.length === 1 ? 'good' : 'goods'}`);
  if (sale.items.length) parts.push(`${sale.items.length} store ${sale.items.length === 1 ? 'item' : 'items'}`);
  return parts.length ? parts.join(' · ') : `${sale.lines.length} ${sale.lines.length === 1 ? 'good' : 'goods'}`;
};
const saleGross = (sale: Pick<KadiwaSale, 'groceries' | 'vegetables' | 'meat'>) => Math.round((sale.groceries + sale.vegetables + sale.meat) * 100) / 100;

// ----- New Sale: the daily sales form --------------------------------------------------------------

interface SaleRow { key: number; name: string; unit: string; category: KadiwaInventoryItem['category']; price: string; quantity: string; amount: string; typed: 'quantity' | 'amount' | null; custom: boolean }
interface ExpenseRow { key: number; description: string; amount: string }
interface SaleDraft { saleDate: string; rows: SaleRow[]; store: StoreQuantities; expenses: ExpenseRow[] }

// Offered when typing what an expense was for; anything else can be typed.
const EXPENSE_KINDS = ['Transportation', 'Plastic bags', 'Ice', 'Labor', 'Load / communication', 'Stall rental', 'Electricity', 'Water', 'Meals', 'None'];
const blankExpense = (key: number): ExpenseRow => ({ key, description: '', amount: '' });
const expenseTyped = (row: ExpenseRow) => Boolean(row.description.trim() || row.amount.trim());
function expenseProblem(row: ExpenseRow) {
  if (!row.description.trim()) return 'Enter what this expense was for.';
  if (!MONEY.test(row.amount.trim())) return 'Enter the amount, like 150 or 150.50 (0 if there were none).';
  return '';
}

const moneyText = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
const rowsFromGoods = (goods: KadiwaGood[]): SaleRow[] => goods.map((good, index) => ({
  key: index + 1, name: good.name, unit: good.unit ?? '', category: good.category, price: good.price === null ? '' : moneyText(good.price), quantity: '', amount: '', typed: null, custom: false,
}));
const validMoney = (text: string) => MONEY.test(text.trim());
// quantity x price, and amount / price (the quantity the 15-day report shows when only the amount is written).
const times = (quantity: string, price: string) => (QUANTITY.test(quantity.trim()) && validMoney(price) ? (Math.round(Number(quantity) * Number(price) * 100) / 100).toFixed(2) : '');
const divide = (amount: string, price: string) => (validMoney(amount) && validMoney(price) && Number(price) > 0 ? String(Number((Number(amount) / Number(price)).toFixed(4))) : '');
const isFilled = (row: SaleRow) => Boolean(row.amount.trim() || row.quantity.trim());

function rowProblem(row: SaleRow) {
  if (row.custom && !row.name.trim()) return 'Enter the goods sold.';
  if (row.price.trim() && !validMoney(row.price)) return 'The price must be an amount like 400 or 12.50.';
  if (row.quantity.trim() && (!QUANTITY.test(row.quantity.trim()) || Number(row.quantity) <= 0)) return 'The quantity must be more than zero (up to 4 decimals).';
  if (!row.amount.trim()) return 'Enter the price, or type the total amount.';
  if (!validMoney(row.amount) || Number(row.amount) <= 0) return 'The total amount must be more than zero (up to 2 decimals).';
  return '';
}

function readSaleDraft(): SaleDraft | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null') as SaleDraft | null;
    if (!saved || !Array.isArray(saved.rows) || !saved.rows.length) return null;
    // A draft from before expenses were listed has one amount; it becomes the first line.
    const oldAmount = typeof saved.expenses === 'string' ? String(saved.expenses).trim() : '';
    const expenses = Array.isArray(saved.expenses) && saved.expenses.length ? saved.expenses : [{ key: 1, description: '', amount: oldAmount }];
    // An older draft kept the store items as rows of product and quantity.
    const store: StoreQuantities = Array.isArray(saved.store)
      ? Object.fromEntries((saved.store as Array<{ inventoryId?: string; quantity?: string }>).filter((row) => row.inventoryId).map((row) => [row.inventoryId as string, String(row.quantity ?? '')]))
      : saved.store && typeof saved.store === 'object' ? saved.store : {};
    return { ...saved, store, expenses };
  } catch {
    return null;
  }
}
function writeSaleDraft(draft: SaleDraft | null) {
  try {
    if (draft && (draft.rows.some(isFilled) || Object.values(draft.store).some((value) => value.trim()) || draft.expenses.some(expenseTyped))) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage unavailable: the form still works, it is only not kept */ }
}

// The daily sales form. Type the total amount of each good sold (the quantity
// is worked out from the price), or the quantity (the amount is worked out).
// Store items sold from the inventory (how many of each product) are deducted
// from stock and counted under GROCERIES, with their cost and net income.
// What is typed is kept in this browser until it is saved.
export function NewSaleSheet({ goods, inventory, onClose, onSaved }: {
  goods: KadiwaGood[]; inventory: KadiwaInventoryItem[]; onClose: () => void; onSaved: (sale: KadiwaSale) => void;
}) {
  const draft = useMemo(readSaleDraft, []);
  // Quick search: shows only the goods and store items that match. What is typed in hidden lines is kept.
  const [search, setSearch] = useState('');
  const [saleDate, setSaleDate] = useState(draft?.saleDate ?? dateOnlyToday());
  const [rows, setRows] = useState<SaleRow[]>(() => draft?.rows ?? rowsFromGoods(goods));
  const [store, setStore] = useState<StoreQuantities>(draft?.store ?? {});
  const [expenses, setExpenses] = useState<ExpenseRow[]>(() => draft?.expenses ?? [blankExpense(1)]);
  const expenseKey = useRef(Math.max(1, ...(draft?.expenses ?? []).map((row) => row.key)) + 1);
  const [expenseFocus, setExpenseFocus] = useState<number | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(Math.max(0, ...rows.map((row) => row.key)) + 1);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const today = dateOnlyToday();

  useEffect(() => { writeSaleDraft({ saleDate, rows, store, expenses }); }, [saleDate, rows, store, expenses]);

  const filled = rows.filter(isFilled);
  const goodsTotal = filled.reduce((sum, row) => sum + (validMoney(row.amount) ? Number(row.amount) : 0), 0);
  const { selected: storeSelected, revenue: storeTotal, cost: storeCost } = storeSelection(inventory, store);
  const changeStore = (update: Parameters<typeof setStore>[0]) => { setError(''); setStore(update); };
  const gross = Math.round((goodsTotal + storeTotal) * 100) / 100;
  // The expenses typed (blank lines are left out) and their total.
  const expenseLines = expenses.filter(expenseTyped);
  const expensesValue = Math.round(expenseLines.reduce((sum, row) => sum + (validMoney(row.amount) ? Number(row.amount) : 0), 0) * 100) / 100;
  const changeExpense = (key: number, field: 'description' | 'amount', value: string) => { setError(''); setExpenses((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row))); };
  const addExpense = () => { const key = expenseKey.current++; setExpenses((current) => [...current, blankExpense(key)]); setExpenseFocus(key); };
  const removeExpense = (key: number) => setExpenses((current) => (current.length === 1 ? [blankExpense(expenseKey.current++)] : current.filter((row) => row.key !== key)));

  const change = (key: number, field: 'name' | 'unit' | 'category' | 'price' | 'quantity' | 'amount', value: string) => {
    setError('');
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, [field]: value } as SaleRow;
      if (field === 'quantity') {
        next.typed = value.trim() ? 'quantity' : row.typed === 'quantity' ? null : row.typed;
        if (value.trim()) next.amount = times(value, row.price) || row.amount;
        else if (row.typed === 'quantity') next.amount = '';
      } else if (field === 'amount') {
        next.typed = value.trim() ? 'amount' : row.typed === 'amount' ? null : row.typed;
        if (value.trim()) next.quantity = divide(value, row.price);
        else if (row.typed === 'amount') next.quantity = '';
      } else if (field === 'price') {
        if (row.typed === 'quantity') next.amount = times(row.quantity, value) || row.amount;
        if (row.typed === 'amount') next.quantity = divide(row.amount, value);
      }
      return next;
    }));
  };
  const query = search.trim().toLowerCase();
  // A new line for other goods stays in view until it has a name.
  const shownRows = query ? rows.filter((row) => (row.custom && !row.name.trim()) || row.name.toLowerCase().includes(query)) : rows;
  const addGood = () => {
    setSearch('');
    const key = nextKey.current++;
    setRows((current) => [...current, { key, name: '', unit: 'KILO', category: 'Vegetables', price: '', quantity: '', amount: '', typed: null, custom: true }]);
    setFocusKey(key);
  };
  const removeGood = (key: number) => setRows((current) => current.filter((row) => row.key !== key));

  const close = () => {
    if ((filled.length || storeSelected.length || expenseLines.length) && !window.confirm('Close the sales form? What you typed stays in this browser until you save or clear it.')) return;
    onClose();
  };
  const clear = () => {
    if ((filled.length || storeSelected.length || expenseLines.length) && !window.confirm('Clear every amount on this form?')) return;
    setRows(rowsFromGoods(goods));
    setStore({});
    setExpenses([blankExpense(expenseKey.current++)]);
    setShowProblems(false);
    setError('');
  };

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Enter moves down to the same box on the next line shown, as when filling in the paper form.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement;
    if (event.key !== 'Enter' || target.tagName !== 'INPUT') return;
    event.preventDefault();
    if (!target.dataset.field) return;
    const boxes = [...document.querySelectorAll<HTMLInputElement>(`[data-field="${target.dataset.field}"]:not(:disabled)`)];
    boxes[boxes.indexOf(target as HTMLInputElement) + 1]?.focus();
  };
  // Enter in the search box goes to the first result: a good's total amount, or else a store item's quantity.
  const goToFirstResult = () => {
    const first = document.querySelector<HTMLInputElement>('[aria-labelledby="new-sale-title"] [data-field="amount"]')
      ?? document.querySelector<HTMLInputElement>('[aria-labelledby="new-sale-title"] [data-field="store"]:not(:disabled)');
    first?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setShowProblems(true);
    if (!saleDate || saleDate > today) { setError('Enter the date of the sales (not a future date).'); return; }
    const storeProblem = storeSelected.find(({ item, quantity }) => storeQuantityProblem(item, quantity));
    if (storeProblem) { setError(`${productLabel(storeProblem.item)}: ${storeQuantityProblem(storeProblem.item, storeProblem.quantity)}`); return; }
    if (!filled.length && !storeSelected.length) { setError('Enter the amount of at least one good sold, or the quantity of a store item.'); return; }
    const bad = filled.find((row) => rowProblem(row));
    if (bad) { setError(`${bad.name.trim() || 'A new good'}: ${rowProblem(bad)}`); return; }
    if (!expenseLines.length) { setError('Enter the expenses: what each was for and the amount (0 if there were none).'); return; }
    const badExpense = expenseLines.find((row) => expenseProblem(row));
    if (badExpense) { setError(`Expense ${expenses.indexOf(badExpense) + 1}: ${expenseProblem(badExpense)}`); return; }
    setSaving(true);
    try {
      const response = await createKadiwaSale({
        saleDate,
        expenses: expenseLines.map((row) => ({ description: row.description.trim(), amount: row.amount.trim() })),
        goods: filled.map((row): KadiwaSaleGoodInput => ({
          name: row.name.trim(), unit: row.unit, category: row.category, price: row.price.trim(),
          // The server works out the quantity from the amount when only the amount was typed.
          quantity: row.typed === 'quantity' ? row.quantity.trim() : '', amount: row.amount.trim(),
        })),
        items: storeSelected.map(({ item, quantity }) => ({ inventoryId: item.id, quantity })),
      });
      writeSaleDraft(null);
      toast.success(`Sale saved for ${formatDate(response.sale.saleDate)}`, { description: `${response.sale.seller} · Total ${peso(saleGross(response.sale))} · Net income ${peso(response.sale.netSales)}` });
      onSaved(response.sale);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the sale.');
    } finally {
      setSaving(false);
    }
  };

  const groceriesExtra = storeTotal > 0 ? storeTotal : 0;

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="new-sale-title">
      <form onSubmit={(event) => void submit(event)} onKeyDown={onKeyDown} noValidate className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">Kadiwa ng Pangulo</p>
            <h2 id="new-sale-title" className="text-lg font-bold text-gray-900">New Sale</h2>
            <p className="hidden text-sm text-gray-600 sm:block">Type the total amount of each good sold; the quantity is worked out from the price. Or type the quantity and the amount is worked out.</p>
          </div>
          <button type="button" onClick={close} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close new sale"><X className="h-5 w-5" /></button>
        </div>

        {/* The search and the date stay at the top while the goods scroll under them. */}
        <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_9.5rem] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:px-6">
          <label className="text-sm font-medium text-gray-700">Search
            <span className="relative mt-1 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') goToFirstResult(); }} autoComplete="off" placeholder="e.g. pork, tuna" aria-label="Search goods and store items" className={`${INPUT} pl-9`} />
            </span>
          </label>
          <label className="text-sm font-medium text-gray-700">Date
            <input type="date" value={saleDate} max={today} onChange={(event) => { setSaleDate(event.target.value); setError(''); }} className={`${INPUT} mt-1`} />
          </label>
          {query && <p className="col-span-2 text-xs text-gray-600" aria-live="polite">{shownRows.length} of {rows.length} goods match “{search.trim()}”. Amounts typed in other lines are kept. Press Enter to go to the first one.</p>}
          {draft && !query && <p className="col-span-2 text-xs text-amber-700">Unsaved entries from before were brought back. Use Clear form to start over.</p>}
        </div>

        <div className="px-2 py-3 sm:px-4">
          <div className="hidden grid-cols-[minmax(0,2fr)_7.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.25rem] gap-2 px-2 pb-2 text-xs font-medium uppercase text-gray-500 md:grid">
            <span>Goods Sold</span><span>Unit</span><span>Price</span><span>Quantity</span><span className="text-right">Total Amount</span><span />
          </div>
          {!shownRows.length && <p className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">No goods match “{search.trim()}”.</p>}
          <ol className="space-y-1.5">
            {shownRows.map((row, index) => {
              const problem = showProblems && isFilled(row) ? rowProblem(row) : '';
              const units = row.unit && !GOODS_UNITS.includes(row.unit) ? [row.unit, ...GOODS_UNITS] : GOODS_UNITS;
              return (
                <li key={row.key} className={`rounded-xl border p-2 md:border-0 md:p-0 ${problem ? 'border-red-200 bg-red-50/50' : isFilled(row) ? 'border-green-200 bg-green-50/40' : 'border-gray-200'}`}>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,2fr)_7.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.25rem] md:items-center md:px-2 md:py-0.5">
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      {row.custom ? (
                        <div className="flex gap-1">
                          <input id={`sale-row-${row.key}-name`} autoFocus={row.key === focusKey} value={row.name} onChange={(event) => change(row.key, 'name', event.target.value)} maxLength={120} placeholder="Other goods, e.g. PATOLA" aria-label="Name of the other goods" className={INPUT} />
                          <select value={row.category} onChange={(event) => change(row.key, 'category', event.target.value)} aria-label={`Category of ${row.name || 'the other goods'}`} className={`${FIELD} w-28 shrink-0 px-1.5`}>
                            {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </div>
                      ) : (
                        <p className="font-semibold text-gray-900">{row.name}{row.name === 'GROCERIES' && groceriesExtra > 0 && <span className="ml-2 text-xs font-normal text-gray-500">+ {peso(groceriesExtra)} store items below</span>}</p>
                      )}
                    </div>
                    <Cell label="Unit">
                      <select value={row.unit} onChange={(event) => change(row.key, 'unit', event.target.value)} aria-label={`Unit of ${row.name || 'the other goods'}`} className={`${FIELD} w-full px-1.5`}>
                        <option value="">—</option>
                        {units.map((unit) => <option key={unit}>{unit}</option>)}
                      </select>
                    </Cell>
                    <Cell label="Price">
                      <input data-field="price" data-index={index} inputMode="decimal" value={row.price} onChange={(event) => change(row.key, 'price', event.target.value)} placeholder="—" aria-label={`Price of ${row.name || 'the other goods'}`} className={INPUT} />
                    </Cell>
                    <Cell label="Quantity">
                      <input data-field="quantity" data-index={index} inputMode="decimal" value={row.quantity} onChange={(event) => change(row.key, 'quantity', event.target.value)} placeholder="0" aria-label={`Quantity of ${row.name || 'the other goods'}`} className={`${INPUT} ${row.typed === 'amount' ? 'text-gray-500' : ''}`} />
                    </Cell>
                    <Cell label="Total Amount">
                      <input data-field="amount" data-index={index} inputMode="decimal" value={row.amount} onChange={(event) => change(row.key, 'amount', event.target.value)} placeholder="0.00" aria-label={`Total amount of ${row.name || 'the other goods'}`} className={`${INPUT} text-right font-semibold ${row.typed === 'quantity' ? 'text-gray-500' : ''}`} />
                    </Cell>
                    {row.custom
                      ? <button type="button" onClick={() => removeGood(row.key)} className="justify-self-end rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${row.name || 'the other goods'}`}><Trash2 className="h-4 w-4" /></button>
                      : <span className="hidden md:block" />}
                  </div>
                  {problem && <p className="px-2 pt-1 text-xs text-red-600">{problem}</p>}
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={addGood} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50"><Plus className="h-4 w-4" />Add other goods</button>

          <StoreItemsPicker inventory={inventory} quantities={store} onChange={changeStore} showProblems={showProblems} query={query} />
          <div className={`mt-3 rounded-xl border p-3 ${showProblems && !expenseLines.length ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Expenses <span className="text-red-600" aria-hidden="true">*</span></h3>
                <p className="text-xs text-gray-500">What each expense was for and the amount. Enter 0 if there were none.</p>
              </div>
              <p className="text-sm text-gray-600">Total <span className="font-semibold tabular-nums text-gray-900">{peso(expensesValue)}</span></p>
            </div>
            <ul className="mt-2 space-y-2">
              {expenses.map((row, index) => {
                const problem = showProblems && (expenseTyped(row) || (!expenseLines.length && index === 0)) ? expenseProblem(row) : '';
                return (
                  <li key={row.key}>
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_2.25rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_2.25rem]">
                      <input value={row.description} onChange={(event) => changeExpense(row.key, 'description', event.target.value)} autoFocus={row.key === expenseFocus} list="kadiwa-expense-kinds" maxLength={120} autoComplete="off" placeholder={index === 0 ? 'e.g. Transportation' : 'Other expense'} aria-label={`Expense ${index + 1}: what it was for`} className={`${INPUT} ${problem && !row.description.trim() ? 'border-red-400' : ''}`} />
                      <input inputMode="decimal" value={row.amount} onChange={(event) => changeExpense(row.key, 'amount', event.target.value)} placeholder="0.00" aria-label={`Expense ${index + 1}: amount`} className={`${INPUT} text-right ${problem && row.description.trim() ? 'border-red-400' : ''}`} />
                      {expenses.length > 1 || expenseTyped(row)
                        ? <button type="button" onClick={() => removeExpense(row.key)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove expense ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
                        : <span />}
                    </div>
                    {problem && <p className="pt-1 text-xs text-red-600">{problem}</p>}
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={addExpense} className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"><Plus className="h-4 w-4" />Other expenses</button>
            <datalist id="kadiwa-expense-kinds">{EXPENSE_KINDS.map((kind) => <option key={kind} value={kind} />)}</datalist>
          </div>
        </div>
        </div>

        <div className="space-y-2 border-t border-gray-200 px-4 py-3 sm:px-6">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 sm:text-sm">Total Amount of Goods Sold</p>
              <p className="text-xl font-bold tabular-nums text-gray-900 sm:text-2xl">{peso(gross)}</p>
            </div>
            <p className="pb-1 text-right text-xs text-gray-500 sm:text-sm">
              {filled.length} {filled.length === 1 ? 'good' : 'goods'}{storeTotal > 0 ? ` + store items ${peso(storeTotal)}` : ''}
              {storeCost > 0 && <span className="block">Cost of store items {peso(storeCost)}</span>}
              <span className="block">Expenses {peso(expensesValue)}</span>
              <span className="block">Net income <span className="font-semibold tabular-nums text-green-700">{peso(Math.round((gross - expensesValue - storeCost) * 100) / 100)}</span></span>
            </p>
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={clear} className="mr-auto inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">Clear form</button>
            <button type="button" onClick={close} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving…' : 'Save Sale'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><span className="mb-1 block text-xs font-medium text-gray-600 md:sr-only">{label}</span>{children}</div>;
}

// ----- Sales history: per day, per 15 days, per month ----------------------------------------------

export type SalesPeriodMode = 'day' | 'half' | 'month';
export interface SalesPeriod { mode: SalesPeriodMode; date: string }

const pad = (value: number) => String(value).padStart(2, '0');
const monthName = (year: number, month: number) => new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1))).toUpperCase();
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The dates a period covers and its heading, as the Kadiwa forms write it. */
export function periodRange({ mode, date }: SalesPeriod) {
  const [year, month, day] = date.split('-').map(Number);
  const ym = `${year}-${pad(month)}`;
  const last = lastDay(year, month);
  if (mode === 'day') return { from: date, to: date, title: `${monthName(year, month)} ${day}, ${year}` };
  if (mode === 'month') return { from: `${ym}-01`, to: `${ym}-${pad(last)}`, title: `${monthName(year, month)} ${year}` };
  return day <= 15
    ? { from: `${ym}-01`, to: `${ym}-15`, title: `${monthName(year, month)} 1 TO 15, ${year}` }
    : { from: `${ym}-16`, to: `${ym}-${pad(last)}`, title: `${monthName(year, month)} 16 TO ${last}, ${year}` };
}

function shiftPeriod({ mode, date }: SalesPeriod, step: 1 | -1): SalesPeriod {
  if (mode === 'day') return { mode, date: addDateOnlyDays(date, step) };
  const [year, month, day] = date.split('-').map(Number);
  const monthStart = (offset: number, startDay: number) => {
    const shifted = new Date(Date.UTC(year, month - 1 + offset, startDay));
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  };
  if (mode === 'month') return { mode, date: monthStart(step, 1) };
  const firstHalf = day <= 15;
  if (step === 1) return { mode, date: firstHalf ? monthStart(0, 16) : monthStart(1, 1) };
  return { mode, date: firstHalf ? monthStart(-1, 16) : monthStart(0, 1) };
}

const MODES: Array<{ key: SalesPeriodMode; label: string }> = [
  { key: 'day', label: 'Daily' },
  { key: 'half', label: '15 Days' },
  { key: 'month', label: 'Monthly' },
];

export function SalesHistory({ period, onPeriodChange, refreshKey }: { period: SalesPeriod; onPeriodChange: (period: SalesPeriod) => void; refreshKey: number }) {
  const range = periodRange(period);
  const today = dateOnlyToday();
  const [sales, setSales] = useState<KadiwaSale[]>([]);
  const [report, setReport] = useState<KadiwaSalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openSale, setOpenSale] = useState<KadiwaSale | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchKadiwaSales(range.from, range.to)
      .then((data) => { if (!cancelled) { setSales(data.sales); setReport(data.report); setError(''); } })
      .catch((loadError: Error) => { if (!cancelled) setError(loadError.message || 'Unable to load the sales.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, refreshKey]);

  const query = search.trim().toLowerCase();
  const shownSales = query ? sales.filter((sale) => `${sale.id} ${sale.seller}`.toLowerCase().includes(query)) : sales;
  const next = shiftPeriod(period, 1);
  const nextStartsAfterToday = periodRange(next).from > today;
  const lines = report?.lines ?? [];
  const totals = report?.totals;
  const storeItems = useMemo(() => storeItemTotals(sales), [sales]);
  const expenseTotals = useMemo(() => expenseItemTotals(sales), [sales]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Sales History</h2>
          <p className="text-sm text-gray-600">Goods sold per day, per 15 days and per month. Select a sale to see its form.</p>
        </div>
        <div className="flex w-full gap-1 rounded-xl bg-gray-100 p-1 sm:w-fit" role="tablist" aria-label="Sales period">
          {MODES.map((mode) => (
            <button key={mode.key} type="button" role="tab" aria-selected={period.mode === mode.key} onClick={() => onPeriodChange({ mode: mode.key, date: period.date })}
              className={`inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none ${period.mode === mode.key ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onPeriodChange(shiftPeriod(period, -1))} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50" aria-label="Previous period"><ChevronLeft className="h-4 w-4" /></button>
          <p className="min-w-0 text-center text-sm font-bold tracking-wide text-gray-900 sm:text-base" aria-live="polite">{range.title}</p>
          <button type="button" onClick={() => onPeriodChange(next)} disabled={nextStartsAfterToday} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40" aria-label="Next period"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {period.mode === 'day'
            ? <input type="date" value={period.date} max={today} onChange={(event) => event.target.value && onPeriodChange({ mode: 'day', date: event.target.value })} aria-label="Day" className={`${FIELD} px-2.5`} />
            : <input type="month" value={period.date.slice(0, 7)} max={today.slice(0, 7)} onChange={(event) => event.target.value && onPeriodChange({ mode: period.mode, date: `${event.target.value}-${period.mode === 'half' && Number(period.date.slice(8)) > 15 ? '16' : '01'}` })} aria-label="Month" className={`${FIELD} px-2.5`} />}
          {period.mode === 'half' && (
            <select value={Number(period.date.slice(8)) > 15 ? 'second' : 'first'} onChange={(event) => onPeriodChange({ mode: 'half', date: `${period.date.slice(0, 7)}-${event.target.value === 'second' ? '16' : '01'}` })} aria-label="Which half of the month" className={`${FIELD} px-2`}>
              <option value="first">1 to 15</option>
              <option value="second">16 to end</option>
            </select>
          )}
        </div>
      </div>

      {error ? <p className="p-6 text-sm text-red-600">{error}</p> : (
        <>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 sm:gap-3 sm:px-6">
            <Stat label="Sales" value={totals ? String(totals.sales) : '—'} detail={totals ? `on ${totals.days} ${totals.days === 1 ? 'day' : 'days'}` : ''} />
            <Stat label="Total Amount of Goods Sold" value={totals ? peso(totals.gross) : '—'} strong />
            <Stat label="Cost & Expenses" value={totals ? peso(Math.round((totals.costOfGoods + totals.expenses) * 100) / 100) : '—'} detail={totals ? `cost ${peso(totals.costOfGoods)} · expenses ${peso(totals.expenses)}` : ''} />
            <Stat label="Net Income" value={totals ? peso(totals.net) : '—'} />
          </div>

          <div className="px-4 pb-4 sm:px-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Goods sold{period.mode === 'day' ? ' this day' : ' in this period'}</h3>
            {loading && !report ? <p className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading sales…</p>
              : !lines.length ? <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No sales recorded {period.mode === 'day' ? 'on this day' : 'in this period'}.</p>
                : <GoodsTable lines={lines} total={totals?.gross ?? 0} />}
          </div>

          {storeItems.length > 0 && (
            <div className="px-4 pb-4 sm:px-6">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Store items sold <span className="font-normal text-gray-500">(counted in GROCERIES)</span></h3>
              <StoreItemsTable items={storeItems} />
            </div>
          )}

          {expenseTotals.length > 0 && (
            <div className="px-4 pb-4 sm:px-6">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Expenses</h3>
              <ExpenseList lines={expenseTotals} />
            </div>
          )}

          {sales.length > 0 && (
            <div className="border-t border-gray-100 px-4 pb-4 pt-3 sm:px-6">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Sales {period.mode === 'day' ? 'this day' : 'in this period'} ({sales.length})</h3>
                {sales.length > 3 && (
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or sale ID" aria-label="Search sales by name or sale ID" className="input-style pl-9" />
                  </div>
                )}
              </div>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {shownSales.map((sale) => (
                  <li key={sale.id}>
                    <button type="button" onClick={() => setOpenSale(sale)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-green-50/50 sm:px-4" aria-label={`View sale ${sale.id} by ${sale.seller}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">{sale.seller}</p>
                        <p className="text-xs text-gray-500">{formatDate(sale.saleDate)} · {sale.id} · {saleContents(sale)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums text-gray-900">{peso(saleGross(sale))}</p>
                        {(sale.totalExpenses > 0 || sale.costOfGoods > 0) && <p className="text-xs text-gray-500">Net {peso(sale.netSales)}</p>}
                      </div>
                      <Eye className="h-4 w-4 shrink-0 text-green-700" />
                    </button>
                  </li>
                ))}
                {!shownSales.length && <li className="px-4 py-6 text-center text-sm text-gray-500">No sale matches your search.</li>}
              </ul>
            </div>
          )}
        </>
      )}

      {openSale && <SaleSheetModal sale={openSale} onClose={() => setOpenSale(null)} />}
    </div>
  );
}

// Every inventory product sold in the period, added up: quantity, price (lowest to highest) and amount.
// The cost is null when any of the product's sales was saved before cost prices were recorded.
interface StoreItemTotal { key: string; name: string; unit: string; quantity: number; amount: number; cost: number | null; priceMin: number; priceMax: number }
function storeItemTotals(sales: KadiwaSale[]): StoreItemTotal[] {
  const totals = new Map<string, StoreItemTotal>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const key = `${item.inventoryId}|${item.unit}`;
      const total = totals.get(key);
      if (!total) { totals.set(key, { key, name: item.name, unit: item.unit, quantity: item.quantity, amount: item.lineTotal, cost: item.lineCost, priceMin: item.unitPrice, priceMax: item.unitPrice }); continue; }
      total.quantity = Math.round((total.quantity + item.quantity) * 100) / 100;
      total.amount = Math.round((total.amount + item.lineTotal) * 100) / 100;
      total.cost = total.cost === null || item.lineCost === null ? null : Math.round((total.cost + item.lineCost) * 100) / 100;
      total.priceMin = Math.min(total.priceMin, item.unitPrice);
      total.priceMax = Math.max(total.priceMax, item.unitPrice);
    }
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

function StoreItemsTable({ items }: { items: StoreItemTotal[] }) {
  const total = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const costKnown = items.every((item) => item.cost !== null);
  const totalCost = Math.round(items.reduce((sum, item) => sum + (item.cost ?? 0), 0) * 100) / 100;
  const net = (item: StoreItemTotal) => (item.cost === null ? null : Math.round((item.amount - item.cost) * 100) / 100);
  const netText = (value: number | null) => (value === null ? '—' : `${value < 0 ? '−' : ''}${plainAmount(Math.abs(value))}`);
  const netClass = (value: number | null) => (value === null ? 'text-gray-400' : value < 0 ? 'text-red-700' : 'text-green-700');
  const price = (item: StoreItemTotal) => (item.priceMin === item.priceMax ? plainAmount(item.priceMin) : `${plainAmount(item.priceMin)} – ${plainAmount(item.priceMax)}`);
  return (
    <>
    {/* Phone: one line per product, the amount always in view */}
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm sm:hidden">
      {items.map((item) => (
        <li key={item.key} className="flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{item.name}</p>
            <p className="text-xs text-gray-500">{formatQuantity(item.quantity)} {item.unit} × {price(item)}{item.cost !== null && ` · cost ${plainAmount(item.cost)}`}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold tabular-nums text-gray-900">{plainAmount(item.amount)}</p>
            <p className={`text-xs tabular-nums ${netClass(net(item))}`}>net {netText(net(item))}</p>
          </div>
        </li>
      ))}
      <li className="flex justify-between gap-3 bg-gray-50 px-3 py-2.5 font-bold"><span className="text-gray-700">TOTAL</span><span className="text-right tabular-nums text-gray-900">{peso(total)}<span className={`block text-xs ${netClass(costKnown ? total - totalCost : null)}`}>net {costKnown ? peso(Math.round((total - totalCost) * 100) / 100) : '—'}</span></span></li>
    </ul>
    <div className="hidden overflow-x-auto rounded-xl border border-gray-200 sm:block">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">Product</th>
            <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
            <th className="px-3 py-2.5 text-right font-medium">Selling Price</th>
            <th className="px-3 py-2.5 text-right font-medium">Total Amount</th>
            <th className="px-3 py-2.5 text-right font-medium">Cost</th>
            <th className="px-3 py-2.5 text-right font-medium">Net Income</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.key}>
              <td className="px-3 py-2 font-medium text-gray-900">{item.name}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatQuantity(item.quantity)} {item.unit}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{price(item)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{plainAmount(item.amount)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{item.cost === null ? '—' : plainAmount(item.cost)}</td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${netClass(net(item))}`}>{netText(net(item))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td colSpan={3} className="px-3 py-2.5 text-right text-sm font-bold text-gray-700">TOTAL</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums text-gray-900">{peso(total)}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums text-gray-900">{costKnown ? peso(totalCost) : '—'}</td>
            <td className={`px-3 py-2.5 text-right font-bold tabular-nums ${netClass(costKnown ? total - totalCost : null)}`}>{costKnown ? peso(Math.round((total - totalCost) * 100) / 100) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    {!costKnown && <p className="mt-2 text-xs text-gray-500">— No cost recorded: sold before sales kept their cost, and the product has no cost price yet. Set it with Edit in Store Inventory for future sales.</p>}
    </>
  );
}

// The expenses of the period added up by what they were for (the same words in any case), largest first.
// Older sales have their total only; it is shown as "Not itemized".
function expenseItemTotals(sales: KadiwaSale[]): KadiwaSaleExpense[] {
  const totals = new Map<string, KadiwaSaleExpense>();
  const add = (description: string, amount: number) => {
    const key = description.toLowerCase();
    const total = totals.get(key);
    if (total) total.amount = Math.round((total.amount + amount) * 100) / 100;
    else totals.set(key, { description, amount });
  };
  for (const sale of sales) {
    for (const line of sale.expenses) add(line.description, line.amount);
    const rest = Math.round((sale.totalExpenses - sale.expenses.reduce((sum, line) => sum + line.amount, 0)) * 100) / 100;
    if (rest > 0) add('Not itemized', rest);
  }
  return [...totals.values()].filter((line) => line.amount > 0).sort((a, b) => b.amount - a.amount || a.description.localeCompare(b.description));
}

function ExpenseList({ lines }: { lines: KadiwaSaleExpense[] }) {
  const total = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
      {lines.map((line, index) => (
        <li key={`${line.description}-${index}`} className="flex justify-between gap-3 px-3 py-2">
          <span className="min-w-0 text-gray-800">{line.description}</span>
          <span className="shrink-0 tabular-nums text-gray-900">{peso(line.amount)}</span>
        </li>
      ))}
      <li className="flex justify-between gap-3 bg-gray-50 px-3 py-2.5 font-bold"><span className="text-gray-700">TOTAL</span><span className="tabular-nums text-gray-900">{peso(total)}</span></li>
    </ul>
  );
}

function Stat({ label, value, detail, strong }: { label: string; value: string; detail?: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${strong ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
      <p className={`text-xs ${strong ? 'text-green-800' : 'text-gray-600'}`}>{label}</p>
      <p className={`break-words text-lg font-bold tabular-nums ${strong ? 'text-green-900' : 'text-gray-900'}`}>{value}</p>
      {detail && <p className="text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

// The paper layout: Goods Sold | Unit | Quantity | Price | Total Amount of Goods Sold, and the TOTAL.
function GoodsTable({ lines, total }: { lines: KadiwaSalesLine[]; total: number }) {
  return (
    <>
    {/* Phone: one line per good, the amount always in view */}
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm sm:hidden">
      {lines.map((line) => (
        <li key={`${line.name}|${line.unit ?? ''}`} className="flex items-start justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{line.name}</p>
            {(line.quantity !== null || line.price !== null) && (
              <p className="text-xs text-gray-500">{[line.quantity !== null ? `${formatQuantity(line.quantity)} ${line.unit ?? ''}`.trim() : line.unit, line.price !== null ? `× ${formatPrice(line)}` : ''].filter(Boolean).join(' ')}</p>
            )}
          </div>
          <p className="shrink-0 font-semibold tabular-nums text-gray-900">{plainAmount(line.amount)}</p>
        </li>
      ))}
      <li className="flex justify-between gap-3 bg-gray-50 px-3 py-2.5 font-bold"><span className="text-gray-700">TOTAL</span><span className="tabular-nums text-gray-900">{peso(total)}</span></li>
    </ul>
    <div className="hidden overflow-x-auto rounded-xl border border-gray-200 sm:block">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2.5 text-left font-medium">Goods Sold</th>
            <th className="px-3 py-2.5 text-left font-medium">Unit</th>
            <th className="px-3 py-2.5 text-right font-medium">Quantity</th>
            <th className="px-3 py-2.5 text-right font-medium">Price</th>
            <th className="px-3 py-2.5 text-right font-medium">Total Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((line) => (
            <tr key={`${line.name}|${line.unit ?? ''}`}>
              <td className="px-3 py-2 font-medium text-gray-900">{line.name}</td>
              <td className="px-3 py-2 text-gray-600">{line.unit ?? ''}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatQuantity(line.quantity)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatPrice(line)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{plainAmount(line.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50">
            <td colSpan={4} className="px-3 py-2.5 text-right text-sm font-bold text-gray-700">TOTAL</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums text-gray-900">{peso(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  );
}

// One sale as its daily form: the date, the seller and every good sold.
export function SaleSheetModal({ sale, onClose }: { sale: KadiwaSale; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const gross = saleGross(sale);

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="sale-sheet-title">
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">Kadiwa ng Pangulo · {sale.id}</p>
            <h2 id="sale-sheet-title" className="text-lg font-bold text-gray-900">Date: {formDate(sale.saleDate)}</h2>
            <p className="text-sm text-gray-600">Recorded by: <span className="font-semibold text-gray-900">{sale.seller}</span></p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close sale"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <GoodsTable lines={sale.lines} total={gross} />
          {sale.items.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-3">
              <h3 className="text-sm font-semibold text-gray-900">Store items in GROCERIES</h3>
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {sale.items.map((item, index) => (
                  <li key={`${item.inventoryId}-${index}`} className="flex justify-between gap-3 py-1.5">
                    <span className="text-gray-700">{item.name} · {formatQuantity(item.quantity)} {item.unit} × {peso(item.unitPrice)}{item.unitCost !== null && <span className="block text-xs text-gray-500">cost {peso(item.unitCost)} each = {peso(item.lineCost ?? 0)}</span>}</span>
                    <span className="text-right font-medium tabular-nums text-gray-900">{peso(item.lineTotal)}{item.lineCost !== null && <span className={`block text-xs ${item.lineTotal - item.lineCost < 0 ? 'text-red-700' : 'text-green-700'}`}>net {peso(Math.round((item.lineTotal - item.lineCost) * 100) / 100)}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(sale.expenses.length > 0 || sale.totalExpenses > 0) && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Expenses</h3>
              {sale.expenses.length > 0
                ? <ExpenseList lines={sale.expenses} />
                : <p className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600">{peso(sale.totalExpenses)}, not itemized (saved before expenses were listed).</p>}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-gray-50 p-3"><dt className="text-gray-600">Total sold</dt><dd className="font-bold tabular-nums text-gray-900">{peso(gross)}</dd></div>
            <div className="rounded-xl bg-gray-50 p-3"><dt className="text-gray-600">Cost of store items</dt><dd className="font-bold tabular-nums text-gray-900">{peso(sale.costOfGoods)}</dd></div>
            <div className="rounded-xl bg-gray-50 p-3"><dt className="text-gray-600">Expenses</dt><dd className="font-bold tabular-nums text-gray-900">{peso(sale.totalExpenses)}</dd></div>
            <div className={`rounded-xl p-3 ${sale.netSales < 0 ? 'bg-red-50' : 'bg-green-50'}`}><dt className={sale.netSales < 0 ? 'text-red-800' : 'text-green-800'}>Net income</dt><dd className={`font-bold tabular-nums ${sale.netSales < 0 ? 'text-red-900' : 'text-green-900'}`}>{peso(sale.netSales)}</dd></div>
          </dl>
          <p className="text-xs text-gray-500">Saved {formatDate(sale.date)}.</p>
        </div>
      </div>
    </div>
  );
}
