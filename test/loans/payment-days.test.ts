import { describe, expect, test } from 'vitest'
import { isoWeekday, isPaymentDay, officeOpenAt, type PaymentHours, weekdayName } from '../../src/app/services/authApi'

// Monday to Friday, 8:00 AM to 5:00 PM (minutes after midnight).
const hours: PaymentHours = { days: [1, 2, 3, 4, 5], open: 8 * 60, close: 17 * 60, label: 'Monday to Friday, 8:00 AM to 5:00 PM', openNow: false }
const manila = (time: string) => new Date(`${time}+08:00`)

describe('Loan payment days and office hours (isPaymentDay, officeOpenAt)', () => {
  test('dates are given their day of the week', () => {
    expect(isoWeekday('2026-11-11')).toBe(3)
    expect(weekdayName('2026-11-11')).toBe('Wednesday')
    expect(weekdayName('2026-11-15')).toBe('Sunday')
  })

  test('weekdays are payment days; weekends are not', () => {
    expect(isPaymentDay(hours, '2026-11-13')).toBe(true)
    expect(isPaymentDay(hours, '2026-11-14')).toBe(false)
  })

  test('the office is open on a weekday morning in Manila', () => {
    expect(officeOpenAt(hours, manila('2026-11-11T10:00:00'))).toBe(true)
  })

  test('the office is closed in the evening and on Saturday', () => {
    expect(officeOpenAt(hours, manila('2026-11-11T17:30:00'))).toBe(false)
    expect(officeOpenAt(hours, manila('2026-11-14T10:00:00'))).toBe(false)
  })

  test('edge case: open from 8:00 exactly, closed from 5:00 PM exactly', () => {
    expect(officeOpenAt(hours, manila('2026-11-11T08:00:00'))).toBe(true)
    expect(officeOpenAt(hours, manila('2026-11-11T07:59:00'))).toBe(false)
    expect(officeOpenAt(hours, manila('2026-11-11T17:00:00'))).toBe(false)
  })
})
