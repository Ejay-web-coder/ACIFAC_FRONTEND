import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { KadiwaInventoryItem } from '../../../app/services/authApi';
import { peso, productLabel } from './InventoryForms';

// The store items section of New Sale: every product of the inventory with how
// many were sold. Each is sold at its selling price and costs its cost price;
// the difference is the net income. The stock goes down when the sale is saved,
// and the items count under GROCERIES. A product without a cost price cannot be
// sold until it has one.
const QUANTITY = /^\d+(\.\d{1,2})?$/;
const FIELD = 'min-w-0 rounded-lg border border-gray-300 bg-white py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600';

export type StoreQuantities = Record<string, string>;

const cents = (value: number) => Math.round(value * 100) / 100;
const quantityText = (value: number) => String(Number(value.toFixed(2)));
const canSell = (item: KadiwaInventoryItem) => item.stock > 0 && item.costPrice !== null;

/** Why the quantity typed for a product cannot be sold, or ''. */
export function storeQuantityProblem(item: KadiwaInventoryItem, text: string) {
  const value = text.trim();
  if (!value) return '';
  if (item.costPrice === null) return 'Set the cost price first: Edit the product in Store Inventory.';
  if (!QUANTITY.test(value) || Number(value) <= 0) return 'Enter a quantity more than zero, with up to two decimals.';
  if (Number(value) > item.stock) return `Only ${item.stock} ${item.unit} in stock.`;
  return '';
}

/** The products with a quantity typed, and the revenue, cost and net income of those that can be sold (each line rounded, as the sale is saved). */
export function storeSelection(inventory: KadiwaInventoryItem[], quantities: StoreQuantities) {
  const byId = new Map(inventory.map((item) => [item.id, item]));
  const selected = Object.entries(quantities)
    .filter(([id, value]) => value.trim() && byId.has(id))
    .map(([id, value]) => ({ item: byId.get(id) as KadiwaInventoryItem, quantity: value.trim() }));
  const valid = selected.filter(({ item, quantity }) => !storeQuantityProblem(item, quantity));
  const revenue = cents(valid.reduce((sum, { item, quantity }) => sum + cents(item.price * Number(quantity)), 0));
  const cost = cents(valid.reduce((sum, { item, quantity }) => sum + cents((item.costPrice ?? 0) * Number(quantity)), 0));
  return { selected, revenue, cost, net: cents(revenue - cost) };
}

/** `query` is the New Sale quick search (lower case): only matching products are shown. */
export function StoreItemsPicker({ inventory, quantities, onChange, showProblems, query }: {
  inventory: KadiwaInventoryItem[]; quantities: StoreQuantities; onChange: Dispatch<SetStateAction<StoreQuantities>>; showProblems: boolean; query: string;
}) {
  const [selectedOnly, setSelectedOnly] = useState(false);
  // Products that can be sold first, in the inventory's order; sold-out ones and ones without a cost price last.
  const products = useMemo(() => [...inventory].sort((a, b) => Number(!canSell(a)) - Number(!canSell(b))), [inventory]);
  const { selected, revenue, cost, net } = storeSelection(inventory, quantities);
  const shown = products.filter((item) => (!selectedOnly || quantities[item.id]?.trim()) && (!query || `${productLabel(item)} ${item.id} ${item.category}`.toLowerCase().includes(query)));

  const setQuantity = (id: string, value: string) => onChange((current) => ({ ...current, [id]: value }));
  const step = (item: KadiwaInventoryItem, by: 1 | -1) => {
    const next = Math.min(item.stock, Math.max(0, cents((Number(quantities[item.id]) || 0) + by)));
    setQuantity(item.id, next > 0 ? quantityText(next) : '');
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Store items from the inventory <span className="font-normal text-gray-500">(optional)</span></h3>
          <p className="text-xs text-gray-500">Deducted from stock and counted under GROCERIES. Net income is the selling price less the cost price.</p>
        </div>
        {selected.length > 0 && (
          <p className="text-right text-sm text-gray-600">
            {selected.length} {selected.length === 1 ? 'product' : 'products'} · <span className="font-semibold tabular-nums text-gray-900">{peso(revenue)}</span>
            <span className="block text-xs">cost {peso(cost)} · <span className={net < 0 ? 'text-red-700' : 'text-green-700'}>net {peso(net)}</span></span>
          </p>
        )}
      </div>

      {inventory.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {query ? <p className="text-xs text-gray-600">{shown.length} of {inventory.length} products match the search.</p> : <span />}
          <label className={`inline-flex items-center gap-2 text-sm ${selected.length ? 'text-gray-700' : 'text-gray-400'}`}>
            <input type="checkbox" checked={selectedOnly} disabled={!selected.length} onChange={(event) => setSelectedOnly(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600" />
            Show selected only ({selected.length})
          </label>
        </div>
      )}

      {/* On wider screens the list scrolls on its own so the expenses stay close. */}
      <div className="mt-2 md:max-h-96 md:overflow-y-auto">
        {!inventory.length ? (
          <p className="p-4 text-center text-sm text-gray-500">No products in the inventory yet. Use Add Inventory first.</p>
        ) : !shown.length ? (
          <p className="p-4 text-center text-sm text-gray-500">{selectedOnly ? 'No selected product matches your search.' : 'No product matches your search.'}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shown.map((item, index) => {
              const value = quantities[item.id] ?? '';
              const blocked = !canSell(item);
              const problem = showProblems || Number(value) > item.stock ? storeQuantityProblem(item, value) : '';
              const sold = value.trim() && !storeQuantityProblem(item, value) ? Number(value) : 0;
              const lineTotal = sold ? cents(item.price * sold) : 0;
              const lineNet = sold && item.costPrice !== null ? cents(lineTotal - cents(item.costPrice * sold)) : 0;
              const label = productLabel(item);
              return (
                <li key={item.id} className={`px-2 py-2.5 ${value.trim() ? (problem ? 'bg-red-50/60' : 'bg-green-50/60') : ''} ${blocked ? 'opacity-60' : ''}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">
                        Selling {peso(item.price)} · {item.costPrice === null ? <span className="font-medium text-red-600">no cost price</span> : <>Cost {peso(item.costPrice)}</>} / {item.unit} ·{' '}
                        {item.stock <= 0 ? <span className="font-medium text-red-600">Out of stock</span>
                          : <span className={item.stock <= item.reorderLevel ? 'font-medium text-amber-700' : ''}>{item.stock} {item.unit} in stock</span>}
                      </p>
                      {item.costPrice === null && <p className="text-xs font-medium text-red-600">Set the cost price with Edit in Store Inventory to sell it.</p>}
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => step(item, -1)} disabled={blocked || !value.trim()} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40" aria-label={`One less ${label}`}><Minus className="h-4 w-4" /></button>
                        <input data-field="store" data-index={index} inputMode="decimal" value={value} disabled={blocked} onChange={(event) => setQuantity(item.id, event.target.value)} placeholder="0" aria-label={`Quantity of ${label} sold`} className={`${FIELD} w-20 px-2 text-center ${problem ? 'border-red-400' : ''}`} />
                        <button type="button" onClick={() => step(item, 1)} disabled={blocked || Number(value) >= item.stock} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40" aria-label={`One more ${label}`}><Plus className="h-4 w-4" /></button>
                        <span className="ml-1 w-12 text-xs text-gray-500">{item.unit}</span>
                      </div>
                      <div className="w-24 text-right">
                        <p className="text-sm font-semibold tabular-nums text-gray-900">{lineTotal ? peso(lineTotal) : '—'}</p>
                        {lineTotal > 0 && <p className={`text-xs tabular-nums ${lineNet < 0 ? 'text-red-700' : 'text-green-700'}`}>{lineNet < 0 ? '−' : '+'}{peso(Math.abs(lineNet))} net</p>}
                      </div>
                    </div>
                  </div>
                  {problem && <p className="pt-1 text-xs text-red-600">{problem}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
