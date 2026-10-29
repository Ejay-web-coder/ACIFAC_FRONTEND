import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Search, Plus, Receipt, ShoppingCart, Package, Pencil, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { fetchKadiwaData, restockKadiwaInventory, type KadiwaGood, type KadiwaInventoryItem, type KadiwaSale, type KadiwaSummary } from '../../app/services/authApi';
import { AddInventorySheet, DeleteInventoryItem, EditInventoryItem, lineValue, peso, productLabel, sizeLabel, unitProfit } from '../components/kadiwa/InventoryForms';
import { NewSaleSheet, SalesHistory, type SalesPeriod } from '../components/kadiwa/SalesForms';
import { VendorSalesReview } from '../components/kadiwa/VendorSalesReview';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { dateOnlyToday } from '../../utils/dateTime';
import { Pagination } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';

type InventoryItem = KadiwaInventoryItem;

interface KadiwaStoreProps {
  userRole: UserRole;
}

export function KadiwaStore({ userRole }: KadiwaStoreProps) {
  const [showForm, setShowForm] = useState(false);
  const [showStockForm, setShowStockForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [inventorySearch, setInventorySearch] = useState('');
  const [goods, setGoods] = useState<KadiwaGood[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState<'inventory' | 'sales'>('inventory');
  const [summary, setSummary] = useState<KadiwaSummary | null>(null);
  // Vendors' sales waiting for an administrator to confirm or reject them.
  const [pendingSales, setPendingSales] = useState<KadiwaSale[]>([]);
  const [restockQuantities, setRestockQuantities] = useState<Record<string, string>>({});
  const [restockingId, setRestockingId] = useState<string | null>(null);
  // Sales History opens on today; it reloads whenever the Kadiwa data does.
  const [historyPeriod, setHistoryPeriod] = useState<SalesPeriod>(() => ({ mode: 'day', date: dateOnlyToday() }));
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const loadData = useCallback(() => {
    fetchKadiwaData({ limit: 100 })
      .then((data) => {
        setGoods(data.goods);
        setInventory(data.inventory);
        setSummary(data.summary);
        setPendingSales(data.pendingSales);
        setHistoryRefresh((key) => key + 1);
        setError('');
      })
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useLiveRefresh(['kadiwa_inventory', 'kadiwa_sales'], loadData);

  const inventoryQuery = inventorySearch.trim().toLowerCase();
  const filteredInventory = inventoryQuery
    ? inventory.filter((item) => `${productLabel(item)} ${item.id} ${item.category} ${item.unit}`.toLowerCase().includes(inventoryQuery))
    : inventory;
  const filteredInventoryValue = filteredInventory.reduce((sum, item) => sum + lineValue(item), 0);
  const inventoryPages = usePagination(filteredInventory, { resetKey: inventoryQuery });

  // Totals are calculated by the server in the cooperative's time zone.
  const todaySales = summary?.todaySales ?? 0;
  const todayRevenue = summary?.todayRevenue ?? 0;
  const todayCost = summary?.todayCost ?? 0;
  const todayExpenses = summary?.todayExpenses ?? 0;
  const todayNetIncome = summary?.todayNetIncome ?? 0;
  const missingCost = inventory.filter((item) => item.costPrice === null).length;
  const totalInventoryUnits = Math.round(inventory.reduce((sum, item) => sum + item.stock * 100, 0)) / 100;
  const lowStockItems = summary?.lowStockItems ?? inventory.filter(item => item.stock <= item.reorderLevel).length;
  const inventoryValue = summary?.inventoryValue ?? 0;

  const canEdit = userRole === 'admin';

  // The today cards open today's sales, where each sale and product sold can be checked.
  const openTodaysSales = () => {
    setActiveSection('sales');
    setHistoryPeriod({ mode: 'day', date: dateOnlyToday() });
    window.requestAnimationFrame(() => document.getElementById('kadiwa-sales')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const handleRestock = async (itemId: string) => {
    const quantity = Number(restockQuantities[itemId]);
    if (!Number.isFinite(quantity) || quantity <= 0 || restockingId) return;
    setRestockingId(itemId);
    try {
      const response = await restockKadiwaInventory(itemId, quantity);
      setInventory(prev => prev.map(item => item.id === itemId ? response.item : item));
      setRestockQuantities(prev => ({ ...prev, [itemId]: '' }));
      toast.success(`${productLabel(response.item)} restocked`, { description: `New stock: ${response.item.stock} ${response.item.unit}` });
    } catch (restockError) {
      setError(restockError instanceof Error ? restockError.message : 'Unable to restock item.');
    } finally {
      setRestockingId(null);
    }
  };

  // Shared by the phone cards and the table rows.
  const stockBadge = (item: InventoryItem) => (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium tabular-nums ${
      item.stock <= item.reorderLevel ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
    }`}>
      {item.stock} {item.unit}
    </span>
  );
  const restockForm = (item: InventoryItem) => (
    <form
      onSubmit={(e) => { e.preventDefault(); void handleRestock(item.id); }}
      className="flex items-center gap-2"
    >
      <input
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        required
        placeholder="Qty"
        aria-label={`Quantity to add to ${productLabel(item)}`}
        value={restockQuantities[item.id] ?? ''}
        onChange={(e) => setRestockQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
        className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <button
        type="submit"
        disabled={restockingId === item.id}
        className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs font-medium disabled:opacity-60"
      >
        {restockingId === item.id ? 'Adding...' : 'Add'}
      </button>
    </form>
  );
  const editButton = (item: InventoryItem) => (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => setEditingItem(item)} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50" aria-label={`Edit ${productLabel(item)}`}>
        <Pencil className="h-3.5 w-3.5" />Edit
      </button>
      <button type="button" onClick={() => setDeletingItem(item)} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50" aria-label={`Delete ${productLabel(item)}`}>
        <Trash2 className="h-3.5 w-3.5" />Delete
      </button>
    </span>
  );
  const productName = (item: InventoryItem) => {
    const size = sizeLabel(item);
    return <p className="font-semibold text-gray-900">{item.name}{size && <span className="font-normal text-gray-600"> {size}</span>}</p>;
  };
  // The cost price with the net income on one unit; a red prompt when an older product has none yet.
  const costCell = (item: InventoryItem) => {
    const profit = unitProfit(item);
    if (profit === null) {
      return canEdit
        ? <button type="button" onClick={() => setEditingItem(item)} className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100" aria-label={`Set the cost price of ${productLabel(item)}`}>Set cost price</button>
        : <span className="text-xs font-semibold text-red-700">No cost price</span>;
    }
    return (
      <span className="tabular-nums">
        <span className="md:hidden">Cost </span>{peso(item.costPrice as number)}
        {' '}<span className={`text-xs ${profit < 0 ? 'text-red-700' : 'text-green-700'}`} title="Net income on one unit sold (selling price − cost price)">({profit < 0 ? '−' : '+'}{peso(Math.abs(profit))})</span>
      </span>
    );
  };
  const inventoryTotalLabel = `Total of ${filteredInventory.length} ${inventoryQuery ? 'matching ' : ''}${filteredInventory.length === 1 ? 'product' : 'products'}`;
  const noInventoryText = inventoryQuery ? 'No product matches your search.' : 'No products yet. Use Add Inventory to type them in.';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-600">Manage sales and store stock</p>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
        {canEdit && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => setShowStockForm(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-green-600 bg-white px-4 text-sm font-semibold text-green-700 hover:bg-green-50"
            >
              <Package className="h-4 w-4" />
              Add Inventory
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={!goods.length}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              New Sale
            </button>
          </div>
        )}
      </div>

      {canEdit && <VendorSalesReview sales={pendingSales} onReviewed={loadData} />}

      {/* Today: what was sold, what it cost and what is left. Each card opens today's sales to check them. */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {[
          { label: "Today's Sales", value: String(todaySales), detail: todaySales === 1 ? 'sale recorded' : 'sales recorded', icon: ShoppingCart, tone: 'plain' },
          { label: "Today's Total Cash", value: peso(todayRevenue), detail: 'cash received for goods sold', icon: Wallet, tone: 'dark' },
          { label: "Today's Cost", value: peso(todayCost + todayExpenses), detail: todayExpenses > 0 ? `cost ${peso(todayCost)} · expenses ${peso(todayExpenses)}` : 'cost price of products sold', icon: Receipt, tone: 'plain' },
          { label: "Today's Net Income", value: peso(todayNetIncome), detail: 'total cash − cost − expenses', icon: TrendingUp, tone: todayNetIncome < 0 ? 'loss' : 'good' },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={openTodaysSales}
            aria-label={`${card.label}: ${card.value}. View today's sales`}
            className={`rounded-2xl border p-3.5 text-left shadow-[var(--shadow-card)] transition-colors hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 sm:p-4 ${card.tone === 'good' ? 'border-green-200 bg-green-50' : card.tone === 'loss' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}
          >
            <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-3">
              <div className={`w-fit rounded-xl p-2.5 ${card.tone === 'dark' ? 'bg-green-700' : card.tone === 'loss' ? 'bg-red-100' : 'bg-green-50 ring-1 ring-green-100'}`}>
                <card.icon className={`h-5 w-5 ${card.tone === 'dark' ? 'text-white' : card.tone === 'loss' ? 'text-red-700' : 'text-green-700'}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className={`break-words text-xl font-bold tabular-nums sm:text-2xl ${card.tone === 'loss' ? 'text-red-800' : card.tone === 'good' ? 'text-green-800' : 'text-gray-900'}`}>{card.value}</p>
                <p className="text-xs text-gray-500">{card.detail}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 sm:w-fit" role="tablist" aria-label="Kadiwa views">
        <button
          type="button"
          onClick={() => setActiveSection('inventory')}
          aria-pressed={activeSection === 'inventory'}
          className={`inline-flex min-h-10 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none ${
            activeSection === 'inventory'
              ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Package className="h-4 w-4" />
          Store Inventory
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('sales')}
          aria-pressed={activeSection === 'sales'}
          className={`inline-flex min-h-10 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none ${
            activeSection === 'sales'
              ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Sales History
        </button>
      </div>

      {activeSection === 'inventory' && <div className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Store Inventory</h2>
            <p className="text-sm text-gray-600">Each product with its size, quantity, selling price and cost price, like the inventory notebook.</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} placeholder="Search product or size" aria-label="Search inventory by product or size" className="input-style pl-9" />
          </div>
        </div>

        {missingCost > 0 && (
          <p className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 sm:mx-6" role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{missingCost} {missingCost === 1 ? 'product has' : 'products have'} no cost price yet. Set it with Edit: {missingCost === 1 ? 'it' : 'they'} cannot be sold until then, because the net income needs the cost.</span>
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 p-4 sm:gap-4 sm:px-6">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 sm:p-4">
            <p className="text-xs text-blue-700 sm:text-sm">Total Stock</p>
            <p className="break-words text-lg font-bold tabular-nums text-blue-900 sm:text-2xl">{totalInventoryUnits}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 sm:p-4">
            <p className="text-xs text-amber-700 sm:text-sm">Low Stock</p>
            <p className="break-words text-lg font-bold tabular-nums text-amber-900 sm:text-2xl">{lowStockItems}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 sm:p-4">
            <p className="text-xs text-emerald-700 sm:text-sm">Inventory Value</p>
            <p className="break-words text-lg font-bold tabular-nums text-emerald-900 sm:text-2xl">{peso(inventoryValue)}</p>
            <p className="text-[11px] text-emerald-700 sm:text-xs">at cost price</p>
          </div>
        </div>

        {/* Phone: one card per product */}
        <ul className="divide-y divide-gray-100 border-t border-gray-100 md:hidden">
          {inventoryPages.pageItems.map(item => (
            <li key={item.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {productName(item)}
                  <p className="text-xs text-gray-500">{item.id} · {item.category}</p>
                </div>
                <p className="shrink-0 text-right font-bold tabular-nums text-gray-900">{peso(lineValue(item))}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700">
                {stockBadge(item)}
                <span className="tabular-nums">Selling {peso(item.price)}</span>
                {costCell(item)}
              </div>
              {canEdit && <div className="flex items-center justify-between gap-2">{restockForm(item)}{editButton(item)}</div>}
            </li>
          ))}
          {!filteredInventory.length && <li className="px-4 py-10 text-center text-sm text-gray-500">{noInventoryText}</li>}
          {filteredInventory.length > 0 && (
            <li className="flex items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-sm">
              <span className="font-medium text-gray-700">{inventoryTotalLabel}</span>
              <span className="font-bold tabular-nums text-gray-900">{peso(filteredInventoryValue)}</span>
            </li>
          )}
        </ul>

        {/* Tablet and up: the notebook's columns */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Quantity</th>
                <th className="px-4 py-3 text-right font-medium">Selling Price</th>
                <th className="px-4 py-3 text-right font-medium">Cost Price</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                {canEdit && <th className="px-4 py-3 font-medium">Restock</th>}
                {canEdit && <th className="px-4 py-3"><span className="sr-only">Edit or delete</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inventoryPages.pageItems.map(item => (
                <tr key={item.id} className="align-middle hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {productName(item)}
                    <p className="text-xs text-gray-500">{item.id} · low at {item.reorderLevel} {item.unit}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{item.category}</td>
                  <td className="px-4 py-3 text-right">{stockBadge(item)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{peso(item.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{costCell(item)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{peso(lineValue(item))}</td>
                  {canEdit && <td className="px-4 py-3">{restockForm(item)}</td>}
                  {canEdit && <td className="px-4 py-3 text-right">{editButton(item)}</td>}
                </tr>
              ))}
              {!filteredInventory.length && (
                <tr><td colSpan={canEdit ? 8 : 6} className="px-4 py-10 text-center text-gray-500">{noInventoryText}</td></tr>
              )}
            </tbody>
            {filteredInventory.length > 0 && <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-gray-700">{inventoryTotalLabel}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{peso(filteredInventoryValue)}</td>
                {canEdit && <td colSpan={2} />}
              </tr>
            </tfoot>}
          </table>
        </div>
        <Pagination page={inventoryPages.page} totalPages={inventoryPages.totalPages} total={inventoryPages.total} pageSize={inventoryPages.pageSize} onPageChange={inventoryPages.setPage} onPageSizeChange={inventoryPages.setPageSize} label="products" />
      </div>}

      {activeSection === 'sales' && <div id="kadiwa-sales" className="scroll-mt-4"><SalesHistory period={historyPeriod} onPeriodChange={setHistoryPeriod} refreshKey={historyRefresh} /></div>}

      {showForm && (
        <NewSaleSheet
          goods={goods}
          inventory={inventory}
          onClose={() => setShowForm(false)}
          onSaved={(sale) => { setShowForm(false); setActiveSection('sales'); setHistoryPeriod({ mode: 'day', date: sale.saleDate }); loadData(); }}
        />
      )}

      {showStockForm && (
        <AddInventorySheet
          onClose={() => setShowStockForm(false)}
          onSaved={() => { setShowStockForm(false); setActiveSection('inventory'); loadData(); }}
        />
      )}

      {deletingItem && (
        <DeleteInventoryItem
          item={deletingItem}
          onClose={() => setDeletingItem(null)}
          onDeleted={(id) => { setInventory(prev => prev.filter(entry => entry.id !== id)); setDeletingItem(null); loadData(); }}
        />
      )}

      {editingItem && (
        <EditInventoryItem
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={(item) => { setInventory(prev => prev.map(entry => entry.id === item.id ? item : entry)); setEditingItem(null); loadData(); }}
        />
      )}
    </div>
  );
}
