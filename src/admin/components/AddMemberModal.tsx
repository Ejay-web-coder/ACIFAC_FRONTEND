import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { dateOnlyToday } from '../../utils/dateTime';
import { Camera, Check, FileSpreadsheet, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { SignaturePad } from './SignaturePad';

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

export const SIGNATURE_COUNT = 3;

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

function Cell({ label, required, error, children, className = '' }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 bg-white p-2 ${className}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {label}{required && <span className="text-red-500"> *</span>}
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
  onSubmit: (payload: MemberDraftData, photoFile: File | null, idDocumentFile: File | null, signatureFiles: File[]) => Promise<void> | void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<MemberDraftData>(initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [idDocumentFile, setIdDocumentFile] = useState<File | null>(null);
  const [signatures, setSignatures] = useState<Array<File | null>>(() => Array(SIGNATURE_COUNT).fill(null));
  const photoInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setForm(initialState);
      setErrors({});
      setPhotoFile(null);
      setPhotoPreview(null);
      setIdDocumentFile(null);
      setSignatures(Array(SIGNATURE_COUNT).fill(null));
    }
  }, [open]);

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

  const setSignature = (index: number, file: File | null) => {
    setSignatures((current) => current.map((item, position) => position === index ? file : item));
    clearError(`signature${index}`);
  };

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

  const handleIdDocumentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputFile = event.target.files?.[0] ?? null;
    event.target.value = '';
    try {
      const nextFile = sanitizeIdDocument(inputFile);
      if (!nextFile) return;
      setIdDocumentFile(nextFile);
      clearError('idDocument');
    } catch (error) {
      setIdDocumentFile(null);
      setErrors((current) => ({ ...current, idDocument: error instanceof Error ? error.message : 'Invalid ID document file.' }));
    }
  };

  useEffect(() => () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (form.memberNumber.trim() && !/^ACIFAC-[A-Z0-9-]+$/i.test(form.memberNumber.trim())) next.memberNumber = 'Use the ACIFAC membership number format.';
    if (!form.lastName.trim()) next.lastName = 'Last name is required.';
    if (!form.firstName.trim()) next.firstName = 'First name is required.';
    if (!form.birthday) next.birthday = 'Birthday is required.';
    else if (new Date(`${form.birthday}T00:00:00`) > new Date()) next.birthday = 'Birthday cannot be in the future.';
    if (!form.civilStatus) next.civilStatus = 'Required.';
    if (!form.gender) next.gender = 'Required.';
    if (!form.cpNo.trim()) next.cpNo = 'CP number is required.';
    else if (!/^[+0-9()\s.-]{7,30}$/.test(form.cpNo.trim())) next.cpNo = 'Enter a valid number.';
    if (!form.highestEducation) next.highestEducation = 'Required.';
    if (!form.idType) next.idType = 'Select an ID type.';
    if (form.idType === 'Other' && !form.idTypeOther.trim()) next.idTypeOther = 'Specify the ID type.';
    if (!form.idNumber.trim()) next.idNumber = 'ID number is required.';
    if (form.farmArea !== '' && !(Number(form.farmArea) >= 0)) next.farmArea = 'Farm area must be 0 or more.';
    if (!form.barangay.trim()) next.barangay = 'Required.';
    if (!form.municipality.trim()) next.municipality = 'Required.';
    if (!form.province.trim()) next.province = 'Required.';
    if (!form.email.trim()) next.email = 'Email is required for the member account.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.shareCapital !== '' && !(Number(form.shareCapital) >= 0)) next.shareCapital = 'Share capital must be zero or more.';
    if (!form.membershipAcceptanceDate) next.membershipAcceptanceDate = 'Acceptance date is required.';
    if (form.membershipFee === '') next.membershipFee = 'Membership fee is required.';
    else if (!(Number(form.membershipFee) >= 0)) next.membershipFee = 'Enter zero or more.';
    if (!photoFile) next.idPhoto = 'A 2×2 ID photo is required.';
    if (!idDocumentFile) next.idDocument = 'Upload the valid ID.';
    signatures.forEach((signature, index) => { if (!signature) next[`signature${index}`] = 'This signature is required.'; });
    return next;
  };

  const handleSubmit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      // Bring the first field that needs attention into view.
      window.requestAnimationFrame(() => bodyRef.current?.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const permanentAddress = [form.permanentAddress, form.barangay, form.municipality, form.province].map((part) => part.trim()).filter(Boolean).join(', ');
    const sources = form.incomeSources.filter((row) => row.source.trim());
    const payload: MemberDraftData = {
      ...form,
      fullName: [form.firstName, form.middleName, form.lastName].map((part) => part.trim()).filter(Boolean).join(' '),
      phone: form.cpNo.trim(),
      address: permanentAddress,
      permanentAddress,
      shareCapital: form.shareCapital || '0',
      livelihood: sources.map((row) => row.source.trim()).join(', '),
      annualIncome: totalAnnualIncome ? String(totalAnnualIncome) : '',
      preMembershipSeminar: form.seminarOrNumber.trim() || form.seminarCertifiedBy.trim() ? 'Yes' : 'No',
      paymentOfMembershipFee: form.orNumber.trim() || form.feeCertifiedBy.trim() ? 'Yes' : 'No',
    };
    await onSubmit(payload, photoFile, idDocumentFile, signatures.filter((file): file is File => Boolean(file)));
  };

  const input = (field: keyof MemberDraftData, props: { type?: string; placeholder?: string; min?: string; step?: string; max?: string } = {}) => (
    <input
      value={form[field] as string}
      onChange={(event) => updateField(field, event.target.value)}
      className={`${INPUT} ${errors[field] ? INPUT_ERROR : ''}`}
      data-error={errors[field] ? 'true' : undefined}
      {...props}
    />
  );

  const select = (field: keyof MemberDraftData, options: string[], placeholder = 'Select') => (
    <select
      value={form[field] as string}
      onChange={(event) => updateField(field, event.target.value)}
      className={`${INPUT} ${errors[field] ? INPUT_ERROR : ''}`}
      data-error={errors[field] ? 'true' : undefined}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );

  const errorCount = Object.keys(errors).length;

  if (!open) return null;

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-6">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Associate membership</p>
            <h2 className="text-lg font-bold text-slate-900">Add Member</h2>
          </div>
          <div className="flex items-center gap-2">
            {onImport && (
              <button type="button" onClick={onImport} title="Import members from an Excel file" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-green-600 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">
                <Plus className="h-4 w-4" />
                <FileSpreadsheet className="h-4 w-4" />
                <span>Import</span>
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close add member modal" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto bg-slate-100 px-2 py-4 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-lg border border-slate-300 bg-white px-3 py-5 shadow-sm sm:px-8">
            {/* Letterhead with the 2x2 photo box, as on the printed form */}
            <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:items-start">
              <div className="flex-1 text-center">
                <img src="/logo.png" alt="" className="mx-auto mb-2 h-12 w-12 rounded-full object-cover" />
                <p className="text-sm font-bold uppercase leading-tight text-slate-900">Amnay Cabagan Irrigators and Farmers Agriculture Cooperative</p>
                <p className="text-sm font-bold text-slate-900">(ACIFAC)</p>
                <p className="text-xs font-semibold uppercase text-slate-700">Brgy. Barahan, Sta. Cruz, Occidental Mindoro</p>
                <p className="text-xs text-slate-600">CDA Reg No.: 9520-1040000000041322 · Date Reg: January 3, 2018</p>
              </div>
              <div className="w-36 shrink-0" data-error={errors.idPhoto ? 'true' : undefined}>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border-2 ${errors.idPhoto ? 'border-red-400' : 'border-slate-400'} bg-slate-50 hover:bg-slate-100`}
                  aria-label={photoPreview ? 'Replace 2x2 ID photo' : 'Upload 2x2 ID photo'}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="2x2 ID preview" className="h-full w-full object-cover object-center" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 px-2 text-slate-500">
                      <Camera className="h-7 w-7" />
                      <span className="text-xs font-bold">2 × 2 ID PHOTO</span>
                      <span className="text-[10px]">Click to upload</span>
                    </span>
                  )}
                </button>
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                {photoPreview ? (
                  <div className="mt-1 flex justify-between text-xs">
                    <button type="button" onClick={() => photoInputRef.current?.click()} className="font-medium text-emerald-700 hover:underline">Replace</button>
                    <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="font-medium text-red-600 hover:underline">Remove</button>
                  </div>
                ) : (
                  <p className="mt-1 text-center text-[10px] text-slate-500">White background · max 2 MB</p>
                )}
                {errors.idPhoto && <span className="mt-1 block text-center text-xs text-red-600">{errors.idPhoto}</span>}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <label htmlFor="associate-member-number" className="text-xs font-semibold italic text-slate-700">Membership No. (<span className="underline">Associate Member</span>)</label>
              <input id="associate-member-number" value={form.memberNumber} onChange={(event) => updateField('memberNumber', event.target.value)} className={`${INPUT} mt-0 sm:max-w-xs ${errors.memberNumber ? INPUT_ERROR : ''}`} placeholder="Leave blank to auto-generate" data-error={errors.memberNumber ? 'true' : undefined} />
              {errors.memberNumber && <span className="text-xs text-red-600">{errors.memberNumber}</span>}
            </div>

            {/* Personal details */}
            <FormTable cols="grid-cols-1 sm:grid-cols-3" className="mt-4">
              <Cell label="Last Name" required error={errors.lastName}>{input('lastName')}</Cell>
              <Cell label="First Name" required error={errors.firstName}>{input('firstName')}</Cell>
              <Cell label="Middle Name">{input('middleName')}</Cell>
            </FormTable>
            <FormTable cols="grid-cols-2 sm:grid-cols-[1.3fr_0.5fr_1fr_1fr_1.3fr]" className="mt-2">
              <Cell label="Birthday" required error={errors.birthday} className="col-span-2 sm:col-span-1">
                <input type="date" max={today()} value={form.birthday} onChange={(event) => handleBirthdayChange(event.target.value)} className={`${INPUT} ${errors.birthday ? INPUT_ERROR : ''}`} data-error={errors.birthday ? 'true' : undefined} />
              </Cell>
              <Cell label="Age"><input readOnly value={form.age} className={`${INPUT} bg-slate-50`} placeholder="Auto" /></Cell>
              <Cell label="Civil Status" required error={errors.civilStatus}>{select('civilStatus', civilStatusOptions)}</Cell>
              <Cell label="Gender" required error={errors.gender}>{select('gender', genderOptions)}</Cell>
              <Cell label="CP #" required error={errors.cpNo}>{input('cpNo', { placeholder: '09XX XXX XXXX' })}</Cell>
            </FormTable>
            <FormTable cols="grid-cols-1 sm:grid-cols-3" className="mt-4">
              <Cell label="Highest Educational Attainment" required error={errors.highestEducation}>{select('highestEducation', educationOptions)}</Cell>
              <Cell label="ID Type" required error={errors.idType || errors.idTypeOther}>
                {select('idType', idTypeOptions, 'Select ID type')}
                {form.idType === 'Other' && input('idTypeOther', { placeholder: 'Specify the ID type' })}
              </Cell>
              <Cell label="ID No." required error={errors.idNumber}>{input('idNumber')}</Cell>
            </FormTable>
            <FormTable cols="grid-cols-1 sm:grid-cols-2" className="mt-4">
              <Cell label="RSBSA No.">{input('rsbsaNumber')}</Cell>
              <Cell label="Farm Area (hectares)" error={errors.farmArea}>{input('farmArea', { type: 'number', min: '0', step: '0.01', placeholder: '0.00' })}</Cell>
            </FormTable>
            <FormTable cols="grid-cols-1 sm:grid-cols-4" className="mt-2">
              <Cell label="Permanent Address">{input('permanentAddress', { placeholder: 'House no. / Sitio / Purok' })}</Cell>
              <Cell label="Barangay" required error={errors.barangay}>{input('barangay')}</Cell>
              <Cell label="Municipality" required error={errors.municipality}>{input('municipality')}</Cell>
              <Cell label="Province" required error={errors.province}>{input('province')}</Cell>
            </FormTable>

            {/* Not on the printed form, but needed for the member's account */}
            <FormTable cols="grid-cols-1 sm:grid-cols-2" className="mt-2">
              <Cell label="Email (member account login)" required error={errors.email}>{input('email', { type: 'email', placeholder: 'member@email.com' })}</Cell>
              <Cell label="Initial Share Capital" error={errors.shareCapital}>{input('shareCapital', { type: 'number', min: '0', step: '0.01', placeholder: '0.00' })}</Cell>
            </FormTable>

            <SectionTitle>Family Members</SectionTitle>
            <FormTable cols="grid-cols-1 sm:grid-cols-[1.4fr_0.6fr_1.2fr]">
              <Cell label="Spouse Name">{input('spouseName')}</Cell>
              <Cell label="Age">{input('spouseAge', { type: 'number', min: '0' })}</Cell>
              <Cell label="Contact No.">{input('spouseContact')}</Cell>
            </FormTable>
            <FormTable cols="grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr]" className="mt-2">
              <div className="flex items-center bg-slate-100 p-2 text-[11px] font-bold uppercase tracking-wide text-slate-700">Mother&apos;s Maiden Name</div>
              <Cell label="Last Name">{input('motherLastName')}</Cell>
              <Cell label="First Name">{input('motherFirstName')}</Cell>
              <Cell label="Middle Name">{input('motherMiddleName')}</Cell>
            </FormTable>

            <FormTable cols="grid-cols-[1fr_5rem_2.5rem] sm:grid-cols-[1fr_7rem_2.5rem]" className="mt-4">
              <HeaderCell>Children&apos;s Name</HeaderCell>
              <HeaderCell>Age</HeaderCell>
              <HeaderCell><span className="sr-only">Remove</span></HeaderCell>
              {form.children.map((child, index) => (
                <div key={child.id} className="contents">
                  <div className="bg-white p-1"><input value={child.name} onChange={(event) => updateChild(child.id, 'name', event.target.value)} className={`${INPUT} mt-0 border-transparent`} placeholder={`Child ${index + 1}`} aria-label={`Child ${index + 1} name`} /></div>
                  <div className="bg-white p-1"><input type="number" min="0" value={child.age} onChange={(event) => updateChild(child.id, 'age', event.target.value)} className={`${INPUT} mt-0 border-transparent`} aria-label={`Child ${index + 1} age`} /></div>
                  <div className="flex items-center justify-center bg-white"><button type="button" onClick={() => removeChild(child.id)} aria-label={`Remove child ${index + 1}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
                </div>
              ))}
            </FormTable>
            <button type="button" onClick={addChild} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add child</button>

            <FormTable cols="grid-cols-[1fr_1fr_2.5rem]" className="mt-4">
              <HeaderCell>Source of Income</HeaderCell>
              <HeaderCell>Annually Income</HeaderCell>
              <HeaderCell><span className="sr-only">Remove</span></HeaderCell>
              {form.incomeSources.map((row, index) => (
                <div key={row.id} className="contents">
                  <div className="bg-white p-1"><input value={row.source} onChange={(event) => updateIncome(row.id, 'source', event.target.value)} className={`${INPUT} mt-0 border-transparent`} placeholder="e.g. Farming" aria-label={`Income source ${index + 1}`} /></div>
                  <div className="bg-white p-1"><input type="number" min="0" step="0.01" value={row.amount} onChange={(event) => updateIncome(row.id, 'amount', event.target.value)} className={`${INPUT} mt-0 border-transparent`} placeholder="0.00" aria-label={`Annual income ${index + 1}`} /></div>
                  <div className="flex items-center justify-center bg-white"><button type="button" onClick={() => removeIncomeSource(row.id)} aria-label={`Remove income source ${index + 1}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
                </div>
              ))}
            </FormTable>
            <div className="mt-1 flex items-center justify-between text-xs">
              <button type="button" onClick={addIncomeSource} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add income source</button>
              <span className="font-semibold text-slate-700">Total: ₱{totalAnnualIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
            </div>

            <SectionTitle>Membership Acceptance / Separation</SectionTitle>
            <div className="overflow-x-auto">
              <FormTable cols="min-w-[36rem] grid-cols-[8rem_1fr_1fr_1fr]">
                <HeaderCell />
                <HeaderCell>Date</HeaderCell>
                <HeaderCell>B.O.D. Resolution</HeaderCell>
                <HeaderCell>Type of Membership</HeaderCell>
                <div className="flex items-center bg-white p-2 text-xs font-bold uppercase text-slate-700">Acceptance <span className="text-red-500">&nbsp;*</span></div>
                <div className="bg-white p-1">
                  <input type="date" max={today()} value={form.membershipAcceptanceDate} onChange={(event) => updateField('membershipAcceptanceDate', event.target.value)} className={`${INPUT} mt-0 ${errors.membershipAcceptanceDate ? INPUT_ERROR : ''}`} aria-label="Acceptance date" data-error={errors.membershipAcceptanceDate ? 'true' : undefined} />
                  {errors.membershipAcceptanceDate && <span className="mt-1 block text-xs text-red-600">{errors.membershipAcceptanceDate}</span>}
                </div>
                <div className="bg-white p-1"><input value={form.bodResolution} onChange={(event) => updateField('bodResolution', event.target.value)} className={`${INPUT} mt-0`} placeholder="Resolution no." aria-label="B.O.D. resolution" /></div>
                <div className="bg-white p-1">
                  <select value={form.membershipType} onChange={(event) => updateField('membershipType', event.target.value)} className={`${INPUT} mt-0`} aria-label="Type of membership">
                    {membershipTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div className="flex items-center bg-white p-2 text-xs font-bold uppercase text-slate-700">Separation</div>
                <div className="bg-white p-1"><input type="date" value={form.separationDate} onChange={(event) => updateField('separationDate', event.target.value)} className={`${INPUT} mt-0`} aria-label="Separation date" /></div>
                <div className="bg-slate-50" />
                <div className="bg-slate-50" />
              </FormTable>
            </div>

            <SectionTitle>Valid ID and Specimen Signatures</SectionTitle>
            <div className={`rounded-md border ${errors.idDocument ? 'border-red-300' : 'border-slate-400'} p-3`} data-error={errors.idDocument ? 'true' : undefined}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Valid ID <span className="text-red-500">*</span></p>
                  <p className="text-xs text-slate-500">Picture or PDF of the ID named above; front and back in one file. Max 5 MB.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                  <ImagePlus className="h-4 w-4" />
                  {idDocumentFile ? 'Replace ID' : 'Upload Valid ID'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleIdDocumentChange} />
                </label>
              </div>
              {idDocumentFile && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">
                  <span className="flex min-w-0 items-center gap-2"><Check className="h-4 w-4 shrink-0" /><span className="truncate">{idDocumentFile.name}</span></span>
                  <button type="button" onClick={() => setIdDocumentFile(null)} className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                </div>
              )}
              {errors.idDocument && <span className="mt-1 block text-xs text-red-600">{errors.idDocument}</span>}
            </div>

            <div className="mt-3 grid gap-4 rounded-md border border-slate-400 p-3 sm:grid-cols-3">
              {signatures.map((signature, index) => (
                <div key={index} data-error={errors[`signature${index}`] ? 'true' : undefined}>
                  <SignaturePad label={`Signature ${index + 1}`} file={signature} onChange={(file) => setSignature(index, file)} error={errors[`signature${index}`]} />
                </div>
              ))}
              <p className="text-xs text-slate-500 sm:col-span-3">The applicant signs three times, the same way each time. Draw with a finger, stylus or mouse, or upload a picture of each signature.</p>
            </div>

            <SectionTitle>For Cooperative</SectionTitle>
            <div className="overflow-x-auto">
              <FormTable cols="min-w-[40rem] grid-cols-[1.4fr_1fr_1fr]">
                <div className="flex items-center bg-white p-2 text-xs font-semibold uppercase text-slate-700">Certification of Associate Member</div>
                <Cell label="Membership Fee" required error={errors.membershipFee}>{input('membershipFee', { type: 'number', min: '0', step: '0.01', placeholder: '0.00' })}</Cell>
                <Cell label="Date Received">{input('dateReceived', { type: 'date', max: today() })}</Cell>

                <div className="flex items-center bg-white p-2 text-xs font-semibold uppercase text-slate-700">Certification of Pre-Membership Education Seminar</div>
                <Cell label="Paid with OR No.">{input('seminarOrNumber')}</Cell>
                <Cell label="Certified By">{input('seminarCertifiedBy')}</Cell>

                <div className="flex items-center bg-white p-2 text-xs font-semibold uppercase text-slate-700">Certification of Payment of Membership Fee</div>
                <Cell label="Paid with O.R. No.">{input('orNumber')}</Cell>
                <Cell label="Certified By">{input('feeCertifiedBy')}</Cell>

                <div className="bg-white p-2">
                  <span className="block text-xs font-semibold uppercase text-slate-700">Certification of Payment of Initial Paid-Up Capital</span>
                  <input type="number" min="0" step="0.01" value={form.initialPaidUpCapital} onChange={(event) => updateField('initialPaidUpCapital', event.target.value)} className={INPUT} placeholder="Amount (0.00)" aria-label="Initial paid-up capital" />
                </div>
                <Cell label="Paid with O.R. No.">{input('capitalOrNumber')}</Cell>
                <Cell label="Certified By">{input('capitalCertifiedBy')}</Cell>
              </FormTable>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {errorCount > 0 && <span className="text-sm text-red-600">{errorCount === 1 ? '1 field needs' : `${errorCount} fields need`} attention.</span>}
            <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400">
              {isSubmitting ? 'Saving...' : 'Save Member'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
