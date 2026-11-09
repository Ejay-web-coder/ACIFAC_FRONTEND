import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAdminLoanDetail, type AdminLoan } from '../../app/services/authApi';
import { errorMessage } from '../../lib/api';
import { PDF_LOGO_PATH } from '../../lib/pdfLogo';
import { formatDate } from '../../utils/dateTime';
import { buildLoanInvoice, INVOICE_HEADER, type LoanInvoice } from './loanInvoice';

const money = (value: number) => value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Box({ checked }: { checked: boolean }) {
  return <span className="inline-flex h-3.5 w-3.5 items-center justify-center border border-gray-900 text-[10px] leading-none">{checked ? '✓' : ''}</span>;
}

/** A label and a ruled line, with the value on it or blank. */
function Line({ label, value = '', className = '' }: { label: string; value?: string; className?: string }) {
  return <p className={`flex gap-1 ${className}`}><span className="shrink-0 font-bold">{label}</span><span className="min-w-0 flex-1 border-b border-gray-900 px-1">{value}</span></p>;
}

/** The receipt of a fully paid loan, laid out exactly like the paper invoice (blank where the system has no data), with a PDF download. */
export function LoanReceiptModal({ loan, onClose }: { loan: AdminLoan; onClose: () => void }) {
  const [invoice, setInvoice] = useState<LoanInvoice | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAdminLoanDetail(loan.databaseId)
      .then((data) => { if (active) setInvoice(buildLoanInvoice(loan, data.payments)); })
      .catch((reason) => { if (active) setError(errorMessage(reason, 'Unable to load the payments.')); });
    return () => { active = false; };
  }, [loan]);

  const download = async () => {
    if (!invoice || saving) return;
    setSaving(true);
    try {
      const { downloadLoanInvoicePdf } = await import('./loanInvoicePdf');
      await downloadLoanInvoicePdf(invoice);
      toast.success('Receipt downloaded', { description: `The receipt of loan ${invoice.invoiceNo} was saved as a PDF.` });
    } catch (reason) {
      toast.error('The receipt could not be made', { description: reason instanceof Error ? reason.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const cell = 'border border-gray-900 px-2 py-1.5';
  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="loan-receipt-title">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <h2 id="loan-receipt-title" className="text-xl font-bold text-gray-900">Loan Receipt</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-100 p-3 sm:p-6">
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>
            : !invoice ? <p className="py-10 text-center text-sm text-gray-500">Loading receipt...</p>
            : (
            <div className="mx-auto max-w-3xl bg-white p-4 text-[13px] text-gray-900 shadow-sm ring-1 ring-gray-200 sm:p-6">
              {/* Header: logo, cooperative, address, TIN, cash or charge sale, INVOICE; the number in red. */}
              <div className="flex items-start gap-3">
                <img src={PDF_LOGO_PATH} alt="" className="h-16 w-16 shrink-0 rounded-full object-contain sm:h-20 sm:w-20" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold leading-tight">{INVOICE_HEADER.name}</p>
                  <div className="flex flex-wrap items-end justify-between gap-x-3">
                    <div className="text-xs"><p>{INVOICE_HEADER.address}</p><p>{INVOICE_HEADER.tin}</p></div>
                    <p className="font-serif text-base font-bold text-red-700">Nº {invoice.invoiceNo}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1"><Box checked />CASH SALES</span>
                    <span className="inline-flex items-center gap-1"><Box checked={false} />CHARGE SALES</span>
                    <span className="text-lg font-extrabold tracking-wide">INVOICE</span>
                  </div>
                </div>
              </div>

              {/* Buyer: what the system does not know (TIN, business address) stays blank. */}
              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex gap-4">
                  <Line label="SOLD TO:" value={invoice.soldTo} className="flex-1" />
                  <Line label="DATE" value={formatDate(invoice.date)} className="w-40" />
                </div>
                <Line label="Registered Name:" value={invoice.soldTo} />
                <div className="flex gap-4">
                  <Line label="TIN:" className="w-1/3" />
                  <Line label="Business Address:" className="flex-1" />
                </div>
              </div>

              {/* Items, then the SC/PWD boxes on the left and the totals on the right. */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-xs">
                  <thead>
                    <tr className="font-bold">
                      <th className={`${cell} w-1/2`}>Item Description/Nature of Service</th>
                      <th className={cell}>Qty.</th>
                      <th className={cell}>Unit Cost/Price</th>
                      <th className={cell}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: Math.max(6, invoice.lines.length) }, (_, i) => {
                      const line = invoice.lines[i];
                      return (
                        <tr key={i} className="h-7">
                          <td className={cell}>{line?.description ?? ''}</td>
                          <td className={`${cell} text-center`}>{line?.qty ?? ''}</td>
                          <td className={`${cell} text-right tabular-nums`}>{line ? money(line.unitPrice) : ''}</td>
                          <td className={`${cell} text-right tabular-nums`}>{line ? money(line.amount) : ''}</td>
                        </tr>
                      );
                    })}
                    {([
                      ['TOTAL SALES', money(invoice.totalSales), true],
                      ['Less: Discount (SC/PWD/NAAC/MOV/SP)', '', false],
                      ['Less: Withholding Tax', '', false],
                      ['TOTAL AMOUNT DUE', `₱${money(invoice.totalDue)}`, true],
                    ] as const).map(([label, value, strong], i) => (
                      <tr key={label} className="h-7">
                        {i % 2 === 0 && (
                          <td rowSpan={2} className={`${cell} align-top text-[11px] font-bold`}>
                            {i === 0 ? 'SC/PWD/NAAC/MOV/ Solo Parent ID No.:' : 'SC/PWD/NAAC/MOV/ Signature:'}
                          </td>
                        )}
                        <td colSpan={2} className={`px-2 py-1 text-right text-[11px] ${strong ? 'font-bold' : ''}`}>{label}</td>
                        <td className={`${cell} text-right tabular-nums ${strong ? 'font-bold' : ''}`}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Received the amount of, and the cashier's signature. */}
              <div className="mt-4 grid gap-6 text-xs sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1 font-bold"><Box checked />Received the amount of</p>
                  <p className="mt-1 border-b border-gray-900 px-1 pb-0.5">{invoice.amountInWords} (₱{money(invoice.amountReceived)})</p>
                </div>
                <div className="self-end text-center">
                  <p className="min-h-4">{invoice.cashier}</p>
                  <p className="border-t border-gray-900 pt-1 text-[11px] font-bold">Cashier/Authorized Representative Signature</p>
                </div>
              </div>

              {/* Printer and BIR authority to print: not in the system, so blank. */}
              <div className="mt-6 grid gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Line label="Printer's Accreditation No.:" />
                  <Line label="Date Issued:" />
                </div>
                <div className="space-y-1.5">
                  <Line label="BIR AUTHORITY TO PRINT NO.:" />
                  <Line label="Date Issued:" />
                  <Line label="APPROVED SERIES:" />
                </div>
              </div>
              <p className="mt-4 text-right text-xs font-bold">&ldquo;THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX&rdquo;</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={download} disabled={!invoice || saving}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
            <Download className="h-4 w-4" />{saving ? 'Saving...' : 'Download PDF'}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl bg-gray-100 px-4 text-sm font-medium text-gray-700 hover:bg-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}
