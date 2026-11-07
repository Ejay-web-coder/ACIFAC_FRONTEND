import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronRight, Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { submitVendorKadiwaSale, type KadiwaBuyer, type KadiwaGood, type KadiwaInventoryItem, type KadiwaSale } from '../../app/services/authApi';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';
import { CATEGORIES, peso, productLabel } from '../../admin/components/kadiwa/InventoryForms';
import { GOODS_UNITS, saleGross } from '../../admin/components/kadiwa/SalesForms';
import { storeQuantityProblem } from '../../admin/components/kadiwa/StoreItemsPicker';
import { MemberPicker, PESOS_PER_POINT, pointsFor } from '../../admin/components/kadiwa/MemberPurchases';
import { confirmAction } from '../../app/components/common/ConfirmDialog';

// The Kadiwa store vendor's sale, like a till: search a product, set its unit,
// price and quantity, and add it to the sale. Then the members who bought and
// the day's expenses, and Record sale sends it for the office to confirm.
// On phones the goods and the checkout are two screens.

const MONEY = /^\d+(\.\d{1,2})?$/;
const QUANTITY = /^\d+(\.\d{1,4})?$/;
const DRAFT_KEY = 'acifac.kadiwa.vendorSale';
// The form before this page: an unsent sale typed there is brought over once.
const OLD_DRAFT_KEY = 'acifac.kadiwa.vendorSaleSheet';
const EXPENSE_KINDS = ['Transportation', 'Plastic bags', 'Ice', 'Labor', 'Load / communication', 'Stall rental', 'Electricity', 'Water', 'Meals'];
const BOX = 'h-12 w-full min-w-0 rounded-xl border border-gray-300 bg-white text-base text-gray-900 placeholder:text-gray-400 focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-green-700/30';

// The vendor sells eggs by size: EGG becomes EGG (XS) to EGG (XL), each its own line in the
// reports. A size sold before comes back with its own unit and price; a new one starts from EGG's.
const EGG_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const eggName = (size: string) => `EGG (${size})`;
function withEggSizes(goods: KadiwaGood[]) {
  const egg = goods.find((good) => good.name === 'EGG');
  if (!egg) return goods;
  const sized = new Map(goods.filter((good) => EGG_SIZES.some((size) => good.name === eggName(size))).map((good) => [good.name, good]));
  return goods.flatMap((good) => (good.name === 'EGG' ? EGG_SIZES.map((size) => sized.get(eggName(size)) ?? { ...egg, name: eggName(size) })
    : sized.has(good.name) ? [] : [good]));
}

type Category = KadiwaInventoryItem['category'];
type GoodLine = { key: number; kind: 'good'; name: string; unit: string; category: Category; price: string; quantity: string };
type StoreLine = { key: number; kind: 'store'; id: string; quantity: string };
type Line = GoodLine | StoreLine;
interface MemberLine { key: number; member: KadiwaBuyer; amount: string }
interface ExpenseLine { key: number; description: string; amount: string }
interface Draft { lines: Line[]; members: MemberLine[]; expenses: ExpenseLine[] }
// What the search finds: a good of the daily form, a store item, or other goods typed in.
type Product =
  | { id: string; kind: 'good'; name: string; unit: string; category: Category; price: string; custom?: boolean }
  | { id: string; kind: 'store'; item: KadiwaInventoryItem };

const cents = (value: number) => Math.round(value * 100) / 100;
const moneyText = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
const quantityText = (value: number) => String(Number(value.toFixed(4)));
/** "SIBUYAS/BAWANG" -> "Sibuyas/Bawang", "EGG (XL)" -> "Egg (XL)". */
const titleCase = (name: string) => name.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase()).replace(/\(([^)]*)\)/g, (part) => part.toUpperCase());
const unitWord = (unit: string) => unit.toLowerCase();
const unitLabel = (unit: string) => titleCase(unit);
const lineId = (line: Line) => (line.kind === 'good' ? `g:${line.name}` : `s:${line.id}`);

// Wide screens (1024 px and up) show the goods and the checkout side by side; phones show one at a time.
const WIDE = '(min-width: 1024px)';
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const media = window.matchMedia(WIDE);
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}

function readDraft(): Draft | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null') as Draft | null;
    if (saved && Array.isArray(saved.lines)) return { lines: saved.lines, members: saved.members ?? [], expenses: saved.expenses ?? [] };
    return readOldDraft();
  } catch {
    return null;
  }
}
// The earlier form kept every good with a quantity or only a total amount typed.
function readOldDraft(): Draft | null {
  const old = JSON.parse(window.localStorage.getItem(OLD_DRAFT_KEY) || 'null') as {
    rows?: Array<{ name: string; unit: string; category: Category; price: string; quantity: string; amount: string }>;
    store?: Record<string, string>; expenses?: Array<{ description: string; amount: string }>; members?: Array<{ member: KadiwaBuyer | null; amount: string }>;
  } | null;
  window.localStorage.removeItem(OLD_DRAFT_KEY);
  if (!old) return null;
  let key = 1;
  const lines: Line[] = [];
  for (const row of old.rows ?? []) {
    if (!row.name?.trim() || !(row.quantity?.trim() || row.amount?.trim())) continue;
    const price = MONEY.test(row.price?.trim() ?? '') && Number(row.price) > 0 ? row.price.trim() : '';
    const quantity = row.quantity?.trim() || (price && MONEY.test(row.amount.trim()) ? quantityText(Number(row.amount) / Number(price)) : '1');
    lines.push({ key: key++, kind: 'good', name: row.name.trim().toUpperCase(), unit: row.unit ?? '', category: row.category, price: price || row.amount.trim(), quantity });
  }
  for (const [id, quantity] of Object.entries(old.store ?? {})) if (quantity.trim()) lines.push({ key: key++, kind: 'store', id, quantity: quantity.trim() });
  return {
    lines,
    members: (old.members ?? []).filter((row) => row.member && row.amount.trim()).map((row) => ({ key: key++, member: row.member as KadiwaBuyer, amount: row.amount.trim() })),
    expenses: (old.expenses ?? []).filter((row) => row.description.trim()).map((row) => ({ key: key++, description: row.description.trim(), amount: row.amount.trim() || '0' })),
  };
}
function writeDraft(draft: Draft) {
  try {
    if (draft.lines.length || draft.members.length || draft.expenses.length) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch { /* storage unavailable: the sale still works, it is only not kept */ }
}

export function VendorSaleForm({ goods, inventory, onSaved }: { goods: KadiwaGood[]; inventory: KadiwaInventoryItem[]; onSaved: (sale: KadiwaSale) => void }) {
  const draft = useMemo(readDraft, []);
  const [lines, setLines] = useState<Line[]>(draft?.lines ?? []);
  const [members, setMembers] = useState<MemberLine[]>(draft?.members ?? []);
  const [expenses, setExpenses] = useState<ExpenseLine[]>(draft?.expenses ?? []);
  const nextKey = useRef(Math.max(0, ...[...(draft?.lines ?? []), ...(draft?.members ?? []), ...(draft?.expenses ?? [])].map((row) => row.key)) + 1);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState<Product | null>(null);
  const [lastKey, setLastKey] = useState<number | null>(null);
  // Phones: the goods, or the checkout (members, expenses and Record sale).
  const [screen, setScreen] = useState<'sell' | 'checkout'>('sell');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);
  const wide = useWide();

  useEffect(() => { writeDraft({ lines, members, expenses }); }, [lines, members, expenses]);

  const byId = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);
  const catalog = useMemo<Product[]>(() => [
    ...withEggSizes(goods).map((good): Product => ({ id: `g:${good.name}`, kind: 'good', name: good.name, unit: good.unit ?? '', category: good.category, price: good.price === null ? '' : moneyText(good.price) })),
    ...inventory.map((item): Product => ({ id: `s:${item.id}`, kind: 'store', item })),
  ], [goods, inventory]);
  const query = search.trim().toLowerCase();
  const matches = query ? catalog.filter((product) => (product.kind === 'good' ? product.name : `${productLabel(product.item)} ${product.item.id}`).toLowerCase().includes(query)) : [];
  const selected = custom ?? matches.find((product) => product.id === picked) ?? matches[0] ?? null;

  // Each line's amount and the totals. A store item that cannot be sold counts nothing until fixed.
  const amountOf = (line: Line) => {
    if (line.kind === 'good') return MONEY.test(line.price) && QUANTITY.test(line.quantity) ? cents(Number(line.price) * Number(line.quantity)) : 0;
    const item = byId.get(line.id);
    return item && !storeQuantityProblem(item, line.quantity) ? cents(item.price * Number(line.quantity)) : 0;
  };
  const gross = cents(lines.reduce((sum, line) => sum + amountOf(line), 0));
  const storeCost = cents(lines.reduce((sum, line) => {
    const item = line.kind === 'store' ? byId.get(line.id) : undefined;
    return item && !storeQuantityProblem(item, line.quantity) ? sum + cents((item.costPrice ?? 0) * Number(line.quantity)) : sum;
  }, 0));
  const expensesTotal = cents(expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
  const net = cents(gross - expensesTotal - storeCost);
  const membersSpent = cents(members.reduce((sum, row) => sum + (Number(row.amount) || 0), 0));
  const countText = `${lines.length} ${lines.length === 1 ? 'good' : 'goods'}`;

  const lineName = (line: Line) => (line.kind === 'good' ? titleCase(line.name) : byId.has(line.id) ? productLabel(byId.get(line.id)!) : 'Store item no longer listed');
  const lineUnit = (line: Line) => (line.kind === 'good' ? line.unit : byId.get(line.id)?.unit ?? '');
  const linePrice = (line: Line) => (line.kind === 'good' ? Number(line.price) || 0 : byId.get(line.id)?.price ?? 0);

  const focusSearch = () => window.setTimeout(() => searchBox.current?.focus(), 0);
  const changeSearch = (value: string) => { setSearch(value); setPicked(null); setCustom(null); setError(''); };
  const commit = (line: Line) => {
    setError('');
    setLines((current) => {
      const index = current.findIndex((other) => lineId(other) === lineId(line));
      return index < 0 ? [...current, line] : current.map((other, at) => (at === index ? { ...line, key: other.key } : other));
    });
    setLastKey(lines.find((other) => lineId(other) === lineId(line))?.key ?? line.key);
    changeSearch('');
    focusSearch();
  };
  const remove = (line: Line) => setLines((current) => current.filter((other) => other.key !== line.key));
  const step = (line: Line, by: 1 | -1) => {
    const max = line.kind === 'store' ? byId.get(line.id)?.stock ?? 0 : Infinity;
    const next = Math.min(max, Math.max(1, Math.floor(Number(line.quantity) || 0) + by));
    setLines((current) => current.map((other) => (other.key === line.key ? { ...other, quantity: quantityText(next) } : other)));
    setLastKey(line.key);
  };
  // Tapping a line of the sale opens it in the editor, to change it.
  const edit = (line: Line) => {
    if (line.kind === 'good' && !catalog.some((product) => product.id === lineId(line))) {
      setSearch(line.name); setPicked(null);
      setCustom({ id: lineId(line), kind: 'good', name: line.name, unit: line.unit, category: line.category, price: line.price, custom: true });
    } else {
      setSearch(line.kind === 'good' ? line.name : byId.get(line.id)?.name ?? ''); setCustom(null); setPicked(lineId(line));
    }
    setScreen('sell');
  };

  const reset = () => { setLines([]); setMembers([]); setExpenses([]); changeSearch(''); setLastKey(null); };
  const clear = async () => {
    if ((lines.length || members.length || expenses.length) && !(await confirmAction('Clear this sale? Every good, member purchase and expense on it is removed.', { confirmLabel: 'Clear', danger: true }))) return;
    reset();
    setScreen('sell');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!lines.length && !expenses.length) { setError('Add the goods sold, or an expense.'); return; }
    const badStore = lines.find((line) => line.kind === 'store' && (!byId.has(line.id) || storeQuantityProblem(byId.get(line.id)!, line.quantity)));
    if (badStore) { setError(`${lineName(badStore)}: ${byId.has((badStore as StoreLine).id) ? storeQuantityProblem(byId.get((badStore as StoreLine).id)!, badStore.quantity) : 'remove it from the sale.'}`); return; }
    if (membersSpent > gross + 0.001) { setError(`The member purchases (${peso(membersSpent)}) are more than the goods sold (${peso(gross)}).`); return; }
    setSaving(true);
    try {
      const goodsLines = lines.filter((line): line is GoodLine => line.kind === 'good');
      const response = await submitVendorKadiwaSale({
        saleDate: dateOnlyToday(),
        goods: goodsLines.map((line) => ({ name: line.name, unit: line.unit, category: line.category, price: line.price, quantity: line.quantity, amount: amountOf(line).toFixed(2) })),
        items: lines.filter((line): line is StoreLine => line.kind === 'store').map((line) => ({ inventoryId: line.id, quantity: line.quantity })),
        expenses: expenses.map((row) => ({ description: row.description, amount: row.amount })),
        memberPurchases: members.map((row) => ({ memberId: row.member.id, amount: row.amount })),
      });
      reset();
      setScreen('sell');
      toast.success(`Sale of ${formatDate(response.sale.saleDate)} recorded`, { description: `Total ${peso(saleGross(response.sale))} · Expenses ${peso(response.sale.totalExpenses)} · Net income ${peso(response.sale.netSales)}. The office confirms it.` });
      onSaved(response.sale);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to record the sale.');
    } finally {
      setSaving(false);
    }
  };

  const inSale = (product: Product) => lines.find((line) => lineId(line) === product.id) ?? null;

  const searchCard = (
    <section className="rounded-3xl border border-gray-200 bg-white p-4 sm:p-6" aria-labelledby="vendor-search-title">
      <h2 id="vendor-search-title" className="text-xl font-bold text-gray-900 sm:text-2xl">What did you sell?</h2>
      <p className="mt-1 hidden text-sm text-gray-600 sm:block">Search a product, then set its unit, price and quantity.</p>
      <div className="relative mt-3 sm:mt-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
        <input ref={searchBox} type="search" value={search} onChange={(event) => changeSearch(event.target.value)} autoComplete="off" placeholder="Search a product, e.g. pork, tuna" aria-label="Search a product"
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); document.getElementById('vendor-quantity')?.focus(); } }}
          className="h-14 w-full rounded-2xl border-2 border-green-800 bg-white pl-12 pr-14 text-lg font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-green-700/15 [&::-webkit-search-cancel-button]:hidden" />
        {search && <button type="button" onClick={() => { changeSearch(''); focusSearch(); }} className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200" aria-label="Clear the search"><X className="h-5 w-5" /></button>}
      </div>

      {query && (selected ? (
        <>
          {matches.length > 1 && !custom && (
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 py-1" role="group" aria-label="Products found">
              {matches.slice(0, 20).map((product) => (
                <button key={product.id} type="button" onClick={() => setPicked(product.id)} aria-pressed={selected.id === product.id}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${selected.id === product.id ? 'border-green-800 bg-green-800 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-green-50'}`}>
                  {inSale(product) && <Check className="h-3.5 w-3.5" />}{product.kind === 'good' ? titleCase(product.name) : productLabel(product.item)}
                </button>
              ))}
            </div>
          )}
          <ItemEditor key={selected.id} product={selected} existing={custom ? lines.find((line) => lineId(line) === custom.id) ?? null : inSale(selected)} matchText={custom ? '' : `${matches.length} ${matches.length === 1 ? 'item matches' : 'items match'} “${search.trim()}”`}
            onSave={(line) => commit({ ...line, key: nextKey.current++ })} />
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 p-6 text-center">
          <p className="text-sm text-gray-600">Nothing matches “{search.trim()}”.</p>
          <button type="button" onClick={() => setCustom({ id: `g:${search.trim().toUpperCase()}`, kind: 'good', name: search.trim().toUpperCase(), unit: 'KILO', category: 'Vegetables', price: '', custom: true })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-green-800 ring-1 ring-green-700 hover:bg-green-50"><Plus className="h-4 w-4" />Sell “{search.trim()}” as other goods</button>
        </div>
      ))}
    </section>
  );

  const saleCard = (
    <section className="flex min-h-[9rem] flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white" aria-labelledby="vendor-sale-title">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
        <h2 id="vendor-sale-title" className="flex items-center gap-2 text-xl font-bold text-gray-900">This sale <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-700">{countText}</span></h2>
        {lines.length > 0 && <p className="hidden text-sm text-gray-500 md:block">Use − and + to fix a quantity</p>}
      </div>
      {!lines.length ? (
        <p className="border-t border-gray-100 px-4 py-6 text-center text-sm text-gray-500 sm:px-6">Nothing yet. Search a product above and add it to the sale.</p>
      ) : (
        <>
          {/* Only the lines scroll; the heading and the goods total stay. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-[1] hidden grid-cols-[minmax(0,1fr)_10rem_7rem_8rem_2.5rem] items-center gap-4 border-y border-gray-100 bg-gray-50 px-6 py-3 text-sm font-medium text-gray-600 md:grid">
            <span>Item</span><span>Quantity</span><span>Price</span><span className="text-right">Amount</span><span />
          </div>
          <ul className="divide-y divide-gray-100 border-t border-gray-100 md:border-t-0">
            {lines.map((line) => {
              const unit = lineUnit(line);
              const problem = line.kind === 'store' ? (byId.has(line.id) ? storeQuantityProblem(byId.get(line.id)!, line.quantity) : 'No longer in the store inventory: remove it.') : '';
              return (
                <li key={line.key} className={`${line.key === lastKey ? 'bg-green-50/70' : ''}`}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_2.5rem] items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_10rem_7rem_8rem_2.5rem] md:gap-4 md:px-6">
                    <button type="button" onClick={() => edit(line)} className="min-w-0 text-left">
                      <span className="block truncate text-lg font-semibold text-gray-900 md:text-base">{lineName(line)}</span>
                      <span className="block text-sm text-gray-500 md:hidden">{line.quantity} {unitWord(unit)} × {peso(linePrice(line)).replace('.00', '')}</span>
                      <span className="hidden text-sm text-gray-500 md:block">{unit ? `Sold per ${unitWord(unit)}` : 'Tap to change'}</span>
                    </button>
                    <div className="hidden md:block">
                      <Stepper value={line.quantity} onMinus={() => step(line, -1)} onPlus={() => step(line, 1)} label={lineName(line)}
                        canMinus={Number(line.quantity) > 1} canPlus={line.kind === 'good' || Number(line.quantity) < (byId.get(line.id)?.stock ?? 0)} small />
                    </div>
                    <span className="hidden text-gray-600 tabular-nums md:block">{peso(linePrice(line))}</span>
                    <span className="text-right text-lg font-bold tabular-nums text-gray-900 md:text-base">{peso(amountOf(line))}</span>
                    <button type="button" onClick={() => remove(line)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-700 hover:bg-red-50" aria-label={`Remove ${lineName(line)}`}><Trash2 className="h-5 w-5" /></button>
                  </div>
                  {problem && <p className="px-4 pb-2 text-xs text-red-600 md:px-6">{problem}</p>}
                </li>
              );
            })}
          </ul>
          </div>
          <div className="hidden shrink-0 items-center justify-between border-t border-gray-100 px-6 py-3 md:flex">
            <span className="text-gray-600">Goods total</span>
            <span className="text-2xl font-bold tabular-nums text-gray-900">{peso(gross)}</span>
          </div>
        </>
      )}
    </section>
  );

  const totalsCard = (
    // On top and in large type: the first thing the vendor reads.
    <div className="shrink-0 rounded-3xl bg-[#1d3b26] p-4 text-white sm:p-5">
      <p className="text-lg font-semibold text-white/85">Total amount of goods sold</p>
      <p className="text-5xl font-extrabold tabular-nums tracking-tight">{peso(gross)}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-2xl bg-white/10 px-3 py-2"><dt className="text-sm font-medium text-white/80">Goods</dt><dd className="truncate text-xl font-bold">{lines.length} {lines.length === 1 ? 'item' : 'items'}</dd></div>
        <div className="min-w-0 rounded-2xl bg-white/10 px-3 py-2"><dt className="text-sm font-medium text-white/80">Expenses</dt><dd className="truncate text-xl font-bold tabular-nums">{peso(expensesTotal)}</dd></div>
        <div className="min-w-0 rounded-2xl bg-[#f3c443]/15 px-3 py-2"><dt className="text-sm font-semibold text-[#f3c443]">Net income</dt><dd className="truncate text-xl font-extrabold tabular-nums text-[#f3c443]">{peso(net)}</dd></div>
      </dl>
      {storeCost > 0 && <p className="mt-2 text-sm text-white/80">Net income is after the cost of store items, {peso(storeCost)}.</p>}
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-base text-red-800" role="alert">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={() => void clear()} className="inline-flex min-h-14 items-center justify-center rounded-2xl px-6 text-xl font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">Clear</button>
        <button type="submit" disabled={saving} className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#f3c443] px-5 text-xl font-bold text-[#1d3b26] hover:bg-[#f7d15e] disabled:cursor-not-allowed disabled:opacity-60">
          <Check className="h-6 w-6" />{saving ? 'Recording…' : 'Record sale'}
        </button>
      </div>
    </div>
  );

  const checkoutCards = (
    <>
      <MembersCard rows={members} spent={membersSpent} onAdd={(member, amount) => { setError(''); setMembers((current) => [...current, { key: nextKey.current++, member, amount }]); }}
        onRemove={(key) => setMembers((current) => current.filter((row) => row.key !== key))} />
      <ExpensesCard rows={expenses} total={expensesTotal} onAdd={(description, amount) => { setError(''); setExpenses((current) => [...current, { key: nextKey.current++, description, amount }]); }}
        onRemove={(key) => setExpenses((current) => current.filter((row) => row.key !== key))} />
    </>
  );
  const draftNote = draft && lines.length > 0 && <p className="shrink-0 text-xs text-amber-800">An unsent sale from before was brought back. Use Clear to start over.</p>;

  return (
    // One screen high: only the lists inside scroll. Enter in a box never records the sale: only the Record sale button does.
    <form onSubmit={(event) => void submit(event)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') event.preventDefault(); }} noValidate className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
      {wide ? (
        // Wide screens: the goods on the left; the total on top of the right, then the members and expenses.
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_24rem] gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            {draftNote}
            <div className="min-h-0 shrink overflow-y-auto rounded-3xl">{searchCard}</div>
            {saleCard}
          </div>
          <div className="flex min-h-0 flex-col gap-4">
            {totalsCard}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-3xl">{checkoutCards}</div>
          </div>
        </div>
      ) : screen === 'sell' ? (
        // Phones: the goods first, then Checkout opens the total, the members and the expenses.
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {draftNote}
            <div className="shrink-0">{searchCard}</div>
            {saleCard}
          </div>
          <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
            <div className="mx-auto flex max-w-xl items-center gap-4">
              <div className="min-w-0">
                <p className="text-base text-gray-600">Total, {countText}</p>
                <p className="truncate text-3xl font-extrabold tabular-nums text-gray-900">{peso(gross)}</p>
              </div>
              <button type="button" onClick={() => setScreen('checkout')} className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-green-800 px-5 text-xl font-bold text-white hover:bg-green-900">
                Checkout<ChevronRight className="h-6 w-6" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setScreen('sell')} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-gray-800 hover:bg-gray-100" aria-label="Back to the goods"><ArrowLeft className="h-6 w-6" /></button>
              <h2 className="text-2xl font-bold text-gray-900">Checkout</h2>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">{countText}</span>
          </div>
          <div className="shrink-0 px-3 pt-3">{totalsCard}</div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">{checkoutCards}</div>
        </>
      )}
    </form>
  );
}

// The product found by the search: its unit, price and quantity, and the amount they make.
function ItemEditor({ product, existing, matchText, onSave }: { product: Product; existing: Line | null; matchText: string; onSave: (line: Omit<GoodLine, 'key'> | Omit<StoreLine, 'key'>) => void }) {
  const store = product.kind === 'store' ? product.item : null;
  const good = product.kind === 'good' ? product : null;
  const [unit, setUnit] = useState(existing?.kind === 'good' ? existing.unit : good?.unit ?? '');
  const [category, setCategory] = useState<Category>(existing?.kind === 'good' ? existing.category : good?.category ?? 'Other');
  const [price, setPrice] = useState(existing?.kind === 'good' ? existing.price : good?.price ?? '');
  const [quantity, setQuantity] = useState(existing?.quantity ?? '1');
  const [problem, setProblem] = useState('');
  const name = good ? titleCase(good.name) : productLabel(store!);
  // The good's own unit first, then kilo and piece; other goods can be sold in any unit.
  const units = good?.custom ? GOODS_UNITS : [...new Set([good?.unit, unit, 'KILO', 'PC'].filter((value): value is string => Boolean(value)))];
  const priceValue = store ? store.price : Number(price) || 0;
  const amount = MONEY.test(price.trim() || String(priceValue)) && QUANTITY.test(quantity.trim()) ? cents(priceValue * Number(quantity)) : 0;
  const stepBy = (by: 1 | -1) => {
    const next = Math.max(1, Math.floor(Number(quantity) || 0) + by);
    setQuantity(quantityText(store ? Math.min(store.stock, next) : next));
    setProblem('');
  };
  const save = () => {
    const qty = quantity.trim();
    if (store) {
      const why = storeQuantityProblem(store, qty) || (!qty ? 'Enter how many were sold.' : '');
      if (why) { setProblem(why); return; }
      onSave({ kind: 'store', id: store.id, quantity: qty });
      return;
    }
    if (!MONEY.test(price.trim()) || Number(price) <= 0) { setProblem('Enter the price, like 400 or 12.50.'); return; }
    if (!QUANTITY.test(qty) || Number(qty) <= 0) { setProblem('Enter the quantity, more than zero (up to 4 decimals, like 1.5).'); return; }
    onSave({ kind: 'good', name: good!.name, unit, category, price: price.trim(), quantity: qty });
  };

  const unitPicker = store ? (
    <p className="flex h-12 items-center rounded-xl border border-gray-200 bg-white px-4 text-gray-700">{unitLabel(store.unit)} <span className="ml-auto text-sm text-gray-500">{store.stock} in stock</span></p>
  ) : (
    <div className="flex h-12 gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1" role="group" aria-label={`Unit of ${name}`}>
      {units.map((option) => (
        <button key={option} type="button" onClick={() => setUnit(option)} aria-pressed={unit === option}
          className={`min-w-[4.5rem] flex-1 rounded-lg px-3 text-base font-semibold ${unit === option ? 'bg-green-800 text-white' : 'text-gray-800 hover:bg-gray-100'}`}>{unitLabel(option)}</button>
      ))}
    </div>
  );
  const priceLabel = `Price${(store?.unit ?? unit) ? ` per ${unitWord(store?.unit ?? unit)}` : ''}`;

  return (
    <div className="mt-4 rounded-2xl border border-green-900/10 bg-[#e9efe6] p-4 sm:p-6" onKeyDown={(event) => { if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); save(); } }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-2xl font-bold text-gray-900">{name}</h3>
          {existing && <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-semibold text-green-800 ring-1 ring-green-800/20"><Check className="h-4 w-4" />In this sale</span>}
        </div>
        {matchText && <p className="hidden text-sm text-gray-600 sm:block">{matchText}</p>}
      </div>
      {good?.custom && (
        <label className="mt-3 block text-sm font-medium text-gray-700">Kind of goods
          <select value={category} onChange={(event) => setCategory(event.target.value as Category)} className={`${BOX} mt-1 px-3`}>
            {CATEGORIES.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
      )}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
        <div className="col-span-2 xl:col-span-1">
          <span className="mb-1.5 hidden text-sm font-medium text-gray-700 xl:block">Unit</span>
          {unitPicker}
        </div>
        <label className="block min-w-0 text-sm font-medium text-gray-700">{priceLabel}
          {store ? <p className="mt-1.5 flex h-12 items-center rounded-xl border border-gray-200 bg-white px-4 text-base tabular-nums text-gray-900">{peso(store.price)}</p> : (
            <span className="relative mt-1.5 block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
              <input inputMode="decimal" value={price} onChange={(event) => { setPrice(event.target.value); setProblem(''); }} placeholder="0.00" className={`${BOX} pl-9 pr-3 text-lg font-semibold`} />
            </span>
          )}
        </label>
        <div className="min-w-0 text-sm font-medium text-gray-700">
          <label htmlFor="vendor-quantity">Quantity</label>
          <div className="mt-1.5">
            <Stepper id="vendor-quantity" value={quantity} onChange={(value) => { setQuantity(value); setProblem(''); }} onMinus={() => stepBy(-1)} onPlus={() => stepBy(1)} label={name}
              canMinus={Number(quantity) > 1} canPlus={!store || Number(quantity) < store.stock} />
          </div>
        </div>
        <div className="xl:pl-2">
          <p className="text-sm font-medium text-gray-700">Amount</p>
          <p className="text-3xl font-extrabold tabular-nums text-gray-900">{peso(amount)}</p>
        </div>
        <div className="flex items-end xl:col-span-4 xl:justify-end">
          <button type="button" onClick={save} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-green-800 px-6 text-lg font-bold text-white hover:bg-green-900 xl:w-auto">
            {existing ? <><Check className="h-5 w-5" />Update item</> : <><Plus className="h-5 w-5" />Add to sale</>}
          </button>
        </div>
      </div>
      {problem && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{problem}</p>}
    </div>
  );
}

// − 2 +, with the number typed in when onChange is given (decimals like 1.5 kilo).
function Stepper({ id, value, onChange, onMinus, onPlus, canMinus, canPlus, label, small = false }: {
  id?: string; value: string; onChange?: (value: string) => void; onMinus: () => void; onPlus: () => void; canMinus: boolean; canPlus: boolean; label: string; small?: boolean;
}) {
  const button = `inline-flex shrink-0 items-center justify-center rounded-lg text-gray-800 disabled:opacity-30 ${small ? 'h-9 w-9 hover:bg-gray-100' : 'h-10 w-11 bg-gray-100 hover:bg-gray-200'}`;
  return (
    <div className={`flex items-center justify-between gap-1 rounded-xl border border-gray-200 bg-white ${small ? 'h-11 p-1' : 'h-12 p-1'}`}>
      <button type="button" onClick={onMinus} disabled={!canMinus} className={button} aria-label={`One less ${label}`}><Minus className="h-5 w-5" /></button>
      {onChange
        ? <input id={id} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Quantity of ${label}`} className="w-full min-w-0 bg-transparent text-center text-xl font-semibold tabular-nums text-gray-900 focus:outline-none" />
        : <span className="text-lg font-semibold tabular-nums text-gray-900">{value}</span>}
      <button type="button" onClick={onPlus} disabled={!canPlus} className={button} aria-label={`One more ${label}`}><Plus className="h-5 w-5" /></button>
    </div>
  );
}

function Card({ title, aside, hint, children }: { title: string; aside?: ReactNode; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {aside}
      </div>
      <p className="mt-1 text-gray-600">{hint}</p>
      {children}
    </section>
  );
}

function MembersCard({ rows, spent, onAdd, onRemove }: { rows: MemberLine[]; spent: number; onAdd: (member: KadiwaBuyer, amount: string) => void; onRemove: (key: number) => void }) {
  const [member, setMember] = useState<KadiwaBuyer | null>(null);
  const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState('');
  const add = () => {
    if (!member) { setProblem('Find the member by member ID or name.'); return; }
    if (rows.some((row) => row.member.id === member.id)) { setProblem(`${member.name} is already listed. Remove that line and add the whole amount.`); return; }
    if (!MONEY.test(amount.trim()) || Number(amount) <= 0) { setProblem('Enter the amount bought, like 250 or 250.50.'); return; }
    onAdd(member, amount.trim());
    setMember(null); setAmount(''); setProblem('');
  };
  const points = pointsFor(spent);
  return (
    <Card title="Member purchases" hint={`Every ₱${PESOS_PER_POINT} a member spends earns 1 patronage point.`}>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Tile value={String(rows.length)} label="Members" />
        <Tile value={peso(spent)} label="Spent" />
        <Tile value={points.toLocaleString('en-PH', { maximumFractionDigits: 2 })} label="Points" gold />
      </div>
      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-200">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-2 pl-4 pr-1">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-gray-900">{row.member.name}</span>
                <span className="block text-xs text-gray-500">{row.member.memberNumber} · {pointsFor(Number(row.amount)).toLocaleString('en-PH', { maximumFractionDigits: 2 })} points</span>
              </span>
              <span className="font-semibold tabular-nums text-gray-900">{peso(Number(row.amount))}</span>
              <button type="button" onClick={() => onRemove(row.key)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-700 hover:bg-red-50" aria-label={`Remove ${row.member.name}`}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 space-y-3" onKeyDown={(event) => { if (event.key === 'Enter' && (event.target as HTMLElement).dataset.add === 'member') { event.preventDefault(); add(); } }}>
        <MemberPicker value={member} onPick={(next) => { setMember(next); setProblem(''); }} invalid={Boolean(problem) && !member} inputClassName={`${BOX} pr-3`} />
        <AmountAndAdd value={amount} onChange={(value) => { setAmount(value); setProblem(''); }} onAdd={add} label="Amount the member bought" field="member" />
        {problem && <p className="text-sm text-red-700">{problem}</p>}
      </div>
    </Card>
  );
}

function ExpensesCard({ rows, total, onAdd, onRemove }: { rows: ExpenseLine[]; total: number; onAdd: (description: string, amount: string) => void; onRemove: (key: number) => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState('');
  const add = () => {
    if (!description.trim()) { setProblem('Enter what the expense was for.'); return; }
    if (!MONEY.test(amount.trim())) { setProblem('Enter the amount, like 150 or 150.50.'); return; }
    onAdd(description.trim().replace(/\s+/g, ' '), amount.trim());
    setDescription(''); setAmount(''); setProblem('');
  };
  return (
    <Card title="Expenses" aside={<span className="text-xl font-bold tabular-nums text-gray-900">{peso(total)}</span>} hint="What you paid for today, like transportation, and how much.">
      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-200">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-2 pl-4 pr-1">
              <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{row.description}</span>
              <span className="font-semibold tabular-nums text-gray-900">{peso(Number(row.amount))}</span>
              <button type="button" onClick={() => onRemove(row.key)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-700 hover:bg-red-50" aria-label={`Remove ${row.description}`}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 space-y-3" onKeyDown={(event) => { if (event.key === 'Enter' && (event.target as HTMLElement).dataset.add === 'expense') add(); }}>
        <input value={description} onChange={(event) => { setDescription(event.target.value); setProblem(''); }} list="vendor-expense-kinds" maxLength={120} autoComplete="off" placeholder="e.g. Transportation" aria-label="What the expense was for" className={`${BOX} px-4`} />
        <datalist id="vendor-expense-kinds">{EXPENSE_KINDS.map((kind) => <option key={kind} value={kind} />)}</datalist>
        <AmountAndAdd value={amount} onChange={(value) => { setAmount(value); setProblem(''); }} onAdd={add} label="Amount of the expense" field="expense" />
        {problem && <p className="text-sm text-red-700">{problem}</p>}
      </div>
    </Card>
  );
}

function AmountAndAdd({ value, onChange, onAdd, label, field }: { value: string; onChange: (value: string) => void; onAdd: () => void; label: string; field: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
      <span className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₱</span>
        <input data-add={field} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0.00" aria-label={label} className={`${BOX} pl-9 pr-4 text-right`} />
      </span>
      <button type="button" onClick={onAdd} className="inline-flex h-12 items-center gap-1.5 rounded-xl px-4 text-base font-semibold text-green-800 ring-1 ring-green-800 hover:bg-green-50"><Plus className="h-4 w-4" />Add</button>
    </div>
  );
}

function Tile({ value, label, gold = false }: { value: string; label: string; gold?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl px-3 py-3 ${gold ? 'bg-amber-50 text-amber-900' : 'bg-gray-100 text-gray-900'}`}>
      <p className="truncate text-lg font-bold tabular-nums sm:text-xl">{value}</p>
      <p className={`text-sm ${gold ? 'text-amber-800' : 'text-gray-600'}`}>{label}</p>
    </div>
  );
}
