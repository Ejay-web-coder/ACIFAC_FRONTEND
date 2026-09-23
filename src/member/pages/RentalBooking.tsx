import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, ClipboardPlus } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { createRentalRequest, fetchMachineryCatalog, type Machinery } from '../../app/services/authApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { dateOnlyToday, formatDate, formatDateTime } from '../../utils/dateTime';

const statusLabel: Record<Machinery['status'], string> = { available: 'Available', 'in-use': 'In use today', maintenance: 'Under maintenance' };

export function RentalBooking({ userRole }: { userRole: UserRole }) {
	const [machinery, setMachinery] = useState<Machinery[]>([]);
	const [form, setForm] = useState({ machineryId: '', startDate: '', endDate: '', purpose: '', notes: '' });
	const [submitted, setSubmitted] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { memberData } = useMyMemberData();
	const selectedMachine = machinery.find(machine => machine.id === form.machineryId);
	const update = (field: string, value: string) => setForm(current => ({ ...current, [field]: value }));

	const loadCatalog = useCallback(() => {
		fetchMachineryCatalog().then(setMachinery).catch((error: Error) => toast.error('Unable to load machinery', { description: error.message }));
	}, []);
	useEffect(() => { loadCatalog(); }, [loadCatalog]);
	useLiveRefresh(['machinery'], loadCatalog);

	if (userRole !== 'member') return <div className="p-8">Access restricted to members only</div>;

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!selectedMachine || !form.startDate || !form.endDate || !form.purpose.trim() || form.endDate < form.startDate || isSubmitting) return;
		setIsSubmitting(true);
		try {
			await createRentalRequest({ machineryId: selectedMachine.id, startDate: form.startDate, endDate: form.endDate, purpose: form.purpose.trim(), notes: form.notes.trim() });
			setSubmitted(true);
			toast.success('Rental request submitted', { description: 'The cooperative team will review your booking.' });
			setForm({ machineryId: '', startDate: '', endDate: '', purpose: '', notes: '' });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to submit rental request.');
		} finally {
			setIsSubmitting(false);
		}
	};

	const rentals = memberData?.rentalRequests ?? [];
	const today = dateOnlyToday();

	return <div className="mx-auto max-w-4xl space-y-6"><div><p className="text-sm font-medium text-green-600">Member Services</p><h2 className="mt-1 text-2xl font-bold text-gray-900">Rental Booking</h2><p className="mt-1 text-sm text-gray-600">Check available machinery and request a rental schedule.</p></div>{submitted && <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800"><CheckCircle2 className="h-5 w-5 shrink-0" /><p className="text-sm">Your booking request was sent to the cooperative for review. Its status appears under My Rental Requests.</p></div>}<div className="grid grid-cols-1 gap-6 lg:grid-cols-5"><section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2"><div className="mb-4 flex items-center gap-2"><ClipboardPlus className="h-5 w-5 text-green-600" /><h3 className="font-bold text-gray-900">Available Machinery</h3></div><div className="space-y-3">{machinery.map(machine => <div key={machine.id} className="rounded-md border border-gray-100 bg-gray-50 p-3"><p className="font-medium text-gray-900">{machine.name}</p><p className={`mt-1 text-xs ${machine.status === 'maintenance' ? 'text-yellow-700' : 'text-green-700'}`}>{statusLabel[machine.status]} · ₱{machine.dailyFee.toLocaleString('en-PH')} / day</p></div>)}{machinery.length === 0 && <p className="text-sm text-gray-500">No machinery is listed yet.</p>}</div></section><form onSubmit={submit} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700 sm:col-span-2">Machinery<select required value={form.machineryId} onChange={event => update('machineryId', event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select machinery</option>{machinery.map(machine => <option key={machine.id} value={machine.id} disabled={machine.status === 'maintenance'}>{machine.name}{machine.status === 'maintenance' ? ' (maintenance)' : ''}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Start Date<input required type="date" min={today} value={form.startDate} onChange={event => update('startDate', event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium text-gray-700">End Date<input required type="date" min={form.startDate || today} value={form.endDate} onChange={event => update('endDate', event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Purpose<input required value={form.purpose} onChange={event => update('purpose', event.target.value)} placeholder="e.g. Rice harvesting" className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Notes / Remarks<textarea value={form.notes} onChange={event => update('notes', event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Optional details" /></label></div><div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-5"><div className="flex items-center gap-2 text-xs text-gray-500"><CalendarDays className="h-4 w-4" />Admin approval required · fee is computed by the cooperative on submission</div><button type="submit" disabled={isSubmitting} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">{isSubmitting ? 'Sending...' : 'Request Rental'}</button></div></form></div><section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><h3 className="mb-4 font-bold text-gray-900">My Rental Requests</h3>{rentals.length === 0 ? <p className="text-sm text-gray-500">You have not requested any machinery yet.</p> : <div className="space-y-3">{rentals.map(rental => <div key={rental.id} className="flex flex-col gap-2 rounded-md border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium text-gray-900">{rental.machineryName}</p><p className="text-xs text-gray-600">{formatDate(rental.startDate)} to {formatDate(rental.endDate)} · {rental.duration} day(s) · ₱{rental.rentalFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p><p className="text-xs text-gray-500">Submitted {formatDateTime(rental.submittedAt)}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs capitalize ${rental.status === 'approved' ? 'bg-green-100 text-green-800' : rental.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{rental.status === 'approved' && rental.operationStatus ? `approved · ${rental.operationStatus}` : rental.status}</span></div>)}</div>}</section></div>;
}
