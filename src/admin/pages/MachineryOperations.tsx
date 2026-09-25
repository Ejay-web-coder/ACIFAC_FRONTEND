import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Plus, Calendar, Check, X, ClipboardList, Download, FileText, Printer, Tractor, PhilippinePeso } from 'lucide-react';
import { StatCard } from '../../app/components/common/UiKit';
import { UserRole } from '../../app/App';
import { toast } from 'sonner';
import { completeMachineryOperation, createRentalRequest, fetchAdminMachinery, reviewRentalRequest, searchMembers, updateMachineryRequest, type Machinery, type MachineryOperation, type RentalRequest, type MemberSuggestion } from '../../app/services/authApi';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';
import { escapeHtml } from '../../utils/html';
import { useLiveRefresh } from '../../lib/liveUpdates';

interface MachineryOperationsProps {
  userRole: UserRole;
}

export function MachineryOperations({ userRole }: MachineryOperationsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportMonth, setReportMonth] = useState(dateOnlyToday().slice(0, 7));
  const [rentalRequests, setRentalRequests] = useState<RentalRequest[]>([]);
  const [operations, setOperations] = useState<MachineryOperation[]>([]);
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [ongoingOperations, setOngoingOperations] = useState(0);
  const [memberSuggestions, setMemberSuggestions] = useState<MemberSuggestion[]>([]);
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const memberSearchRequest = useRef(0);
  const memberSuggestionRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    machineryId: '',
    memberName: '',
    memberId: '',
    purpose: '',
    startDate: '',
    endDate: '',
    duration: 0,
    rentalFee: 0
  });

  const filteredOperations = operations.filter(op =>
    op.memberName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.machineryName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const reportOperations = operations.filter((operation) => operation.startDate.slice(0, 7) === reportMonth);
  const reportRevenue = reportOperations.reduce((sum, operation) => sum + operation.rentalFee, 0);
  const reportMonthLabel = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long' }).format(new Date(`${reportMonth}-01T00:00:00+08:00`));

  const totalOperations = operations.length;
  const totalRevenue = operations.reduce((sum, op) => sum + op.rentalFee, 0);

  const canEdit = userRole === 'admin';

  const escapeCsvValue = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

  const downloadReport = () => {
    const rows = [
      ['Operation ID', 'Machinery', 'Member', 'Member ID', 'Purpose', 'Start Date', 'End Date', 'Duration (days)', 'Rental Fee', 'Status'],
      ...reportOperations.map((operation) => [
        operation.id,
        operation.machineryName,
        operation.memberName,
        operation.memberId,
        operation.purpose,
        formatDate(operation.startDate),
        formatDate(operation.endDate),
        operation.duration,
        operation.rentalFee.toFixed(2),
        operation.status,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `machinery-report-${reportMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Machinery report downloaded.');
  };

  const printReport = () => {
    // 'noopener' makes window.open return null, so the report window is opened
    // normally and detached from this page afterwards.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Unable to open the print window. Please allow pop-ups and try again.');
      return;
    }
    printWindow.opener = null;
    const tableRows = reportOperations.map((operation) => `<tr><td>${operation.id}</td><td>${escapeHtml(operation.machineryName)}</td><td>${escapeHtml(operation.memberName)}</td><td>${formatDate(operation.startDate)}</td><td>${formatDate(operation.endDate)}</td><td>${operation.duration}</td><td>₱${operation.rentalFee.toLocaleString()}</td><td>${operation.status}</td></tr>`).join('');
    printWindow.document.write(`<html><head><title>Machinery Operations Report - ${reportMonthLabel}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{margin-bottom:4px}p{color:#555}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:12px}th{background:#f3f4f6}.summary{font-weight:bold;margin-top:16px}</style></head><body><h1>Machinery Operations Report</h1><p>${reportMonthLabel}</p><p class="summary">${reportOperations.length} operation(s) · ₱${reportRevenue.toLocaleString()} total revenue</p><table><thead><tr><th>Operation</th><th>Machinery</th><th>Member</th><th>Start</th><th>End</th><th>Days</th><th>Rental Fee</th><th>Status</th></tr></thead><tbody>${tableRows || '<tr><td colspan="8">No operations found for this month.</td></tr>'}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

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

  const completeOperation = async (id: number) => {
    try {
      await completeMachineryOperation(id);
      await loadData();
      toast.success('Operation marked completed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update operation.');
    }
  };

  const toggleMaintenance = async (machine: Machinery) => {
    try {
      await updateMachineryRequest(machine.id, { status: machine.status === 'maintenance' ? 'available' : 'maintenance' });
      await loadData();
      toast.success(machine.status === 'maintenance' ? `${machine.name} is available again` : `${machine.name} set to maintenance`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update machinery.');
    }
  };

  useEffect(() => {
    const search = formData.memberName.trim() || formData.memberId.trim();
    if (!showForm || !search || selectedMemberId !== null) {
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
  }, [formData.memberName, formData.memberId, selectedMemberId, showForm]);

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
      await loadData();
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
      ...(name !== 'memberName' && name !== 'memberId' ? { [name]: name === 'duration' || name === 'rentalFee' ? Number(value) : value } : {})
    }));
    if (name === 'memberName' || name === 'memberId') setShowMemberSuggestions(true);
  };

  const selectMember = (member: MemberSuggestion) => {
    setFormData(prev => ({ ...prev, memberName: member.full_name, memberId: member.member_number || String(member.id) }));
    setSelectedMemberId(member.id);
    setMemberSuggestions([]);
    setShowMemberSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) {
      toast.error('Select a member from the suggestions before creating a rental.');
      return;
    }
    try {
      await createRentalRequest({ machineryId: formData.machineryId, memberDatabaseId: selectedMemberId, purpose: formData.purpose, startDate: formData.startDate, endDate: formData.endDate, notes: '' });
      await loadData();
      toast.success('Rental request created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create rental.');
      return;
    }
    setFormData({
      machineryId: '',
      memberName: '',
      memberId: '',
      purpose: '',
      startDate: '',
      endDate: '',
      duration: 0,
      rentalFee: 0
    });
    setSelectedMemberId(null);
    setMemberSuggestions([]);
    setShowMemberSuggestions(false);
    setShowForm(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">Track farm equipment and rental operations</p>
        <div className={`grid gap-2 sm:flex ${canEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <FileText className="h-4 w-4" />
            Report
          </button>
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
                <h2 className="font-bold text-gray-900">Rental Requests from Members</h2>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">{rentalRequests.filter(request => request.status === 'pending').length} pending</span>
              </div>
              <p className="text-sm text-gray-600">Review booking requests submitted from the member portal.</p>
            </div>
          </div>
          {rentalRequests.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {rentalRequests.map(request => (
              <div key={request.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{request.machineryName}</h3>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : request.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{request.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{request.memberName} · {request.memberId} · {request.purpose}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDate(request.startDate)} to {formatDate(request.endDate)} · {request.duration} day(s) · ₱{request.rentalFee.toLocaleString()}</p>
                  {request.notes && <p className="mt-1 text-xs text-gray-500">Note: {request.notes}</p>}
                </div>
                {request.status === 'pending' && <div className="flex shrink-0 gap-2"><button type="button" onClick={() => updateRequestStatus(request.id, 'approved')} className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"><Check className="h-4 w-4" />Approve</button><button type="button" onClick={() => updateRequestStatus(request.id, 'declined')} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"><X className="h-4 w-4" />Decline</button></div>}
              </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">No rental requests yet</p>
              <p className="mt-1 text-sm text-gray-500">Member booking requests will appear here for review.</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Machinery Fleet</h2>
          <p className="mt-1 text-sm text-gray-600">Availability updates automatically from approved rentals.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {machinery.map((machine) => (
            <div key={machine.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{machine.name}</p>
                  <p className="text-xs text-gray-500">{machine.id} · {machine.type}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${machine.status === 'available' ? 'bg-green-100 text-green-800' : machine.status === 'in-use' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{machine.status}</span>
              </div>
              <p className="mt-2 text-sm text-gray-700">₱{machine.dailyFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })} / day</p>
              {machine.nextMaintenance && <p className="text-xs text-gray-500">Next maintenance: {formatDate(machine.nextMaintenance)}</p>}
              {canEdit && machine.status !== 'in-use' && (
                <button type="button" onClick={() => void toggleMaintenance(machine)} className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800">
                  {machine.status === 'maintenance' ? 'Mark available' : 'Set to maintenance'}
                </button>
              )}
            </div>
          ))}
          {machinery.length === 0 && <p className="text-sm text-gray-500">No machinery recorded.</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search operations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            {filteredOperations.map((operation) => (
              <div key={operation.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-gray-900">{operation.machineryName}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        operation.status === 'ongoing' ? 'bg-blue-100 text-blue-800' :
                        operation.status === 'completed' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {operation.status}
                      </span>
                      {canEdit && operation.status === 'ongoing' && (
                        <button type="button" onClick={() => void completeOperation(operation.id)} className="rounded-lg border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50">Mark completed</button>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">Operation ID: {operation.id}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">Member</p>
                        <p className="text-sm font-medium text-gray-900">{operation.memberName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Purpose</p>
                        <p className="text-sm font-medium text-gray-900">{operation.purpose}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Duration</p>
                        <p className="text-sm font-medium text-gray-900">{operation.duration} days</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Rental Fee</p>
                        <p className="text-sm font-medium text-gray-900">₱{operation.rentalFee.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
                      <span>From: {formatDate(operation.startDate)}</span>
                      <span>To: {formatDate(operation.endDate)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showReport && (
        <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white p-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Machinery Operations Report</h2>
                <p className="mt-1 text-sm text-gray-600">{reportMonthLabel}</p>
              </div>
              <button onClick={() => setShowReport(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close report">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Filter by month
                  <input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} className="mt-1 block rounded-xl border border-gray-300 px-3 py-2" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={downloadReport} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                    <Download className="h-4 w-4" /> Download CSV
                  </button>
                  <button onClick={printReport} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <Printer className="h-4 w-4" /> Print
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4"><p className="text-sm text-gray-500">Operations</p><p className="mt-1 text-2xl font-bold text-gray-900">{reportOperations.length}</p></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4"><p className="text-sm text-gray-500">Total Days</p><p className="mt-1 text-2xl font-bold text-gray-900">{reportOperations.reduce((sum, operation) => sum + operation.duration, 0)}</p></div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4"><p className="text-sm text-gray-500">Rental Revenue</p><p className="mt-1 text-2xl font-bold text-green-700">₱{reportRevenue.toLocaleString()}</p></div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left font-semibold text-gray-600">Operation</th><th className="px-4 py-3 text-left font-semibold text-gray-600">Machinery</th><th className="px-4 py-3 text-left font-semibold text-gray-600">Member</th><th className="px-4 py-3 text-left font-semibold text-gray-600">Schedule</th><th className="px-4 py-3 text-left font-semibold text-gray-600">Fee</th><th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {reportOperations.map((operation) => <tr key={operation.id}><td className="px-4 py-3">{operation.id}</td><td className="px-4 py-3">{operation.machineryName}</td><td className="px-4 py-3">{operation.memberName}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(operation.startDate)} to {formatDate(operation.endDate)}</td><td className="px-4 py-3">₱{operation.rentalFee.toLocaleString()}</td><td className="px-4 py-3 capitalize">{operation.status}</td></tr>)}
                    {reportOperations.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">No operations found for this month.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    {machinery.map(m => (
                      <option key={m.id} value={m.id} disabled={m.status === 'maintenance'}>
                        {m.name} — ₱{m.dailyFee.toLocaleString('en-PH')}/day{m.status === 'maintenance' ? ' (maintenance)' : m.status === 'in-use' ? ' (in use)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (days)
                  </label>
                  <input
                    type="number"
                    name="duration"
                    value={formData.duration}
                    onChange={handleFormChange}
                    required
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rental Fee (₱)
                  </label>
                  <input
                    type="number"
                    name="rentalFee"
                    value={formData.rentalFee}
                    onChange={handleFormChange}
                    required
                    min="0"
                    step="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600"
                    placeholder="0"
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
