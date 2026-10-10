// Small pieces shared by the office's Attendance page and the members'
// participation section.
import { CheckCircle2, Clock3, Lock, ShieldCheck, XCircle } from 'lucide-react';
import { StatusBadge } from '../common/UiKit';
import { ATTENDANCE_LABELS, type Activity, type AttendanceStatus } from '../../services/attendanceApi';

const ATTENDANCE_STYLE: Record<AttendanceStatus, { className: string; icon: typeof CheckCircle2 }> = {
  present: { className: 'bg-green-50 text-green-800 ring-green-200', icon: CheckCircle2 },
  late: { className: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Clock3 },
  absent: { className: 'bg-red-50 text-red-700 ring-red-200', icon: XCircle },
  excused: { className: 'bg-sky-50 text-sky-800 ring-sky-200', icon: ShieldCheck },
};

/** Present, Late, Absent or Excused as a pill with its icon (never colour alone). */
export function AttendanceBadge({ status, label }: { status: AttendanceStatus; label?: string }) {
  const { className, icon: Icon } = ATTENDANCE_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label ?? ATTENDANCE_LABELS[status]}
    </span>
  );
}

/** The activity status, and whether its attendance is final. */
export function ActivityStatusBadge({ activity }: { activity: Pick<Activity, 'status' | 'final'> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge status={activity.status} />
      {activity.final && <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600"><Lock className="h-3 w-3" aria-hidden="true" />Final</span>}
      {activity.status !== 'cancelled' && !activity.final && activity.status === 'completed' && <span className="text-xs font-medium text-amber-700">Attendance not final</span>}
    </span>
  );
}

export const RATE_RULE = 'Attendance rate = present and late ÷ eligible completed activities whose attendance is final. Excused and absent are counted separately. Cancelled activities, and activities before someone became a member, are not counted.';

/** Saves rows as a CSV file Excel opens correctly (UTF-8 with BOM). Cells
 * that start like a formula are prefixed so they stay plain text. */
export function downloadCsv(fileName: string, rows: Array<Array<string | number | null | undefined>>) {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** An input's look without a width (FIELD fills its column). */
export const FIELD_BOX = 'rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-gray-100 disabled:text-gray-500';
export const FIELD = `w-full ${FIELD_BOX}`;
