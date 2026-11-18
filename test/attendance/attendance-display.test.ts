import { describe, expect, test } from 'vitest'
import { ATTENDANCE_LABELS, formatClock, isAttended, rateLabel, timeRange } from '../../src/app/services/attendanceApi'

describe('Attendance shown in the web application (formatClock, rateLabel, isAttended)', () => {
  test('times are shown on a 12-hour clock', () => {
    expect(formatClock('08:30')).toBe('8:30 AM')
    expect(formatClock('13:05:00')).toBe('1:05 PM')
    expect(timeRange('08:00', '12:00')).toBe('8:00 AM – 12:00 PM')
  })

  test('midnight and noon are 12, not 0', () => {
    expect(formatClock('00:15')).toBe('12:15 AM')
    expect(formatClock('12:00')).toBe('12:00 PM')
  })

  test('a missing or unreadable time shows nothing', () => {
    expect(formatClock(null)).toBe('')
    expect(formatClock('8 AM')).toBe('')
  })

  test('the attendance rate is shown as a percent, or N/A when there is none', () => {
    expect(rateLabel(66.7)).toBe('66.7%')
    expect(rateLabel(0)).toBe('0%')
    expect(rateLabel(null)).toBe('N/A')
  })

  test('edge case: only present and late count as attended', () => {
    expect(['present', 'late', 'absent', 'excused', null].map((status) => isAttended(status as never))).toEqual([true, true, false, false, false])
    expect(Object.keys(ATTENDANCE_LABELS)).toEqual(['present', 'late', 'absent', 'excused'])
  })
})
