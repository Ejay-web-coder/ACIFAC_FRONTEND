import { describe, expect, test } from 'vitest'
import { DEDUCTIONS_RULE, FIRST_LOAN_YEAR_HECTARES, inFirstLoanYear, loanRelease, MAX_LOAN_PER_HECTARE } from '../../src/lib/loanPolicy'
import { mapLoan } from '../../src/app/services/authApi'

describe('Deductions from the loan proceeds shown before release (loanRelease)', () => {
  test('a PHP 50,000 cash loan: PHP 500 savings, PHP 1,000 Capital Build-Up, PHP 50 PCIC; PHP 48,450 in cash', () => {
    expect(loanRelease(50000)).toEqual({ savings: 500, capitalBuildUp: 1000, pcicInsurance: 50, total: 1550, cashReleased: 48450, paidAtRelease: 0 })
  })

  test('over PHP 50,000 the savings is PHP 1,000', () => {
    expect(loanRelease(50000.01).savings).toBe(1000)
    expect(loanRelease(100000)).toMatchObject({ savings: 1000, capitalBuildUp: 2000, total: 3050, cashReleased: 96950 })
  })

  test('farm inputs are not cash: an in-kind loan pays the deductions at release', () => {
    expect(loanRelease(20000, 20000)).toMatchObject({ total: 950, cashReleased: 0, paidAtRelease: 950 })
    expect(loanRelease(30000, 29500)).toMatchObject({ total: 1150, cashReleased: 0, paidAtRelease: 650 })
  })

  test('a restructured loan\'s balance comes off before the deductions', () => {
    expect(loanRelease(60000, 0, 30000)).toMatchObject({ total: 2250, cashReleased: 27750, paidAtRelease: 0 })
  })

  test('edge case: the 2% is rounded to the centavo as the server does', () => {
    expect(loanRelease(12345.67).capitalBuildUp).toBe(246.91)
  })

  test('the rule is written out for the forms', () => {
    expect(DEDUCTIONS_RULE).toBe('Taken from the proceeds: ₱500 savings (₱1,000 for a loan over ₱50,000), 2% Capital Build-Up and ₱50 PCIC life insurance.')
  })
})

describe('The first year of loans (inFirstLoanYear)', () => {
  test('a member without a loan, or within 12 months of the first one, may borrow for 2 hectares', () => {
    expect(inFirstLoanYear(null, '2026-11-22')).toBe(true)
    expect(inFirstLoanYear('2027-01-15', '2027-01-14')).toBe(true)
    expect(inFirstLoanYear('2027-01-15', '2027-01-15')).toBe(false)
    expect(FIRST_LOAN_YEAR_HECTARES * MAX_LOAN_PER_HECTARE).toBe(100000)
  })
})

describe('Deductions on a loan from the server (mapLoan)', () => {
  test('amounts become numbers; a loan released before deductions has none', () => {
    const loan = mapLoan({ amount: '50000.00', balance: '57500.00', savingsDeducted: '500.00', capitalBuildUp: '1000.00', capitalBuildUpToSavings: '0.00', pcicInsurance: '50.00', cashReleased: '48450.00', paidAtRelease: '0.00' })
    expect([loan.savingsDeducted, loan.capitalBuildUp, loan.pcicInsurance, loan.cashReleased, loan.paidAtRelease]).toEqual([500, 1000, 50, 48450, 0])
    const older = mapLoan({ amount: '30000.00', balance: '0.00', savingsDeducted: null })
    expect([older.savingsDeducted, older.cashReleased]).toEqual([null, null])
  })
})
