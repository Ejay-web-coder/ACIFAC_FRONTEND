import type { ReactNode } from 'react';
import { AlertTriangle, CalendarClock, Info } from 'lucide-react';
import { addDateOnlyDays, formatDate } from '../../utils/dateTime';
import { formatPeso } from '../../utils/money';

/** What the notice reads of a loan (the server's figures, see AdminLoan). */
export interface PenaltyLoan {
  status: string;
  dueDate: string;
  penaltyPerDay: number;
  graceDays: number;
  graceEndsOn: string | null;
  penaltyDays: number;
  penaltyDue: number;
  penaltyPaid: number;
  amountDueNow: number;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * The late penalty of a loan, for the office and the member alike: before the
 * due date, the rule; past it, the grace period's last day; after that, the
 * penalty run up and the amount that settles the loan today. A paid loan shows
 * the penalty it paid, if any. Nothing for loans without a penalty.
 */
export function LatePenaltyNotice({ loan, className = '' }: { loan: PenaltyLoan; className?: string }) {
  if (!(loan.penaltyPerDay > 0) || !loan.graceEndsOn) return null;
  const perDay = formatPeso(loan.penaltyPerDay);
  const box = (tone: string, Icon: typeof Info, body: ReactNode) => (
    <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ring-1 ${tone} ${className}`} role={tone.includes('red') ? 'alert' : undefined}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{body}</div>
    </div>
  );

  if (loan.status === 'paid') {
    return loan.penaltyPaid > 0 ? box('bg-gray-50 text-gray-700 ring-gray-200', Info, <p>Late penalty paid: <span className="font-semibold tabular-nums">{formatPeso(loan.penaltyPaid)}</span>.</p>) : null;
  }
  if (loan.penaltyDays > 0) {
    return box('bg-red-50 text-red-800 ring-red-100', AlertTriangle, <>
      <p className="font-semibold">Late penalty: <span className="tabular-nums">{formatPeso(loan.penaltyDue)}</span> due</p>
      <p className="mt-0.5">
        {plural(loan.penaltyDays, 'day')} past the {loan.graceDays}-day grace period, which ended on {formatDate(loan.graceEndsOn)}, at {perDay} a day
        {loan.penaltyPaid > 0 ? `; ${formatPeso(loan.penaltyPaid)} of it already paid` : ''}. {perDay} more is added each day until the loan is paid in full.
      </p>
      <p className="mt-1 font-semibold">Amount due now: <span className="tabular-nums">{formatPeso(loan.amountDueNow)}</span> <span className="font-normal">(balance and penalty; a payment pays the penalty first)</span></p>
    </>);
  }
  if (loan.status === 'overdue') {
    return box('bg-amber-50 text-amber-900 ring-amber-200', CalendarClock, <p>
      <span className="font-semibold">Grace period:</span> pay by {formatDate(loan.graceEndsOn)} to avoid the late penalty. From {formatDate(addDateOnlyDays(loan.graceEndsOn, 1))}, {perDay} is added for each day until the loan is paid in full.
    </p>);
  }
  return box('bg-blue-50 text-blue-900 ring-blue-100', Info, <p>
    Due by {formatDate(loan.dueDate)}. After a {loan.graceDays}-day grace period (until {formatDate(loan.graceEndsOn)}), a late penalty of {perDay} is added for each day until the loan is paid in full.
  </p>);
}
