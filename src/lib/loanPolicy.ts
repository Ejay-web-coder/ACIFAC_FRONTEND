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

// Loan policy (Polisiya sa Pagpapautang, ALERT-ARBOs), as the backend applies it
// (services/loanDeductions.js; the server's figures are the ones that count):
//  - in a member's first year of loans, counted 12 months from their first
//    loan, a loan covers at most 2 hectares (₱100,000 at ₱50,000 a hectare);
//  - taken from the proceeds at release: ₱500 savings for a loan of ₱50,000 or
//    less, ₱1,000 above; 2% Capital Build-Up (share capital up to the member's
//    10% limit, the rest savings); ₱50 PCIC life insurance. They come out of
//    the cash part; what it cannot cover is paid at the office at release.
export const MAX_LOAN_PER_HECTARE = 50000;
export const FIRST_LOAN_YEAR_HECTARES = 2;
export const SAVINGS_DEDUCTION_UP_TO = 50000;
export const SAVINGS_DEDUCTION_SMALL = 500;
export const SAVINGS_DEDUCTION_LARGE = 1000;
export const CAPITAL_BUILD_UP_PERCENT = 2;
export const PCIC_INSURANCE = 50;
export const DEDUCTIONS_RULE = `Taken from the proceeds: ₱${SAVINGS_DEDUCTION_SMALL} savings (₱${SAVINGS_DEDUCTION_LARGE.toLocaleString('en-PH')} for a loan over ₱${SAVINGS_DEDUCTION_UP_TO.toLocaleString('en-PH')}), ${CAPITAL_BUILD_UP_PERCENT}% Capital Build-Up and ₱${PCIC_INSURANCE} PCIC life insurance.`;

export interface LoanRelease {
  savings: number;
  capitalBuildUp: number;
  pcicInsurance: number;
  total: number;
  /** The cash the borrower receives, and what the cash part cannot cover (paid at release). */
  cashReleased: number;
  paidAtRelease: number;
}

/** The release of a loan of `amount` (pesos) with `inKind` of farm inputs, after `carried` paid off a restructured loan. */
export function loanRelease(amount: number, inKind = 0, carried = 0): LoanRelease {
  const amountCents = Math.max(0, Math.round(amount * 100));
  const savingsCents = (amountCents <= SAVINGS_DEDUCTION_UP_TO * 100 ? SAVINGS_DEDUCTION_SMALL : SAVINGS_DEDUCTION_LARGE) * 100;
  const capitalBuildUpCents = Math.round((amountCents * CAPITAL_BUILD_UP_PERCENT) / 100);
  const pcicCents = PCIC_INSURANCE * 100;
  const totalCents = savingsCents + capitalBuildUpCents + pcicCents;
  const availableCents = Math.max(0, amountCents - Math.round(inKind * 100) - Math.round(carried * 100));
  const fromProceedsCents = Math.min(totalCents, availableCents);
  return {
    savings: savingsCents / 100, capitalBuildUp: capitalBuildUpCents / 100, pcicInsurance: pcicCents / 100, total: totalCents / 100,
    cashReleased: (availableCents - fromProceedsCents) / 100, paidAtRelease: (totalCents - fromProceedsCents) / 100,
  };
}

/** Whether `today` (YYYY-MM-DD) is in the member's first year of loans, which ends on `endsOn` (null: no loan yet). */
export const inFirstLoanYear = (endsOn: string | null | undefined, today: string) => !endsOn || today < endsOn;

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
