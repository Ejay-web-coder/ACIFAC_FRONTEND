import { apiFetch, apiGet, apiPatch, apiPost } from '../../lib/api';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface VerificationCheck { id: string; label: string; status: CheckStatus; message: string }

export interface OcrVerification {
  status?: 'passed' | 'warning' | 'failed';
  canPost?: boolean;
  checks?: VerificationCheck[];
  checkedAt?: string;
}

export interface OcrAuthenticity {
  score?: number | null;
  verdict?: 'genuine' | 'suspicious' | 'fake' | 'unknown';
  physicalDocument?: boolean | null;
  filledIn?: boolean | null;
  signaturePresent?: boolean | null;
  issues?: string[];
}

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
  captureSource: 'upload' | 'camera';
  authenticity: OcrAuthenticity;
  verification: OcrVerification;
  postable: boolean;
  targetModule: string | null;
  posted: { module: string; recordId: string; at: string; automatically: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OcrSummary { total: number; reviewed: number; needsReview: number; failed: number; posted: number; autoPosted: number }

export interface OcrFormField { key: string; label: string; kind: 'text' | 'date' | 'money' | 'number' | 'integer'; required: boolean }
export interface OcrFormDefinition { type: string; module: string; moduleLabel: string; description: string; fields: OcrFormField[] }

type ScanResponse = { success: boolean; data: OcrScan; message?: string };

export function analyzeDocument(file: File, source: 'upload' | 'camera' = 'upload') {
  const form = new FormData();
  form.append('source', source);
  form.append('document', file);
  return apiFetch<ScanResponse>('/api/ocr/analyze', { method: 'POST', body: form });
}

export function saveDocumentReview(id: number, documentType: string, extractedData: Record<string, string>, reviewStatus?: 'rejected') {
  return apiPatch<ScanResponse>(`/api/ocr/${id}/review`, { documentType, extractedData, reviewStatus });
}

export function verifyDocument(id: number) {
  return apiPost<ScanResponse>(`/api/ocr/${id}/verify`);
}

export function postDocument(id: number, documentType: string, extractedData: Record<string, string>, acknowledgeWarnings: boolean) {
  return apiPost<ScanResponse>(`/api/ocr/${id}/post`, { documentType, extractedData, acknowledgeWarnings });
}

export function fetchDocumentScans() {
  return apiGet<{ success: boolean; data: OcrScan[]; summary: OcrSummary }>('/api/ocr');
}

export function fetchFormDefinitions() {
  return apiGet<{ success: boolean; data: OcrFormDefinition[]; autoPost: boolean; autoPostMinConfidence: number }>('/api/ocr/forms');
}
