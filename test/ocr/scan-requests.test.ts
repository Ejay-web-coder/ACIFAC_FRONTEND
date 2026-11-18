// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { analyzeDocument, saveDocumentReview } from '../../src/admin/services/ocrApi'
import { jsonResponse, mockFetch, requestOf } from '../helpers/fetch'

const form = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'membership-form.jpg', { type: 'image/jpeg' })
afterEach(() => vi.unstubAllGlobals())

describe('Sending a scanned form to the server (ocrApi)', () => {
  test('uploads the photo with where it came from (camera or file)', async () => {
    const fetchMock = mockFetch(jsonResponse(201, { success: true, message: 'Document processed.', data: { id: 61, documentType: 'Membership Form' } }))
    await expect(analyzeDocument(form(), 'camera')).resolves.toMatchObject({ data: { id: 61, documentType: 'Membership Form' } })
    const { url, method, body, headers } = requestOf(fetchMock)
    expect([method, url]).toEqual(['POST', '/api/ocr/analyze'])
    expect((body as FormData).get('source')).toBe('camera')
    expect(((body as FormData).get('document') as File).name).toBe('membership-form.jpg')
    expect(headers.has('Content-Type')).toBe(false)
  })

  test('a reading that could not be done is reported, with the scan kept', async () => {
    mockFetch(jsonResponse(201, { success: false, message: 'The document was saved but could not be read yet: the AI service is busy.', data: { id: 62, processingStatus: 'failed' } }))
    await expect(analyzeDocument(form())).resolves.toMatchObject({ success: false, data: { processingStatus: 'failed' } })
  })

  test('the same document uploaded twice is refused with the server\'s message', async () => {
    mockFetch(jsonResponse(409, { message: 'This document has already been uploaded.' }))
    await expect(analyzeDocument(form())).rejects.toMatchObject({ status: 409, message: 'This document has already been uploaded.' })
  })

  test('the reviewer\'s corrections are saved to the scan', async () => {
    const fetchMock = mockFetch(jsonResponse(200, { success: true, data: { id: 61 } }))
    await saveDocumentReview(61, 'Membership Form', { lastName: 'Dela Cruz' })
    expect(requestOf(fetchMock)).toMatchObject({ url: '/api/ocr/61/review', method: 'PATCH', body: { documentType: 'Membership Form', extractedData: { lastName: 'Dela Cruz' } } })
  })

  test('edge case: an upload is sent as "upload" when no source is given', async () => {
    const fetchMock = mockFetch(jsonResponse(201, { success: true, data: { id: 63 } }))
    await analyzeDocument(form())
    expect((requestOf(fetchMock).body as FormData).get('source')).toBe('upload')
  })
})
