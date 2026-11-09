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

/**
 * `query` is the New Sale quick search (lower case): only matching products are shown.
 */
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <p className="text-xs text-gray-500">Taken out of stock and added to Groceries. Net income counts only the markup.</p>
        <div className="flex items-center gap-3">
          {selected.length > 0 && (
            <p className="text-xs text-gray-600">
              {selected.length} {selected.length === 1 ? 'product' : 'products'} · <span className="font-semibold tabular-nums text-gray-900">{peso(revenue)}</span> · <span className={net < 0 ? 'text-red-700' : 'text-green-700'}>net {peso(net)}</span>
            </p>
          )}
          {inventory.length > 0 && (
            <label className={`inline-flex items-center gap-1.5 text-xs ${selected.length ? 'text-gray-700' : 'text-gray-400'}`}>
              <input type="checkbox" checked={selectedOnly} disabled={!selected.length} onChange={(event) => setSelectedOnly(event.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-600" />
              Selected only
            </label>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {query && inventory.length > 0 && <p className="mb-2 px-1 text-xs text-gray-600">{shown.length} of {inventory.length} products match the search.</p>}
        {!inventory.length ? (
          <p className="p-4 text-center text-sm text-gray-500">No products in this branch's inventory yet. Use Add Inventory first.</p>
        ) : !shown.length ? (
          <p className="p-4 text-center text-sm text-gray-500">{selectedOnly ? 'No selected product matches your search.' : 'No product matches your search.'}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((item, index) => {
              const value = quantities[item.id] ?? '';
              const blocked = !canSell(item);
              const problem = showProblems || Number(value) > item.stock ? storeQuantityProblem(item, value) : '';
              const sold = value.trim() && !storeQuantityProblem(item, value) ? Number(value) : 0;
              const lineTotal = sold ? cents(item.price * sold) : 0;
              const label = productLabel(item);
              return (
                <li key={item.id} className={`rounded-lg border p-2.5 ${problem ? 'border-red-300 bg-red-50/60' : value.trim() ? 'border-green-300 bg-green-50/60' : 'border-gray-200'} ${blocked ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900" title={label}>{label}</p>
                      <p className="text-xs text-gray-500">
                        Sells at {peso(item.price)}, {item.costPrice === null ? <span className="font-medium text-red-600">no cost price</span> : <>costs {peso(item.costPrice)}</>} a {item.unit}
                      </p>
                      <p className={`text-xs font-semibold ${item.stock <= 0 ? 'text-red-600' : item.stock <= item.reorderLevel ? 'text-amber-700' : 'text-green-700'}`}>
                        {item.stock <= 0 ? 'Out of stock' : `${item.stock} ${item.unit} left`}{lineTotal > 0 && <span className="font-normal text-gray-600"> · {peso(lineTotal)}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => step(item, -1)} disabled={blocked || !value.trim()} className="rounded-md p-1.5 text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40" aria-label={`One less ${label}`}><Minus className="h-3.5 w-3.5" /></button>
                      <input data-field="store" data-index={index} inputMode="decimal" value={value} disabled={blocked} onChange={(event) => setQuantity(item.id, event.target.value)} placeholder="0" aria-label={`Quantity of ${label} sold`} className={`${FIELD} w-12 px-1 text-center ${problem ? 'border-red-400' : ''}`} />
                      <button type="button" onClick={() => step(item, 1)} disabled={blocked || Number(value) >= item.stock} className="rounded-md bg-green-700 p-1.5 text-white hover:bg-green-800 disabled:opacity-40" aria-label={`One more ${label}`}><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  {item.costPrice === null && <p className="pt-1 text-xs font-medium text-red-600">Set the cost price with Edit in Store Inventory to sell it.</p>}
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
