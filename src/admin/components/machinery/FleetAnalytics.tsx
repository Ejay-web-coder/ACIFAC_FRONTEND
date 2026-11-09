import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  EXPENSE_LABELS, fetchFleetAnalytics,
  type ExpenseCategory, type FleetAnalytics as FleetData, type FleetMachine,
} from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { formatDate } from '../../../utils/dateTime';
import { MachineHistoryModal } from './MachineHistoryModal';

const peso = (value: number) => `${value < 0 ? '-' : ''}₱${Math.abs(value).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
const days = (value: number) => {
  const whole = Math.round(value);
  return `${whole.toLocaleString('en-PH')} ${whole === 1 ? 'day' : 'days'}`;
};

// A rate shown as a percentage never goes over 100%.
const cap = (value: number) => Math.min(100, value);

const STATUS_BADGE: Record<FleetMachine['status'], string> = {
  available: 'bg-green-100 text-green-800',
  'in-use': 'bg-blue-100 text-blue-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
};

/**
 * The machinery fleet on the Analytics page, in one card: utilization,
 * revenue, cost, bookings and downtime, in total and per machine, for the
 * picked period.
 */
export function FleetAnalytics({ from, to, periodLabel, refreshKey }: { from: string; to: string; periodLabel: string; refreshKey: number }) {
  const [data, setData] = useState<FleetData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // The machine whose income and expenses are open (a row of the table clicked).
  const [historyMachine, setHistoryMachine] = useState<FleetMachine | null>(null);
  // Re-reads the figures when machinery records change.
  const [changes, setChanges] = useState(0);
  useLiveRefresh(['machinery', 'rental_requests', 'machinery_operations', 'machinery_services', 'machinery_service_payments', 'machinery_expenses'], () => setChanges((count) => count + 1), 2000);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchFleetAnalytics(from, to)
      .then((next) => { if (active) { setData(next); setError(''); } })
      .catch((reason) => { if (active) setError(errorMessage(reason, 'Unable to load the machinery analytics.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, refreshKey, changes]);

  const fleet = data?.fleet;
  const machines = [...(data?.machines || [])].sort((a, b) => b.revenue - a.revenue || (b.utilization ?? -1) - (a.utilization ?? -1) || a.name.localeCompare(b.name));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby="fleet-analytics-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="fleet-analytics-title" className="text-lg font-bold text-gray-900">Machinery Fleet</h2>
          <p className="mt-1 text-sm text-gray-500">Utilization, revenue, cost, bookings and downtime per machine · {periodLabel}</p>
        </div>
      </div>

      {error && !data && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="flex h-40 items-center justify-center gap-2 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading live data...</p>}

      {data && fleet && (
        // A refresh keeps the last figures on screen, dimmed, instead of a loading flash.
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label="Utilization" value={fleet.utilization === null ? '' : `${cap(fleet.utilization)}%`} detail={fleet.ownedDays ? `${plural(fleet.usedDays, 'machine-day')} used of ${fleet.ownedDays.toLocaleString()}` : 'Period not started'} />
            <Tile label="Revenue" value={peso(fleet.revenue)} detail={fleet.uncollected > 0 ? `${peso(fleet.uncollected)} not yet collected` : `Rentals ${peso(fleet.rentalRevenue)} · services ${peso(fleet.serviceRevenue)}`} />
            <Tile label="Operating cost" value={peso(fleet.cost)} detail="Fuel, labor, repairs, other" />
            <Tile label="Net income" value={peso(fleet.net)} detail="Revenue less operating cost" negative={fleet.net < 0} />
            <Tile label="Bookings & jobs" value={(data.bookings.operations.scheduled + data.bookings.operations.ongoing + data.bookings.operations.completed + data.bookings.services.jobs).toLocaleString()}
              detail={data.bookings.requests.pendingNow ? `${plural(data.bookings.requests.pendingNow, 'request')} waiting for review` : 'No requests waiting'} />
            <Tile label="Downtime" value={days(fleet.downtimeDays)} detail={`${fleet.availability === null ? '' : `${cap(fleet.availability)}%`} available · ${fleet.inMaintenance} in maintenance now`} />
          </div>

          <MachineTable machines={machines} fleet={fleet} onOpen={setHistoryMachine} />
          {historyMachine && <MachineHistoryModal machine={historyMachine} from={from} to={to} periodLabel={periodLabel} onClose={() => setHistoryMachine(null)} />}

          <details className="mt-6 text-sm text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">How these figures are calculated</summary>
            <dl className="mt-2 space-y-1.5">
              {(Object.entries(data.methodology) as Array<[keyof FleetData['methodology'], string]>)
                .filter(([key]) => key !== 'roi' && key !== 'rules' && key !== 'forecast').map(([key, text]) => (
                <div key={key}><dt className="inline font-medium capitalize text-gray-800">{key}: </dt><dd className="inline">{text}</dd></div>
              ))}
            </dl>
          </details>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, detail, negative = false }: { label: string; value: string; detail: string; negative?: boolean }) {
  return <div className="min-w-0 rounded-xl border border-gray-200 px-3 py-2.5">
    <p className="text-xs font-medium text-gray-600">{label}</p>
    <p className={`mt-0.5 truncate text-xl font-bold ${negative ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    <p className="mt-0.5 text-xs leading-snug text-gray-500">{detail}</p>
  </div>;
}

function UtilizationMeter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400"></span>;
  return <div className="flex items-center gap-2">
    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-green-100" aria-hidden="true"><span className="block h-full rounded-full bg-green-600" style={{ width: `${cap(value)}%` }} /></span>
    <span className="tabular-nums">{cap(value)}%</span>
  </div>;
}

function MachineTable({ machines, fleet, onOpen }: { machines: FleetMachine[]; fleet: FleetData['fleet']; onOpen: (machine: FleetMachine) => void }) {
  const costLine = (machine: FleetMachine) => (Object.entries(machine.costByCategory) as Array<[ExpenseCategory, number]>)
    .filter(([, amount]) => amount > 0).map(([category, amount]) => `${EXPENSE_LABELS[category].replace(' & maintenance', 's')} ${peso(amount)}`).join(' · ');
  return <div className="mt-6">
    <h3 className="text-sm font-semibold text-gray-900">Per machine <span className="font-normal text-gray-500">· select a machine to see its income and expenses</span></h3>
    {machines.length ? <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
          <tr><th className="px-3 py-2 font-medium">Machine</th><th className="px-3 py-2 font-medium">Bookings · jobs</th><th className="px-3 py-2 font-medium">Utilization</th><th className="px-3 py-2 text-right font-medium">Revenue</th><th className="px-3 py-2 text-right font-medium">Cost</th><th className="px-3 py-2 text-right font-medium">Net</th><th className="px-3 py-2 font-medium">Downtime</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {machines.map((machine) => (
            <tr key={machine.id} className="cursor-pointer align-top hover:bg-green-50/50" onClick={() => onOpen(machine)}>
              <td className="px-3 py-2.5">
                <p className="font-medium text-gray-900"><button type="button" onClick={(event) => { event.stopPropagation(); onOpen(machine); }} className="text-left font-medium text-green-800 hover:underline">{machine.name}</button> <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[machine.status]}`}>{machine.status}</span></p>
                <p className="text-xs text-gray-500">{machine.id} · {machine.type}{machine.pricingMode === 'per_service' ? ' · per service' : ` · ${peso(machine.dailyFee)}/day`}</p>
              </td>
              <td className="px-3 py-2.5 tabular-nums">{machine.bookings} · {machine.jobs}<p className="text-xs text-gray-500">{plural(machine.usedDays, 'day')} used</p></td>
              <td className="px-3 py-2.5"><UtilizationMeter value={machine.utilization} /></td>
              <td className="px-3 py-2.5 text-right tabular-nums">{peso(machine.revenue)}{machine.uncollected > 0 && <p className="text-xs text-amber-800">{peso(machine.uncollected)} uncollected</p>}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{peso(machine.cost)}{machine.cost > 0 && <p className="text-xs text-gray-500">{costLine(machine)}</p>}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${machine.net < 0 ? 'text-red-700' : 'text-gray-900'}`}>{peso(machine.net)}</td>
              <td className="px-3 py-2.5">
                <span className="tabular-nums">{machine.downtimeDays ? days(machine.downtimeDays) : ''}</span>
                {machine.status === 'maintenance' && <p className="text-xs text-amber-800">{machine.downSince ? `Down since ${formatDate(machine.downSince, true)}` : 'Down (start not recorded)'}</p>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
          <tr>
            <td className="px-3 py-2">Fleet ({fleet.machines})</td>
            <td className="px-3 py-2 tabular-nums">{machines.reduce((sum, machine) => sum + machine.bookings, 0)} · {machines.reduce((sum, machine) => sum + machine.jobs, 0)}</td>
            <td className="px-3 py-2"><UtilizationMeter value={fleet.utilization} /></td>
            <td className="px-3 py-2 text-right tabular-nums">{peso(fleet.revenue)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{peso(fleet.cost)}</td>
            <td className={`px-3 py-2 text-right tabular-nums ${fleet.net < 0 ? 'text-red-700' : ''}`}>{peso(fleet.net)}</td>
            <td className="px-3 py-2 tabular-nums">{fleet.downtimeDays ? days(fleet.downtimeDays) : ''}</td>
          </tr>
        </tfoot>
      </table>
    </div> : <p className="mt-2 text-sm text-gray-500">No machinery recorded.</p>}
  </div>;
}
