import { describe, expect, test } from 'vitest'
import { duesReceipt, loanPaymentReceipt, machineryPaymentReceipt, recorderLine, savingsReceipt } from '../../src/admin/components/receipt/paymentReceipt'
import { inGoodStanding, standingRule } from '../../src/admin/components/loyalty/loyaltyTiers'

const loanPayment = {
  id: 42, loanId: 7, loanNumber: 'L-2026-007', memberName: 'Juan Dela Cruz', memberNumber: 'ACIFAC-2026-001', amount: 5000, paymentDate: '2026-11-20',
  principalPaid: 3300, interestPaid: 500, penaltyPaid: 1200, remainingBalance: 6700, recordedBy: 'Lorna Cruz', recordedByPosition: 'Treasurer',
}

describe('Receipt of one payment (paymentReceipt)', () => {
  test('a loan payment lists the penalty, interest and principal it paid', () => {
    const receipt = loanPaymentReceipt(loanPayment)
    expect(receipt.receiptNo).toBe('LP-000042')
    expect(receipt.lines).toEqual([
      { description: 'Late payment penalty, loan L-2026-007', amount: 1200 },
      { description: 'Interest, loan L-2026-007', amount: 500 },
      { description: 'Principal, loan L-2026-007', amount: 3300 },
    ])
    expect([receipt.total, receipt.balance, receipt.party, receipt.memberNumber, receipt.kind]).toEqual([5000, 6700, 'Juan Dela Cruz', 'ACIFAC-2026-001', 'received'])
    expect(recorderLine(receipt)).toBe('Lorna Cruz, Treasurer')
  })

  test('edge case: a payment whose parts do not add up is one line for the whole amount', () => {
    const receipt = loanPaymentReceipt({ ...loanPayment, principalPaid: 0, interestPaid: 0, penaltyPaid: 0 })
    expect(receipt.lines).toEqual([{ description: 'Loan payment, loan L-2026-007', amount: 5000 }])
  })

  test('a machinery payment shows the fee left after it', () => {
    const service = { clientName: 'Rita Resibo', memberNumber: 'RCPT-001', serviceType: 'Rotavator', machineryName: 'Rotavator w/ Tractor 1', serviceDate: '2026-06-10', feeAmount: 3800 }
    const payments = [
      { id: 2, serviceId: 1, amount: 800, paymentDate: '2026-06-15', notes: '', recordedBy: 'Lorna Cruz' },
      { id: 1, serviceId: 1, amount: 1000, paymentDate: '2026-06-10', notes: 'OR 12', recordedBy: null },
    ]
    expect(machineryPaymentReceipt(service, payments[1], payments).balance).toBe(2800)
    const second = machineryPaymentReceipt(service, payments[0], payments)
    expect([second.receiptNo, second.balance, second.lines[0].description]).toEqual(['MS-000002', 2000, 'Rotavator by Rotavator w/ Tractor 1 on June 10, 2026'])
    expect(recorderLine(machineryPaymentReceipt(service, payments[1], payments))).toBe('')
  })

  test('a savings withdrawal is money paid out to the member', () => {
    const entry = { id: 9, type: 'Withdrawal' as const, amount: 300, balance: 700, date: '2026-11-21', paymentMethod: 'Cash', reference: 'SAV-9', notes: '', recordedBy: 'Lorna Cruz' }
    const receipt = savingsReceipt({ memberName: 'Rita Resibo', memberNumber: 'RCPT-001' }, entry)
    expect([receipt.kind, receipt.title, receipt.receiptNo, receipt.balance]).toEqual(['paid', 'Savings Withdrawal Receipt', 'SW-000009', 700])
    expect(savingsReceipt({ memberName: 'Rita', memberNumber: 'X' }, { ...entry, type: 'Deposit' }).receiptNo).toBe('SD-000009')
  })

  test('a dues payment lists each due it paid', () => {
    const due = (id: number, kind: 'share_capital' | 'savings', amount: number, paymentId: number | null) => ({
      id, memberId: 3, kind, amount, dueDate: '2026-11-07', activityId: 5, activityTitle: 'Monthly Meeting', description: '', status: paymentId ? 'paid' as const : 'unpaid' as const,
      paymentId, paidOn: null, waivedAt: null, waiveReason: null, waivedBy: null,
    })
    const payment = { id: 4, amount: 300, paymentDate: '2026-11-21', paymentMethod: 'Cash', reference: 'OR-7', notes: '', recordedBy: 'Lorna Cruz', duesCount: 2 }
    const receipt = duesReceipt({ name: 'Rita Resibo', memberNumber: 'RCPT-001' }, payment, [due(1, 'share_capital', 250, 4), due(2, 'savings', 50, 4), due(3, 'savings', 50, null)])
    expect(receipt.lines.map((line) => [line.description, line.amount])).toEqual([
      ['Share capital: Monthly Meeting (November 7, 2026)', 250], ['Savings: Monthly Meeting (November 7, 2026)', 50],
    ])
    expect([receipt.receiptNo, receipt.reference]).toEqual(['DP-000004', 'OR-7'])
  })
})

describe('Loyalty awards: good standing (loyaltyTiers)', () => {
  const standing = (goodStanding: boolean) => ({ goodStanding, attendanceRate: 50, attended: 1, eligible: 2, latePayments: 0, overdueLoans: 0, reasons: goodStanding ? [] : ['Attended 1 of 2 activities (50%, 75% needed)'] })
  test('only members in good standing receive the award; an unknown standing does not hold one back', () => {
    expect(inGoodStanding({ standing: standing(true) })).toBe(true)
    expect(inGoodStanding({ standing: standing(false) })).toBe(false)
    expect(inGoodStanding({} as never)).toBe(true)
  })

  test('the rule as the page and the report say it', () => {
    expect(standingRule(75)).toMatch(/^attended at least 75% of the meetings and activities they had to attend, and paid loans on time/)
    expect(standingRule(0)).toBe('paid loans on time (no overdue loan, no late penalty)')
  })
})
