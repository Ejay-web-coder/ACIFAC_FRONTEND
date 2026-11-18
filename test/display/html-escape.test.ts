import { describe, expect, test } from 'vitest'
import { escapeHtml } from '../../src/utils/html'

describe('Text placed on printed receipts and reports (escapeHtml)', () => {
  test('plain text is left as it is', () => {
    expect(escapeHtml('Juan Dela Cruz')).toBe('Juan Dela Cruz')
  })

  test('markup in a name cannot run on a printed page', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  test('quotes and ampersands are escaped', () => {
    expect(escapeHtml(`"Ana" & 'Ben'`)).toBe('&quot;Ana&quot; &amp; &#039;Ben&#039;')
  })

  test('missing text becomes empty; numbers become text', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(1500)).toBe('1500')
  })

  test('edge case: text that is already escaped is escaped again, not decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})
