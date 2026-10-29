import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

// The app's own "Are you sure?" box. The browser's confirm() shows the site's
// address as its title ("acifac.vercel.app says"), so every confirmation goes
// through confirmAction() instead, shown by <ConfirmHost /> (mounted once in App).

interface ConfirmOptions {
  /** The button that goes ahead, e.g. Delete. */
  confirmLabel?: string;
  /** Red, for something that cannot be undone. */
  danger?: boolean;
}
interface ConfirmRequest extends Required<ConfirmOptions> { message: string; resolve: (ok: boolean) => void }

let showRequest: ((request: ConfirmRequest) => void) | null = null;

/** Asks the question in the app's dialog; true when the person goes ahead. */
export function confirmAction(message: string, { confirmLabel = 'OK', danger = false }: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!showRequest) { resolve(window.confirm(message)); return; }
    showRequest({ message, confirmLabel, danger, resolve });
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // A second question while one is open answers the first with Cancel.
    showRequest = (next) => setRequest((current) => { current?.resolve(false); return next; });
    return () => { showRequest = null; };
  }, []);

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  useEffect(() => {
    if (!request) return undefined;
    confirmButton.current?.focus();
    // Captured first and stopped, so Escape does not also close the window behind the question.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      request.resolve(false);
      setRequest(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request]);

  if (!request) return null;
  return (
    <div className="acf-modal fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/50 p-4" role="alertdialog" aria-modal="true" aria-describedby="confirm-dialog-message">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${request.danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><AlertTriangle className="h-5 w-5" /></span>
          <p id="confirm-dialog-message" className="pt-2 text-sm text-gray-800">{request.message}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => answer(false)} className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Cancel</button>
          <button ref={confirmButton} type="button" onClick={() => answer(true)} className={`inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold text-white ${request.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>{request.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
