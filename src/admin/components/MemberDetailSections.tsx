import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Member } from '../pages/MembershipManagement';
import { civilStatusOptions, educationOptions, genderOptions, idTypeOptions, membershipTypeOptions } from './AddMemberModal';
import { dateOnlyToday } from '../../utils/dateTime';

// The member View and Edit windows, laid out in the same sections and order as
// the Add Member form, in the existing card design.

export interface MemberChildRow { name: string; age: string }
export interface MemberIncomeRow { source: string; amount: string }

export interface MemberFillout {
  lastName: string; firstName: string; middleName: string; birthday: string; age: string; gender: string; civilStatus: string;
  cpNo: string; highestEducation: string; idType: string; idTypeOther: string; idNo: string; permanentAddress: string;
  barangay: string; municipality: string; province: string; rsbsaNo: string; farmArea: string; cornArea: string; palayArea: string;
  livelihood: string; yearlyIncome: string; spouseName: string; spouseAge: string; spouseContact: string; emergencyContact: string;
  motherMaidenName: string; motherLastName: string; motherFirstName: string; motherMiddleName: string;
  childrenList: MemberChildRow[]; incomeSources: MemberIncomeRow[];
  membershipType: string; membershipAcceptanceDate: string; separationDate: string; bodResolution: string; membershipFee: string;
  dateReceived: string; preMembershipSeminar: string; paymentOfMembershipFee: string; orNumber: string; initialPaidUpCapital: string;
}

export const EMPTY_FILLOUT: MemberFillout = {
  lastName: '', firstName: '', middleName: '', birthday: '', age: '', gender: '', civilStatus: '', cpNo: '', highestEducation: '',
  idType: '', idTypeOther: '', idNo: '', permanentAddress: '', barangay: '', municipality: '', province: '', rsbsaNo: '', farmArea: '',
  cornArea: '', palayArea: '', livelihood: '', yearlyIncome: '', spouseName: '', spouseAge: '', spouseContact: '', emergencyContact: '',
  motherMaidenName: '', motherLastName: '', motherFirstName: '', motherMiddleName: '',
  childrenList: [{ name: '', age: '' }], incomeSources: [{ source: '', amount: '' }],
  membershipType: 'Regular', membershipAcceptanceDate: '', separationDate: '', bodResolution: '', membershipFee: '', dateReceived: '',
  preMembershipSeminar: 'Yes', paymentOfMembershipFee: 'Yes', orNumber: '', initialPaidUpCapital: '',
};

export function calculateAge(birthday: string) {
  if (!birthday) return '';
  const birthDate = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1;
  return String(Math.max(0, age));
}

export function filloutFromMember(member: Member): MemberFillout {
  const profile = member.profile || {};
  // A saved ID type outside the list was entered with "Other".
  const knownIdType = !profile.idType || idTypeOptions.includes(profile.idType);
  return {
    ...EMPTY_FILLOUT,
    lastName: profile.lastName || '', firstName: profile.firstName || '', middleName: profile.middleName || '',
    birthday: profile.birthday || '', age: calculateAge(profile.birthday || ''), gender: profile.gender || '',
    civilStatus: profile.civilStatus || '', cpNo: profile.cpNo || '', highestEducation: profile.highestEducation || '',
    idType: knownIdType ? (profile.idType || '') : 'Other', idTypeOther: knownIdType ? '' : (profile.idType || ''), idNo: profile.idNo || '',
    permanentAddress: profile.permanentAddress || '', barangay: profile.barangay || '', municipality: profile.municipality || '',
    province: profile.province || '', rsbsaNo: profile.rsbsaNo || '', farmArea: profile.farmArea || '', cornArea: profile.cornArea || '',
    palayArea: profile.palayArea || '', livelihood: profile.livelihood || '', yearlyIncome: profile.yearlyIncome || '',
    spouseName: profile.spouseName || '', spouseAge: profile.spouseAge || '', spouseContact: profile.spouseContact || '',
    emergencyContact: profile.emergencyContact || '',
    motherMaidenName: profile.motherMaidenName || '', motherLastName: profile.motherLastName || '',
    motherFirstName: profile.motherFirstName || '', motherMiddleName: profile.motherMiddleName || '',
    childrenList: profile.childrenList?.length ? profile.childrenList : [{ name: '', age: '' }],
    incomeSources: profile.incomeSources?.length ? profile.incomeSources : [{ source: '', amount: '' }],
    membershipType: profile.membershipType || 'Regular', membershipAcceptanceDate: member.dateJoined || '',
    separationDate: profile.separationDate || '', bodResolution: profile.bodResolution || '', membershipFee: profile.membershipFee || '',
    dateReceived: profile.dateReceived || '', preMembershipSeminar: profile.preMembershipSeminar || 'Yes',
    paymentOfMembershipFee: profile.paymentOfMembershipFee || 'Yes', orNumber: profile.orNumber || '',
    initialPaidUpCapital: profile.initialPaidUpCapital || '',
  };
}

export const childrenText = (rows: MemberChildRow[]) => rows.filter((child) => child.name.trim()).map((child) => `${child.name.trim()} (${child.age.trim() || 'Age not provided'})`).join('; ');

// The details stored in members.additional_info.
export function additionalInfoFrom(fillout: MemberFillout) {
  return {
    motherMaidenName: fillout.motherMaidenName, motherLastName: fillout.motherLastName,
    motherFirstName: fillout.motherFirstName, motherMiddleName: fillout.motherMiddleName,
    children: fillout.childrenList.filter((child) => child.name.trim() || child.age.trim()),
    incomeSources: fillout.incomeSources.filter((row) => row.source.trim() || row.amount.trim()),
    membershipType: fillout.membershipType, separationDate: fillout.separationDate, bodResolution: fillout.bodResolution,
    membershipFee: fillout.membershipFee, dateReceived: fillout.dateReceived, preMembershipSeminar: fillout.preMembershipSeminar,
    paymentOfMembershipFee: fillout.paymentOfMembershipFee, orNumber: fillout.orNumber, initialPaidUpCapital: fillout.initialPaidUpCapital,
  };
}

// ---------------------------------------------------------------------------
// Shared card and field styles (unchanged from the original windows).

const TONES = {
  blue: { card: 'bg-gradient-to-br from-blue-50 to-blue-50 border border-blue-200 rounded-lg p-5', title: 'text-lg font-bold text-blue-900 mb-4 pb-3 border-b-2 border-blue-300' },
  purple: { card: 'bg-gradient-to-br from-purple-50 to-purple-50 border border-purple-200 rounded-lg p-5', title: 'text-lg font-bold text-purple-900 mb-4 pb-3 border-b-2 border-purple-300' },
  orange: { card: 'bg-gradient-to-br from-orange-50 to-orange-50 border border-orange-200 rounded-lg p-5', title: 'text-lg font-bold text-orange-900 mb-4 pb-3 border-b-2 border-orange-300' },
  green: { card: 'bg-gradient-to-br from-green-50 to-green-50 border border-green-200 rounded-lg p-5', title: 'text-lg font-bold text-green-900 mb-4 pb-3 border-b-2 border-green-300' },
  pink: { card: 'bg-gradient-to-br from-pink-50 to-pink-50 border border-pink-200 rounded-lg p-5', title: 'text-lg font-bold text-pink-900 mb-4 pb-3 border-b-2 border-pink-300' },
  amber: { card: 'bg-gradient-to-br from-amber-50 to-amber-50 border border-amber-200 rounded-lg p-5', title: 'text-lg font-bold text-amber-900 mb-4 pb-3 border-b-2 border-amber-300' },
  indigo: { card: 'bg-gradient-to-br from-indigo-50 to-indigo-50 border border-indigo-200 rounded-lg p-5', title: 'text-lg font-bold text-indigo-900 mb-4 pb-3 border-b-2 border-indigo-300' },
} as const;

type Tone = keyof typeof TONES;
const GRID = { 2: 'grid grid-cols-2 gap-4', 3: 'grid grid-cols-2 md:grid-cols-3 gap-4', 4: 'grid grid-cols-2 md:grid-cols-4 gap-4' } as const;
const LABEL = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';
const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-xl mt-1';

function Card({ tone, title, cols = 4, children }: { tone: Tone; title: string; cols?: keyof typeof GRID; children: ReactNode }) {
  return (
    <div className={TONES[tone].card}>
      <h3 className={TONES[tone].title}>{title}</h3>
      <div className={GRID[cols]}>{children}</div>
    </div>
  );
}

function Show({ label, value, span = '', strong = false }: { label: string; value?: ReactNode; span?: string; strong?: boolean }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className={`bg-white p-3 rounded-lg ${span}`}>
      <label className={LABEL}>{label}</label>
      <p className={`text-sm font-medium mt-1 break-words ${strong ? 'text-green-600 font-bold' : 'text-gray-900'}`}>{empty ? '—' : value}</p>
    </div>
  );
}

function Field({ label, span = '', required = false, children }: { label: string; span?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className={span}>
      <label className={LABEL}>{label}{required && ' *'}</label>
      {children}
    </div>
  );
}

function Choice({ value, options, onChange, placeholder = 'Select' }: { value: string; options: string[]; onChange: (value: string) => void; placeholder?: string }) {
  // Keeps an older saved value selectable even when it is not in today's list.
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={INPUT}>
      <option value="">{placeholder}</option>
      {list.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

const peso = (value: string | number | undefined) => {
  const amount = Number(value);
  return value === undefined || value === '' || !Number.isFinite(amount) ? '' : `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
};
const fullName = (...parts: Array<string | undefined>) => parts.map((part) => part?.trim()).filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// View

export function MemberViewSections({ member }: { member: Member }) {
  const p = member.profile || {};
  const children = (p.childrenList || []).filter((child) => child.name || child.age);
  const incomes = (p.incomeSources || []).filter((row) => row.source || row.amount);
  const incomeTotal = incomes.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const motherName = fullName(p.motherFirstName, p.motherMiddleName, p.motherLastName);
  return (
    <>
      <Card tone="purple" title="Personal Information">
        <Show label="Last Name" value={p.lastName} />
        <Show label="First Name" value={p.firstName} />
        <Show label="Middle Name" value={p.middleName} />
        <Show label="Birthday" value={p.birthday} />
        <Show label="Age" value={calculateAge(p.birthday || '')} />
        <Show label="Gender" value={p.gender} />
        <Show label="Civil Status" value={p.civilStatus} />
        <Show label="Highest Educational Attainment" value={p.highestEducation} />
      </Card>

      <Card tone="orange" title="Contact & Identification">
        <Show label="ID Type" value={p.idType} />
        <Show label="ID Number" value={p.idNo} span="md:col-span-3" />
        <Show label="Permanent Address" value={p.permanentAddress} span="col-span-2 md:col-span-4" />
      </Card>

      <Card tone="green" title="Farm & Location Information">
        <Show label="RSBSA Number" value={p.rsbsaNo} />
        <Show label="Farm Area (ha)" value={p.farmArea} />
        <Show label="Barangay" value={p.barangay} />
        <Show label="Municipality" value={p.municipality} />
        <Show label="Province" value={p.province} />
        <Show label="Source of Income / Livelihood" value={p.livelihood} />
        <Show label="Annual Income" value={peso(p.yearlyIncome)} strong span="col-span-2" />
      </Card>

      <Card tone="pink" title="Family Information">
        <Show label="Spouse Name" value={p.spouseName} span="col-span-2" />
        <Show label="Spouse Age" value={p.spouseAge} />
        <Show label="Spouse Contact Number" value={p.spouseContact} />
        <Show label="Mother’s Maiden Name" value={p.motherMaidenName} span="col-span-2" />
        <Show label="Mother’s Name" value={motherName} span="col-span-2" />
        <Show label="Children" span="col-span-2 md:col-span-4" value={children.length ? (
          <span className="block space-y-1">{children.map((child, index) => <span key={`${child.name}-${index}`} className="block">{child.name || 'Unnamed'}{child.age ? ` — ${child.age} yrs` : ''}</span>)}</span>
        ) : ''} />
      </Card>

      <Card tone="amber" title="Income Information" cols={2}>
        {incomes.length ? incomes.map((row, index) => <Show key={`${row.source}-${index}`} label={row.source || `Income ${index + 1}`} value={peso(row.amount)} />) : <Show label="Income Sources" value="" span="col-span-2" />}
        <Show label="Total Annual Income" value={incomes.length ? peso(incomeTotal) : ''} strong span="col-span-2" />
      </Card>

      <Card tone="indigo" title="Membership Information">
        <Show label="Membership Type" value={p.membershipType} />
        <Show label="Membership Acceptance Date" value={member.dateJoined} />
        <Show label="Separation Date" value={p.separationDate} />
        <Show label="B.O.D. Resolution" value={p.bodResolution} />
        <Show label="Membership Fee" value={peso(p.membershipFee)} />
        <Show label="Date Received" value={p.dateReceived} />
        <Show label="Pre-Membership Education Seminar" value={p.preMembershipSeminar} />
        <Show label="Payment of Membership Fee" value={p.paymentOfMembershipFee} />
        <Show label="OR Number" value={p.orNumber} span="col-span-2" />
        <Show label="Initial Paid-Up Capital" value={peso(p.initialPaidUpCapital)} strong span="col-span-2" />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit

export interface MemberAccountForm { name: string; email: string; phone: string; address: string; shareCapital: string }

export function MemberEditSections({ memberNumber, formData, setFormData, fillout, setFillout }: {
  memberNumber: string;
  formData: MemberAccountForm;
  setFormData: Dispatch<SetStateAction<MemberAccountForm>>;
  fillout: MemberFillout;
  setFillout: Dispatch<SetStateAction<MemberFillout>>;
}) {
  const set = <K extends keyof MemberFillout>(key: K, value: MemberFillout[K]) => setFillout((current) => ({ ...current, [key]: value }));
  const text = (key: keyof MemberFillout, placeholder = '', type = 'text') => (
    <input type={type} value={fillout[key] as string} onChange={(event) => set(key, event.target.value as never)} className={INPUT} placeholder={placeholder} />
  );
  const updateRow = <K extends 'childrenList' | 'incomeSources'>(key: K, index: number, patch: Partial<MemberFillout[K][number]>) =>
    setFillout((current) => ({ ...current, [key]: current[key].map((row, position) => position === index ? { ...row, ...patch } : row) }));
  const removeRow = (key: 'childrenList' | 'incomeSources', index: number) =>
    setFillout((current) => {
      const rows = current[key].filter((_, position) => position !== index);
      return { ...current, [key]: rows.length ? rows : [key === 'childrenList' ? { name: '', age: '' } : { source: '', amount: '' }] };
    });
  const incomeTotal = fillout.incomeSources.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  return (
    <>
      <Card tone="blue" title="Member / Account Information" cols={3}>
        <Field label="Associate / Membership No."><input type="text" readOnly value={memberNumber} className={`${INPUT} bg-gray-50 text-gray-600`} /></Field>
        <Field label="Full Name" required span="md:col-span-2"><input type="text" required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className={INPUT} placeholder="Full name" /></Field>
        <Field label="Email" required><input type="email" required value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} className={INPUT} placeholder="email@example.com" /></Field>
        <Field label="Phone / CP Number" required><input type="tel" required value={formData.phone} onChange={(event) => { setFormData({ ...formData, phone: event.target.value }); set('cpNo', event.target.value); }} className={INPUT} placeholder="+63 XXX XXX XXXX" /></Field>
        <Field label="Share Capital"><input type="text" readOnly value={peso(formData.shareCapital) || '₱0.00'} className={`${INPUT} bg-gray-50 text-gray-600`} title="Share capital changes through Add Contribution" /></Field>
        <Field label="Address" required span="col-span-2 md:col-span-3"><textarea required rows={2} value={formData.address} onChange={(event) => setFormData({ ...formData, address: event.target.value })} className={INPUT} placeholder="Complete address" /></Field>
      </Card>

      <Card tone="purple" title="Personal Information">
        <Field label="Last Name" required>{text('lastName', 'Last name')}</Field>
        <Field label="First Name" required>{text('firstName', 'First name')}</Field>
        <Field label="Middle Name">{text('middleName', 'Middle name')}</Field>
        <Field label="Birthday"><input type="date" value={fillout.birthday} onChange={(event) => setFillout((current) => ({ ...current, birthday: event.target.value, age: calculateAge(event.target.value) }))} className={INPUT} /></Field>
        <Field label="Age"><input type="number" readOnly value={fillout.age} className={INPUT} placeholder="Age" /></Field>
        <Field label="Gender"><Choice value={fillout.gender} options={genderOptions} onChange={(value) => set('gender', value)} /></Field>
        <Field label="Civil Status"><Choice value={fillout.civilStatus} options={civilStatusOptions} onChange={(value) => set('civilStatus', value)} /></Field>
        <Field label="Highest Educational Attainment"><Choice value={fillout.highestEducation} options={educationOptions} onChange={(value) => set('highestEducation', value)} /></Field>
      </Card>

      <Card tone="orange" title="Contact & Identification">
        <Field label="ID Type"><Choice value={fillout.idType} options={idTypeOptions} onChange={(value) => set('idType', value)} placeholder="Select ID type" /></Field>
        {fillout.idType === 'Other' && <Field label="Specify ID Type">{text('idTypeOther', 'ID type')}</Field>}
        <Field label="ID Number" span={fillout.idType === 'Other' ? 'md:col-span-2' : 'md:col-span-3'}>{text('idNo', 'ID number')}</Field>
        <Field label="Permanent Address" span="col-span-2 md:col-span-4"><textarea rows={2} value={fillout.permanentAddress} onChange={(event) => set('permanentAddress', event.target.value)} className={INPUT} placeholder="Permanent address" /></Field>
      </Card>

      <Card tone="green" title="Farm & Location Information">
        <Field label="RSBSA Number">{text('rsbsaNo', 'RSBSA number')}</Field>
        <Field label="Farm Area (hectares)"><input type="number" min="0" step="0.01" value={fillout.farmArea} onChange={(event) => set('farmArea', event.target.value)} className={INPUT} placeholder="0.00" /></Field>
        <Field label="Barangay">{text('barangay', 'Barangay')}</Field>
        <Field label="Municipality">{text('municipality', 'Municipality')}</Field>
        <Field label="Province">{text('province', 'Province')}</Field>
        <Field label="Source of Income / Livelihood">{text('livelihood', 'e.g., Rice farming')}</Field>
        <Field label="Annual Income" span="col-span-2"><input type="number" min="0" step="0.01" value={fillout.yearlyIncome} onChange={(event) => set('yearlyIncome', event.target.value)} className={INPUT} placeholder="0.00" /></Field>
      </Card>

      <Card tone="pink" title="Family Information">
        <Field label="Spouse Name" span="col-span-2">{text('spouseName', 'Spouse name')}</Field>
        <Field label="Spouse Age"><input type="number" min="0" max="130" value={fillout.spouseAge} onChange={(event) => set('spouseAge', event.target.value)} className={INPUT} placeholder="Age" /></Field>
        <Field label="Spouse Contact Number">{text('spouseContact', 'Contact number')}</Field>
        <Field label="Mother’s Maiden Name">{text('motherMaidenName', 'Maiden name')}</Field>
        <Field label="Mother’s Last Name">{text('motherLastName', 'Last name')}</Field>
        <Field label="Mother’s First Name">{text('motherFirstName', 'First name')}</Field>
        <Field label="Mother’s Middle Name">{text('motherMiddleName', 'Middle name')}</Field>
        <div className="col-span-2 md:col-span-4">
          <div className="flex items-center justify-between">
            <label className={LABEL}>Children</label>
            <button type="button" onClick={() => setFillout((current) => ({ ...current, childrenList: [...current.childrenList, { name: '', age: '' }] }))} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800"><Plus className="h-3.5 w-3.5" />Add child</button>
          </div>
          <div className="mt-1 space-y-2">
            {fillout.childrenList.map((child, index) => (
              <div key={index} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
                <input type="text" value={child.name} onChange={(event) => updateRow('childrenList', index, { name: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Child name" aria-label={`Child ${index + 1} name`} />
                <input type="number" min="0" value={child.age} onChange={(event) => updateRow('childrenList', index, { age: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Age" aria-label={`Child ${index + 1} age`} />
                <button type="button" onClick={() => removeRow('childrenList', index)} aria-label={`Remove child ${index + 1}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card tone="amber" title="Income Information" cols={2}>
        <div className="col-span-2">
          <div className="flex items-center justify-between">
            <label className={LABEL}>Income Sources</label>
            <button type="button" onClick={() => setFillout((current) => ({ ...current, incomeSources: [...current.incomeSources, { source: '', amount: '' }] }))} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800"><Plus className="h-3.5 w-3.5" />Add income source</button>
          </div>
          <div className="mt-1 space-y-2">
            {fillout.incomeSources.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_9rem_auto] items-center gap-2">
                <input type="text" value={row.source} onChange={(event) => updateRow('incomeSources', index, { source: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Source" aria-label={`Income source ${index + 1}`} />
                <input type="number" min="0" step="0.01" value={row.amount} onChange={(event) => updateRow('incomeSources', index, { amount: event.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Annual amount" aria-label={`Income source ${index + 1} annual amount`} />
                <button type="button" onClick={() => removeRow('incomeSources', index)} aria-label={`Remove income source ${index + 1}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-gray-600">Total annual income: <span className="font-semibold text-green-700">{peso(incomeTotal) || '₱0.00'}</span></p>
        </div>
      </Card>

      <Card tone="indigo" title="Membership Information">
        <Field label="Membership Type"><Choice value={fillout.membershipType} options={membershipTypeOptions} onChange={(value) => set('membershipType', value)} /></Field>
        <Field label="Membership Acceptance Date" required><input type="date" required max={dateOnlyToday()} value={fillout.membershipAcceptanceDate} onChange={(event) => set('membershipAcceptanceDate', event.target.value)} className={INPUT} /></Field>
        <Field label="Separation Date">{text('separationDate', '', 'date')}</Field>
        <Field label="B.O.D. Resolution">{text('bodResolution', 'Resolution no.')}</Field>
        <Field label="Membership Fee"><input type="number" min="0" step="0.01" value={fillout.membershipFee} onChange={(event) => set('membershipFee', event.target.value)} className={INPUT} placeholder="0.00" /></Field>
        <Field label="Date Received">{text('dateReceived', '', 'date')}</Field>
        <Field label="Pre-Membership Education Seminar"><Choice value={fillout.preMembershipSeminar} options={['Yes', 'No']} onChange={(value) => set('preMembershipSeminar', value)} /></Field>
        <Field label="Payment of Membership Fee"><Choice value={fillout.paymentOfMembershipFee} options={['Yes', 'No']} onChange={(value) => set('paymentOfMembershipFee', value)} /></Field>
        <Field label="OR Number" span="col-span-2">{text('orNumber', 'Official receipt no.')}</Field>
        <Field label="Initial Paid-Up Capital" span="col-span-2"><input type="number" min="0" step="0.01" value={fillout.initialPaidUpCapital} onChange={(event) => set('initialPaidUpCapital', event.target.value)} className={INPUT} placeholder="0.00" /></Field>
      </Card>
    </>
  );
}
