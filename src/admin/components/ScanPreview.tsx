import { useEffect, useState } from 'react';
import { Minus, Plus, RotateCw } from 'lucide-react';
import { fetchProtectedBlob } from '../../lib/api';

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;

type Preview = { status: 'loading' } | { status: 'error' } | { status: 'ready'; url: string; type: string };

// The scanned page beside the extracted data, so each value can be compared
// with what was read. Images can be zoomed and turned; a PDF uses the browser's viewer.
export function ScanPreview({ scanId, fileName }: { scanId: number; fileName: string }) {
  const [preview, setPreview] = useState<Preview>({ status: 'loading' });
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let url = '';
    let cancelled = false;
    setPreview({ status: 'loading' });
    setZoom(100);
    setRotation(0);
    fetchProtectedBlob(`/api/ocr/${scanId}/file`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview({ status: 'ready', url, type: blob.type });
      })
      .catch(() => { if (!cancelled) setPreview({ status: 'error' }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [scanId]);

  const isPdf = preview.status === 'ready' && preview.type === 'application/pdf';
  const canTransform = preview.status === 'ready' && !isPdf;
  const control = 'inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-40';

  return (
    <div className="rounded-3xl bg-[#e6ece8] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="pl-1 text-sm font-semibold text-gray-800">Scanned page</p>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))} disabled={!canTransform || zoom <= MIN_ZOOM} aria-label="Zoom out" className={control}><Minus className="h-4 w-4" /></button>
          <span className="w-14 text-center text-sm font-semibold tabular-nums text-gray-800">{zoom}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))} disabled={!canTransform || zoom >= MAX_ZOOM} aria-label="Zoom in" className={control}><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} disabled={!canTransform} aria-label="Turn the page" className={control}><RotateCw className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="max-h-[75vh] min-h-[22rem] overflow-auto rounded-2xl bg-white shadow-sm">
        {preview.status === 'loading' && <div className="space-y-3 p-6" aria-label="Loading the scan">
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
          <div className="h-72 animate-pulse rounded-lg border border-dashed border-gray-200 bg-gray-50" />
        </div>}
        {preview.status === 'error' && <div className="flex min-h-[22rem] flex-col items-center justify-center p-6 text-center text-sm text-gray-500">
          <p>The scan could not be shown.</p><p className="mt-1 break-all">{fileName}</p>
        </div>}
        {preview.status === 'ready' && (isPdf
          ? <iframe src={preview.url} title={`Scan ${fileName}`} className="h-[70vh] w-full" />
          : <div className="flex min-h-[22rem] items-center justify-center p-3">
            <img src={preview.url} alt={`Scan ${fileName}`} style={{ width: `${zoom}%`, maxWidth: 'none', transform: `rotate(${rotation}deg)` }} className="h-auto transition-transform" />
          </div>)}
      </div>
    </div>
  );
}
