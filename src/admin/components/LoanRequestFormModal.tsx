import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Clock, Eye, PenLine, RefreshCcw, X, XCircle } from 'lucide-react';
import type { AdminLoanRequest } from '../../app/services/authApi';
import { dateOnlyToday, formatDate, formatDateTime } from '../../utils/dateTime';
import { FIRST_LOAN_YEAR_HECTARES, inFirstLoanYear, interestRateLabel, loanRelease, MAX_LOAN_PER_HECTARE } from '../../lib/loanPolicy';
import { LoanProceeds } from '../../app/components/LoanProceeds';

const peso = (value: number | string | null | undefined) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const text = (value: unknown) => (value === null || value === undefined || String(value).trim() === '' ? '' : String(value));
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
type Decision = 'approved' | 'declined' | 'evaluation';
const DECISIONS: Array<{ key: Decision; label: string }> = [
  { key: 'approved', label: 'Approved' }, { key: 'declined', label: 'Disapproved' }, { key: 'evaluation', label: 'For Evaluation' },
];

export function LoanRequestFormModal({ request, idSummary, reviewerName, onViewSignature, onDecide, onClose }: {
  request: AdminLoanRequest;
  idSummary?: ReactNode;
  /** The administrator reviewing it: "Evaluated / Approved by". */
  reviewerName: string;
  onViewSignature: () => void;
  /** evaluation: keeps it pending, with `reason` as the office's note on what is being evaluated. */
  onDecide: (status: 'approved' | 'declined' | 'evaluation', reason?: string) => Promise<void>;
  onClose: () => void;
}) {
  // An application already approved or disapproved opens read-only, ticked with its decision.
  const decided = request.status !== 'pending';
  // The note saved with For Evaluation (office only); a pending one opens with For Evaluation ticked.
  const savedNote = request.evaluationNotes?.trim() || '';
  // VII. For Office Use Only: the administrator ticks the decision, then saves it.
  const [decision, setDecision] = useState<Decision | null>(!decided && savedNote ? 'evaluation' : null);
  const shown: Decision | null = decided ? (request.status as Decision) : decision;
  const [declining, setDeclining] = useState(false);
  // Disapproved and For Evaluation ask for their message at once; Cancel goes back to the decision ticked before.
  const [evaluating, setEvaluating] = useState(false);
  const decisionBefore = useRef<Decision | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !declining && !evaluating) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, declining, evaluating]);
  const decide = async (status: 'approved' | 'declined' | 'evaluation', reason?: string) => {
    if (saving) return;
    setSaving(true);
    try { await onDecide(status, reason); } finally { setSaving(false); }
  };
  const pick = (key: Decision) => {
    if (key !== 'approved') decisionBefore.current = decision;
    if (key === 'declined') setDeclining(true);
    if (key === 'evaluation') setEvaluating(true);
    setDecision(key);
  };
  const cancelMessage = () => {
    setDeclining(false);
    setEvaluating(false);
    setDecision(decisionBefore.current);
  };
  // Approve saves from the button below; Disapproved and For Evaluation save from their message window.
  const save = () => {
    if (decision === 'approved') void decide('approved');
    else if (decision === 'evaluation') pick('evaluation');
  };
  // Evaluated by: the note's author when For Evaluation is still the saved decision; else the reviewer now.
  const showSavedEvaluation = !decided && decision === 'evaluation' && Boolean(savedNote);

  const items = request.inKindItems ?? [];
  const inKindTotal = items.reduce((sum, item) => sum + Math.round(Number(item.quantity) * Number(item.unitPrice) * 100), 0) / 100;
  const cashAmount = Math.max(0, request.amount - inKindTotal);
  // The member's open loan: approving restructures it once 80% is paid; before that it blocks approval.
  const open = !decided && request.openLoanNumber && request.openLoanTotal ? {
    number: request.openLoanNumber, balance: request.openLoanBalance ?? 0, total: request.openLoanTotal, penalty: request.openLoanPenalty ?? 0,
    paidPercent: Math.floor(((request.openLoanTotal - (request.openLoanBalance ?? 0)) / request.openLoanTotal) * 1000) / 10,
  } : null;
  // In the member's first year of loans a loan covers at most 2 hectares: the server refuses more.
  const firstYearMaximum = FIRST_LOAN_YEAR_HECTARES * MAX_LOAN_PER_HECTARE;
  const overFirstYear = !decided && inFirstLoanYear(request.firstLoanYearEnds, dateOnlyToday()) && request.amount > firstYearMaximum;
  const blocked = (open ? open.paidPercent < MIN_PAID_PERCENT : false) || overFirstYear;
  // What approving would take from the proceeds, after a restructured loan's balance and penalty.
  const carried = open ? Math.round((open.balance + open.penalty) * 100) / 100 : 0;
  const release = loanRelease(request.amount, inKindTotal, carried);
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
              <p className={`flex items-start gap-2 rounded-xl p-3 text-sm ${open.paidPercent < MIN_PAID_PERCENT ? 'bg-red-50 text-red-800 ring-1 ring-red-100' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'}`}>
                {open.paidPercent < MIN_PAID_PERCENT ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0" />}
                {open.paidPercent < MIN_PAID_PERCENT
                  ? `This member still has loan ${open.number} open, only ${open.paidPercent}% paid. A new loan is possible once at least ${MIN_PAID_PERCENT}% is paid, so it cannot be approved yet.`
                  : open.penalty > 0
                    ? `Approving restructures loan ${open.number} (${open.paidPercent}% paid): the ${peso(open.balance)} still owed and its ${peso(open.penalty)} late penalty are deducted from the new loan, with the savings, Capital Build-Up and PCIC insurance (see III. Loan Details).`
                    : `Approving restructures loan ${open.number} (${open.paidPercent}% paid): the ${peso(open.balance)} still owed is deducted from the new loan, with the savings, Capital Build-Up and PCIC insurance (see III. Loan Details).`}
              </p>
            )}
            {overFirstYear && (
              <p className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {`This is in the member's first year of loans${request.firstLoanYearEnds ? ` (until ${formatDate(request.firstLoanYearEnds)})` : ' (their first loan)'}, when a loan covers at most ${FIRST_LOAN_YEAR_HECTARES} hectares: at most ${peso(firstYearMaximum)}. It cannot be approved for ${peso(request.amount)}; disapprove it so the member can apply again for up to that amount.`}
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
                ['Total farm area', request.farmArea !== undefined ? `${Number(request.farmArea).toFixed(2)} ha` : ''],
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
                <div><dt className="text-xs text-slate-500">Interest{request.interestRate !== null && request.interestRate !== undefined ? ` (${interestRateLabel(request.interestRate, request.term)})` : ''}</dt><dd className="tabular-nums">{peso(request.calculatedInterest)}</dd></div>
                <div><dt className="text-xs text-slate-500">Total repayment</dt><dd className="font-semibold tabular-nums text-green-700">{peso(request.totalRepayment)}</dd></div>
                <div><dt className="text-xs text-slate-500">Term</dt><dd>{request.term} months, due at end of term</dd></div>
              </dl>
              {!decided && <div className="mt-2"><LoanProceeds amount={request.amount} inKind={inKindTotal} carried={carried} release={release} preview /></div>}
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

            {/* Filled in by the office only; members never see this part of their application. */}
            <Section title="VII. For Office Use Only">
              <div className="rounded-b-md border border-slate-300 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Decision">
                  {DECISIONS.map(({ key, label }) => {
                    const disabled = decided || (key === 'approved' && blocked);
                    const on = shown === key;
                    const tone = key === 'approved' ? 'border-green-600 bg-green-50 text-green-800' : key === 'declined' ? 'border-red-500 bg-red-50 text-red-800' : 'border-amber-500 bg-amber-50 text-amber-900';
                    return (
                      <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 px-3 text-sm font-bold uppercase ${on ? tone : 'border-slate-200 text-slate-700 hover:bg-slate-50'} ${disabled && !on ? 'cursor-not-allowed opacity-50' : disabled ? 'cursor-default' : ''}`}
                        title={disabled && !decided ? (overFirstYear ? `In the first year of loans, at most ${FIRST_LOAN_YEAR_HECTARES} hectares (${peso(firstYearMaximum)}).` : 'The member must pay at least 80% of the open loan first.') : undefined}>
                        {/* Disapproved and For Evaluation open their message window, also when already ticked. */}
                        <input type="radio" name="office-decision" checked={on} disabled={disabled}
                          onChange={() => { if (key === 'approved') setDecision(key); }}
                          onClick={() => { if (key !== 'approved' && !disabled) pick(key); }}
                          className="h-4 w-4 accent-current" />{label}
                      </label>
                    );
                  })}
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-slate-300 bg-slate-300 sm:grid-cols-3">
                  {[
                    ['Approved Cash Amount (Php)', peso(cashAmount)],
                    ['Approved In-Kind Amount (Php)', peso(inKindTotal)],
                    ['Approved Total Amount (Php)', peso(request.amount)],
                  ].map(([label, value], index) => (
                    <div key={label} className="bg-white p-2">
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className={`mt-0.5 min-h-[1.25rem] text-sm tabular-nums text-slate-900 ${index === 2 ? 'font-bold' : 'font-medium'}`}>{shown === 'approved' ? value : ''}</dd>
                    </div>
                  ))}
                </dl>
                <dl className="mt-2 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-slate-300 bg-slate-300 sm:grid-cols-[2fr_1fr]">
                  <div className="bg-white p-2"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Evaluated / Approved by</dt><dd className="mt-0.5 min-h-[1.25rem] text-sm font-medium text-slate-900">{decided ? '' : showSavedEvaluation ? (request.evaluatedBy || '') : decision ? reviewerName : ''}</dd></div>
                  <div className="bg-white p-2"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Date</dt><dd className="mt-0.5 min-h-[1.25rem] text-sm font-medium text-slate-900">{decided ? (request.reviewedAt ? formatDate(request.reviewedAt) : '') : showSavedEvaluation ? formatDate(request.evaluatedAt) : decision ? formatDate(dateOnlyToday()) : ''}</dd></div>
                </dl>
                {savedNote && (
                  <div className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900 ring-1 ring-amber-200">
                    <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="text-xs font-bold uppercase tracking-wide">For evaluation{request.evaluatedAt ? ` · ${formatDateTime(request.evaluatedAt)}` : ''}{request.evaluatedBy ? ` · ${request.evaluatedBy}` : ''}</span>
                      {!decided && <button type="button" onClick={() => pick('evaluation')} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"><PenLine className="h-3.5 w-3.5" />Edit message</button>}
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words">{savedNote}</p>
                  </div>
                )}
                {decided && request.status === 'declined' && request.reviewNotes && <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">Reason: {request.reviewNotes}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  {decided ? `This application was ${request.status === 'approved' ? 'approved' : 'disapproved'}${request.reviewedAt ? ` on ${formatDate(request.reviewedAt)}` : ''}.`
                    : decision === 'approved' ? 'Saving approves the application as applied for and releases the loan with these amounts.'
                    : decision === 'declined' ? 'The reason you give is sent to the member with the decision.'
                      : decision === 'evaluation' ? 'Saving asks what is being evaluated. The application stays pending until it is approved or disapproved; only the office sees the message.'
                        : 'Tick the decision: Disapproved and For Evaluation ask for a message; Approved is saved with Approve.'}
                </p>
              </div>
            </Section>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:px-6">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200">Close</button>
          {/* No Disapprove button: ticking Disapproved asks for the reason and disapproves from there. */}
          {!decided && decision !== 'declined' && <button type="button" onClick={save} disabled={!decision || saving}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${decision === 'evaluation' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}>
            {decision === 'evaluation' ? <><Clock className="h-4 w-4" />Keep for evaluation…</>
                : <><CheckCircle className="h-4 w-4" />{saving ? 'Approving…' : decision === 'approved' && open ? 'Approve & Restructure' : decision === 'approved' ? 'Approve' : 'Tick a decision'}</>}
          </button>}
        </div>
      </div>
      {declining && <DeclineModal name={request.memberName} saving={saving} onCancel={cancelMessage} onDecline={(reason) => void decide('declined', reason)} />}
      {evaluating && <EvaluationModal name={request.memberName} initial={savedNote} saving={saving} onCancel={cancelMessage} onSave={(message) => void decide('evaluation', message)} />}
    </div>
  );
}

// For Evaluation: what is being evaluated (required). It stays with the
// application for the office; the member is not told.
function EvaluationModal({ name, initial, saving, onCancel, onSave }: { name: string; initial: string; saving: boolean; onCancel: () => void; onSave: (message: string) => void }) {
  const [message, setMessage] = useState(initial);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const trimmed = message.trim();
  return (
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="evaluation-title">
      <form onSubmit={(event) => { event.preventDefault(); if (trimmed) onSave(trimmed); }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"><Clock className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 id="evaluation-title" className="text-lg font-bold text-slate-900">Keep {name}&apos;s application for evaluation</h3>
            <p className="text-sm text-slate-600">It stays pending until it is approved or disapproved. Only the office sees this message; the member is not told.</p>
          </div>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-700">Message
          <textarea autoFocus required rows={4} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="e.g. Checking the farm area with the barangay before approving."
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
          <button type="submit" disabled={saving || !trimmed} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"><Clock className="h-4 w-4" />{saving ? 'Saving…' : 'Save for evaluation'}</button>
        </div>
      </form>
    </div>
  );
}

// Why the application is disapproved (optional); the member is told the reason.
function DeclineModal({ name, saving, onCancel, onDecline }: { name: string; saving: boolean; onCancel: () => void; onDecline: (reason?: string) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="decline-title">
      <form onSubmit={(event) => { event.preventDefault(); onDecline(reason.trim() || undefined); }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><XCircle className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 id="decline-title" className="text-lg font-bold text-slate-900">Disapprove {name}&apos;s application?</h3>
            <p className="text-sm text-slate-600">The member is told it was declined, with the reason below.</p>
          </div>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-700">Reason <span className="font-normal text-slate-500">(optional)</span>
          <textarea autoFocus rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. The farm area could not be verified."
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"><XCircle className="h-4 w-4" />{saving ? 'Declining…' : 'Disapprove'}</button>
        </div>
      </form>
    </div>
  );
}
