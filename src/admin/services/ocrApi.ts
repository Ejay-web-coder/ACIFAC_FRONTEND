import { apiDelete, apiFetch, apiGet, apiPatch, apiPost } from '../../lib/api';

export type CheckStatus = 'pass' | 'warn' | 'fail';

/** fields: the form keys the check is about, highlighted in the review. */
export interface VerificationCheck { id: string; label: string; status: CheckStatus; message: string; fields?: string[] }

export interface OcrVerification {
  status?: 'passed' | 'warning' | 'failed';
  canPost?: boolean;
  checks?: VerificationCheck[];
  checkedAt?: string;
  /** Share of checks passed (0-100). */
  score?: number | null;
  /** memberNumber: the membership number the system will give a scanned membership form. */
  target?: { memberNumber?: string };
}

export interface OcrAuthenticity {
  score?: number | null;
  verdict?: 'genuine' | 'suspicious' | 'fake' | 'unknown';
  physicalDocument?: boolean | null;
  filledIn?: boolean | null;
  signaturePresent?: boolean | null;
  /** Membership form: the 2x2 picture in the photo box shows a recognizable face. */
  photoRecognized?: boolean | null;
  issues?: string[];
}

/** AI reading of a valid ID submitted with a scanned form (applicant, borrower or co-maker). */
export interface OcrIdReading {
  isId?: boolean | null;
  idType?: string;
  idNumber?: string;
  name?: string;
  dateOfBirth?: string;
  address?: string;
  frontVisible?: boolean | null;
  backVisible?: boolean | null;
  photocopy?: boolean | null;
  screen?: boolean | null;
  signatureCount?: number | null;
  expired?: boolean | null;
  issues?: string[];
  error?: string;
}

/**
 * upload = a file of the back-to-back copy with specimen signatures; camera = taken with the camera
 * (the ID card itself for a membership applicant, the signed copy for a loan borrower or co-maker).
 */
export type IdSource = 'upload' | 'camera';

/** Where an ID is kept on the scan: holder = membership applicant or loan borrower; coMaker = loan co-maker. */
export type IdSlot = 'holder' | 'coMaker';

/** A valid ID a scanned form needs. cardCapture: the live camera may capture the ID card itself instead of a signed copy. */
export interface OcrIdRequirement { slot: IdSlot; person: string; label: string; cardCapture: boolean }

export interface OcrIdDocument { fileName: string; mimeType: string; size: number; source: IdSource; reading: OcrIdReading }

/** AI check of a 2x2 picture uploaded because the one on the membership form could not be recognized. */
export interface OcrPhotoReading { portrait?: boolean | null; faceVisible?: boolean | null; screen?: boolean | null; issues?: string[]; error?: string }

export interface OcrScan {
  id: number;
  fileName: string;
  documentType: string;
  /** Share of verification checks passed (0-100), worked out by the system. */
  confidence: number | null;
  /** What the AI reported about its own reading (not used to decide anything but the form type). */
  aiConfidence?: number | null;
  ocrText: string;
  extractedData: Record<string, string>;
  reviewStatus: string;
  processingStatus: 'completed' | 'failed';
  processingError: string | null;
  /** Automatic re-reading while the AI is busy: nextAt = null when not queued. */
  retry?: { count: number; max: number; nextAt: string | null };
  /** The second, independent reading: error when it could not be done yet. */
  crossCheck?: { done?: boolean; error?: string } | null;
  captureSource: 'upload' | 'camera';
  authenticity: OcrAuthenticity;
  verification: OcrVerification;
  postable: boolean;
  targetModule: string | null;
  requiresIdDocument: boolean;
  /** Sent by newer servers: the IDs the form needs, and those submitted per slot. */
  idRequirements?: OcrIdRequirement[];
  idDocuments?: Partial<Record<IdSlot, OcrIdDocument | null>>;
  /** The holder's ID (applicant or borrower). */
  idDocument: OcrIdDocument | null;
  photoExpected: boolean;
  photo: { reading: OcrPhotoReading } | null;
  /** undoUntil: an automatic save can be undone until then (members, loan applications, rental requests). */
  posted: { module: string; recordId: string; at: string; automatically: boolean; undoUntil?: string | null } | null;
  /** The automatic save was undone: recordId is the record that was removed. */
  undone?: { at: string; recordId: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OcrSummary { total: number; reviewed: number; needsReview: number; failed: number; posted: number; autoPosted: number; queued?: number }

export interface OcrFormField { key: string; label: string; kind: 'text' | 'date' | 'money' | 'number' | 'integer' | 'phone' | 'rsbsa'; required: boolean }
/** The lines of a form's table: row n is the fields <id><n><column key>, e.g. line3CostPrice. */
export interface OcrFormTable { id: string; label: string; rows: number; columns: Array<{ key: string; label: string; kind: OcrFormField['kind'] }> }
/** legacy: kept for older scans; not offered as a type for new ones. */
export interface OcrFormDefinition { type: string; module: string; moduleLabel: string; description: string; requiresIdDocument: boolean; idDocuments?: OcrIdRequirement[]; photoExpected: boolean; fields: OcrFormField[]; tables?: OcrFormTable[]; legacy?: boolean }

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

// A valid ID for a scanned form: the membership applicant's or loan borrower's (holder), or the loan co-maker's.
export const idDocumentPath = (id: number, slot: IdSlot = 'holder') => `/api/ocr/${id}/${slot === 'coMaker' ? 'co-maker-id' : 'id-document'}`;

export function attachIdDocument(id: number, file: File, source: IdSource, slot: IdSlot = 'holder') {
  const form = new FormData();
  form.append('source', source);
  form.append('idDocument', file);
  return apiFetch<ScanResponse>(idDocumentPath(id, slot), { method: 'POST', body: form });
}

// The applicant's 2x2 picture, when the one on the membership form cannot be recognized.
export function attachPhoto(id: number, file: File) {
  const form = new FormData();
  form.append('photo', file);
  return apiFetch<ScanResponse>(`/api/ocr/${id}/photo`, { method: 'POST', body: form });
}

export const photoPath = (id: number) => `/api/ocr/${id}/photo`;

// Reads again the next scan queued while the AI was busy (the page calls it while scans are queued).
export function retryQueuedScans() {
  return apiPost<{ success: boolean; data: OcrScan[]; queued: number; nextAt: string | null }>('/api/ocr/retry-due');
}

// Rejects every flagged scan at once (failed checks or not read; queued scans are left alone).
export function rejectFlaggedScans() {
  return apiPost<{ success: boolean; data: OcrScan[]; message?: string }>('/api/ocr/reject-flagged');
}

// Deletes a scan that was never saved to records, with its files.
export function deleteScan(id: number) {
  return apiDelete<{ success: boolean; message?: string }>(`/api/ocr/${id}`);
}

// Takes back a form saved automatically (within the undo period).
export function undoAutoPost(id: number) {
  return apiPost<ScanResponse>(`/api/ocr/${id}/undo`);
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
  return apiGet<{ success: boolean; data: OcrFormDefinition[]; autoPost: boolean; requiredIdSignatures: number; undoWindowHours?: number }>('/api/ocr/forms');
}
