import { useEffect, useState, type ChangeEvent } from 'react';
import { CheckCircle2, ImagePlus, RefreshCw, UserSquare } from 'lucide-react';
import { fetchProtectedImage } from '../../lib/profilePhoto';
import { photoPath, type OcrScan } from '../services/ocrApi';

// The applicant's 2x2 picture for a scanned membership form. When AI can
// recognize the face in the form's photo box nothing more is needed; otherwise
// the admin uploads a 2x2 picture, which becomes the member's photo.

interface FormPhotoPanelProps {
  scan: OcrScan;
  /** The admin may upload or replace the picture (not saved or rejected yet). */
  editable: boolean;
  submitting: boolean;
  disabled: boolean;
  onUpload: (file: File) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

function UploadPhotoButton({ label, disabled, onUpload, compact = false }: { label: string; disabled: boolean; onUpload: (file: File) => void; compact?: boolean }) {
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onUpload(file);
  };
  return (
    <label className={`inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold ${compact ? 'border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50' : 'bg-green-600 px-4 py-2 text-white hover:bg-green-700'} ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
      <ImagePlus className="h-4 w-4" /> {label}
      <input type="file" accept={ACCEPT} className="hidden" disabled={disabled} onChange={onChange} />
    </label>
  );
}

export function FormPhotoPanel({ scan, editable, submitting, disabled, onUpload }: FormPhotoPanelProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const uploaded = scan.photo;
  const recognized = scan.authenticity?.photoRecognized;
  const busy = disabled || submitting;

  // Loads the uploaded picture again whenever the scan changes (a replaced picture).
  useEffect(() => {
    if (!uploaded) { setPreview(null); return undefined; }
    let url: string | null = null;
    let cancelled = false;
    fetchProtectedImage(photoPath(scan.id)).then((objectUrl) => {
      if (cancelled) { if (objectUrl) URL.revokeObjectURL(objectUrl); return; }
      url = objectUrl;
      setPreview(objectUrl);
    }).catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [scan.id, scan.updatedAt, uploaded]);

  if (uploaded) {
    const reading = uploaded.reading || {};
    const clear = reading.portrait !== false && reading.faceVisible !== false;
    return (
      <section className="rounded-xl border border-gray-200 p-4" aria-label="Applicant's 2x2 picture">
        <div className="flex items-center gap-2"><UserSquare className="h-5 w-5 text-gray-700" /><h3 className="font-semibold text-gray-900">Applicant's 2x2 picture</h3><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">Uploaded</span></div>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">{preview && <img src={preview} alt="Uploaded 2x2 picture" className="h-full w-full object-cover" />}</div>
          <div className="min-w-0 space-y-1 text-sm">
            {reading.error
              ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">AI could not check the picture ({reading.error}). Check it yourself, or upload it again.</p>
              : <p className={clear ? 'font-medium text-green-700' : 'font-medium text-red-700'}>{clear ? 'The face is clear.' : 'The face is not clear. Upload a clear 2x2 picture.'}</p>}
            {(reading.issues?.length ?? 0) > 0 && <ul className="list-disc pl-5 text-amber-800">{reading.issues!.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            <p className="text-gray-500">It becomes the member's photo when the form is saved.</p>
            {editable && <div className="flex flex-wrap items-center gap-2 pt-1"><UploadPhotoButton label="Upload another" disabled={busy} onUpload={onUpload} compact />{submitting && <span className="inline-flex items-center gap-1 text-blue-700"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking the picture...</span>}</div>}
          </div>
        </div>
      </section>
    );
  }

  if (recognized === true) {
    return (
      <section className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" aria-label="Applicant's 2x2 picture">
        <CheckCircle2 className="h-5 w-5 shrink-0" /> The 2x2 picture on the form shows the applicant's face clearly.
      </section>
    );
  }

  if (!editable) return null;
  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4" aria-label="Applicant's 2x2 picture">
      <div className="flex items-center gap-2"><UserSquare className="h-5 w-5 text-amber-700" /><h3 className="font-semibold text-gray-900">Applicant's 2x2 picture {recognized === false && <span className="text-red-600">*</span>}</h3></div>
      <p className="mt-1 text-sm text-amber-900">{recognized === false
        ? 'Gemini cannot recognize the 2x2 picture on the form: the photo box is empty or the face cannot be made out. Upload the applicant\'s 2x2 picture.'
        : 'AI could not tell whether the form has a clear 2x2 picture. Upload the applicant\'s 2x2 picture to be sure.'}</p>
      <p className="mt-1 text-xs text-amber-900">A recent picture with the face clear and a plain background. JPG, PNG or WEBP up to 5 MB.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <UploadPhotoButton label="Upload 2x2 picture" disabled={busy} onUpload={onUpload} />
        {submitting && <span className="animate-pulse text-sm text-blue-700">AI is checking the picture...</span>}
      </div>
    </section>
  );
}
