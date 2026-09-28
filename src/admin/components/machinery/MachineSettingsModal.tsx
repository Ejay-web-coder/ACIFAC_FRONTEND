import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarX, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Machinery } from '../../../app/services/authApi';
import {
  CONDITION_LABELS, UNIT_LABELS, createRate, deleteRate, fetchRates, rateLabel, updateMachine, updateRate,
  type MachineCondition, type PricingMode, type ServiceRate, type ServiceUnit,
} from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { formatDate } from '../../../utils/dateTime';
import { Modal, inputClass, labelClass, primaryButton, secondaryButton } from './shared';

export function MachineSettingsModal({ machine, machinery, onClose, onChanged }: { machine: Machinery; machinery: Machinery[]; onClose: () => void; onChanged: () => void }) {
  const [details, setDetails] = useState({
    deliveryDate: machine.deliveryDate ?? '',
    condition: (machine.condition ?? '') as MachineCondition | '',
    pricingMode: (machine.pricingMode ?? 'per_day') as PricingMode,
    parentMachineryId: machine.parentMachineryId ?? '',
  });
  const [rates, setRates] = useState<ServiceRate[]>([]);
  const [rateForm, setRateForm] = useState({ serviceType: '', unit: 'per_ha' as ServiceUnit, memberRate: '', nonMemberRate: '', effectiveFrom: '', effectiveTo: '' });
  const [busy, setBusy] = useState(false);
  const implementsList = machinery.filter((row) => row.parentMachineryId === machine.id);
  // Only main machines can take implements, and a machine with implements stays a main machine.
  const parents = machinery.filter((row) => row.id !== machine.id && !row.parentMachineryId);

  const loadRates = useCallback(() => {
    fetchRates(machine.id).then(setRates).catch((error) => toast.error(errorMessage(error, 'Unable to load rates.')));
  }, [machine.id]);
  useEffect(loadRates, [loadRates]);

  const saveDetails = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await updateMachine(machine.id, {
        deliveryDate: details.deliveryDate || null,
        condition: details.condition || null,
        pricingMode: details.pricingMode,
        parentMachineryId: details.parentMachineryId || null,
      });
      toast.success(`${machine.name} updated`);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to update the machine.'));
    } finally {
      setBusy(false);
    }
  };

  const addRate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await createRate(machine.id, { ...rateForm, serviceType: rateForm.serviceType.trim(), nonMemberRate: rateForm.nonMemberRate || rateForm.memberRate, effectiveTo: rateForm.effectiveTo || null });
      toast.success('Rate added', { description: 'An open rate for the same service now ends the day before.' });
      setRateForm((current) => ({ ...current, memberRate: '', nonMemberRate: '', effectiveFrom: '', effectiveTo: '' }));
      loadRates();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to add the rate.'));
    } finally {
      setBusy(false);
    }
  };

  const endRate = async (rate: ServiceRate) => {
    const effectiveTo = window.prompt(`Last day the ${rate.serviceType} rate applies (YYYY-MM-DD):`, rate.effectiveTo ?? '');
    if (effectiveTo === null) return;
    try {
      await updateRate(rate.id, { effectiveTo: effectiveTo.trim() || null });
      toast.success(effectiveTo.trim() ? 'Rate end date set' : 'Rate is open-ended again');
      loadRates();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to update the rate.'));
    }
  };

  const removeRate = async (rate: ServiceRate) => {
    if (!window.confirm(`Delete the ${rate.serviceType} rate from ${formatDate(rate.effectiveFrom)}?`)) return;
    try {
      await deleteRate(rate.id);
      toast.success('Rate deleted');
      loadRates();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to delete the rate.'));
    }
  };

  const serviceTypes = [...new Set(rates.map((rate) => rate.serviceType))];

  return (
    <Modal title={`${machine.name} · ${machine.id}`} description="Details for the PhilMech report and the rates charged per service." onClose={onClose} wide
      footer={<button type="button" onClick={onClose} className={secondaryButton}>Close</button>}>
      <form onSubmit={saveDetails} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>Date of delivery
          <input type="date" value={details.deliveryDate} onChange={(event) => setDetails({ ...details, deliveryDate: event.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>Condition
          <select value={details.condition} onChange={(event) => setDetails({ ...details, condition: event.target.value as MachineCondition | '' })} className={inputClass}>
            <option value="">Not set</option>
            {(Object.keys(CONDITION_LABELS) as MachineCondition[]).map((condition) => <option key={condition} value={condition}>{CONDITION_LABELS[condition]}</option>)}
          </select>
        </label>
        <label className={labelClass}>Pricing
          <select value={details.pricingMode} onChange={(event) => setDetails({ ...details, pricingMode: event.target.value as PricingMode })} className={inputClass}>
            <option value="per_day">Per day (member bookings)</option>
            <option value="per_service">Per service (per ha / per 100 bags)</option>
          </select>
        </label>
        <label className={labelClass}>Attached to
          <select value={details.parentMachineryId} onChange={(event) => setDetails({ ...details, parentMachineryId: event.target.value })} className={inputClass} disabled={implementsList.length > 0}>
            <option value="">Not attached (main machine)</option>
            {parents.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.id})</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
          <p className="text-xs text-gray-500">
            {implementsList.length > 0 ? `Implements attached: ${implementsList.map((row) => row.name).join(', ')}.` : 'Implements such as a Rotavator are attached to the tractor that pulls them.'}
            {details.pricingMode === 'per_service' && ' Per-service machines are not offered in member rental booking.'}
          </p>
          <button type="submit" disabled={busy} className={primaryButton}>Save details</button>
        </div>
      </form>

      <h3 className="mt-6 text-sm font-semibold text-gray-900">Service rates</h3>
      <p className="text-xs text-gray-500">Fees use the rate valid on the service date. Recorded services keep the rate they were charged.</p>
      <div className="relative mt-2 overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
            <tr><th className="px-3 py-2">Service</th><th className="px-3 py-2">Member</th><th className="px-3 py-2">Non-member</th><th className="px-3 py-2">Valid</th><th className="px-3 py-2 text-right">Used</th><th className="px-3 py-2"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rates.map((rate) => (
              <tr key={rate.id}>
                <td className="px-3 py-2 font-medium text-gray-900">{rate.serviceType}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{rateLabel(rate.unit, rate.memberRate)}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{rateLabel(rate.unit, rate.nonMemberRate)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDate(rate.effectiveFrom, true)} – {rate.effectiveTo ? formatDate(rate.effectiveTo, true) : 'onwards'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{rate.servicesUsingRate}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button type="button" onClick={() => void endRate(rate)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800" aria-label={`Set end date of ${rate.serviceType} rate`} title="Set end date"><CalendarX className="h-4 w-4" /></button>
                  {rate.servicesUsingRate === 0 && <button type="button" onClick={() => void removeRate(rate)} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${rate.serviceType} rate`}><Trash2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
            {rates.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No rates yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <form onSubmit={addRate} className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-dashed border-gray-300 p-3 lg:grid-cols-7">
        <p className="col-span-2 text-sm font-semibold text-gray-900 lg:col-span-7">Add a rate</p>
        <label className={`${labelClass} col-span-2 lg:col-span-2`}>Service type
          <input required list="machine-service-types" value={rateForm.serviceType} onChange={(event) => {
            const existing = rates.find((rate) => rate.serviceType.toLowerCase() === event.target.value.trim().toLowerCase());
            setRateForm({ ...rateForm, serviceType: event.target.value, unit: existing?.unit ?? rateForm.unit });
          }} className={inputClass} placeholder="e.g. Rotavator" />
          <datalist id="machine-service-types">{serviceTypes.map((type) => <option key={type} value={type} />)}</datalist>
        </label>
        <label className={labelClass}>Unit
          <select value={rateForm.unit} onChange={(event) => setRateForm({ ...rateForm, unit: event.target.value as ServiceUnit })} className={inputClass}>
            {(Object.keys(UNIT_LABELS) as ServiceUnit[]).map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}
          </select>
        </label>
        <label className={labelClass}>Member rate
          <input required inputMode="decimal" value={rateForm.memberRate} onChange={(event) => setRateForm({ ...rateForm, memberRate: event.target.value })} className={inputClass} placeholder={rateForm.unit === 'per_100_bags' ? 'bags' : '₱'} />
        </label>
        <label className={labelClass}>Non-member
          <input inputMode="decimal" value={rateForm.nonMemberRate} onChange={(event) => setRateForm({ ...rateForm, nonMemberRate: event.target.value })} className={inputClass} placeholder="same as member" />
        </label>
        <label className={labelClass}>From
          <input required type="date" value={rateForm.effectiveFrom} onChange={(event) => setRateForm({ ...rateForm, effectiveFrom: event.target.value })} className={inputClass} />
        </label>
        <label className={labelClass}>To (optional)
          <input type="date" min={rateForm.effectiveFrom || undefined} value={rateForm.effectiveTo} onChange={(event) => setRateForm({ ...rateForm, effectiveTo: event.target.value })} className={inputClass} />
        </label>
        <div className="col-span-2 flex justify-end lg:col-span-7"><button type="submit" disabled={busy} className={primaryButton}>Add rate</button></div>
      </form>
    </Modal>
  );
}
