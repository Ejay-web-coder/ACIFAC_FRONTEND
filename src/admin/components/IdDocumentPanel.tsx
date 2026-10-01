import type { ChangeEvent, ReactNode } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Eye, FileUp, IdCard, RefreshCw, XCircle } from 'lucide-react';
import type { OcrIdDocument, OcrIdRequirement, VerificationCheck } from '../services/ocrApi';

// A valid ID a scanned form needs before it can be saved.
// - Membership form: the applicant's ID, either an uploaded back-to-back copy
//   (front and back of the ID on one page) with the specimen signatures, or the
//   ID card itself captured with the live camera (cardCapture).
// - Loan form (scanned, or typed into the app): the borrower's and the
//   co-maker's IDs, each a back-to-back copy with their specimen signatures,
//   uploaded or photographed with the camera.

interface IdDocumentPanelProps {
  requirement: OcrIdRequirement;
  /** The submitted ID, or null. */
  id: OcrIdDocument | null;
  /** "membership form", "loan form" or "loan application". */
  formName: string;
  requiredSignatures: number;
  /** AI's checks of the ID, e.g. whether it belongs to the person on the form. */
  checks?: VerificationCheck[];
  /** Why the ID could not be submitted. */
  error?: string;
  /** The admin may submit or replace the ID (not saved or rejected yet). */
  editable: boolean;
  submitting: boolean;
  disabled: boolean;
  onUpload: (file: File) => void;
  onCapture: () => void;
  onView: () => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

function UploadButton({ label, disabled, onUpload, compact = false }: { label: string; disabled: boolean; onUpload: (file: File) => void; compact?: boolean }) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onUpload(file);
  };
  return (
    <label className={`inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold ${compact ? 'border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50' : 'bg-slate-800 px-4 py-2 text-white hover:bg-slate-700'} ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
      <FileUp className="h-4 w-4" /> {label}
      <input type="file" accept={ACCEPT} className="hidden" disabled={disabled} onChange={onChange} />
    </label>
  );
}

function Option({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-800">{icon}</div>
        <div><p className="font-semibold text-gray-900">{title}</p><p className="text-sm text-gray-600">{text}</p></div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function sidesShown(front: boolean | null | undefined, back: boolean | null | undefined) {
  if (front && back) return 'Front and back';
  if (front) return back === false ? 'Front only' : 'Front';
  if (back) return 'Back only';
  return 'Unknown';
}

const MATCH_STYLE = {
  pass: { icon: CheckCircle2, className: 'border-green-200 bg-green-50 text-green-800' },
  warn: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-800' },
  fail: { icon: XCircle, className: 'border-red-200 bg-red-50 text-red-800' },
};

export function IdDocumentPanel({ requirement, id, formName, requiredSignatures, checks = [], error, editable, submitting, disabled, onUpload, onCapture, onView }: IdDocumentPanelProps) {
  const busy = disabled || submitting;
  const { person, label, cardCapture } = requirement;
  const copyText = `A photocopy of the front and back of the ID on one page, with the ${person}'s ${requiredSignatures} specimen signatures.`;

  if (!id) {
    if (!editable) return null;
    return (
      <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4" aria-label={label}>
        <div className="flex items-center gap-2"><IdCard className="h-5 w-5 text-amber-700" /><h3 className="font-semibold text-gray-900">{label} <span className="text-red-600">*</span></h3></div>
        <p className="mt-1 text-sm text-amber-900">
          {cardCapture
            ? `The ${formName} is saved only with the ${person}'s valid ID. Submit one of these:`
            : `The ${formName} is saved only with the ${person}'s valid ID: the front and back of the ID on one page, with the ${person}'s ${requiredSignatures} specimen signatures. Submit it one of these ways:`}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Option icon={<FileUp className="h-5 w-5" />} title={cardCapture ? 'Back-to-back copy' : 'Upload the signed copy'} text={cardCapture ? copyText : 'A scan or picture (PNG, JPG, WEBP or PDF) of the signed back-to-back copy.'}>
            <UploadButton label={cardCapture ? 'Upload copy' : 'Upload picture'} disabled={busy} onUpload={onUpload} />
          </Option>
          <Option icon={<Camera className="h-5 w-5" />} title={cardCapture ? 'Live camera' : 'Take a picture'} text={cardCapture ? 'The ID card itself, captured now with the camera: the front, then the back.' : 'Photograph the signed back-to-back copy now with the camera.'}>
            <button type="button" onClick={onCapture} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Camera className="h-4 w-4" /> Open camera</button>
          </Option>
        </div>
        {submitting && <p className="mt-3 animate-pulse text-sm text-blue-700">AI is checking the ID and comparing it with the {person} on the form...</p>}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </section>
    );
  }

  const reading = id.reading || {};
  const liveCard = cardCapture && id.source === 'camera';
  const signatures = reading.signatureCount;
  const rows: Array<[string, ReactNode]> = [
    ['ID type', reading.idType || '—'],
    ['ID No.', reading.idNumber || '—'],
    ['Name on the ID', reading.name || '—'],
    ['Birthday on the ID', reading.dateOfBirth || '—'],
    ...(reading.address ? [['Address on the ID', reading.address] as [string, ReactNode]] : []),
    ['Sides shown', sidesShown(reading.frontVisible, reading.backVisible)],
    liveCard
      ? ['The ID card itself', reading.screen ? 'No, a screen' : reading.photocopy ? 'No, a photocopy' : reading.photocopy === false && reading.screen === false ? 'Yes' : 'Unknown']
      : ['Specimen signatures', typeof signatures === 'number'
        ? <span className={signatures < requiredSignatures ? 'font-semibold text-red-700' : 'font-semibold text-green-700'}>{signatures} of {requiredSignatures}</span>
        : 'Could not be counted'],
  ];

  return (
    <section className="rounded-xl border border-gray-200 p-4" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <IdCard className="h-5 w-5 text-gray-700" />
          <h3 className="font-semibold text-gray-900">{label}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{liveCard ? 'Live camera' : id.source === 'camera' ? 'Copy taken with the camera' : 'Back-to-back copy'}</span>
        </div>
        <button type="button" onClick={onView} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"><Eye className="h-4 w-4" /> View ID</button>
      </div>
      <p className="mt-1 truncate text-sm text-gray-500">{id.fileName}</p>
      {reading.error
        ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">AI could not read the ID ({reading.error}). Open it and check it yourself, or submit it again.</p>
        : <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{rows.map(([rowLabel, value]) => (
          <div key={rowLabel} className="flex justify-between gap-3 border-b border-gray-100 pb-1"><dt className="shrink-0 text-gray-500">{rowLabel}</dt><dd className="min-w-0 break-words text-right font-medium text-gray-900">{value}</dd></div>
        ))}</dl>}
      {(reading.issues?.length ?? 0) > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">{reading.issues!.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      {checks.map((check) => {
        const style = MATCH_STYLE[check.status];
        return (
          <div key={check.id} className={`mt-3 flex gap-2 rounded-lg border px-3 py-2 text-sm ${style.className}`}>
            <style.icon className="mt-0.5 h-4 w-4 shrink-0" aria-label={check.status} />
            <p><span className="font-semibold">{check.label}:</span> {check.message}</p>
          </div>
        );
      })}
      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500">Submit another:</span>
          <UploadButton label={cardCapture ? 'Back-to-back copy' : 'Upload picture'} disabled={busy} onUpload={onUpload} compact />
          <button type="button" onClick={onCapture} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Camera className="h-4 w-4" /> {cardCapture ? 'Live camera' : 'Take a picture'}</button>
          {submitting && <span className="inline-flex items-center gap-1 text-blue-700"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking the ID...</span>}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
