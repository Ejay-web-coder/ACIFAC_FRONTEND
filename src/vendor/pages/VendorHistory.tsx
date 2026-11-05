import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, History, XCircle } from 'lucide-react';
import { fetchVendorSales, type KadiwaSale } from '../../app/services/authApi';
import { EmptyState, ListSkeleton } from '../../app/components/common/UiKit';
import { SaleSheetModal, saleGross } from '../../admin/components/kadiwa/SalesForms';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { addDateOnlyDays, dateOnlyToday, formatDate, formatTime } from '../../utils/dateTime';

// The vendor's sales history: what they sent each day, and whether the office
// confirmed it, rejected it (with the reason) or has not checked it yet.

type Status = 'all' | KadiwaSale['status'];
const STATUS: Record<KadiwaSale['status'], { label: string; tone: string; icon: typeof Clock }> = {
  pending: { label: 'Waiting', tone: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Clock },
  completed: { label: 'Confirmed', tone: 'bg-green-50 text-green-800 ring-green-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'bg-red-50 text-red-700 ring-red-200', icon: XCircle },
};
type Range = 'day' | '7' | '30';
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function VendorHistory() {
  const today = dateOnlyToday();
  const [range, setRange] = useState<Range>('day');
  const [day, setDay] = useState(today);
  const [status, setStatus] = useState<Status>('all');
  const [sales, setSales] = useState<KadiwaSale[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<KadiwaSale | null>(null);
  const [refresh, setRefresh] = useState(0);
  useLiveRefresh(['kadiwa_sales'], () => setRefresh((key) => key + 1), 1000);

  const from = range === 'day' ? day : addDateOnlyDays(today, range === '7' ? -6 : -29);
  const to = range === 'day' ? day : today;

  useEffect(() => {
    let active = true;
    fetchVendorSales(from, to)
      .then((rows) => { if (active) { setSales(rows); setError(''); } })
      .catch((reason: Error) => { if (active) setError(reason.message || 'Unable to load your sales.'); });
    return () => { active = false; };
  }, [from, to, refresh]);

  const all = sales ?? [];
  const count = (value: KadiwaSale['status']) => all.filter((sale) => sale.status === value).length;
  const shown = status === 'all' ? all : all.filter((sale) => sale.status === status);
  const days = [...new Set(shown.map((sale) => sale.saleDate))];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <p className="text-sm text-gray-600">The sales you sent and what the office decided: confirmed, rejected (with the reason) or still waiting.</p>

      <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 sm:inline-grid" role="tablist" aria-label="Period">
            {([['day', 'One day'], ['7', 'Last 7 days'], ['30', 'Last 30 days']] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={range === value} onClick={() => setRange(value)}
                className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${range === value ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600'}`}>{label}</button>
            ))}
          </div>
          {range === 'day' && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setDay(addDateOnlyDays(day, -1))} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50" aria-label="Day before"><ChevronLeft className="h-4 w-4" /></button>
              <input type="date" value={day} max={today} onChange={(event) => event.target.value && setDay(event.target.value)} aria-label="Day" className="h-9 rounded-lg border border-gray-300 px-2 text-sm" />
              <button type="button" onClick={() => setDay(addDateOnlyDays(day, 1))} disabled={day >= today} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40" aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5" role="group" aria-label="Show">
          {(['all', 'pending', 'completed', 'rejected'] as Status[]).map((value) => {
            const on = status === value;
            const label = value === 'all' ? 'All' : STATUS[value].label;
            const n = value === 'all' ? all.length : count(value);
            return (
              <button key={value} type="button" onClick={() => setStatus(value)} aria-pressed={on}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${on ? 'border-green-700 bg-green-700 text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}>
                {label}<span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-label="Sales">
        {error ? <p className="p-6 text-sm text-red-700">{error}</p>
          : sales === null ? <ListSkeleton rows={4} />
            : !shown.length ? <EmptyState icon={History} title="No sales here" message={range === 'day' ? `You sent no ${status === 'all' ? '' : `${STATUS[status].label.toLowerCase()} `}sales for ${formatDate(day)}.` : 'Try another period or status.'} />
              : days.map((date) => {
                const ofDay = shown.filter((sale) => sale.saleDate === date);
                const total = ofDay.reduce((sum, sale) => sum + saleGross(sale), 0);
                return (
                  <div key={date}>
                    <p className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-900 sm:px-5">
                      <span>{date === today ? 'Today' : formatDate(date)}</span>
                      <span className="font-normal text-gray-500">{ofDay.length} {ofDay.length === 1 ? 'sale' : 'sales'} · {peso(total)}</span>
                    </p>
                    <ul className="divide-y divide-gray-100">
                      {ofDay.map((sale) => {
                        const style = STATUS[sale.status];
                        const Icon = style.icon;
                        return (
                          <li key={sale.id}>
                            <button type="button" onClick={() => setOpen(sale)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 sm:px-5">
                              <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${style.tone}`}><Icon className="h-5 w-5" /></span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">{sale.id}<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${style.tone}`}>{style.label}</span></span>
                                <span className="block text-xs text-gray-500">Sent {formatTime(sale.date)}{sale.reviewedAt ? ` · ${style.label.toLowerCase()} ${formatDate(sale.reviewedAt)} ${formatTime(sale.reviewedAt)}` : ''}</span>
                                {sale.status === 'rejected' && sale.reviewNotes && <span className="mt-1 block rounded-lg bg-red-50 px-2 py-1 text-sm text-red-800">Reason: {sale.reviewNotes}</span>}
                                {sale.status === 'completed' && sale.reviewNotes && <span className="mt-1 block text-sm text-gray-600">Note: {sale.reviewNotes}</span>}
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block font-bold tabular-nums text-gray-900">{peso(saleGross(sale))}</span>
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><Eye className="h-3.5 w-3.5" />View</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
      </section>
      {open && <SaleSheetModal sale={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
