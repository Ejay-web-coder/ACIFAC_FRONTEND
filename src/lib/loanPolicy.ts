// ACIFAC loan interest (the backend's LOAN_POLICY does the arithmetic): 2.5% of
// the principal for every month of the 6-month term, flat, so 15% in all. The
// whole amount is due at the end of the term and may be paid in parts before.
// A loan's interestRate is its rate for the whole term; loans made before
// November 2026 were charged 2.5% once for the term and keep that rate.
export const MONTHLY_INTEREST_RATE = 2.5;
export const LOAN_TERM_MONTHS = 6;
export const POLICY_INTEREST_RATE = MONTHLY_INTEREST_RATE * LOAN_TERM_MONTHS;

/** "2.5% a month × 6 months (15%)" for a loan under the current policy, else "2.5% flat (whole term)". */
export function interestRateLabel(rate: number | null | undefined, term: number | null | undefined = LOAN_TERM_MONTHS): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '';
  if (rate === POLICY_INTEREST_RATE && term === LOAN_TERM_MONTHS) return `${MONTHLY_INTEREST_RATE}% a month × ${LOAN_TERM_MONTHS} months (${rate}%)`;
  return `${rate}% flat (whole term)`;
}
