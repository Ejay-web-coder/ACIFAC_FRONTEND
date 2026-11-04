import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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
 * day (hovering it with a mouse, or clicking it) opens a pop-up beside it
 * listing every machine for that day; `onBook` (the member's booking form)
 * lets an available one be booked from there. The office also sees who booked.
 */
export function MachineAvailabilityCalendar({ onBook }: { onBook?: (machineryId: string, date: string) => void }) {
  const today = dateOnlyToday();
  const [month, setMonth] = useState(monthStart(today));
  // The day whose pop-up is open. With a mouse it follows the pointer; a tap
  // (touch, pen or keyboard) pins it until it is closed.
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const openRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const lastPointer = useRef('');
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
  const close = () => { window.clearTimeout(hoverTimer.current); setOpenDay(null); setPinned(false); };
  // A short wait before opening and closing, so sweeping across the calendar
  // does not flash pop-ups and moving into one does not close it.
  const hoverTo = (date: string | null) => {
    window.clearTimeout(hoverTimer.current);
    if (pinned) return;
    if (date && openDay) { setOpenDay(date); return; }
    hoverTimer.current = window.setTimeout(() => setOpenDay(date), date ? 120 : 150);
  };
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  // A clicked pop-up closes on Escape or a click anywhere else.
  useEffect(() => {
    if (!pinned) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const onDown = (event: PointerEvent) => { if (!openRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [pinned]);

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
        {days.map((date, index) => {
          const states = dayStates(date);
          const free = states.filter((row) => row.state === 'free').length;
          const inMonth = date.slice(0, 7) === month.slice(0, 7);
          const past = date < today;
          const open = openDay === date;
          // The pop-up opens toward the middle of the calendar so it stays on screen.
          const column = index % 7;
          const row = Math.floor(index / 7);
          const across = column < 3 ? 'left-0' : column > 3 ? 'right-0' : 'left-1/2 -translate-x-1/2';
          const upDown = row < 3 ? 'top-full pt-1' : 'bottom-full pb-1';
          return (
            <div key={date} ref={open ? openRef : undefined} className={`relative ${open ? 'z-30' : ''}`}
              onPointerEnter={(event) => { if (event.pointerType === 'mouse') hoverTo(date); }}
              onPointerLeave={(event) => { if (event.pointerType === 'mouse') hoverTo(null); }}>
              <button type="button" onPointerDown={(event) => { lastPointer.current = event.pointerType; }}
                onClick={() => {
                  const mouse = lastPointer.current === 'mouse';
                  lastPointer.current = '';
                  window.clearTimeout(hoverTimer.current);
                  if (mouse) { setPinned(false); setOpenDay(date); return; }
                  if (open && pinned) close(); else { setOpenDay(date); setPinned(true); }
                }}
                aria-expanded={open} aria-haspopup="dialog"
                aria-label={`${formatDate(date)}: ${free} of ${machinery.length} machines available`}
                className={`flex min-h-[3.5rem] w-full flex-col items-center justify-start gap-1 rounded-lg border p-1 text-sm sm:min-h-[4rem] ${open ? 'border-green-600 ring-2 ring-green-600' : 'border-gray-100'} ${inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'} ${past ? 'opacity-50' : 'hover:bg-green-50'}`}>
                <span className={`tabular-nums ${date === today ? 'rounded-full bg-green-600 px-1.5 font-bold text-white' : ''}`}>{Number(date.slice(8))}</span>
                <span className="flex flex-wrap justify-center gap-0.5" aria-hidden="true">
                  {states.map(({ machine, state }) => <span key={machine.id} className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${STATE_STYLE[state].dot}`} />)}
                </span>
                {!past && machinery.length > 0 && <span className="hidden text-[10px] text-gray-500 sm:block">{free}/{machinery.length} free</span>}
              </button>

              {open && <div className={`absolute ${across} ${upDown} w-72 max-w-[calc(100vw-2rem)]`}>
                <div role="dialog" aria-label={`Machines on ${formatDate(date)}`} className="animate-[acf-pop-in_160ms_cubic-bezier(0.2,0,0,1)] motion-reduce:animate-none rounded-xl border border-gray-200 bg-white p-3 text-left shadow-[var(--shadow-raised)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{formatDate(date)}</p>
                    {pinned && <button type="button" onClick={close} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-4 w-4" /></button>}
                  </div>
                  <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                    {states.map(({ machine, state, booking }) => {
                      const details = (
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{machine.name} <span className="font-normal text-gray-500">({machine.id})</span></p>
                          {booking && <p className="text-xs text-gray-500">{formatDate(booking.startDate)}{booking.endDate !== booking.startDate ? ` to ${formatDate(booking.endDate)}` : ''}</p>}
                          {booking?.renter && <p className="text-xs text-gray-500">{booking.renter}</p>}
                        </div>
                      );
                      // An available machine is booked by clicking anywhere on its row.
                      return (
                        <li key={machine.id}>
                          {state === 'free' && onBook && !past
                            ? <button type="button" onClick={() => { close(); onBook(machine.id, date); }} title={`Book ${machine.name} from ${formatDate(date)}`}
                              className="group flex w-full items-center justify-between gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 text-left transition-colors hover:border-green-300 hover:bg-green-50">
                              {details}
                              <span className="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white group-hover:bg-green-700">Book</span>
                            </button>
                            : <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5">
                              {details}
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[state].badge}`}>{STATE_STYLE[state].label}</span>
                            </div>}
                        </li>
                      );
                    })}
                    {machinery.length === 0 && !error && <li className="text-sm text-gray-500">No machines are listed yet.</li>}
                  </ul>
                </div>
              </div>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {(Object.keys(STATE_STYLE) as DayState[]).map((state) => <span key={state} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STATE_STYLE[state].dot}`} />{STATE_STYLE[state].label}</span>)}
      </div>
    </section>
  );
}
