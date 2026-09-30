import { apiFetch, apiGet, apiPatch, apiPost } from '../../lib/api';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface VerificationCheck { id: string; label: string; status: CheckStatus; message: string }

export interface OcrVerification {
  status?: 'passed' | 'warning' | 'failed';
  canPost?: boolean;
  checks?: VerificationCheck[];
  checkedAt?: string;
  /** memberNumber: the membership number the system will give a scanned membership form. */
  target?: { memberNumber?: string };
}

export interface OcrAuthenticity {
  score?: number | null;
  verdict?: 'genuine' | 'suspicious' | 'fake' | 'unknown';
  physicalDocument?: boolean | null;
  filledIn?: boolean | null;
  signaturePresent?: boolean | null;
  issues?: string[];
}

/** AI reading of the applicant's ID submitted with a scanned membership form. */
export interface OcrIdReading {
  isId?: boolean | null;
  idType?: string;
  idNumber?: string;
  name?: string;
  dateOfBirth?: string;
  frontVisible?: boolean | null;
  backVisible?: boolean | null;
  photocopy?: boolean | null;
  screen?: boolean | null;
  signatureCount?: number | null;
  expired?: boolean | null;
  issues?: string[];
  error?: string;
}

/** upload = a back-to-back copy with specimen signatures; camera = the ID card captured with the live camera. */
export type IdSource = 'upload' | 'camera';

export interface OcrIdDocument { fileName: string; mimeType: string; size: number; source: IdSource; reading: OcrIdReading }

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
  requiresIdDocument: boolean;
  idDocument: OcrIdDocument | null;
  posted: { module: string; recordId: string; at: string; automatically: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OcrSummary { total: number; reviewed: number; needsReview: number; failed: number; posted: number; autoPosted: number }

export interface OcrFormField { key: string; label: string; kind: 'text' | 'date' | 'money' | 'number' | 'integer'; required: boolean }
export interface OcrFormDefinition { type: string; module: string; moduleLabel: string; description: string; requiresIdDocument: boolean; fields: OcrFormField[] }

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

// Runs the AI again on the saved file of a scan whose reading failed.
export function retryDocumentReading(id: number) {
  return apiPost<ScanResponse>(`/api/ocr/${id}/retry`);
}

// The applicant's valid ID for a scanned membership form.
export function attachIdDocument(id: number, file: File, source: IdSource) {
  const form = new FormData();
  form.append('source', source);
  form.append('idDocument', file);
  return apiFetch<ScanResponse>(`/api/ocr/${id}/id-document`, { method: 'POST', body: form });
}

export const idDocumentPath = (id: number) => `/api/ocr/${id}/id-document`;

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
  return apiGet<{ success: boolean; data: OcrFormDefinition[]; autoPost: boolean; autoPostMinConfidence: number; requiredIdSignatures: number }>('/api/ocr/forms');
}
