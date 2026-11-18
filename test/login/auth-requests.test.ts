// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { changePasswordRequest, forgotPasswordRequest, loginRequest, logoutRequest, verifyResetCodeRequest } from '../../src/app/services/authApi'
import { jsonResponse, mockFetch, requestOf } from '../helpers/fetch'

afterEach(() => vi.unstubAllGlobals())

describe('Sign-in requests (loginRequest, logoutRequest, password reset)', () => {
  test('logs in with the email or mobile number and password', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { message: 'Login successful.', role: 'MEMBER', mustChangePassword: false }))
    await expect(loginRequest({ usernameOrEmail: 'juan@example.com', password: 'Pass1234!' })).resolves.toMatchObject({ role: 'MEMBER' })
    expect(requestOf(fetchMock)).toMatchObject({ url: '/api/auth/login', method: 'POST', body: { usernameOrEmail: 'juan@example.com', password: 'Pass1234!' } })
  })

  test('a wrong password shows the server\'s error message', async () => {
    mockFetch(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'Invalid email, mobile number or password.' }))
    await expect(loginRequest({ usernameOrEmail: 'juan@example.com', password: 'wrong' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email, mobile number or password.' })
  })

  test('blank fields are sent as typed, and the server\'s "required" error is shown', async () => {
    const fetchMock = mockFetch(jsonResponse(400, { message: 'Email or mobile number and password are required.' }))
    await expect(loginRequest({ usernameOrEmail: '', password: '' })).rejects.toMatchObject({ status: 400, message: 'Email or mobile number and password are required.' })
    expect(requestOf(fetchMock).body).toEqual({ usernameOrEmail: '', password: '' })
  })

  test('a locked account gives the seconds to wait, for the countdown', async () => {
    mockFetch(jsonResponse(429, { code: 'LOGIN_LOCKED', message: 'Too many failed login attempts. Please try again in 20 minutes.', retryAfterSeconds: 1200 }))
    const error = await loginRequest({ usernameOrEmail: 'juan', password: 'x' }).catch((caught) => caught)
    expect(error).toMatchObject({ status: 429, code: 'LOGIN_LOCKED', data: { retryAfterSeconds: 1200 } })
  })

  test('logging out and the password reset steps call the right endpoints', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { message: 'ok' }))
    await logoutRequest()
    await forgotPasswordRequest({ email: 'juan@example.com' })
    await verifyResetCodeRequest({ email: 'juan@example.com', code: '482913' })
    expect(fetchMock.mock.calls.map((_, index) => requestOf(fetchMock, index).url)).toEqual(['/api/auth/logout', '/api/auth/forgot-password', '/api/auth/verify-reset-code'])
    expect(requestOf(fetchMock, 2).body).toEqual({ email: 'juan@example.com', code: '482913' })
  })

  test('edge case: changing the password sends the current and the new one', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { message: 'Password changed.' }))
    await changePasswordRequest({ currentPassword: 'Temp1234!', newPassword: 'NewPass1!', confirmPassword: 'NewPass1!' })
    expect(requestOf(fetchMock)).toMatchObject({ method: 'POST', body: { currentPassword: 'Temp1234!', newPassword: 'NewPass1!' } })
  })
})
