export interface OcrScan {
  id: number;
  fileName: string;
  documentType: string;
  confidence: number | null;
  ocrText: string;
  extractedData: Record<string, string>;
  reviewStatus: string;
  processingStatus: 'completed' | 'failed';
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
}

async function ocrFetch<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, credentials: 'include', headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'OCR request failed.');
  return payload as { success: boolean; data: T; message?: string };
}

export function analyzeDocument(file: File) {
  const form = new FormData();
  form.append('document', file);
  return ocrFetch<OcrScan>('/api/ocr/analyze', { method: 'POST', body: form });
}

export function saveDocumentReview(id: number, documentType: string, extractedData: Record<string, string>) {
  return ocrFetch<OcrScan>(`/api/ocr/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ documentType, extractedData }),
  });
}

export function fetchDocumentScans() {
  return ocrFetch<OcrScan[]>('/api/ocr');
}