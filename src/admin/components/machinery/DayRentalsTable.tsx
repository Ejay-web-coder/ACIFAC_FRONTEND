import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pagination, SectionCard, StatusBadge } from '../../../app/components/common/UiKit';
import { fetchDayRentals } from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { formatDate } from '../../../utils/dateTime';
import { peso } from './shared';

/**
 * The machines rented by the day (thresher, water pump, rotavators...), under
 * the per-service jobs: each booking from Rentals with its days and fee. It
 * follows the Services filters for machine, year and name; cropping and
 * payment do not apply to day rentals.
 */
export function DayRentalsTable({ machineryId, year, search }: { machineryId: string; year: string; search: string }) {
  // Back to the first page whenever a filter changes (no extra load from an effect).
  const filterKey = `${machineryId}|${year}|${search}`;
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const setPage = (next: number) => setPaging({ key: filterKey, page: next });
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDayRentals>> | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchDayRentals({ machineryId, year, search: search.trim(), page, limit: pageSize }));
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to load the day rentals.'));
    }
  }, [machineryId, year, search, page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);
  useLiveRefresh(['machinery_operations', 'machinery'], () => { void load(); });

  const rentals = data?.rentals ?? [];

  return (
    <SectionCard
      title="Day rentals"
      description="Machines rented by the day, booked under Rentals. Cropping and payment filters apply to services only."
      bodyClassName="p-0"
    >
      {data && (
        <dl className="grid grid-cols-3 gap-px bg-gray-100 text-center">
          {[['Rentals', data.totals.count.toLocaleString('en-PH')], ['Days rented', data.totals.days.toLocaleString('en-PH')], ['Rental fees', peso(data.totals.rentalFees)]].map(([label, value]) => (
            <div key={label} className="bg-white px-3 py-3"><dt className="text-xs text-gray-500">{label}</dt><dd className="font-bold tabular-nums text-gray-900">{value}</dd></div>
          ))}
        </dl>
      )}

      <div className="relative overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Renter</th>
              <th className="px-4 py-3">Machine</th>
              <th className="px-4 py-3 text-right">Days</th>
              <th className="px-4 py-3 text-right">Per day</th>
              <th className="px-4 py-3 text-right">Rental fee</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rentals.map((rental) => (
              <tr key={rental.id} className="align-top hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(rental.startDate, true)}<span className="block text-xs text-gray-500">to {formatDate(rental.endDate, true)}</span></td>
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{rental.memberName}</span>
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${rental.clientCategory === 'member' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{rental.clientCategory === 'member' ? 'M' : 'NM'}</span>
                  {rental.memberNumber && <span className="block text-xs text-gray-500">{rental.memberNumber}</span>}
                </td>
                <td className="px-4 py-3 text-gray-700">{rental.machineryName}{rental.purpose && <span className="block text-xs text-gray-500">{rental.purpose}</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{rental.duration}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{peso(rental.dailyFee)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{peso(rental.rentalFee)}</td>
                <td className="px-4 py-3"><StatusBadge status={rental.status} /></td>
              </tr>
            ))}
            {data && rentals.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No day rentals match these filters.</td></tr>}
            {!data && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Loading day rentals…</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="rentals" />}
    </SectionCard>
  );
}
