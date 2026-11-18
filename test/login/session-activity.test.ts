// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { jsonResponse, mockFetch, requestOf } from '../helpers/fetch'

// The module reads the clock when it loads, so each test loads it fresh with a fake clock.
const page = window
async function loadAt(time: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(time))
  vi.resetModules()
  return { activity: await import('../../src/lib/sessionActivity'), api: await import('../../src/lib/api') }
}
const wait = (ms: number) => vi.setSystemTime(Date.now() + ms)
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Session inactivity in the web application (sessionActivity)', () => {
  test('a person who just opened the page counts as active', async () => {
    const { activity } = await loadAt('2026-11-11T08:00:00+08:00')
    expect(activity.isUserActive()).toBe(true)
  })

  test('after a minute without touching the page, the person is idle', async () => {
    const { activity } = await loadAt('2026-11-11T08:00:00+08:00')
    wait(61 * 1000)
    expect(activity.isUserActive()).toBe(false)
  })

  test('typing or tapping makes the person active again', async () => {
    const { activity } = await loadAt('2026-11-11T08:00:00+08:00')
    wait(5 * 60 * 1000)
    page.dispatchEvent(new Event('keydown'))
    expect(activity.isUserActive()).toBe(true)
    expect(activity.lastInteraction()).toBe(new Date('2026-11-11T08:05:00+08:00').getTime())
  })

  test('requests sent while nobody uses the page are marked passive, so they do not keep the session alive', async () => {
    const { api, activity } = await loadAt('2026-11-11T08:00:00+08:00')
    wait(2 * 60 * 1000)
    const fetchMock = mockFetch(jsonResponse(200, { success: true }))
    await api.apiGet('/api/notifications')
    expect(requestOf(fetchMock).headers.get(activity.SESSION_ACTIVITY_HEADER)).toBe('passive')
    expect(activity.lastServerActivity()).toBe(new Date('2026-11-11T08:00:00+08:00').getTime())
  })

  test('edge case: a request made by the person is recorded as server activity', async () => {
    const { api, activity } = await loadAt('2026-11-11T08:00:00+08:00')
    wait(30 * 1000)
    const fetchMock = mockFetch(jsonResponse(200, { success: true }))
    await api.apiGet('/api/loans')
    expect(requestOf(fetchMock).headers.has(activity.SESSION_ACTIVITY_HEADER)).toBe(false)
    expect(activity.lastServerActivity()).toBe(new Date('2026-11-11T08:00:30+08:00').getTime())
  })
})
