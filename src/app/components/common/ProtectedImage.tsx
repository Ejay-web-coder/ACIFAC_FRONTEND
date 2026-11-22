import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchProtectedBlob } from '../../../lib/api';

/**
 * A picture the server sends only to a signed-in user (a QR code, a payment
 * screenshot), loaded with the session cookie. `version` reloads it after it
 * was replaced.
 */
export function ProtectedImage({ path, alt, className = '', version = '', onClickOpen = false }: {
  path: string;
  alt: string;
  className?: string;
  version?: string | number;
  /** Opens the full picture in a new tab when clicked. */
  onClickOpen?: boolean;
}) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; url: string }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let url = '';
    setState({ status: 'loading' });
    fetchProtectedBlob(path)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ status: 'ready', url });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [path, version]);

  if (state.status === 'loading') return <div className={`animate-pulse rounded-xl bg-gray-100 ${className}`} aria-label={`Loading ${alt}`} />;
  if (state.status === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-1 rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-500 ring-1 ring-gray-200 ${className}`}>
        <ImageOff className="h-6 w-6" aria-hidden="true" />
        The picture could not be loaded.
      </div>
    );
  }
  const image = <img src={state.url} alt={alt} className={`rounded-xl object-contain ${className}`} />;
  return onClickOpen ? <a href={state.url} target="_blank" rel="noreferrer" title="Open the full picture">{image}</a> : image;
}
