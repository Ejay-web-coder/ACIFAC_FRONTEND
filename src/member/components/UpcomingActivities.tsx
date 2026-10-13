import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight, MapPin } from 'lucide-react';
import { EmptyState, Skeleton } from '../../app/components/common/UiKit';
import { fetchMyAttendance, timeRange, type UpcomingActivity } from '../../app/services/attendanceApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { formatDate } from '../../utils/dateTime';

/** The next scheduled cooperative activities (meetings, trainings, community development), for the member dashboard. */
export function UpcomingActivities() {
  const [upcoming, setUpcoming] = useState<UpcomingActivity[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchMyAttendance()
      .then((response) => { setUpcoming(response.data.upcoming); setError(''); })
      .catch((reason: Error) => setError(reason.message || 'Unable to load the upcoming activities.'));
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['activities'], load);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-labelledby="upcoming-activities-title">
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 md:px-5">
        <h2 id="upcoming-activities-title" className="text-base font-semibold text-gray-900">Upcoming Activities</h2>
        <Link to="/member-profile" className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-green-700 hover:bg-green-50">My attendance<ChevronRight className="h-4 w-4" /></Link>
      </header>
      {error ? <p className="p-4 text-sm text-red-600 md:p-5" role="alert">{error}</p>
        : !upcoming ? <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5" role="status" aria-label="Loading upcoming activities"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
          : !upcoming.length ? <EmptyState icon={CalendarClock} title="No upcoming activities" message="Meetings, trainings and community activities appear here once the office schedules them." compact />
            : (
              <ul className="grid gap-3 p-4 sm:grid-cols-2 md:p-5">
                {upcoming.map((activity) => (
                  <li key={activity.id} className="rounded-xl border border-gray-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700">{activity.categoryLabel}</p>
                    <p className="font-semibold text-gray-900">{activity.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600"><CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />{formatDate(activity.activityDate)} · {timeRange(activity.startTime, activity.endTime)}</p>
                    <p className="flex items-center gap-1.5 text-sm text-gray-600"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{activity.venue}</p>
                  </li>
                ))}
              </ul>
            )}
    </section>
  );
}
