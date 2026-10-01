import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LoaderCircle, Search, X, XCircle } from 'lucide-react';
import { fetchMembers } from '../../admin/services/membersApi';
import { civilStatusOptions } from '../../admin/components/AddMemberModal';
import { DocumentScannerModal } from '../../admin/components/DocumentScannerModal';
import { IdDocumentPanel } from '../../admin/components/IdDocumentPanel';
import type { OcrIdReading, OcrIdRequirement, VerificationCheck } from '../../admin/services/ocrApi';
import { fetchLoanQuote, previewLoanIdChecks, readLoanId, type LoanApplicationIds, type LoanIdHolder, type LoanQuote } from '../services/authApi';
import { fetchProtectedImage } from '../../lib/profilePhoto';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';
import type { Member } from '../../admin/pages/MembershipManagement';

// The ACIFAC "Loan Application Form (Agri)" laid out like the printed form.
// Every amount shown is calculated by the backend (POST /api/loans/quote) with
// the same code that saves the loan; the server also adds up the cash and the
// farm inputs itself when the application is submitted.
export const MAX_LOAN_PER_HECTARE = 50000;
export const DEFAULT_INTEREST_RATE = 2.5;

export type LoanMode = 'cash' | 'in-kind' | 'combination';

export type LoanApplicationPayload = {
  memberId: number;
  loanType: string; term: string; purpose: string; loanMode: LoanMode;
  /** Cash Amount Requested; the loan is this plus the in-kind farm inputs. */
  cashAmount: string;
  borrowerEmail: string; borrowerPhone: string; borrowerAddress: string; borrowerAge: string;
  borrowerGender: string; borrowerCivilStatus: string; borrowerOccupation: string; yearsFarming: string;
  farmLocation: string; farmArea: string; cropsPlanted: string; cropSeason: string; irrigationType: string; irrigationOther: string;
  inKindItems: Array<{ item: string; description: string; quantity: string; unit: string; unitPrice: string }>;
  coMakerName: string; coMakerAddress: string; coMakerContact: string; coMakerRelationship: string;
  collateralType: string; collateralDetails: string;
  /** The borrower agreed to the certification and credit investigation at the end of the form. */
  certified: boolean;
};

type Props = {
  initialMember?: Member | null;
  allowMemberLookup?: boolean;
  // Member applications do not collect an email address.
  hideEmail?: boolean;
  /** The admin's name when the loan is approved as it is saved (For Office Use Only). */
  approvedBy?: string | null;
  /** Where the member's 2x2 picture is loaded from. */
  photoPath?: (member: Member) => string;
  submitLabel: string;
  onSubmit: (payload: LoanApplicationPayload, ids: LoanApplicationIds) => Promise<void>;
  onCancel: () => void;
};

// The borrower's and the co-maker's valid IDs: each the front and back of the
// ID on one page with the person's specimen signatures, uploaded or
// photographed. AI reads each as it is picked; the server checks it again.
const REQUIRED_SIGNATURES = 3;
const ID_HOLDERS: LoanIdHolder[] = ['borrower', 'coMaker'];
const ID_REQUIREMENTS: Record<LoanIdHolder, OcrIdRequirement> = {
  borrower: { slot: 'holder', person: 'borrower', label: 'Borrower\'s valid ID', cardCapture: false },
  coMaker: { slot: 'coMaker', person: 'co-maker', label: 'Co-maker\'s valid ID', cardCapture: false },
};
const ID_CHECK_IDS: Record<LoanIdHolder, string[]> = { borrower: ['idDocument', 'idMatch'], coMaker: ['coMakerId', 'coMakerMatch'] };
const ID_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ID_MAX_BYTES = 5 * 1024 * 1024;
type PickedId = { file: File; source: 'upload' | 'camera'; readingId: number | null; reading: OcrIdReading | null; pending: boolean; error: string };

// The rows of the in-kind farm inputs table on the paper form.
const INPUT_ROWS = [
  ['fertilizer', 'Fertilizer'], ['pesticides', 'Pesticides'], ['herbicides', 'Herbicides'],
  ['insecticides', 'Insecticides'], ['seeds', 'Seeds'], ['plantChemicals', 'Plant Chemicals for Spray'],
] as const;
type InputRowKey = (typeof INPUT_ROWS)[number][0];
type InputRow = { description: string; quantity: string; unit: string; unitPrice: string };

const COLLATERAL_OPTIONS = ['Land Title / Property', 'Harvest', 'Savings Deposit / Share Capital'];
const TERMS = [3, 6, 9, 12, 18, 24, 36, 48, 60];
const PHONE = /^[+0-9()\s.-]{7,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DECIMAL = /^\d+(\.\d{1,2})?$/;

type FormState = Omit<LoanApplicationPayload, 'memberId' | 'inKindItems' | 'collateralType' | 'certified'> & {
  rows: Record<InputRowKey, InputRow>;
  collateral: string[];
  certified: boolean;
};

const blankRows = () => Object.fromEntries(INPUT_ROWS.map(([key]) => [key, { description: '', quantity: '', unit: '', unitPrice: '' }])) as Record<InputRowKey, InputRow>;
const blank = (): FormState => ({
  loanType: 'agricultural', term: '12', purpose: '', loanMode: 'cash', cashAmount: '',
  borrowerEmail: '', borrowerPhone: '', borrowerAddress: '', borrowerAge: '', borrowerGender: '', borrowerCivilStatus: '', borrowerOccupation: '', yearsFarming: '',
  farmLocation: '', farmArea: '', cropsPlanted: '', cropSeason: '', irrigationType: 'rainfed', irrigationOther: '',
  rows: blankRows(), coMakerName: '', coMakerAddress: '', coMakerContact: '', coMakerRelationship: '', collateral: [], collateralDetails: '', certified: false,
});

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value || 0);
const ageFromBirthday = (value: string) => { if (!value) return ''; const birth = new Date(value); if (Number.isNaN(birth.getTime())) return ''; const today = new Date(); let age = today.getFullYear() - birth.getFullYear(); if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--; return age >= 0 ? String(age) : ''; };
// Centavos, the way the server adds the amounts up.
const cents = (value: string) => (DECIMAL.test(value.trim()) ? Math.round(Number(value) * 100) : 0);
const lineCents = (row: InputRow) => (DECIMAL.test(row.quantity.trim()) ? Math.round(Number(row.quantity) * cents(row.unitPrice)) : 0);
const rowFilled = (row: InputRow) => Object.values(row).some((value) => value.trim());

function memberToForm(member: Member): Partial<FormState> {
  const gender = member.profile?.gender || '';
  return {
    borrowerEmail: member.email || '', borrowerPhone: member.phone || '', borrowerAddress: member.address || '',
    borrowerAge: ageFromBirthday(member.profile?.birthday || ''), borrowerGender: ['Male', 'Female'].includes(gender) ? gender : '',
    borrowerCivilStatus: member.profile?.civilStatus || '', borrowerOccupation: member.profile?.livelihood || '', farmArea: member.profile?.farmArea || '',
  };
}

// Paper-form building blocks, as on the Add Member form.
const INPUT = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';
const INPUT_ERROR = 'border-red-400';
const CHOICE = 'inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-800';
const BOX = 'h-4 w-4 accent-emerald-600';

function FormTable({ cols, children, className = '' }: { cols: string; children: ReactNode; className?: string }) {
  return <div className={`grid gap-px overflow-hidden rounded-md border border-slate-400 bg-slate-400 ${cols} ${className}`}>{children}</div>;
}

function Cell({ label, required, error, children, className = '' }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 bg-white p-2 ${className}`} data-error={error ? 'true' : undefined}>
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-600">{label}{required && <span className="text-red-500"> *</span>}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  );
}

// The dark section bars of the printed form.
function SectionBar({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-6 rounded-sm bg-slate-800 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-white">{children}</h3>;
}

export function LoanApplicationForm({ initialMember = null, allowMemberLookup = false, hideEmail = false, approvedBy = null, photoPath, submitLabel, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(() => ({ ...blank(), ...(initialMember ? memberToForm(initialMember) : {}) }));
  const [selectedMember, setSelectedMember] = useState<Member | null>(initialMember);
  const [memberSearch, setMemberSearch] = useState(initialMember?.memberId || '');
  const [matches, setMatches] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [quote, setQuote] = useState<LoanQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [ids, setIds] = useState<Record<LoanIdHolder, PickedId | null>>({ borrower: null, coMaker: null });
  const [idChecks, setIdChecks] = useState<VerificationCheck[]>([]);
  const [idCamera, setIdCamera] = useState<LoanIdHolder | null>(null);
  const [acknowledgeIds, setAcknowledgeIds] = useState(false);
  const rootRef = useRef<HTMLFormElement>(null);
  const today = useMemo(() => dateOnlyToday(), []);

  const usesInputs = form.loanMode !== 'cash';
  const usesCash = form.loanMode !== 'in-kind';
  const inKindCents = usesInputs ? INPUT_ROWS.reduce((sum, [key]) => sum + lineCents(form.rows[key]), 0) : 0;
  const cashCents = usesCash ? cents(form.cashAmount) : 0;
  const totalCents = cashCents + inKindCents;
  const area = Number(form.farmArea) || 0;
  const maximum = quote?.maximumEligibleAmount ?? 0;

  useEffect(() => {
    const farmArea = form.farmArea.trim() || '0';
    if (!DECIMAL.test(farmArea)) { setQuote(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchLoanQuote({ farmArea, amount: (totalCents / 100).toFixed(2), term: form.term || '12' })
        .then((result) => { if (!cancelled) { setQuote(result); setQuoteError(''); } })
        .catch((error: Error) => { if (!cancelled) { setQuote(null); setQuoteError(error.message); } });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [form.farmArea, form.term, totalCents]);

  useEffect(() => {
    if (!allowMemberLookup || selectedMember || memberSearch.trim().length < 2) { setMatches([]); return; }
    const timer = window.setTimeout(async () => {
      setSearching(true); setLookupMessage('');
      try { const response = await fetchMembers(memberSearch, 8); setMatches(response.data); setLookupMessage(response.data.length ? '' : 'Member not found. Check the Member / Associate ID or search by name.'); }
      catch { setMatches([]); setLookupMessage('Member search is currently unavailable.'); }
      finally { setSearching(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [allowMemberLookup, memberSearch, selectedMember]);

  // The member's 2x2 picture from their record, in the photo box.
  const photoSource = selectedMember && photoPath ? photoPath(selectedMember) : null;
  useEffect(() => {
    if (!photoSource) { setPhotoUrl(null); return undefined; }
    let cancelled = false;
    let url: string | null = null;
    fetchProtectedImage(photoSource).then((objectUrl) => {
      if (cancelled) { if (objectUrl) URL.revokeObjectURL(objectUrl); return; }
      url = objectUrl;
      setPhotoUrl(objectUrl);
    }).catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); setPhotoUrl(null); };
  }, [photoSource]);

  // How the IDs read so far compare with the borrower and co-maker on the form.
  const borrowerReadingId = ids.borrower?.readingId ?? null;
  const coMakerReadingId = ids.coMaker?.readingId ?? null;
  useEffect(() => {
    if (!selectedMember || (!borrowerReadingId && !coMakerReadingId)) { setIdChecks([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewLoanIdChecks({
        memberId: selectedMember.id, borrowerIdReading: borrowerReadingId, coMakerIdReading: coMakerReadingId,
        borrowerAddress: form.borrowerAddress, borrowerAge: form.borrowerAge, coMakerName: form.coMakerName, coMakerAddress: form.coMakerAddress,
      }).then(({ checks }) => { if (!cancelled) setIdChecks(checks); }).catch(() => { if (!cancelled) setIdChecks([]); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [selectedMember, borrowerReadingId, coMakerReadingId, form.borrowerAddress, form.borrowerAge, form.coMakerName, form.coMakerAddress]);

  const pickId = async (holder: LoanIdHolder, file: File, source: 'upload' | 'camera') => {
    const person = ID_REQUIREMENTS[holder].person;
    if (!ID_FILE_TYPES.includes(file.type) || (source === 'camera' && !file.type.startsWith('image/'))) {
      setIds((current) => ({ ...current, [holder]: null }));
      setErrors((current) => ({ ...current, [`id-${holder}`]: 'Use a PNG, JPG, WEBP or PDF of the ID.' }));
      return;
    }
    if (file.size > ID_MAX_BYTES) {
      setErrors((current) => ({ ...current, [`id-${holder}`]: 'The ID must not exceed 5 MB.' }));
      return;
    }
    clearError(`id-${holder}`); clearError('ids'); clearError('idAck');
    setAcknowledgeIds(false);
    setIds((current) => ({ ...current, [holder]: { file, source, readingId: null, reading: null, pending: true, error: '' } }));
    const settle = (change: Partial<PickedId>) => setIds((current) => (current[holder]?.file === file ? { ...current, [holder]: { ...current[holder]!, pending: false, ...change } } : current));
    try {
      const { readingId, reading } = await readLoanId(file, holder, source);
      settle({ readingId, reading });
    } catch (error) {
      settle({ error: `The ${person}'s ID was not read: ${error instanceof Error ? error.message : 'please try again.'}` });
    }
  };

  const viewId = (holder: LoanIdHolder) => {
    const file = ids[holder]?.file;
    if (!file) return;
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const clearError = (key: string) => setErrors((current) => { if (!current[key]) return current; const next = { ...current }; delete next[key]; return next; });
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => { setForm((current) => ({ ...current, [key]: value })); clearError(String(key)); };
  const updateRow = (key: InputRowKey, field: keyof InputRow, value: string) => {
    setForm((current) => ({ ...current, rows: { ...current.rows, [key]: { ...current.rows[key], [field]: value } } }));
    clearError(`row-${key}`); clearError('rows');
  };
  const toggleCollateral = (option: string) => { setForm((current) => ({ ...current, collateral: current.collateral.includes(option) ? current.collateral.filter((item) => item !== option) : [...current.collateral, option] })); clearError('collateral'); };
  const selectMember = (member: Member) => { setSelectedMember(member); setMemberSearch(member.memberId); setForm((current) => ({ ...current, ...memberToForm(member) })); setMatches([]); clearError('member'); setLookupMessage('Member record auto-filled. Changes below apply only to this application.'); };
  const clearMember = () => { setSelectedMember(null); setMemberSearch(''); setForm(blank()); setErrors({}); setLookupMessage(''); setIds({ borrower: null, coMaker: null }); setIdChecks([]); setAcknowledgeIds(false); };

  // ID checks that need a person to compare the ID with the borrower or co-maker.
  const idWarnings = ID_HOLDERS.flatMap((holder) => (ids[holder]?.readingId ? idChecks.filter((check) => ID_CHECK_IDS[holder].includes(check.id) && check.status === 'warn') : []));

  const validate = () => {
    const next: Record<string, string> = {};
    if (!selectedMember) next.member = 'Select an active member.';
    if (!form.borrowerPhone.trim()) next.borrowerPhone = 'Contact number is required.';
    else if (!PHONE.test(form.borrowerPhone.trim())) next.borrowerPhone = 'Enter a valid number.';
    if (!form.borrowerAddress.trim()) next.borrowerAddress = 'Address is required.';
    if (!hideEmail && form.borrowerEmail.trim() && !EMAIL.test(form.borrowerEmail.trim())) next.borrowerEmail = 'Enter a valid email address.';
    if (form.borrowerAge && !(Number.isInteger(Number(form.borrowerAge)) && Number(form.borrowerAge) > 0 && Number(form.borrowerAge) <= 120)) next.borrowerAge = 'Enter the age in years.';
    if (form.yearsFarming && !(DECIMAL.test(form.yearsFarming) && Number(form.yearsFarming) <= 100)) next.yearsFarming = 'Enter the number of years.';
    if (!form.farmLocation.trim()) next.farmLocation = 'Farm location is required.';
    if (!(DECIMAL.test(form.farmArea.trim()) && area > 0)) next.farmArea = 'Enter the farm area in hectares.';
    if (!form.cropsPlanted.trim()) next.cropsPlanted = 'Required.';
    if (!form.cropSeason.trim()) next.cropSeason = 'Required.';
    if (form.irrigationType === 'other' && !form.irrigationOther.trim()) next.irrigationOther = 'Describe the irrigation.';
    if (usesInputs) {
      const filled = INPUT_ROWS.filter(([key]) => rowFilled(form.rows[key]));
      if (!filled.length) next.rows = 'Fill in at least one farm input for an in-kind or combination loan.';
      for (const [key] of filled) {
        const row = form.rows[key];
        if (!(DECIMAL.test(row.quantity.trim()) && Number(row.quantity) > 0) || !row.unit.trim() || !(DECIMAL.test(row.unitPrice.trim()) && Number(row.unitPrice) > 0)) next[`row-${key}`] = 'Quantity, unit and unit price are required.';
      }
    }
    if (usesCash && !(cashCents > 0)) next.cashAmount = form.cashAmount.trim() && !DECIMAL.test(form.cashAmount.trim()) ? 'Enter a valid amount.' : 'Enter the cash amount requested.';
    if (totalCents > 0 && quote && !quote.withinLimit) next.total = `The amount applied for is more than the maximum of ${money(maximum)} for ${area} hectare(s).`;
    // A co-maker is required: their valid ID is.
    if (!form.coMakerName.trim()) next.coMakerName = 'The co-maker\'s name is required.';
    if (!form.coMakerAddress.trim()) next.coMakerAddress = 'Required.';
    if (!form.coMakerContact.trim()) next.coMakerContact = 'Required.';
    else if (!PHONE.test(form.coMakerContact.trim())) next.coMakerContact = 'Enter a valid number.';
    if (!form.coMakerRelationship.trim()) next.coMakerRelationship = 'Required.';
    for (const holder of ID_HOLDERS) {
      const picked = ids[holder];
      if (!picked?.readingId) next[`id-${holder}`] = picked?.pending ? 'Wait until AI has read the ID.' : `Submit the ${ID_REQUIREMENTS[holder].person}'s valid ID with ${REQUIRED_SIGNATURES} specimen signatures.`;
    }
    const idFailure = idChecks.find((check) => check.status === 'fail');
    if (idFailure && ids.borrower?.readingId && ids.coMaker?.readingId) next.ids = idFailure.message;
    else if (approvedBy && idWarnings.length && !acknowledgeIds) next.idAck = 'Confirm that you compared the flagged ID details with the borrower and co-maker.';
    if (form.collateral.length && !form.collateralDetails.trim()) next.collateralDetails = 'Describe the collateral offered.';
    if (!form.collateral.length && form.collateralDetails.trim()) next.collateral = 'Tick the collateral offered.';
    if (!form.certified) next.certified = 'The borrower must agree to the certification.';
    return next;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError('');
    if (Object.keys(nextErrors).length) {
      window.requestAnimationFrame(() => rootRef.current?.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const { rows, collateral, ...fields } = form;
    const payload: LoanApplicationPayload = {
      ...fields,
      memberId: selectedMember!.id,
      cashAmount: usesCash ? form.cashAmount.trim() : '0',
      irrigationOther: form.irrigationType === 'other' ? form.irrigationOther : '',
      borrowerEmail: hideEmail ? '' : form.borrowerEmail.trim(),
      inKindItems: usesInputs ? INPUT_ROWS.filter(([key]) => rowFilled(rows[key])).map(([key, item]) => ({ item, ...rows[key] })) : [],
      collateralType: collateral.join(', '),
    };
    setSaving(true);
    try { await onSubmit(payload, { borrower: { file: ids.borrower!.file, readingId: ids.borrower!.readingId! }, coMaker: { file: ids.coMaker!.file, readingId: ids.coMaker!.readingId! }, acknowledgeIdWarnings: acknowledgeIds }); }
    catch (error) { setSubmitError(error instanceof Error ? error.message : 'Unable to submit the application.'); }
    finally { setSaving(false); }
  };

  const input = (key: keyof FormState, props: { type?: string; placeholder?: string; inputMode?: 'decimal' | 'numeric'; disabled?: boolean } = {}) => (
    <input
      value={form[key] as string}
      onChange={(event) => update(key, event.target.value as never)}
      className={`${INPUT} ${errors[key] ? INPUT_ERROR : ''}`}
      {...props}
    />
  );
  const errorCount = Object.keys(errors).length;
  const borrowerName = selectedMember?.name || '';
  const approving = Boolean(approvedBy);
  const idChecksFor = (holder: LoanIdHolder) => (ids[holder]?.readingId ? idChecks.filter((check) => ID_CHECK_IDS[holder].includes(check.id)) : []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">New loan</p>
          <h2 className="text-lg font-bold text-slate-900">Loan Application Form (Agri)</h2>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close application"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-100 px-2 py-4 sm:px-6">
        <form id="loanApplicationForm" ref={rootRef} onSubmit={(event) => void handleSubmit(event)} noValidate className="mx-auto max-w-4xl rounded-lg border border-slate-300 bg-white px-3 py-5 shadow-sm sm:px-8">
          <div className="flex justify-end"><span className="rounded-sm border border-slate-700 px-2 py-0.5 text-xs font-bold text-slate-800">Loan Application Form (Agri)</span></div>

          {/* Letterhead with the 2x2 picture box, as on the printed form */}
          <div className="mt-3 flex flex-col-reverse items-center gap-4 sm:flex-row sm:items-start">
            <div className="flex-1 text-center">
              <img src="/logo.png" alt="" className="mx-auto mb-2 h-12 w-12 rounded-full object-cover" />
              <p className="text-sm font-bold uppercase leading-tight text-slate-900">Amnay Cabagan Irrigators and Farmers Agriculture Cooperative</p>
              <p className="text-sm font-bold text-slate-900">(ACIFAC)</p>
              <p className="text-xs font-semibold uppercase text-slate-700">Brgy. Barahan, Sta. Cruz, Occidental Mindoro</p>
              <p className="text-xs text-slate-600">CDA Reg No.: 9520-1040000000041322 · Date Reg: January 3, 2018</p>
            </div>
            <div className="flex aspect-square w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-slate-700 bg-slate-50">
              {photoUrl ? <img src={photoUrl} alt={`2x2 picture of ${borrowerName}`} className="h-full w-full object-cover object-center" />
                : <span className="px-2 text-center text-xs font-bold text-slate-500">2x2 Picture<br /><span className="font-normal">{selectedMember ? 'None on file' : 'From the member record'}</span></span>}
            </div>
          </div>

          <FormTable cols="grid-cols-1 sm:grid-cols-2" className="mt-4">
            <Cell label="Form No."><p className="mt-1 py-1.5 text-sm text-slate-500">Given when the application is submitted</p></Cell>
            <Cell label="Date of Application"><p className="mt-1 py-1.5 text-sm font-medium text-slate-900">{formatDate(today)}</p></Cell>
            <Cell label="Member ID" required error={errors.member} className="sm:col-span-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-3.5 h-4 w-4 text-slate-400" />
                <input className={`${INPUT} pl-8 ${errors.member ? INPUT_ERROR : ''}`} value={memberSearch} disabled={!allowMemberLookup || !!selectedMember} onChange={(event) => setMemberSearch(event.target.value)} placeholder="ACIFAC-2026-001 or member name" aria-label="Member ID" />
                {selectedMember && allowMemberLookup && <button type="button" onClick={clearMember} className="absolute right-1.5 top-2.5 rounded-md px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Change</button>}
              </div>
              {searching && <p className="mt-1 flex items-center gap-2 text-xs text-slate-600"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Finding members…</p>}
              {matches.length > 0 && <div className="mt-1 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white shadow-sm">{matches.map((member) => <button type="button" key={member.id} onClick={() => selectMember(member)} className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"><span className="block text-sm font-semibold text-slate-900">{member.name}</span><span className="text-xs text-slate-500">{member.memberId} · {member.phone || 'No contact number'}</span></button>)}</div>}
              {lookupMessage && <p className="mt-1 text-xs text-slate-600">{lookupMessage}</p>}
            </Cell>
          </FormTable>

          <SectionBar>I. Borrower Information</SectionBar>
          <FormTable cols="grid-cols-1 sm:grid-cols-2">
            <Cell label="Borrower Name"><p className="mt-1 min-h-[2rem] py-1.5 text-sm font-semibold text-slate-900">{borrowerName || <span className="font-normal text-slate-400">From the member record</span>}</p></Cell>
            <Cell label="Occupation">{input('borrowerOccupation', { placeholder: 'e.g. Farmer' })}</Cell>
            <Cell label="Associate No."><p className="mt-1 min-h-[2rem] py-1.5 text-sm font-semibold text-slate-900">{selectedMember?.memberId || <span className="font-normal text-slate-400">From the member record</span>}</p></Cell>
            <Cell label="Years of Farming" error={errors.yearsFarming}>{input('yearsFarming', { inputMode: 'decimal', placeholder: '0' })}</Cell>
          </FormTable>
          <FormTable cols="grid-cols-2 sm:grid-cols-[0.6fr_1fr_1.4fr]" className="mt-2">
            <Cell label="Age" error={errors.borrowerAge}>{input('borrowerAge', { inputMode: 'numeric' })}</Cell>
            <Cell label="Civil Status">
              <select value={form.borrowerCivilStatus} onChange={(event) => update('borrowerCivilStatus', event.target.value)} className={INPUT}>
                <option value="">Select</option>
                {(form.borrowerCivilStatus && !civilStatusOptions.includes(form.borrowerCivilStatus) ? [form.borrowerCivilStatus, ...civilStatusOptions] : civilStatusOptions).map((option) => <option key={option}>{option}</option>)}
              </select>
            </Cell>
            <Cell label="Sex" className="col-span-2 sm:col-span-1">
              <div className="mt-1 flex flex-wrap gap-x-5" role="radiogroup" aria-label="Sex">
                {['Male', 'Female'].map((option) => <label key={option} className={CHOICE}><input type="radio" name="loan-sex" className={BOX} checked={form.borrowerGender === option} onChange={() => update('borrowerGender', option)} />{option}</label>)}
              </div>
            </Cell>
          </FormTable>
          <FormTable cols="grid-cols-1" className="mt-2">
            <Cell label="Address" required error={errors.borrowerAddress}>{input('borrowerAddress', { placeholder: 'House no. / Sitio / Purok, Barangay, Municipality' })}</Cell>
          </FormTable>
          <FormTable cols={hideEmail ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} className="mt-2">
            <Cell label="Contact No." required error={errors.borrowerPhone}>{input('borrowerPhone', { placeholder: '09XX XXX XXXX' })}</Cell>
            {!hideEmail && <Cell label="Email" error={errors.borrowerEmail}>{input('borrowerEmail', { type: 'email', placeholder: 'member@email.com' })}</Cell>}
          </FormTable>

          <SectionBar>II. Farm Information</SectionBar>
          <FormTable cols="grid-cols-1">
            <Cell label="Farm Location / Sitio & Barangay" required error={errors.farmLocation}>{input('farmLocation', { placeholder: 'e.g. Sitio Maligaya, Barahan' })}</Cell>
          </FormTable>
          <FormTable cols="grid-cols-1 sm:grid-cols-2" className="mt-2">
            <Cell label="Total Farm Area (hectares)" required error={errors.farmArea}>{input('farmArea', { inputMode: 'decimal', placeholder: '0.00' })}</Cell>
            <Cell label="Crops Planted" required error={errors.cropsPlanted}>{input('cropsPlanted', { placeholder: 'e.g. Palay, corn' })}</Cell>
            <Cell label="Crop Season / Year" required error={errors.cropSeason}>{input('cropSeason', { placeholder: 'e.g. Wet season 2026' })}</Cell>
            <Cell label="Irrigation Type" required>
              <div className="mt-1 flex flex-wrap gap-x-5" role="radiogroup" aria-label="Irrigation type">
                {[['rainfed', 'Rainfed'], ['irrigated', 'Irrigated'], ['other', 'Other']].map(([value, label]) => <label key={value} className={CHOICE}><input type="radio" name="loan-irrigation" className={BOX} checked={form.irrigationType === value} onChange={() => update('irrigationType', value)} />{label}</label>)}
              </div>
            </Cell>
          </FormTable>
          <FormTable cols="grid-cols-1" className="mt-2">
            <Cell label="Other" required={form.irrigationType === 'other'} error={errors.irrigationOther}>{input('irrigationOther', { disabled: form.irrigationType !== 'other', placeholder: form.irrigationType === 'other' ? 'Describe the irrigation' : 'Only when Other is ticked' })}</Cell>
          </FormTable>

          <SectionBar>III. Loan Details</SectionBar>
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-1 py-1" role="radiogroup" aria-label="Loan mode">
            {([['cash', 'Cash'], ['in-kind', 'In-Kind'], ['combination', 'Combination']] as const).map(([value, label]) => <label key={value} className={CHOICE}><input type="radio" name="loan-mode" className={BOX} checked={form.loanMode === value} onChange={() => { update('loanMode', value); clearError('rows'); clearError('cashAmount'); }} />{label}</label>)}
          </div>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-800">* In-Kind Loan Details / Farm Inputs {!usesInputs && <span className="font-normal normal-case tracking-normal text-slate-500">— for In-Kind or Combination loans</span>}</p>
          <div className="mt-1 overflow-x-auto" data-error={errors.rows ? 'true' : undefined}>
            <table className={`w-full min-w-[40rem] border-collapse text-sm ${usesInputs ? '' : 'opacity-60'}`}>
              <thead><tr className="bg-slate-100 text-left text-[11px] font-bold uppercase tracking-wide text-slate-700">{['Item', 'Description', 'Quantity', 'Unit', 'Unit Price', 'Total Amount'].map((heading) => <th key={heading} className="border border-slate-400 px-2 py-1.5">{heading}</th>)}</tr></thead>
              <tbody>
                {INPUT_ROWS.map(([key, label]) => {
                  const row = form.rows[key];
                  const rowError = errors[`row-${key}`];
                  const cell = (field: keyof InputRow, props: { inputMode?: 'decimal'; placeholder?: string } = {}) => (
                    <td className="border border-slate-400 p-0.5"><input aria-label={`${label} ${field}`} value={row[field]} disabled={!usesInputs} onChange={(event) => updateRow(key, field, event.target.value)} className={`w-full rounded px-1.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-transparent ${rowError ? 'bg-red-50' : ''}`} {...props} /></td>
                  );
                  return (
                    <tr key={key} data-error={rowError ? 'true' : undefined}>
                      <td className="whitespace-nowrap border border-slate-400 px-2 py-1.5 text-slate-800">{label}</td>
                      {cell('description')}
                      {cell('quantity', { inputMode: 'decimal' })}
                      {cell('unit', { placeholder: 'bag, kg, L' })}
                      {cell('unitPrice', { inputMode: 'decimal' })}
                      <td className="border border-slate-400 px-2 py-1.5 text-right font-medium tabular-nums text-slate-900">{usesInputs && lineCents(row) ? money(lineCents(row) / 100) : ''}</td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50"><td className="border border-slate-400 px-2 py-1.5 font-bold text-slate-900">GRAND TOTAL</td><td colSpan={4} className="border border-slate-400" /><td className="border border-slate-400 px-2 py-1.5 text-right font-bold tabular-nums text-slate-900">{money(inKindCents / 100)}</td></tr>
              </tbody>
            </table>
          </div>
          {(errors.rows || INPUT_ROWS.some(([key]) => errors[`row-${key}`])) && <p className="mt-1 text-xs text-red-600">{errors.rows || 'Each farm input needs its quantity, unit and unit price.'}</p>}

          <FormTable cols="grid-cols-1 sm:grid-cols-2" className="mt-3">
            <Cell label="Cash Amount Requested (Php)" required={usesCash} error={errors.cashAmount}>{input('cashAmount', { inputMode: 'decimal', disabled: !usesCash, placeholder: usesCash ? '0.00' : 'Not for an In-Kind loan' })}</Cell>
            <Cell label="Total Amount Applied For" error={errors.total}><p className="mt-1 py-1.5 text-sm font-bold text-slate-900">{money(totalCents / 100)} {usesCash && usesInputs && <span className="font-normal text-slate-500">(cash + farm inputs)</span>}</p></Cell>
          </FormTable>

          {/* Not on the printed form, but needed to release the loan */}
          <FormTable cols="grid-cols-1 sm:grid-cols-[1fr_1fr_2fr]" className="mt-2">
            <Cell label="Loan Type">
              <select value={form.loanType} onChange={(event) => update('loanType', event.target.value)} className={INPUT}><option value="agricultural">Agricultural</option><option value="personal">Personal</option><option value="emergency">Emergency</option></select>
            </Cell>
            <Cell label="Loan Term" required>
              <select value={form.term} onChange={(event) => update('term', event.target.value)} className={INPUT}>{TERMS.map((term) => <option key={term} value={term}>{term} months</option>)}</select>
            </Cell>
            <Cell label="Purpose">{input('purpose', { placeholder: form.loanType === 'agricultural' ? `Agricultural loan for ${form.cropsPlanted || 'the crops above'}` : 'What the loan is for' })}</Cell>
          </FormTable>
          <p className="mt-1 text-xs text-slate-500">Loan type, term and purpose are not on the printed form.</p>

          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <div className="flex justify-between gap-3"><dt>Maximum eligible ({area.toFixed(2)} ha × {money(MAX_LOAN_PER_HECTARE)})</dt><dd className="font-semibold">{money(maximum)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Interest ({DEFAULT_INTEREST_RATE}% flat per term)</dt><dd className="font-semibold">{money(quote?.calculatedInterest ?? 0)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Total repayment</dt><dd className="font-bold">{money(quote?.totalRepayment ?? 0)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Est. monthly payment ({form.term} months)</dt><dd className="font-semibold">{money(quote?.monthlyPayment ?? 0)}</dd></div>
            </dl>
            {errors.total ? <p className="mt-2 font-semibold text-red-700">{errors.total}</p>
              : totalCents > maximum * 100 && quote ? <p className="mt-2 font-semibold text-red-700">The amount applied for is more than the maximum eligible amount.</p>
                : <p className="mt-2 text-xs text-emerald-800">{quoteError || 'Calculated by ACIFAC’s server, the same way the loan is saved.'}</p>}
          </div>

          <SectionBar>IV. Co-Maker Information</SectionBar>
          <FormTable cols="grid-cols-1">
            <Cell label="Co-Maker Name" required error={errors.coMakerName}>{input('coMakerName')}</Cell>
            <Cell label="Address" required error={errors.coMakerAddress}>{input('coMakerAddress')}</Cell>
          </FormTable>
          <FormTable cols="grid-cols-1 sm:grid-cols-2" className="mt-2">
            <Cell label="Contact No." required error={errors.coMakerContact}>{input('coMakerContact', { placeholder: '09XX XXX XXXX' })}</Cell>
            <Cell label="Relationship to Borrower" required error={errors.coMakerRelationship}>{input('coMakerRelationship', { placeholder: 'e.g. Brother, Neighbor' })}</Cell>
          </FormTable>

          <SectionBar>V. Collateral</SectionBar>
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6" data-error={errors.collateral ? 'true' : undefined}>
            <span className="text-sm text-slate-700">Collateral Offered:</span>
            {COLLATERAL_OPTIONS.map((option) => <label key={option} className={CHOICE}><input type="checkbox" className={BOX} checked={form.collateral.includes(option)} onChange={() => toggleCollateral(option)} />{option}</label>)}
          </div>
          {errors.collateral && <p className="text-xs text-red-600">{errors.collateral}</p>}
          <FormTable cols="grid-cols-1" className="mt-2">
            <Cell label="Description / Details of Collateral" required={form.collateral.length > 0} error={errors.collateralDetails}>
              <textarea rows={2} value={form.collateralDetails} onChange={(event) => update('collateralDetails', event.target.value)} className={`${INPUT} ${errors.collateralDetails ? INPUT_ERROR : ''}`} />
            </Cell>
          </FormTable>

          <SectionBar>Valid IDs with Specimen Signatures</SectionBar>
          <p className="text-sm text-slate-600">Attach the borrower&apos;s and the co-maker&apos;s valid IDs: the front and back of each ID on one page, with the person&apos;s {REQUIRED_SIGNATURES} specimen signatures. AI reads each ID and checks that it belongs to the borrower or co-maker above.</p>
          <div className="mt-3 space-y-3">
            {ID_HOLDERS.map((holder) => {
              const picked = ids[holder];
              return (
                <div key={holder} data-error={errors[`id-${holder}`] ? 'true' : undefined}>
                  <IdDocumentPanel
                    requirement={ID_REQUIREMENTS[holder]}
                    id={picked?.readingId && picked.reading ? { fileName: picked.file.name, mimeType: picked.file.type, size: picked.file.size, source: picked.source, reading: picked.reading } : null}
                    formName="loan application"
                    requiredSignatures={REQUIRED_SIGNATURES}
                    checks={idChecksFor(holder)}
                    error={picked?.error || errors[`id-${holder}`]}
                    editable
                    submitting={Boolean(picked?.pending)}
                    disabled={saving || Boolean(picked?.pending)}
                    onUpload={(file) => void pickId(holder, file, 'upload')}
                    onCapture={() => setIdCamera(holder)}
                    onView={() => viewId(holder)}
                  />
                </div>
              );
            })}
          </div>
          {idChecks.filter((check) => check.id === 'coMaker' && check.status === 'fail').map((check) => <p key={check.id} className="mt-2 flex gap-2 text-sm text-red-700"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{check.message}</p>)}
          {errors.ids && <p className="mt-2 flex gap-2 text-sm text-red-700" data-error="true"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{errors.ids}</p>}
          {idWarnings.length > 0 && (approving ? (
            <label className={`mt-3 flex items-start gap-2 rounded-md border p-3 text-sm ${errors.idAck ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`} data-error={errors.idAck ? 'true' : undefined}>
              <input type="checkbox" className={`${BOX} mt-0.5 shrink-0`} checked={acknowledgeIds} onChange={(event) => { setAcknowledgeIds(event.target.checked); clearError('idAck'); }} />
              <span>I compared the flagged ID details with the borrower and co-maker, and the IDs are theirs. <span className="text-red-500">*</span></span>
            </label>
          ) : <p className="mt-2 text-sm text-amber-800">The cooperative will look at the flagged ID details when it reviews the application.</p>)}
          {errors.idAck && <p className="mt-1 text-xs text-red-600">{errors.idAck}</p>}

          <SectionBar>VI. For Office Use Only</SectionBar>
          <div className={approving ? '' : 'opacity-70'}>
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              {['Approved', 'Disapproved', 'For Evaluation'].map((status) => <label key={status} className="inline-flex items-center gap-2 text-sm uppercase text-slate-800"><input type="checkbox" className={BOX} checked={approving && status === 'Approved'} disabled readOnly />{status}</label>)}
            </div>
            <FormTable cols="grid-cols-1 sm:grid-cols-3" className="mt-2">
              <Cell label="Approved Cash Amount (Php)"><p className="mt-1 py-1.5 text-sm font-medium text-slate-900">{approving ? money(cashCents / 100) : '—'}</p></Cell>
              <Cell label="Approved In-Kind Amount (Php)"><p className="mt-1 py-1.5 text-sm font-medium text-slate-900">{approving ? money(inKindCents / 100) : '—'}</p></Cell>
              <Cell label="Approved Total Amount (Php)"><p className="mt-1 py-1.5 text-sm font-bold text-slate-900">{approving ? money(totalCents / 100) : '—'}</p></Cell>
            </FormTable>
            <FormTable cols="grid-cols-1 sm:grid-cols-[2fr_1fr]" className="mt-2">
              <Cell label="Evaluated / Approved by"><p className="mt-1 py-1.5 text-sm font-medium text-slate-900">{approvedBy || '—'}</p></Cell>
              <Cell label="Date"><p className="mt-1 py-1.5 text-sm font-medium text-slate-900">{approving ? formatDate(today) : '—'}</p></Cell>
            </FormTable>
            <p className="mt-1 text-xs text-slate-500">{approving ? 'Saving this form approves and releases the loan with these amounts.' : 'Filled in by the cooperative when the application is reviewed.'}</p>
          </div>

          <div className="mt-6 border-t border-slate-300 pt-4" data-error={errors.certified ? 'true' : undefined}>
            <p className="text-sm font-bold leading-relaxed text-slate-900">I/ we hereby certify that all information stated is true, accurate and complete to the best of my/our knowledge. I/ We understand that submission of false information is grounds for disapproval and legal action. I/ We hereby authorize ACIFAC to verify and conduct credit investigation on my/our personal data in accordance with the Data Privacy Act of 2012 (RA. 10173).</p>
            <label className={`mt-3 flex items-start gap-2 rounded-md border p-3 text-sm ${errors.certified ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-slate-50'}`}>
              <input type="checkbox" className={`${BOX} mt-0.5 shrink-0`} checked={form.certified} onChange={(event) => update('certified', event.target.checked)} />
              <span>{allowMemberLookup ? 'The borrower read this certification and agrees to it.' : 'I have read this certification and agree to it.'} <span className="text-red-500">*</span></span>
            </label>
            {errors.certified && <p className="mt-1 text-xs text-red-600">{errors.certified}</p>}
            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-xs text-center">
                <p className="min-h-[1.5rem] text-sm font-semibold uppercase text-slate-900">{borrowerName}</p>
                <div className="border-t border-slate-700 pt-1 text-xs text-slate-600">Borrower Signature over Printed Name</div>
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {submitError ? <span className="text-sm text-red-600">{submitError}</span> : errorCount > 0 && <span className="text-sm text-red-600">{errorCount === 1 ? '1 field needs' : `${errorCount} fields need`} attention.</span>}
          <button type="submit" form="loanApplicationForm" disabled={saving} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400">{saving ? 'Submitting…' : submitLabel}</button>
        </div>
      </div>
      {idCamera && (
        <DocumentScannerModal
          variant="idCopy"
          person={ID_REQUIREMENTS[idCamera].person}
          requiredSignatures={REQUIRED_SIGNATURES}
          onClose={() => setIdCamera(null)}
          onScanned={(file) => { const holder = idCamera; setIdCamera(null); void pickId(holder, file, 'camera'); }}
        />
      )}
    </div>
  );
}
