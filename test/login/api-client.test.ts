// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ApiError, apiFetch, apiPost, SESSION_ENDED_EVENT } from '../../src/lib/api'
import { jsonResponse, mockFetch, requestOf } from '../helpers/fetch'

// The page's window (happy-dom), for the "session ended" event the app listens to.
const page = window
afterEach(() => vi.unstubAllGlobals())

describe('API client of the web application (apiFetch)', () => {
  test('sends the session cookie and the request verification header', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { success: true }))
    await apiPost('/api/members', { first_name: 'Juan' })
    const request = requestOf(fetchMock)
    expect(request).toMatchObject({ url: '/api/members', method: 'POST', credentials: 'include', body: { first_name: 'Juan' } })
    expect(request.headers.get('X-Requested-With')).toBe('XMLHttpRequest')
    expect(request.headers.get('Content-Type')).toBe('application/json')
  })

  test('returns the data the server sent', async () => {
    mockFetch(jsonResponse(200, { success: true, user: { username: 'juan' } }))
    await expect(apiFetch('/api/auth/me')).resolves.toEqual({ success: true, user: { username: 'juan' } })
  })

  test('a refused request becomes an error with the server\'s message and code', async () => {
    mockFetch(jsonResponse(400, { success: false, message: 'Phone number is required.', code: 'INVALID', errors: ['Phone number is required.'] }))
    const error = await apiPost('/api/members', {}).catch((caught) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ message: 'Phone number is required.', status: 400, code: 'INVALID', errors: ['Phone number is required.'] })
  })

  test('an empty or unreadable error reply still gives a message', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 502 }))
    await expect(apiFetch('/api/loans')).rejects.toMatchObject({ message: 'Request failed.', status: 502 })
  })

  test('when the server cannot be reached, the user is told to check the connection', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    await expect(apiFetch('/api/loans')).rejects.toMatchObject({ message: 'Unable to reach the ACIFAC server. Check your connection and try again.', status: 0 })
  })

  test('an expired session signs the user out of the page (401)', async () => {
    const ended = vi.fn()
    page.addEventListener(SESSION_ENDED_EVENT, ended)
    mockFetch(jsonResponse(401, { message: 'Your session has expired. Please log in again.' }))
    await expect(apiFetch('/api/loans')).rejects.toMatchObject({ status: 401 })
    expect(ended).toHaveBeenCalledTimes(1)
    page.removeEventListener(SESSION_ENDED_EVENT, ended)
  })

  test('edge case: a wrong password on the login page is not treated as a lost session', async () => {
    const ended = vi.fn()
    page.addEventListener(SESSION_ENDED_EVENT, ended)
    mockFetch(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'Invalid email, mobile number or password.', attemptsRemaining: 2 }))
    const error = (await apiPost('/api/auth/login', { usernameOrEmail: 'juan', password: 'x' }).catch((caught) => caught)) as ApiError
    expect(error.data.attemptsRemaining).toBe(2)
    expect(ended).not.toHaveBeenCalled()
    page.removeEventListener(SESSION_ENDED_EVENT, ended)
  })
})
