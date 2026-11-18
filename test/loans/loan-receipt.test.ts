import { describe, expect, test } from 'vitest'
import { buildLoanInvoice, INVOICE_HEADER } from '../../src/admin/components/loanInvoice'
import type { AdminLoan, AdminPayment } from '../../src/app/services/authApi'

const loan = { id: 'L-2026-005', loanType: 'agricultural', amount: 30000, totalAmount: 34500, interestRate: 15, term: 6, totalPaid: 34500, memberName: 'Juan Dela Cruz' } as AdminLoan
const payment = (paymentDate: string, recordedBy: string) => ({ paymentDate, recordedBy, amount: 0 }) as unknown as AdminPayment

describe('Receipt of a fully paid loan (buildLoanInvoice)', () => {
  test('lists the principal and the interest with the policy rate', () => {
    expect(buildLoanInvoice(loan, [payment('2026-11-02', 'treasurer')]).lines).toEqual([
      { description: 'Agricultural loan principal (Loan L-2026-005)', qty: 1, unitPrice: 30000, amount: 30000 },
      { description: 'Interest, 2.5% a month × 6 months (15%)', qty: 1, unitPrice: 4500, amount: 4500 },
    ])
  })

  test('is dated on the last payment and signed by who recorded it', () => {
    const invoice = buildLoanInvoice(loan, [payment('2026-11-02', 'treasurer'), payment('2026-08-15', 'secretary')])
    expect(invoice).toMatchObject({ invoiceNo: 'L-2026-005', date: '2026-11-02', soldTo: 'Juan Dela Cruz', cashier: 'treasurer', totalSales: 34500, totalDue: 34500 })
  })

  test('the amount received is written in words', () => {
    expect(buildLoanInvoice(loan, [payment('2026-11-02', 'treasurer')])).toMatchObject({ amountReceived: 34500, amountInWords: 'Thirty-Four Thousand Five Hundred Pesos and 00/100' })
  })

  test('without payments on record, the total is shown as received, with no cashier', () => {
    const invoice = buildLoanInvoice({ ...loan, totalPaid: 0 }, [])
    expect(invoice).toMatchObject({ amountReceived: 34500, cashier: '' })
    expect(invoice.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('edge case: the cooperative\'s header matches the paper invoice', () => {
    expect(INVOICE_HEADER).toEqual({ name: 'Amnay Cabagan Irrigators and Farmers Agriculture Cooperative', address: 'Barahan, Sta. Cruz, Occidental Mindoro', tin: 'NON-VAT Reg. TIN: 755-035-236-00000' })
  })
})
