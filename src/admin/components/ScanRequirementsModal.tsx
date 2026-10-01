import { useEffect, type ReactNode } from 'react';
import { ClipboardCheck, X, XCircle } from 'lucide-react';

// Opens as soon as a membership or loan form is scanned: the form is saved
// only after its valid IDs (and, for a membership form, a 2x2 picture when the
// one on the form cannot be recognized) are submitted. The same panels stay in
// the review.

interface ScanRequirementsModalProps {
  /** "Membership form read", "Loan form read". */
  heading: string;
  title: string;
  /** "The member is saved only after you submit:" */
  intro: string;
  /** What is still to be submitted. */
  items: string[];
  /** Checks a submitted ID or picture failed, to fix before saving. */
  problems: string[];
  onClose: () => void;
  children: ReactNode;
}

export function ScanRequirementsModal({ heading, title, intro, items, problems, onClose, children }: ScanRequirementsModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-6">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-green-700"><ClipboardCheck className="h-4 w-4" /> {heading}</p>
            <h2 className="mt-1 text-lg font-bold text-gray-900">{title}</h2>
            {items.length > 0 && <>
              <p className="text-sm text-gray-600">{intro}</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">{items.map((item) => <li key={item}>{item}</li>)}</ul>
            </>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {problems.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {problems.map((problem) => <li key={problem} className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{problem}</li>)}
            </ul>
          )}
          {children}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-gray-500">You can also submit these later from the review below.</p>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Later</button>
        </div>
      </div>
    </div>
  );
}
