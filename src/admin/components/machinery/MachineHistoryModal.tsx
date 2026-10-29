import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  EXPENSE_LABELS, fetchExpenses, fetchServices,
  type FleetMachine, type MachineryExpense, type MachineryService,
} from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { formatDate } from '../../../utils/dateTime';
import { Modal, PaymentBadge, secondaryButton } from './shared';

const peso = (value: number) => `${value < 0 ? '-' : ''}₱${Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + Math.round(value * 100), 0)) / 100;

// Every service of a machine: the list is read a page (200) at a time.
async function allServices(machineryId: string) {
  const services: MachineryService[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const data = await fetchServices({ machineryId, page, limit: 200 });
    services.push(...data.services);
    if (page >= data.pagination.totalPages) break;
  }
  return services;
}

/**
 * One machine's history for the period picked on the Analytics page: its
 * income (each service done, with its fee and what was collected) and its
 * expenses (fuel, labor, repairs, other), as the fleet table adds them up.
 */
export function MachineHistoryModal({ machine, from, to, periodLabel, onClose }: { machine: FleetMachine; from: string; to: string; periodLabel: string; onClose: () => void }) {
  const [services, setServices] = useState<MachineryService[] | null>(null);
  const [expenses, setExpenses] = useState<MachineryExpense[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const inPeriod = (date: string) => date >= from && date <= to;
    Promise.all([allServices(machine.id), fetchExpenses({ machineryId: machine.id })])
      .then(([serviceRows, expenseData]) => {
        if (!active) return;
        setServices(serviceRows.filter((row) => inPeriod(row.serviceDate)));
        setExpenses(expenseData.expenses.filter((row) => inPeriod(row.expenseDate)));
      })
      .catch((reason) => { if (active) setError(errorMessage(reason, 'Unable to load the history of this machine.')); });
    return () => { active = false; };
  }, [machine.id, from, to]);

  const income = services ? sum(services.map((row) => row.feeAmount)) : 0;
  const collected = services ? sum(services.map((row) => row.amountPaid)) : 0;
  const spent = expenses ? sum(expenses.map((row) => row.amount)) : 0;
  const net = Math.round((income - spent) * 100) / 100;

  return (
    <Modal title={`${machine.name} · ${machine.id}`} description={`Income and expenses · ${periodLabel}`} onClose={onClose} wide
      footer={<button type="button" onClick={onClose} className={secondaryButton}>Close</button>}>
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>
        : !services || !expenses ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the history...</p>
        : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label="Income (fees)" value={peso(income)} detail={`${services.length} service${services.length === 1 ? '' : 's'}`} />
              <Figure label="Collected" value={peso(collected)} detail={income > collected ? `${peso(Math.round((income - collected) * 100) / 100)} not yet` : 'All collected'} />
              <Figure label="Expenses" value={peso(spent)} detail={`${expenses.length} expense${expenses.length === 1 ? '' : 's'}`} />
              <Figure label="Net" value={peso(net)} negative={net < 0} detail="Income less expenses" />
            </div>

            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Income</h3>
              {services.length === 0 ? <p className="mt-2 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No services recorded for this machine in this period.</p> : (
                <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Service</th><th className="px-3 py-2 font-medium">Client</th><th className="px-3 py-2 text-right font-medium">Fee</th><th className="px-3 py-2 text-right font-medium">Paid</th><th className="px-3 py-2 font-medium">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {services.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap px-3 py-2">{formatDate(row.serviceDate, true)}</td>
                          <td className="px-3 py-2">{row.serviceType}<p className="text-xs text-gray-500">{row.unit === 'per_100_bags' ? `${row.totalBags ?? 0} bags` : `${row.areaHa} ha`}</p></td>
                          <td className="px-3 py-2">{row.clientName}{row.clientCategory === 'non_member' && <span className="ml-1 text-xs text-gray-500">(non-member)</span>}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{peso(row.feeAmount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{peso(row.amountPaid)}</td>
                          <td className="px-3 py-2"><PaymentBadge status={row.paymentStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Expenses</h3>
              {expenses.length === 0 ? <p className="mt-2 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No expenses recorded for this machine in this period.</p> : (
                <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Category</th><th className="px-3 py-2 font-medium">Description</th><th className="px-3 py-2 text-right font-medium">Amount</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {expenses.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap px-3 py-2">{formatDate(row.expenseDate, true)}</td>
                          <td className="px-3 py-2">{EXPENSE_LABELS[row.category]}</td>
                          <td className="px-3 py-2 text-gray-600">{row.description || ''}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{peso(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
    </Modal>
  );
}

function Figure({ label, value, detail, negative = false }: { label: string; value: string; detail: string; negative?: boolean }) {
  return <div className="min-w-0 rounded-xl border border-gray-200 px-3 py-2.5">
    <p className="text-xs font-medium text-gray-600">{label}</p>
    <p className={`mt-0.5 truncate text-lg font-bold tabular-nums ${negative ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    <p className="mt-0.5 text-xs text-gray-500">{detail}</p>
  </div>;
}
