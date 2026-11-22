import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Flashlight, FlashlightOff, RefreshCw } from 'lucide-react';
import type QrScannerLibrary from 'qr-scanner';

// The phone or laptop camera reading QR codes (qr-scanner: the browser's own
// barcode reader where there is one, else a decoder in a web worker). The
// camera needs a secure (https) page; Vercel serves the app over https, and
// localhost counts as secure while developing. The library is loaded only when
// a scanner opens.

type Facing = 'environment' | 'user';

/** Why the camera did not start, in words for the person holding the phone. */
function cameraProblem(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  const text = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || /permission|denied/i.test(text)) return 'Camera permission was denied. Allow camera access for this site in the browser settings, then open the scanner again.';
  if (name === 'NotFoundError' || /not found/i.test(text)) return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'The camera could not be started.';
}

export function QrScanner({ onScan, className = '' }: {
  /** Each code read, several times a second while one is in view: the caller ignores repeats. */
  onScan: (text: string) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerLibrary | null>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  const [state, setState] = useState<'starting' | 'running' | 'failed'>('starting');
  const [error, setError] = useState('');
  const [canSwitch, setCanSwitch] = useState(false);
  const [facing, setFacing] = useState<Facing>('environment');
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let scanner: QrScannerLibrary | null = null;
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? 'This browser cannot open the camera.' : 'The camera only works on a secure (https) connection.');
        setState('failed');
        return;
      }
      try {
        const { default: Scanner } = await import('qr-scanner');
        if (cancelled || !videoRef.current) return;
        scanner = new Scanner(videoRef.current, (result) => onScanRef.current(result.data), {
          preferredCamera: 'environment',
          maxScansPerSecond: 6,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        });
        scannerRef.current = scanner;
        await scanner.start();
        if (cancelled) return;
        setState('running');
        void Scanner.listCameras().then((cameras) => { if (!cancelled) setCanSwitch(cameras.length > 1); }).catch(() => undefined);
        void scanner.hasFlash().then((flash) => { if (!cancelled) setHasFlash(flash); }).catch(() => undefined);
      } catch (startError) {
        if (cancelled) return;
        setError(cameraProblem(startError));
        setState('failed');
      }
    })();
    return () => {
      cancelled = true;
      scanner?.destroy();
      scannerRef.current = null;
    };
  }, []);

  const switchCamera = async () => {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    try {
      await scannerRef.current?.setCamera(next);
      setFacing(next);
      setFlashOn(false);
      setHasFlash(Boolean(await scannerRef.current?.hasFlash()));
    } catch {
      setError('The other camera could not be started.');
    }
  };
  const toggleFlash = async () => {
    try {
      await scannerRef.current?.toggleFlash();
      setFlashOn(Boolean(scannerRef.current?.isFlashOn()));
    } catch {
      setHasFlash(false);
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gray-900 ${className}`}>
      {/* qr-scanner adds the scan box and the outline of a code it finds next to the video. */}
      <video ref={videoRef} className="block aspect-[4/3] w-full object-cover" muted playsInline aria-label="Camera view for scanning member ID cards" />
      {state !== 'running' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-gray-100" role={state === 'failed' ? 'alert' : 'status'}>
          {state === 'failed' ? <CameraOff className="h-10 w-10" /> : <Camera className="h-10 w-10 animate-pulse" />}
          <p className="max-w-sm text-sm">{state === 'failed' ? error : 'Starting the camera...'}</p>
        </div>
      )}
      {state === 'running' && error && <p className="absolute inset-x-2 top-2 rounded-lg bg-black/60 px-3 py-1.5 text-center text-xs text-white" role="alert">{error}</p>}
      {state === 'running' && (canSwitch || hasFlash) && (
        <div className="absolute bottom-2 right-2 flex gap-2">
          {hasFlash && (
            <button type="button" onClick={() => void toggleFlash()} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70" aria-label={flashOn ? 'Turn the light off' : 'Turn the light on'} aria-pressed={flashOn} title="Light">
              {flashOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
            </button>
          )}
          {canSwitch && (
            <button type="button" onClick={() => void switchCamera()} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70" aria-label="Switch camera" title="Switch camera">
              <RefreshCw className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
