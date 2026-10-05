import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Info, Printer, RefreshCw, Save, Settings2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { SectionCard } from '../../../app/components/common/UiKit';
import type { Machinery } from '../../../app/services/authApi';
import {
  CROPPING_PERIODS, fetchPhilmechReport, fetchReportForm, savePeriodBalance, saveReportForm, type CroppingPeriod, type PhilmechReport, type ReportForm,
} from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday } from '../../../utils/dateTime';
import { downloadFormExcel, downloadFormPdf, printForm, type CashInputRow } from './philmechExport';
import { CashflowSheet, ClientsSheet, UtilizationSheet, type CashValues, type ReportFilters } from './PhilmechFormSheets';
import { MONTHS, inputClass, labelClass, primaryButton, secondaryButton, yearOptions } from './shared';

const SHEETS = [
  { id: 'utilization', label: '1. Utilization Report & Feedback' },
  { id: 'cashflow', label: '2. Cashflow Statement' },
  { id: 'clients', label: '3. List of Farmers Clients' },
] as const;
type SheetId = typeof SHEETS[number]['id'];

const WARNING_STYLE = {
  error: { icon: XCircle, className: 'border-red-200 bg-red-50 text-red-900' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  info: { icon: Info, className: 'border-gray-200 bg-gray-50 text-gray-700' },
};

// Compared to tell whether the form on screen differs from the saved one.
const snapshot = (form: ReportForm) => JSON.stringify({ ...form, saved: undefined });

const cashFromReport = (report: PhilmechReport): CashValues => Object.fromEntries(report.machines.map((machine) => [
  machine.machineryId,
  { beginningCash: machine.cashFlow.beginningCash.toFixed(2), otherIncome: machine.cashFlow.otherIncome.toFixed(2) },
]));

/**
 * The PhilMech report laid out like the paper form. The header, feedback and
 * signatories are saved per cropping; the figures come from the services,
 * payments, expenses and beginning cash recorded for that cropping.
 */
export function PhilmechReportPanel({ machinery, onEditMachine }: { machinery: Machinery[]; onEditMachine?: (machine: Machinery) => void }) {
  const currentYear = Number(dateOnlyToday().slice(0, 4));
  const [filters, setFilters] = useState<ReportFilters>({ croppingPeriod: '1st', year: currentYear, fromMonth: 1, toMonth: 7, machineryId: '' });
  const [sheet, setSheet] = useState<SheetId>('utilization');
  const [form, setForm] = useState<ReportForm | null>(null);
  const [formKey, setFormKey] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [report, setReport] = useState<PhilmechReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState('');
  const [cash, setCash] = useState<CashValues>({});
  const [cashBase, setCashBase] = useState<CashValues>({});
  const [savingCash, setSavingCash] = useState(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const formRequest = useRef(0);
  const reportRequest = useRef(0);
  const cashState = useRef<{ key: string; base: CashValues }>({ key: '', base: {} });

  const key = `${filters.croppingPeriod}|${filters.year}`;
  // What Save sends and the exports print: the form with the chosen cropping and months.
  const draft: ReportForm | null = form ? { ...form, croppingPeriod: filters.croppingPeriod, year: filters.year, fromMonth: filters.fromMonth, toMonth: filters.toMonth } : null;
  const dirty = Boolean(draft && formKey === key && snapshot(draft) !== savedSnapshot);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // A saved form brings back its inclusive months; a new one keeps the months chosen.
  const loadForm = useCallback(async (croppingPeriod: CroppingPeriod, year: number) => {
    const requestId = ++formRequest.current;
    try {
      const loaded = await fetchReportForm(croppingPeriod, year);
      if (requestId !== formRequest.current) return;
      const months = loaded.fromMonth && loaded.toMonth
        ? { fromMonth: loaded.fromMonth, toMonth: loaded.toMonth }
        : { fromMonth: filtersRef.current.fromMonth, toMonth: filtersRef.current.toMonth };
      setFilters((current) => ({ ...current, ...months }));
      setForm(loaded);
      setSavedSnapshot(snapshot({ ...loaded, croppingPeriod, year, ...months }));
      setFormKey(`${croppingPeriod}|${year}`);
    } catch (error) {
      if (requestId === formRequest.current) toast.error(errorMessage(error, 'Unable to load the report form.'));
    }
  }, []);

  useEffect(() => { void loadForm(filters.croppingPeriod, filters.year); }, [filters.croppingPeriod, filters.year, loadForm]);

  const loadReport = useCallback(async () => {
    const requestId = ++reportRequest.current;
    setLoading(true);
    try {
      const next = await fetchPhilmechReport({
        croppingPeriod: filters.croppingPeriod,
        year: filters.year,
        fromMonth: filters.fromMonth,
        toMonth: filters.toMonth,
        machineryId: filters.machineryId || undefined,
      });
      if (requestId === reportRequest.current) setReport(next);
    } catch (error) {
      if (requestId === reportRequest.current) toast.error(errorMessage(error, 'Unable to generate the report.'));
    } finally {
      if (requestId === reportRequest.current) setLoading(false);
    }
  }, [filters.croppingPeriod, filters.year, filters.fromMonth, filters.toMonth, filters.machineryId]);

  // The report waits for the cropping's form, which may change the months.
  const formReady = formKey === key;
  useEffect(() => { if (formReady) void loadReport(); }, [formReady, loadReport]);

  useLiveRefresh(['machinery_services', 'machinery_service_payments', 'machinery_expenses', 'machinery_period_balances', 'machinery_service_rates', 'machinery'], () => {
    if (formReady) void loadReport();
  }, 1000);
  // Another admin's save shows here, unless this form has unsaved changes.
  useLiveRefresh(['machinery_report_forms'], () => {
    if (!dirtyRef.current) void loadForm(filtersRef.current.croppingPeriod, filtersRef.current.year);
  }, 1000);

  // Cash typed into the cash flow is kept when the report refreshes, until saved.
  useEffect(() => {
    if (!report) return;
    const base = cashFromReport(report);
    const reportKey = `${report.croppingPeriod}|${report.year}`;
    const previous = cashState.current.key === reportKey ? cashState.current.base : {};
    cashState.current = { key: reportKey, base };
    setCashBase(base);
    setCash((current) => Object.fromEntries(Object.entries(base).map(([id, values]) => {
      const before = previous[id];
      const typed = current[id];
      const edited = Boolean(before && typed && (typed.beginningCash !== before.beginningCash || typed.otherIncome !== before.otherIncome));
      return [id, edited ? typed : values];
    })));
  }, [report]);

  const changedCash = Object.entries(cash).filter(([id, values]) => cashBase[id]
    && (values.beginningCash !== cashBase[id].beginningCash || values.otherIncome !== cashBase[id].otherIncome));

  const updateForm = (patch: Partial<ReportForm>) => setForm((current) => (current ? { ...current, ...patch } : current));

  const updateFilters = (patch: Partial<ReportFilters>) => {
    const switching = (patch.croppingPeriod !== undefined && patch.croppingPeriod !== filters.croppingPeriod) || (patch.year !== undefined && patch.year !== filters.year);
    if (switching && (dirty || changedCash.length) && !window.confirm('This report has unsaved changes. Open the other cropping without saving them?')) return;
    setFilters((current) => {
      const next = { ...current, ...patch };
      return { ...next, toMonth: Math.max(next.toMonth, next.fromMonth) };
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await saveReportForm(draft);
      setForm(saved);
      setSavedSnapshot(snapshot(saved));
      toast.success(`PhilMech form saved for the ${saved.croppingPeriod} cropping of ${saved.year}`);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the report form.'));
    } finally {
      setSaving(false);
    }
  };

  const saveCash = async () => {
    if (!report || !changedCash.length) return;
    setSavingCash(true);
    try {
      for (const [machineryId, values] of changedCash) {
        await savePeriodBalance({
          machineryId,
          croppingPeriod: report.croppingPeriod,
          year: report.year,
          beginningCash: values.beginningCash.trim() || '0',
          otherIncome: values.otherIncome.trim() || '0',
        });
      }
      toast.success('Beginning cash and other income saved');
      // The saved amounts become the base, so the refreshed report replaces them.
      const saved = { ...cashState.current.base, ...Object.fromEntries(changedCash) };
      cashState.current = { ...cashState.current, base: saved };
      setCashBase(saved);
      void loadReport();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the cash amounts.'));
    } finally {
      setSavingCash(false);
    }
  };

  const exportAs = async (kind: 'print' | 'pdf' | 'excel') => {
    if (!report || !draft) return;
    setExporting(kind);
    try {
      if (kind === 'print') printForm(report, draft);
      else if (kind === 'pdf') await downloadFormPdf(report, draft);
      else await downloadFormExcel(report, draft);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to export the report.'));
    } finally {
      setExporting('');
    }
  };

  // An implement's records are reported under its tractor, so choosing one shows that tractor's report.
  const machineLabel = (machine: Machinery) => {
    const parent = machinery.find((row) => row.id === machine.parentMachineryId);
    return parent ? `${machine.name} (on ${parent.name})` : machine.name;
  };
  const warnings = report?.machines.flatMap((machine) => machine.warnings.map((warning) => ({ ...warning, machine: machine.name }))) ?? [];
  const toReview = warnings.filter((warning) => warning.level !== 'info').length;
  const ready = Boolean(report && draft && formReady);
  const editableMachines = onEditMachine && report
    ? report.machines.map((row) => machinery.find((machine) => machine.id === row.machineryId)).filter((machine): machine is Machinery => Boolean(machine))
    : [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="PhilMech Report"
        description="Farm Machinery Utilization Report and Feedback Form, Cashflow Statement and List of Farmers Clients, laid out like the PhilMech form."
        actions={<>
          <button type="button" onClick={() => void save()} disabled={!draft || saving || (!dirty && form?.saved)} className={primaryButton}>
            <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save form'}
          </button>
          <button type="button" onClick={() => void exportAs('pdf')} disabled={!ready || Boolean(exporting)} className={primaryButton}>
            <Download className="h-4 w-4" />{exporting === 'pdf' ? 'Preparing…' : 'Export PDF'}
          </button>
          <button type="button" onClick={() => void exportAs('excel')} disabled={!ready || Boolean(exporting)} className={secondaryButton}>
            <FileSpreadsheet className="h-4 w-4" />{exporting === 'excel' ? 'Preparing…' : 'Excel'}
          </button>
          <button type="button" onClick={() => void exportAs('print')} disabled={!ready || Boolean(exporting)} className={secondaryButton}>
            <Printer className="h-4 w-4" />Print
          </button>
        </>}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className={labelClass}>Cropping period
            <select value={filters.croppingPeriod} onChange={(event) => updateFilters({ croppingPeriod: event.target.value as CroppingPeriod })} className={inputClass}>
              {CROPPING_PERIODS.map((period) => <option key={period} value={period}>{period} cropping</option>)}
            </select>
          </label>
          <label className={labelClass}>Year
            <select value={filters.year} onChange={(event) => updateFilters({ year: Number(event.target.value) })} className={inputClass}>
              {yearOptions(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className={labelClass}>From month
            <select value={filters.fromMonth} onChange={(event) => updateFilters({ fromMonth: Number(event.target.value) })} className={inputClass}>
              {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </label>
          <label className={labelClass}>To month
            <select value={filters.toMonth} onChange={(event) => updateFilters({ toMonth: Number(event.target.value) })} className={inputClass}>
              {MONTHS.map((month, index) => <option key={month} value={index + 1} disabled={index + 1 < filters.fromMonth}>{month}</option>)}
            </select>
          </label>
          <label className={`${labelClass} col-span-2 md:col-span-1`}>Machine
            <select value={filters.machineryId} onChange={(event) => updateFilters({ machineryId: event.target.value })} className={inputClass}>
              <option value="">All machines</option>
              {machinery.map((machine) => <option key={machine.id} value={machine.id}>{machineLabel(machine)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className={dirty ? 'font-medium text-amber-700' : 'text-gray-600'}>
            {!form ? 'Loading the form…'
              : dirty ? 'Unsaved changes. The exports use what is on screen.'
                : form.saved ? `Form saved for the ${filters.croppingPeriod} cropping of ${filters.year}.`
                  : `No form saved yet for the ${filters.croppingPeriod} cropping of ${filters.year}; the header is taken from the last one.`}
          </span>
          <button type="button" onClick={() => void loadReport()} disabled={loading || !formReady} className="inline-flex items-center gap-1 font-semibold text-green-700 hover:text-green-900 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh figures
          </button>
        </div>
      </SectionCard>

      {warnings.length > 0 && (
        <details open={toReview > 0} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)]">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">
            Checks before submitting · {toReview ? `${toReview} to review` : 'nothing to fix'}
          </summary>
          <ul className="mt-3 space-y-2">
            {warnings.map((warning) => {
              const style = WARNING_STYLE[warning.level];
              const Icon = style.icon;
              return (
                <li key={`${warning.machine}-${warning.code}`} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${style.className}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{warning.machine}:</strong> {warning.message}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div role="tablist" aria-label="Pages of the PhilMech form" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {SHEETS.map((entry) => (
          <button key={entry.id} type="button" role="tab" aria-selected={sheet === entry.id} onClick={() => setSheet(entry.id)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold ${sheet === entry.id ? 'bg-emerald-700 text-white shadow-sm' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            {entry.label}
          </button>
        ))}
      </div>

      {!ready || !report || !draft ? (
        <SectionCard><p className="py-8 text-center text-sm text-gray-500">Loading the report…</p></SectionCard>
      ) : sheet === 'utilization' ? (
        <UtilizationSheet
          report={report}
          form={draft}
          filters={filters}
          years={yearOptions(currentYear)}
          onForm={updateForm}
          onFilters={updateFilters}
          machineActions={editableMachines.length > 0 && onEditMachine ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              Date of delivery and status come from each machine&apos;s details:
              {editableMachines.map((machine) => (
                <button key={machine.id} type="button" onClick={() => onEditMachine(machine)} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
                  <Settings2 className="h-3.5 w-3.5" />{machine.name}
                </button>
              ))}
            </p>
          ) : null}
        />
      ) : sheet === 'cashflow' ? (
        <CashflowSheet
          report={report}
          form={draft}
          cash={cash}
          cashChanged={changedCash.length > 0}
          savingCash={savingCash}
          onCash={(machineryId: string, field: CashInputRow, value: string) => setCash((current) => ({ ...current, [machineryId]: { ...current[machineryId], [field]: value } }))}
          onSaveCash={() => void saveCash()}
        />
      ) : (
        <ClientsSheet report={report} form={draft} />
      )}
    </div>
  );
}
