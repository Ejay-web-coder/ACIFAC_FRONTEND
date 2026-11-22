import { DEDUCTIONS_RULE, type LoanRelease } from '../../lib/loanPolicy';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * What the loan policy takes from a loan's proceeds (savings, 2% Capital
 * Build-Up, PCIC insurance) and the cash the borrower receives, line by line:
 * the loan, less its farm inputs and what a restructured loan still owed, less
 * the deductions. What the cash part cannot cover is paid at release.
 * `preview`: before the loan is released (the server's figures count).
 * `you`: written to the member.
 */
export function LoanProceeds({ amount, release, inKind = 0, carried = 0, toSavings = 0, preview = false, you = false }: {
  amount: number;
  release: LoanRelease;
  /** Farm inputs given in kind (not cash). */
  inKind?: number;
  /** What a restructured loan still owed, paid off from the proceeds. */
  carried?: number;
  /** The part of the Capital Build-Up that went to savings, over the 10% share capital limit. */
  toSavings?: number;
  preview?: boolean;
  you?: boolean;
}) {
  const rows: Array<[string, string, string?]> = [
    ['Loan amount', peso(amount)],
    ...(inKind > 0 ? [['Farm inputs (given in kind)', `− ${peso(inKind)}`] as [string, string]] : []),
    ...(carried > 0 ? [['Still owed on the restructured loan', `− ${peso(carried)}`] as [string, string]] : []),
    ['Savings', `− ${peso(release.savings)}`],
    ['Capital Build-Up (2%)', `− ${peso(release.capitalBuildUp)}`, toSavings > 0 ? `${peso(toSavings)} of it went to savings: over the 10% share capital limit` : undefined],
    ['PCIC life insurance', `− ${peso(release.pcicInsurance)}`],
  ];
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-800">{preview ? 'Taken from the proceeds at release' : 'Taken from the proceeds'}</p>
      <dl className="mt-1.5 space-y-0.5">
        {rows.map(([label, value, note]) => (
          <div key={label}>
            <div className="flex justify-between gap-3"><dt>{label}</dt><dd className="tabular-nums">{value}</dd></div>
            {note && <p className="text-xs text-amber-800">{note}</p>}
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-amber-200 pt-1 font-bold"><dt>{you ? 'Cash you receive' : 'Cash the borrower receives'}</dt><dd className="tabular-nums">{peso(release.cashReleased)}</dd></div>
        {release.paidAtRelease > 0 && (
          <div className="flex justify-between gap-3 font-semibold text-red-700">
            <dt>{you ? 'You pay at the office at release' : 'Borrower pays at the office at release'}</dt><dd className="tabular-nums">{peso(release.paidAtRelease)}</dd>
          </div>
        )}
      </dl>
      {release.paidAtRelease > 0 && <p className="mt-1 text-xs text-amber-900">The cash part of the loan does not cover all of the deductions{inKind > 0 ? ' (farm inputs are not cash)' : ''}.</p>}
      {preview && <p className="mt-1 text-xs text-amber-900">{DEDUCTIONS_RULE}</p>}
    </div>
  );
}

interface RecordedLoan {
  amount: number;
  savingsDeducted: number | null; capitalBuildUp: number | null; capitalBuildUpToSavings: number | null;
  pcicInsurance: number | null; cashReleased: number | null; paidAtRelease: number | null;
  /** A restructuring's new loan: what was left after the old loan's balance and penalty. */
  renewedFromLoan?: string | null; netProceeds?: number | null;
}

/**
 * A released loan's proceeds as the server recorded them; nothing for a loan
 * released before deductions were taken. The farm inputs and what a
 * restructured loan still owed are what the recorded figures leave over.
 */
export function RecordedLoanProceeds({ loan, you = false }: { loan: RecordedLoan; you?: boolean }) {
  const release = recordedRelease(loan);
  if (!release) return null;
  const cents = (value: number) => Math.round(value * 100);
  const carried = loan.renewedFromLoan && loan.netProceeds !== null && loan.netProceeds !== undefined ? Math.max(0, cents(loan.amount) - cents(loan.netProceeds)) / 100 : 0;
  const fromProceeds = cents(release.total) - cents(release.paidAtRelease);
  const inKind = Math.max(0, cents(loan.amount) - cents(carried) - cents(release.cashReleased) - fromProceeds) / 100;
  return <LoanProceeds amount={loan.amount} release={release} inKind={inKind} carried={carried} toSavings={loan.capitalBuildUpToSavings ?? 0} you={you} />;
}

/** The release of a loan as the server recorded it, or null for a loan released before deductions were taken. */
export function recordedRelease(loan: {
  savingsDeducted: number | null; capitalBuildUp: number | null; pcicInsurance: number | null; cashReleased: number | null; paidAtRelease: number | null;
}): LoanRelease | null {
  if (loan.savingsDeducted === null || loan.capitalBuildUp === null || loan.pcicInsurance === null) return null;
  return {
    savings: loan.savingsDeducted, capitalBuildUp: loan.capitalBuildUp, pcicInsurance: loan.pcicInsurance,
    total: loan.savingsDeducted + loan.capitalBuildUp + loan.pcicInsurance, cashReleased: loan.cashReleased ?? 0, paidAtRelease: loan.paidAtRelease ?? 0,
  };
}
