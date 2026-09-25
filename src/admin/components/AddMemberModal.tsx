import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { dateOnlyToday } from '../../utils/dateTime';
import { Camera, Check, ChevronLeft, ChevronRight, FileSpreadsheet, ImagePlus, Plus, Trash2, X } from 'lucide-react';

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
  children: [{ id: 1, name: '', age: '' }],
  incomeSources: [{ id: 1, source: '', amount: '' }],
  membershipType: 'Regular',
  membershipAcceptanceDate: today(),
  separationDate: '',
  bodResolution: '',
  membershipFee: '',
  dateReceived: today(),
  preMembershipSeminar: 'Yes',
  paymentOfMembershipFee: 'Yes',
  orNumber: '',
  initialPaidUpCapital: '',
};

const sectionMeta = [
  { title: 'Member / Account Information', description: 'Core account and contact details' },
  { title: 'Personal Information', description: 'Name, birthday, status, and education' },
  { title: 'Contact and Identification', description: 'ID and address information' },
  { title: 'Farm and Location Information', description: 'Farm area, barangay, and livelihood' },
  { title: 'Family Information', description: 'Spouse, mother, and children' },
  { title: 'Income Information', description: 'Income sources and annual totals' },
  { title: 'Membership Information', description: 'Status, fees, and membership details' },
  { title: 'Required Documents / ID Photo', description: '2x2 photo and supporting document upload' },
  { title: 'Review and Submit', description: 'Confirm and save member record' },
] as const;

// Shared with the member view and edit windows so all three use the same choices.
export const idTypeOptions = ['National ID', 'Driver\'s License', 'Passport', 'UMID', 'Voter\'s ID', 'Other'];
export const genderOptions = ['Male', 'Female', 'Prefer not to say'];
export const civilStatusOptions = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];
export const educationOptions = ['Elementary', 'High School', 'Vocational', 'College', 'Graduate Studies'];
export const membershipTypeOptions = ['Regular', 'Associate', 'Lifetime'];

function clampStep(next: number) {
  return Math.min(Math.max(next, 0), sectionMeta.length - 1);
}

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
  onSubmit: (payload: MemberDraftData, photoFile: File | null, idDocumentFile: File | null) => Promise<void> | void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<MemberDraftData>(initialState);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [idDocumentFile, setIdDocumentFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(initialState);
      setErrors({});
      setStep(0);
      setPhotoFile(null);
      setPhotoPreview(null);
      setIdDocumentFile(null);
    }
  }, [open]);

  const totalAnnualIncome = useMemo(
    () => form.incomeSources.reduce((sum, row) => {
      const value = Number(row.amount || 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0),
    [form.incomeSources]
  );

  const updateField = (field: keyof MemberDraftData, value: string | MemberDraftChild[] | MemberDraftIncome[]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field as string]) return current;
      const next = { ...current };
      delete next[field as string];
      return next;
    });
  };

  const handleBirthdayChange = (value: string) => {
    updateField('birthday', value);
    updateField('age', calculateAgeFromBirthday(value));
  };

  const addChild = () => {
    setForm((current) => ({
      ...current,
      children: [...current.children, { id: Date.now(), name: '', age: '' }],
    }));
  };

  const removeChild = (id: number) => {
    setForm((current) => ({
      ...current,
      children: current.children.length > 1 ? current.children.filter((child) => child.id !== id) : current.children,
    }));
  };

  const addIncomeSource = () => {
    setForm((current) => ({
      ...current,
      incomeSources: [...current.incomeSources, { id: Date.now(), source: '', amount: '' }],
    }));
  };

  const removeIncomeSource = (id: number) => {
    setForm((current) => ({
      ...current,
      incomeSources: current.incomeSources.length > 1 ? current.incomeSources.filter((row) => row.id !== id) : current.incomeSources,
    }));
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputFile = event.target.files?.[0] ?? null;
    try {
      const nextFile = sanitizeFile(inputFile);
      setPhotoFile(nextFile);
      setErrors((current) => {
        const next = { ...current };
        delete next.idPhoto;
        return next;
      });
      if (nextFile) {
        const objectUrl = URL.createObjectURL(nextFile);
        setPhotoPreview((current) => {
          if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
          return objectUrl;
        });
      } else {
        setPhotoPreview(null);
      }
    } catch (error) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setErrors((current) => ({ ...current, idPhoto: error instanceof Error ? error.message : 'Invalid photo file.' }));
    }
  };

  const handleIdDocumentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputFile = event.target.files?.[0] ?? null;
    try {
      const nextFile = sanitizeIdDocument(inputFile);
      setIdDocumentFile(nextFile);
      setErrors((current) => {
        const next = { ...current };
        delete next.idDocument;
        return next;
      });
    } catch (error) {
      setIdDocumentFile(null);
      setErrors((current) => ({ ...current, idDocument: error instanceof Error ? error.message : 'Invalid ID document file.' }));
    }
  };

  useEffect(() => () => {
    if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const validateStep = (currentStep: number) => {
    const nextErrors: Record<string, string> = {};
    if (currentStep === 0) {
      if (!form.fullName.trim()) nextErrors.fullName = 'Full name is required.';
      if (!form.email.trim()) nextErrors.email = 'Email is required.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Enter a valid email address.';
      if (!form.phone.trim()) nextErrors.phone = 'Phone / CP number is required.';
      if (!form.address.trim()) nextErrors.address = 'Address is required.';
      if (!form.shareCapital || Number(form.shareCapital) < 0) nextErrors.shareCapital = 'Share capital must be zero or more.';
      if (form.memberNumber && form.memberNumber.trim() && !/^ACIFAC-[A-Z0-9-]+$/i.test(form.memberNumber.trim())) nextErrors.memberNumber = 'Use the valid ACIFAC membership format.';
    }
    if (currentStep === 1) {
      if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required.';
      if (!form.firstName.trim()) nextErrors.firstName = 'First name is required.';
      if (!form.birthday) nextErrors.birthday = 'Birthday is required.';
      if (form.birthday && new Date(`${form.birthday}T00:00:00`) > new Date()) nextErrors.birthday = 'Birthday cannot be in the future.';
      if (!form.gender) nextErrors.gender = 'Gender is required.';
      if (!form.civilStatus) nextErrors.civilStatus = 'Civil status is required.';
      if (!form.highestEducation) nextErrors.highestEducation = 'Educational attainment is required.';
    }
    if (currentStep === 2) {
      if (!form.idType && !form.idTypeOther) nextErrors.idType = 'Select an ID type.';
      if ((form.idType === 'Other' || form.idTypeOther) && !form.idTypeOther.trim()) nextErrors.idTypeOther = 'Specify the other ID type.';
      if (!form.idNumber.trim()) nextErrors.idNumber = 'ID number is required.';
      if (!form.permanentAddress.trim()) nextErrors.permanentAddress = 'Permanent address is required.';
    }
    if (currentStep === 3) {
      if (!form.barangay.trim()) nextErrors.barangay = 'Barangay is required.';
      if (!form.municipality.trim()) nextErrors.municipality = 'Municipality is required.';
      if (!form.province.trim()) nextErrors.province = 'Province is required.';
      if (form.farmArea !== '' && (Number(form.farmArea) < 0 || Number.isNaN(Number(form.farmArea)))) nextErrors.farmArea = 'Farm area must be 0 or greater.';
      if (form.annualIncome !== '' && (Number(form.annualIncome) < 0 || Number.isNaN(Number(form.annualIncome)))) nextErrors.annualIncome = 'Annual income cannot be negative.';
    }
    if (currentStep === 6) {
      if (!form.membershipType) nextErrors.membershipType = 'Membership type is required.';
      if (!form.membershipAcceptanceDate) nextErrors.membershipAcceptanceDate = 'Acceptance date is required.';
      if (!form.membershipFee && form.membershipFee !== '0') nextErrors.membershipFee = 'Membership fee is required.';
    }
    if (currentStep === 7) {
      if (!photoFile) nextErrors.idPhoto = 'A 2×2 ID photo is required.';
      if (!idDocumentFile) nextErrors.idDocument = 'Please upload an ID document.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) setStep((current) => clampStep(current + 1));
  };

  const prevStep = () => setStep((current) => clampStep(current - 1));

  const handleSubmit = async () => {
    const baseValid = validateStep(step);
    if (!baseValid) return;
    const finalErrors: Record<string, string> = {};
    if (!form.fullName.trim()) finalErrors.fullName = 'Full name required';
    if (!form.email.trim()) finalErrors.email = 'Email required';
    if (!form.phone.trim()) finalErrors.phone = 'Phone required';
    if (!photoFile) finalErrors.idPhoto = 'A 2×2 ID photo is required.';
    if (!idDocumentFile) finalErrors.idDocument = 'Please upload an ID document.';
    if (Object.keys(finalErrors).length) {
      setErrors(finalErrors);
      return;
    }
    await onSubmit(form, photoFile, idDocumentFile);
  };

  const renderFieldError = (field: string) => errors[field] ? <span className="mt-1 block text-xs text-red-600">{errors[field]}</span> : null;

  const isLastStep = step === sectionMeta.length - 1;

  if (!open) return null;

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Associate membership</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">Add Member</h2>
              <p className="text-sm text-slate-500">Step {step + 1} of {sectionMeta.length} — {sectionMeta[step].title}</p>
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

          <ol className="mt-4 grid grid-cols-9 gap-1" aria-label="Member form progress">
            {sectionMeta.map((section, index) => (
              <li key={section.title} className="min-w-0">
                <div className={`h-2 rounded-full ${index <= step ? 'bg-green-600' : 'bg-slate-200'}`} />
                <span className="mt-1 hidden text-[10px] text-slate-500 lg:block">{section.title.split('/')[0].trim()}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700">Associate / Membership No.</label>
                <input value={form.memberNumber} onChange={(event) => updateField('memberNumber', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="ACIFAC-2026-001" />
                {renderFieldError('memberNumber')}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700">Full Name <span className="text-red-500">*</span></label>
                <input value={form.fullName} onChange={(event) => updateField('fullName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Enter full legal name" />
                {renderFieldError('fullName')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Email <span className="text-red-500">*</span></label>
                <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="member@email.com" />
                {renderFieldError('email')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Phone / CP Number <span className="text-red-500">*</span></label>
                <input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="+63 912 345 6789" />
                {renderFieldError('phone')}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700">Address <span className="text-red-500">*</span></label>
                <textarea value={form.address} onChange={(event) => updateField('address', event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Complete current address" />
                {renderFieldError('address')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Share Capital</label>
                <input type="number" min="0" step="0.01" value={form.shareCapital} onChange={(event) => updateField('shareCapital', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="0.00" />
                {renderFieldError('shareCapital')}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700">Last Name <span className="text-red-500">*</span></label>
                <input value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Last name" />
                {renderFieldError('lastName')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">First Name <span className="text-red-500">*</span></label>
                <input value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="First name" />
                {renderFieldError('firstName')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Middle Name</label>
                <input value={form.middleName} onChange={(event) => updateField('middleName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Middle name" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Birthday <span className="text-red-500">*</span></label>
                <input type="date" value={form.birthday} onChange={(event) => handleBirthdayChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" />
                {renderFieldError('birthday')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Age</label>
                <input readOnly value={form.age} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-700" placeholder="Auto-calculated" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Gender <span className="text-red-500">*</span></label>
                <select value={form.gender} onChange={(event) => updateField('gender', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none">
                  <option value="">Select</option>
                  {genderOptions.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
                </select>
                {renderFieldError('gender')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Civil Status <span className="text-red-500">*</span></label>
                <select value={form.civilStatus} onChange={(event) => updateField('civilStatus', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none">
                  <option value="">Select</option>
                  {civilStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                {renderFieldError('civilStatus')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Highest Educational Attainment <span className="text-red-500">*</span></label>
                <select value={form.highestEducation} onChange={(event) => updateField('highestEducation', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none">
                  <option value="">Select</option>
                  {educationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                {renderFieldError('highestEducation')}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700">ID Type <span className="text-red-500">*</span></label>
                <select value={form.idType} onChange={(event) => updateField('idType', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none">
                  <option value="">Select ID type</option>
                  {idTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                {renderFieldError('idType')}
              </div>
              {form.idType === 'Other' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Specify ID Type</label>
                  <input value={form.idTypeOther} onChange={(event) => updateField('idTypeOther', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Other valid ID type" />
                  {renderFieldError('idTypeOther')}
                </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700">ID Number <span className="text-red-500">*</span></label>
                <input value={form.idNumber} onChange={(event) => updateField('idNumber', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Enter ID number" />
                {renderFieldError('idNumber')}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700">Permanent Address <span className="text-red-500">*</span></label>
                <textarea value={form.permanentAddress} onChange={(event) => updateField('permanentAddress', event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Permanent residence details" />
                {renderFieldError('permanentAddress')}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700">RSBSA Number</label>
                <input value={form.rsbsaNumber} onChange={(event) => updateField('rsbsaNumber', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="RSBSA number" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Farm Area (hectares)</label>
                <input type="number" min="0" step="0.01" value={form.farmArea} onChange={(event) => updateField('farmArea', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="0.50" />
                {renderFieldError('farmArea')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Barangay <span className="text-red-500">*</span></label>
                <input value={form.barangay} onChange={(event) => updateField('barangay', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Barangay" />
                {renderFieldError('barangay')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Municipality <span className="text-red-500">*</span></label>
                <input value={form.municipality} onChange={(event) => updateField('municipality', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Municipality" />
                {renderFieldError('municipality')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Province <span className="text-red-500">*</span></label>
                <input value={form.province} onChange={(event) => updateField('province', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Province" />
                {renderFieldError('province')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Source of Income / Livelihood</label>
                <input value={form.livelihood} onChange={(event) => updateField('livelihood', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Farmer / Trader / Vendor" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700">Annual Income</label>
                <input type="number" min="0" step="0.01" value={form.annualIncome} onChange={(event) => updateField('annualIncome', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="0.00" />
                {renderFieldError('annualIncome')}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Spouse Name</label>
                  <input value={form.spouseName} onChange={(event) => updateField('spouseName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Spouse name" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Spouse Age</label>
                  <input type="number" min="0" value={form.spouseAge} onChange={(event) => updateField('spouseAge', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Age" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700">Spouse Contact Number</label>
                  <input value={form.spouseContact} onChange={(event) => updateField('spouseContact', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Spouse contact" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700">Mother</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700">Mother’s Maiden Name</label>
                    <input value={form.motherMaidenName} onChange={(event) => updateField('motherMaidenName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Maiden name" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700">Mother’s Last Name</label>
                    <input value={form.motherLastName} onChange={(event) => updateField('motherLastName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Last name" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700">Mother’s First Name</label>
                    <input value={form.motherFirstName} onChange={(event) => updateField('motherFirstName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="First name" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700">Mother’s Middle Name</label>
                    <input value={form.motherMiddleName} onChange={(event) => updateField('motherMiddleName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Middle name" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700">Children</p>
                  <button type="button" onClick={addChild} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    <Plus className="h-4 w-4" />
                    Add Child
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {form.children.map((child, index) => (
                    <div key={child.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1.4fr_0.6fr_auto]">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Child Name</label>
                        <input value={child.name} onChange={(event) => setForm((current) => ({ ...current, children: current.children.map((item) => item.id === child.id ? { ...item, name: event.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none" placeholder={`Child ${index + 1} name`} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Age</label>
                        <input type="number" min="0" value={child.age} onChange={(event) => setForm((current) => ({ ...current, children: current.children.map((item) => item.id === child.id ? { ...item, age: event.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none" placeholder="Age" />
                      </div>
                      <button type="button" onClick={() => removeChild(child.id)} className="mt-6 inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700">Income Sources</p>
                  <button type="button" onClick={addIncomeSource} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    <Plus className="h-4 w-4" />
                    Add Income Source
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {form.incomeSources.map((row, index) => (
                    <div key={row.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1.2fr_1fr_auto]">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Source</label>
                        <input value={row.source} onChange={(event) => setForm((current) => ({ ...current, incomeSources: current.incomeSources.map((item) => item.id === row.id ? { ...item, source: event.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none" placeholder={`Source ${index + 1}`} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Annual Amount</label>
                        <input type="number" min="0" step="0.01" value={row.amount} onChange={(event) => setForm((current) => ({ ...current, incomeSources: current.incomeSources.map((item) => item.id === row.id ? { ...item, amount: event.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-500 focus:outline-none" placeholder="0.00" />
                      </div>
                      <button type="button" onClick={() => removeIncomeSource(row.id)} className="mt-6 inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-emerald-900">Total Annual Income</span>
                  <span className="text-xl font-bold text-emerald-700">₱{totalAnnualIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-700">Membership Type</label>
                <select value={form.membershipType} onChange={(event) => updateField('membershipType', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none">
                  <option value="Regular">Regular</option>
                  <option value="Associate">Associate</option>
                  <option value="Lifetime">Lifetime</option>
                </select>
                {renderFieldError('membershipType')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Membership Acceptance Date <span className="text-red-500">*</span></label>
                <input type="date" value={form.membershipAcceptanceDate} onChange={(event) => updateField('membershipAcceptanceDate', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" />
                {renderFieldError('membershipAcceptanceDate')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Separation Date</label>
                <input type="date" value={form.separationDate} onChange={(event) => updateField('separationDate', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">B.O.D. Resolution</label>
                <input value={form.bodResolution} onChange={(event) => updateField('bodResolution', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="Resolution reference" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Membership Fee</label>
                <input type="number" min="0" step="0.01" value={form.membershipFee} onChange={(event) => updateField('membershipFee', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="0.00" />
                {renderFieldError('membershipFee')}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Date Received</label>
                <input type="date" value={form.dateReceived} onChange={(event) => updateField('dateReceived', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Pre-Membership Education Seminar</label>
                <select value={form.preMembershipSeminar} onChange={(event) => updateField('preMembershipSeminar', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none">
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Payment of Membership Fee</label>
                <select value={form.paymentOfMembershipFee} onChange={(event) => updateField('paymentOfMembershipFee', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none">
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">OR Number</label>
                <input value={form.orNumber} onChange={(event) => updateField('orNumber', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="OR Number" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700">Initial Paid-Up Capital</label>
                <input type="number" min="0" step="0.01" value={form.initialPaidUpCapital} onChange={(event) => updateField('initialPaidUpCapital', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-emerald-500 focus:outline-none" placeholder="0.00" />
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-5">
              <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <div className="mx-auto flex aspect-square max-w-[220px] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
                  {photoPreview ? (
                    <img src={photoPreview} alt="2x2 ID preview" className="h-full w-full object-cover object-center" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                      <div className="rounded-full bg-slate-200 p-3"><ImagePlus className="h-7 w-7" /></div>
                      <div className="text-center text-sm font-semibold">2 × 2 ID PHOTO</div>
                      <div className="text-center text-xs text-slate-500">Upload / Capture</div>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-center">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                    <Camera className="h-4 w-4" />
                    Upload Photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                  </label>
                </div>
                <div className="mt-3 text-center text-xs text-slate-500">White background • clear face • portrait orientation • max 2 MB</div>
                {photoFile && (
                  <div className="mt-3 flex items-center justify-center gap-3 text-sm text-green-700">
                    <Check className="h-4 w-4" />
                    {photoFile.name}
                  </div>
                )}
                {photoPreview && (
                  <div className="mt-3 flex justify-center gap-3">
                    <button type="button" onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Replace photo</button>
                    <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100">Remove photo</button>
                  </div>
                )}
                {renderFieldError('idPhoto')}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700">ID Document</p>
                    <p className="mt-1 text-sm text-slate-600">Upload a valid ID as a picture or PDF. If applicable, combine the front and back sides in one file.</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
                    <ImagePlus className="h-4 w-4" />
                    Upload ID Document
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={handleIdDocumentChange} />
                  </label>
                </div>
                {idDocumentFile ? (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    <span className="truncate">{idDocumentFile.name}</span>
                    <button type="button" onClick={() => setIdDocumentFile(null)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100">Remove</button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">No ID document uploaded yet.</div>
                )}
                {renderFieldError('idDocument')}
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700">Member Information</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Membership No.</span><p className="mt-1 font-semibold text-slate-900">{form.memberNumber || 'Auto-generated'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</span><p className="mt-1 font-semibold text-slate-900">{form.fullName || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Birthday</span><p className="mt-1 font-semibold text-slate-900">{form.birthday || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Age</span><p className="mt-1 font-semibold text-slate-900">{form.age || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</span><p className="mt-1 font-semibold text-slate-900">{form.gender || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Civil Status</span><p className="mt-1 font-semibold text-slate-900">{form.civilStatus || '—'}</p></div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700">Contact</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</span><p className="mt-1 font-semibold text-slate-900">{form.phone || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span><p className="mt-1 font-semibold text-slate-900">{form.email || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</span><p className="mt-1 font-semibold text-slate-900">{form.address || '—'}</p></div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700">Identification and Farm</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">ID Type</span><p className="mt-1 font-semibold text-slate-900">{form.idType === 'Other' ? form.idTypeOther || 'Other' : form.idType || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">ID Number</span><p className="mt-1 font-semibold text-slate-900">{form.idNumber || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">RSBSA No.</span><p className="mt-1 font-semibold text-slate-900">{form.rsbsaNumber || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Farm Area</span><p className="mt-1 font-semibold text-slate-900">{form.farmArea || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Barangay</span><p className="mt-1 font-semibold text-slate-900">{form.barangay || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Municipality</span><p className="mt-1 font-semibold text-slate-900">{form.municipality || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Province</span><p className="mt-1 font-semibold text-slate-900">{form.province || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Annual Income</span><p className="mt-1 font-semibold text-slate-900">₱{Number(form.annualIncome || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p></div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-700">Family and Membership</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Spouse</span><p className="mt-1 font-semibold text-slate-900">{form.spouseName || '—'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Children</span><p className="mt-1 font-semibold text-slate-900">{form.children.filter((child) => child.name.trim()).length || '0'}</p></div>
                    <div><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Membership Type</span><p className="mt-1 font-semibold text-slate-900">{form.membershipType || '—'}</p></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button type="button" onClick={prevStep} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
            {step < sectionMeta.length - 1 ? (
              <button type="button" onClick={nextStep} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400">
                {isSubmitting ? 'Saving...' : 'Save Member'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
