import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Coins, Hourglass, Package, Pencil, Plus, Search, Trash2, Wheat } from 'lucide-react';
import { toast } from 'sonner';
import { Pagination, SectionCard, StatCard } from '../../../app/components/common/UiKit';
import { usePagination } from '../../../app/components/common/usePagination';
import { createBagSale, deleteBagSale, fetchBagSales, updateBagSale, type BagSale } from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { confirmAction } from '../../../app/components/common/ConfirmDialog';
import { Modal, bags, inputClass, labelClass, peso, primaryButton, secondaryButton, yearOptions } from './shared';

const selectClass = 'h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm';

type Data = Awaited<ReturnType<typeof fetchBagSales>>;

// Bags (2 decimals) x price (centavos), rounded to centavos as the server does.
function saleAmount(bagsText: string, priceText: string) {
  const bagCount = Number(bagsText);
  const price = Number(priceText);
  if (!bagsText.trim() || !priceText.trim() || !Number.isFinite(bagCount) || !Number.isFinite(price)) return null;
  return Math.round(Math.round(bagCount * 100) * Math.round(price * 100) / 100) / 100;
}

function BagSaleModal({ sale, available, lastSale, onClose, onSaved }: {
  sale: BagSale | null;
  /** Bags that can go in this sale: on hand, plus this sale's own bags when editing it. */
  available: number;
  lastSale: Data['lastSale'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    saleDate: sale?.saleDate ?? dateOnlyToday(),
    bags: sale ? String(sale.bags) : '',
    // The price changes from sale to sale; a new sale starts from the last one.
    pricePerBag: sale ? sale.pricePerBag.toFixed(2) : lastSale ? lastSale.pricePerBag.toFixed(2) : '',
    buyer: sale?.buyer ?? '',
    notes: sale?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const amount = saleAmount(form.bags, form.pricePerBag);
  const tooMany = Number(form.bags) > available;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(Number(form.bags) > 0)) { toast.error('Enter the number of bags sold.'); return; }
    if (tooMany) { toast.error(`Only ${bags(available)} on hand.`); return; }
    if (!(Number(form.pricePerBag) > 0)) { toast.error('Enter the price of one bag.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, bags: form.bags.trim(), pricePerBag: form.pricePerBag.trim(), buyer: form.buyer.trim(), notes: form.notes.trim() };
      const saved = sale ? await updateBagSale(sale.id, payload) : await createBagSale(payload);
      toast.success(sale ? 'Sale updated' : 'Sale recorded', { description: `${bags(saved.bags)} × ${peso(saved.pricePerBag)} = ${peso(saved.amount)}` });
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the sale.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={sale ? 'Edit Bag Sale' : 'Record Bag Sale'} description="Bags of palay from harvest fees sold by the cooperative, at the price of the day." onClose={onClose}
      footer={<><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button type="submit" form="bag-sale-form" disabled={saving || available <= 0} className={primaryButton}>{saving ? 'Saving…' : 'Save sale'}</button></>}>
      <form id="bag-sale-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <p className={`sm:col-span-2 rounded-xl p-3 text-sm ${available > 0 ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>
          {available > 0 ? <><strong>{bags(available)}</strong> on hand{sale ? ', counting this sale' : ''}.</> : 'No bags on hand. Bags come in when a harvest fee is paid under Services.'}
        </p>
        <label className={labelClass}>Bags sold
          <input required inputMode="decimal" value={form.bags} onChange={(event) => set('bags', event.target.value)} className={inputClass} placeholder="e.g. 10" aria-invalid={tooMany} />
          {tooMany && <span className="mt-1 block text-xs text-red-700">More than the {bags(available)} on hand.</span>}
        </label>
        <label className={labelClass}>Price per bag (₱)
          <input required inputMode="decimal" value={form.pricePerBag} onChange={(event) => set('pricePerBag', event.target.value)} className={inputClass} placeholder="0.00" />
          {lastSale && !sale && <span className="mt-1 block text-xs text-gray-500">Last sale: {peso(lastSale.pricePerBag)} a bag on {formatDate(lastSale.saleDate)}. Change it to today's price.</span>}
        </label>
        <div className="sm:col-span-2 flex items-baseline justify-between gap-3 rounded-xl border border-green-200 bg-green-50/60 px-4 py-3" aria-live="polite">
          <span className="text-sm font-medium text-gray-700">Amount</span>
          <span className="text-right">
            <span className="block text-xl font-bold tabular-nums text-green-800">{amount === null ? '₱0.00' : peso(amount)}</span>
            {amount !== null && <span className="block text-xs text-gray-500">{bags(Number(form.bags))} × {peso(Number(form.pricePerBag))}</span>}
          </span>
        </div>
        <label className={labelClass}>Sale date
          <input required type="date" max={dateOnlyToday()} value={form.saleDate} onChange={(event) => set('saleDate', event.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>Buyer <span className="font-normal text-gray-500">(optional)</span>
          <input value={form.buyer} onChange={(event) => set('buyer', event.target.value)} maxLength={200} className={inputClass} placeholder="e.g. rice mill or trader" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>Notes <span className="font-normal text-gray-500">(optional)</span>
          <input value={form.notes} onChange={(event) => set('notes', event.target.value)} maxLength={1000} className={inputClass} placeholder="e.g. OR number, fresh or dry palay" />
        </label>
      </form>
    </Modal>
  );
}

export function BagSalesPanel() {
  const currentYear = Number(dateOnlyToday().slice(0, 4));
  const [filters, setFilters] = useState({ year: String(currentYear), search: '' });
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<BagSale | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      setData(await fetchBagSales({ year: filters.year, search: filters.search.trim() }));
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to load bag sales.'));
    }
  }, [filters]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, filters.search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);
  // Bags come in with harvest fee payments and go out with sales.
  useLiveRefresh(['machinery_bag_sales', 'machinery_services', 'machinery_service_payments'], () => { void load(); });

  const sales = data?.sales ?? [];
  const pages = usePagination(sales, { pageSize: 25 });
  const setFilter = (field: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [field]: value }));

  const remove = async (sale: BagSale) => {
    if (!(await confirmAction(`Delete the sale of ${bags(sale.bags)} (${peso(sale.amount)}) of ${formatDate(sale.saleDate)}? The bags go back on hand.`, { confirmLabel: 'Delete', danger: true }))) return;
    try {
      await deleteBagSale(sale.id);
      toast.success('Sale deleted');
      void load();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to delete the sale.'));
    }
  };

  const stock = data?.stock;
  const actionsOf = (sale: BagSale) => (
    <>
      <button type="button" onClick={() => setEditing(sale)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800" aria-label={`Edit sale of ${formatDate(sale.saleDate)}`}><Pencil className="h-4 w-4" /></button>
      <button type="button" onClick={() => void remove(sale)} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete sale of ${formatDate(sale.saleDate)}`}><Trash2 className="h-4 w-4" /></button>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard label="Bags on hand" value={stock ? bags(stock.onHand) : '—'} icon={Package} tone="dark" loading={!data} detail="Received less sold" />
        <StatCard label="Received from harvest fees" value={stock ? bags(stock.received) : '—'} icon={Wheat} loading={!data} detail="Harvest fees paid, in bags" />
        <StatCard label="Sold" value={stock ? bags(stock.sold) : '—'} icon={Coins} tone="soft" loading={!data} detail="All sales" />
        <StatCard label="Still to collect" value={stock ? bags(stock.toCollect) : '—'} icon={Hourglass} tone="warning" loading={!data} detail="Unpaid harvest fees" />
      </div>
      {stock && stock.onHand < 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          More bags are sold than received. A harvest fee payment was probably voided after its bags were sold; check the payments under Services or the sales below.
        </p>
      )}

      <SectionCard
        title="Bag sales"
        description="Palay the cooperative received as harvest fees and sold. Each sale keeps the price per bag of its day."
        actions={<button type="button" onClick={() => setEditing(null)} className={primaryButton}><Plus className="h-4 w-4" />Record Sale</button>}
        bodyClassName="p-0"
      >
        <div className="grid grid-cols-2 gap-3 border-b border-gray-100 p-4 md:grid-cols-4">
          <select aria-label="Year" value={filters.year} onChange={(event) => setFilter('year', event.target.value)} className={selectClass}>
            <option value="">All years</option>
            {yearOptions(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <label className="relative md:col-span-3"><span className="sr-only">Search buyer</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Search buyer" className={`${selectClass} pl-9`} />
          </label>
        </div>

        {data && (
          <dl className="grid grid-cols-2 gap-px bg-gray-100 text-center sm:grid-cols-4">
            {[
              ['Sales', String(data.totals.count)],
              ['Bags sold', bags(data.totals.bags)],
              ['Amount', peso(data.totals.amount)],
              ['Average per bag', data.totals.averagePrice === null ? '—' : peso(data.totals.averagePrice)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-3 py-3"><dt className="text-xs text-gray-500">{label}</dt><dd className={`font-bold tabular-nums ${label === 'Amount' ? 'text-green-800' : 'text-gray-900'}`}>{value}</dd></div>
            ))}
          </dl>
        )}

        {/* Phones: one card per sale instead of a wide table. */}
        <ul className="divide-y divide-gray-100 md:hidden">
          {pages.pageItems.map((sale) => (
            <li key={sale.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{formatDate(sale.saleDate, true)}</p>
                  <p className="truncate text-sm text-gray-600">{sale.buyer || 'Buyer not given'}</p>
                </div>
                <p className="shrink-0 text-right font-semibold tabular-nums text-gray-900">{peso(sale.amount)}</p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm tabular-nums text-gray-700">{bags(sale.bags)} × {peso(sale.pricePerBag)}</p>
                <div className="flex items-center gap-1">{actionsOf(sale)}</div>
              </div>
              {sale.notes && <p className="text-xs text-gray-500">{sale.notes}</p>}
            </li>
          ))}
          {data && sales.length === 0 && <li className="px-4 py-10 text-center text-sm text-gray-500">No bag sales match these filters.</li>}
          {!data && <li className="px-4 py-10 text-center text-sm text-gray-500">Loading bag sales…</li>}
        </ul>

        <div className="relative hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3 text-right">Bags</th>
                <th className="px-4 py-3 text-right">Price per bag</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pages.pageItems.map((sale) => (
                <tr key={sale.id} className="align-top hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(sale.saleDate, true)}</td>
                  <td className="px-4 py-3 text-gray-700">{sale.buyer || <span className="text-gray-400">Not given</span>}{sale.notes && <span className="block text-xs text-gray-500">{sale.notes}</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{bags(sale.bags)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{peso(sale.pricePerBag)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{peso(sale.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right"><div className="inline-flex gap-1">{actionsOf(sale)}</div></td>
                </tr>
              ))}
              {data && sales.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No bag sales match these filters.</td></tr>}
              {!data && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Loading bag sales…</td></tr>}
            </tbody>
          </table>
        </div>
        {sales.length > 0 && <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="sales" />}
      </SectionCard>

      {editing !== undefined && data && (
        <BagSaleModal sale={editing} available={Math.round((data.stock.onHand + (editing?.bags ?? 0)) * 100) / 100} lastSale={data.lastSale}
          onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void load(); }} />
      )}
    </div>
  );
}
