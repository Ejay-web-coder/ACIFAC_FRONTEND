// Member attendance monitoring: activities, attendance records, reports and
// each member's participation. The office uses /api/attendance; members only
// read their own records through /api/members/me/attendance.
import { apiGet, apiPatch, apiPost, apiPut } from '../../lib/api';
import type { Pagination } from './authApi';

export type ActivityCategory = 'community_development' | 'education_training' | 'meeting';
export type ActivityStatus = 'scheduled' | 'completed' | 'cancelled';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export const ACTIVITY_CATEGORIES: Array<{ value: ActivityCategory; label: string }> = [
  { value: 'community_development', label: 'Community Development' },
  { value: 'education_training', label: 'Educational and Training' },
  { value: 'meeting', label: 'Meeting' },
];
export const CATEGORY_LABELS = Object.fromEntries(ACTIVITY_CATEGORIES.map((item) => [item.value, item.label])) as Record<ActivityCategory, string>;

export const ACTIVITY_STATUSES: Array<{ value: ActivityStatus; label: string }> = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const ATTENDANCE_STATUSES: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
];
export const ATTENDANCE_LABELS = Object.fromEntries(ATTENDANCE_STATUSES.map((item) => [item.value, item.label])) as Record<AttendanceStatus, string>;
/** Present and late count as attended. */
export const isAttended = (status: AttendanceStatus | null | undefined) => status === 'present' || status === 'late';

export interface Activity {
  id: number;
  title: string;
  category: ActivityCategory;
  categoryLabel: string;
  activityDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  description: string;
  organizer: string;
  status: ActivityStatus;
  finalizedAt: string | null;
  finalizedBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  recorded: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attended: number;
  /** Attendance is final: unmarked members were recorded absent. */
  final: boolean;
  /** Attended ÷ recorded × 100 once the attendance is final, otherwise null. */
  rate: number | null;
}

export interface ActivityDetails extends Activity {
  /** Members on the list: everyone who was a member on the activity date, and anyone already recorded. */
  members: number;
  unmarked: number;
  /** Active members not marked yet: finalizing records them absent. */
  toMarkAbsent: number;
  recordable: boolean;
  canFinalize: boolean;
  today: string;
}

export interface ActivityInput {
  title: string;
  category: ActivityCategory | '';
  activityDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  description: string;
  organizer: string;
  status: ActivityStatus;
  cancellationReason?: string;
}

export interface ActivityMemberRow {
  memberId: number;
  memberNumber: string | null;
  name: string;
  memberStatus: string;
  recordId: number | null;
  status: AttendanceStatus | null;
  checkInTime: string | null;
  remarks: string;
  source: 'office' | 'finalization' | null;
  updatedAt: string | null;
  recordedBy: string | null;
}

export interface AttendanceChange {
  memberId: number;
  status: AttendanceStatus;
  checkInTime: string | null;
  remarks: string;
}

export interface AttendanceDashboardSummary {
  totalActivities: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  upcoming: number;
  needsFinalizing: number;
  attendanceEntries: number;
  membersParticipated: number;
  ratedActivities: number;
  averageRate: number | null;
}

export interface ActivityHistoryEntry {
  id: number;
  action: string;
  label: string;
  at: string;
  by: string | null;
  description: string;
  reason: string | null;
  from: AttendanceStatus | null;
  to: AttendanceStatus | null;
}

export interface AttendanceRecord {
  id: number;
  activityId: number;
  title: string;
  category: ActivityCategory;
  categoryLabel: string;
  activityDate: string;
  startTime: string;
  venue: string;
  activityStatus: ActivityStatus;
  final: boolean;
  memberId: number;
  memberNumber: string | null;
  memberName: string;
  status: AttendanceStatus;
  checkInTime: string | null;
  remarks: string;
  source: 'office' | 'finalization';
  updatedAt: string;
  recordedBy: string | null;
}

export interface ParticipationCounts {
  eligible: number;
  attended: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
}

export interface ParticipationRow extends ParticipationCounts {
  memberId: number;
  memberNumber: string | null;
  name: string;
  memberStatus: string;
  lastAttended: string | null;
}

export interface ProfileRecord {
  id: number;
  activityId: number;
  title: string;
  category: ActivityCategory;
  categoryLabel: string;
  activityDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  status: AttendanceStatus;
  checkInTime: string | null;
  remarks: string;
  final: boolean;
}

export interface UpcomingActivity {
  id: number;
  title: string;
  category: ActivityCategory;
  categoryLabel: string;
  activityDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  organizer: string;
  description: string;
}

export interface ParticipationProfile {
  member: { id: number; memberNumber: string | null; name: string; status: string; membershipDate: string };
  summary: ParticipationCounts;
  byCategory: Array<ParticipationCounts & { category: ActivityCategory; label: string }>;
  /** Records of activities whose attendance is not final yet (listed, not counted). */
  pending: number;
  mostRecent: ProfileRecord | null;
  history: ProfileRecord[];
  upcoming: UpcomingActivity[];
}

export interface PeriodFilters {
  category?: ActivityCategory | '';
  from?: string;
  to?: string;
}

const query = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const fetchAttendanceDashboard = (filters: PeriodFilters) =>
  apiGet<{ success: boolean; data: { summary: AttendanceDashboardSummary; upcoming: Activity[]; today: string } }>(`/api/attendance/dashboard${query({ ...filters })}`);

export const fetchActivities = (filters: PeriodFilters & { status?: ActivityStatus | 'needs_finalizing' | ''; search?: string; page?: number; limit?: number }) =>
  apiGet<{ success: boolean; data: Activity[]; pagination: Pagination; today: string }>(`/api/attendance/activities${query({ ...filters })}`);

export const fetchActivity = (id: number) => apiGet<{ success: boolean; data: ActivityDetails }>(`/api/attendance/activities/${id}`);

export const createActivity = (input: ActivityInput) => apiPost<{ success: boolean; message: string; data: Activity }>('/api/attendance/activities', input);

export const updateActivity = (id: number, input: ActivityInput) => apiPut<{ success: boolean; message: string; data: Activity }>(`/api/attendance/activities/${id}`, input);

export const cancelActivity = (id: number, reason: string) => apiPatch<{ success: boolean; message: string; data: Activity }>(`/api/attendance/activities/${id}/cancel`, { reason });

export const fetchActivityMembers = (id: number, params: { search?: string; filter?: AttendanceStatus | 'all' | 'unmarked'; page?: number; limit?: number }) =>
  apiGet<{ success: boolean; data: ActivityMemberRow[]; pagination: Pagination }>(`/api/attendance/activities/${id}/members${query({ ...params })}`);

export const saveAttendance = (id: number, records: AttendanceChange[], reason?: string) =>
  apiPut<{ success: boolean; message: string; data: { added: number; updated: number; unchanged: number; activity: Activity } }>(`/api/attendance/activities/${id}/attendance`, { records, reason });

export const finalizeAttendance = (id: number) =>
  apiPost<{ success: boolean; message: string; data: { markedAbsent: number; activity: Activity } }>(`/api/attendance/activities/${id}/finalize`);

export const fetchActivityHistory = (id: number) => apiGet<{ success: boolean; data: ActivityHistoryEntry[] }>(`/api/attendance/activities/${id}/history`);

export interface RecordFilters extends PeriodFilters {
  member?: string;
  memberId?: number;
  status?: AttendanceStatus | '';
  page?: number;
  limit?: number;
  /** All matching rows (up to 10,000), for the CSV export. */
  all?: boolean;
}

export const fetchAttendanceRecords = ({ all, ...filters }: RecordFilters) =>
  apiGet<{ success: boolean; data: AttendanceRecord[]; summary: Record<AttendanceStatus | 'total', number>; pagination: Pagination }>(
    `/api/attendance/records${query({ ...filters, all: all ? 1 : undefined })}`,
  );

export const fetchParticipationReport = ({ all, ...filters }: RecordFilters & { sort?: 'name' | 'rate' }) =>
  apiGet<{ success: boolean; data: ParticipationRow[]; summary: ParticipationCounts & { members: number; activities: number }; pagination: Pagination }>(
    `/api/attendance/reports/participation${query({ ...filters, all: all ? 1 : undefined })}`,
  );

export const fetchMemberParticipation = (memberId: number) => apiGet<{ success: boolean; data: ParticipationProfile }>(`/api/attendance/members/${memberId}`);

export const fetchMyAttendance = () => apiGet<{ success: boolean; data: ParticipationProfile }>('/api/members/me/attendance');

/** "8:30 AM" from "08:30" (activity times are Manila wall-clock times). */
export function formatClock(value: string | null | undefined) {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? '');
  if (!match) return '';
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
}

export const timeRange = (start: string, end: string) => `${formatClock(start)} – ${formatClock(end)}`;

/** "66.7%", or "N/A" when there was no eligible completed activity. */
export const rateLabel = (rate: number | null | undefined) => (rate === null || rate === undefined ? 'N/A' : `${rate}%`);
