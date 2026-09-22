import { useEffect, useState } from 'react';
import { Search, Plus, Edit, Archive, RotateCcw, Eye, Filter, X } from 'lucide-react';
import { UserRole } from '../../app/App';
import { toast } from 'sonner';
import { AddMemberModal, type MemberDraftData } from '../components/AddMemberModal';
import { addShareContributionRequest, archiveMemberRequest, createMemberRequest, fetchArchivedMembers, fetchMemberRequest, fetchMemberStatistics, fetchMembers, restoreMemberRequest, updateMemberRequest } from '../services/membersApi';
import { dateOnlyToday, formatDate, formatDateTime } from '../../utils/dateTime';

export interface Member {
  id: number;
  name: string;
  memberId: string;
  email: string;
  phone: string;
  address: string;
  dateJoined: string;
  shareCapital: number;
  status: 'active' | 'inactive' | 'suspended' | 'archived';
  archivedAt?: string | null;
  archivedBy?: string | null;
  idDocumentName?: string | null;
  idDocumentType?: string | null;
  idDocumentSize?: number | null;
  createdAt?: string;
  updatedAt?: string;
  shareDetails?: {
    contributions: Array<{
      id: number;
      memberId: number;
      amount: number;
      contributionDate: string;
      paymentMethod: string | null;
      referenceNumber: string | null;
      notes: string;
      createdAt: string;
      recordedBy: number | null;
      recordedByName: string | null;
    }>;
    total: number;
    maximum: number;
    remaining: number;
  };
  profile?: {
    lastName?: string;
    firstName?: string;
    middleName?: string;
    birthday?: string;
    age?: string;
    gender?: string;
    civilStatus?: string;
    cpNo?: string;
    highestEducation?: string;
    idType?: string;
    idNo?: string;
    permanentAddress?: string;
    barangay?: string;
    municipality?: string;
    province?: string;
    rsbsaNo?: string;
    farmArea?: string;
    cornArea?: string;
    palayArea?: string;
    spouseName?: string;
    spouseAge?: string;
    spouseContact?: string;
    emergencyContact?: string;
    children?: string;
    livelihood?: string;
    yearlyIncome?: string;
  };
}

interface MembershipManagementProps {
  userRole: UserRole;
}

function buildMemberPayload(formData: { name: string; email: string; phone: string; address: string; shareCapital: string }, fillout: Member['profile'] = {}, status = 'active', membershipDate = dateOnlyToday()) {
  const nameParts = formData.name.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: fillout.firstName || nameParts[0] || '',
    middle_name: fillout.middleName || '',
    last_name: fillout.lastName || nameParts.slice(1).join(' '),
    email: formData.email,
    phone: formData.phone || fillout.cpNo || '',
    address: formData.address || fillout.permanentAddress || '',
    barangay: fillout.barangay || '',
    municipality: fillout.municipality || '',
    province: fillout.province || '',
    date_of_birth: fillout.birthday || null,
    gender: fillout.gender || null,
    civil_status: fillout.civilStatus || null,
    education: fillout.highestEducation || null,
    id_type: fillout.idType || null,
    id_number: fillout.idNo || null,
    rsbsa_no: fillout.rsbsaNo || null,
    livelihood: fillout.livelihood || null,
    farm_area_ha: fillout.farmArea || null,
    corn_area_ha: fillout.cornArea || null,
    palay_area_ha: fillout.palayArea || null,
    yearly_income: fillout.yearlyIncome || null,
    spouse_name: fillout.spouseName || null,
    spouse_age: fillout.spouseAge || null,
    spouse_contact: fillout.spouseContact || null,
    children: fillout.children || null,
    emergency_contact: fillout.emergencyContact || null,
    membership_date: membershipDate,
    share_capital: formData.shareCapital,
    status,
  };
}

function calculateAge(birthday: string) {
  if (!birthday) return '';
  const birthDate = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday = today.getMonth() < birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return String(Math.max(0, age));
}

export function MembershipManagement({ userRole }: MembershipManagementProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [archivedMembers, setArchivedMembers] = useState<Member[]>([]);
  const [statistics, setStatistics] = useState({ totalMembers: 0, totalShareCapital: 0, newThisMonth: 0, archivedMembers: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showShareContributionModal, setShowShareContributionModal] = useState(false);
  const [shareContributionForm, setShareContributionForm] = useState({ amount: '', contributionDate: dateOnlyToday(), notes: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [memberToArchive, setMemberToArchive] = useState<Member | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [memberToRestore, setMemberToRestore] = useState<Member | null>(null);
  const [showArchivedMembers, setShowArchivedMembers] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    shareCapital: ''
  });
  const [uploadFiles, setUploadFiles] = useState({ idDocument: null as File | null });
  // extended fields matching the membership fillout form
  const [fillout, setFillout] = useState({
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
    idNo: '',
    permanentAddress: '',
    barangay: '',
    municipality: '',
    province: '',
    rsbsaNo: '',
    farmArea: '',
    cornArea: '',
    palayArea: '',
    spouseName: '',
    spouseAge: '',
    spouseContact: '',
    emergencyContact: '',
    children: '',
    livelihood: '',
    yearlyIncome: ''
  });

  const loadMembers = async (search = searchTerm) => {
    try {
      setIsLoading(true);
      setLoadError(false);
      const [{ data: nextMembers }, { data: nextStatistics }, archivedResponse] = await Promise.all([
        fetchMembers(search),
        fetchMemberStatistics(),
        fetchArchivedMembers(showArchivedMembers ? search : ''),
      ]);
      setMembers(nextMembers);
      setArchivedMembers(archivedResponse.data);
      setStatistics(nextStatistics);
    } catch (error) {
      console.error('Load members failed:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadMembers(); }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchTerm, showArchivedMembers]);

  const filteredMembers = showArchivedMembers ? archivedMembers : members;

  const canEdit = userRole === 'admin';

  const handleAddShareContribution = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMember) return;
    try {
      const amount = Number(shareContributionForm.amount);
      const response = await addShareContributionRequest(selectedMember.id, { amount, contributionDate: shareContributionForm.contributionDate, notes: shareContributionForm.notes });
      setSelectedMember((current) => current ? { ...current, shareCapital: response.data.total, shareDetails: response.data } : current);
      await loadMembers();
      setShareContributionForm({ amount: '', contributionDate: dateOnlyToday(), notes: '' });
      setShowShareContributionModal(false);
      toast.success('Share contribution recorded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to record share contribution.');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildMemberPayload(formData, fillout);
    try {
      const { data: newMember } = await createMemberRequest(payload, uploadFiles.idDocument);
      setMembers((current) => [newMember, ...current]);
      await loadMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to add member.');
      return;
    }
    setShowAddModal(false);
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      shareCapital: ''
    });
    setUploadFiles({
      idDocument: null
    });
    setFillout({
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
      idNo: '',
      permanentAddress: '',
      barangay: '',
      municipality: '',
      province: '',
      rsbsaNo: '',
      farmArea: '',
      cornArea: '',
      palayArea: '',
      spouseName: '',
      spouseAge: '',
      spouseContact: '',
      emergencyContact: '',
      children: '',
      livelihood: '',
      yearlyIncome: ''
    });
    toast.success('Member added successfully.');
  };

  const buildDraftPayload = (draft: MemberDraftData) => {
    const cleanedFullName = draft.fullName.trim();
    const nameParts = cleanedFullName ? cleanedFullName.split(/\s+/) : [];
    const firstName = draft.firstName || nameParts[0] || '';
    const middleName = draft.middleName || '';
    const lastName = draft.lastName || nameParts.slice(1).join(' ') || '';
    const effectiveIdType = draft.idType === 'Other' ? (draft.idTypeOther || 'Other') : draft.idType;
    const childrenText = draft.children.filter((child) => child.name.trim()).map((child) => `${child.name.trim()} (${child.age || 'Age not provided'})`).join('; ');
    const incomeText = draft.incomeSources.filter((source) => source.source.trim() || source.amount.trim()).map((source) => `${source.source || 'Income'}: ${source.amount || '0'}`).join('; ');
    return {
      member_number: draft.memberNumber || null,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      email: draft.email.trim(),
      phone: draft.phone.trim() || draft.cpNo.trim(),
      address: draft.address.trim() || draft.permanentAddress.trim(),
      barangay: draft.barangay.trim(),
      municipality: draft.municipality.trim(),
      province: draft.province.trim(),
      date_of_birth: draft.birthday || null,
      gender: draft.gender || null,
      civil_status: draft.civilStatus || null,
      education: draft.highestEducation || null,
      id_type: effectiveIdType || null,
      id_number: draft.idNumber.trim() || null,
      rsbsa_no: draft.rsbsaNumber.trim() || null,
      livelihood: draft.livelihood.trim() || null,
      farm_area_ha: draft.farmArea ? Number(draft.farmArea) : null,
      yearly_income: draft.annualIncome ? Number(draft.annualIncome) : null,
      spouse_name: draft.spouseName.trim() || null,
      spouse_age: draft.spouseAge ? Number(draft.spouseAge) : null,
      spouse_contact: draft.spouseContact.trim() || null,
      children: childrenText || null,
      emergency_contact: null,
      membership_date: draft.membershipAcceptanceDate || dateOnlyToday(),
      share_capital: draft.shareCapital ? Number(draft.shareCapital) : 0,
      status: 'active',
      profile_photo: null,
      notes: incomeText || null,
      id_document_name: null,
    };
  };

  const handleDraftSubmit = async (draft: MemberDraftData, photoFile: File | null, idDocumentFile: File | null) => {
    const payload = buildDraftPayload(draft);
    try {
      const { data: newMember } = await createMemberRequest(payload, idDocumentFile, photoFile);
      setMembers((current) => [newMember, ...current]);
      await loadMembers();
      setShowAddModal(false);
      toast.success('Member added successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to add member.');
    }
  };

  const handleEditMember = (member: Member) => {
    setEditingMember(member);
    setFormData({ name: member.name, email: member.email, phone: member.phone, address: member.address, shareCapital: String(member.shareCapital) });
    if (member.profile) {
      setFillout({
        lastName: member.profile.lastName || '',
        firstName: member.profile.firstName || '',
        middleName: member.profile.middleName || '',
        birthday: member.profile.birthday || '',
        age: member.profile.age || '',
        gender: member.profile.gender || '',
        civilStatus: member.profile.civilStatus || '',
        cpNo: member.profile.cpNo || '',
        highestEducation: member.profile.highestEducation || '',
        idType: member.profile.idType || '',
        idNo: member.profile.idNo || '',
        permanentAddress: member.profile.permanentAddress || '',
        barangay: member.profile.barangay || '',
        municipality: member.profile.municipality || '',
        province: member.profile.province || '',
        rsbsaNo: member.profile.rsbsaNo || '',
        farmArea: member.profile.farmArea || '',
        cornArea: member.profile.cornArea || '',
        palayArea: member.profile.palayArea || '',
        spouseName: member.profile.spouseName || '',
        spouseAge: member.profile.spouseAge || '',
        spouseContact: member.profile.spouseContact || '',
        emergencyContact: member.profile.emergencyContact || '',
        children: member.profile.children || '',
        livelihood: member.profile.livelihood || '',
        yearlyIncome: member.profile.yearlyIncome || ''
      });
    }
    setShowEditModal(true);
  };

  const viewMember = async (member: Member) => {
    try {
      const { data } = await fetchMemberRequest(member.id);
      setSelectedMember(data);
      setShowModal(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load member.');
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      await updateMemberRequest(editingMember.id, buildMemberPayload(formData, fillout, editingMember.status, editingMember.dateJoined));
      await loadMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update member.');
      return;
    }
    setShowEditModal(false);
    setEditingMember(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      shareCapital: ''
    });
    setFillout({
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
      idNo: '',
      permanentAddress: '',
      barangay: '',
      municipality: '',
      province: '',
      rsbsaNo: '',
      farmArea: '',
      cornArea: '',
      palayArea: '',
      spouseName: '',
      spouseAge: '',
      spouseContact: '',
      emergencyContact: '',
      children: '',
      livelihood: '',
      yearlyIncome: ''
    });
    toast.success('Member updated successfully!', {
      description: `${formData.name}'s information has been updated`
    });
  };

  const handleArchiveMember = (member: Member) => {
    setMemberToArchive(member);
    setShowArchiveConfirm(true);
  };

  const confirmArchive = async () => {
    if (memberToArchive) {
      try {
        await archiveMemberRequest(memberToArchive.id);
        await loadMembers();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to archive member.');
        return;
      }
      setShowArchiveConfirm(false);
      setMemberToArchive(null);
      toast.success('Member archived successfully.');
    }
  };

  const handleRestoreMember = (member: Member) => {
    setMemberToRestore(member);
    setShowRestoreConfirm(true);
  };

  const confirmRestore = async () => {
    if (memberToRestore) {
      try {
        await restoreMemberRequest(memberToRestore.id);
        await loadMembers();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to restore member.');
        return;
      }
      setShowRestoreConfirm(false);
      setMemberToRestore(null);
      toast.success('Member restored successfully.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          
          <p className="text-gray-600 mt-1">Manage cooperative members and registrations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchivedMembers((current) => !current)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            {showArchivedMembers ? <RotateCcw className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
            {showArchivedMembers ? 'Back to Associates' : 'Archived Members'}
          </button>
          {canEdit && !showArchivedMembers && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              <Plus className="w-5 h-5" />
              Add Member
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Total Members</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{statistics.totalMembers}</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">Total Share Capital</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            ₱{statistics.totalShareCapital.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-600">{showArchivedMembers ? 'Archived Members' : 'New This Month'}</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{showArchivedMembers ? statistics.archivedMembers : statistics.newThisMonth}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={showArchivedMembers ? 'Search archived members...' : 'Search by name or member ID...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Share Capital
                </th>
                {showArchivedMembers && (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Archived Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </>
                )}
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading && <tr><td colSpan={showArchivedMembers ? 7 : 5} className="px-6 py-10 text-center text-sm text-gray-500">Loading members...</td></tr>}
              {!isLoading && loadError && <tr><td colSpan={showArchivedMembers ? 7 : 5} className="px-6 py-10 text-center text-sm text-red-600">Unable to load members. Please try again.</td></tr>}
              {!isLoading && !loadError && filteredMembers.length === 0 && <tr><td colSpan={showArchivedMembers ? 7 : 5} className="px-6 py-10 text-center text-sm text-gray-500">No members found.</td></tr>}
              {!isLoading && !loadError && filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{member.name}</div>
                      <div className="text-sm text-gray-500">{member.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {member.memberId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{member.phone}</div>
                    <div className="text-sm text-gray-500">{member.address}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ₱{member.shareCapital.toLocaleString()}
                  </td>
                  {showArchivedMembers && (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {member.archivedAt ? formatDateTime(member.archivedAt) : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700 capitalize">
                        {member.status}
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => void viewMember(member)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50"
                        title="View member"
                        aria-label={`View ${member.name}`}
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      {canEdit && !showArchivedMembers && (
                        <>
                          <button 
                            onClick={() => handleEditMember(member)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-50"
                            title="Update member"
                            aria-label={`Update ${member.name}`}>
                            <Edit className="h-5 w-5" />
                          </button>
                          <button 
                            onClick={() => handleArchiveMember(member)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                            title="Delete member"
                            aria-label={`Delete ${member.name}`}>
                            <Archive className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      {canEdit && showArchivedMembers && (
                        <button
                          onClick={() => handleRestoreMember(member)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-green-600 hover:bg-green-50"
                          title="Restore member"
                          aria-label={`Restore ${member.name}`}
                        >
                          <RotateCcw className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Details Modal */}
      {showModal && selectedMember && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 border-b border-blue-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{selectedMember.name}</h2>
                  <p className="text-blue-100 mt-1">ID: {selectedMember.memberId}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-blue-100">
                    <span>Status: <strong className="text-white capitalize">{selectedMember.status}</strong></span>
                    {selectedMember.archivedAt && <span>Archived: {formatDateTime(selectedMember.archivedAt)}</span>}
                    {selectedMember.archivedBy && <span>Archived by: {selectedMember.archivedBy}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              
              {/* Account Information Card */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-50 border border-blue-200 rounded-lg p-5">
                <h3 className="text-lg font-bold text-blue-900 mb-4 pb-3 border-b-2 border-blue-300">Account Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-white p-3 rounded-lg">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                    <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.email}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</label>
                    <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.phone}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date Joined</label>
                    <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.dateJoined}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Share Capital</label>
                    <p className="text-sm font-medium text-green-600 font-bold mt-1">₱{selectedMember.shareCapital.toLocaleString()}</p>
                  </div>
                  <div className="md:col-span-2 bg-white p-3 rounded-lg">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Address</label>
                    <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.address}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-green-200 bg-green-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-green-200 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-green-900">Share Details</h3>
                    <p className="mt-1 text-sm text-green-800">Installment contributions toward the ₱20,000 maximum.</p>
                  </div>
                  {canEdit && <button type="button" onClick={() => setShowShareContributionModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"><Plus className="h-4 w-4" />Add Contribution</button>}
                </div>
                {selectedMember.shareDetails ? (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Share Capital</p><p className="mt-1 text-lg font-bold text-green-700">₱{selectedMember.shareDetails.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p></div>
                      <div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Maximum Share Limit</p><p className="mt-1 text-lg font-bold text-gray-900">₱{selectedMember.shareDetails.maximum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p></div>
                      <div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Remaining</p><p className="mt-1 text-lg font-bold text-blue-700">₱{selectedMember.shareDetails.remaining.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p></div>
                      <div className="rounded-lg bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contributions</p><p className="mt-1 text-lg font-bold text-gray-900">{selectedMember.shareDetails.contributions.length}</p></div>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-green-100"><div className="h-full rounded-full bg-green-600" style={{ width: `${Math.min(100, (selectedMember.shareDetails.total / selectedMember.shareDetails.maximum) * 100)}%` }} /></div>
                    <p className="mt-2 text-xs text-green-800">{Math.min(100, (selectedMember.shareDetails.total / selectedMember.shareDetails.maximum) * 100).toFixed(1)}% of maximum share contribution</p>
                    <h4 className="mt-5 font-semibold text-gray-900">Contribution History</h4>
                    <div className="mt-2 overflow-x-auto rounded-lg border border-green-100 bg-white">
                      <table className="min-w-full text-sm"><thead className="bg-green-100"><tr><th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Amount</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Payment Method</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Reference</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Recorded By</th></tr></thead><tbody className="divide-y divide-gray-100">{selectedMember.shareDetails.contributions.map((contribution) => <tr key={contribution.id}><td className="px-3 py-2 whitespace-nowrap">{formatDate(contribution.contributionDate)}</td><td className="px-3 py-2 font-medium text-green-700">₱{contribution.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td><td className="px-3 py-2">{contribution.paymentMethod || '—'}</td><td className="px-3 py-2">{contribution.referenceNumber || '—'}</td><td className="px-3 py-2">{contribution.recordedByName || '—'}</td></tr>)}{selectedMember.shareDetails.contributions.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No share contributions recorded.</td></tr>}</tbody></table>
                    </div>
                  </>
                ) : <p className="mt-4 text-sm text-gray-500">Share contribution history is unavailable.</p>}
              </div>

              {/* Personal Information Card */}
              {selectedMember.profile && (
                <>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 pb-3 border-b-2 border-gray-300">Required Documents</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="min-w-0"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Document</label><p className="mt-1 break-all text-sm font-medium text-gray-900">{selectedMember.idDocumentName || '—'}</p></div>
                      <div className="min-w-0"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</label><p className="mt-1 break-words text-sm font-medium text-gray-900">{selectedMember.idDocumentType || '—'}</p></div>
                      <div className="min-w-0"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Size</label><p className="mt-1 break-words text-sm font-medium text-gray-900">{selectedMember.idDocumentSize ? `${selectedMember.idDocumentSize} bytes` : '—'}</p></div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-50 border border-purple-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-purple-900 mb-4 pb-3 border-b-2 border-purple-300">Personal Information</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First Name</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.firstName || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Middle Name</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.middleName || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Name</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.lastName || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Birthday</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.birthday || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Age</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.age || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gender</label>
                        <p className="text-sm font-medium text-gray-900 mt-1 capitalize">{selectedMember.profile.gender || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Civil Status</label>
                        <p className="text-sm font-medium text-gray-900 mt-1 capitalize">{selectedMember.profile.civilStatus || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Education</label>
                        <p className="text-sm font-medium text-gray-900 mt-1 capitalize">{selectedMember.profile.highestEducation || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Contact & ID Card */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-50 border border-orange-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-orange-900 mb-4 pb-3 border-b-2 border-orange-300">Contact & Identification</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CP No.</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.cpNo || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ID Type</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.idType || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ID Number</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.idNo || '—'}</p>
                      </div>
                      <div className="md:col-span-4 bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Permanent Address</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.permanentAddress || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Location Card */}
                  <div className="bg-gradient-to-br from-green-50 to-green-50 border border-green-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-green-900 mb-4 pb-3 border-b-2 border-green-300">Location & Farm Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Barangay</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.barangay || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Municipality</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.municipality || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Province</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.province || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">RSBSA No.</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.rsbsaNo || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Livelihood</label>
                        <p className="text-sm font-medium text-gray-900 mt-1 capitalize">{selectedMember.profile.livelihood || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Farm Area (ha)</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.farmArea || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Corn Area (ha)</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.cornArea || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Palay Area (ha)</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.palayArea || '—'}</p>
                      </div>
                      <div className="md:col-span-5 bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Yearly Income</label>
                        <p className="text-sm font-medium text-green-600 font-bold mt-1">₱{selectedMember.profile.yearlyIncome ? parseInt(selectedMember.profile.yearlyIncome).toLocaleString() : '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Family Information Card */}
                  <div className="bg-gradient-to-br from-pink-50 to-pink-50 border border-pink-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-pink-900 mb-4 pb-3 border-b-2 border-pink-300">Family Information</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spouse Name</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.spouseName || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spouse Age</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.spouseAge || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spouse Contact</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.spouseContact || '—'}</p>
                      </div>
                      <div className="bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Children</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.children || '—'}</p>
                      </div>
                      <div className="md:col-span-4 bg-white p-3 rounded-lg">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Emergency Contact</label>
                        <p className="text-sm font-medium text-gray-900 mt-1">{selectedMember.profile.emergencyContact || '—'}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

            </div>

            {/* Footer */}
            <div className="sticky bottom-0 p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareContributionModal && selectedMember && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-5"><div><h2 className="text-xl font-bold text-gray-900">Add Share Contribution</h2><p className="mt-1 text-sm text-gray-600">{selectedMember.name}</p></div><button type="button" onClick={() => setShowShareContributionModal(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close contribution form"><X className="h-5 w-5" /></button></div>
            <form onSubmit={handleAddShareContribution} className="space-y-4 p-5">
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Remaining share limit: <strong>₱{(selectedMember.shareDetails?.remaining || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
              <label className="block text-sm font-medium text-gray-700">Contribution Amount<input required type="number" min="0.01" max={selectedMember.shareDetails?.remaining || 0} step="0.01" value={shareContributionForm.amount} onChange={(event) => setShareContributionForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium text-gray-700">Contribution Date<input required type="date" value={shareContributionForm.contributionDate} onChange={(event) => setShareContributionForm((current) => ({ ...current, contributionDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium text-gray-700">Notes<textarea value={shareContributionForm.notes} onChange={(event) => setShareContributionForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" rows={3} /></label>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4"><button type="button" onClick={() => setShowShareContributionModal(false)} className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200">Cancel</button><button type="submit" className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700">Save Contribution</button></div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddMemberModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleDraftSubmit}
          isSubmitting={false}
        />
      )}

      {/* Edit Member Modal */}
      {showEditModal && editingMember && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 border-b border-blue-800">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Edit Member</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-2 hover:bg-blue-500 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <form id="editMemberForm" onSubmit={handleUpdateMember}>
              <div className="p-6 space-y-6">
                  {/* Account Information Card */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-50 border border-blue-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-blue-900 mb-4 pb-3 border-b-2 border-blue-300">Account Information</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="md:col-span-3">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Full Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-1"
                          placeholder="Full name"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email *</label>
                        <input
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-1"
                          placeholder="email@example.com"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone *</label>
                        <input
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={(e) => { setFormData({ ...formData, phone: e.target.value }); setFillout({ ...fillout, cpNo: e.target.value }); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-1"
                          placeholder="+63 XXX XXX XXXX"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Share Capital *</label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="100"
                          value={formData.shareCapital}
                          onChange={(e) => setFormData({ ...formData, shareCapital: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-1"
                          placeholder="0"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Address *</label>
                        <textarea
                          required
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-1"
                          rows={2}
                          placeholder="Complete address"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Personal Information Card */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-50 border border-purple-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-purple-900 mb-4 pb-3 border-b-2 border-purple-300">Personal Information</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">First Name</label>
                        <input
                          type="text"
                          value={fillout.firstName}
                          onChange={(e) => setFillout({ ...fillout, firstName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="First name"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Middle Name</label>
                        <input
                          type="text"
                          value={fillout.middleName}
                          onChange={(e) => setFillout({ ...fillout, middleName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Middle name"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Name</label>
                        <input
                          type="text"
                          value={fillout.lastName}
                          onChange={(e) => setFillout({ ...fillout, lastName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Last name"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Birthday</label>
                        <input
                          type="date"
                          value={fillout.birthday}
                          onChange={(e) => setFillout({ ...fillout, birthday: e.target.value, age: calculateAge(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Age</label>
                        <input
                          type="number"
                          readOnly
                          value={fillout.age}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Age"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gender</label>
                        <select
                          value={fillout.gender}
                          onChange={(e) => setFillout({ ...fillout, gender: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                        >
                          <option value="">Select</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Civil Status</label>
                        <select
                          value={fillout.civilStatus}
                          onChange={(e) => setFillout({ ...fillout, civilStatus: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                        >
                          <option value="">Select</option>
                          <option value="single">Single</option>
                          <option value="married">Married</option>
                          <option value="divorced">Divorced</option>
                          <option value="widowed">Widowed</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Education</label>
                        <select
                          value={fillout.highestEducation}
                          onChange={(e) => setFillout({ ...fillout, highestEducation: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                        >
                          <option value="">Select</option>
                          <option value="elementary">Elementary</option>
                          <option value="highschool">High School</option>
                          <option value="vocational">Vocational</option>
                          <option value="college">College</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Contact & ID Card */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-50 border border-orange-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-orange-900 mb-4 pb-3 border-b-2 border-orange-300">Contact & Identification</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">CP No.</label>
                        <input
                          type="text"
                          value={fillout.cpNo}
                          onChange={(e) => { setFillout({ ...fillout, cpNo: e.target.value }); setFormData({ ...formData, phone: e.target.value }); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Contact number"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ID Type</label>
                        <input
                          type="text"
                          value={fillout.idType}
                          onChange={(e) => setFillout({ ...fillout, idType: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="e.g., Driver's License"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ID Number</label>
                        <input
                          type="text"
                          value={fillout.idNo}
                          onChange={(e) => setFillout({ ...fillout, idNo: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="ID number"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Permanent Address</label>
                        <textarea
                          value={fillout.permanentAddress}
                          onChange={(e) => setFillout({ ...fillout, permanentAddress: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          rows={2}
                          placeholder="Sito/Street, Barangay, Municipality, Province"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Location & Farm Card */}
                  <div className="bg-gradient-to-br from-green-50 to-green-50 border border-green-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-green-900 mb-4 pb-3 border-b-2 border-green-300">Location & Farm Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Barangay</label>
                        <input
                          type="text"
                          value={fillout.barangay}
                          onChange={(e) => setFillout({ ...fillout, barangay: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Barangay"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Municipality</label>
                        <input
                          type="text"
                          value={fillout.municipality}
                          onChange={(e) => setFillout({ ...fillout, municipality: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Municipality"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Province</label>
                        <input
                          type="text"
                          value={fillout.province}
                          onChange={(e) => setFillout({ ...fillout, province: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Province"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">RSBSA No.</label>
                        <input
                          type="text"
                          value={fillout.rsbsaNo}
                          onChange={(e) => setFillout({ ...fillout, rsbsaNo: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="RSBSA number"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Livelihood</label>
                        <input
                          type="text"
                          value={fillout.livelihood}
                          onChange={(e) => setFillout({ ...fillout, livelihood: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="e.g., Farmer"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Farm Area (ha)</label>
                        <input
                          type="text"
                          value={fillout.farmArea}
                          onChange={(e) => setFillout({ ...fillout, farmArea: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="in hectares"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Corn Area (ha)</label>
                        <input
                          type="text"
                          value={fillout.cornArea}
                          onChange={(e) => setFillout({ ...fillout, cornArea: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="in hectares"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Palay Area (ha)</label>
                        <input
                          type="text"
                          value={fillout.palayArea}
                          onChange={(e) => setFillout({ ...fillout, palayArea: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="in hectares"
                        />
                      </div>
                      <div className="md:col-span-5">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Yearly Income</label>
                        <input
                          type="number"
                          min="0"
                          value={fillout.yearlyIncome}
                          onChange={(e) => setFillout({ ...fillout, yearlyIncome: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="e.g., 100000"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Family Information Card */}
                  <div className="bg-gradient-to-br from-pink-50 to-pink-50 border border-pink-200 rounded-lg p-5">
                    <h3 className="text-lg font-bold text-pink-900 mb-4 pb-3 border-b-2 border-pink-300">Family Information</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spouse Name</label>
                        <input
                          type="text"
                          value={fillout.spouseName}
                          onChange={(e) => setFillout({ ...fillout, spouseName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Spouse name"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spouse Age</label>
                        <input
                          type="number"
                          value={fillout.spouseAge}
                          onChange={(e) => setFillout({ ...fillout, spouseAge: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Age"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spouse Contact</label>
                        <input
                          type="text"
                          value={fillout.spouseContact}
                          onChange={(e) => setFillout({ ...fillout, spouseContact: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Contact number"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Children</label>
                        <input
                          type="text"
                          value={fillout.children}
                          onChange={(e) => setFillout({ ...fillout, children: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="e.g., Ana - 18, Carlos - 15"
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Emergency Contact</label>
                        <input
                          type="text"
                          value={fillout.emergencyContact}
                          onChange={(e) => setFillout({ ...fillout, emergencyContact: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-1"
                          placeholder="Name / contact"
                        />
                      </div>
                    </div>
                  </div>
              </div>
            </form>
            {/* Footer */}
            <div className="sticky bottom-0 p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="editMemberForm"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition"
              >
                Update Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && memberToArchive && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Archive Member</h2>
              <p className="text-gray-600 mb-4">
                Are you sure you want to archive this member?
              </p>
              <p className="text-sm text-gray-500">Archived members will no longer appear in the active Associates list, but their records and transaction history will be preserved.</p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmArchive()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Archive Member
              </button>
            </div>
          </div>
        </div>
      )}

      {showRestoreConfirm && memberToRestore && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Restore Member</h2>
              <p className="text-gray-600">Are you sure you want to restore this member?</p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowRestoreConfirm(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={() => void confirmRestore()} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">Restore Member</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
