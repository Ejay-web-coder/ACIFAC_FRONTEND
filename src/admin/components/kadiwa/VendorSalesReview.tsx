import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { reviewKadiwaSalesRequest, type KadiwaMemberPurchase, type KadiwaSale, type KadiwaSalesLine } from '../../../app/services/authApi';
import { formatDate, formatTime } from '../../../utils/dateTime';
import { peso } from './InventoryForms';
import { SaleSheetModal, saleGross } from './SalesForms';

const cents = (value: number) => Math.round(value * 100) / 100;

// One vendor's report for one day: every sale they sent for that date, at
// whatever time, reviewed together.
interface VendorReport { key: string; seller: string; saleDate: string; parts: KadiwaSale[]; total: KadiwaSale }

// The parts added up as one sale: the same good at the same price on one line,
// each member once, every store item and expense listed.
function combine(parts: KadiwaSale[]): KadiwaSale {
  if (parts.length === 1) return parts[0];
  const sum = (pick: (sale: KadiwaSale) => number) => cents(parts.reduce((total, sale) => total + pick(sale), 0));
  const lines = new Map<string, KadiwaSalesLine>();
  for (const line of parts.flatMap((sale) => sale.lines)) {
    const key = `${line.name}|${line.unit ?? ''}|${line.price ?? ''}|${line.priceMax ?? ''}`;
    const seen = lines.get(key);
    lines.set(key, seen
      ? { ...seen, amount: cents(seen.amount + line.amount), quantity: seen.quantity === null || line.quantity === null ? null : cents(seen.quantity + line.quantity) }
      : { ...line });
  }
  const members = new Map<number, KadiwaMemberPurchase>();
  for (const purchase of parts.flatMap((sale) => sale.memberPurchases)) {
    const seen = members.get(purchase.memberId);
    members.set(purchase.memberId, seen ? { ...seen, amount: cents(seen.amount + purchase.amount), points: cents(seen.points + purchase.points) } : { ...purchase });
  }
  return {
    ...parts[0],
    id: `${parts.length} sales`,
    groceries: sum((sale) => sale.groceries), vegetables: sum((sale) => sale.vegetables), meat: sum((sale) => sale.meat),
    totalExpenses: sum((sale) => sale.totalExpenses), costOfGoods: sum((sale) => sale.costOfGoods), netSales: sum((sale) => sale.netSales),
    items: parts.flatMap((sale) => sale.items), expenses: parts.flatMap((sale) => sale.expenses), goods: parts.flatMap((sale) => sale.goods),
    lines: [...lines.values()], memberPurchases: [...members.values()],
  };
}

function reportsOf(sales: KadiwaSale[]): VendorReport[] {
  const reports = new Map<string, KadiwaSale[]>();
  for (const sale of sales) {
    const key = `${sale.createdBy ?? sale.seller}|${sale.saleDate}`;
    reports.set(key, [...(reports.get(key) ?? []), sale]);
  }
  return [...reports.entries()].map(([key, parts]) => {
    const ordered = [...parts].sort((a, b) => a.date.localeCompare(b.date));
    return { key, seller: ordered[0].seller, saleDate: ordered[0].saleDate, parts: ordered, total: combine(ordered) };
  });
}

// Sales the Kadiwa store vendors sent, one report per vendor and day however
// many times they sent: an administrator checks the goods sold and the
// expenses against the vendor's name and confirms the report (then it counts
// in the totals and reports) or rejects it with the reason. The audit log
// records who did it for each sale in it.
export function VendorSalesReview({ sales, onReviewed }: { sales: KadiwaSale[]; onReviewed: () => void }) {
  const [open, setOpen] = useState<VendorReport | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!sales.length) return null;
  const reports = reportsOf(sales);

  const close = () => { setOpen(null); setRejecting(false); setReason(''); };
  const review = async (decision: 'confirm' | 'reject') => {
    if (!open || busy) return;
    if (decision === 'reject' && !reason.trim()) { toast.error('Enter the reason, so the vendor can correct the sale.'); return; }
    setBusy(true);
    try {
      await reviewKadiwaSalesRequest(open.parts.map((part) => part.id), decision, decision === 'reject' ? reason.trim() : '');
      const what = `${open.seller}'s sales of ${formatDate(open.saleDate)}`;
      toast.success(decision === 'confirm' ? `${what} confirmed` : `${what} rejected`, {
        description: decision === 'confirm' ? `Net income ${peso(open.total.netSales)} is now counted.` : 'The vendor was told the reason.',
      });
      close();
      onReviewed();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to review the sales.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-[var(--shadow-card)] md:p-5" aria-labelledby="vendor-review-title">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 ring-1 ring-amber-200"><ClipboardCheck className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h2 id="vendor-review-title" className="text-base font-bold text-gray-900">Vendor sales to review <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{reports.length}</span></h2>
          <p className="text-sm text-gray-600">One report per vendor and day, however many times they sent. Check the goods sold and expenses, then confirm or reject. Only confirmed sales are counted.</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {reports.map((report) => (
          <li key={report.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">{report.seller} <span className="font-normal text-gray-500">· {formatDate(report.saleDate)}</span></p>
              <p className="text-xs text-gray-500">
                {report.parts.length === 1
                  ? `${report.parts[0].id} · sent ${formatTime(report.parts[0].date)}`
                  : `Sent ${report.parts.length} times: ${report.parts.map((part) => formatTime(part.date)).join(', ')}`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <dl className="flex gap-4 text-right text-xs">
                <div><dt className="text-gray-500">Sold</dt><dd className="font-semibold tabular-nums text-gray-900">{peso(saleGross(report.total))}</dd></div>
                <div><dt className="text-gray-500">Expenses</dt><dd className="font-semibold tabular-nums text-gray-900">{peso(report.total.totalExpenses)}</dd></div>
                <div><dt className="text-gray-500">Net</dt><dd className={`font-semibold tabular-nums ${report.total.netSales < 0 ? 'text-red-700' : 'text-green-700'}`}>{peso(report.total.netSales)}</dd></div>
              </dl>
              <button type="button" onClick={() => setOpen(report)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700"><Eye className="h-4 w-4" />Review</button>
            </div>
          </li>
        ))}
      </ul>

      {open && (
        <SaleSheetModal
          sale={open.total}
          parts={open.parts}
          onClose={close}
          actions={rejecting ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Reason for rejecting {open.parts.length > 1 ? `all ${open.parts.length} sales` : 'the sale'}
                <textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={2} placeholder="e.g. TALONG should be ₱300, not ₱400" className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRejecting(false)} disabled={busy} className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Back</button>
                <button type="button" onClick={() => void review('reject')} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"><XCircle className="h-4 w-4" />{busy ? 'Rejecting…' : 'Reject'}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <p className="mr-auto text-xs text-gray-500">Your name is recorded in the audit log with your decision{open.parts.length > 1 ? `, for each of the ${open.parts.length} sales` : ''}.</p>
              <button type="button" onClick={() => setRejecting(true)} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50"><XCircle className="h-4 w-4" />Reject</button>
              <button type="button" onClick={() => void review('confirm')} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"><CheckCircle2 className="h-4 w-4" />{busy ? 'Confirming…' : open.parts.length > 1 ? `Confirm all ${open.parts.length}` : 'Confirm sale'}</button>
            </div>
          )}
        />
      )}
    </section>
  );
}
