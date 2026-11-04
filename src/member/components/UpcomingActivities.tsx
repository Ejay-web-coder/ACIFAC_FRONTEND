import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { Skeleton } from '../../app/components/common/UiKit';
import { fetchMyAttendance, timeRange, type UpcomingActivity } from '../../app/services/attendanceApi';
import { useLiveRefresh } from '../../lib/liveUpdates';

/** The next scheduled cooperative activities (meetings, trainings, community development), for the member dashboard.
 * Kept short so the dashboard fits one screen: the first `limit`, and how many more there are. */
export function UpcomingActivities({ limit = 2, embedded = false }: { limit?: number; embedded?: boolean }) {
  const [upcoming, setUpcoming] = useState<UpcomingActivity[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchMyAttendance()
      .then((response) => { setUpcoming(response.data.upcoming); setError(''); })
      .catch((reason: Error) => setError(reason.message || 'Unable to load the upcoming activities.'));
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['activities'], load);

  const shown = upcoming?.slice(0, limit) ?? [];
  const more = upcoming ? upcoming.length - shown.length : 0;
  const body = error ? <p className="p-4 text-sm text-red-600" role="alert">{error}</p>
    : !upcoming ? <div className="space-y-2 p-3" role="status" aria-label="Loading upcoming activities"><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div>
      : !upcoming.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-4 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500"><CalendarClock className="h-5 w-5" aria-hidden="true" /></span>
          <p className="text-sm font-semibold text-gray-900">No activities scheduled</p>
          <p className="text-xs text-gray-500">Meetings and events you can join will show up here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {shown.map((activity) => {
            const date = new Date(`${String(activity.activityDate).slice(0, 10)}T00:00:00`);
            return (
              <li key={activity.id} className="flex items-center gap-3 px-4 py-2.5">
                {/* A calendar leaf: month over day. */}
                <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-green-50 leading-none text-green-800 ring-1 ring-green-100" aria-hidden="true">
                  <span className="text-[10px] font-semibold uppercase">{date.toLocaleDateString('en-PH', { month: 'short' })}</span>
                  <span className="text-base font-bold">{date.getDate()}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{activity.title}</p>
                  <p className="truncate text-xs text-gray-500">{activity.categoryLabel} · {timeRange(activity.startTime, activity.endTime)} · {activity.venue}</p>
                </div>
              </li>
            );
          })}
          {more > 0 && <li className="px-4 py-1.5 text-xs text-gray-500">and {more} more</li>}
        </ul>
      );
  // embedded: the list only, inside another card (the phone dashboard's tabs).
  if (embedded) return body;
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-labelledby="upcoming-activities-title">
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
        <h2 id="upcoming-activities-title" className="text-base font-bold text-gray-900">Upcoming activities</h2>
        <Link to="/member-profile" className="inline-flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-green-800 hover:bg-green-50">My attendance<ChevronRight className="h-4 w-4" /></Link>
      </header>
      {body}
    </section>
  );
}
