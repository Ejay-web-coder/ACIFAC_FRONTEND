import { describe, expect, test } from 'vitest'
import { interestRateLabel, LOAN_TERM_MONTHS, MONTHLY_INTEREST_RATE, POLICY_INTEREST_RATE } from '../../src/lib/loanPolicy'

describe('Loan interest shown to members (interestRateLabel)', () => {
  test('the policy is 2.5% a month for 6 months, 15% in all', () => {
    expect([MONTHLY_INTEREST_RATE, LOAN_TERM_MONTHS, POLICY_INTEREST_RATE]).toEqual([2.5, 6, 15])
  })

  test('a loan under the current policy shows the monthly rate and the total', () => {
    expect(interestRateLabel(15, 6)).toBe('2.5% a month × 6 months (15%)')
    expect(interestRateLabel(15)).toBe('2.5% a month × 6 months (15%)')
  })

  test('an older loan shows its flat rate for the whole term', () => {
    expect(interestRateLabel(2.5, 6)).toBe('2.5% flat (whole term)')
    expect(interestRateLabel(8, 12)).toBe('8% flat (whole term)')
  })

  test('a loan without a rate shows nothing', () => {
    expect(interestRateLabel(null)).toBe('')
    expect(interestRateLabel(undefined)).toBe('')
    expect(interestRateLabel(Number.NaN)).toBe('')
  })

  test('edge case: 15% over a term other than 6 months is shown as flat', () => {
    expect(interestRateLabel(15, 12)).toBe('15% flat (whole term)')
  })
})
