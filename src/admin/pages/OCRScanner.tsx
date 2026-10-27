import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, Camera, CheckCircle2, Clock, Database, Plus, RefreshCw, ScanLine, ShieldAlert, ShieldCheck, Trash2, Undo2, Upload, User, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { Pagination, StatusBadge } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { openProtectedFile } from '../../lib/api';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { describeProblems, prepareImageFile } from '../../lib/imageQuality';
import { DocumentScannerModal } from '../components/DocumentScannerModal';
import { FormPhotoPanel } from '../components/FormPhotoPanel';
import { IdDocumentPanel } from '../components/IdDocumentPanel';
import { ScanRequirementsModal } from '../components/ScanRequirementsModal';
import {
  analyzeDocument, attachIdDocument, attachPhoto, fetchDocumentScans, fetchFormDefinitions, idDocumentPath, OcrFormDefinition, OcrScan, deleteScan, postDocument, rejectFlaggedScans, retryDocumentReading, retryQueuedScans,
  saveDocumentReview, undoAutoPost, verifyDocument, type CheckStatus, type VerificationCheck, type IdSlot, type IdSource, type OcrFormTable, type OcrIdRequirement,
} from '../services/ocrApi';

const UNRECOGNIZED = 'Document Type Not Recognized';
const REFERENCE_TYPES = ['Payment Receipt', 'ID Document', 'Cooperative Form'];
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ID_MAX_BYTES = 5 * 1024 * 1024;
// Uploaded photos of forms are scaled to this size, straightened and given more contrast before the AI reads them.
const UPLOAD_MAX_EDGE = 2200;
// While scans wait for the AI to be free, the page asks the server to read the next one this often.
const QUEUE_POLL_MS = 15000;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Loan form fields named <row><Column> are shown as the paper's in-kind table.
const TABLE_COLUMNS = ['Description', 'Quantity', 'Unit', 'UnitPrice', 'Total'] as const;
const TABLE_COLUMN_LABELS: Record<(typeof TABLE_COLUMNS)[number], string> = { Description: 'Description', Quantity: 'Quantity', Unit: 'Unit', UnitPrice: 'Unit Price', Total: 'Total Amount' };
const TABLE_FIELD = new RegExp(`^(.+)(${TABLE_COLUMNS.join('|')})$`);

// The line tables of a form (the Kadiwa forms): the lines with something
// read, plus the blank ones the admin added. A cell key is <id><n><column>.
const cellKey = (table: OcrFormTable, line: number, column: string) => `${table.id}${line}${column}`;
const isTableCell = (tables: OcrFormTable[], key: string) => tables.some((table) => new RegExp(`^${table.id}\\d+(${table.columns.map((column) => column.key).join('|')})$`).test(key));
function shownLines(table: OcrFormTable, data: Record<string, string>, added: number) {
  const filled = Array.from({ length: table.rows }, (_, index) => index + 1).filter((line) => table.columns.some((column) => data[cellKey(table, line, column.key)]?.trim()));
  const last = Math.max(0, ...filled);
  const extra = Array.from({ length: Math.min(added, table.rows - last) }, (_, index) => last + index + 1);
  return [...new Set([...filled, ...extra])].sort((a, b) => a - b);
}

interface OCRScannerProps { userRole: UserRole; }

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const CHECK_STYLE: Record<CheckStatus, { icon: typeof CheckCircle2; className: string }> = {
  pass: { icon: CheckCircle2, className: 'text-green-600' },
  warn: { icon: AlertTriangle, className: 'text-amber-600' },
  fail: { icon: XCircle, className: 'text-red-600' },
};

// A scanned membership form needs the applicant's valid ID; a scanned loan
// form needs the borrower's and the co-maker's. Older servers sent only
// requiresIdDocument and idDocument (the applicant's).
const APPLICANT_ID: OcrIdRequirement = { slot: 'holder', person: 'applicant', label: 'Applicant\'s valid ID', cardCapture: true };

function idRequirementsOf(scan: OcrScan, definition?: OcrFormDefinition): OcrIdRequirement[] {
  if (definition) return definition.idDocuments ?? (definition.requiresIdDocument ? [APPLICANT_ID] : []);
  return scan.idRequirements ?? (scan.requiresIdDocument ? [APPLICANT_ID] : []);
}

function idDocumentOf(scan: OcrScan, slot: IdSlot) {
  return scan.idDocuments ? scan.idDocuments[slot] ?? null : slot === 'holder' ? scan.idDocument : null;
}

// The verification checks of each ID: the ID itself, and whether it belongs to the person on the form.
const ID_CHECKS: Record<IdSlot, [string, string]> = { holder: ['idDocument', 'idMatch'], coMaker: ['coMakerId', 'coMakerMatch'] };

const listed = (items: string[]) => (items.length > 2 ? `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}` : items.join(' and '));

// What a scanned form still needs before it can be saved: its valid IDs, and a
// 2x2 picture when AI cannot recognize the one on a membership form.
function missingRequirements(scan: OcrScan) {
  const missing = idRequirementsOf(scan).filter((requirement) => !idDocumentOf(scan, requirement.slot))
    .map((requirement) => (requirement.person === 'applicant' ? 'ID' : `${requirement.person} ID`));
  if (scan.photoExpected && !scan.photo && scan.authenticity?.photoRecognized !== true) missing.push('2x2 picture');
  return missing;
}

// Why a submitted ID or 2x2 picture did not pass its check.
function requirementProblems(scan: OcrScan) {
  const submitted = [
    ...idRequirementsOf(scan).filter((requirement) => idDocumentOf(scan, requirement.slot)).flatMap((requirement) => ID_CHECKS[requirement.slot]),
    ...(scan.photo ? ['photo'] : []),
  ];
  return (scan.verification?.checks || []).filter((check) => check.status === 'fail' && submitted.includes(check.id)).map((check) => check.message);
}

// The dialog shown right after a membership or loan form is scanned.
function requirementsText(scan: OcrScan, requiredSignatures: number) {
  const requirements = idRequirementsOf(scan);
  const people = requirements.map((requirement) => `${requirement.person}'s`);
  const items = requirements.map((requirement) => (requirement.cardCapture
    ? `the ${requirement.person}'s valid ID with ${requiredSignatures} specimen signatures, or the ID captured with the live camera`
    : `the ${requirement.person}'s valid ID: front and back on one page, with the ${requirement.person}'s ${requiredSignatures} specimen signatures`));
  if (scan.photoExpected && scan.authenticity?.photoRecognized !== true) items.push('a 2x2 picture, because the one on the form cannot be recognized');
  return {
    heading: `${scan.documentType.replace(/ Form$/, ' form')} read`,
    title: scan.photoExpected ? `Submit the ${people[0] || 'applicant\'s'} requirements` : `Submit the ${people.join(' and ')} valid ${people.length > 1 ? 'IDs' : 'ID'}`,
    intro: scan.postable && scan.targetModule?.startsWith('Loans') ? 'The loan application goes to Loans & Payments for approval only after you submit:' : 'The member is saved only after you submit:',
    items,
  };
}

const requirementsDone = (scan: OcrScan) => Boolean(scan.posted) || (!missingRequirements(scan).length && !requirementProblems(scan).length);

function scanStatus(scan: OcrScan): { status: string; label: string } {
  if (scan.posted) return { status: 'completed', label: 'Saved to records' };
  if (scan.processingStatus === 'failed') return scan.retry?.nextAt ? { status: 'pending', label: 'Queued: AI busy' } : { status: 'failed', label: 'Not read' };
  if (scan.reviewStatus === 'rejected') return { status: 'rejected', label: 'Rejected' };
  const missing = missingRequirements(scan);
  if (missing.length) return { status: 'pending', label: `Needs ${missing.join(' & ')}` };
  if (scan.verification?.status === 'failed') return { status: 'overdue', label: 'Flagged' };
  return { status: 'pending', label: 'Needs review' };
}

const queued = (scan: OcrScan) => Boolean(scan.retry?.nextAt) && !scan.posted && scan.reviewStatus !== 'rejected';
// Failed its checks or could not be read, and not waiting for another automatic reading.
const isFlagged = (scan: OcrScan) => !scan.posted && scan.reviewStatus !== 'rejected' && !queued(scan) && (scan.verification?.status === 'failed' || scan.processingStatus === 'failed');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// The checks that flag each form field: failed ones first. The fields are
// highlighted so the admin only looks at what the checks could not confirm.
function fieldFlags(checks: VerificationCheck[]) {
  const flags = new Map<string, { status: CheckStatus; labels: string[] }>();
  for (const check of checks) {
    if (check.status === 'pass') continue;
    for (const key of check.fields ?? []) {
      const flag = flags.get(key) ?? { status: check.status, labels: [] };
      if (check.status === 'fail') flag.status = 'fail';
      flag.labels.push(check.label);
      flags.set(key, flag);
    }
  }
  return flags;
}

const FLAG_INPUT: Record<CheckStatus, string> = { fail: 'border-red-400 bg-red-50 ring-1 ring-red-300', warn: 'border-amber-400 bg-amber-50 ring-1 ring-amber-300', pass: 'border-gray-300' };

export function OCRScanner({ userRole }: OCRScannerProps) {
  const [scans, setScans] = useState<OcrScan[]>([]);
  const [forms, setForms] = useState<OcrFormDefinition[]>([]);
  const [activeScan, setActiveScan] = useState<OcrScan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  // The ID being captured with the camera.
  const [idCamera, setIdCamera] = useState<OcrIdRequirement | null>(null);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [requiredIdSignatures, setRequiredIdSignatures] = useState(3);
  const [busy, setBusy] = useState<'' | 'save' | 'verify' | 'post' | 'reject' | 'retry' | 'undo' | `id-${IdSlot}` | 'photo'>('');
  const [confirmUndo, setConfirmUndo] = useState(false);
  // Reject all flagged: the first click asks to confirm.
  const [confirmRejectFlagged, setConfirmRejectFlagged] = useState(false);
  const [rejectingFlagged, setRejectingFlagged] = useState(false);
  // Delete a scan from Recent Scans: the first click asks to confirm.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // ?scan=<id>: the scan a notification links to.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedScan = Number(searchParams.get('scan')) || null;
  const [acknowledged, setAcknowledged] = useState(false);
  // Blank lines added to each line table of the form shown, by table id.
  const [addedLines, setAddedLines] = useState<Record<string, number>>({});
  const idPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocumentScans()
      .then(({ data }) => setScans(data))
      .catch((error) => toast.error('Unable to load document scans', { description: errorText(error, 'Please refresh and try again.') }));
    fetchFormDefinitions()
      .then(({ data, requiredIdSignatures: signatures }) => { setForms(data); if (signatures) setRequiredIdSignatures(signatures); })
      .catch(() => undefined);
  }, []);

  // Scans saved or posted elsewhere (another admin, another tab) appear in the list.
  useLiveRefresh(['document_scans'], () => { fetchDocumentScans().then(({ data }) => setScans(data)).catch(() => undefined); });

  const showScan = (scan: OcrScan) => {
    if (scan.id !== activeScan?.id) setConfirmUndo(false);
    if (scan.id !== activeScan?.id) setRequirementsOpen(false);
    if (scan.id !== activeScan?.id) setAddedLines({});
    setActiveScan(scan);
    setDirty(false);
    setAcknowledged(false);
  };

  const storeScan = (scan: OcrScan) => {
    showScan(scan);
    setScans((current) => [scan, ...current.filter((item) => item.id !== scan.id)]);
  };

  // A notification's link opens its scan.
  useEffect(() => {
    if (!linkedScan || !scans.length) return;
    const scan = scans.find((item) => item.id === linkedScan);
    if (scan) showScan(scan);
    setSearchParams((params) => { params.delete('scan'); return params; }, { replace: true });
  }, [linkedScan, scans.length]);

  // Scans the AI could not read yet (it was busy) are read again by
  // themselves; while any is queued this page asks the server to read the
  // next one, so nobody has to press Retry.
  const hasQueued = scans.some(queued);
  const activeRef = useRef<{ id: number | null; dirty: boolean }>({ id: null, dirty: false });
  activeRef.current = { id: activeScan?.id ?? null, dirty };
  useEffect(() => {
    if (!hasQueued || userRole !== 'admin') return undefined;
    let stopped = false;
    const timer = setInterval(() => {
      retryQueuedScans().then(({ data }) => {
        if (stopped || !data.length) return;
        setScans((current) => current.map((scan) => data.find((updated) => updated.id === scan.id) ?? scan));
        for (const scan of data) {
          if (scan.id === activeRef.current.id && !activeRef.current.dirty) setActiveScan(scan);
          if (scan.posted) toast.success(`Scan #${scan.id} read and saved automatically`, { description: `${scan.documentType}: every check passed.` });
          else if (scan.processingStatus === 'completed') toast.info(`Scan #${scan.id} read: ${scan.documentType}`, { description: 'Some checks need a look; the flagged fields are highlighted.' });
        }
      }).catch(() => undefined);
    }, QUEUE_POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [hasQueued, userRole]);

  const processFile = async (original: File, source: 'upload' | 'camera', { keepAnyway = false } = {}) => {
    let file = original;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported file type', { description: 'Upload a PNG, JPG, WEBP, or PDF document.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large', { description: 'Documents must not exceed 10 MB.' });
      return;
    }
    // A photo of a form is checked for blur and darkness, then straightened and
    // given more contrast (a camera capture already was, in the scanner).
    if (source === 'upload' && file.type.startsWith('image/')) {
      try {
        const prepared = await prepareImageFile(file, UPLOAD_MAX_EDGE);
        if (prepared.quality?.problems.length && !keepAnyway) {
          toast.warning(`This photo looks ${describeProblems(prepared.quality.problems)}`, {
            description: 'AI reads a sharp, well-lit photo much more reliably. Take it again, or upload it anyway.',
            action: { label: 'Upload anyway', onClick: () => void processFile(original, source, { keepAnyway: true }) },
            duration: 15000,
          });
          return;
        }
        file = prepared.file;
      } catch {
        // A picture the browser cannot open is sent as it is.
      }
    }
    try {
      setProcessingStage('AI reads the document twice, checks that it is genuine, and verifies it against the records. This can take up to a minute...');
      const { data, message } = await analyzeDocument(file, source);
      storeScan(data);
      if (data.processingStatus === 'failed') {
        if (data.retry?.nextAt) toast.warning('AI is busy: the document is queued', { description: message || 'It will be read again automatically.' });
        else toast.error('AI recognition failed', { description: data.processingError || 'Review the document or retry.' });
      }
      else if (data.posted) toast.success('Document saved to records', { description: message });
      else if (missingRequirements(data).length) {
        // Asked for straight away: the form is saved only with these.
        toast.info(requirementsText(data, requiredIdSignatures).title, { description: message });
        setRequirementsOpen(true);
      }
      else if (data.verification?.status === 'failed') toast.warning(`${data.documentType}: verification found problems`, { description: message });
      else toast.success(data.documentType === UNRECOGNIZED ? 'Document needs review' : `Document detected: ${data.documentType}`, { description: message });
    } catch (error) {
      toast.error('OCR processing failed', { description: errorText(error, 'Please retry.') });
    } finally {
      setProcessingStage('');
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file, 'upload');
    event.target.value = '';
  };

  const updateField = (key: string, value: string) => {
    if (!activeScan) return;
    setActiveScan({ ...activeScan, extractedData: { ...activeScan.extractedData, [key]: value } });
    setDirty(true);
  };

  const changeType = (documentType: string) => {
    if (!activeScan) return;
    setActiveScan({ ...activeScan, documentType });
    setDirty(true);
  };

  const refreshScan = async (id: number) => {
    const { data } = await fetchDocumentScans();
    setScans(data);
    const latest = data.find((scan) => scan.id === id);
    if (latest) showScan(latest);
  };

  const saveReview = async (reject = false) => {
    if (!activeScan) return;
    setBusy(reject ? 'reject' : 'save');
    try {
      const { data } = await saveDocumentReview(activeScan.id, activeScan.documentType, activeScan.extractedData, reject ? 'rejected' : undefined);
      storeScan(data);
      toast.success(reject ? 'Document rejected. It will not be saved to any module.' : 'Corrections saved and checked again.');
    } catch (error) {
      toast.error('Unable to save the document', { description: errorText(error, 'Please try again.') });
    } finally {
      setBusy('');
    }
  };

  const retryReading = async () => {
    if (!activeScan) return;
    setBusy('retry');
    try {
      const { data, message } = await retryDocumentReading(activeScan.id);
      storeScan(data);
      if (data.posted) toast.success('Document saved to records', { description: message });
      else toast.success(`Document read: ${data.documentType}`, { description: 'Review the checks below.' });
    } catch (error) {
      toast.error('AI still could not read the document', { description: errorText(error, 'Please try again in a minute.') });
      await refreshScan(activeScan.id).catch(() => undefined);
    } finally {
      setBusy('');
    }
  };

  // A valid ID for a scanned form: a back-to-back copy with specimen signatures
  // (uploaded, or photographed for a loan form) or, for a membership applicant,
  // the ID card captured with the live camera.
  const submitId = async (file: File, source: IdSource, slot: IdSlot) => {
    if (!activeScan) return;
    if (!ACCEPTED_TYPES.includes(file.type) || (source === 'camera' && !file.type.startsWith('image/'))) {
      toast.error('Unsupported file type', { description: 'Upload the ID copy as a PNG, JPG, WEBP, or PDF.' });
      return;
    }
    if (file.size > ID_MAX_BYTES) {
      toast.error('File is too large', { description: 'The ID must not exceed 5 MB.' });
      return;
    }
    setBusy(`id-${slot}`);
    try {
      // Unsaved corrections (such as the typed-in email) are saved first so the ID is checked against them.
      if (dirty) await saveDocumentReview(activeScan.id, activeScan.documentType, activeScan.extractedData);
      const { data, message } = await attachIdDocument(activeScan.id, file, source, slot);
      storeScan(data);
      if (requirementsDone(data)) setRequirementsOpen(false);
      const failed = data.verification?.checks?.find((check) => check.status === 'fail' && ID_CHECKS[slot].includes(check.id));
      if (data.posted) toast.success('Saved to records', { description: message });
      else if (failed) toast.warning('The ID did not pass the check', { description: failed.message });
      else toast.success('ID submitted', { description: message });
    } catch (error) {
      toast.error('The ID was not submitted', { description: errorText(error, 'Please try again.') });
      await refreshScan(activeScan.id).catch(() => undefined);
    } finally {
      setBusy('');
    }
  };

  // The applicant's 2x2 picture, when AI cannot recognize the one on the form.
  const submitPhoto = async (file: File) => {
    if (!activeScan) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      toast.error('Unsupported file type', { description: 'Upload the 2x2 picture as a PNG, JPG, or WEBP.' });
      return;
    }
    if (file.size > ID_MAX_BYTES) {
      toast.error('File is too large', { description: 'The picture must not exceed 5 MB.' });
      return;
    }
    setBusy('photo');
    try {
      if (dirty) await saveDocumentReview(activeScan.id, activeScan.documentType, activeScan.extractedData);
      const { data, message } = await attachPhoto(activeScan.id, file);
      storeScan(data);
      if (requirementsDone(data)) setRequirementsOpen(false);
      const failed = data.verification?.checks?.find((check) => check.status === 'fail' && check.id === 'photo');
      if (data.posted) toast.success('Member saved to records', { description: message });
      else if (failed) toast.warning('The picture did not pass the check', { description: failed.message });
      else toast.success('2x2 picture uploaded', { description: message });
    } catch (error) {
      toast.error('The picture was not uploaded', { description: errorText(error, 'Please try again.') });
      await refreshScan(activeScan.id).catch(() => undefined);
    } finally {
      setBusy('');
    }
  };

  const recheck = async () => {
    if (!activeScan) return;
    setBusy('verify');
    try {
      const { data } = await verifyDocument(activeScan.id);
      storeScan(data);
    } catch (error) {
      toast.error('Unable to verify the document', { description: errorText(error, 'Please try again.') });
    } finally {
      setBusy('');
    }
  };

  // Takes back a form saved automatically: the record is removed and the scan goes back to review.
  const undo = async () => {
    if (!activeScan) return;
    if (!confirmUndo) { setConfirmUndo(true); return; }
    setBusy('undo');
    try {
      const { data, message } = await undoAutoPost(activeScan.id);
      storeScan(data);
      toast.success('Automatic save undone', { description: message });
    } catch (error) {
      toast.error('Unable to undo', { description: errorText(error, 'Please try again.') });
      await refreshScan(activeScan.id).catch(() => undefined);
    } finally {
      setConfirmUndo(false);
      setBusy('');
    }
  };

  // Deletes a scan that is not needed, with its file. Scans saved to records stay.
  const removeScan = async (scan: OcrScan) => {
    if (confirmDeleteId !== scan.id) { setConfirmDeleteId(scan.id); return; }
    setDeletingId(scan.id);
    try {
      const { message } = await deleteScan(scan.id);
      setScans((current) => current.filter((item) => item.id !== scan.id));
      if (activeScan?.id === scan.id) setActiveScan(null);
      toast.success('Scan deleted', { description: message });
    } catch (error) {
      toast.error('Unable to delete the scan', { description: errorText(error, 'Please try again.') });
    } finally {
      setConfirmDeleteId(null);
      setDeletingId(null);
    }
  };

  // Rejects every flagged scan at once; they stay in the records as Rejected.
  const rejectFlagged = async () => {
    if (!confirmRejectFlagged) { setConfirmRejectFlagged(true); return; }
    setRejectingFlagged(true);
    try {
      const { data, message } = await rejectFlaggedScans();
      setScans((current) => current.map((scan) => data.find((rejected) => rejected.id === scan.id) ?? scan));
      const shown = activeScan && data.find((rejected) => rejected.id === activeScan.id);
      if (shown) showScan(shown);
      toast.success(data.length ? 'Flagged scans rejected' : 'Nothing to reject', { description: message });
    } catch (error) {
      toast.error('Unable to reject the flagged scans', { description: errorText(error, 'Please try again.') });
    } finally {
      setConfirmRejectFlagged(false);
      setRejectingFlagged(false);
    }
  };

  const post = async () => {
    if (!activeScan) return;
    setBusy('post');
    try {
      const { data, message } = await postDocument(activeScan.id, activeScan.documentType, activeScan.extractedData, acknowledged);
      storeScan(data);
      toast.success('Saved to records', { description: message });
    } catch (error) {
      toast.error('Document was not saved', { description: errorText(error, 'Please review the checks and try again.') });
      await refreshScan(activeScan.id).catch(() => undefined);
    } finally {
      setBusy('');
    }
  };

  const definition = activeScan ? forms.find((form) => form.type === activeScan.documentType) : undefined;
  const lineTables = useMemo(() => definition?.tables ?? [], [definition]);
  const fields = useMemo(() => {
    if (!activeScan) return [];
    if (definition) return definition.fields.filter((field) => !isTableCell(lineTables, field.key));
    const keys = Object.keys(activeScan.extractedData);
    return (keys.length ? keys : ['Document Notes']).map((key) => ({ key, label: titleCase(key), kind: 'text' as const, required: false }));
  }, [activeScan, definition, lineTables]);

  const tableRows = useMemo(() => {
    const rows: Array<{ key: string; label: string }> = [];
    for (const field of fields) {
      const match = TABLE_FIELD.exec(field.key);
      if (!match || match[2] !== 'Description') continue;
      if (TABLE_COLUMNS.every((column) => fields.some((other) => other.key === `${match[1]}${column}`))) rows.push({ key: match[1], label: field.label.replace(/\s*-\s*Description$/, '') });
    }
    return rows;
  }, [fields]);

  const canEdit = userRole === 'admin';
  const locked = Boolean(activeScan?.posted) || activeScan?.reviewStatus === 'rejected';
  const verification = activeScan?.verification || {};
  const checks = verification.checks || [];
  const flags = useMemo(() => fieldFlags(checks), [checks]);
  // dirty: the admin changed the data; the highlights show the last check until it runs again.
  const inputClass = (key: string, base: string) => `${base} ${flags.get(key) ? FLAG_INPUT[flags.get(key)!.status] : 'border-gray-300'}`;
  const passedChecks = checks.filter((check) => check.status === 'pass').length;
  const hasWarnings = verification.status === 'warning';
  const requirements = activeScan ? idRequirementsOf(activeScan, definition) : [];
  const needsPhoto = Boolean(activeScan && definition?.photoExpected && !activeScan.photo && activeScan.authenticity?.photoRecognized === false);
  const stillNeeded = listed([
    ...requirements.filter((requirement) => activeScan && !idDocumentOf(activeScan, requirement.slot)).map((requirement) => `the ${requirement.person}'s valid ID`),
    ...(needsPhoto ? ['a 2x2 picture'] : []),
  ]);
  const canPost = Boolean(activeScan && definition && !locked && !stillNeeded && activeScan.processingStatus !== 'failed'
    && (dirty || verification.status !== 'failed') && (!hasWarnings || dirty || acknowledged));
  const memberNumber = activeScan?.posted?.recordId || verification.target?.memberNumber;
  const authenticity = activeScan?.authenticity || {};
  const typeOptions = [...forms.filter((form) => !form.legacy || form.type === activeScan?.documentType).map((form) => form.type), ...REFERENCE_TYPES, UNRECOGNIZED];

  const requirementPanels = activeScan && requirements.length > 0 && activeScan.processingStatus !== 'failed' ? (
    <div className="space-y-4">
      {requirements.map((requirement) => (
        <IdDocumentPanel
          key={requirement.slot}
          requirement={requirement}
          id={idDocumentOf(activeScan, requirement.slot)}
          formName={activeScan.documentType.replace(/ Form$/, ' form').toLowerCase()}
          requiredSignatures={requiredIdSignatures}
          checks={checks.filter((check) => check.id === ID_CHECKS[requirement.slot][1])}
          editable={canEdit && !locked}
          submitting={busy === `id-${requirement.slot}`}
          disabled={Boolean(busy)}
          onUpload={(file) => void submitId(file, 'upload', requirement.slot)}
          onCapture={() => setIdCamera(requirement)}
          onView={() => void openProtectedFile(idDocumentPath(activeScan.id, requirement.slot)).catch((error) => toast.error('Unable to open the ID', { description: errorText(error, 'Please try again.') }))}
        />
      ))}
      {definition?.photoExpected && <FormPhotoPanel scan={activeScan} editable={canEdit && !locked} submitting={busy === 'photo'} disabled={Boolean(busy)} onUpload={(file) => void submitPhoto(file)} />}
    </div>
  ) : null;

  const scanPages = usePagination(scans, { pageSize: 5 });

  const summary = {
    total: scans.length,
    posted: scans.filter((scan) => scan.posted).length,
    review: scans.filter((scan) => !scan.posted && scan.reviewStatus !== 'rejected' && scan.processingStatus !== 'failed' && scan.verification?.status !== 'failed').length,
    flagged: scans.filter(isFlagged).length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div><p className="text-gray-600 mt-1">Upload or scan a cooperative form. AI identifies it, checks that it is genuine, verifies it against the records, and saves it to the right module.</p></div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-blue-50 rounded-lg"><ScanLine className="w-6 h-6 text-blue-600" /></div><div><p className="text-sm text-gray-600">Total Scans</p><p className="text-2xl font-bold text-gray-900">{summary.total}</p></div></div></div>
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-green-50 rounded-lg"><Database className="w-6 h-6 text-green-600" /></div><div><p className="text-sm text-gray-600">Saved to Records</p><p className="text-2xl font-bold text-gray-900">{summary.posted}</p></div></div></div>
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-yellow-50 rounded-lg"><AlertCircle className="w-6 h-6 text-yellow-600" /></div><div><p className="text-sm text-gray-600">Needs Review</p><p className="text-2xl font-bold text-gray-900">{summary.review}</p></div></div></div>
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-red-50 rounded-lg"><ShieldAlert className="w-6 h-6 text-red-600" /></div><div><p className="text-sm text-gray-600">Flagged</p><p className="text-2xl font-bold text-gray-900">{summary.flagged}</p></div></div>
          {canEdit && summary.flagged > 0 && <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void rejectFlagged()} disabled={rejectingFlagged} title="Mark every flagged scan as Rejected. Nothing is deleted." className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${confirmRejectFlagged ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-red-200 text-red-700 hover:bg-red-50'}`}><XCircle className="h-3.5 w-3.5" />{rejectingFlagged ? 'Rejecting...' : confirmRejectFlagged ? `Reject ${summary.flagged} ${summary.flagged === 1 ? 'scan' : 'scans'}?` : 'Reject all flagged'}</button>
            {confirmRejectFlagged && !rejectingFlagged && <button type="button" onClick={() => setConfirmRejectFlagged(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Cancel</button>}
          </div>}
        </div>
      </div>

      {canEdit && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Upload Document</h2>
          <div onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDragActive(false); const file = event.dataTransfer.files[0]; if (file) void processFile(file, 'upload'); }} className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
            <input type="file" id="file-upload" className="hidden" onChange={handleChange} accept="image/jpeg,image/png,image/webp,application/pdf" disabled={Boolean(processingStage)} />
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <label htmlFor="file-upload" className="cursor-pointer"><span className="text-blue-600 hover:text-blue-700 font-medium">Click to upload</span><span className="text-gray-600"> or drag and drop</span></label>
            <p className="text-sm text-gray-500 mt-2">PNG, JPG, WEBP, PDF up to 10MB.</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Scan Document</h2>
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
            <Camera className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <button type="button" onClick={() => setScannerOpen(true)} disabled={Boolean(processingStage)} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><ScanLine className="h-4 w-4" /> Open camera</button>
            <p className="text-sm text-gray-500 mt-2">Capture membership, loan, savings, machinery, Kadiwa Add Inventory or Kadiwa Daily Sales forms. Multi-page forms are supported.</p>
          </div>
        </div>
        {processingStage && <p className="md:col-span-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700 animate-pulse">{processingStage}</p>}
      </div>}

      {activeScan && <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <p className="text-sm text-gray-500">Document detected</p>
            <h2 className="text-xl font-bold text-gray-900">{activeScan.documentType}</h2>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">{activeScan.captureSource === 'camera' ? <Camera className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}{activeScan.fileName}</p>
            {activeScan.targetModule && <p className="text-sm text-gray-600 mt-1">Goes to: <span className="font-medium">{activeScan.targetModule}</span></p>}
            {definition?.module === 'members' && <p className="text-sm text-gray-600 mt-1">Membership No.: {activeScan.posted
              ? <span className="font-semibold text-gray-900">{memberNumber}</span>
              : <><span className="font-semibold text-gray-900">{memberNumber || 'Pending'}</span> <span className="text-gray-500">(given by the system when the member is saved)</span></>}</p>}
          </div>
          <div className="text-right space-y-1">
            <StatusBadge {...scanStatus(activeScan)} />
            <p className="text-sm text-gray-600" title="The share of verification checks that passed. Forms are saved automatically only when every check passes.">Confidence: <span className="font-semibold">{checks.length ? `${passedChecks} of ${checks.length} checks passed` : 'Not checked yet'}</span>{activeScan.confidence !== null && checks.length > 0 && <span className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${activeScan.confidence === 100 ? 'bg-green-100 text-green-800' : activeScan.confidence >= 75 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{activeScan.confidence}%</span>}</p>
          </div>
        </div>

        {activeScan.posted && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><Database className="h-5 w-5 shrink-0" /><p>{activeScan.posted.automatically ? 'Every check passed, so this document was saved automatically' : 'This document was verified and saved'} to <strong>{activeScan.targetModule || activeScan.posted.module}</strong> as record <strong>{activeScan.posted.recordId}</strong> on {new Date(activeScan.posted.at).toLocaleString()}.{activeScan.posted.undoUntil && <> You can undo it until {new Date(activeScan.posted.undoUntil).toLocaleString()}.</>}</p></div>
          {canEdit && activeScan.posted.undoUntil && <div className="flex shrink-0 items-center gap-2">
            {confirmUndo && <button type="button" onClick={() => setConfirmUndo(false)} disabled={busy === 'undo'} className="rounded-lg border border-green-300 px-3 py-2 text-green-900 hover:bg-green-100">Keep it</button>}
            <button type="button" onClick={() => void undo()} disabled={Boolean(busy)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 font-semibold disabled:opacity-50 ${confirmUndo ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-green-300 text-green-900 hover:bg-green-100'}`}><Undo2 className="h-4 w-4" />{busy === 'undo' ? 'Undoing...' : confirmUndo ? `Remove ${activeScan.posted.module === 'members' ? 'the member' : 'the request'}` : 'Undo'}</button>
          </div>}
        </div>}
        {activeScan.undone && !activeScan.posted && <div className="mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Undo2 className="h-5 w-5 shrink-0" /><p>The automatic save was undone on {new Date(activeScan.undone.at).toLocaleString()} (record {activeScan.undone.recordId} removed). The scan is saved again only when you save it.</p></div>}
        {activeScan.processingStatus === 'failed' && <div className={`mt-4 flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${queued(activeScan) ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {queued(activeScan)
            ? <p className="flex gap-2"><Clock className="h-5 w-5 shrink-0" /><span>The AI service was busy, so this document is queued. It is read again automatically at about {timeOf(activeScan.retry!.nextAt!)} (try {activeScan.retry!.count + 1} of {activeScan.retry!.max + 1}); you do not need to do anything.</span></p>
            : <p>AI could not read this document: {activeScan.processingError || 'unknown error'}</p>}
          {canEdit && <button type="button" onClick={() => void retryReading()} disabled={Boolean(busy)} className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${queued(activeScan) ? 'border border-blue-300 text-blue-900 hover:bg-blue-100' : 'bg-red-600 text-white hover:bg-red-700'}`}><RefreshCw className={`h-4 w-4 ${busy === 'retry' ? 'animate-spin' : ''}`} />{busy === 'retry' ? 'Reading again...' : queued(activeScan) ? 'Read now' : 'Retry AI reading'}</button>}
        </div>}
        {activeScan.processingStatus !== 'failed' && !activeScan.posted && flags.size > 0 && !locked && <div className="mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" /><p>{flags.size === 1 ? '1 field needs' : `${flags.size} fields need`} a look: {[...flags.keys()].map((key) => fields.find((field) => field.key === key)?.label.replace(/\s*\(.*\)$/, '') ?? titleCase(key.replace(/^(line|good|store|expense)(\d+)/, '$1 $2 '))).join(', ')}. They are highlighted below; every other value passed the checks.</p></div>}
        {activeScan.documentType === UNRECOGNIZED && activeScan.processingStatus !== 'failed' && <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">The document type could not be identified confidently. Choose the correct type below.</div>}

        {requirementPanels && <div ref={idPanelRef} className="mt-5">{requirementPanels}</div>}

        {activeScan.processingStatus !== 'failed' && <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">{authenticity.verdict === 'genuine' ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldAlert className={`h-5 w-5 ${authenticity.verdict === 'fake' ? 'text-red-600' : 'text-amber-600'}`} />}<h3 className="font-semibold text-gray-900">Authenticity check</h3></div>
            <p className="text-sm text-gray-700">AI verdict: <span className="font-semibold capitalize">{authenticity.verdict || 'unknown'}</span>{typeof authenticity.score === 'number' && <> ({authenticity.score}/100)</>}</p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li>Original paper form: {authenticity.physicalDocument === true ? 'Yes' : authenticity.physicalDocument === false ? 'No / screen or edited image' : 'Unknown'}</li>
              <li>Form filled in: {authenticity.filledIn === true ? 'Yes' : authenticity.filledIn === false ? 'No (blank or sample)' : 'Unknown'}</li>
              <li>Signature present: {authenticity.signaturePresent === true ? 'Yes' : authenticity.signaturePresent === false ? 'No' : 'Unknown'}</li>
              {definition?.photoExpected && <li>2x2 picture recognized on the form: {authenticity.photoRecognized === true ? 'Yes' : authenticity.photoRecognized === false ? 'No' : 'Unknown'}</li>}
            </ul>
            {(authenticity.issues?.length ?? 0) > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">{authenticity.issues!.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold text-gray-900">Verification against records</h3>
              {!locked && <button type="button" onClick={() => void recheck()} disabled={Boolean(busy) || dirty} title={dirty ? 'Save your corrections first' : undefined} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy === 'verify' ? 'animate-spin' : ''}`} /> Check again</button>}
            </div>
            {dirty && <p className="mb-2 text-sm text-amber-700">You changed the data. It will be checked again when you save or post.</p>}
            {checks.length === 0 ? <p className="text-sm text-gray-500">Not verified yet.</p> : <ul className="space-y-2">{checks.map((check) => {
              const { icon: Icon, className } = CHECK_STYLE[check.status];
              return <li key={check.id} className="flex gap-2 text-sm"><Icon className={`h-4 w-4 mt-0.5 shrink-0 ${className}`} aria-label={check.status} /><div><p className="font-medium text-gray-800">{check.label}</p><p className="text-gray-600">{check.message}</p></div></li>;
            })}</ul>}
          </div>
        </div>}

        {canEdit && !locked && activeScan.processingStatus !== 'failed' && <div className="mt-5"><label className="text-sm font-medium text-gray-700">Document type</label><select value={activeScan.documentType} onChange={(event) => changeType(event.target.value)} className="mt-1 block w-full rounded-xl border border-gray-300 p-2.5 text-sm">{typeOptions.map((type) => <option key={type}>{type}</option>)}</select></div>}

        {fields.length > 0 && activeScan.processingStatus !== 'failed' && <div className="mt-5">
          <p className="text-sm font-medium text-gray-700 mb-3">Extracted information {!locked && <span className="font-normal text-gray-500">— compare each value with the paper form</span>}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{fields.filter((field) => !tableRows.some((row) => field.key.startsWith(row.key) && TABLE_FIELD.test(field.key))).map((field) => (
            <label key={field.key} className="text-sm text-gray-700">{field.label}{field.required && <span className="text-red-600"> *</span>}
              <input
                type={field.kind === 'date' ? 'date' : 'text'}
                inputMode={field.kind === 'money' || field.kind === 'number' ? 'decimal' : field.kind === 'integer' ? 'numeric' : field.kind === 'phone' ? 'tel' : undefined}
                value={activeScan.extractedData[field.key] || ''}
                onChange={(event) => updateField(field.key, event.target.value)}
                disabled={locked || !canEdit}
                aria-invalid={flags.get(field.key)?.status === 'fail' || undefined}
                className={inputClass(field.key, 'mt-1 block w-full rounded-xl border p-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-600')}
              />
              {flags.get(field.key) && !locked && <span className={`mt-1 block text-xs ${flags.get(field.key)!.status === 'fail' ? 'text-red-700' : 'text-amber-700'}`}>Check: {flags.get(field.key)!.labels.join(', ')}</span>}
            </label>
          ))}</div>
          {tableRows.length > 0 && <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-3 py-2 font-semibold">Item</th>{TABLE_COLUMNS.map((column) => <th key={column} className="px-3 py-2 font-semibold">{TABLE_COLUMN_LABELS[column]}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">{tableRows.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{row.label}</td>
                  {TABLE_COLUMNS.map((column) => <td key={column} className="px-2 py-1.5"><input aria-label={`${row.label} ${TABLE_COLUMN_LABELS[column]}`} value={activeScan.extractedData[`${row.key}${column}`] || ''} onChange={(event) => updateField(`${row.key}${column}`, event.target.value)} disabled={locked || !canEdit} inputMode={column === 'Description' || column === 'Unit' ? undefined : 'decimal'} className={inputClass(`${row.key}${column}`, 'w-full rounded-lg border p-2 text-sm disabled:bg-gray-50 disabled:text-gray-600')} /></td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>}
          {lineTables.map((lines) => {
            const shown = shownLines(lines, activeScan.extractedData, addedLines[lines.id] ?? 0);
            const canAdd = canEdit && !locked && (shown[shown.length - 1] ?? 0) < lines.rows;
            return (
              <div key={lines.id} className="mt-4">
                <p className="mb-2 text-sm font-semibold text-gray-800">{lines.label} <span className="font-normal text-gray-500">({shown.length} {shown.length === 1 ? 'line' : 'lines'})</span></p>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm" style={{ minWidth: `${Math.max(420, lines.columns.length * 120)}px` }}>
                    <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="w-10 px-3 py-2 font-semibold">#</th>{lines.columns.map((column) => <th key={column.key} className="px-3 py-2 font-semibold">{column.label}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {shown.map((line) => (
                        <tr key={line}>
                          <td className="px-3 py-2 text-gray-500">{line}</td>
                          {lines.columns.map((column) => <td key={column.key} className="px-2 py-1.5"><input aria-label={`${lines.label} line ${line} ${column.label}`} value={activeScan.extractedData[cellKey(lines, line, column.key)] || ''} onChange={(event) => updateField(cellKey(lines, line, column.key), event.target.value)} disabled={locked || !canEdit} inputMode={column.kind === 'money' || column.kind === 'number' ? 'decimal' : undefined} className={inputClass(cellKey(lines, line, column.key), 'w-full rounded-lg border p-2 text-sm disabled:bg-gray-50 disabled:text-gray-600')} /></td>)}
                        </tr>
                      ))}
                      {!shown.length && <tr><td colSpan={lines.columns.length + 1} className="px-3 py-4 text-center text-gray-500">Nothing was read in this part of the form.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {canAdd && <button type="button" onClick={() => setAddedLines((current) => ({ ...current, [lines.id]: (current[lines.id] ?? 0) + 1 }))} className="mt-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-green-700 hover:bg-green-50"><Plus className="h-4 w-4" />Add line</button>}
              </div>
            );
          })}

          {canEdit && !locked && <div className="mt-5 space-y-3">
            {definition && hasWarnings && !dirty && <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5" />I compared the flagged items with the original paper form and confirm the document is genuine.</label>}
            <div className="flex flex-wrap gap-2">
              {definition && <button type="button" disabled={!canPost || Boolean(busy)} onClick={() => void post()} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"><Database className="h-4 w-4" />{busy === 'post' ? 'Saving...' : `Save to ${definition.moduleLabel.replace(/\s*\(.*\)$/, '')}`}</button>}
              <button type="button" disabled={Boolean(busy)} onClick={() => void saveReview()} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">{busy === 'save' ? 'Saving...' : 'Save corrections'}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void saveReview(true)} className="px-4 py-2 border border-red-200 text-red-700 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50">{busy === 'reject' ? 'Rejecting...' : 'Reject document'}</button>
            </div>
            {stillNeeded ? <p className="text-sm text-amber-800">Submit {stillNeeded} above before saving.</p>
              : definition && verification.status === 'failed' && !dirty && <p className="text-sm text-red-700">This document cannot be saved until the failed checks are fixed. Correct the data from the paper form, or reject it if it is not genuine.</p>}
          </div>}
        </div>}
      </div>}

      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200"><h2 className="text-lg font-bold text-gray-900 mb-4">Recent Scans</h2>{scans.length === 0 ? <p className="text-sm text-gray-500">Uploaded and scanned documents will appear here after AI analysis.</p> : <div className="space-y-3">{scanPages.pageItems.map((scan) => (
        <div key={scan.id} className={`flex items-center gap-2 border rounded-lg pr-2 hover:bg-gray-50 ${activeScan?.id === scan.id ? 'border-green-300 bg-green-50/40' : 'border-gray-200'}`}>
          <button type="button" onClick={() => showScan(scan)} className="min-w-0 flex-1 p-4 text-left"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-blue-50">{scan.captureSource === 'camera' ? <Camera className="w-5 h-5 text-blue-600" /> : <User className="w-5 h-5 text-blue-600" />}</div><div className="min-w-0"><p className="font-bold text-gray-900 truncate">{scan.documentType}</p><p className="text-sm text-gray-500 truncate">{scan.fileName}{scan.posted ? ` · ${scan.posted.module} ${scan.posted.recordId}` : ''}</p></div><span className="ml-auto shrink-0"><StatusBadge {...scanStatus(scan)} /></span></div></button>
          {canEdit && !scan.posted && <div className="flex shrink-0 items-center gap-1">
            {confirmDeleteId === scan.id && deletingId !== scan.id && <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-white">Cancel</button>}
            <button type="button" onClick={() => void removeScan(scan)} disabled={deletingId !== null} aria-label={`Delete ${scan.fileName}`} title="Delete this scan and its file" className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${confirmDeleteId === scan.id ? 'bg-red-600 text-white hover:bg-red-700' : 'text-red-600 hover:bg-red-50'}`}><Trash2 className="h-4 w-4" />{deletingId === scan.id ? 'Deleting...' : confirmDeleteId === scan.id ? 'Delete?' : ''}</button>
          </div>}
        </div>
      ))}<Pagination className="-mx-6 -mb-6 mt-4" page={scanPages.page} totalPages={scanPages.totalPages} total={scanPages.total} pageSize={scanPages.pageSize} onPageChange={scanPages.setPage} onPageSizeChange={scanPages.setPageSize} label="scans" /></div>}</div>

      {scannerOpen && <DocumentScannerModal onClose={() => setScannerOpen(false)} onScanned={(file) => { setScannerOpen(false); void processFile(file, 'camera'); }} />}
      {requirementsOpen && activeScan && requirementPanels && !requirementsDone(activeScan) && (
        <ScanRequirementsModal
          {...requirementsText(activeScan, requiredIdSignatures)}
          problems={requirementProblems(activeScan)}
          onClose={() => { setRequirementsOpen(false); setTimeout(() => idPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }}
        >{requirementPanels}</ScanRequirementsModal>
      )}
      {idCamera && (
        <DocumentScannerModal
          variant={idCamera.cardCapture ? 'id' : 'idCopy'}
          person={idCamera.person}
          requiredSignatures={requiredIdSignatures}
          onClose={() => setIdCamera(null)}
          onScanned={(file) => { setIdCamera(null); void submitId(file, 'camera', idCamera.slot); }}
        />
      )}
    </div>
  );
}
