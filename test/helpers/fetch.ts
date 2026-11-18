import { vi } from 'vitest'

// A JSON answer from the ACIFAC API, as fetch would return it.
export const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

// Replaces the browser's fetch with a mock that gives these answers in turn
// (the last one again after that). No request ever leaves the test.
export function mockFetch(...answers: Array<Response | Error>) {
  const queue = [...answers]
  const fetchMock = vi.fn(async () => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]
    if (next instanceof Error) throw next
    return next.clone()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// The URL, method, headers and JSON body of the n-th request made.
export function requestOf(fetchMock: ReturnType<typeof mockFetch>, index = 0) {
  const [url, init = {}] = fetchMock.mock.calls[index] as unknown as [string, RequestInit]
  const headers = new Headers(init.headers)
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
  return { url, method: init.method ?? 'GET', headers, body, credentials: init.credentials }
}
