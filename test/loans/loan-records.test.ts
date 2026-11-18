import { describe, expect, test } from 'vitest'
import { mapLoan, mapPayment } from '../../src/app/services/authApi'
import { toNumber } from '../../src/lib/api'

describe('Loan records from the server (mapLoan, mapPayment, toNumber)', () => {
  test('money that arrives as text is turned into numbers', () => {
    const loan = mapLoan({ id: 'L-2026-005', amount: '30000.00', totalAmount: '34500.00', balance: '29500.00', interestRate: '15', totalPaid: '5000.00' })
    expect(loan).toMatchObject({ id: 'L-2026-005', amount: 30000, totalAmount: 34500, balance: 29500, interestRate: 15, totalPaid: 5000 })
  })

  test('a payment\'s amount, principal, interest and balance are numbers', () => {
    expect(mapPayment({ id: 90, amount: '5000.00', principalPaid: '500.00', interestPaid: '4500.00', remainingBalance: '29500.00' }))
      .toMatchObject({ id: 90, amount: 5000, principalPaid: 500, interestPaid: 4500, remainingBalance: 29500 })
  })

  test('missing amounts become 0; missing optional values stay empty (null)', () => {
    const loan = mapLoan({ id: 'L-2026-006' })
    expect(loan).toMatchObject({ amount: 0, balance: 0, nextAmountDue: null, farmArea: null, netProceeds: null })
  })

  test('text that is not a number becomes 0, never NaN', () => {
    expect(toNumber('abc')).toBe(0)
    expect(toNumber(undefined)).toBe(0)
    expect(toNumber('12.5')).toBe(12.5)
  })

  test('edge case: an amount due of zero is kept as 0, not treated as missing', () => {
    expect(mapLoan({ nextAmountDue: '0.00' }).nextAmountDue).toBe(0)
  })
})
