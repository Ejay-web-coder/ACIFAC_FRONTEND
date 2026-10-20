import { useCallback, useEffect, useState } from 'react';
import { Receipt, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Pagination, SectionCard, StatusBadge } from '../../../app/components/common/UiKit';
import type { Machinery } from '../../../app/services/authApi';
import { fetchDayRentals, type DayRental } from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { RentalPaymentModal } from './PaymentModal';
import { PaymentBadge, peso, yearOptions } from './shared';

const selectClass = 'h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm';

/**
 * The Day Rentals tab: the machines rented by the day (thresher, water pump,
 * rotavators...), each booking from Fleet & Rentals with its fee, what has been
 * paid and the balance, and the payments received for it. All years show by
 * default so no unpaid rental is hidden.
 */
export function DayRentalsPanel({ machinery }: { machinery: Machinery[] }) {
  const currentYear = Number(dateOnlyToday().slice(0, 4));
  const [filters, setFilters] = useState({ machineryId: '', year: '', paymentStatus: '', search: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDayRentals>> | null>(null);
  const [paying, setPaying] = useState<DayRental | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchDayRentals({ ...filters, search: filters.search.trim(), page, limit: pageSize }));
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to load the day rentals.'));
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, filters.search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);
  useLiveRefresh(['machinery_operations', 'machinery', 'machinery_rental_payments', 'machinery_services', 'machinery_service_payments'], () => { void load(); });

  const setFilter = (field: keyof typeof filters, value: string) => { setFilters((current) => ({ ...current, [field]: value })); setPage(1); };
  const rentals = data?.rentals ?? [];

  return (
    <>
      <SectionCard title="Day rentals" description="Machines rented by the day. Receive each renter's payment here until the balance is zero." bodyClassName="p-0">
        <div className="grid grid-cols-2 gap-3 border-b border-gray-100 p-4 md:grid-cols-4">
          <label className="col-span-2 md:col-span-1"><span className="sr-only">Machine</span>
            <select value={filters.machineryId} onChange={(event) => setFilter('machineryId', event.target.value)} className={selectClass}>
              <option value="">All machines</option>
              {machinery.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
            </select>
          </label>
          <label><span className="sr-only">Year</span>
            <select value={filters.year} onChange={(event) => setFilter('year', event.target.value)} className={selectClass}>
              <option value="">All years</option>
              {yearOptions(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label><span className="sr-only">Payment status</span>
            <select value={filters.paymentStatus} onChange={(event) => setFilter('paymentStatus', event.target.value)} className={selectClass}>
              <option value="">Any payment</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label className="relative col-span-2 md:col-span-1"><span className="sr-only">Search renter</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Search renter" className={`${selectClass} pl-9`} />
          </label>
        </div>

        {data && (
          <dl className="grid grid-cols-2 gap-px bg-gray-100 text-center sm:grid-cols-4">
            {[
              ['Rentals', `${data.totals.count.toLocaleString('en-PH')} · ${data.totals.days.toLocaleString('en-PH')} days`],
              ['Rental fees', peso(data.totals.rentalFees)],
              ['Collected', peso(data.totals.amountPaid)],
              ['Balance', peso(data.totals.balance)],
            ].map(([label, value]) => (
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
                <th className="px-4 py-3 text-right">Rental fee</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Rental</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
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
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                    {peso(rental.rentalFee)}
                    <span className="block text-xs font-normal text-gray-500">{rental.duration} day{rental.duration === 1 ? '' : 's'} × {peso(rental.dailyFee)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">
                    {peso(rental.amountPaid)}
                    {rental.lastPaymentDate && <span className="block text-xs text-gray-500">last {formatDate(rental.lastPaymentDate, true)}</span>}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${rental.balance > 0 ? 'font-semibold text-amber-800' : 'text-gray-700'}`}>{peso(rental.balance)}</td>
                  <td className="px-4 py-3"><PaymentBadge status={rental.paymentStatus} /></td>
                  <td className="px-4 py-3"><StatusBadge status={rental.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {/* A rental also recorded as a service is paid there, so it is paid once. */}
                    {rental.serviceId
                      ? <span className="text-xs text-gray-500">Paid under Services</span>
                      : <button type="button" onClick={() => setPaying(rental)} className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100"><Receipt className="h-3.5 w-3.5" />{rental.balance > 0 ? 'Receive Payment' : 'Payments'}</button>}
                  </td>
                </tr>
              ))}
              {data && rentals.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No day rentals match these filters.</td></tr>}
              {!data && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">Loading day rentals…</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="rentals" />}
      </SectionCard>

      {paying && <RentalPaymentModal rental={paying} onClose={() => setPaying(null)} onChanged={() => { void load(); }} />}
    </>
  );
}
