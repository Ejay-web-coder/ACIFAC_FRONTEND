// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { jsonResponse, mockFetch, requestOf } from '../helpers/fetch'

// The page's window (happy-dom), for the "session locked" and "session ended" events.
const page = window
const LOCKED = { success: false, code: 'SESSION_LOCKED', message: 'Your session was locked after 20 minutes without activity. Enter your password to continue.' }
const UNLOCKED = { success: true, message: 'Welcome back.', idleTimeoutSeconds: 1200, idleExpiresInSeconds: 1200, sessionExpiresInSeconds: 20000 }

// The lock is kept in the API client, so each test loads it fresh (unlocked).
async function freshClient() {
  vi.resetModules()
  return { api: await import('../../src/lib/api'), auth: await import('../../src/app/services/authApi') }
}
afterEach(() => vi.unstubAllGlobals())

describe('Session lock after 20 minutes without activity (api.ts, unlockSessionRequest)', () => {
  test('a locked session opens the lock screen instead of signing the user out', async () => {
    const { api } = await freshClient()
    const locked = vi.fn()
    const ended = vi.fn()
    page.addEventListener(api.SESSION_LOCKED_EVENT, locked)
    page.addEventListener(api.SESSION_ENDED_EVENT, ended)
    mockFetch(jsonResponse(401, LOCKED))
    await expect(api.apiFetch('/api/auth/session')).rejects.toMatchObject({ status: 401, code: 'SESSION_LOCKED' })
    expect(locked).toHaveBeenCalledTimes(1)
    expect(ended).not.toHaveBeenCalled()
    expect(api.isSessionLocked()).toBe(true)
    page.removeEventListener(api.SESSION_LOCKED_EVENT, locked)
    page.removeEventListener(api.SESSION_ENDED_EVENT, ended)
  })

  test('a request refused because of the lock waits, and is sent again once the password is accepted', async () => {
    const { api } = await freshClient()
    const fetchMock = mockFetch(jsonResponse(401, LOCKED), jsonResponse(200, { success: true, data: ['LN-0001'] }))
    let answered = false
    const loans = api.apiGet('/api/loans').then((result) => { answered = true; return result })
    await vi.waitFor(() => expect(api.isSessionLocked()).toBe(true))
    expect(answered).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    api.markSessionUnlocked()
    await expect(loans).resolves.toEqual({ success: true, data: ['LN-0001'] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('"Stay logged in" sends the password while every other request waits', async () => {
    const { api, auth } = await freshClient()
    api.markSessionLocked()
    const fetchMock = mockFetch(jsonResponse(200, UNLOCKED))
    const members = api.apiGet('/api/members')
    await expect(auth.unlockSessionRequest('Pass1234!')).resolves.toMatchObject({ idleExpiresInSeconds: 1200 })
    expect(requestOf(fetchMock)).toMatchObject({ url: '/api/auth/unlock', method: 'POST', body: { password: 'Pass1234!' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    api.markSessionUnlocked()
    await members
    expect(requestOf(fetchMock, 1).url).toBe('/api/members')
  })

  test('a wrong password keeps the session locked and gives the attempts left', async () => {
    const { api, auth } = await freshClient()
    api.markSessionLocked()
    const ended = vi.fn()
    page.addEventListener(api.SESSION_ENDED_EVENT, ended)
    mockFetch(jsonResponse(400, { success: false, code: 'INVALID_PASSWORD', message: 'Incorrect password.', attemptsRemaining: 2 }))
    const error = await auth.unlockSessionRequest('WrongPass1!').catch((caught) => caught)
    expect(error).toMatchObject({ status: 400, code: 'INVALID_PASSWORD', data: { attemptsRemaining: 2 } })
    expect(api.isSessionLocked()).toBe(true)
    expect(ended).not.toHaveBeenCalled()
    page.removeEventListener(api.SESSION_ENDED_EVENT, ended)
  })

  test('edge case: if the session ends while locked, the waiting requests fail as signed out', async () => {
    const { api } = await freshClient()
    api.markSessionLocked()
    const fetchMock = mockFetch(jsonResponse(200, { success: true }))
    const waiting = api.apiGet('/api/loans')
    page.dispatchEvent(new CustomEvent(api.SESSION_ENDED_EVENT, { detail: 'Your session has expired. Please log in again.' }))
    await expect(waiting).rejects.toMatchObject({ status: 401, code: 'SESSION_INVALID' })
    expect(api.isSessionLocked()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
