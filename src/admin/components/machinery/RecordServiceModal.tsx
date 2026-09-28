import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { searchMembers, type Machinery, type MemberSuggestion, type RentalRequest } from '../../../app/services/authApi';
import {
  CROPPING_PERIODS, createService, fetchRates, quoteService, rateLabel, updateService,
  type ClientCategory, type CroppingPeriod, type MachineryService, type ServicePayload, type ServiceQuote, type ServiceRate,
} from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { Modal, bags, inputClass, labelClass, peso, primaryButton, secondaryButton } from './shared';

// Paddy prices per kg used in the Jan–Jul 2026 IDD report.
const PADDY_PRICES = [{ label: 'Fresh ₱14/kg', value: '14' }, { label: 'Dry ₱24/kg', value: '24' }];

interface Props {
  machinery: Machinery[];
  rentalRequests: RentalRequest[];
  service?: MachineryService | null;
  defaultMachineryId?: string;
  onClose: () => void;
  onSaved: (service: MachineryService) => void;
}

const text = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

export function RecordServiceModal({ machinery, rentalRequests, service, defaultMachineryId, onClose, onSaved }: Props) {
  const editing = Boolean(service);
  const machines = machinery.filter((machine) => machine.pricingMode === 'per_service' || machine.id === service?.machineryId);
  const [form, setForm] = useState({
    machineryId: service?.machineryId ?? defaultMachineryId ?? machines[0]?.id ?? '',
    serviceType: service?.serviceType ?? '',
    serviceDate: service?.serviceDate ?? dateOnlyToday(),
    croppingPeriod: (service?.croppingPeriod ?? '1st') as CroppingPeriod,
    year: String(service?.year ?? dateOnlyToday().slice(0, 4)),
    clientCategory: (service?.clientCategory ?? 'member') as ClientCategory,
    clientName: service?.clientCategory === 'non_member' ? service.clientName : '',
    clientAddress: service?.clientAddress ?? '',
    areaHa: text(service?.areaHa || null),
    days: text(service?.days),
    totalBags: text(service?.totalBags),
    bagMode: (service?.kgPerBag ? 'kg' : 'value') as 'value' | 'kg',
    bagValue: service?.kgPerBag ? '' : text(service?.bagValue),
    kgPerBag: text(service?.kgPerBag),
    pricePerKg: text(service?.pricePerKg),
    changeFee: Boolean(service?.computedFeeAmount !== null && service?.computedFeeAmount !== undefined),
    feeAmount: service?.computedFeeAmount !== null && service?.computedFeeAmount !== undefined ? text(service.feeAmount) : '',
    feeOverrideReason: service?.feeOverrideReason ?? '',
    amountPaid: '',
    paymentDate: dateOnlyToday(),
    rentalRequestId: text(service?.rentalRequestId),
    notes: service?.notes ?? '',
  });
  const [member, setMember] = useState<{ id: number; name: string; number: string | null } | null>(
    service?.clientCategory === 'member' && service.memberDatabaseId ? { id: service.memberDatabaseId, name: service.clientName, number: service.memberNumber } : null,
  );
  const [memberSearch, setMemberSearch] = useState('');
  const [suggestions, setSuggestions] = useState<MemberSuggestion[]>([]);
  const [rates, setRates] = useState<ServiceRate[]>([]);
  const [quote, setQuote] = useState<ServiceQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchRequest = useRef(0);
  const quoteRequest = useRef(0);
  const set = (field: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    if (!form.machineryId) { setRates([]); return; }
    let active = true;
    fetchRates(form.machineryId).then((rows) => { if (active) setRates(rows); }).catch((error) => toast.error(errorMessage(error, 'Unable to load rates.')));
    return () => { active = false; };
  }, [form.machineryId]);

  // One entry per service type, with its unit and the rate on the chosen date.
  const serviceTypes = useMemo(() => {
    const types = new Map<string, { unit: ServiceRate['unit']; current: ServiceRate | null }>();
    for (const rate of rates) {
      const entry = types.get(rate.serviceType) ?? { unit: rate.unit, current: null };
      if (rate.effectiveFrom <= form.serviceDate && (!rate.effectiveTo || rate.effectiveTo >= form.serviceDate)) entry.current = rate;
      types.set(rate.serviceType, entry);
    }
    return [...types.entries()].map(([name, entry]) => ({ name, ...entry }));
  }, [rates, form.serviceDate]);

  useEffect(() => {
    if (!serviceTypes.length) return;
    if (!serviceTypes.some((type) => type.name.toLowerCase() === form.serviceType.toLowerCase())) set('serviceType', serviceTypes[0].name);
  }, [serviceTypes, form.serviceType]);

  const unit = serviceTypes.find((type) => type.name.toLowerCase() === form.serviceType.toLowerCase())?.unit ?? null;

  useEffect(() => {
    const search = memberSearch.trim();
    if (form.clientCategory !== 'member' || member || search.length < 2) { setSuggestions([]); return; }
    const requestId = ++searchRequest.current;
    const timer = window.setTimeout(() => {
      searchMembers(search).then((rows) => { if (requestId === searchRequest.current) setSuggestions(rows); }).catch((error) => toast.error(errorMessage(error, 'Unable to search members.')));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [memberSearch, member, form.clientCategory]);

  // The fee always comes from the backend, which applies the rate valid on the service date.
  useEffect(() => {
    // Every change makes older answers stale, even when no new request is sent.
    const requestId = ++quoteRequest.current;
    if (!form.machineryId || !form.serviceType || !unit) { setQuote(null); setQuoting(false); return; }
    // Only what the fee depends on; the area of a harvest or per-day job is for the report.
    const quantities = unit === 'per_ha' ? { areaHa: form.areaHa }
      : unit === 'per_day' ? { days: form.days }
        : { totalBags: form.totalBags, ...(form.bagMode === 'value' ? { bagValue: form.bagValue } : { kgPerBag: form.kgPerBag, pricePerKg: form.pricePerKg }) };
    if (Object.values(quantities).some((value) => !String(value ?? '').trim())) { setQuote(null); setQuoteError(''); setQuoting(false); return; }
    setQuoting(true);
    const timer = window.setTimeout(() => {
      quoteService({ machineryId: form.machineryId, serviceType: form.serviceType, serviceDate: form.serviceDate, clientCategory: form.clientCategory, ...quantities })
        .then((result) => { if (requestId === quoteRequest.current) { setQuote(result); setQuoteError(''); } })
        .catch((error) => { if (requestId === quoteRequest.current) { setQuote(null); setQuoteError(errorMessage(error, 'Unable to compute the fee.')); } })
        .finally(() => { if (requestId === quoteRequest.current) setQuoting(false); });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form.machineryId, form.serviceType, form.serviceDate, form.clientCategory, form.areaHa, form.days, form.totalBags, form.bagMode, form.bagValue, form.kgPerBag, form.pricePerKg, unit]);
  const selectedMachine = machinery.find((machine) => machine.id === form.machineryId);
  const linkableRequests = rentalRequests.filter((request) => request.status === 'approved'
    && (request.machineryId === form.machineryId || machinery.find((machine) => machine.id === request.machineryId)?.parentMachineryId === form.machineryId));
  const finalFee = form.changeFee && form.feeAmount.trim() ? Number(form.feeAmount) : quote?.feeAmount ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.clientCategory === 'member' && !member) { toast.error('Search for the member and pick them from the list.'); return; }
    if (!quote) { toast.error(quoteError || 'Fill in the details so the fee can be computed.'); return; }
    if (form.changeFee && !form.feeOverrideReason.trim()) { toast.error('Give a reason for changing the fee.'); return; }
    const payload: ServicePayload = {
      machineryId: form.machineryId,
      serviceType: form.serviceType,
      serviceDate: form.serviceDate,
      croppingPeriod: form.croppingPeriod,
      year: Number(form.year),
      clientCategory: form.clientCategory,
      memberDatabaseId: form.clientCategory === 'member' ? member?.id ?? null : null,
      clientName: form.clientCategory === 'non_member' ? form.clientName.trim() : undefined,
      clientAddress: form.clientAddress.trim(),
      areaHa: form.areaHa.trim() || undefined,
      days: unit === 'per_day' ? form.days : undefined,
      totalBags: unit === 'per_100_bags' ? form.totalBags : undefined,
      bagValue: unit === 'per_100_bags' && form.bagMode === 'value' ? form.bagValue : undefined,
      kgPerBag: unit === 'per_100_bags' && form.bagMode === 'kg' ? form.kgPerBag : undefined,
      pricePerKg: unit === 'per_100_bags' && form.bagMode === 'kg' ? form.pricePerKg : undefined,
      feeAmount: form.changeFee ? form.feeAmount : undefined,
      feeOverrideReason: form.changeFee ? form.feeOverrideReason.trim() : undefined,
      rentalRequestId: form.rentalRequestId ? Number(form.rentalRequestId) : null,
      notes: form.notes.trim(),
      ...(editing ? {} : { amountPaid: form.amountPaid || '0', paymentDate: form.paymentDate }),
    };
    setSaving(true);
    try {
      const saved = editing && service ? await updateService(service.id, payload) : await createService(payload);
      toast.success(editing ? 'Service updated' : 'Service recorded', { description: `${saved.clientName} · ${saved.serviceType} · ${peso(saved.feeAmount)}` });
      onSaved(saved);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the service.'));
    } finally {
      setSaving(false);
    }
  };

  const computation = quote && (quote.unit === 'per_ha'
    ? `${Number(form.areaHa)} ha × ${peso(quote.rateUsed)}/ha = ${peso(quote.feeAmount)}`
    : quote.unit === 'per_day'
      ? `${form.days} day(s) × ${peso(quote.rateUsed)}/day = ${peso(quote.feeAmount)}`
      : `${Number(form.totalBags)} bags × ${quote.rateUsed}/100 = ${bags(quote.feeBags)} × ${peso(quote.bagValue)} per bag = ${peso(quote.feeAmount)}`);

  return (
    <Modal
      title={editing ? 'Edit Service' : 'Record Service'}
      description="One job done for a farmer. The fee uses the rate valid on the service date."
      onClose={onClose}
      wide
      footer={<>
        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
        <button type="submit" form="record-service-form" disabled={saving || !quote} className={primaryButton}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Record service'}</button>
      </>}
    >
      {machines.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No machine is paid per service yet. Open a machine's <strong>Details &amp; rates</strong> in the fleet list, set its pricing to per service and add its rates.</p>
      ) : (
        <form id="record-service-form" onSubmit={submit} className="space-y-5">
          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <legend className="sr-only">Service</legend>
            <label className={`${labelClass} sm:col-span-2`}>Machine
              <select required value={form.machineryId} onChange={(event) => set('machineryId', event.target.value)} className={inputClass}>
                {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name} ({machine.id})</option>)}
              </select>
            </label>
            <label className={`${labelClass} sm:col-span-2`}>Service type
              <select required value={form.serviceType} onChange={(event) => set('serviceType', event.target.value)} className={inputClass} disabled={!serviceTypes.length}>
                {!serviceTypes.length && <option value="">No rates for this machine yet</option>}
                {serviceTypes.map((type) => (
                  <option key={type.name} value={type.name}>
                    {type.name}{type.current ? ` · M ${rateLabel(type.unit, type.current.memberRate)} / NM ${rateLabel(type.unit, type.current.nonMemberRate)}` : ' · no rate on this date'}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>Service date
              <input required type="date" max={dateOnlyToday()} value={form.serviceDate} onChange={(event) => { set('serviceDate', event.target.value); if (event.target.value) set('year', event.target.value.slice(0, 4)); }} className={inputClass} />
            </label>
            <label className={labelClass}>Cropping period
              <select value={form.croppingPeriod} onChange={(event) => set('croppingPeriod', event.target.value)} className={inputClass}>
                {CROPPING_PERIODS.map((period) => <option key={period} value={period}>{period} cropping</option>)}
              </select>
            </label>
            <label className={labelClass}>Year
              <input required type="number" min={2000} max={2100} value={form.year} onChange={(event) => set('year', event.target.value)} className={inputClass} />
            </label>
            {linkableRequests.length > 0 && (
              <label className={labelClass}>From rental request
                <select value={form.rentalRequestId} onChange={(event) => set('rentalRequestId', event.target.value)} className={inputClass}>
                  <option value="">None</option>
                  {linkableRequests.map((request) => <option key={request.id} value={request.id}>#{request.id} {request.memberName} · {formatDate(request.startDate, true)}</option>)}
                </select>
              </label>
            )}
          </fieldset>

          <fieldset className="rounded-xl border border-gray-200 p-4">
            <legend className="px-1 text-sm font-semibold text-gray-900">Farmer</legend>
            <div className="mb-3 inline-flex rounded-xl border border-gray-300 p-1" role="radiogroup" aria-label="Client category">
              {(['member', 'non_member'] as ClientCategory[]).map((category) => (
                <button key={category} type="button" role="radio" aria-checked={form.clientCategory === category} onClick={() => set('clientCategory', category)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${form.clientCategory === category ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
                  {category === 'member' ? 'Member' : 'Non-member'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {form.clientCategory === 'member' ? (
                <div className="relative">
                  <label className={labelClass} htmlFor="service-member">Member</label>
                  {member ? (
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm">
                      <span><span className="font-semibold text-gray-900">{member.name}</span>{member.number && <span className="text-gray-600"> · {member.number}</span>}</span>
                      <button type="button" onClick={() => { setMember(null); setMemberSearch(''); }} className="text-xs font-semibold text-green-700 hover:text-green-900">Change</button>
                    </div>
                  ) : (
                    <>
                      <input id="service-member" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search name or member ID" className={inputClass} autoComplete="off" />
                      {suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                          {suggestions.map((row) => (
                            <button key={row.id} type="button" onClick={() => { setMember({ id: row.id, name: row.full_name, number: row.member_number }); setSuggestions([]); }}
                              className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50">
                              <span className="block text-sm font-medium text-gray-900">{row.full_name}</span>
                              <span className="block text-xs text-gray-500">{row.member_number || `#${row.id}`}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <label className={labelClass}>Name
                  <input required value={form.clientName} onChange={(event) => set('clientName', event.target.value)} maxLength={200} className={inputClass} placeholder="Full name" />
                </label>
              )}
              <label className={labelClass}>Address
                <input value={form.clientAddress} onChange={(event) => set('clientAddress', event.target.value)} maxLength={300} className={inputClass} placeholder={form.clientCategory === 'member' ? 'Leave blank to use the member record' : 'Barangay, municipality'} />
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-gray-200 p-4">
            <legend className="px-1 text-sm font-semibold text-gray-900">Work done</legend>
            {!unit ? <p className="text-sm text-gray-500">Choose a service type to enter the area or bags.</p> : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {unit === 'per_100_bags' && (
                  <label className={labelClass}>Total bags harvested
                    <input required inputMode="decimal" value={form.totalBags} onChange={(event) => set('totalBags', event.target.value)} className={inputClass} placeholder="e.g. 100" />
                  </label>
                )}
                {unit === 'per_day' && (
                  <label className={labelClass}>Days
                    <input required type="number" min={1} step={1} value={form.days} onChange={(event) => set('days', event.target.value)} className={inputClass} />
                  </label>
                )}
                <label className={labelClass}>Area (ha){unit !== 'per_ha' && <span className="font-normal text-gray-500"> · for the report</span>}
                  <input required={unit === 'per_ha'} inputMode="decimal" value={form.areaHa} onChange={(event) => set('areaHa', event.target.value)} className={inputClass} placeholder="e.g. 1.5" />
                </label>
                {unit === 'per_100_bags' && (
                  <div className="sm:col-span-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-medium text-gray-700">Value of one bag</span>
                      <label className="inline-flex items-center gap-1 text-gray-600"><input type="radio" checked={form.bagMode === 'value'} onChange={() => set('bagMode', 'value')} /> Enter amount</label>
                      <label className="inline-flex items-center gap-1 text-gray-600"><input type="radio" checked={form.bagMode === 'kg'} onChange={() => set('bagMode', 'kg')} /> kg × price</label>
                    </div>
                    {form.bagMode === 'value' ? (
                      <input required inputMode="decimal" aria-label="Value of one bag (₱)" value={form.bagValue} onChange={(event) => set('bagValue', event.target.value)} className={inputClass} placeholder="₱ per bag" />
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <input required inputMode="decimal" aria-label="Kg per bag" value={form.kgPerBag} onChange={(event) => set('kgPerBag', event.target.value)} className={inputClass} placeholder="kg per bag" />
                        <div>
                          <input required inputMode="decimal" aria-label="Paddy price per kg (₱)" value={form.pricePerKg} onChange={(event) => set('pricePerKg', event.target.value)} className={inputClass} placeholder="₱ per kg" />
                          <div className="mt-1 flex gap-1">{PADDY_PRICES.map((price) => <button key={price.value} type="button" onClick={() => set('pricePerKg', price.value)} className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">{price.label}</button>)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <section className="rounded-xl border border-green-200 bg-green-50/60 p-4" aria-live="polite">
            <div className="flex items-start gap-3">
              <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">Fee {quoting && <Loader2 className="ml-1 inline h-4 w-4 animate-spin text-green-700" />}</p>
                {quote ? (
                  <>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-green-800">{peso(quote.feeAmount)}</p>
                    <p className="mt-1 text-sm text-gray-700">{computation}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{form.clientCategory === 'member' ? 'Member' : 'Non-member'} rate of {selectedMachine?.name}, valid from {formatDate(quote.rate.effectiveFrom)}{quote.rate.effectiveTo ? ` to ${formatDate(quote.rate.effectiveTo)}` : ''}.</p>
                  </>
                ) : (
                  <p className={`mt-1 text-sm ${quoteError ? 'text-red-700' : 'text-gray-600'}`}>{quoteError || 'Enter the details above to compute the fee.'}</p>
                )}
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.changeFee} onChange={(event) => set('changeFee', event.target.checked)} /> Change the fee (reason required)
                </label>
                {form.changeFee && (
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className={labelClass}>Fee to charge (₱)
                      <input required inputMode="decimal" value={form.feeAmount} onChange={(event) => set('feeAmount', event.target.value)} className={inputClass} />
                    </label>
                    <label className={`${labelClass} sm:col-span-2`}>Reason
                      <input required value={form.feeOverrideReason} onChange={(event) => set('feeOverrideReason', event.target.value)} maxLength={500} className={inputClass} placeholder="e.g. Board-approved discount" />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {!editing && (
              <>
                <label className={labelClass}>Amount paid now (₱)
                  <input inputMode="decimal" value={form.amountPaid} onChange={(event) => set('amountPaid', event.target.value)} className={inputClass} placeholder="0.00" />
                  {finalFee !== null && form.amountPaid && <span className="mt-1 block text-xs text-gray-500">Balance {peso(Math.max(0, finalFee - Number(form.amountPaid || 0)))}</span>}
                </label>
                <label className={labelClass}>Payment date
                  <input type="date" max={dateOnlyToday()} value={form.paymentDate} onChange={(event) => set('paymentDate', event.target.value)} className={inputClass} disabled={!Number(form.amountPaid)} />
                </label>
              </>
            )}
            <label className={`${labelClass} ${editing ? 'sm:col-span-3' : ''}`}>Notes
              <input value={form.notes} onChange={(event) => set('notes', event.target.value)} maxLength={1000} className={inputClass} placeholder="Optional" />
            </label>
          </div>
          {editing && <p className="text-xs text-gray-500">Payments are received from the service list (Receive Payment), so the collection history stays complete.</p>}
        </form>
      )}
    </Modal>
  );
}
