import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Machinery } from '../services/authApi';
import { fetchMachineryAvailability, type MachineBooking } from '../services/machineryApi';
import { errorMessage } from '../../lib/api';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { addDateOnlyDays, dateOnlyToday, formatDate } from '../../utils/dateTime';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type DayState = 'free' | 'pending' | 'booked' | 'maintenance';
const STATE_STYLE: Record<DayState, { dot: string; badge: string; label: string }> = {
  free: { dot: 'bg-green-500', badge: 'bg-green-100 text-green-800', label: 'Available' },
  pending: { dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-800', label: 'Requested' },
  booked: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-800', label: 'Booked' },
  maintenance: { dot: 'bg-gray-400', badge: 'bg-gray-200 text-gray-700', label: 'Under maintenance' },
};

const pad = (value: number) => String(value).padStart(2, '0');
const monthStart = (date: string) => `${date.slice(0, 8)}01`;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** What a machine is on a day: booked wins over requested; maintenance (its status now) over both. */
function machineState(machine: Machinery, date: string, bookings: MachineBooking[]): { state: DayState; booking?: MachineBooking } {
  if (machine.status === 'maintenance') return { state: 'maintenance' };
  const onDay = bookings.filter((row) => row.machineryId === machine.id && row.startDate <= date && row.endDate >= date);
  const booked = onDay.find((row) => row.status === 'booked');
  if (booked) return { state: 'booked', booking: booked };
  if (onDay.length) return { state: 'pending', booking: onDay[0] };
  return { state: 'free' };
}

/**
 * The booking calendar: a month of days, each with a dot per machine (green
 * available, amber requested, red booked, grey under maintenance). Choosing a
 * day lists every machine for it; `onBook` (the member's booking form) lets an
 * available one be booked from that day. The office also sees who booked.
 */
export function MachineAvailabilityCalendar({ onBook }: { onBook?: (machineryId: string, date: string) => void }) {
  const today = dateOnlyToday();
  const [month, setMonth] = useState(monthStart(today));
  const [selected, setSelected] = useState(today);
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [bookings, setBookings] = useState<MachineBooking[]>([]);
  const [error, setError] = useState('');

  // Six weeks from the Sunday on or before the 1st.
  const gridStart = addDateOnlyDays(month, -weekday(month));
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDateOnlyDays(gridStart, index)), [gridStart]);

  const load = useCallback(() => {
    fetchMachineryAvailability(days[0], days[days.length - 1])
      .then((data) => { setMachinery(data.machinery); setBookings(data.bookings); setError(''); })
      .catch((reason) => setError(errorMessage(reason, 'Unable to load the calendar.')));
  }, [days]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['machinery', 'rental_requests', 'machinery_operations'], load);

  const shiftMonth = (step: number) => {
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + step, 1));
    setMonth(`${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-01`);
  };
  const [year, monthNumber] = month.split('-').map(Number);
  const dayStates = (date: string) => machinery.map((machine) => ({ machine, ...machineState(machine, date, bookings) }));
  const selectedStates = dayStates(selected);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Machine availability calendar">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-900">Machine Availability</h2>
          <p className="text-xs text-gray-500">Choose a day to see which machines are free.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shiftMonth(-1)} disabled={month <= monthStart(today)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-40" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <p className="min-w-[8.5rem] text-center text-sm font-semibold text-gray-900">{MONTHS[monthNumber - 1]} {year}</p>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-gray-500">
        {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((date) => {
          const states = dayStates(date);
          const free = states.filter((row) => row.state === 'free').length;
          const inMonth = date.slice(0, 7) === month.slice(0, 7);
          const past = date < today;
          return (
            <button key={date} type="button" onClick={() => setSelected(date)} aria-pressed={selected === date}
              aria-label={`${formatDate(date)}: ${free} of ${machinery.length} machines available`}
              className={`flex min-h-[3.5rem] flex-col items-center justify-start gap-1 rounded-lg border p-1 text-sm sm:min-h-[4rem] ${selected === date ? 'border-green-600 ring-2 ring-green-600' : 'border-gray-100'} ${inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'} ${past ? 'opacity-50' : 'hover:bg-green-50'}`}>
              <span className={`tabular-nums ${date === today ? 'rounded-full bg-green-600 px-1.5 font-bold text-white' : ''}`}>{Number(date.slice(8))}</span>
              <span className="flex flex-wrap justify-center gap-0.5" aria-hidden="true">
                {states.map(({ machine, state }) => <span key={machine.id} className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${STATE_STYLE[state].dot}`} />)}
              </span>
              {!past && machinery.length > 0 && <span className="hidden text-[10px] text-gray-500 sm:block">{free}/{machinery.length} free</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {(Object.keys(STATE_STYLE) as DayState[]).map((state) => <span key={state} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STATE_STYLE[state].dot}`} />{STATE_STYLE[state].label}</span>)}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-sm font-semibold text-gray-900">{formatDate(selected)}</p>
        <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {selectedStates.map(({ machine, state, booking }) => (
            <li key={machine.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{machine.name}</p>
                <p className="truncate text-xs text-gray-500">
                  {machine.id}
                  {booking && ` · ${formatDate(booking.startDate)}${booking.endDate !== booking.startDate ? ` to ${formatDate(booking.endDate)}` : ''}`}
                  {booking?.renter && ` · ${booking.renter}`}
                </p>
              </div>
              {state === 'free' && onBook && selected >= today
                ? <button type="button" onClick={() => onBook(machine.id, selected)} className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">Book</button>
                : <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[state].badge}`}>{STATE_STYLE[state].label}</span>}
            </li>
          ))}
          {machinery.length === 0 && !error && <li className="text-sm text-gray-500">No machines are listed yet.</li>}
        </ul>
      </div>
    </section>
  );
}
