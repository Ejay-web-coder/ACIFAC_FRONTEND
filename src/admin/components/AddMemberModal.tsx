import { createContext, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { dateOnlyToday } from '../../utils/dateTime';
import { Camera, Check, FileSpreadsheet, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { DocumentScannerModal } from './DocumentScannerModal';
import { IdDocumentPanel } from './IdDocumentPanel';
import { SignaturePad } from './SignaturePad';
import { previewMemberIdChecks, readMemberId, type MemberIdUpload } from '../services/membersApi';
import type { OcrIdReading, OcrIdRequirement, VerificationCheck } from '../services/ocrApi';
import type { Member } from '../pages/MembershipManagement';

export interface MemberDraftChild {
  id: number;
  name: string;
  age: string;
}

export interface MemberDraftIncome {
  id: number;
  source: string;
  amount: string;
}

export interface MemberDraftData {
  memberNumber: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  shareCapital: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthday: string;
  age: string;
  gender: string;
  civilStatus: string;
  cpNo: string;
  highestEducation: string;
  idType: string;
  idTypeOther: string;
  idNumber: string;
  permanentAddress: string;
  barangay: string;
  municipality: string;
  province: string;
  rsbsaNumber: string;
  farmArea: string;
  livelihood: string;
  annualIncome: string;
  spouseName: string;
  spouseAge: string;
  spouseContact: string;
  motherMaidenName: string;
  motherLastName: string;
  motherFirstName: string;
  motherMiddleName: string;
  children: MemberDraftChild[];
  incomeSources: MemberDraftIncome[];
  membershipType: string;
  membershipAcceptanceDate: string;
  separationDate: string;
  bodResolution: string;
  membershipFee: string;
  dateReceived: string;
  preMembershipSeminar: string;
  paymentOfMembershipFee: string;
  orNumber: string;
  initialPaidUpCapital: string;
  // "For cooperative" certifications on the paper form.
  seminarOrNumber: string;
  seminarCertifiedBy: string;
  feeCertifiedBy: string;
  capitalOrNumber: string;
  capitalCertifiedBy: string;
}

// Today's date in Asia/Manila (toISOString() would give the UTC date before 8 AM).
const today = () => dateOnlyToday();

const initialState: MemberDraftData = {
  memberNumber: '',
  fullName: '',
  email: '',
  phone: '',
  address: '',
  shareCapital: '',
  lastName: '',
  firstName: '',
  middleName: '',
  birthday: '',
  age: '',
  gender: '',
  civilStatus: '',
  cpNo: '',
  highestEducation: '',
  idType: '',
  idTypeOther: '',
  idNumber: '',
  permanentAddress: '',
  barangay: '',
  municipality: '',
  province: '',
  rsbsaNumber: '',
  farmArea: '',
  livelihood: '',
  annualIncome: '',
  spouseName: '',
  spouseAge: '',
  spouseContact: '',
  motherMaidenName: '',
  motherLastName: '',
  motherFirstName: '',
  motherMiddleName: '',
  children: [{ id: 1, name: '', age: '' }, { id: 2, name: '', age: '' }, { id: 3, name: '', age: '' }],
  incomeSources: [{ id: 1, source: '', amount: '' }, { id: 2, source: '', amount: '' }],
  membershipType: 'Associate',
  membershipAcceptanceDate: today(),
  separationDate: '',
  bodResolution: '',
  membershipFee: '',
  dateReceived: today(),
  preMembershipSeminar: 'Yes',
  paymentOfMembershipFee: 'Yes',
  orNumber: '',
  initialPaidUpCapital: '',
  seminarOrNumber: '',
  seminarCertifiedBy: '',
  feeCertifiedBy: '',
  capitalOrNumber: '',
  capitalCertifiedBy: '',
};

// Shared with the member view and edit windows so all three use the same choices.
export const idTypeOptions = ['National ID', 'Driver\'s License', 'Passport', 'UMID', 'Voter\'s ID', 'Other'];
export const genderOptions = ['Male', 'Female', 'Prefer not to say'];
export const civilStatusOptions = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];
export const educationOptions = ['Elementary', 'High School', 'Vocational', 'College', 'Graduate Studies'];
export const membershipTypeOptions = ['Regular', 'Associate', 'Lifetime'];

// Signatures drawn on screen by members added before the signed ID copy was required.
export const SIGNATURE_COUNT = 3;

// The applicant's valid ID, like a loan co-maker's: the front and back of the
// ID on one page with the applicant's 3 specimen signatures, uploaded or
// photographed. AI reads it as it is picked; the server checks it again.
const REQUIRED_ID_SIGNATURES = 3;
const APPLICANT_ID: OcrIdRequirement = { slot: 'holder', person: 'applicant', label: 'Applicant\'s valid ID', cardCapture: false };
type PickedId = { file: File; source: 'upload' | 'camera'; readingId: number | null; reading: OcrIdReading | null; pending: boolean; error: string };

function calculateAgeFromBirthday(birthday: string) {
  if (!birthday) return '';
  const birthDate = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return '';
  const todayDate = new Date();
  let age = todayDate.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    todayDate.getMonth() > birthDate.getMonth() ||
    (todayDate.getMonth() === birthDate.getMonth() && todayDate.getDate() >= birthDate.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return String(Math.max(0, age));
}

function sanitizeFile(file: File | null) {
  if (!file) return null;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Only JPG, PNG, and WEBP images are supported for the 2x2 ID photo.');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('The photo must be 2 MB or smaller.');
  }
  return file;
}

function sanitizeIdDocument(file: File | null) {
  if (!file) return null;
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    throw new Error('Upload a JPG, PNG, WEBP, or PDF ID document.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('The ID document must be 5 MB or smaller.');
  }
  return file;
}

// Paper-form building blocks: a bordered table whose cells hold a small caps
// label above the input, like the printed ACIFAC membership form.
const INPUT = 'mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none';
const INPUT_ERROR = 'border-red-400';

function FormTable({ cols, children, className = '' }: { cols: string; children: ReactNode; className?: string }) {
  return <div className={`grid gap-px overflow-hidden rounded-md border border-slate-400 bg-slate-400 ${cols} ${className}`}>{children}</div>;
}

// True while the form is shown in the member View window.
const ReadOnlyContext = createContext(false);
const VIEW_TEXT = 'mt-1 min-h-[1.75rem] whitespace-pre-wrap break-words px-0.5 py-1 text-sm font-medium text-slate-900';

function Cell({ label, required, error, children, className = '' }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  const readOnly = useContext(ReadOnlyContext);
  return (
    <div className={`min-w-0 bg-white p-2 ${className}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {label}{required && !readOnly && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  );
}

function HeaderCell({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <div className={`bg-slate-100 px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-700 ${className}`}>{children}</div>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 mt-5 text-xs font-bold uppercase tracking-wide text-slate-800">{children}</h3>;
}

export type MemberFormMode = 'add' | 'edit' | 'view';

/** New files picked in the form. In Edit, null means "keep the one on file". */
export interface MemberFormFiles {
  photo: File | null;
  /** The signed back-to-back ID copy AI read. */
  idDocument: MemberIdUpload | null;
}

/** The member's files already on record, shown in Edit and View. */
export interface SavedMemberFiles {
  photoUrl: string | null;
  idDocumentName: string | null;
  onOpenIdDocument?: () => void;
  /** Signatures drawn on screen by members added before the signed ID copy was required. */
  signatureUrls: Array<string | null>;
}

const NO_SAVED_FILES: SavedMemberFiles = { photoUrl: null, idDocumentName: null, signatureUrls: [] };

/** A blank Add Member form. */
export const emptyMemberDraft = (): MemberDraftData => ({ ...initialState, membershipAcceptanceDate: today(), dateReceived: today() });

// The street part of a stored address: Add saves "street, barangay, municipality, province".
function streetPart(address: string, barangay: string, municipality: string, province: string) {
  const suffix = [barangay, municipality, province].map((part) => part.trim()).filter(Boolean).join(', ');
  if (!suffix) return address;
  if (address.trim() === suffix) return '';
  return address.endsWith(`, ${suffix}`) ? address.slice(0, -(suffix.length + 2)).trim() : address;
}

/** A saved member in the shape of the Add Member form, for Edit and View. */
export function draftFromMember(member: Member): MemberDraftData {
  const p = member.profile || {};
  const knownIdType = !p.idType || idTypeOptions.includes(p.idType);
  const barangay = p.barangay || '';
  const municipality = p.municipality || '';
  const province = p.province || '';
  let rowId = 0;
  const children = (p.childrenList || []).filter((child) => child.name || child.age).map((child) => ({ id: ++rowId, name: child.name, age: child.age }));
  let incomeSources = (p.incomeSources || []).filter((row) => row.source || row.amount).map((row) => ({ id: ++rowId, source: row.source, amount: row.amount }));
  // Members saved before income rows existed have one livelihood and a yearly total.
  if (!incomeSources.length && (p.livelihood || p.yearlyIncome)) incomeSources = [{ id: ++rowId, source: p.livelihood || '', amount: p.yearlyIncome || '' }];
  return {
    ...initialState,
    memberNumber: member.memberId,
    fullName: member.name,
    email: member.email,
    phone: member.phone,
    address: member.address,
    shareCapital: String(member.shareCapital ?? ''),
    lastName: p.lastName || '',
    firstName: p.firstName || '',
    middleName: p.middleName || '',
    birthday: p.birthday || '',
    age: calculateAgeFromBirthday(p.birthday || ''),
    gender: p.gender || '',
    civilStatus: p.civilStatus || '',
    cpNo: member.phone || p.cpNo || '',
    highestEducation: p.highestEducation || '',
    idType: knownIdType ? (p.idType || '') : 'Other',
    idTypeOther: knownIdType ? '' : (p.idType || ''),
    idNumber: p.idNo || '',
    permanentAddress: streetPart(member.address || '', barangay, municipality, province),
    barangay,
    municipality,
    province,
    rsbsaNumber: p.rsbsaNo || '',
    farmArea: p.farmArea || '',
    livelihood: p.livelihood || '',
    annualIncome: p.yearlyIncome || '',
    spouseName: p.spouseName || '',
    spouseAge: p.spouseAge || '',
    spouseContact: p.spouseContact || '',
    motherMaidenName: p.motherMaidenName || '',
    motherLastName: p.motherLastName || '',
    motherFirstName: p.motherFirstName || '',
    motherMiddleName: p.motherMiddleName || '',
    children: children.length ? children : [{ id: ++rowId, name: '', age: '' }],
    incomeSources: incomeSources.length ? incomeSources : [{ id: ++rowId, source: '', amount: '' }],
    membershipType: p.membershipType || 'Associate',
    membershipAcceptanceDate: member.dateJoined || '',
    separationDate: p.separationDate || '',
    bodResolution: p.bodResolution || '',
    membershipFee: p.membershipFee || '',
    dateReceived: p.dateReceived || '',
    preMembershipSeminar: p.preMembershipSeminar || '',
    paymentOfMembershipFee: p.paymentOfMembershipFee || '',
    orNumber: p.orNumber || '',
    initialPaidUpCapital: p.initialPaidUpCapital || '',
    seminarOrNumber: p.seminarOrNumber || '',
    seminarCertifiedBy: p.seminarCertifiedBy || '',
    feeCertifiedBy: p.feeCertifiedBy || '',
    capitalOrNumber: p.capitalOrNumber || '',
    capitalCertifiedBy: p.capitalCertifiedBy || '',
  };
}

const formatDate = (value: string) => {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
};
const peso = (value: string) => {
  const amount = Number(value);
  return value === '' || !Number.isFinite(amount) ? '' : `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
};

/**
 * The ACIFAC associate membership form, laid out like the printed paper form.
 * Add Member, Edit Member and the member View window all show this one form:
 * "add" starts blank, "edit" starts from the saved member, "view" is read-only.
 * The form element carries `formId`, so a button outside it can submit it.
 */
export function MemberForm({
  mode,
  initial,
  saved = NO_SAVED_FILES,
  formId,
  onSubmit,
  onErrorCountChange,
}: {
  mode: MemberFormMode;
  initial: MemberDraftData;
  saved?: SavedMemberFiles;
  formId?: string;
  onSubmit?: (payload: MemberDraftData, files: MemberFormFiles) => Promise<void> | void;
  onErrorCountChange?: (count: number) => void;
}) {
  const readOnly = mode === 'view';
  const isAdd = mode === 'add';
  const [form, setForm] = useState<MemberDraftData>(initial);
  const isSingle = form.civilStatus === 'Single';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // The signed ID copy picked in the form, and how it compares with the applicant.
  const [pickedId, setPickedId] = useState<PickedId | null>(null);
  const [idChecks, setIdChecks] = useState<VerificationCheck[]>([]);
  const [idChecksReading, setIdChecksReading] = useState<number | null>(null);
  const [acknowledgeId, setAcknowledgeId] = useState(false);
  const [idCamera, setIdCamera] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLFormElement>(null);

  // View follows the member it is showing.
  useEffect(() => {
    if (readOnly) setForm(initial);
  }, [readOnly, initial]);

  useEffect(() => {
    onErrorCountChange?.(Object.keys(errors).length);
  }, [errors, onErrorCountChange]);

  const totalAnnualIncome = useMemo(
    () => form.incomeSources.reduce((sum, row) => {
      const value = Number(row.amount || 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0),
    [form.incomeSources]
  );

  const clearError = (field: string) => setErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });

  const updateField = (field: keyof MemberDraftData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    clearError(field);
  };

  const handleBirthdayChange = (value: string) => {
    setForm((current) => ({ ...current, birthday: value, age: calculateAgeFromBirthday(value) }));
    clearError('birthday');
  };

  const updateChild = (id: number, key: 'name' | 'age', value: string) => setForm((current) => ({
    ...current,
    children: current.children.map((item) => item.id === id ? { ...item, [key]: value } : item),
  }));
  const addChild = () => setForm((current) => ({ ...current, children: [...current.children, { id: Date.now(), name: '', age: '' }] }));
  const removeChild = (id: number) => setForm((current) => ({
    ...current,
    children: current.children.length > 1 ? current.children.filter((child) => child.id !== id) : current.children,
  }));

  const updateIncome = (id: number, key: 'source' | 'amount', value: string) => setForm((current) => ({
    ...current,
    incomeSources: current.incomeSources.map((item) => item.id === id ? { ...item, [key]: value } : item),
  }));
  const addIncomeSource = () => setForm((current) => ({ ...current, incomeSources: [...current.incomeSources, { id: Date.now(), source: '', amount: '' }] }));
  const removeIncomeSource = (id: number) => setForm((current) => ({
    ...current,
    incomeSources: current.incomeSources.length > 1 ? current.incomeSources.filter((row) => row.id !== id) : current.incomeSources,
  }));

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputFile = event.target.files?.[0] ?? null;
    event.target.value = '';
    try {
      const nextFile = sanitizeFile(inputFile);
      if (!nextFile) return;
      setPhotoFile(nextFile);
      clearError('idPhoto');
      const objectUrl = URL.createObjectURL(nextFile);
      setPhotoPreview((current) => {
        if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
        return objectUrl;
      });
    } catch (error) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setErrors((current) => ({ ...current, idPhoto: error instanceof Error ? error.message : 'Invalid photo file.' }));
    }
  };

  // AI reads the ID as soon as it is picked.
  const pickId = async (file: File, source: 'upload' | 'camera') => {
    try {
      sanitizeIdDocument(file);
    } catch (error) {
      setErrors((current) => ({ ...current, idDocument: error instanceof Error ? error.message : 'Invalid ID document file.' }));
      return;
    }
    clearError('idDocument');
    clearError('idAck');
    setAcknowledgeId(false);
    setPickedId({ file, source, readingId: null, reading: null, pending: true, error: '' });
    const settle = (change: Partial<PickedId>) => setPickedId((current) => (current?.file === file ? { ...current, pending: false, ...change } : current));
    try {
      const { readingId, reading } = await readMemberId(file, source);
      settle({ readingId, reading });
    } catch (error) {
      settle({ error: `The ID was not read: ${error instanceof Error ? error.message : 'please try again.'}` });
    }
  };

  const handleIdFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void pickId(file, 'upload');
  };

  const viewPickedId = () => {
    if (!pickedId) return;
    const url = URL.createObjectURL(pickedId.file);
    window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // Edit: keep the ID on file instead.
  const clearPickedId = () => {
    setPickedId(null);
    setAcknowledgeId(false);
    clearError('idDocument');
    clearError('idAck');
  };

  // How the ID read compares with the name, birthday and ID No. on the form.
  const idReadingId = pickedId?.readingId ?? null;
  useEffect(() => {
    if (!idReadingId) { setIdChecks([]); setIdChecksReading(null); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      previewMemberIdChecks({ idReading: idReadingId, firstName: form.firstName, middleName: form.middleName, lastName: form.lastName, dateOfBirth: form.birthday, idNumber: form.idNumber })
        .then(({ checks }) => { if (!cancelled) { setIdChecks(checks); setIdChecksReading(idReadingId); } })
        .catch(() => { if (!cancelled) setIdChecks([]); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [idReadingId, form.firstName, form.middleName, form.lastName, form.birthday, form.idNumber]);
  const idWarnings = idReadingId ? idChecks.filter((check) => check.status === 'warn') : [];

  useEffect(() => () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  // Add asks for the whole paper form. Edit asks only for what a saved member
  // must have, so older, imported and scanned records can still be corrected.
  const validate = () => {
    const next: Record<string, string> = {};
    if (isAdd && form.memberNumber.trim() && !/^ACIFAC-[A-Z0-9-]+$/i.test(form.memberNumber.trim())) next.memberNumber = 'Use the ACIFAC membership number format.';
    if (!form.lastName.trim()) next.lastName = 'Last name is required.';
    if (!form.firstName.trim()) next.firstName = 'First name is required.';
    if (form.birthday && new Date(`${form.birthday}T00:00:00`) > new Date()) next.birthday = 'Birthday cannot be in the future.';
    if (!form.cpNo.trim()) next.cpNo = 'CP number is required.';
    else if (!/^[+0-9()\s.-]{7,30}$/.test(form.cpNo.trim())) next.cpNo = 'Enter a valid number.';
    if (form.idType === 'Other' && !form.idTypeOther.trim()) next.idTypeOther = 'Specify the ID type.';
    if (form.farmArea !== '' && !(Number(form.farmArea) >= 0)) next.farmArea = 'Farm area must be 0 or more.';
    if (!form.email.trim()) next.email = 'Email is required for the member account.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!form.membershipAcceptanceDate) next.membershipAcceptanceDate = 'Acceptance date is required.';
    if (form.membershipFee !== '' && !(Number(form.membershipFee) >= 0)) next.membershipFee = 'Enter zero or more.';
    if (isAdd) {
      if (!form.birthday) next.birthday = 'Birthday is required.';
      if (!form.civilStatus) next.civilStatus = 'Required.';
      if (!form.gender) next.gender = 'Required.';
      if (!form.highestEducation) next.highestEducation = 'Required.';
      if (!form.idType) next.idType = 'Select an ID type.';
      if (!form.idNumber.trim()) next.idNumber = 'ID number is required.';
      if (!form.barangay.trim()) next.barangay = 'Required.';
      if (!form.municipality.trim()) next.municipality = 'Required.';
      if (!form.province.trim()) next.province = 'Required.';
      if (form.shareCapital !== '' && !(Number(form.shareCapital) >= 0)) next.shareCapital = 'Share capital must be zero or more.';
      if (form.membershipFee === '') next.membershipFee = 'Membership fee is required.';
      if (!photoFile) next.idPhoto = 'A 2×2 ID photo is required.';
    } else if (![form.permanentAddress, form.barangay, form.municipality, form.province].some((part) => part.trim())) {
      next.barangay = 'Enter the address.';
    }
    // Add needs the signed ID copy; Edit checks one only when it is replaced.
    if (isAdd || pickedId) {
      if (!pickedId?.readingId) next.idDocument = pickedId?.pending ? 'Wait until AI has read the ID.' : `Submit the applicant's valid ID: the front and back on one page with ${REQUIRED_ID_SIGNATURES} specimen signatures.`;
      else if (idChecksReading === pickedId.readingId) {
        // Only checks made for the ID now on the form; the server checks it again on save.
        if (idChecks.some((check) => check.status === 'fail')) next.idDocument = 'This ID did not pass the check above. Submit another.';
        else if (idWarnings.length && !acknowledgeId) next.idAck = 'Confirm that you compared the flagged ID details with the applicant.';
      }
    }
    return next;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly || !onSubmit) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      // Bring the first field that needs attention into view.
      window.requestAnimationFrame(() => rootRef.current?.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const addressParts = [form.permanentAddress, form.barangay, form.municipality, form.province].map((part) => part.trim());
    const addressUnchanged = !isAdd && addressParts.join('|') === [initial.permanentAddress, initial.barangay, initial.municipality, initial.province].map((part) => part.trim()).join('|');
    // Edit keeps an older free-form address as it was unless its parts were changed.
    const address = addressUnchanged && initial.address ? initial.address : addressParts.filter(Boolean).join(', ');
    const sources = form.incomeSources.filter((row) => row.source.trim());
    const certified = (orNumber: string, certifiedBy: string, previous: string) => orNumber.trim() || certifiedBy.trim() ? 'Yes' : (isAdd ? 'No' : previous);
    const payload: MemberDraftData = {
      ...form,
      // A single member has no spouse: anything typed before Single was chosen is dropped.
      ...(isSingle ? { spouseName: '', spouseAge: '', spouseContact: '' } : {}),
      fullName: [form.firstName, form.middleName, form.lastName].map((part) => part.trim()).filter(Boolean).join(' '),
      phone: form.cpNo.trim(),
      address,
      permanentAddress: address,
      shareCapital: form.shareCapital || '0',
      livelihood: sources.map((row) => row.source.trim()).join(', '),
      annualIncome: totalAnnualIncome ? String(totalAnnualIncome) : '',
      preMembershipSeminar: certified(form.seminarOrNumber, form.seminarCertifiedBy, form.preMembershipSeminar),
      paymentOfMembershipFee: certified(form.orNumber, form.feeCertifiedBy, form.paymentOfMembershipFee),
    };
    const idDocument = pickedId?.readingId ? { file: pickedId.file, readingId: pickedId.readingId, acknowledgeIdWarnings: acknowledgeId } : null;
    await onSubmit(payload, { photo: photoFile, idDocument });
  };

  // Field helpers: an input while editing, the saved value as text in View.
  const view = (value: string) => <p className={VIEW_TEXT}>{value || '—'}</p>;
  const errorProps = (field: string) => ({ 'data-error': errors[field] ? 'true' : undefined });

  const input = (field: keyof MemberDraftData, props: { type?: string; placeholder?: string; min?: string; step?: string; max?: string; readOnly?: boolean; title?: string } = {}) => {
    const value = form[field] as string;
    if (readOnly) return view(props.type === 'date' ? formatDate(value) : props.step === '0.01' ? peso(value) : value);
    return (
      <input
        value={value}
        onChange={(event) => updateField(field, event.target.value)}
        className={`${INPUT} ${errors[field] ? INPUT_ERROR : ''} ${props.readOnly ? 'bg-slate-50 text-slate-600' : ''}`}
        {...errorProps(field)}
        {...props}
      />
    );
  };

  const select = (field: keyof MemberDraftData, options: string[], placeholder = 'Select') => {
    const value = form[field] as string;
    if (readOnly) return view(value);
    // Keeps an older saved value selectable even when it is not in today's list.
    const list = value && !options.includes(value) ? [value, ...options] : options;
    return (
      <select value={value} onChange={(event) => updateField(field, event.target.value)} className={`${INPUT} ${errors[field] ? INPUT_ERROR : ''}`} {...errorProps(field)}>
        <option value="">{placeholder}</option>
        {list.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  };

  const shownChildren = readOnly ? form.children.filter((child) => child.name || child.age) : form.children;
  const shownIncome = readOnly ? form.incomeSources.filter((row) => row.source || row.amount) : form.incomeSources;
  const photoShown = photoPreview || saved.photoUrl;
  const savedIdRow = saved.idDocumentName ? (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
      <span className="flex min-w-0 items-center gap-2"><Check className="h-4 w-4 shrink-0" /><span className="truncate">{saved.idDocumentName}</span></span>
      {saved.onOpenIdDocument && <button type="button" onClick={saved.onOpenIdDocument} className="shrink-0 text-xs font-semibold text-blue-600 hover:underline">View ID</button>}
    </div>
  ) : <p className="mt-2 text-sm text-slate-400">No valid ID on file</p>;
  const TABLE_INPUT = `${INPUT} mt-0 border-transparent`;

  return (
    <ReadOnlyContext.Provider value={readOnly}>
      <form id={formId} ref={rootRef} onSubmit={(event) => void handleSubmit(event)} noValidate className="mx-auto max-w-4xl rounded-lg border border-slate-300 bg-white px-3 py-5 shadow-sm sm:px-8">
        {/* Letterhead with the 2x2 photo box, as on the printed form */}
        <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:items-start">
          <div className="flex-1 text-center">
            <img src="/logo.png" alt="" className="mx-auto mb-2 h-12 w-12 rounded-full object-cover" />
            <p className="text-sm font-bold uppercase leading-tight text-slate-900">Amnay Cabagan Irrigators and Farmers Agriculture Cooperative</p>
            <p className="text-sm font-bold text-slate-900">(ACIFAC)</p>
            <p className="text-xs font-semibold uppercase text-slate-700">Brgy. Barahan, Sta. Cruz, Occidental Mindoro</p>
            <p className="text-xs text-slate-600">CDA Reg No.: 9520-1040000000041322 · Date Reg: January 3, 2018</p>
          </div>
          <div className="w-36 shrink-0" {...errorProps('idPhoto')}>
            {readOnly ? (
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border-2 border-slate-400 bg-slate-50">
                {photoShown ? <img src={photoShown} alt="2x2 ID" className="h-full w-full object-cover object-center" /> : <span className="px-2 text-center text-xs font-bold text-slate-400">2 × 2 ID PHOTO<br /><span className="font-normal">None on file</span></span>}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border-2 ${errors.idPhoto ? 'border-red-400' : 'border-slate-400'} bg-slate-50 hover:bg-slate-100`}
                  aria-label={photoShown ? 'Replace 2x2 ID photo' : 'Upload 2x2 ID photo'}
                >
                  {photoShown ? (
                    <img src={photoShown} alt="2x2 ID preview" className="h-full w-full object-cover object-center" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 px-2 text-slate-500">
                      <Camera className="h-7 w-7" />
                      <span className="text-xs font-bold">2 × 2 ID PHOTO</span>
                      <span className="text-[10px]">Click to upload</span>
                    </span>
                  )}
                </button>
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                {photoShown ? (
                  <div className="mt-1 flex justify-between text-xs">
                    <button type="button" onClick={() => photoInputRef.current?.click()} className="font-medium text-emerald-700 hover:underline">Replace</button>
                    {photoPreview && <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="font-medium text-red-600 hover:underline">{saved.photoUrl ? 'Undo' : 'Remove'}</button>}
                  </div>
                ) : (
                  <p className="mt-1 text-center text-[10px] text-slate-500">White background · max 2 MB</p>
                )}
                {errors.idPhoto && <span className="mt-1 block text-center text-xs text-red-600">{errors.idPhoto}</span>}
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <label htmlFor={`${formId || 'member'}-number`} className="text-xs font-semibold italic text-slate-700">Membership No. (<span className="underline">Member</span>)</label>
          {isAdd ? (
            <input id={`${formId || 'member'}-number`} value={form.memberNumber} onChange={(event) => updateField('memberNumber', event.target.value)} className={`${INPUT} mt-0 sm:max-w-xs ${errors.memberNumber ? INPUT_ERROR : ''}`} placeholder="Leave blank to auto-generate" {...errorProps('memberNumber')} />
          ) : (
            <span id={`${formId || 'member'}-number`} className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-900">{form.memberNumber || '—'}</span>
          )}
          {errors.memberNumber && <span className="text-xs text-red-600">{errors.memberNumber}</span>}
        </div>

        {/* Personal details */}
        <FormTable cols="grid-cols-1 sm:grid-cols-3" className="mt-4">
          <Cell label="Last Name" required error={errors.lastName}>{input('lastName')}</Cell>
          <Cell label="First Name" required error={errors.firstName}>{input('firstName')}</Cell>
          <Cell label="Middle Name">{input('middleName')}</Cell>
        </FormTable>
        <FormTable cols="grid-cols-2 sm:grid-cols-[1.3fr_0.5fr_1fr_1fr_1.3fr]" className="mt-2">
          <Cell label="Birthday" required={isAdd} error={errors.birthday} className="col-span-2 sm:col-span-1">
            {readOnly ? view(formatDate(form.birthday)) : (
              <input type="date" max={today()} value={form.birthday} onChange={(event) => handleBirthdayChange(event.target.value)} className={`${INPUT} ${errors.birthday ? INPUT_ERROR : ''}`} {...errorProps('birthday')} />
            )}
          </Cell>
          <Cell label="Age">{readOnly ? view(form.age) : <input readOnly value={form.age} className={`${INPUT} bg-slate-50`} placeholder="Auto" />}</Cell>
          <Cell label="Civil Status" required={isAdd} error={errors.civilStatus}>{select('civilStatus', civilStatusOptions)}</Cell>
          <Cell label="Gender" required={isAdd} error={errors.gender}>{select('gender', genderOptions)}</Cell>
          <Cell label="CP #" required error={errors.cpNo}>{input('cpNo', { placeholder: '09XX XXX XXXX' })}</Cell>
        </FormTable>
        <FormTable cols="grid-cols-1 sm:grid-cols-3" className="mt-4">
          <Cell label="Highest Educational Attainment" required={isAdd} error={errors.highestEducation}>{select('highestEducation', educationOptions)}</Cell>
          <Cell label="ID Type" required={isAdd} error={errors.idType || errors.idTypeOther}>
            {readOnly ? view(form.idType === 'Other' ? form.idTypeOther || 'Other' : form.idType) : (
              <>
                {select('idType', idTypeOptions, 'Select ID type')}
                {form.idType === 'Other' && input('idTypeOther', { placeholder: 'Specify the ID type' })}
              </>
            )}
          </Cell>
          <Cell label="ID No." required={isAdd} error={errors.idNumber}>{input('idNumber')}</Cell>
        </FormTable>
        <FormTable cols="grid-cols-1 sm:grid-cols-2" className="mt-4">
          <Cell label="RSBSA No.">{input('rsbsaNumber')}</Cell>
          <Cell label="Farm Area (hectares)" error={errors.farmArea}>{readOnly ? view(form.farmArea ? `${form.farmArea} ha` : '') : input('farmArea', { type: 'number', min: '0', step: '0.01', placeholder: '0.00' })}</Cell>
        </FormTable>
        <FormTable cols="grid-cols-1 sm:grid-cols-4" className="mt-2">
          <Cell label="Permanent Address">{input('permanentAddress', { placeholder: 'House no. / Sitio / Purok' })}</Cell>
          <Cell label="Barangay" required={isAdd} error={errors.barangay}>{input('barangay')}</Cell>
          <Cell label="Municipality" required={isAdd} error={errors.municipality}>{input('municipality')}</Cell>
          <Cell label="Province" required={isAdd} error={errors.province}>{input('province')}</Cell>
        </FormTable>

        {/* Not on the printed form, but needed for the member's account */}
        <FormTable cols="grid-cols-1 sm:grid-cols-2" className="mt-2">
          <Cell label="Email (member account login)" required error={errors.email}>{input('email', { type: 'email', placeholder: 'member@email.com' })}</Cell>
          <Cell label={isAdd ? 'Initial Share Capital' : 'Share Capital'} error={errors.shareCapital}>
            {isAdd ? input('shareCapital', { type: 'number', min: '0', step: '0.01', placeholder: '0.00' }) : readOnly ? view(peso(form.shareCapital) || '₱0.00') : (
              <input readOnly value={peso(form.shareCapital) || '₱0.00'} className={`${INPUT} bg-slate-50 text-slate-600`} title="Share capital changes through Add Contribution" />
            )}
          </Cell>
        </FormTable>

        <SectionTitle>Family Members</SectionTitle>
        {/* No spouse for a single member */}
        {!isSingle && (
          <FormTable cols="grid-cols-1 sm:grid-cols-[1.4fr_0.6fr_1.2fr]" className="mb-2">
            <Cell label="Spouse Name">{input('spouseName')}</Cell>
            <Cell label="Age">{input('spouseAge', { type: 'number', min: '0' })}</Cell>
            <Cell label="Contact No.">{input('spouseContact')}</Cell>
          </FormTable>
        )}
        <FormTable cols="grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr]">
          <div className="flex items-center bg-slate-100 p-2 text-[11px] font-bold uppercase tracking-wide text-slate-700">Mother&apos;s Maiden Name</div>
          <Cell label="Last Name">{input('motherLastName')}</Cell>
          <Cell label="First Name">{input('motherFirstName')}</Cell>
          <Cell label="Middle Name">{input('motherMiddleName')}</Cell>
        </FormTable>

        <FormTable cols={readOnly ? 'grid-cols-[1fr_5rem] sm:grid-cols-[1fr_7rem]' : 'grid-cols-[1fr_5rem_2.5rem] sm:grid-cols-[1fr_7rem_2.5rem]'} className="mt-4">
          <HeaderCell>Children&apos;s Name</HeaderCell>
          <HeaderCell>Age</HeaderCell>
          {!readOnly && <HeaderCell><span className="sr-only">Remove</span></HeaderCell>}
          {shownChildren.map((child, index) => readOnly ? (
            <div key={child.id} className="contents">
              <div className="bg-white px-2 py-1.5 text-sm text-slate-900">{child.name || '—'}</div>
              <div className="bg-white px-2 py-1.5 text-sm text-slate-900">{child.age || '—'}</div>
            </div>
          ) : (
            <div key={child.id} className="contents">
              <div className="bg-white p-1"><input value={child.name} onChange={(event) => updateChild(child.id, 'name', event.target.value)} className={TABLE_INPUT} placeholder={`Child ${index + 1}`} aria-label={`Child ${index + 1} name`} /></div>
              <div className="bg-white p-1"><input type="number" min="0" value={child.age} onChange={(event) => updateChild(child.id, 'age', event.target.value)} className={TABLE_INPUT} aria-label={`Child ${index + 1} age`} /></div>
              <div className="flex items-center justify-center bg-white"><button type="button" onClick={() => removeChild(child.id)} aria-label={`Remove child ${index + 1}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
            </div>
          ))}
          {readOnly && !shownChildren.length && <div className="col-span-2 bg-white px-2 py-1.5 text-sm text-slate-400">None listed</div>}
        </FormTable>
        {!readOnly && <button type="button" onClick={addChild} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add child</button>}

        <FormTable cols={readOnly ? 'grid-cols-[1fr_1fr]' : 'grid-cols-[1fr_1fr_2.5rem]'} className="mt-4">
          <HeaderCell>Source of Income</HeaderCell>
          <HeaderCell>Annually Income</HeaderCell>
          {!readOnly && <HeaderCell><span className="sr-only">Remove</span></HeaderCell>}
          {shownIncome.map((row, index) => readOnly ? (
            <div key={row.id} className="contents">
              <div className="bg-white px-2 py-1.5 text-sm text-slate-900">{row.source || '—'}</div>
              <div className="bg-white px-2 py-1.5 text-sm text-slate-900">{peso(row.amount) || '—'}</div>
            </div>
          ) : (
            <div key={row.id} className="contents">
              <div className="bg-white p-1"><input value={row.source} onChange={(event) => updateIncome(row.id, 'source', event.target.value)} className={TABLE_INPUT} placeholder="e.g. Farming" aria-label={`Income source ${index + 1}`} /></div>
              <div className="bg-white p-1"><input type="number" min="0" step="0.01" value={row.amount} onChange={(event) => updateIncome(row.id, 'amount', event.target.value)} className={TABLE_INPUT} placeholder="0.00" aria-label={`Annual income ${index + 1}`} /></div>
              <div className="flex items-center justify-center bg-white"><button type="button" onClick={() => removeIncomeSource(row.id)} aria-label={`Remove income source ${index + 1}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
            </div>
          ))}
          {readOnly && !shownIncome.length && <div className="col-span-2 bg-white px-2 py-1.5 text-sm text-slate-400">None listed</div>}
        </FormTable>
        <div className="mt-1 flex items-center justify-between text-xs">
          {!readOnly ? <button type="button" onClick={addIncomeSource} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add income source</button> : <span />}
          <span className="font-semibold text-slate-700">Total: ₱{totalAnnualIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
        </div>

        <SectionTitle>Membership Acceptance / Separation</SectionTitle>
        <div className="overflow-x-auto">
          <FormTable cols="min-w-[36rem] grid-cols-[8rem_1fr_1fr_1fr]">
            <HeaderCell />
            <HeaderCell>Date</HeaderCell>
            <HeaderCell>B.O.D. Resolution</HeaderCell>
            <HeaderCell>Type of Membership</HeaderCell>
            <div className="flex items-center bg-white p-2 text-xs font-bold uppercase text-slate-700">Acceptance{!readOnly && <span className="text-red-500">&nbsp;*</span>}</div>
            <div className="bg-white p-1">
              {readOnly ? view(formatDate(form.membershipAcceptanceDate)) : (
                <input type="date" max={today()} value={form.membershipAcceptanceDate} onChange={(event) => updateField('membershipAcceptanceDate', event.target.value)} className={`${INPUT} mt-0 ${errors.membershipAcceptanceDate ? INPUT_ERROR : ''}`} aria-label="Acceptance date" {...errorProps('membershipAcceptanceDate')} />
              )}
              {errors.membershipAcceptanceDate && <span className="mt-1 block text-xs text-red-600">{errors.membershipAcceptanceDate}</span>}
            </div>
            <div className="bg-white p-1">{readOnly ? view(form.bodResolution) : <input value={form.bodResolution} onChange={(event) => updateField('bodResolution', event.target.value)} className={`${INPUT} mt-0`} placeholder="Resolution no." aria-label="B.O.D. resolution" />}</div>
            <div className="bg-white p-1">
              {readOnly ? view(form.membershipType) : (
                <select value={form.membershipType} onChange={(event) => updateField('membershipType', event.target.value)} className={`${INPUT} mt-0`} aria-label="Type of membership">
                  {(form.membershipType && !membershipTypeOptions.includes(form.membershipType) ? [form.membershipType, ...membershipTypeOptions] : membershipTypeOptions).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              )}
            </div>
            <div className="flex items-center bg-white p-2 text-xs font-bold uppercase text-slate-700">Separation</div>
            <div className="bg-white p-1">{readOnly ? view(formatDate(form.separationDate)) : <input type="date" value={form.separationDate} onChange={(event) => updateField('separationDate', event.target.value)} className={`${INPUT} mt-0`} aria-label="Separation date" />}</div>
            <div className="bg-slate-50" />
            <div className="bg-slate-50" />
          </FormTable>
        </div>

        <SectionTitle>Valid ID with Specimen Signatures</SectionTitle>
        {readOnly ? (
          <div className="rounded-md border border-slate-400 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Valid ID</p>
            {savedIdRow}
            {saved.signatureUrls.some(Boolean) && (
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                {saved.signatureUrls.map((url, index) => url && <SignaturePad key={index} label={`Signature ${index + 1}`} file={null} onChange={() => undefined} savedUrl={url} readOnly />)}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3" {...errorProps('idDocument')}>
            {isAdd || pickedId ? (
              <IdDocumentPanel
                requirement={APPLICANT_ID}
                id={pickedId?.readingId && pickedId.reading ? { fileName: pickedId.file.name, mimeType: pickedId.file.type, size: pickedId.file.size, source: pickedId.source, reading: pickedId.reading } : null}
                formName="membership form"
                requiredSignatures={REQUIRED_ID_SIGNATURES}
                checks={idReadingId && idChecksReading === idReadingId ? idChecks : []}
                error={pickedId?.error || errors.idDocument}
                editable
                submitting={Boolean(pickedId?.pending)}
                disabled={Boolean(pickedId?.pending)}
                onUpload={(file) => void pickId(file, 'upload')}
                onCapture={() => setIdCamera(true)}
                onView={viewPickedId}
              />
            ) : (
              <div className="rounded-md border border-slate-400 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Valid ID</p>
                {savedIdRow}
                <p className="mt-2 text-xs text-slate-500">To replace it, submit a picture of the front and back of the ID on one page with the applicant&apos;s {REQUIRED_ID_SIGNATURES} specimen signatures. AI checks it before it is saved.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">
                    <ImagePlus className="h-4 w-4" /> Upload picture
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleIdFile} />
                  </label>
                  <button type="button" onClick={() => setIdCamera(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Camera className="h-4 w-4" /> Take a picture</button>
                </div>
              </div>
            )}
            {!isAdd && pickedId && <button type="button" onClick={clearPickedId} className="text-xs font-semibold text-red-600 hover:underline">Keep the ID on file instead</button>}
            {idWarnings.length > 0 && (
              <label className={`flex items-start gap-2 rounded-md border p-3 text-sm ${errors.idAck ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`} {...errorProps('idAck')}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" checked={acknowledgeId} onChange={(event) => { setAcknowledgeId(event.target.checked); clearError('idAck'); }} />
                <span>I compared the flagged ID details with the applicant, and the ID is theirs. <span className="text-red-500">*</span></span>
              </label>
            )}
            {errors.idAck && <p className="text-xs text-red-600">{errors.idAck}</p>}
          </div>
        )}

        <SectionTitle>For Cooperative</SectionTitle>
        <div className="overflow-x-auto">
          <FormTable cols="min-w-[40rem] grid-cols-[1.4fr_1fr_1fr]">
            <div className="flex items-center bg-white p-2 text-xs font-semibold uppercase text-slate-700">Certification of Member</div>
            <Cell label="Membership Fee" required={isAdd} error={errors.membershipFee}>{input('membershipFee', { type: 'number', min: '0', step: '0.01', placeholder: '0.00' })}</Cell>
            <Cell label="Date Received">{input('dateReceived', { type: 'date', max: today() })}</Cell>

            <div className="flex items-center bg-white p-2 text-xs font-semibold uppercase text-slate-700">Certification of Pre-Membership Education Seminar</div>
            <Cell label="Paid with OR No.">{input('seminarOrNumber')}</Cell>
            <Cell label="Certified By">{input('seminarCertifiedBy')}</Cell>

            <div className="flex items-center bg-white p-2 text-xs font-semibold uppercase text-slate-700">Certification of Payment of Membership Fee</div>
            <Cell label="Paid with O.R. No.">{input('orNumber')}</Cell>
            <Cell label="Certified By">{input('feeCertifiedBy')}</Cell>

            <div className="bg-white p-2">
              <span className="block text-xs font-semibold uppercase text-slate-700">Certification of Payment of Initial Paid-Up Capital</span>
              {readOnly ? view(peso(form.initialPaidUpCapital)) : <input type="number" min="0" step="0.01" value={form.initialPaidUpCapital} onChange={(event) => updateField('initialPaidUpCapital', event.target.value)} className={INPUT} placeholder="Amount (0.00)" aria-label="Initial paid-up capital" />}
            </div>
            <Cell label="Paid with O.R. No.">{input('capitalOrNumber')}</Cell>
            <Cell label="Certified By">{input('capitalCertifiedBy')}</Cell>
          </FormTable>
        </div>
      </form>
      {idCamera && (
        <DocumentScannerModal
          variant="idCopy"
          person="applicant"
          requiredSignatures={REQUIRED_ID_SIGNATURES}
          onClose={() => setIdCamera(false)}
          onScanned={(file) => { setIdCamera(false); void pickId(file, 'camera'); }}
        />
      )}
    </ReadOnlyContext.Provider>
  );
}

/** Loads a member's 2x2 photo and signatures for Edit and View; revokes them on change. */
export function useSavedMemberFiles(member: Member | null, loadFile: (path: string) => Promise<string | null>) {
  const [files, setFiles] = useState<{ photoUrl: string | null; signatureUrls: Array<string | null> }>({ photoUrl: null, signatureUrls: [] });
  const memberId = member?.id;
  const signatureCount = member?.signatureCount || 0;
  useEffect(() => {
    if (!memberId) return undefined;
    let cancelled = false;
    const urls: string[] = [];
    const load = (path: string) => loadFile(path).then((url) => {
      if (url && cancelled) URL.revokeObjectURL(url);
      else if (url) urls.push(url);
      return url;
    }).catch(() => null);
    void Promise.all([
      load(`/api/members/${memberId}/documents/photo`),
      ...Array.from({ length: Math.min(signatureCount, SIGNATURE_COUNT) }, (_, index) => load(`/api/members/${memberId}/documents/signature-${index + 1}`)),
    ]).then(([photoUrl, ...signatureUrls]) => {
      if (cancelled) return;
      setFiles({ photoUrl, signatureUrls });
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      setFiles({ photoUrl: null, signatureUrls: [] });
    };
  }, [memberId, signatureCount, loadFile]);
  return files;
}

/** The window around the member form, used by Add Member and Edit Member. */
export function MemberFormModal({
  mode,
  title,
  initial,
  saved,
  onClose,
  onSubmit,
  isSubmitting,
  onImport,
}: {
  mode: 'add' | 'edit';
  title: string;
  initial: MemberDraftData;
  saved?: SavedMemberFiles;
  onClose: () => void;
  onSubmit: (payload: MemberDraftData, files: MemberFormFiles) => Promise<void> | void;
  isSubmitting: boolean;
  /** Opens the Excel bulk import; the button is hidden when omitted. */
  onImport?: () => void;
}) {
  const [errorCount, setErrorCount] = useState(0);
  const formId = `${mode}MemberForm`;
  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-6">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Membership</p>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {onImport && (
              <button type="button" onClick={onImport} title="Import members from an Excel file" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-green-600 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">
                <Plus className="h-4 w-4" />
                <FileSpreadsheet className="h-4 w-4" />
                <span>Import</span>
              </button>
            )}
            <button type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()} window`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100 px-2 py-4 sm:px-6">
          <MemberForm mode={mode} initial={initial} saved={saved} formId={formId} onSubmit={onSubmit} onErrorCountChange={setErrorCount} />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {errorCount > 0 && <span className="text-sm text-red-600">{errorCount === 1 ? '1 field needs' : `${errorCount} fields need`} attention.</span>}
            <button type="submit" form={formId} disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400">
              {isSubmitting ? 'Saving...' : mode === 'add' ? 'Save Member' : 'Update Member'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AddMemberModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  /** Opens the Excel bulk import; the button is hidden when omitted. */
  onImport?: () => void;
  onSubmit: (payload: MemberDraftData, files: MemberFormFiles) => Promise<void> | void;
  isSubmitting: boolean;
}) {
  // A fresh blank form each time the window opens.
  const initial = useMemo(() => emptyMemberDraft(), []);
  if (!open) return null;
  return (
    <MemberFormModal
      mode="add"
      title="Add Member"
      initial={initial}
      onClose={onClose}
      onImport={onImport}
      isSubmitting={isSubmitting}
      onSubmit={onSubmit}
    />
  );
}
