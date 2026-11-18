import { describe, expect, test } from 'vitest'
import { GRACE_PERIOD_DAYS, LATE_PENALTY_RULE, PENALTY_PER_DAY, penaltyOn, splitPayment } from '../../src/lib/loanPolicy'
import { mapLoan, mapPayment, type AdminLoan, type AdminPayment } from '../../src/app/services/authApi'
import { buildLoanInvoice } from '../../src/admin/components/loanInvoice'

// Due May 4, 2026: the 5-day grace period ends May 9; the penalty runs from May 10.
const overdue = { status: 'overdue', penaltyPerDay: 100, graceEndsOn: '2026-05-09', penaltyPaid: 0 }

describe('Late payment penalty (penaltyOn, splitPayment)', () => {
  test('the rule: a 5-day grace period after the due date, then PHP 100 a day', () => {
    expect([GRACE_PERIOD_DAYS, PENALTY_PER_DAY]).toEqual([5, 100])
    expect(LATE_PENALTY_RULE).toBe('Pay within the 6-month term. After the due date there is a 5-day grace period; from then on a ₱100 penalty is added for each day until the loan is paid in full.')
  })

  test('nothing during the grace period; PHP 100 for each day after it', () => {
    expect(penaltyOn(overdue, '2026-05-09')).toEqual({ days: 0, due: 0 })
    expect(penaltyOn(overdue, '2026-05-10')).toEqual({ days: 1, due: 100 })
    expect(penaltyOn(overdue, '2026-05-21')).toEqual({ days: 12, due: 1200 })
  })

  test('what was already paid of the penalty is taken off', () => {
    expect(penaltyOn({ ...overdue, penaltyPaid: 1200 }, '2026-05-22')).toEqual({ days: 13, due: 100 })
  })

  test('a paid loan, or one without a penalty (the older monthly loans), owes none', () => {
    expect(penaltyOn({ ...overdue, status: 'paid' }, '2026-06-30').due).toBe(0)
    expect(penaltyOn({ ...overdue, penaltyPerDay: 0, graceEndsOn: null }, '2026-06-30').due).toBe(0)
  })

  test('a payment pays the penalty first, then the balance', () => {
    expect(splitPayment(5000, 1200, 34500)).toEqual({ penalty: 1200, loan: 3800, newBalance: 30700 })
    expect(splitPayment(500, 1200, 34500)).toEqual({ penalty: 500, loan: 0, newBalance: 34500 })
    expect(splitPayment(35700, 1200, 34500)).toEqual({ penalty: 1200, loan: 34500, newBalance: 0 })
  })

  test('edge case: centavos stay exact', () => {
    expect(splitPayment(0.3, 0.1, 0.2)).toEqual({ penalty: 0.1, loan: 0.2, newBalance: 0 })
  })
})

describe('Penalty figures from the server and on the receipt (mapLoan, mapPayment, buildLoanInvoice)', () => {
  test('the penalty figures that arrive as text become numbers', () => {
    const loan = mapLoan({ balance: '6700.00', penaltyPerDay: '100.00', graceDays: 5, graceEndsOn: '2026-05-09', penaltyDays: 12, penaltyDue: '1200.00', penaltyPaid: '0.00', amountDueNow: '7900.00' })
    expect(loan).toMatchObject({ penaltyPerDay: 100, graceDays: 5, graceEndsOn: '2026-05-09', penaltyDays: 12, penaltyDue: 1200, penaltyPaid: 0, amountDueNow: 7900 })
    expect(mapPayment({ amount: '5000.00', penaltyPaid: '1200.00' }).penaltyPaid).toBe(1200)
  })

  test('without penalty figures (an older server), the amount due now is the balance', () => {
    expect(mapLoan({ balance: '6700.00' })).toMatchObject({ penaltyDue: 0, graceEndsOn: null, amountDueNow: 6700 })
  })

  test('a penalty paid is its own line on the receipt and counts in the amount received', () => {
    const loan = { id: 'L-2026-005', loanType: 'agricultural', amount: 30000, totalAmount: 34500, interestRate: 15, term: 6, totalPaid: 34500, penaltyPaid: 1200, memberName: 'Juan Dela Cruz' } as AdminLoan
    const invoice = buildLoanInvoice(loan, [{ paymentDate: '2026-05-21', recordedBy: 'treasurer', amount: 0 } as unknown as AdminPayment])
    expect(invoice.lines.at(-1)).toEqual({ description: 'Late payment penalty', qty: 1, unitPrice: 1200, amount: 1200 })
    expect(invoice).toMatchObject({ totalSales: 35700, totalDue: 35700, amountReceived: 35700 })
  })
})
