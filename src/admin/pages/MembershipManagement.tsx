import { useMemo, useEffect, useState } from 'react';
import { Search, Plus, Edit, Archive, RotateCcw, Eye, X, Users, UserPlus, PiggyBank, ChevronDown } from 'lucide-react';
import { EmptyState, ListSkeleton, Pagination, StatCard, StatusBadge } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { UserRole } from '../../app/App';
import { toast } from 'sonner';
import { AddMemberModal, draftFromMember, MemberForm, MemberFormModal, useSavedMemberFiles, type MemberDraftData, type MemberFormFiles } from '../components/AddMemberModal';
import { MemberImportModal } from '../components/MemberImportModal';
import { openProtectedFile, errorMessage } from '../../lib/api';
import { fetchProtectedImage } from '../../lib/profilePhoto';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { memberDocumentPath, addShareContributionRequest, archiveMemberRequest, createMemberRequest, fetchArchivedMembers, fetchMemberRequest, fetchMemberStatistics, fetchMembers, replaceMemberDocumentsRequest, restoreMemberRequest, updateMemberRequest } from '../services/membersApi';
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
  hasIdDocument?: boolean;
  /** Specimen signatures taken with Add Member (0 to 3). */
  signatureCount?: number;
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
    suffix?: string;
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
    motherMaidenName?: string;
    motherLastName?: string;
    motherFirstName?: string;
    motherMiddleName?: string;
    childrenList?: Array<{ name: string; age: string }>;
    incomeSources?: Array<{ source: string; amount: string }>;
    membershipType?: string;
    separationDate?: string;
    bodResolution?: string;
    membershipFee?: string;
    dateReceived?: string;
    preMembershipSeminar?: string;
    paymentOfMembershipFee?: string;
    orNumber?: string;
    initialPaidUpCapital?: string;
    seminarOrNumber?: string;
    seminarCertifiedBy?: string;
    feeCertifiedBy?: string;
    capitalOrNumber?: string;
    capitalCertifiedBy?: string;
  };
}

interface MembershipManagementProps {
  userRole: UserRole;
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
  const [memberPicture, setMemberPicture] = useState<string | null>(null);
  const [showShareContributionModal, setShowShareContributionModal] = useState(false);
  const [shareContributionForm, setShareContributionForm] = useState({ amount: '', contributionDate: dateOnlyToday(), notes: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [memberToArchive, setMemberToArchive] = useState<Member | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [memberToRestore, setMemberToRestore] = useState<Member | null>(null);
  const [showArchivedMembers, setShowArchivedMembers] = useState(false);
  // Edit and View show the Add Member form; these fill it from the saved member.
  const viewDraft = useMemo(() => (selectedMember ? draftFromMember(selectedMember) : null), [selectedMember]);
  const editDraft = useMemo(() => (editingMember ? draftFromMember(editingMember) : null), [editingMember]);
  const viewSaved = useSavedMemberFiles(showModal ? selectedMember : null, fetchProtectedImage);
  const editSaved = useSavedMemberFiles(showEditModal ? editingMember : null, fetchProtectedImage);
  const savedFilesOf = (member: Member | null, loaded: typeof viewSaved) => ({
    ...loaded,
    idDocumentName: member?.idDocumentName || (member?.hasIdDocument ? 'Valid ID on file' : null),
    onOpenIdDocument: member?.hasIdDocument
      ? () => { void openProtectedFile(memberDocumentPath(member.id, 'id-document')).catch((error) => toast.error(errorMessage(error, 'Unable to open document.'))); }
      : undefined,
  });
  const viewFiles = savedFilesOf(selectedMember, viewSaved);
  const editFiles = savedFilesOf(editingMember, editSaved);

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

  // Another admin's changes (new members, archive/restore, contributions) appear without reloading.
  useLiveRefresh(['members', 'share_contributions'], () => { void loadMembers(); }, 800);

  const filteredMembers = showArchivedMembers ? archivedMembers : members;
  const memberPages = usePagination(filteredMembers, { resetKey: `${searchTerm}|${showArchivedMembers}` });

  const canEdit = userRole === 'admin';

  const handleAddShareContribution = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMember) return;
    try {
      const amount = Number(shareContributionForm.amount);
      const response = await addShareContributionRequest(selectedMember.id, { amount, contributionDate: shareContributionForm.contributionDate, notes: shareContributionForm.notes });
      setSelectedMember((current) => current ? { ...current, shareCapital: response.data.total, shareDetails: response.data } : current);
      void loadMembers();
      setShareContributionForm({ amount: '', contributionDate: dateOnlyToday(), notes: '' });
      setShowShareContributionModal(false);
      toast.success('Share contribution recorded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to record share contribution.');
    }
  };

  const buildDraftPayload = (draft: MemberDraftData) => {
    const cleanedFullName = draft.fullName.trim();
    const nameParts = cleanedFullName ? cleanedFullName.split(/\s+/) : [];
    const firstName = draft.firstName || nameParts[0] || '';
    const middleName = draft.middleName || '';
    const lastName = draft.lastName || nameParts.slice(1).join(' ') || '';
    const effectiveIdType = draft.idType === 'Other' ? (draft.idTypeOther || 'Other') : draft.idType;
    const childrenText = draft.children.filter((child) => child.name.trim()).map((child) => `${child.name.trim()} (${child.age || 'Age not provided'})`).join('; ');
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
      id_document_name: null,
      additional_info: {
        motherMaidenName: draft.motherMaidenName, motherLastName: draft.motherLastName,
        motherFirstName: draft.motherFirstName, motherMiddleName: draft.motherMiddleName,
        children: draft.children.filter((child) => child.name.trim() || child.age.trim()).map(({ name, age }) => ({ name, age })),
        incomeSources: draft.incomeSources.filter((row) => row.source.trim() || row.amount.trim()).map(({ source, amount }) => ({ source, amount })),
        membershipType: draft.membershipType, separationDate: draft.separationDate, bodResolution: draft.bodResolution,
        membershipFee: draft.membershipFee, dateReceived: draft.dateReceived, preMembershipSeminar: draft.preMembershipSeminar,
        paymentOfMembershipFee: draft.paymentOfMembershipFee, orNumber: draft.orNumber, initialPaidUpCapital: draft.initialPaidUpCapital,
        seminarOrNumber: draft.seminarOrNumber, seminarCertifiedBy: draft.seminarCertifiedBy, feeCertifiedBy: draft.feeCertifiedBy,
        capitalOrNumber: draft.capitalOrNumber, capitalCertifiedBy: draft.capitalCertifiedBy,
      },
    };
  };

  const [savingDraft, setSavingDraft] = useState(false);
  const handleDraftSubmit = async (draft: MemberDraftData, photoFile: File | null, idDocumentFile: File | null, signatureFiles: File[]) => {
    const payload = buildDraftPayload(draft);
    setSavingDraft(true);
    try {
      const { data: newMember } = await createMemberRequest(payload, idDocumentFile, photoFile, signatureFiles);
      setMembers((current) => [newMember, ...current]);
      void loadMembers();
      setShowAddModal(false);
      toast.success('Member added successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to add member.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleEditMember = async (member: Member) => {
    try {
      const { data } = await fetchMemberRequest(member.id);
      setEditingMember(data);
      setShowEditModal(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load member.');
    }
  };

  const viewMember = async (member: Member) => {
    try {
      const { data } = await fetchMemberRequest(member.id);
      setSelectedMember(data);
      setShowModal(true);
      // The member's own picture, else their 2x2 photo (admins only).
      setMemberPicture((current) => { if (current) URL.revokeObjectURL(current); return null; });
      void fetchProtectedImage(`/api/members/${member.id}/documents/avatar`).then(setMemberPicture).catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load member.');
    }
  };

  const [savingEdit, setSavingEdit] = useState(false);
  const handleUpdateMember = async (draft: MemberDraftData, files: MemberFormFiles) => {
    if (!editingMember) return;
    const profile = editingMember.profile || {};
    setSavingEdit(true);
    try {
      await updateMemberRequest(editingMember.id, {
        ...buildDraftPayload(draft),
        // Kept as they are: status, and details the paper form does not show.
        status: editingMember.status,
        suffix: profile.suffix || null,
        corn_area_ha: profile.cornArea || null,
        palay_area_ha: profile.palayArea || null,
        emergency_contact: profile.emergencyContact || null,
      });
      if (files.photo || files.idDocument || files.signatures.some(Boolean)) {
        await replaceMemberDocumentsRequest(editingMember.id, files);
      }
      void loadMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update member.');
      return;
    } finally {
      setSavingEdit(false);
    }
    setShowEditModal(false);
    setEditingMember(null);
    toast.success('Member updated successfully!', {
      description: `${draft.fullName}'s information has been updated`
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
        void loadMembers();
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
        void loadMembers();
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">{showArchivedMembers ? 'Archived associates can be reviewed and restored.' : 'Manage cooperative members and registrations'}</p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            type="button"
            onClick={() => setShowArchivedMembers((current) => !current)}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 ${canEdit && !showArchivedMembers ? '' : 'col-span-2'}`}
          >
            {showArchivedMembers ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            <span className="sm:hidden">{showArchivedMembers ? 'Back' : 'Archived'}</span>
            <span className="hidden sm:inline">{showArchivedMembers ? 'Back to Associates' : 'Archived Members'}</span>
          </button>
          {canEdit && !showArchivedMembers && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
            >
              <Plus className="h-4 w-4" />
              Add Member
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <StatCard label="Total Members" value={statistics.totalMembers.toLocaleString('en-PH')} icon={Users} tone="dark" loading={isLoading && statistics.totalMembers === 0} />
        <StatCard label="Total Share Capital" value={`₱${statistics.totalShareCapital.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} icon={PiggyBank} loading={isLoading && statistics.totalMembers === 0} />
        <div className="col-span-2 md:col-span-1">
          <StatCard label={showArchivedMembers ? 'Archived Members' : 'New This Month'} value={showArchivedMembers ? statistics.archivedMembers : statistics.newThisMonth} icon={showArchivedMembers ? Archive : UserPlus} tone="soft" loading={isLoading && statistics.totalMembers === 0} />
        </div>
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
        <label className="relative block">
          <span className="sr-only">Search members</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder={showArchivedMembers ? 'Search archived members...' : 'Search by name or member ID...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-4 text-sm"
          />
        </label>
      </div>

      {/* Members list */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-gray-900">{showArchivedMembers ? 'Archived Members' : 'Associates'}</h2>
          {!isLoading && !loadError && <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800 ring-1 ring-green-200">{filteredMembers.length} shown</span>}
        </div>

        {isLoading && <ListSkeleton rows={5} />}
        {!isLoading && loadError && (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="text-sm text-red-700">Unable to load members. Please try again.</p>
            <button type="button" onClick={() => void loadMembers()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"><RotateCcw className="h-4 w-4" />Retry</button>
          </div>
        )}
        {!isLoading && !loadError && filteredMembers.length === 0 && (
          <EmptyState icon={Users} title={searchTerm ? 'No members match your search' : showArchivedMembers ? 'No archived members' : 'No members yet'} message={searchTerm ? 'Try a different name or member ID.' : showArchivedMembers ? 'Members you archive will be listed here.' : 'Registered associates will appear here once added.'} />
        )}

        {!isLoading && !loadError && filteredMembers.length > 0 && (
          <>
            {/* Phones and small tablets: expandable member cards */}
            <ul className="divide-y divide-gray-100 lg:hidden">
              {memberPages.pageItems.map((member) => (
                <li key={member.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800">{member.name.charAt(0).toUpperCase() || '?'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-gray-900">{member.name}</span>
                        <span className="block truncate text-sm text-gray-500">{member.memberId}</span>
                      </span>
                      <span className="hidden min-[400px]:block"><StatusBadge status={member.status} /></span>
                      <ChevronDown className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="space-y-3 bg-gray-50/70 px-4 pb-4 pt-1">
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[480px]:grid-cols-2">
                        <div className="min-w-0"><dt className="text-xs text-gray-500">Email</dt><dd className="break-all text-gray-900">{member.email || '—'}</dd></div>
                        <div className="min-w-0"><dt className="text-xs text-gray-500">Phone</dt><dd className="text-gray-900">{member.phone || '—'}</dd></div>
                        <div className="min-w-0 min-[480px]:col-span-2"><dt className="text-xs text-gray-500">Address</dt><dd className="text-gray-900">{member.address || '—'}</dd></div>
                        <div className="min-w-0"><dt className="text-xs text-gray-500">Share Capital</dt><dd className="font-semibold tabular-nums text-gray-900">₱{member.shareCapital.toLocaleString()}</dd></div>
                        <div className="min-w-0"><dt className="text-xs text-gray-500">Status</dt><dd><StatusBadge status={member.status} /></dd></div>
                        {showArchivedMembers && <div className="min-w-0"><dt className="text-xs text-gray-500">Archived Date</dt><dd className="text-gray-900">{member.archivedAt ? formatDateTime(member.archivedAt) : '—'}</dd></div>}
                      </dl>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => void viewMember(member)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700" aria-label={`View ${member.name}`}>
                          <Eye className="h-4 w-4" />View
                        </button>
                        {canEdit && !showArchivedMembers && (
                          <>
                            <button type="button" onClick={() => handleEditMember(member)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50" aria-label={`Update ${member.name}`}>
                              <Edit className="h-4 w-4" />Update
                            </button>
                            <button type="button" onClick={() => handleArchiveMember(member)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50" aria-label={`Delete ${member.name}`}>
                              <Archive className="h-4 w-4" />Archive
                            </button>
                          </>
                        )}
                        {canEdit && showArchivedMembers && (
                          <button type="button" onClick={() => handleRestoreMember(member)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-green-300 bg-white px-3 text-sm font-semibold text-green-700 hover:bg-green-50" aria-label={`Restore ${member.name}`}>
                            <RotateCcw className="h-4 w-4" />Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>

            {/* Desktops: table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr className="border-b border-gray-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Member</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Member ID</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Share Capital</th>
                    {showArchivedMembers && (
                      <>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Archived Date</th>
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                      </>
                    )}
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {memberPages.pageItems.map((member) => (
                    <tr key={member.id} className="hover:bg-green-50/40">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800">{member.name.charAt(0).toUpperCase() || '?'}</span>
                          <div className="min-w-0">
                            <div className="max-w-[16rem] truncate font-semibold text-gray-900">{member.name}</div>
                            <div className="max-w-[16rem] truncate text-gray-500">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 font-medium text-gray-900">{member.memberId}</td>
                      <td className="px-5 py-3.5">
                        <div className="whitespace-nowrap text-gray-900">{member.phone}</div>
                        <div className="max-w-[18rem] truncate text-gray-500" title={member.address}>{member.address}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums text-gray-900">₱{member.shareCapital.toLocaleString()}</td>
                      {showArchivedMembers && (
                        <>
                          <td className="whitespace-nowrap px-5 py-3.5 text-gray-900">{member.archivedAt ? formatDateTime(member.archivedAt) : '—'}</td>
                          <td className="whitespace-nowrap px-5 py-3.5"><StatusBadge status={member.status} /></td>
                        </>
                      )}
                      <td className="whitespace-nowrap px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => void viewMember(member)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-green-700 hover:bg-green-50" title="View member" aria-label={`View ${member.name}`}>
                            <Eye className="h-5 w-5" />
                          </button>
                          {canEdit && !showArchivedMembers && (
                            <>
                              <button type="button" onClick={() => handleEditMember(member)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100" title="Update member" aria-label={`Update ${member.name}`}>
                                <Edit className="h-5 w-5" />
                              </button>
                              <button type="button" onClick={() => handleArchiveMember(member)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-red-600 hover:bg-red-50" title="Archive member" aria-label={`Delete ${member.name}`}>
                                <Archive className="h-5 w-5" />
                              </button>
                            </>
                          )}
                          {canEdit && showArchivedMembers && (
                            <button type="button" onClick={() => handleRestoreMember(member)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-green-700 hover:bg-green-50" title="Restore member" aria-label={`Restore ${member.name}`}>
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
            <Pagination page={memberPages.page} totalPages={memberPages.totalPages} total={memberPages.total} pageSize={memberPages.pageSize} onPageChange={memberPages.setPage} onPageSizeChange={memberPages.setPageSize} label="members" />
          </>
        )}
      </div>

      {/* Member Details Modal */}
      {showModal && selectedMember && (
        <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-green-700 text-white p-6 border-b border-green-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {memberPicture && <img src={memberPicture} alt={`${selectedMember.name}'s picture`} className="h-16 w-16 shrink-0 rounded-full border-2 border-white/70 object-cover" />}
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
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              
              <div className="-mx-2 rounded-xl bg-slate-100 px-2 py-4 sm:mx-0 sm:px-4">
                {viewDraft && <MemberForm mode="view" initial={viewDraft} saved={viewFiles} />}
              </div>

              <div className="rounded-lg border border-green-200 bg-green-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-green-200 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-green-900">Share Details</h3>
                    <p className="mt-1 text-sm text-green-800">Installment contributions toward the ₱20,000 maximum.</p>
                  </div>
                  {canEdit && <button type="button" onClick={() => setShowShareContributionModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"><Plus className="h-4 w-4" />Add Contribution</button>}
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
                    <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-green-100 bg-white">
                      <table className="min-w-full text-sm"><thead className="sticky top-0 bg-green-100"><tr><th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Amount</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Payment Method</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Reference</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Recorded By</th></tr></thead><tbody className="divide-y divide-gray-100">{selectedMember.shareDetails.contributions.map((contribution) => <tr key={contribution.id}><td className="px-3 py-2 whitespace-nowrap">{formatDate(contribution.contributionDate)}</td><td className="px-3 py-2 font-medium text-green-700">₱{contribution.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td><td className="px-3 py-2">{contribution.paymentMethod || '—'}</td><td className="px-3 py-2">{contribution.referenceNumber || '—'}</td><td className="px-3 py-2">{contribution.recordedByName || '—'}</td></tr>)}{selectedMember.shareDetails.contributions.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">No share contributions recorded.</td></tr>}</tbody></table>
                    </div>
                  </>
                ) : <p className="mt-4 text-sm text-gray-500">Share contribution history is unavailable.</p>}
              </div>

            </div>

            {/* Footer */}
            <div className="sticky bottom-0 p-6 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              {canEdit && selectedMember.status !== 'archived' && (
                <button
                  type="button"
                  onClick={() => { setShowModal(false); void handleEditMember(selectedMember); }}
                  className="inline-flex items-center gap-2 px-6 py-2 border border-green-600 text-green-700 rounded-xl hover:bg-green-50 transition font-semibold"
                >
                  <Edit className="h-4 w-4" /> Edit
                </button>
              )}
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareContributionModal && selectedMember && (
        <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-5"><div><h2 className="text-xl font-bold text-gray-900">Add Share Contribution</h2><p className="mt-1 text-sm text-gray-600">{selectedMember.name}</p></div><button type="button" onClick={() => setShowShareContributionModal(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close contribution form"><X className="h-5 w-5" /></button></div>
            <form onSubmit={handleAddShareContribution} className="space-y-4 p-5">
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Remaining share limit: <strong>₱{(selectedMember.shareDetails?.remaining || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
              <label className="block text-sm font-medium text-gray-700">Contribution Amount<input required type="number" min="0.01" max={selectedMember.shareDetails?.remaining || 0} step="0.01" value={shareContributionForm.amount} onChange={(event) => setShareContributionForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium text-gray-700">Contribution Date<input required type="date" value={shareContributionForm.contributionDate} onChange={(event) => setShareContributionForm((current) => ({ ...current, contributionDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" /></label>
              <label className="block text-sm font-medium text-gray-700">Notes<textarea value={shareContributionForm.notes} onChange={(event) => setShareContributionForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" rows={3} /></label>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4"><button type="button" onClick={() => setShowShareContributionModal(false)} className="rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200">Cancel</button><button type="submit" className="rounded-xl bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700">Save Contribution</button></div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddMemberModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleDraftSubmit}
          isSubmitting={savingDraft}
          onImport={() => { setShowAddModal(false); setShowImportModal(true); }}
        />
      )}

      {showImportModal && (
        <MemberImportModal
          onClose={() => setShowImportModal(false)}
          onImported={async (imported) => {
            toast.success(`${imported} member(s) imported.`);
            void loadMembers();
          }}
        />
      )}

      {/* Edit Member Modal: the Add Member form, filled in */}
      {showEditModal && editingMember && editDraft && (
        <MemberFormModal
          key={editingMember.id}
          mode="edit"
          title={`Edit Member — ${editingMember.memberId}`}
          initial={editDraft}
          saved={editFiles}
          onClose={() => { setShowEditModal(false); setEditingMember(null); }}
          onSubmit={handleUpdateMember}
          isSubmitting={savingEdit}
        />
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && memberToArchive && (
        <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
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
        <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Restore Member</h2>
              <p className="text-gray-600">Are you sure you want to restore this member?</p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowRestoreConfirm(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
              <button onClick={() => void confirmRestore()} className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium">Restore Member</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
