import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { fetchKadiwaSales, type KadiwaSalesReport } from '../../../app/services/authApi';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday } from '../../../utils/dateTime';
import { peso } from './InventoryForms';
import { formatPrice, formatQuantity, periodRange, plainAmount, shiftPeriod, type SalesPeriod } from './SalesForms';
import { FCA_NAME, KADIWA_STORE_ADDRESS } from './kadiwaReportPdf';

// The Kadiwa ng Pangulo sales report the cooperative submits to the DA: every
// good sold in 15 days (1 to 15, 16 to the end of the month) or a month, with
// its quantity, unit, price and total, from the confirmed sales. Exported as
// a PDF laid out like the DA's sheet.
export function KadiwaSalesReportPanel() {
  const [period, setPeriod] = useState<SalesPeriod>(() => ({ mode: 'half', date: dateOnlyToday() }));
  const [report, setReport] = useState<KadiwaSalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const range = periodRange(period);
  const isFuture = range.from > dateOnlyToday();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchKadiwaSales(range.from, range.to)
      .then((data) => { if (active) setReport(data.report); })
      .catch((error: Error) => { if (active) { setReport(null); toast.error(error.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range.from, range.to, refresh]);
  useLiveRefresh(['kadiwa_sales'], () => setRefresh((key) => key + 1));

  const exportPdf = async () => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const pdf = await import('./kadiwaReportPdf');
      await pdf.downloadKadiwaSalesReportPdf(report, range.title);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to make the PDF.');
    } finally {
      setExporting(false);
    }
  };

  const quantityTotal = report ? Math.round(report.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0) * 10000) / 10000 : 0;
  const modeButton = (mode: 'half' | 'month', label: string) => (
    <button type="button" onClick={() => setPeriod((current) => ({ ...current, mode }))} aria-pressed={period.mode === mode}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold ${period.mode === mode ? 'bg-white text-green-800 shadow-sm' : 'text-gray-600'}`}>{label}</button>
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] md:p-6" aria-labelledby="kadiwa-report-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="kadiwa-report-title" className="text-lg font-bold text-gray-900">Kadiwa ng Pangulo Sales Report</h2>
          <p className="text-sm text-gray-600">Every good sold in the period, from the confirmed sales, as the DA sheet lists them.</p>
        </div>
        <button type="button" onClick={() => void exportPdf()} disabled={!report || loading || exporting || !report.lines.length}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
          {exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export PDF
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-0.5" role="group" aria-label="Period">{modeButton('half', '15 days')}{modeButton('month', 'Month')}</div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPeriod((current) => shiftPeriod(current, -1))} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50" aria-label="Previous period"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[13rem] text-center text-sm font-bold tracking-wide text-gray-900">{range.title}</span>
          <button type="button" onClick={() => setPeriod((current) => shiftPeriod(current, 1))} disabled={isFuture || range.to >= dateOnlyToday()} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40" aria-label="Next period"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* The sheet as it is printed. */}
      <div className="mt-4 rounded-xl border border-gray-200 p-3 sm:p-5">
        <div className="text-center font-serif text-gray-900">
          <p className="text-lg font-bold">KADIWA NG PANGULO</p>
          <p>Address: <span className="underline">{KADIWA_STORE_ADDRESS}</span></p>
          <p>Date: {range.title}</p>
          <p className="mt-2 text-left">Name of FCA: <span className="underline">{FCA_NAME}</span></p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse font-serif text-sm text-gray-900">
            <thead>
              <tr>{['Goods Sold', 'Quantity', 'Unit', 'Price', 'Total Amount of Goods Sold'].map((heading) => <th key={heading} className="border border-gray-500 px-3 py-2 text-center font-bold">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="border border-gray-500 px-3 py-6 text-center font-sans text-gray-500"><LoaderCircle className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
              {!loading && !report?.lines.length && <tr><td colSpan={5} className="border border-gray-500 px-3 py-6 text-center font-sans text-gray-500">No confirmed sales in this period.</td></tr>}
              {!loading && report?.lines.map((line) => (
                <tr key={`${line.name}|${line.unit ?? ''}`}>
                  <td className="border border-gray-500 px-3 py-1.5 text-center">{line.name}</td>
                  <td className="border border-gray-500 px-3 py-1.5 text-center tabular-nums">{formatQuantity(line.quantity)}</td>
                  <td className="border border-gray-500 px-3 py-1.5 text-center">{line.unit ?? ''}</td>
                  <td className="border border-gray-500 px-3 py-1.5 text-center tabular-nums">{formatPrice(line)}</td>
                  <td className="border border-gray-500 px-3 py-1.5 text-center tabular-nums">{line.amount ? plainAmount(line.amount) : ''}</td>
                </tr>
              ))}
            </tbody>
            {!loading && report && report.lines.length > 0 && (
              <tfoot>
                <tr>
                  <td className="border border-gray-500 px-3 py-1.5" />
                  <td className="border border-gray-500 px-3 py-1.5 text-center tabular-nums">{formatQuantity(quantityTotal)}</td>
                  <td className="border border-gray-500 px-3 py-1.5" />
                  <td className="border border-gray-500 px-3 py-1.5 text-center font-bold">TOTAL</td>
                  <td className="border border-gray-500 px-3 py-1.5 text-center font-bold tabular-nums">{plainAmount(report.totals.gross)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {report && report.lines.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">{report.totals.sales} {report.totals.sales === 1 ? 'sale' : 'sales'} on {report.totals.days} {report.totals.days === 1 ? 'day' : 'days'} · expenses {peso(report.totals.expenses)} · net income {peso(report.totals.net)} (not on the DA sheet).</p>
      )}
    </section>
  );
}
