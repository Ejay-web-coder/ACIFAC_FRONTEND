import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarClock, ClipboardCheck, LoaderCircle, MapPin, Percent, ShieldCheck, XCircle } from 'lucide-react';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { formatDate } from '../../../utils/dateTime';
import { EmptyState, Pagination } from '../common/UiKit';
import { usePagination } from '../common/usePagination';
import {
  fetchMemberParticipation, fetchMyAttendance, formatClock, rateLabel, timeRange, type ParticipationCounts, type ParticipationProfile as Profile,
} from '../../services/attendanceApi';
import { AttendanceBadge, RATE_RULE } from './shared';

/** A member's attendance at cooperative activities: rate, counts, the
 * breakdown per category and every record. Read-only everywhere: members see
 * their own (no memberId), the office sees the member it opened. */
export function ParticipationProfile({ memberId, variant, showMember = false }: {
  memberId?: number;
  variant: 'member' | 'office';
  /** Names the member in the heading (where nothing else on screen does). */
  showMember?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    (memberId ? fetchMemberParticipation(memberId) : fetchMyAttendance())
      .then((response) => { setProfile(response.data); setError(''); })
      .catch((reason: Error) => setError(reason.message || 'Unable to load the attendance records.'));
  }, [memberId]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['activities', 'activity_attendance'], load);
  const pages = usePagination(profile?.history ?? [], { pageSize: 5, resetKey: String(memberId ?? 'me') });

  const own = variant === 'member';
  return (
    <section className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]" aria-labelledby="participation-title">
      <header className="border-b border-gray-100 px-4 py-4 sm:px-5">
        <h2 id="participation-title" className="text-lg font-bold text-gray-900">
          {showMember && profile ? `${profile.member.name} · ${profile.member.memberNumber ?? `Member #${profile.member.id}`}` : own ? 'My Activity Attendance' : 'Activity Attendance'}
        </h2>
        <p className="mt-0.5 text-sm text-gray-600">
          {own
            ? 'Your attendance at ACIFAC meetings, trainings and community development activities, as recorded by the office. If something is wrong, please tell the office.'
            : 'Participation in meetings, educational and training activities, and community development activities.'}
        </p>
      </header>

      {error ? <p className="p-5 text-sm text-red-600" role="alert">{error}</p>
        : !profile ? <p className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading attendance…</p>
          : <ProfileBody profile={profile} own={own} pages={pages} />}
    </section>
  );
}

function ProfileBody({ profile, own, pages }: { profile: Profile; own: boolean; pages: ReturnType<typeof usePagination<Profile['history'][number]>> }) {
  const { summary } = profile;
  const tiles = [
    { label: 'Attendance Rate', value: rateLabel(summary.rate), detail: summary.eligible ? `${summary.attended} of ${summary.eligible} eligible ${summary.eligible === 1 ? 'activity' : 'activities'}` : 'No completed activity yet', icon: Percent, strong: true },
    { label: 'Activities Attended', value: String(summary.attended), detail: `${summary.present} present · ${summary.late} late`, icon: CalendarCheck },
    { label: 'Eligible Activities', value: String(summary.eligible), detail: 'completed, attendance final', icon: ClipboardCheck },
    { label: 'Excused', value: String(summary.excused), detail: 'not counted as attended', icon: ShieldCheck },
    { label: 'Absent', value: String(summary.absent), detail: 'not counted as attended', icon: XCircle },
  ];
  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className={`min-w-0 rounded-xl p-3 ${tile.strong ? 'col-span-2 bg-green-700 text-white sm:col-span-1' : 'bg-gray-50 ring-1 ring-inset ring-gray-100'}`}>
            <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${tile.strong ? 'text-green-100' : 'text-gray-500'}`}><tile.icon className="h-3.5 w-3.5" aria-hidden="true" />{tile.label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${tile.strong ? 'text-white' : 'text-gray-900'}`}>{tile.value}</p>
            <p className={`text-xs ${tile.strong ? 'text-green-100' : 'text-gray-500'}`}>{tile.detail}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-green-100 bg-green-50/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-gray-700">
          <span className="font-semibold text-gray-900">Most recent activity attended: </span>
          {profile.mostRecent ? <>{profile.mostRecent.title} · {formatDate(profile.mostRecent.activityDate)}</> : 'None yet'}
        </p>
        {profile.mostRecent && <AttendanceBadge status={profile.mostRecent.status} />}
      </div>
      {profile.pending > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status">
          {profile.pending} {profile.pending === 1 ? 'record is' : 'records are'} from activities whose attendance is not final yet. {profile.pending === 1 ? 'It is' : 'They are'} listed below but not counted until the office finalizes the attendance.
        </p>
      )}

      <div>
        <h3 className="mb-2 font-semibold text-gray-900">By Activity Category</h3>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {profile.byCategory.map((row) => <CategoryRow key={row.category} label={row.label} counts={row} />)}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-gray-900">Attendance History</h3>
        {!profile.history.length ? (
          <EmptyState icon={CalendarCheck} title="No attendance recorded yet" message={own ? 'Your attendance appears here after the office records it.' : 'Records appear here after the office records attendance at an activity.'} compact />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <ul className="divide-y divide-gray-100 md:hidden">
              {pages.pageItems.map((record) => (
                <li key={record.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{record.title}</p>
                      <p className="text-xs text-gray-500">{formatDate(record.activityDate, true)} · {record.categoryLabel}</p>
                    </div>
                    <AttendanceBadge status={record.status} />
                  </div>
                  {(record.checkInTime || record.remarks || !record.final) && (
                    <p className="text-xs text-gray-600">
                      {record.checkInTime && <>Checked in {formatClock(record.checkInTime)}. </>}
                      {record.remarks}
                      {!record.final && <span className="ml-1 font-medium text-amber-700">Not final yet</span>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>{['Date', 'Activity', 'Category', 'Status', 'Check-in', 'Remarks'].map((heading) => <th key={heading} className="px-4 py-2.5 font-medium">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pages.pageItems.map((record) => (
                    <tr key={record.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{formatDate(record.activityDate, true)}</td>
                      <td className="px-4 py-2.5"><p className="font-medium text-gray-900">{record.title}</p><p className="text-xs text-gray-500">{timeRange(record.startTime, record.endTime)} · {record.venue}</p></td>
                      <td className="px-4 py-2.5 text-gray-700">{record.categoryLabel}</td>
                      <td className="px-4 py-2.5"><AttendanceBadge status={record.status} />{!record.final && <p className="mt-1 text-xs font-medium text-amber-700">Not final yet</p>}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700">{record.checkInTime ? formatClock(record.checkInTime) : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{record.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="records" />
          </div>
        )}
      </div>

      {own && (
        <div>
          <h3 className="mb-2 font-semibold text-gray-900">Upcoming Activities</h3>
          {!profile.upcoming.length ? <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">No upcoming activity is scheduled yet.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {profile.upcoming.map((activity) => (
                <li key={activity.id} className="rounded-xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700">{activity.categoryLabel}</p>
                  <p className="font-semibold text-gray-900">{activity.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600"><CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />{formatDate(activity.activityDate)} · {timeRange(activity.startTime, activity.endTime)}</p>
                  <p className="flex items-center gap-1.5 text-sm text-gray-600"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{activity.venue}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500">{RATE_RULE}</p>
    </div>
  );
}

function CategoryRow({ label, counts }: { label: string; counts: ParticipationCounts }) {
  return (
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center">
      <p className="font-medium text-gray-900">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${label}: ${rateLabel(counts.rate)} attendance`}>
        <div className="h-full rounded-full bg-green-600" style={{ width: `${counts.rate ?? 0}%` }} />
      </div>
      <p className="text-sm text-gray-600 sm:text-right">
        <span className="font-semibold tabular-nums text-gray-900">{rateLabel(counts.rate)}</span>
        <span className="ml-2 text-xs">{counts.eligible ? `${counts.attended} of ${counts.eligible} attended · ${counts.excused} excused · ${counts.absent} absent` : 'no eligible activity'}</span>
      </p>
    </li>
  );
}
