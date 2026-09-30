import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, Eraser, ImagePlus } from 'lucide-react';

// One specimen signature: drawn with a finger, stylus or mouse, or a picture of
// a signature on paper. The drawing is handed back as a PNG file when the pen lifts.
// savedUrl shows the signature already on file (Edit and View); signing again replaces it.
export function SignaturePad({
  label,
  file,
  onChange,
  error,
  savedUrl = null,
  readOnly = false,
  required = true,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  savedUrl?: string | null;
  readOnly?: boolean;
  required?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [resigning, setResigning] = useState(false);
  const showSaved = Boolean(savedUrl) && !file && !resigning;

  // Sizes the canvas to its box at the screen's pixel density.
  const prepareCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    hasInk.current = false;
  };

  useEffect(() => {
    if (!uploadedPreview && !showSaved && !readOnly) prepareCanvas();
  }, [uploadedPreview, showSaved, readOnly]);

  useEffect(() => () => {
    if (uploadedPreview) URL.revokeObjectURL(uploadedPreview);
  }, [uploadedPreview]);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    hasInk.current = true;
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) return;
    canvas.toBlob((blob) => {
      if (blob) onChange(new File([blob], `${label.toLowerCase().replace(/\s+/g, '-')}.png`, { type: 'image/png' }));
    }, 'image/png');
  };

  const clear = () => {
    setResigning(true);
    setUploadedPreview(null);
    setUploadError('');
    prepareCanvas();
    onChange(null);
  };

  const upload = (picked: File | null) => {
    if (!picked) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(picked.type)) {
      setUploadError('Use a JPG, PNG, or WEBP picture of the signature.');
      return;
    }
    if (picked.size > 2 * 1024 * 1024) {
      setUploadError('The signature picture must be 2 MB or smaller.');
      return;
    }
    setUploadError('');
    setUploadedPreview(URL.createObjectURL(picked));
    onChange(picked);
  };

  if (readOnly) {
    return (
      <div className="min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{label}</span>
        <div className="mt-1 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-white">
          {savedUrl ? <img src={savedUrl} alt={label} className="h-full w-full object-contain" /> : <span className="text-xs text-slate-400">No signature on file</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{label}{required && <span className="text-red-500"> *</span>}</span>
        {file && <Check className="h-4 w-4 text-emerald-600" aria-label="Signed" />}
      </div>
      <div className={`relative mt-1 h-28 overflow-hidden rounded-lg border-2 border-dashed bg-white ${error || uploadError ? 'border-red-300' : 'border-slate-300'}`}>
        {uploadedPreview || showSaved ? (
          <img src={uploadedPreview || savedUrl || ''} alt={uploadedPreview ? `${label} picture` : `${label} on file`} className="h-full w-full object-contain" />
        ) : (
          <>
            <canvas
              ref={canvasRef}
              aria-label={`${label}: sign here`}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerLeave={finish}
              onPointerCancel={finish}
            />
            {!file && <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-slate-400">Sign here</span>}
            <span className="pointer-events-none absolute inset-x-4 bottom-7 border-b border-slate-300" />
          </>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
          <Eraser className="h-3.5 w-3.5" /> {showSaved ? 'Sign again' : 'Clear'}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
          <ImagePlus className="h-3.5 w-3.5" /> Upload picture
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { upload(event.target.files?.[0] ?? null); event.target.value = ''; }} />
        </label>
      </div>
      {(uploadError || error) && <span className="mt-1 block text-xs text-red-600">{uploadError || error}</span>}
    </div>
  );
}
