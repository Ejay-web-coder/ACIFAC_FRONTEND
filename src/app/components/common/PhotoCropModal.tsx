import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { Check, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';

// Crop a photo to a square profile picture: drag to move, slider / wheel /
// pinch to zoom, rotate in 90° steps. The circle shows what the round avatar
// will show; the saved picture is the full square (512 × 512 JPEG).

const OUTPUT_SIZE = 512;
const MAX_ZOOM = 4;

interface Props {
  file: File;
  onCancel: () => void;
  onSave: (picture: File) => void | Promise<void>;
  saving?: boolean;
}

interface Source { canvas: HTMLCanvasElement; url: string; width: number; height: number }

async function loadRotated(file: File, quarterTurns: number): Promise<Source> {
  const bitmap = await createImageBitmap(file); // respects the photo's EXIF orientation
  try {
    const turns = ((quarterTurns % 4) + 4) % 4;
    const swap = turns % 2 === 1;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? bitmap.height : bitmap.width;
    canvas.height = swap ? bitmap.width : bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot edit pictures.');
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((turns * Math.PI) / 2);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Unable to read the picture.'))), 'image/jpeg', 0.92));
    return { canvas, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

export function PhotoCropModal({ file, onCancel, onSave, saving = false }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(320);
  const [turns, setTurns] = useState(0);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1); // 1 = the photo just covers the frame
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // photo's top-left inside the frame
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  // The wheel zooms the photo; stop it from also scrolling the page behind.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;
    const block = (event: globalThis.WheelEvent) => event.preventDefault();
    element.addEventListener('wheel', block, { passive: false });
    return () => element.removeEventListener('wheel', block);
  }, []);

  // Frame size follows the screen width (phones).
  useEffect(() => {
    const resize = () => setView(Math.min(320, window.innerWidth - 64));
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let created: Source | null = null;
    loadRotated(file, turns)
      .then((loaded) => { if (cancelled) { URL.revokeObjectURL(loaded.url); return; } created = loaded; setSource(loaded); setError(''); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to read the picture.'); });
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created.url); };
  }, [file, turns]);

  const baseScale = source ? Math.max(view / source.width, view / source.height) : 1;
  const scale = baseScale * zoom;

  // Keeps the photo covering the whole frame.
  const clamp = useCallback((next: { x: number; y: number }, nextScale: number) => {
    if (!source) return next;
    const width = source.width * nextScale;
    const height = source.height * nextScale;
    return { x: Math.min(0, Math.max(view - width, next.x)), y: Math.min(0, Math.max(view - height, next.y)) };
  }, [source, view]);

  // Centre the photo whenever it (or its rotation, or the frame) changes.
  useEffect(() => {
    if (!source) return;
    const start = Math.max(view / source.width, view / source.height);
    setZoom(1);
    setOffset({ x: (view - source.width * start) / 2, y: (view - source.height * start) / 2 });
  }, [source, view]);

  // Zoom keeping the point under (px, py) of the frame fixed.
  const zoomTo = useCallback((nextZoom: number, px = view / 2, py = view / 2) => {
    const bounded = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    const nextScale = baseScale * bounded;
    setOffset((current) => clamp({ x: px - ((px - current.x) / scale) * nextScale, y: py - ((py - current.y) / scale) * nextScale }, nextScale));
    setZoom(bounded);
  }, [baseScale, clamp, scale, view]);

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const mid = localPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      zoomTo(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance), mid.x, mid.y);
      return;
    }
    setOffset((current) => clamp({ x: current.x + event.clientX - previous.x, y: current.y + event.clientY - previous.y }, scale));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const point = localPoint(event);
    zoomTo(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), point.x, point.y);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      setOffset((current) => clamp({ x: current.x + dx, y: current.y + dy }, scale));
    } else if (event.key === '+' || event.key === '=') zoomTo(zoom * 1.1);
    else if (event.key === '-') zoomTo(zoom / 1.1);
  };

  const save = async () => {
    if (!source) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return;
    const side = view / scale; // the frame, in photo pixels
    context.imageSmoothingQuality = 'high';
    context.drawImage(source.canvas, -offset.x / scale, -offset.y / scale, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (blob) await onSave(new File([blob], 'profile-picture.jpg', { type: 'image/jpeg' }));
  };

  const reset = () => { setTurns(0); if (source && turns === 0) { setZoom(1); setOffset({ x: (view - source.width * baseScale) / 2, y: (view - source.height * baseScale) / 2 }); } };

  return (
    <div className="acf-modal fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/70 p-4" role="dialog" aria-modal="true" aria-label="Crop profile picture">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Crop Profile Picture</h2>
            <p className="text-sm text-gray-500">Drag to move · zoom to fit your face in the circle</p>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex flex-col items-center gap-4 px-5 py-5">
          <div
            ref={viewportRef}
            role="application"
            tabIndex={0}
            aria-label="Picture crop area. Use arrow keys to move and plus or minus to zoom."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            className="relative cursor-grab touch-none select-none overflow-hidden rounded-xl bg-gray-900 outline-none focus-visible:ring-4 focus-visible:ring-green-300 active:cursor-grabbing"
            style={{ width: view, height: view }}
          >
            {source && <img src={source.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: offset.x, top: offset.y, width: source.width * scale, height: source.height * scale }} />}
            {/* Round avatar guide; the corners outside it are dimmed. */}
            <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(17,24,39,0.55)] ring-2 ring-white/90" />
            {!source && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-200">{error || 'Loading picture...'}</p>}
          </div>

          <div className="flex w-full items-center gap-3">
            <button type="button" onClick={() => zoomTo(zoom / 1.2)} disabled={!source || zoom <= 1} aria-label="Zoom out" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-40"><ZoomOut className="h-5 w-5" /></button>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(event) => zoomTo(Number(event.target.value))} disabled={!source} aria-label="Zoom" className="flex-1 accent-green-600" />
            <button type="button" onClick={() => zoomTo(zoom * 1.2)} disabled={!source || zoom >= MAX_ZOOM} aria-label="Zoom in" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-40"><ZoomIn className="h-5 w-5" /></button>
          </div>
          <div className="flex w-full flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setTurns((value) => value - 1)} disabled={!source || saving} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"><RotateCcw className="h-4 w-4" />Rotate left</button>
            <button type="button" onClick={() => setTurns((value) => value + 1)} disabled={!source || saving} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"><RotateCw className="h-4 w-4" />Rotate right</button>
            <button type="button" onClick={reset} disabled={!source || saving} className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40">Reset</button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={!source || saving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Check className="h-4 w-4" />{saving ? 'Saving...' : 'Save picture'}</button>
        </div>
      </div>
    </div>
  );
}
