import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Camera, CheckCircle, CheckCircle2, Database, FileText, RefreshCw, ScanLine, ShieldAlert, ShieldCheck, Upload, User, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { Pagination, StatusBadge } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { DocumentScannerModal } from '../components/DocumentScannerModal';
import {
  analyzeDocument, fetchDocumentScans, fetchFormDefinitions, OcrFormDefinition, OcrScan, postDocument, retryDocumentReading, saveDocumentReview, verifyDocument, type CheckStatus,
} from '../services/ocrApi';

const UNRECOGNIZED = 'Document Type Not Recognized';
const REFERENCE_TYPES = ['Payment Receipt', 'ID Document', 'Cooperative Form'];
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

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

function scanStatus(scan: OcrScan): { status: string; label: string } {
  if (scan.posted) return { status: 'completed', label: 'Saved to records' };
  if (scan.processingStatus === 'failed') return { status: 'failed', label: 'Not read' };
  if (scan.reviewStatus === 'rejected') return { status: 'rejected', label: 'Rejected' };
  if (scan.verification?.status === 'failed') return { status: 'overdue', label: 'Flagged' };
  return { status: 'pending', label: 'Needs review' };
}

export function OCRScanner({ userRole }: OCRScannerProps) {
  const [scans, setScans] = useState<OcrScan[]>([]);
  const [forms, setForms] = useState<OcrFormDefinition[]>([]);
  const [autoPost, setAutoPost] = useState(true);
  const [activeScan, setActiveScan] = useState<OcrScan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState<'' | 'save' | 'verify' | 'post' | 'reject' | 'retry'>('');
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    fetchDocumentScans()
      .then(({ data }) => setScans(data))
      .catch((error) => toast.error('Unable to load document scans', { description: errorText(error, 'Please refresh and try again.') }));
    fetchFormDefinitions()
      .then(({ data, autoPost: enabled }) => { setForms(data); setAutoPost(enabled); })
      .catch(() => undefined);
  }, []);

  const showScan = (scan: OcrScan) => {
    setActiveScan(scan);
    setDirty(false);
    setAcknowledged(false);
  };

  const storeScan = (scan: OcrScan) => {
    showScan(scan);
    setScans((current) => [scan, ...current.filter((item) => item.id !== scan.id)]);
  };

  const processFile = async (file: File, source: 'upload' | 'camera') => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported file type', { description: 'Upload a PNG, JPG, WEBP, or PDF document.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large', { description: 'Documents must not exceed 10 MB.' });
      return;
    }
    try {
      setProcessingStage('AI is reading the document, checking that it is genuine, and verifying it against the records. This can take up to a minute...');
      const { data, message } = await analyzeDocument(file, source);
      storeScan(data);
      if (data.processingStatus === 'failed') toast.error('AI recognition failed', { description: data.processingError || 'Review the document or retry.' });
      else if (data.posted) toast.success('Document saved to records', { description: message });
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
  const fields = useMemo(() => {
    if (!activeScan) return [];
    if (definition) return definition.fields;
    const keys = Object.keys(activeScan.extractedData);
    return (keys.length ? keys : ['Document Notes']).map((key) => ({ key, label: titleCase(key), kind: 'text' as const, required: false }));
  }, [activeScan, definition]);

  const canEdit = userRole === 'admin';
  const locked = Boolean(activeScan?.posted) || activeScan?.reviewStatus === 'rejected';
  const verification = activeScan?.verification || {};
  const checks = verification.checks || [];
  const hasWarnings = verification.status === 'warning';
  const canPost = Boolean(activeScan && definition && !locked && activeScan.processingStatus !== 'failed'
    && (dirty || verification.status !== 'failed') && (!hasWarnings || dirty || acknowledged));
  const authenticity = activeScan?.authenticity || {};
  const typeOptions = [...forms.map((form) => form.type), ...REFERENCE_TYPES, UNRECOGNIZED];

  const scanPages = usePagination(scans, { pageSize: 5 });

  const summary = {
    total: scans.length,
    posted: scans.filter((scan) => scan.posted).length,
    review: scans.filter((scan) => !scan.posted && scan.reviewStatus !== 'rejected' && scan.processingStatus !== 'failed' && scan.verification?.status !== 'failed').length,
    flagged: scans.filter((scan) => !scan.posted && scan.reviewStatus !== 'rejected' && (scan.verification?.status === 'failed' || scan.processingStatus === 'failed')).length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div><p className="text-gray-600 mt-1">Upload or scan a cooperative form. AI identifies it, checks that it is genuine, verifies it against the records, and saves it to the right module.</p></div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-blue-50 rounded-lg"><ScanLine className="w-6 h-6 text-blue-600" /></div><div><p className="text-sm text-gray-600">Total Scans</p><p className="text-2xl font-bold text-gray-900">{summary.total}</p></div></div></div>
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-green-50 rounded-lg"><Database className="w-6 h-6 text-green-600" /></div><div><p className="text-sm text-gray-600">Saved to Records</p><p className="text-2xl font-bold text-gray-900">{summary.posted}</p></div></div></div>
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-yellow-50 rounded-lg"><AlertCircle className="w-6 h-6 text-yellow-600" /></div><div><p className="text-sm text-gray-600">Needs Review</p><p className="text-2xl font-bold text-gray-900">{summary.review}</p></div></div></div>
        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-card)] border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-red-50 rounded-lg"><ShieldAlert className="w-6 h-6 text-red-600" /></div><div><p className="text-sm text-gray-600">Flagged</p><p className="text-2xl font-bold text-gray-900">{summary.flagged}</p></div></div></div>
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
            <p className="text-sm text-gray-500 mt-2">Capture membership, loan, savings, machinery, or Kadiwa sales forms. Multi-page forms are supported.</p>
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
          </div>
          <div className="text-right space-y-1">
            <StatusBadge {...scanStatus(activeScan)} />
            <p className="text-sm text-gray-600">Reading confidence: <span className="font-semibold">{activeScan.confidence === null ? 'Unavailable' : `${activeScan.confidence}%`}</span></p>
          </div>
        </div>

        {activeScan.posted && <div className="mt-4 flex gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"><Database className="h-5 w-5 shrink-0" /><p>{activeScan.posted.automatically ? 'AI verified this document and saved it automatically' : 'This document was verified and saved'} to <strong>{activeScan.targetModule || activeScan.posted.module}</strong> as record <strong>{activeScan.posted.recordId}</strong> on {new Date(activeScan.posted.at).toLocaleString()}.</p></div>}
        {activeScan.processingStatus === 'failed' && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><p>AI could not read this document: {activeScan.processingError || 'unknown error'}</p>{canEdit && <button type="button" onClick={() => void retryReading()} disabled={Boolean(busy)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${busy === 'retry' ? 'animate-spin' : ''}`} />{busy === 'retry' ? 'Reading again...' : 'Retry AI reading'}</button>}</div>}
        {activeScan.documentType === UNRECOGNIZED && activeScan.processingStatus !== 'failed' && <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">The document type could not be identified confidently. Choose the correct type below.</div>}

        {activeScan.processingStatus !== 'failed' && <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">{authenticity.verdict === 'genuine' ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldAlert className={`h-5 w-5 ${authenticity.verdict === 'fake' ? 'text-red-600' : 'text-amber-600'}`} />}<h3 className="font-semibold text-gray-900">Authenticity check</h3></div>
            <p className="text-sm text-gray-700">AI verdict: <span className="font-semibold capitalize">{authenticity.verdict || 'unknown'}</span>{typeof authenticity.score === 'number' && <> ({authenticity.score}/100)</>}</p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li>Original paper form: {authenticity.physicalDocument === true ? 'Yes' : authenticity.physicalDocument === false ? 'No / screen or edited image' : 'Unknown'}</li>
              <li>Form filled in: {authenticity.filledIn === true ? 'Yes' : authenticity.filledIn === false ? 'No (blank or sample)' : 'Unknown'}</li>
              <li>Signature present: {authenticity.signaturePresent === true ? 'Yes' : authenticity.signaturePresent === false ? 'No' : 'Unknown'}</li>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{fields.map((field) => (
            <label key={field.key} className="text-sm text-gray-700">{field.label}{field.required && <span className="text-red-600"> *</span>}
              <input
                type={field.kind === 'date' ? 'date' : 'text'}
                inputMode={field.kind === 'money' || field.kind === 'number' ? 'decimal' : field.kind === 'integer' ? 'numeric' : undefined}
                value={activeScan.extractedData[field.key] || ''}
                onChange={(event) => updateField(field.key, event.target.value)}
                disabled={locked || !canEdit}
                className="mt-1 block w-full rounded-xl border border-gray-300 p-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-600"
              />
            </label>
          ))}</div>

          {canEdit && !locked && <div className="mt-5 space-y-3">
            {definition && hasWarnings && !dirty && <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5" />I compared the flagged items with the original paper form and confirm the document is genuine.</label>}
            <div className="flex flex-wrap gap-2">
              {definition && <button type="button" disabled={!canPost || Boolean(busy)} onClick={() => void post()} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"><Database className="h-4 w-4" />{busy === 'post' ? 'Saving...' : `Save to ${definition.moduleLabel.replace(/\s*\(.*\)$/, '')}`}</button>}
              <button type="button" disabled={Boolean(busy)} onClick={() => void saveReview()} className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">{busy === 'save' ? 'Saving...' : 'Save corrections'}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void saveReview(true)} className="px-4 py-2 border border-red-200 text-red-700 text-sm rounded-lg hover:bg-red-50 disabled:opacity-50">{busy === 'reject' ? 'Rejecting...' : 'Reject document'}</button>
            </div>
            {definition && verification.status === 'failed' && !dirty && <p className="text-sm text-red-700">This document cannot be saved until the failed checks are fixed. Correct the data from the paper form, or reject it if it is not genuine.</p>}
          </div>}
        </div>}
      </div>}

      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200"><h2 className="text-lg font-bold text-gray-900 mb-4">Recent Scans</h2>{scans.length === 0 ? <p className="text-sm text-gray-500">Uploaded and scanned documents will appear here after AI analysis.</p> : <div className="space-y-3">{scanPages.pageItems.map((scan) => <button type="button" key={scan.id} onClick={() => showScan(scan)} className={`w-full text-left border rounded-lg p-4 hover:bg-gray-50 ${activeScan?.id === scan.id ? 'border-green-300 bg-green-50/40' : 'border-gray-200'}`}><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-blue-50">{scan.captureSource === 'camera' ? <Camera className="w-5 h-5 text-blue-600" /> : <User className="w-5 h-5 text-blue-600" />}</div><div className="min-w-0"><p className="font-bold text-gray-900 truncate">{scan.documentType}</p><p className="text-sm text-gray-500 truncate">{scan.fileName}{scan.posted ? ` · ${scan.posted.module} ${scan.posted.recordId}` : ''}</p></div><span className="ml-auto"><StatusBadge {...scanStatus(scan)} /></span></div></button>)}<Pagination className="-mx-6 -mb-6 mt-4" page={scanPages.page} totalPages={scanPages.totalPages} total={scanPages.total} pageSize={scanPages.pageSize} onPageChange={scanPages.setPage} onPageSizeChange={scanPages.setPageSize} label="scans" /></div>}</div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6"><div className="flex gap-3"><FileText className="w-5 h-5 text-blue-700 shrink-0" /><div className="text-sm text-blue-800 space-y-1"><p>AI reads each form, checks it for signs of tampering, blank templates, screen photos and missing signatures, then verifies it against the member, machinery and inventory records and the module's own rules.</p><p>{autoPost ? 'Forms that pass every check with high confidence are saved automatically; anything uncertain is held here for review. Loan and machinery forms enter their approval queues as pending requests.' : 'Automatic saving is turned off: every verified form waits here for an admin to save it.'}</p><p className="flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Every scan and save is recorded in the audit log.</p></div></div></div>

      {scannerOpen && <DocumentScannerModal onClose={() => setScannerOpen(false)} onScanned={(file) => { setScannerOpen(false); void processFile(file, 'camera'); }} />}
    </div>
  );
}
