import { describe, expect, test } from 'vitest'
import { formatPeso, sumMoney } from '../../src/utils/money'

describe('Peso amounts on screen (formatPeso, sumMoney)', () => {
  test('amounts are shown with the peso sign, commas and two decimals', () => {
    expect(formatPeso(1234.5)).toBe('₱1,234.50')
    expect(formatPeso(1000000)).toBe('₱1,000,000.00')
  })

  test('totals are added in centavos, without floating-point noise', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(sumMoney([1500.5, 249.75, 0.05])).toBe(1750.3)
  })

  test('missing amounts count as zero', () => {
    expect(formatPeso(null)).toBe('₱0.00')
    expect(formatPeso(undefined)).toBe('₱0.00')
    expect(sumMoney([null, undefined, 100])).toBe(100)
  })

  test('amounts are rounded to the centavo, and withdrawals subtract', () => {
    expect(formatPeso(1234.567)).toBe('₱1,234.57')
    expect(sumMoney([500, -200.25])).toBe(299.75)
  })

  test('edge case: an empty list adds up to zero', () => {
    expect(sumMoney([])).toBe(0)
  })
})
