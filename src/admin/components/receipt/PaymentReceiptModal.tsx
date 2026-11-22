import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer, ReceiptText, X } from 'lucide-react';
import { toast } from 'sonner';
import { PDF_LOGO_PATH } from '../../../lib/pdfLogo';
import { formatDate } from '../../../utils/dateTime';
import { INVOICE_HEADER, pesosInWords } from '../loanInvoice';
import { recorderLine, type PaymentReceipt } from './paymentReceipt';

const money = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The receipt of one payment as it prints, with Print and Download PDF. It opens
 * over the window it was opened from, and Escape closes only the receipt.
 */
export function PaymentReceiptModal({ receipt, onClose }: { receipt: PaymentReceipt; onClose: () => void }) {
  const [busy, setBusy] = useState<'print' | 'download' | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  const run = async (kind: 'print' | 'download') => {
    if (busy) return;
    setBusy(kind);
    try {
      const pdf = await import('./paymentReceiptPdf');
      if (kind === 'download') {
        await pdf.downloadReceiptPdf(receipt);
        toast.success('Receipt downloaded', { description: `${receipt.receiptNo} was saved as a PDF.` });
      } else if (!(await pdf.printReceiptPdf(receipt))) {
        toast.info('The receipt was downloaded instead', { description: 'Your browser blocked the print tab. Open the PDF to print it.' });
      }
    } catch (error) {
      toast.error('The receipt could not be made', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const details: Array<[string, string]> = [];
  if (receipt.method) details.push(['Payment method', receipt.method]);
  if (receipt.reference) details.push(['Reference', receipt.reference]);
  if (receipt.balance !== undefined && receipt.balance !== null) details.push([receipt.balanceLabel || 'Balance', money(receipt.balance)]);
  if (receipt.notes) details.push(['Notes', receipt.notes]);

  return createPortal(
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="payment-receipt-title">
      <div className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <h2 id="payment-receipt-title" className="flex items-center gap-2 text-lg font-bold text-gray-900"><ReceiptText className="h-5 w-5 text-green-700" />Receipt {receipt.receiptNo}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-100 p-3 sm:p-5">
          <div className="mx-auto bg-white p-4 text-[13px] text-gray-900 shadow-sm ring-1 ring-gray-200 sm:p-6">
            <div className="flex items-start gap-3">
              <img src={PDF_LOGO_PATH} alt="" className="h-14 w-14 shrink-0 rounded-full object-contain" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-tight">{INVOICE_HEADER.name}</p>
                <p className="text-xs text-gray-600">{INVOICE_HEADER.address}</p>
                <p className="text-xs text-gray-600">{INVOICE_HEADER.tin}</p>
              </div>
              <p className="shrink-0 font-serif text-sm font-bold text-red-700">Nº {receipt.receiptNo}</p>
            </div>
            <p className="mt-4 border-t border-gray-900 pt-3 text-center text-base font-extrabold tracking-wide">{receipt.title.toUpperCase()}</p>

            <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[1fr_auto]">
              <div className="flex gap-1"><dt className="shrink-0 font-bold">{receipt.kind === 'paid' ? 'Paid to:' : 'Received from:'}</dt><dd className="min-w-0 flex-1 border-b border-gray-400 px-1">{receipt.party}</dd></div>
              <div className="flex gap-1"><dt className="shrink-0 font-bold">Date:</dt><dd className="border-b border-gray-400 px-1">{formatDate(receipt.date)}</dd></div>
              {receipt.memberNumber && <div className="flex gap-1"><dt className="shrink-0 font-bold">Member ID:</dt><dd className="border-b border-gray-400 px-1">{receipt.memberNumber}</dd></div>}
            </dl>

            <table className="mt-4 w-full border-collapse text-xs">
              <thead><tr className="bg-gray-100 text-left"><th className="px-2 py-1.5 font-bold">Particulars</th><th className="px-2 py-1.5 text-right font-bold">Amount</th></tr></thead>
              <tbody>
                {receipt.lines.map((line, index) => (
                  <tr key={index} className="border-b border-gray-200"><td className="px-2 py-1.5">{line.description}</td><td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{money(line.amount)}</td></tr>
                ))}
                <tr className="border-t-2 border-gray-900 font-bold"><td className="px-2 py-1.5">TOTAL</td><td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{money(receipt.total)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs italic text-gray-700">{receipt.kind === 'paid' ? 'The amount of' : 'Received the amount of'} {pesosInWords(receipt.total)}</p>

            {details.length > 0 && (
              <dl className="mt-3 space-y-1 text-xs">
                {details.map(([label, value]) => <div key={label} className="flex gap-2"><dt className="w-40 shrink-0 font-bold">{label}</dt><dd className="min-w-0">{value}</dd></div>)}
              </dl>
            )}

            <div className={`mt-8 grid gap-6 text-center text-xs ${receipt.kind === 'paid' ? 'grid-cols-2' : 'grid-cols-1 justify-items-end'}`}>
              {receipt.kind === 'paid' && <div className="w-full"><p className="min-h-4">&nbsp;</p><p className="border-t border-gray-900 pt-1 font-bold">Received by (member)</p></div>}
              <div className="w-full max-w-56">
                <p className="min-h-4">{recorderLine(receipt) || ' '}</p>
                <p className="border-t border-gray-900 pt-1 font-bold">{receipt.kind === 'paid' ? 'Released by' : 'Cashier/Authorized Representative'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={() => void run('print')} disabled={busy !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
            <Printer className="h-4 w-4" />{busy === 'print' ? 'Preparing…' : 'Print'}
          </button>
          <button type="button" onClick={() => void run('download')} disabled={busy !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            <Download className="h-4 w-4" />{busy === 'download' ? 'Saving…' : 'Download PDF'}
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium text-gray-700 hover:bg-gray-200">Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
