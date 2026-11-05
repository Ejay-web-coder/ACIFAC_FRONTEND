import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchVendorKadiwaAnalytics } from '../../app/services/authApi';
import { KadiwaAnalyticsPanel } from '../../admin/components/kadiwa/KadiwaAnalyticsPanel';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { dateOnlyToday } from '../../utils/dateTime';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (value: number) => String(value).padStart(2, '0');

// The vendor's Analytics: their branch's daily sales, expenses and net income
// for a month, and its best sellers and items running out (confirmed sales only).
export function VendorAnalytics() {
  const today = dateOnlyToday();
  const [month, setMonth] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [refreshKey, setRefreshKey] = useState(0);
  const [branchName, setBranchName] = useState('');
  useLiveRefresh(['kadiwa_sales', 'kadiwa_inventory'], () => setRefreshKey((key) => key + 1), 2000);

  const from = `${month.year}-${pad(month.month + 1)}-01`;
  const lastDay = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const to = `${month.year}-${pad(month.month + 1)}-${pad(lastDay)}`;
  const isThisMonth = from.slice(0, 7) === today.slice(0, 7);
  const shift = (step: number) => setMonth((current) => {
    const date = new Date(Date.UTC(current.year, current.month + step, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
  });
  const load = useCallback((f: string, t: string) => fetchVendorKadiwaAnalytics(f, t).then((result) => { setBranchName(result.branch?.name ?? ''); return result; }), []);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">{branchName ? `${branchName}: ` : ''}confirmed sales, expenses and net income, and how the products are selling.</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[10rem] text-center text-sm font-bold text-gray-900">{MONTHS[month.month]} {month.year}</span>
          <button type="button" onClick={() => shift(1)} disabled={isThisMonth} className="rounded-lg p-2 text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-40" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <KadiwaAnalyticsPanel from={from} to={to} daily refreshKey={refreshKey} load={load} />
    </div>
  );
}
