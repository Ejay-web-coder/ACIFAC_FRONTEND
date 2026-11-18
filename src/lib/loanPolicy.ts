// ACIFAC loan interest (the backend's LOAN_POLICY does the arithmetic): 2.5% of
// the principal for every month of the 6-month term, flat, so 15% in all. The
// whole amount is due at the end of the term and may be paid in parts before.
// A loan's interestRate is its rate for the whole term; loans made before
// November 2026 were charged 2.5% once for the term and keep that rate.
export const MONTHLY_INTEREST_RATE = 2.5;
export const LOAN_TERM_MONTHS = 6;
export const POLICY_INTEREST_RATE = MONTHLY_INTEREST_RATE * LOAN_TERM_MONTHS;

// Late payment: after the due date there is a grace period of 5 days; from
// then on ₱100 is added for every day until the loan is paid in full. A payment
// pays the penalty first, then interest, then principal. Each loan carries its
// own terms (penaltyPerDay, graceDays); the older monthly loans have none.
export const GRACE_PERIOD_DAYS = 5;
export const PENALTY_PER_DAY = 100;
export const LATE_PENALTY_RULE = `Pay within the ${LOAN_TERM_MONTHS}-month term. After the due date there is a ${GRACE_PERIOD_DAYS}-day grace period; from then on a ₱${PENALTY_PER_DAY} penalty is added for each day until the loan is paid in full.`;

/** "2.5% a month × 6 months (15%)" for a loan under the current policy, else "2.5% flat (whole term)". */
export function interestRateLabel(rate: number | null | undefined, term: number | null | undefined = LOAN_TERM_MONTHS): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '';
  if (rate === POLICY_INTEREST_RATE && term === LOAN_TERM_MONTHS) return `${MONTHLY_INTEREST_RATE}% a month × ${LOAN_TERM_MONTHS} months (${rate}%)`;
  return `${rate}% flat (whole term)`;
}

const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86400000;

/** What a loan needs for its late penalty: its terms, when its grace period ends, and what was paid of the penalty. */
export interface PenaltyTerms {
  status: string;
  penaltyPerDay?: number;
  graceEndsOn?: string | null;
  penaltyPaid?: number;
}

/**
 * The late penalty of an open loan on `date` (YYYY-MM-DD), as the server works
 * it out: the days past the grace period times the penalty a day, less what was
 * already paid of it. Used to preview a payment on another date; the server's
 * figures (penaltyDue, penaltyDays) are the ones that count.
 */
export function penaltyOn(loan: PenaltyTerms, date: string): { days: number; due: number } {
  const perDayCents = Math.round((loan.penaltyPerDay ?? 0) * 100);
  if (loan.status === 'paid' || perDayCents <= 0 || !loan.graceEndsOn || !/^\d{4}-\d{2}-\d{2}/.test(date)) return { days: 0, due: 0 };
  const days = Math.max(0, Math.round(dayNumber(date) - dayNumber(loan.graceEndsOn)));
  return { days, due: Math.max(0, days * perDayCents - Math.round((loan.penaltyPaid ?? 0) * 100)) / 100 };
}

/** Splits a payment as the server does: the penalty due first, then the balance (interest and principal). */
export function splitPayment(amount: number, penaltyDue: number, balance: number) {
  const amountCents = Math.max(0, Math.round(amount * 100));
  const penaltyCents = Math.min(amountCents, Math.round(penaltyDue * 100));
  const loanCents = amountCents - penaltyCents;
  return { penalty: penaltyCents / 100, loan: loanCents / 100, newBalance: Math.max(0, Math.round(balance * 100) - loanCents) / 100 };
}
