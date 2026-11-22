import { describe, expect, test } from 'vitest'
import { normalizeReference, purposeLabel } from '../../src/app/services/onlinePaymentApi'

// Pay online: what the member and the office see of a GCash or Maya payment.

describe('Reference numbers (normalizeReference)', () => {
  test('spaces, dashes and case do not matter, as on the server', () => {
    expect(normalizeReference('1009 876 543210')).toBe('1009876543210')
    expect(normalizeReference(' mp-26a1 ')).toBe('MP26A1')
  })

  test('edge case: nothing but punctuation is no reference number', () => {
    expect(normalizeReference(' - . ')).toBe('')
  })
})

describe('What a payment is for (purposeLabel)', () => {
  test('a loan by its number, dues by how many, or a savings deposit', () => {
    expect(purposeLabel({ purpose: 'loan', loanNumber: 'L-2026-007', dues: [] })).toBe('Loan L-2026-007')
    const due = { id: 1, kind: 'transfer_fee' as const, amount: 500, dueDate: '2026-11-20', description: 'Transfer fee' }
    expect(purposeLabel({ purpose: 'dues', loanNumber: null, dues: [due, { ...due, id: 2 }] })).toBe('Dues (2)')
    expect(purposeLabel({ purpose: 'savings', loanNumber: null, dues: [] })).toBe('Savings deposit')
  })
})
