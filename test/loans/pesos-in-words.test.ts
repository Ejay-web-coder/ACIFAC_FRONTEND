import { describe, expect, test } from 'vitest'
import { pesosInWords } from '../../src/admin/components/loanInvoice'

describe('Amount in words on the loan receipt (pesosInWords)', () => {
  test('writes pesos and centavos the way the paper receipt does', () => {
    expect(pesosInWords(12345.5)).toBe('Twelve Thousand Three Hundred Forty-Five Pesos and 50/100')
    expect(pesosInWords(34500)).toBe('Thirty-Four Thousand Five Hundred Pesos and 00/100')
  })

  test('handles millions and the teens', () => {
    expect(pesosInWords(1_215_019.99)).toBe('One Million Two Hundred Fifteen Thousand Nineteen Pesos and 99/100')
  })

  test('one peso is singular; two or more are plural', () => {
    expect(pesosInWords(1)).toBe('One Peso and 00/100')
    expect(pesosInWords(1.99)).toBe('One Peso and 99/100')
    expect(pesosInWords(2)).toBe('Two Pesos and 00/100')
  })

  test('zero or centavos only are written as zero pesos', () => {
    expect(pesosInWords(0)).toBe('Zero Pesos and 00/100')
    expect(pesosInWords(0.75)).toBe('Zero Pesos and 75/100')
  })

  test('edge case: floating-point amounts are rounded to the centavo first', () => {
    expect(pesosInWords(0.1 + 0.2)).toBe('Zero Pesos and 30/100')
    expect(pesosInWords(100.005)).toBe('One Hundred Pesos and 01/100')
  })
})
