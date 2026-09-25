import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, CameraOff, Check, ImagePlus, RefreshCw, ScanLine, Trash2, X } from 'lucide-react';

// Captures a paper form with the device camera. Each capture is one page; a
// single page is sent as a JPEG, several pages are combined into one PDF so the
// AI reads the whole form at once.

const MAX_EDGE = 2200; // px; keeps text sharp while staying well under the 10 MB limit
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 6;

interface Page { blob: Blob; url: string; width: number; height: number }

interface DocumentScannerModalProps {
  onClose: () => void;
  onScanned: (file: File) => void;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Capture failed.'))), 'image/jpeg', quality));
}

function drawScaled(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported on this device.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function pageFromCanvas(canvas: HTMLCanvasElement): Promise<Page> {
  const blob = await canvasToBlob(canvas, 0.9);
  return { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}

async function pageFromImageFile(file: File): Promise<Page> {
  const bitmap = await createImageBitmap(file);
  try {
    return await pageFromCanvas(drawScaled(bitmap, bitmap.width, bitmap.height));
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

export function DocumentScannerModal({ onClose, onScanned }: DocumentScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
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
        setCameraError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in the browser, or use the phone camera button below.'
          : name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not be started.');
      }
    };
    void start();
    return () => { cancelled = true; stopCamera(); };
  }, [facingMode, stopCamera]);

  useEffect(() => () => pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url)), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || pages.length >= MAX_PAGES) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    const page = await pageFromCanvas(drawScaled(video, video.videoWidth, video.videoHeight));
    setPages((current) => [...current, page]);
  };

  const addFromDeviceCamera = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    event.target.value = '';
    const added: Page[] = [];
    for (const file of files.slice(0, MAX_PAGES - pages.length)) added.push(await pageFromImageFile(file));
    setPages((current) => [...current, ...added]);
  };

  const removePage = (index: number) => {
    setPages((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, position) => position !== index);
    });
  };

  const finish = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const file = await buildFile(pages);
      if (file.size > MAX_BYTES) throw new Error('The scan is larger than 10 MB. Remove a page and try again.');
      stopCamera();
      onScanned(file);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Unable to prepare the scan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Scan document">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Scan Document</h2>
            <p className="text-sm text-gray-500">Place the form flat in good light and fit it inside the frame. Capture each page in order.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close scanner" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="relative overflow-hidden rounded-xl bg-gray-950" style={{ aspectRatio: '4 / 3' }}>
            <video ref={videoRef} playsInline muted className={`h-full w-full object-contain ${ready ? '' : 'invisible'}`} />
            {ready && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <div className="h-[88%] rounded-lg border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" style={{ aspectRatio: '8.5 / 11' }} />
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
            <button type="button" onClick={() => void capture()} disabled={!ready || busy || pages.length >= MAX_PAGES} className="inline-flex items-center gap-2 rounded-full bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-green-700 disabled:opacity-50">
              <ScanLine className="h-5 w-5" /> {pages.length ? `Capture page ${pages.length + 1}` : 'Capture'}
            </button>
            {canSwitch && <button type="button" onClick={() => setFacingMode((mode) => (mode === 'environment' ? 'user' : 'environment'))} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"><RefreshCw className="h-4 w-4" /> Switch camera</button>}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50">
              <ImagePlus className="h-4 w-4" /> Use phone camera
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void addFromDeviceCamera(event)} />
            </label>
          </div>
          {cameraError && ready && <p className="text-center text-sm text-red-700">{cameraError}</p>}

          {pages.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Captured pages ({pages.length}/{MAX_PAGES})</p>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {pages.map((page, index) => (
                  <div key={page.url} className="relative shrink-0">
                    <img src={page.url} alt={`Page ${index + 1}`} className="h-32 w-24 rounded-lg border border-gray-200 object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white">{index + 1}</span>
                    <button type="button" onClick={() => removePage(index)} aria-label={`Remove page ${index + 1}`} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-600 shadow hover:bg-white"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-gray-500">AI reads the form, checks it is genuine, and saves it to the right module.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void finish()} disabled={!pages.length || busy} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              <Check className="h-4 w-4" /> {busy ? 'Preparing...' : `Scan ${pages.length || ''} ${pages.length === 1 ? 'page' : 'pages'}`.replace('  ', ' ')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
