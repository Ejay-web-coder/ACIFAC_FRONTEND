import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Pagination, SectionCard } from '../../../app/components/common/UiKit';
import type { Machinery, RentalRequest } from '../../../app/services/authApi';
import { CROPPING_PERIODS, deleteService, fetchServices, rateLabel, type MachineryService } from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { PaymentModal } from './PaymentModal';
import { RecordServiceModal } from './RecordServiceModal';
import { PaymentBadge, bags, hectares, peso, primaryButton, yearOptions } from './shared';

const selectClass = 'h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm';

export function ServicesPanel({ machinery, rentalRequests }: { machinery: Machinery[]; rentalRequests: RentalRequest[] }) {
  const currentYear = Number(dateOnlyToday().slice(0, 4));
  const [filters, setFilters] = useState({ machineryId: '', croppingPeriod: '', year: String(currentYear), paymentStatus: '', search: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchServices>> | null>(null);
  const [editing, setEditing] = useState<MachineryService | null | undefined>(undefined);
  const [paying, setPaying] = useState<MachineryService | null>(null);
  const perService = machinery.filter((machine) => machine.pricingMode === 'per_service');

  const load = useCallback(async () => {
    try {
      setData(await fetchServices({ ...filters, search: filters.search.trim(), page, limit: pageSize }));
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to load services.'));
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, filters.search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);
  useLiveRefresh(['machinery_services', 'machinery_service_payments'], () => { void load(); });

  const setFilter = (field: keyof typeof filters, value: string) => { setFilters((current) => ({ ...current, [field]: value })); setPage(1); };

  const remove = async (service: MachineryService) => {
    if (!window.confirm(`Delete the ${service.serviceType} service for ${service.clientName} on ${formatDate(service.serviceDate)}?`)) return;
    try {
      await deleteService(service.id);
      toast.success('Service deleted');
      void load();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to delete the service.'));
    }
  };

  const services = data?.services ?? [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Services to farmers"
        description="Jobs paid per hectare or per 100 bags, for the PhilMech utilization report."
        actions={<button type="button" onClick={() => setEditing(null)} className={primaryButton}><Plus className="h-4 w-4" />Record Service</button>}
        bodyClassName="p-0"
      >
        <div className="grid grid-cols-2 gap-3 border-b border-gray-100 p-4 md:grid-cols-5">
          <label className="col-span-2 md:col-span-1"><span className="sr-only">Machine</span>
            <select value={filters.machineryId} onChange={(event) => setFilter('machineryId', event.target.value)} className={selectClass}>
              <option value="">All machines</option>
              {perService.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
            </select>
          </label>
          <label><span className="sr-only">Cropping period</span>
            <select value={filters.croppingPeriod} onChange={(event) => setFilter('croppingPeriod', event.target.value)} className={selectClass}>
              <option value="">All croppings</option>
              {CROPPING_PERIODS.map((period) => <option key={period} value={period}>{period} cropping</option>)}
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
          <label className="relative"><span className="sr-only">Search farmer</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Search farmer" className={`${selectClass} pl-9`} />
          </label>
        </div>

        {data && (
          <dl className="grid grid-cols-2 gap-px bg-gray-100 text-center sm:grid-cols-4">
            {[['Area serviced', hectares(data.totals.areaHa)], ['Total fees', peso(data.totals.feeAmount)], ['Collected', peso(data.totals.amountPaid)], ['Receivable', peso(data.totals.balance)]].map(([label, value]) => (
              <div key={label} className="bg-white px-3 py-3"><dt className="text-xs text-gray-500">{label}</dt><dd className="font-bold tabular-nums text-gray-900">{value}</dd></div>
            ))}
          </dl>
        )}

        <div className="relative overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Farmer</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3 text-right">Work</th>
                <th className="px-4 py-3 text-right">Fee</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {services.map((service) => (
                <tr key={service.id} className="align-top hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDate(service.serviceDate, true)}<span className="block text-xs text-gray-500">{service.croppingPeriod} cropping {service.year}</span></td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{service.clientName}</span>
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${service.clientCategory === 'member' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{service.clientCategory === 'member' ? 'M' : 'NM'}</span>
                    {service.clientAddress && <span className="block text-xs text-gray-500">{service.clientAddress}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{service.serviceType}<span className="block text-xs text-gray-500">{service.machineryName} · {rateLabel(service.unit, service.rateUsed)}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">
                    {service.unit === 'per_100_bags' ? <>{bags(service.totalBags)}<span className="block text-xs text-gray-500">fee {bags(service.feeBags)}</span></> : service.unit === 'per_day' ? `${service.days} day(s)` : hectares(service.areaHa)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                    {peso(service.feeAmount)}
                    {service.computedFeeAmount !== null && <span className="block text-xs font-normal text-amber-700" title={service.feeOverrideReason ?? ''}>rate: {peso(service.computedFeeAmount)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{peso(service.amountPaid)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700">{peso(service.balance)}</td>
                  <td className="px-4 py-3"><PaymentBadge status={service.paymentStatus} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button type="button" onClick={() => setPaying(service)} className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100"><Receipt className="h-3.5 w-3.5" />{service.balance > 0 ? 'Receive Payment' : 'Payments'}</button>
                      <button type="button" onClick={() => setEditing(service)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800" aria-label={`Edit service for ${service.clientName}`}><Pencil className="h-4 w-4" /></button>
                      {service.amountPaid === 0 && <button type="button" onClick={() => void remove(service)} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete service for ${service.clientName}`}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {data && services.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No services match these filters.</td></tr>}
              {!data && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">Loading services…</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} label="services" />}
      </SectionCard>

      {editing !== undefined && (
        <RecordServiceModal machinery={machinery} rentalRequests={rentalRequests} service={editing} defaultMachineryId={filters.machineryId || undefined}
          onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void load(); }} />
      )}
      {paying && <PaymentModal service={paying} onClose={() => setPaying(null)} onChanged={() => { void load(); }} />}
    </div>
  );
}
