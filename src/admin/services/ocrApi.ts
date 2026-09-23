import { apiFetch, apiGet, apiPatch } from '../../lib/api';

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

export interface OcrSummary { total: number; reviewed: number; needsReview: number; failed: number }

export function analyzeDocument(file: File) {
  const form = new FormData();
  form.append('document', file);
  return apiFetch<{ success: boolean; data: OcrScan; message?: string }>('/api/ocr/analyze', { method: 'POST', body: form });
}

export function saveDocumentReview(id: number, documentType: string, extractedData: Record<string, string>) {
  return apiPatch<{ success: boolean; data: OcrScan; message?: string }>(`/api/ocr/${id}/review`, { documentType, extractedData });
}

export function fetchDocumentScans() {
  return apiGet<{ success: boolean; data: OcrScan[]; summary: OcrSummary }>('/api/ocr');
}
