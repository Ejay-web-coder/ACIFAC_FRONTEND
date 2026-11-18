import { describe, expect, test } from 'vitest'
import { amountText, areaText, deliveryText, fileBaseName, machineTitle, monthsText, priceText, slashDate, STATUS_TEXT } from '../../src/admin/components/machinery/philmechExport'
import type { PhilmechReport, ReportMachine } from '../../src/app/services/machineryApi'

const report = (changes: Partial<PhilmechReport> = {}) => ({ year: 2026, croppingPeriod: '1st', fromMonth: 1, toMonth: 7, ...changes }) as PhilmechReport

describe('PhilMech report export (amountText, slashDate, monthsText)', () => {
  test('amounts and areas are written as on the paper form', () => {
    expect(amountText(18500)).toBe('18,500.00')
    expect(areaText(5)).toBe('5')
    expect(areaText(1.5)).toBe('1.5')
  })

  test('dates are written m/d/yyyy, and delivery dates m-dd-yy', () => {
    expect(slashDate('2026-06-10')).toBe('6/10/2026')
    expect(deliveryText('2025-02-21')).toBe('2-21-25')
  })

  test('the report months are named, or one month alone', () => {
    expect(monthsText(report())).toBe('January to July')
    expect(monthsText(report({ fromMonth: 3, toMonth: 3 }))).toBe('March')
    expect(monthsText(report({ fromMonth: null, toMonth: null } as never))).toBe('January to December')
  })

  test('blank or unreadable prices and dates are left blank', () => {
    expect(priceText('')).toBe('')
    expect(priceText('abc')).toBe('')
    expect(priceText('18.5')).toBe('18.50')
    expect(slashDate(null)).toBe('')
  })

  test('edge case: machine titles, statuses and the file name follow the paper report', () => {
    expect(machineTitle({ name: 'Tractor with Rotavator' } as ReportMachine, 1)).toBe('2. TRACTOR WITH ROTAVATOR')
    expect(STATUS_TEXT.always_repair).toBe('ALWAYS REPAIR')
    expect(fileBaseName(report())).toBe('philmech-report-2026-1st-cropping')
  })
})
