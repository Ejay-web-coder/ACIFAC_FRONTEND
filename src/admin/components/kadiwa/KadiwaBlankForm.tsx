import { useState } from 'react';
import { LoaderCircle, Printer } from 'lucide-react';
import { toast } from 'sonner';

// Downloads the paper form of a sheet. Filled in at the store, it is scanned
// in the OCR Scanner, which saves it to the Kadiwa Store.
export function KadiwaBlankForm({ formName, onPrint }: { formName: string; onPrint: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const print = async () => {
    setBusy(true);
    try {
      await onPrint();
    } catch (error) {
      toast.error('The form could not be made', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => void print()} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-2.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60">
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Blank form (PDF)
      </button>
      <span className="text-xs text-gray-500">Print the {formName}, fill it in at the store, then scan it in the OCR Scanner to save it here.</span>
    </div>
  );
}
