import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Plus, Calendar, Check, X, ClipboardList, Tractor, PhilippinePeso, Settings2 } from 'lucide-react';
import { Pagination, StatCard } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { UserRole } from '../../app/App';
import { toast } from 'sonner';
import { createRentalRequest, fetchAdminMachinery, reviewRentalRequest, searchMembers, updateMachineryRequest, type Machinery, type MachineryOperation, type RentalRequest, type RenterCategory, type MemberSuggestion } from '../../app/services/authApi';
import { formatDate } from '../../utils/dateTime';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { ServicesPanel } from '../components/machinery/ServicesPanel';
import { ExpensesPanel } from '../components/machinery/ExpensesPanel';
import { MachineSettingsModal } from '../components/machinery/MachineSettingsModal';
import { AddMachineModal } from '../components/machinery/AddMachineModal';
import { ConditionBadge } from '../components/machinery/shared';

interface MachineryOperationsProps {
  userRole: UserRole;
}

const TABS = [
  { id: 'rentals', label: 'Fleet & Rentals' },
  { id: 'services', label: 'Services' },
  { id: 'expenses', label: 'Expenses' },
] as const;
type TabId = typeof TABS[number]['id'];

export function MachineryOperations({ userRole }: MachineryOperationsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabId = TABS.some((entry) => entry.id === searchParams.get('tab')) ? searchParams.get('tab') as TabId : 'rentals';
  const selectTab = (id: TabId) => setSearchParams(id === 'rentals' ? {} : { tab: id }, { replace: true });
  const [settingsMachine, setSettingsMachine] = useState<Machinery | null>(null);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rentalRequests, setRentalRequests] = useState<RentalRequest[]>([]);
  const [operations, setOperations] = useState<MachineryOperation[]>([]);
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [ongoingOperations, setOngoingOperations] = useState(0);
  const [memberSuggestions, setMemberSuggestions] = useState<MemberSuggestion[]>([]);
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const memberSearchRequest = useRef(0);
  const memberSuggestionRef = useRef<HTMLDivElement>(null);
  // A rental is for a member (picked from the members, with their member ID)
  // or for a non-member, who is recorded by name only.
  const [renterType, setRenterType] = useState<RenterCategory>('member');
  const [formData, setFormData] = useState({
    machineryId: '',
    memberName: '',
    memberId: '',
    clientName: '',
    purpose: '',
    startDate: '',
    endDate: ''
  });

  const machineryPages = usePagination(machinery, { pageSize: 8 });
  // Only requests awaiting a decision are listed. Approved ones become
  // operations (in the totals); the records are kept for members' booking history.
  const pendingRequests = rentalRequests.filter((request) => request.status === 'pending');
  const requestPages = usePagination(pendingRequests, { pageSize: 5 });
  const totalOperations = operations.length;
  const totalRevenue = operations.reduce((sum, op) => sum + op.rentalFee, 0);

  const canEdit = userRole === 'admin';

  const loadData = useCallback(async () => {
    try {
      const data = await fetchAdminMachinery({ limit: 200 });
      setRentalRequests(data.requests);
      setOperations(data.operations);
      setMachinery(data.machinery);
      setOngoingOperations(data.summary.ongoingOperations);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load machinery operations.');
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useLiveRefresh(['machinery', 'rental_requests', 'machinery_operations'], () => { void loadData(); });

  const toggleMaintenance = async (machine: Machinery) => {
    try {
      await updateMachineryRequest(machine.id, { status: machine.status === 'maintenance' ? 'available' : 'maintenance' });
      void loadData();
      toast.success(machine.status === 'maintenance' ? `${machine.name} is available again` : `${machine.name} set to maintenance`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update machinery.');
    }
  };

  useEffect(() => {
    const search = formData.memberName.trim() || formData.memberId.trim();
    if (!showForm || renterType !== 'member' || !search || selectedMemberId !== null) {
      setMemberSuggestions([]);
      setShowMemberSuggestions(false);
      return;
    }
    const requestId = ++memberSearchRequest.current;
    const timeout = window.setTimeout(() => {
      searchMembers(search).then(members => {
        if (requestId !== memberSearchRequest.current) return;
        setMemberSuggestions(members);
        setShowMemberSuggestions(true);
      }).catch(error => toast.error(error instanceof Error ? error.message : 'Unable to search members.'));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [formData.memberName, formData.memberId, selectedMemberId, showForm, renterType]);

  useEffect(() => {
    const closeSuggestions = (event: MouseEvent) => {
      if (memberSuggestionRef.current && !memberSuggestionRef.current.contains(event.target as Node)) {
        setShowMemberSuggestions(false);
      }
    };
    document.addEventListener('mousedown', closeSuggestions);
    return () => document.removeEventListener('mousedown', closeSuggestions);
  }, []);

  const updateRequestStatus = async (id: number, status: RentalRequest['status']) => {
    try {
      await reviewRentalRequest(id, status as 'approved' | 'declined');
      // Leaves the pending list immediately; the reload brings the new operation.
      setRentalRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request));
      void loadData();
      toast.success(status === 'approved' ? 'Rental request approved' : 'Rental request declined');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to review rental request.');
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'memberName' || name === 'memberId') setSelectedMemberId(null);
    setFormData(prev => ({
      ...prev,
      ...(name === 'memberName' ? { memberName: value, memberId: '' } : {}),
      ...(name === 'memberId' ? { memberId: value, memberName: '' } : {}),
      ...(name !== 'memberName' && name !== 'memberId' ? { [name]: value } : {})
    }));
    if (name === 'memberName' || name === 'memberId') setShowMemberSuggestions(true);
  };

  const selectMember = (member: MemberSuggestion) => {
    setFormData(prev => ({ ...prev, memberName: member.full_name, memberId: member.member_number || String(member.id) }));
    setSelectedMemberId(member.id);
    setMemberSuggestions([]);
    setShowMemberSuggestions(false);
  };

  // Switching between member and non-member starts the renter's fields over.
  const chooseRenterType = (type: RenterCategory) => {
    setRenterType(type);
    setFormData(prev => ({ ...prev, memberName: '', memberId: '', clientName: '' }));
    setSelectedMemberId(null);
    setMemberSuggestions([]);
    setShowMemberSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientName = formData.clientName.trim();
    if (renterType === 'member' && !selectedMemberId) {
      toast.error('Select a member from the suggestions before creating a rental.');
      return;
    }
    if (renterType === 'non_member' && !clientName) {
      toast.error('Enter the non-member\'s full name.');
      return;
    }
    try {
      const rental = { machineryId: formData.machineryId, purpose: formData.purpose, startDate: formData.startDate, endDate: formData.endDate, notes: '' };
      await createRentalRequest(renterType === 'member' ? { ...rental, memberDatabaseId: selectedMemberId! } : { ...rental, clientCategory: 'non_member', clientName });
      void loadData();
      toast.success('Rental request created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create rental.');
      return;
    }
    setFormData({
      machineryId: '',
      memberName: '',
      memberId: '',
      clientName: '',
      purpose: '',
      startDate: '',
      endDate: ''
    });
    setRenterType('member');
    setSelectedMemberId(null);
    setMemberSuggestions([]);
    setShowMemberSuggestions(false);
    setShowForm(false);
  };

  // The PhilMech report moved to its own Report page.
  if (searchParams.get('tab') === 'report') return <Navigate to="/reports" replace />;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {canEdit && (
        <nav aria-label="Machinery sections" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {TABS.map((entry) => (
            <button key={entry.id} type="button" onClick={() => selectTab(entry.id)} aria-current={tab === entry.id ? 'page' : undefined}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${tab === entry.id ? 'bg-green-600 text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
              {entry.label}
            </button>
          ))}
        </nav>
      )}

      {canEdit && tab === 'services' && <ServicesPanel machinery={machinery} rentalRequests={rentalRequests} />}
      {canEdit && tab === 'expenses' && <ExpensesPanel machinery={machinery} />}

      {tab === 'rentals' && (<>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">Track farm equipment and rental operations</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            New Rental
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <StatCard label="Total Operations" value={totalOperations} icon={Calendar} tone="dark" />
        <StatCard label="Ongoing Operations" value={ongoingOperations} icon={Tractor} tone="soft" />
        <div className="col-span-2 md:col-span-1">
          <StatCard label="Total Revenue" value={`₱${totalRevenue.toLocaleString()}`} icon={PhilippinePeso} />
        </div>
      </div>

      {/* Content */}
      {canEdit && (
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] border border-gray-200">
          <div className="flex items-start gap-3 border-b border-gray-100 p-4 sm:items-center sm:p-5">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-50 ring-1 ring-green-100"><ClipboardList className="h-5 w-5 text-green-700" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-gray-900">Rental Requests</h2>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">{pendingRequests.length} pending</span>
              </div>
              <p className="text-sm text-gray-600">Review bookings from the member portal and rentals added here, for members and non-members.</p>
            </div>
          </div>
          {pendingRequests.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {requestPages.pageItems.map(request => (
              <div key={request.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{request.machineryName}</h3>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : request.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{request.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {request.memberName} · {request.clientCategory === 'non_member' ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">Non-member</span> : request.memberId} · {request.purpose}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{formatDate(request.startDate)} to {formatDate(request.endDate)} · {request.duration} day(s) · ₱{request.rentalFee.toLocaleString()}</p>
                  {request.notes && <p className="mt-1 text-xs text-gray-500">Note: {request.notes}</p>}
                </div>
                {request.status === 'pending' && <div className="flex shrink-0 gap-2"><button type="button" onClick={() => updateRequestStatus(request.id, 'approved')} className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"><Check className="h-4 w-4" />Approve</button><button type="button" onClick={() => updateRequestStatus(request.id, 'declined')} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"><X className="h-4 w-4" />Decline</button></div>}
              </div>
              ))}
              <Pagination page={requestPages.page} totalPages={requestPages.totalPages} total={requestPages.total} pageSize={requestPages.pageSize} onPageChange={requestPages.setPage} onPageSizeChange={requestPages.setPageSize} label="requests" />
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">No pending rental requests</p>
              <p className="mt-1 text-sm text-gray-500">New booking requests will appear here for review.</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] border border-gray-200">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Machinery Fleet</h2>
            <p className="mt-1 text-sm text-gray-600">Availability updates automatically from approved rentals.</p>
          </div>
          {canEdit && (
            <button type="button" onClick={() => setShowAddMachine(true)} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-green-600 px-4 text-sm font-semibold text-green-700 hover:bg-green-50">
              <Plus className="h-4 w-4" />
              Add Machine
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {machineryPages.pageItems.map((machine) => (
            <div key={machine.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{machine.name}</p>
                  <p className="text-xs text-gray-500">{machine.id} · {machine.type}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${machine.status === 'available' ? 'bg-green-100 text-green-800' : machine.status === 'in-use' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{machine.status}</span>
              </div>
              <div className="mt-2"><ConditionBadge condition={machine.condition} /></div>
              <p className="mt-2 text-sm text-gray-700">
                {machine.pricingMode === 'per_service' ? 'Per service (per ha / per 100 bags)' : `₱${machine.dailyFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })} / day`}
              </p>
              {machine.deliveryDate && <p className="text-xs text-gray-500">Delivered: {formatDate(machine.deliveryDate)}</p>}
              {machine.parentMachineryId && <p className="text-xs text-gray-500">Attached to: {machinery.find((row) => row.id === machine.parentMachineryId)?.name ?? machine.parentMachineryId}</p>}
              {machinery.some((row) => row.parentMachineryId === machine.id) && (
                <p className="text-xs text-gray-500">Implements: {machinery.filter((row) => row.parentMachineryId === machine.id).map((row) => row.name).join(', ')}</p>
              )}
              {machine.nextMaintenance && <p className="text-xs text-gray-500">Next maintenance: {formatDate(machine.nextMaintenance)}</p>}
              {canEdit && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  <button type="button" onClick={() => setSettingsMachine(machine)} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900">
                    <Settings2 className="h-3.5 w-3.5" />Details &amp; rates
                  </button>
                  {machine.status !== 'in-use' && (
                    <button type="button" onClick={() => void toggleMaintenance(machine)} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                      {machine.status === 'maintenance' ? 'Mark available' : 'Set to maintenance'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {machinery.length === 0 && <p className="text-sm text-gray-500">No machinery recorded.</p>}
        </div>
        <Pagination page={machineryPages.page} totalPages={machineryPages.totalPages} total={machineryPages.total} pageSize={machineryPages.pageSize} onPageChange={machineryPages.setPage} onPageSizeChange={machineryPages.setPageSize} label="machines" />
      </div>
      </>)}

      {settingsMachine && (
        <MachineSettingsModal machine={settingsMachine} machinery={machinery} onClose={() => setSettingsMachine(null)} onChanged={() => { void loadData(); }} />
      )}
      {showAddMachine && (
        <AddMachineModal machinery={machinery} onClose={() => setShowAddMachine(false)} onAdded={() => { setShowAddMachine(false); void loadData(); }} />
      )}

      {/* New Rental Modal Form */}
      {showForm && (
        <div className="acf-modal fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add New Rental</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <fieldset>
                <legend className="mb-1 block text-sm font-medium text-gray-700">Rented by</legend>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Rented by">
                  {([['member', 'Member', 'Needs a member ID'], ['non_member', 'Non-member', 'Name only']] as const).map(([value, label, hint]) => (
                    <button key={value} type="button" role="radio" aria-checked={renterType === value} onClick={() => chooseRenterType(value)}
                      className={`rounded-lg px-3 py-2 text-left ${renterType === value ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-gray-500">{hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renterType === 'non_member' && (
                  <div className="md:col-span-2">
                    <label htmlFor="rental-client-name" className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name
                    </label>
                    <input
                      id="rental-client-name"
                      type="text"
                      name="clientName"
                      value={formData.clientName}
                      onChange={handleFormChange}
                      required
                      maxLength={200}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                      placeholder="e.g., Juan Dela Cruz"
                    />
                    <p className="mt-1 text-xs text-gray-500">Non-members are recorded by name only, with the same daily fee.</p>
                  </div>
                )}

                {renterType === 'member' && (<>
                <div ref={memberSuggestionRef} className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Member Name
                  </label>
                  <input
                    type="text"
                    name="memberName"
                    value={formData.memberName}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                    placeholder="Enter member name"
                  />
                  {showMemberSuggestions && (formData.memberName.trim() || formData.memberId.trim()) && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {memberSuggestions.length > 0 ? memberSuggestions.map(member => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => selectMember(member)}
                          className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                        >
                          <span className="block text-sm font-medium text-gray-900">{member.full_name}</span>
                          <span className="block text-xs text-gray-500">ID: {member.member_number || member.id}</span>
                        </button>
                      )) : (
                        <p className="px-3 py-2 text-sm text-gray-500">No members found</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Member ID
                  </label>
                  <input
                    type="text"
                    name="memberId"
                    value={formData.memberId}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                    placeholder="e.g., ACIFAC-2024-001"
                  />
                </div>
                </>)}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Machinery ID
                  </label>
                  <select
                    name="machineryId"
                    value={formData.machineryId}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="">Select machinery</option>
                    {machinery.filter(m => m.pricingMode !== 'per_service').map(m => (
                      <option key={m.id} value={m.id} disabled={m.status === 'maintenance'}>
                        {m.name} — ₱{m.dailyFee.toLocaleString('en-PH')}/day{m.status === 'maintenance' ? ' (maintenance)' : m.status === 'in-use' ? ' (in use)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Purpose
                  </label>
                  <input
                    type="text"
                    name="purpose"
                    value={formData.purpose}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                    placeholder="e.g., Rice harvesting"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
                >
                  Create Rental
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
