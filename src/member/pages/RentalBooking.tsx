import { useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, ClipboardPlus } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { createRentalRequest } from '../../app/services/authApi';

const machinery = [
	{ id: 'M-001', name: 'Hand Tractor (Kubota)', fee: 600 },
	{ id: 'M-002', name: 'Rice Thresher', fee: 800 },
	{ id: 'M-003', name: 'Water Pump', fee: 600 },
];

export function RentalBooking({ userRole }: { userRole: UserRole }) {
	const [form, setForm] = useState({ machineryId: '', startDate: '', endDate: '', purpose: '', notes: '' });
	const [submitted, setSubmitted] = useState(false);
	const selectedMachine = machinery.find(machine => machine.id === form.machineryId);
	const update = (field: string, value: string) => setForm(current => ({ ...current, [field]: value }));

	if (userRole !== 'member') return <div className="p-8">Access restricted to members only</div>;

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!selectedMachine || !form.startDate || !form.endDate || !form.purpose.trim() || form.endDate < form.startDate) return;
		try {
			await createRentalRequest({ machineryId: selectedMachine.id, startDate: form.startDate, endDate: form.endDate, purpose: form.purpose.trim(), notes: form.notes.trim() });
			setSubmitted(true);
			toast.success('Rental request submitted', { description: 'The cooperative team will review your booking.' });
			setForm({ machineryId: '', startDate: '', endDate: '', purpose: '', notes: '' });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to submit rental request.');
		}
	};

	return <div className="mx-auto max-w-4xl space-y-6"><div><p className="text-sm font-medium text-green-600">Member Services</p><h2 className="mt-1 text-2xl font-bold text-gray-900">Rental Booking</h2><p className="mt-1 text-sm text-gray-600">Check available machinery and request a rental schedule.</p></div>{submitted && <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800"><CheckCircle2 className="h-5 w-5 shrink-0" /><p className="text-sm">Your booking request was sent to the cooperative for review.</p></div>}<div className="grid grid-cols-1 gap-6 lg:grid-cols-5"><section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2"><div className="mb-4 flex items-center gap-2"><ClipboardPlus className="h-5 w-5 text-green-600" /><h3 className="font-bold text-gray-900">Available Machinery</h3></div><div className="space-y-3">{machinery.map(machine => <div key={machine.id} className="rounded-md border border-gray-100 bg-gray-50 p-3"><p className="font-medium text-gray-900">{machine.name}</p><p className="mt-1 text-xs text-green-700">Available · ₱{machine.fee.toLocaleString()} / day</p></div>)}</div></section><form onSubmit={submit} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700 sm:col-span-2">Machinery<select required value={form.machineryId} onChange={event => update('machineryId', event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Select machinery</option>{machinery.map(machine => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select></label><label className="text-sm font-medium text-gray-700">Start Date<input required type="date" value={form.startDate} onChange={event => update('startDate', event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium text-gray-700">End Date<input required type="date" min={form.startDate} value={form.endDate} onChange={event => update('endDate', event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Purpose<input required value={form.purpose} onChange={event => update('purpose', event.target.value)} placeholder="e.g. Rice harvesting" className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="text-sm font-medium text-gray-700 sm:col-span-2">Notes / Remarks<textarea value={form.notes} onChange={event => update('notes', event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Optional details" /></label></div><div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-5"><div className="flex items-center gap-2 text-xs text-gray-500"><CalendarDays className="h-4 w-4" />Admin approval required</div><button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">Request Rental</button></div></form></div></div>;
}
