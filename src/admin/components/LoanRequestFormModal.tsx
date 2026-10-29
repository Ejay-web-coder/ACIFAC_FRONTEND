import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Eye, PenLine, RefreshCcw, X, XCircle } from 'lucide-react';
import type { AdminLoanRequest } from '../../app/services/authApi';
import { formatDate, formatDateTime } from '../../utils/dateTime';

const peso = (value: number | string | null | undefined) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const text = (value: unknown) => (value === null || value === undefined || String(value).trim() === '' ? '—' : String(value));
const MIN_PAID_PERCENT = 80;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="rounded-sm bg-slate-800 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">{title}</h3>
      {children}
    </section>
  );
}

function Fields({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-b-md border border-slate-300 bg-slate-300 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="bg-white p-2">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A member's loan application as it was filled in, for the office to read
 * before deciding: borrower, farm, loan (with the in-kind table), co-maker,
 * collateral, IDs and signature. Approve or Decline is chosen here.
 */
export function LoanRequestFormModal({ request, idSummary, onViewSignature, onDecide, onClose }: {
  request: AdminLoanRequest;
  idSummary?: ReactNode;
  onViewSignature: () => void;
  onDecide: (status: 'approved' | 'declined') => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = request.inKindItems ?? [];
  const inKindTotal = items.reduce((sum, item) => sum + Math.round(Number(item.quantity) * Number(item.unitPrice) * 100), 0) / 100;
  const cashAmount = Math.max(0, request.amount - inKindTotal);
  // The member's open loan: approving restructures it once 80% is paid; before that it blocks approval.
  const open = request.openLoanNumber && request.openLoanTotal ? {
    number: request.openLoanNumber, balance: request.openLoanBalance ?? 0, total: request.openLoanTotal,
    paidPercent: Math.floor(((request.openLoanTotal - (request.openLoanBalance ?? 0)) / request.openLoanTotal) * 1000) / 10,
  } : null;
  const blocked = open ? open.paidPercent < MIN_PAID_PERCENT : false;
  const address = [request.farmLocation, request.barangay, request.municipality, request.province].filter(Boolean).join(', ');

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="loan-request-title">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Loan Application Form (Agri)</p>
            <h2 id="loan-request-title" className="text-lg font-bold text-slate-900">Application #{request.id} · {request.memberName}</h2>
            <p className="text-xs text-slate-500">Submitted {formatDateTime(request.submittedAt)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100 px-2 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-lg border border-slate-300 bg-white px-3 py-5 shadow-sm sm:px-6">
            {open && (
              <p className={`flex items-start gap-2 rounded-xl p-3 text-sm ${blocked ? 'bg-red-50 text-red-800 ring-1 ring-red-100' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'}`}>
                {blocked ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0" />}
                {blocked
                  ? `This member still has loan ${open.number} open, only ${open.paidPercent}% paid. A new loan is possible once at least ${MIN_PAID_PERCENT}% is paid, so it cannot be approved yet.`
                  : `Approving restructures loan ${open.number} (${open.paidPercent}% paid): the ${peso(open.balance)} still owed is deducted, so the member receives ${peso(request.amount - open.balance)}.`}
              </p>
            )}

            <Section title="I. Borrower Information">
              <Fields rows={[
                ['Borrower name', request.memberName],
                ['Member No.', text(request.memberNumber || request.memberId)],
                ['Occupation', text(request.borrowerOccupation)],
                ['Years of farming', text(request.yearsFarming)],
                ['Age', text(request.borrowerAge)],
                ['Sex / Civil status', `${text(request.borrowerGender)} / ${text(request.borrowerCivilStatus)}`],
                ['Address', text(request.borrowerAddress)],
                ['Contact No. / Email', `${text(request.borrowerPhone)}${request.borrowerEmail ? ` · ${request.borrowerEmail}` : ''}`],
              ]} />
            </Section>

            <Section title="II. Farm Information">
              <Fields rows={[
                ['Farm location', text(address)],
                ['Total farm area', request.farmArea !== undefined ? `${Number(request.farmArea).toFixed(2)} ha` : '—'],
                ['Crops planted', text(request.cropsPlanted)],
                ['Crop season / year', text(request.cropSeason)],
                ['Irrigation type', <span className="capitalize">{text(request.irrigationType)}{request.irrigationType === 'other' && request.irrigationOther ? `: ${request.irrigationOther}` : ''}</span>],
              ]} />
            </Section>

            <Section title="III. Loan Details">
              <Fields rows={[
                ['Loan type / mode', <span className="capitalize">{request.loanType} · {text(request.loanMode || 'cash')}</span>],
                ['Purpose', text(request.purpose)],
              ]} />
              {items.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[34rem] border-collapse text-sm">
                    <thead><tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-700">{['Item', 'Description', 'Quantity', 'Unit', 'Unit Price', 'Total'].map((heading) => <th key={heading} className="border border-slate-300 px-2 py-1.5">{heading}</th>)}</tr></thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={index}>
                          <td className="border border-slate-300 px-2 py-1.5">{item.item}</td>
                          <td className="border border-slate-300 px-2 py-1.5">{text(item.description)}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{item.quantity}</td>
                          <td className="border border-slate-300 px-2 py-1.5">{item.unit}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{peso(item.unitPrice)}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{peso(Number(item.quantity) * Number(item.unitPrice))}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold"><td className="border border-slate-300 px-2 py-1.5" colSpan={5}>IN-KIND TOTAL</td><td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{peso(inKindTotal)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
                {request.loanMode !== 'in-kind' && <div><dt className="text-xs text-slate-500">Cash requested</dt><dd className="font-medium tabular-nums">{peso(cashAmount)}</dd></div>}
                <div><dt className="text-xs text-slate-500">Amount applied for</dt><dd className="font-semibold tabular-nums">{peso(request.amount)}</dd></div>
                <div><dt className="text-xs text-slate-500">Maximum eligible</dt><dd className="tabular-nums">{peso(request.maximumEligibleAmount)}</dd></div>
                <div><dt className="text-xs text-slate-500">Interest ({request.interestRate ?? '—'}%)</dt><dd className="tabular-nums">{peso(request.calculatedInterest)}</dd></div>
                <div><dt className="text-xs text-slate-500">Total repayment</dt><dd className="font-semibold tabular-nums text-green-700">{peso(request.totalRepayment)}</dd></div>
                <div><dt className="text-xs text-slate-500">Term</dt><dd>{request.term} months, due at end of term</dd></div>
              </dl>
            </Section>

            <Section title="IV. Co-Maker">
              <Fields rows={[
                ['Name', text(request.coMakerName)],
                ['Relationship', text(request.coMakerRelationship)],
                ['Address', text(request.coMakerAddress)],
                ['Contact No.', text(request.coMakerContact)],
              ]} />
            </Section>

            <Section title="V. Collateral">
              <Fields rows={[['Collateral offered', text(request.collateralType)], ['Details', text(request.collateralDetails)]]} />
            </Section>

            <Section title="VI. Valid IDs and Signature">
              <div className="rounded-b-md border border-slate-300 p-2">
                {idSummary ?? <p className="text-sm text-slate-500">No IDs were submitted with this application.</p>}
                {request.borrowerSignature ? (
                  <p className="mt-2 text-sm text-slate-700"><PenLine className="mr-1 inline h-4 w-4 align-[-3px]" />Borrower signed on {formatDate(request.borrowerSignature.signedOn)}
                    <button type="button" onClick={onViewSignature} className="ml-2 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><Eye className="h-3.5 w-3.5" />View signature</button>
                  </p>
                ) : <p className="mt-2 text-sm text-slate-500">Not signed.</p>}
              </div>
            </Section>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Close</button>
          <button type="button" onClick={() => onDecide('declined')} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50"><XCircle className="h-4 w-4" />Decline</button>
          <button type="button" onClick={() => onDecide('approved')} disabled={blocked} title={blocked ? 'The member must pay at least 80% of the open loan first.' : undefined}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle className="h-4 w-4" />{open && !blocked ? 'Approve & Restructure' : 'Approve'}</button>
        </div>
      </div>
    </div>
  );
}
