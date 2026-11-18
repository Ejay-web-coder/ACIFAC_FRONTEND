import { describe, expect, test } from 'vitest'
import { addDateOnlyDays, dateOnlySortValue, dateOnlyToday, formatDate, formatDateTime, formatTime, isDateOnly } from '../../src/utils/dateTime'

describe('Dates and times in Manila time (dateTime)', () => {
  test('a calendar date is written in words and never shifted by time zones', () => {
    expect(formatDate('2026-11-11')).toBe('November 11, 2026')
    expect(formatDate('2026-11-11', true)).toBe('Nov 11, 2026')
  })

  test('server times are shown in Manila time', () => {
    expect(formatDate('2026-11-10T20:00:00Z')).toBe('November 11, 2026')
    expect(formatTime('2026-11-11 08:05:00')).toBe('8:05 AM')
    expect(formatDateTime('2026-11-11T05:30:15Z')).toBe('November 11, 2026 at 1:30:15 PM')
  })

  test('"today" follows the Manila date, even late at night UTC', () => {
    expect(dateOnlyToday(new Date('2026-11-10T16:30:00Z'))).toBe('2026-11-11')
  })

  test('missing or unreadable dates show nothing', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('not a date')).toBe('')
    expect(formatTime(undefined)).toBe('')
    expect(Number.isNaN(dateOnlySortValue('11/11/2026'))).toBe(true)
  })

  test('edge case: adding days crosses months and leap days correctly', () => {
    expect(addDateOnlyDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDateOnlyDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDateOnlyDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(isDateOnly('2026-11-11')).toBe(true)
  })
})
