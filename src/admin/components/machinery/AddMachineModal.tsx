import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { Machinery } from '../../../app/services/authApi';
import { CONDITION_LABELS, createMachine, type MachineCondition, type PricingMode } from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { dateOnlyToday } from '../../../utils/dateTime';
import { Modal, inputClass, labelClass, primaryButton, secondaryButton } from './shared';

// Suggested types; any other type can be typed in.
const COMMON_TYPES = ['Tractor', 'Hand Tractor', 'Harvester', 'Rotavator', 'Thresher', 'Transplanter', 'Water Pump', 'Sprayer', 'Dryer', 'Trailer'];
const MONEY = /^\d+(\.\d{1,2})?$/;

// Adds a machine to the fleet. A per-day machine that is available can be
// booked by members right away; per-service machines are charged per job.
export function AddMachineModal({ machinery, onClose, onAdded }: { machinery: Machinery[]; onClose: () => void; onAdded: (machine: Machinery) => void }) {
  const [form, setForm] = useState({
    name: '', type: '', pricingMode: 'per_day' as PricingMode, dailyFee: '', status: 'available' as 'available' | 'maintenance',
    acquisitionDate: dateOnlyToday(), deliveryDate: '', condition: 'operational' as MachineCondition | '', parentMachineryId: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })); };
  const types = [...new Set([...machinery.map((machine) => machine.type).filter(Boolean), ...COMMON_TYPES])].sort((a, b) => a.localeCompare(b));
  const parents = machinery.filter((machine) => !machine.parentMachineryId);
  const perDay = form.pricingMode === 'per_day';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    else if (machinery.some((machine) => machine.name.trim().toLowerCase() === form.name.trim().toLowerCase())) next.name = 'A machine with this name is already in the fleet.';
    if (!form.type.trim()) next.type = 'Type is required.';
    const fee = form.dailyFee.trim();
    if (perDay && !(MONEY.test(fee) && Number(fee) > 0)) next.dailyFee = 'Enter the rental fee per day.';
    if (!perDay && fee && !MONEY.test(fee)) next.dailyFee = 'Enter a valid amount or leave it blank.';
    if (!form.acquisitionDate) next.acquisitionDate = 'Acquisition date is required.';
    else if (form.acquisitionDate > dateOnlyToday()) next.acquisitionDate = 'The date cannot be in the future.';
    if (form.deliveryDate && form.deliveryDate > dateOnlyToday()) next.deliveryDate = 'The date cannot be in the future.';
    setErrors(next);
    if (Object.values(next).some(Boolean) || saving) return;
    setSaving(true);
    try {
      const machine = await createMachine({
        name: form.name.trim(), type: form.type.trim(), pricingMode: form.pricingMode, dailyFee: fee, status: form.status,
        acquisitionDate: form.acquisitionDate, deliveryDate: form.deliveryDate || null, condition: form.condition || null, parentMachineryId: form.parentMachineryId || null,
      });
      toast.success(`${machine.name} added`, { description: perDay && form.status === 'available' ? 'Members can now book it for rental.' : `${machine.id} is in the fleet.` });
      onAdded(machine);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to add the machine.'));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (key: string) => errors[key] ? <span className="mt-1 block text-xs font-normal text-red-600">{errors[key]}</span> : null;

  return (
    <Modal title="Add Machine" description="Add a machine to the fleet. Per-day machines can be booked by members for rental." onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
        <button type="submit" form="addMachineForm" disabled={saving} className={primaryButton}>{saving ? 'Adding…' : 'Add Machine'}</button>
      </>}>
      <form id="addMachineForm" onSubmit={(event) => void submit(event)} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>Name <span className="text-red-500">*</span>
          <input value={form.name} onChange={(event) => set('name', event.target.value)} className={inputClass} placeholder="e.g. Kubota Hand Tractor" autoFocus />
          {fieldError('name')}
        </label>
        <label className={labelClass}>Type <span className="text-red-500">*</span>
          <input list="machine-types" value={form.type} onChange={(event) => set('type', event.target.value)} className={inputClass} placeholder="Choose or type" />
          <datalist id="machine-types">{types.map((type) => <option key={type} value={type} />)}</datalist>
          {fieldError('type')}
        </label>
        <label className={labelClass}>Pricing
          <select value={form.pricingMode} onChange={(event) => set('pricingMode', event.target.value as PricingMode)} className={inputClass}>
            <option value="per_day">Per day (members can book it)</option>
            <option value="per_service">Per service (per ha / per 100 bags)</option>
          </select>
        </label>
        <label className={labelClass}>Rental fee per day {perDay && <span className="text-red-500">*</span>}
          <input inputMode="decimal" value={form.dailyFee} onChange={(event) => set('dailyFee', event.target.value)} className={inputClass} placeholder={perDay ? '0.00' : 'Optional'} />
          {fieldError('dailyFee')}
        </label>
        <label className={labelClass}>Availability
          <select value={form.status} onChange={(event) => set('status', event.target.value as 'available' | 'maintenance')} className={inputClass}>
            <option value="available">Available for rental</option>
            <option value="maintenance">Under maintenance</option>
          </select>
        </label>
        <label className={labelClass}>Condition
          <select value={form.condition} onChange={(event) => set('condition', event.target.value as MachineCondition | '')} className={inputClass}>
            <option value="">Not set</option>
            {(Object.keys(CONDITION_LABELS) as MachineCondition[]).map((condition) => <option key={condition} value={condition}>{CONDITION_LABELS[condition]}</option>)}
          </select>
        </label>
        <label className={labelClass}>Acquisition date <span className="text-red-500">*</span>
          <input type="date" max={dateOnlyToday()} value={form.acquisitionDate} onChange={(event) => set('acquisitionDate', event.target.value)} className={inputClass} />
          {fieldError('acquisitionDate')}
        </label>
        <label className={labelClass}>Date of delivery
          <input type="date" max={dateOnlyToday()} value={form.deliveryDate} onChange={(event) => set('deliveryDate', event.target.value)} className={inputClass} />
          {fieldError('deliveryDate')}
        </label>
        <label className={`${labelClass} sm:col-span-2`}>Attached to
          <select value={form.parentMachineryId} onChange={(event) => set('parentMachineryId', event.target.value)} className={inputClass}>
            <option value="">Not attached (main machine)</option>
            {parents.map((machine) => <option key={machine.id} value={machine.id}>{machine.name} ({machine.id})</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-gray-500">Implements such as a Rotavator are attached to the tractor that pulls them.</span>
        </label>
      </form>
    </Modal>
  );
}
