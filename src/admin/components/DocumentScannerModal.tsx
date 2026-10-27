import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Camera, CameraOff, Check, ImagePlus, RefreshCw, ScanLine, Trash2, X } from 'lucide-react';
import { assessImage, cropTo, describeProblems, enhance, frameCrop, type CropRect } from '../../lib/imageQuality';

// Captures a paper form with the device camera. Each capture is one page; a
// single page is sent as a JPEG, several pages are combined into one PDF so the
// AI reads the whole form at once.
//
// The "id" variant captures an applicant's ID card with the live camera only:
// the front, then the back, joined into one picture like a back-to-back copy.
// The "idCopy" variant photographs one page: a back-to-back copy of an ID with
// the person's specimen signatures (a loan borrower's or co-maker's).
//
// Each capture is cropped to the frame, straightened and given more contrast
// before it is sent. A blurry, dark or washed-out capture is held back until
// it is retaken or kept on purpose, so a bad photo is caught at the form.

const MAX_EDGE = 2200; // px; keeps text sharp while staying well under the 10 MB limit
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 6;
const ID_MAX_BYTES = 5 * 1024 * 1024;
const ID_SIDES = ['Front', 'Back'];

/** problems: what is wrong with the photo, until it is retaken or kept anyway. */
interface Page { blob: Blob; url: string; width: number; height: number; problems: string[] }

interface DocumentScannerModalProps {
  onClose: () => void;
  onScanned: (file: File) => void;
  variant?: 'document' | 'id' | 'idCopy';
  /** Whose ID is captured: applicant, borrower or co-maker. */
  person?: string;
  requiredSignatures?: number;
}

const titleCase = (text: string) => text.replace(/(^|[\s-])([a-z])/g, (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`);

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Capture failed.'))), 'image/jpeg', quality));
}

// A captured picture (cropped to crop), checked, then straightened (not an ID
// card, whose edges are not text lines) and given more contrast.
async function pageFrom(source: CanvasImageSource, width: number, height: number, { crop = null, straighten = true }: { crop?: CropRect | null; straighten?: boolean } = {}): Promise<Page> {
  const raw = cropTo(source, width, height, { maxEdge: MAX_EDGE, crop });
  const { problems } = assessImage(raw);
  const canvas = enhance(raw, { straighten });
  const blob = await canvasToBlob(canvas, 0.9);
  return { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, problems };
}

async function pageFromImageFile(file: File, straighten: boolean): Promise<Page> {
  const bitmap = await createImageBitmap(file);
  try {
    return await pageFrom(bitmap, bitmap.width, bitmap.height, { straighten });
  } finally {
    bitmap.close();
  }
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

async function buildFile(pages: Page[]): Promise<File> {
  if (pages.length === 1) return new File([pages[0].blob], `scan-${stamp()}.jpg`, { type: 'image/jpeg' });
  const { jsPDF } = await import('jspdf');
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const page of pages) {
    const orientation = page.width > page.height ? 'landscape' : 'portrait';
    if (!pdf) pdf = new jsPDF({ orientation, unit: 'px', format: [page.width, page.height], compress: true });
    else pdf.addPage([page.width, page.height], orientation);
    const data = new Uint8Array(await page.blob.arrayBuffer());
    pdf.addImage(data, 'JPEG', 0, 0, page.width, page.height, undefined, 'FAST');
  }
  const blob = pdf!.output('blob');
  return new File([blob], `scan-${stamp()}.pdf`, { type: 'application/pdf' });
}

// The sides of an ID card one above the other in one picture.
async function joinSides(pages: Page[]): Promise<File> {
  const gap = 24;
  const width = Math.max(...pages.map((page) => page.width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = pages.reduce((sum, page) => sum + page.height, 0) + gap * (pages.length - 1);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported on this device.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let top = 0;
  for (const page of pages) {
    const bitmap = await createImageBitmap(page.blob);
    context.drawImage(bitmap, Math.round((width - page.width) / 2), top, page.width, page.height);
    bitmap.close();
    top += page.height + gap;
  }
  return new File([await canvasToBlob(canvas, 0.88)], `id-${stamp()}.jpg`, { type: 'image/jpeg' });
}

export function DocumentScannerModal({ onClose, onScanned, variant = 'document', person = 'applicant', requiredSignatures = 3 }: DocumentScannerModalProps) {
  const isId = variant === 'id';
  const isCopy = variant === 'idCopy';
  const maxPages = isId ? ID_SIDES.length : isCopy ? 1 : MAX_PAGES;
  const title = isId ? `Capture the ${titleCase(person)}'s ID` : isCopy ? `Photograph the ${titleCase(person)}'s ID Copy` : 'Scan Document';
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pagesRef = useRef<Page[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [cameraError, setCameraError] = useState('');
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [canSwitch, setCanSwitch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  pagesRef.current = pages;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(window.isSecureContext ? 'This browser cannot open the camera.' : 'The camera only works on a secure (https) connection.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraError('');
        setReady(true);
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setCanSwitch(devices.filter((device) => device.kind === 'videoinput').length > 1);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : '';
        setCameraError(name === 'NotAllowedError' ? `Camera permission was denied. Allow camera access in the browser, ${isId || isCopy ? 'or upload a back-to-back copy of the ID instead.' : 'or use the phone camera button below.'}`
          : name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not be started.');
      }
    };
    void start();
    return () => { cancelled = true; stopCamera(); };
  }, [facingMode, isId, isCopy, stopCamera]);

  useEffect(() => () => pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url)), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || pages.length >= maxPages) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    // Only what is inside the frame is kept.
    const crop = frameRef.current ? frameCrop(video, frameRef.current) : null;
    const page = await pageFrom(video, video.videoWidth, video.videoHeight, { crop, straighten: !isId });
    setPages((current) => [...current, page]);
  };

  const addFromDeviceCamera = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    event.target.value = '';
    const added: Page[] = [];
    for (const file of files.slice(0, maxPages - pages.length)) added.push(await pageFromImageFile(file, !isId));
    setPages((current) => [...current, ...added]);
  };

  // The first capture that looks blurry, dark or washed out, waiting to be retaken or kept.
  const doubtful = pages.findIndex((page) => page.problems.length > 0);
  const pageName = (index: number) => (isId ? `The ${ID_SIDES[index].toLowerCase()} of the ID` : isCopy ? 'The picture' : `Page ${index + 1}`);
  const keepPage = (index: number) => setPages((current) => current.map((page, position) => (position === index ? { ...page, problems: [] } : page)));

  const removePage = (index: number) => {
    setPages((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, position) => position !== index);
    });
  };

  const finish = async () => {
    if (!pages.length || doubtful >= 0) return;
    setBusy(true);
    try {
      const file = isId ? await joinSides(pages) : await buildFile(pages);
      if (file.size > (isId || isCopy ? ID_MAX_BYTES : MAX_BYTES)) throw new Error(isId || isCopy ? 'The ID picture is larger than 5 MB. Capture it again.' : 'The scan is larger than 10 MB. Remove a page and try again.');
      stopCamera();
      onScanned(file);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Unable to prepare the scan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{isId ? 'Hold the ID card itself inside the frame in good light, without glare. Capture the front, then turn it over and capture the back.'
              : isCopy ? `Place the page with the front and back of the ID and the ${person}'s ${requiredSignatures} specimen signatures flat in good light, and fit the whole page inside the frame.`
                : 'Place the form flat in good light and fit it inside the frame. Capture each page in order.'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close scanner" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="relative overflow-hidden rounded-xl bg-gray-950" style={{ aspectRatio: '4 / 3' }}>
            <video ref={videoRef} playsInline muted className={`h-full w-full object-contain ${ready ? '' : 'invisible'}`} />
            {ready && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                {isId
                  ? <div ref={frameRef} className="w-[82%] rounded-xl border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" style={{ aspectRatio: '85.6 / 54' }} />
                  : <div ref={frameRef} className="relative h-[88%] rounded-lg border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" style={{ aspectRatio: '8.5 / 11' }}>
                    {['left-0 top-0 border-l-4 border-t-4 rounded-tl-lg', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-lg', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-lg', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-lg']
                      .map((corner) => <span key={corner} className={`absolute -m-0.5 h-8 w-8 border-green-400 ${corner}`} />)}
                    <span className="absolute inset-x-0 top-2 text-center text-xs font-medium text-white/90 drop-shadow">Fit the whole page inside the frame</span>
                  </div>}
              </div>
            )}
            {flash && <div className="absolute inset-0 bg-white/70" aria-hidden="true" />}
            {!ready && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-gray-200">
                {cameraError ? <CameraOff className="h-10 w-10" /> : <Camera className="h-10 w-10 animate-pulse" />}
                <p className="max-w-sm text-sm">{cameraError || 'Starting camera...'}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => void capture()} disabled={!ready || busy || pages.length >= maxPages} className="inline-flex items-center gap-2 rounded-full bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-green-700 disabled:opacity-50">
              <ScanLine className="h-5 w-5" /> {isId ? (pages.length < maxPages ? `Capture ${ID_SIDES[pages.length].toLowerCase()}` : 'Both sides captured') : isCopy ? (pages.length ? 'Captured' : 'Capture') : pages.length ? `Capture page ${pages.length + 1}` : 'Capture'}
            </button>
            {canSwitch && <button type="button" onClick={() => setFacingMode((mode) => (mode === 'environment' ? 'user' : 'environment'))} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"><RefreshCw className="h-4 w-4" /> Switch camera</button>}
            {!isId && <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50">
              <ImagePlus className="h-4 w-4" /> Use phone camera
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void addFromDeviceCamera(event)} />
            </label>}
          </div>
          {cameraError && ready && <p className="text-center text-sm text-red-700">{cameraError}</p>}

          {doubtful >= 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center" role="alert">
              <img src={pages[doubtful].url} alt="" className="h-20 w-16 shrink-0 rounded border border-amber-200 object-cover" />
              <div className="flex-1">
                <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-4 w-4" /> {pageName(doubtful)} looks {describeProblems(pages[doubtful].problems)}.</p>
                <p className="mt-0.5 text-amber-800">AI reads a sharp, well-lit photo much more reliably. Hold the phone steady, move to better light, and take it again.</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => removePage(doubtful)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white hover:bg-amber-700"><RefreshCw className="h-4 w-4" /> Retake</button>
                <button type="button" onClick={() => keepPage(doubtful)} className="rounded-lg border border-amber-300 px-3 py-2 text-amber-900 hover:bg-amber-100">Use anyway</button>
              </div>
            </div>
          )}

          {pages.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">{isId ? 'Captured sides' : 'Captured pages'} ({pages.length}/{maxPages})</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {pages.map((page, index) => (
                  <div key={page.url} className="relative shrink-0">
                    <img src={page.url} alt={isId ? `${ID_SIDES[index]} of the ID` : `Page ${index + 1}`} className={`${isId ? 'h-24 w-36' : 'h-32 w-24'} rounded-lg border border-gray-200 object-cover`} />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">{isId ? ID_SIDES[index] : index + 1}</span>
                    <button type="button" onClick={() => removePage(index)} aria-label={isId ? `Remove the ${ID_SIDES[index].toLowerCase()}` : `Remove page ${index + 1}`} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-600 shadow hover:bg-white"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-gray-500">{isId || isCopy ? `AI checks the ID${isCopy ? ', counts the specimen signatures,' : ''} and that it belongs to the ${person} on the form.` : 'AI reads the form, checks it is genuine, and saves it to the right module.'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void finish()} disabled={!pages.length || busy || doubtful >= 0} title={doubtful >= 0 ? 'Retake or keep the flagged photo first' : undefined} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              <Check className="h-4 w-4" /> {busy ? 'Preparing...' : isId ? (pages.length < maxPages ? 'Submit front only' : 'Submit ID') : isCopy ? 'Submit picture' : `Scan ${pages.length || ''} ${pages.length === 1 ? 'page' : 'pages'}`.replace('  ', ' ')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
