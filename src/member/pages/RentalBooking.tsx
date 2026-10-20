import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { Pagination } from '../../app/components/common/UiKit';
import { usePagination } from '../../app/components/common/usePagination';
import { createRentalRequest, fetchMachineryCatalog, type Machinery } from '../../app/services/authApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { dateOnlyToday, formatDate } from '../../utils/dateTime';

const statusLabel: Record<Machinery['status'], string> = { available: 'Available', 'in-use': 'In use today', maintenance: 'Under maintenance' };
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
// Days as the cooperative counts them: end date - start date, at least one.
// "Oct 8–10", "Sep 30 – Oct 2" (and the year after it): one short range for the request list.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateRange(start: string, end: string) {
	const [y1, m1, d1] = start.split('-').map(Number);
	const [y2, m2, d2] = end.split('-').map(Number);
	const range = y1 !== y2 ? `${MONTHS[m1 - 1]} ${d1}, ${y1} – ${MONTHS[m2 - 1]} ${d2}`
		: m1 === m2 ? (d1 === d2 ? `${MONTHS[m1 - 1]} ${d1}` : `${MONTHS[m1 - 1]} ${d1}–${d2}`)
		: `${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}`;
	return { range, year: y2 };
}
const wholePeso = (value: number) => `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const rentalDays = (start: string, end: string) => Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000));

// Booking and the member's own requests are two tabs, so neither needs a long scroll; the tab is kept in the address (?tab=requests).
const TABS = [
	{ id: 'book', label: 'Book a rental', short: 'Book a rental' },
	{ id: 'requests', label: 'My rental requests', short: 'My requests' },
] as const;
type TabId = typeof TABS[number]['id'];

export function RentalBooking({ userRole }: { userRole: UserRole }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const tab: TabId = searchParams.get('tab') === 'requests' ? 'requests' : 'book';
	const selectTab = (id: TabId) => setSearchParams(id === 'book' ? {} : { tab: id }, { replace: true });
	const [machinery, setMachinery] = useState<Machinery[]>([]);
	const [form, setForm] = useState({ machineryId: '', startDate: '', endDate: '', purpose: '', notes: '' });
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { memberData, reload } = useMyMemberData();
	const selectedMachine = machinery.find(machine => machine.id === form.machineryId);
	const update = (field: string, value: string) => setForm(current => ({ ...current, [field]: value }));

	const loadCatalog = useCallback(() => {
		fetchMachineryCatalog().then(setMachinery).catch((error: Error) => toast.error('Unable to load machinery', { description: error.message }));
	}, []);
	useEffect(() => { loadCatalog(); }, [loadCatalog]);
	useLiveRefresh(['machinery'], loadCatalog);
	const rentals = memberData?.rentalRequests ?? [];
	const rentalPages = usePagination(rentals);

	if (userRole !== 'member') return <div className="p-8">Access restricted to members only</div>;

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!selectedMachine || !form.startDate || !form.endDate || !form.purpose.trim() || form.endDate < form.startDate || isSubmitting) return;
		setIsSubmitting(true);
		try {
			await createRentalRequest({ machineryId: selectedMachine.id, startDate: form.startDate, endDate: form.endDate, purpose: form.purpose.trim(), notes: form.notes.trim() });
			toast.success('Rental request submitted', { description: 'The cooperative will review your booking.' });
			setForm({ machineryId: '', startDate: '', endDate: '', purpose: '', notes: '' });
			reload();
			selectTab('requests');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to submit rental request.');
		} finally {
			setIsSubmitting(false);
		}
	};

	const today = dateOnlyToday();
	const days = form.startDate && form.endDate && form.endDate >= form.startDate ? rentalDays(form.startDate, form.endDate) : null;
	const inputClass = 'mt-2 w-full rounded-xl border border-gray-300 px-3 py-2';

	return <div className="mx-auto max-w-7xl space-y-5">
		<nav aria-label="Rental sections" className="grid grid-cols-2 gap-1 sm:flex">
			{TABS.map(entry => (
				<button key={entry.id} type="button" onClick={() => selectTab(entry.id)} aria-current={tab === entry.id ? 'page' : undefined}
					className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold sm:px-4 ${tab === entry.id ? 'bg-green-600 text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
					{/* A phone shows the short name, so both tabs fit side by side. */}
					<span className="sm:hidden">{entry.short}</span><span className="hidden sm:inline">{entry.label}</span>
					{entry.id === 'requests' && rentals.length > 0 ? ` (${rentals.length})` : ''}
				</button>
			))}
		</nav>

		{tab === 'book' && <form onSubmit={submit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<label className="text-sm font-medium text-gray-700 sm:col-span-2">Machinery<select required value={form.machineryId} onChange={event => update('machineryId', event.target.value)} className={inputClass}>
					<option value="">Select machinery</option>
					{machinery.map(machine => <option key={machine.id} value={machine.id} disabled={machine.status === 'maintenance'}>
						{machine.name} · ₱{machine.dailyFee.toLocaleString('en-PH')} a day{machine.status === 'maintenance' ? ' (under maintenance)' : ''}
					</option>)}
				</select>
					{selectedMachine && <span className={`mt-1 block text-xs font-normal ${selectedMachine.status === 'maintenance' ? 'text-yellow-700' : 'text-green-700'}`}>{statusLabel[selectedMachine.status]}</span>}
					{machinery.length === 0 && <span className="mt-1 block text-xs font-normal text-gray-500">No machinery is listed yet.</span>}
				</label>
				<label className="text-sm font-medium text-gray-700">Start Date<input required type="date" min={today} value={form.startDate} onChange={event => update('startDate', event.target.value)} className={inputClass} /></label>
				<label className="text-sm font-medium text-gray-700">End Date<input required type="date" min={form.startDate || today} value={form.endDate} onChange={event => update('endDate', event.target.value)} className={inputClass} /></label>
				<label className="text-sm font-medium text-gray-700 sm:col-span-2">Purpose<input required value={form.purpose} onChange={event => update('purpose', event.target.value)} placeholder="e.g. Rice harvesting" className={inputClass} /></label>
				<label className="text-sm font-medium text-gray-700 sm:col-span-2">Notes / Remarks<textarea rows={1} value={form.notes} onChange={event => update('notes', event.target.value)} className={`${inputClass} min-h-[2.625rem] resize-y`} placeholder="Optional details" /></label>
			</div>
			<div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
				<p className="flex items-center gap-2 text-sm text-gray-600">
					<CalendarDays className="h-4 w-4 shrink-0 text-gray-400" />
					{selectedMachine && days ? <span>Estimated fee <strong className="tabular-nums text-gray-900">{peso(selectedMachine.dailyFee * days)}</strong> for {days} day{days === 1 ? '' : 's'}</span> : 'The cooperative approves each booking.'}
				</p>
				<button type="submit" disabled={isSubmitting} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">{isSubmitting ? 'Sending...' : 'Request Rental'}</button>
			</div>
		</form>}

		{tab === 'requests' && <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
			{rentals.length === 0
				? <p className="p-5 text-sm text-gray-500">You have not requested any machinery yet.</p>
				: <>
					{/* One row per request; on a phone the submitted date and days are left out so the row fits. */}
					<div className="overflow-x-auto">
						{/* The cells drop the phone-wide minimum width from mobile.css so the four columns fit a phone screen. */}
						<table className="min-w-full text-[13px] sm:text-sm [&_td]:min-w-0!">
							<thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
								<tr>
									<th className="px-2 py-3 max-sm:w-full sm:px-4">Machinery</th>
									<th className="px-2 py-3 sm:px-4">Dates</th>
									<th className="hidden px-2 py-3 sm:px-4 text-right sm:table-cell">Days</th>
									<th className="px-2 py-3 sm:px-4 text-right">Fee</th>
									<th className="hidden px-2 py-3 sm:px-4 md:table-cell">Submitted</th>
									<th className="px-2 py-3 sm:px-4">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-gray-100">
								{rentalPages.pageItems.map(rental => <tr key={rental.id} className="hover:bg-gray-50">
									{/* On a phone the name takes the room the other columns leave and ends in "…" when it is longer. */}
									<td className="whitespace-nowrap px-2 py-3 font-medium text-gray-900 max-sm:w-full max-sm:max-w-0 sm:px-4"><span className="block truncate" title={rental.machineryName}>{rental.machineryName}</span></td>
									<td className="whitespace-nowrap px-2 py-3 sm:px-4 text-gray-700">{dateRange(rental.startDate, rental.endDate).range}<span className="hidden sm:inline">, {dateRange(rental.startDate, rental.endDate).year}</span></td>
									<td className="hidden whitespace-nowrap px-2 py-3 sm:px-4 text-right tabular-nums text-gray-700 sm:table-cell">{rental.duration}</td>
									<td className="whitespace-nowrap px-2 py-3 sm:px-4 text-right tabular-nums text-gray-900">{wholePeso(rental.rentalFee)}</td>
									<td className="hidden whitespace-nowrap px-2 py-3 sm:px-4 text-gray-600 md:table-cell">{formatDate(rental.submittedAt, true)}</td>
									<td className="whitespace-nowrap px-2 py-3 sm:px-4"><span className={`rounded-full px-2 py-1 text-xs capitalize sm:px-2.5 ${rental.status === 'approved' ? 'bg-green-100 text-green-800' : rental.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{rental.status}{rental.status === 'approved' && rental.operationStatus ? <span className="hidden sm:inline"> · {rental.operationStatus}</span> : null}</span></td>
								</tr>)}
							</tbody>
						</table>
					</div>
					<Pagination page={rentalPages.page} totalPages={rentalPages.totalPages} total={rentalPages.total} pageSize={rentalPages.pageSize} onPageChange={rentalPages.setPage} onPageSizeChange={rentalPages.setPageSize} label="requests" />
				</>}
		</section>}
	</div>;
}
