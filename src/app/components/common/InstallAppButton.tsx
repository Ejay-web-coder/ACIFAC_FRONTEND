import { useState } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt } from '../../../lib/installPrompt';

// "Install app" button. Shows the browser's install dialog where supported,
// Add to Home Screen steps on iPhone/iPad, and nothing once installed.
export function InstallAppButton({ variant = 'compact' }: { variant?: 'compact' | 'full' }) {
  const { canPrompt, showIosSteps, install } = useInstallPrompt();
  const [showSteps, setShowSteps] = useState(false);
  if (!canPrompt && !showIosSteps) return null;

  const onClick = () => {
    if (canPrompt) void install();
    else setShowSteps(true);
  };

  return (
    <>
      {variant === 'full' ? (
        <button type="button" onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 shadow-sm hover:bg-green-50">
          <Download className="h-4 w-4" /> Install ACIFAC app
        </button>
      ) : (
        <button type="button" onClick={onClick} title="Install ACIFAC app" aria-label="Install ACIFAC app" className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-green-800 hover:bg-green-50">
          <Download className="h-5 w-5" /><span className="hidden lg:inline">Install app</span>
        </button>
      )}

      {showSteps && (
        <div className="acf-modal fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Install ACIFAC app">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl border border-gray-200" />
                <div><p className="font-bold text-gray-900">Install ACIFAC</p><p className="text-sm text-gray-500">Add it to your Home Screen</p></div>
              </div>
              <button type="button" onClick={() => setShowSteps(false)} aria-label="Close" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-gray-700">
              <li className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">1</span>Tap the <Share className="h-4 w-4 text-blue-600" aria-label="Share" /> Share button in Safari.</li>
              <li className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">2</span>Choose <SquarePlus className="h-4 w-4" aria-hidden="true" /> <strong>Add to Home Screen</strong>.</li>
              <li className="flex items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-800">3</span>Tap <strong>Add</strong>. ACIFAC appears with its icon.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
