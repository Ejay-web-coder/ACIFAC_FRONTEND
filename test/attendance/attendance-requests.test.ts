// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cancelActivity, createActivity, fetchActivities, finalizeAttendance, saveAttendance } from '../../src/app/services/attendanceApi'
import { jsonResponse, mockFetch, requestOf } from '../helpers/fetch'

afterEach(() => vi.unstubAllGlobals())

describe('Attendance requests to the server (attendanceApi)', () => {
  test('saves the attendance marked on the sheet', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { success: true, message: 'Attendance saved.', data: { added: 2, updated: 0, unchanged: 0 } }))
    const records = [{ memberId: 3, status: 'present', checkInTime: '07:55' }, { memberId: 4, status: 'late', checkInTime: '08:20' }]
    await expect(saveAttendance(12, records as never)).resolves.toMatchObject({ data: { added: 2 } })
    expect(requestOf(fetchMock)).toMatchObject({ url: '/api/attendance/activities/12/attendance', method: 'PUT', body: { records } })
  })

  test('the server\'s reason is shown when attendance cannot be saved', async () => {
    mockFetch(jsonResponse(400, { message: 'Row 1: choose present, late, absent or excused.' }))
    await expect(saveAttendance(12, [{ memberId: 3, status: 'sleeping' }] as never)).rejects.toMatchObject({ status: 400, message: 'Row 1: choose present, late, absent or excused.' })
  })

  test('filters are sent in the address; blank ones are left out', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { success: true, data: [], pagination: {} }))
    await fetchActivities({ status: '', search: 'assembly', page: 2 } as never)
    expect(requestOf(fetchMock).url).toBe('/api/attendance/activities?search=assembly&page=2')
  })

  test('creating, cancelling and finalizing use their own endpoints', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { success: true }))
    await createActivity({ title: 'General Assembly' } as never)
    await cancelActivity(12, 'Typhoon signal no. 2')
    await finalizeAttendance(12)
    expect([0, 1, 2].map((index) => { const { url, method } = requestOf(fetchMock, index); return `${method} ${url}` })).toEqual([
      'POST /api/attendance/activities', 'PATCH /api/attendance/activities/12/cancel', 'POST /api/attendance/activities/12/finalize',
    ])
    expect(requestOf(fetchMock, 1).body).toEqual({ reason: 'Typhoon signal no. 2' })
  })

  test('edge case: an activity that was already finalized cannot be saved again', async () => {
    mockFetch(jsonResponse(409, { message: 'Attendance for this activity is final.' }))
    await expect(finalizeAttendance(12)).rejects.toMatchObject({ status: 409 })
  })
})
