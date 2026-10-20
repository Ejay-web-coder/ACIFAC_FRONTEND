import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, TrendingUp, type LucideIcon } from 'lucide-react';
import { fetchKadiwaProducts, type KadiwaProductRow, type KadiwaProducts } from '../../../app/services/authApi';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const amountOf = (value: number, unit: string | null | undefined) => `${Number(value.toFixed(2)).toLocaleString('en-PH')}${unit ? ` ${unit.toLowerCase()}` : ''}`;

/**
 * Kadiwa products for the period: what sold most, and store items running out
 * at the current pace.
 */
export function KadiwaProductInsights({ from, to, refreshKey }: { from: string; to: string; refreshKey: number }) {
  const [data, setData] = useState<KadiwaProducts | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchKadiwaProducts(from, to)
      .then((result) => { if (active) { setData(result); setError(''); } })
      .catch((reason: Error) => { if (active) setError(reason.message || 'Unable to load the products.'); });
    return () => { active = false; };
  }, [from, to, refreshKey]);

  // The figures of the period picked (not the last one while the next loads).
  const shown = data && data.period.from === from ? data : null;

  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6">
    <h2 className="text-lg font-bold text-gray-900">Products</h2>
    {error && !shown ? <p className="mt-3 text-sm text-gray-500">{error}</p> : !shown ? <p className="mt-3 text-sm text-gray-500">Loading live data...</p> : <>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProductList title="Best sellers" icon={TrendingUp} tone="text-green-700" empty="No sales in this period." rows={shown.bestSellers}
          render={(row) => <>
            <div className="flex items-baseline justify-between gap-2"><span className="truncate font-medium text-gray-900">{row.name}</span><span className="shrink-0 font-semibold tabular-nums text-gray-900">{peso(row.amount)}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100" aria-hidden="true"><div className="h-1.5 rounded-full bg-[#52a447]" style={{ width: `${Math.max(row.share ?? 0, 2)}%` }} /></div>
            <p className="mt-1 text-xs text-gray-500">{row.quantity > 0 ? `${amountOf(row.quantity, row.unit)} · ` : ''}{row.share}% of sales</p>
          </>} />
        <ProductList title="Running out fast" icon={AlertTriangle} tone="text-amber-600" empty="Nothing is running out." rows={shown.runningOut}
          render={(row) => <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-gray-900">{row.name}</span>
              {row.stock === 0
                ? <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">Out of stock</span>
                : <span className="shrink-0 text-sm font-semibold tabular-nums text-amber-800">{row.daysLeft === null ? 'Low' : `~${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'}`}</span>}
            </div>
            <p className="mt-1 text-xs text-gray-500">{amountOf(row.stock ?? 0, row.unit)} left · sells {amountOf(row.perDay ?? 0, row.unit)} a day</p>
          </>} />
      </div>

    </>}
  </section>;
}

function ProductList({ title, icon: Icon, tone, rows, empty, render }: {
  title: string; icon: LucideIcon; tone: string; rows: KadiwaProductRow[]; empty: string; render: (row: KadiwaProductRow) => ReactNode;
}) {
  return <div className="rounded-xl border border-gray-200 p-3">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />{title}</h3>
    {rows.length ? <ol className="mt-2 divide-y divide-gray-100 text-sm">
      {rows.map((row) => <li key={`${row.kind}-${row.id ?? row.name}-${row.unit ?? ''}`} className="py-2">{render(row)}</li>)}
    </ol> : <p className="mt-2 text-sm text-gray-500">{empty}</p>}
  </div>;
}
