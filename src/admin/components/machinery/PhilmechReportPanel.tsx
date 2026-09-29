import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Info, Printer, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { SectionCard } from '../../../app/components/common/UiKit';
import type { Machinery } from '../../../app/services/authApi';
import { CROPPING_PERIODS, fetchPhilmechReport, savePeriodBalance, type CroppingPeriod, type PhilmechReport, type ReportMachine } from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday } from '../../../utils/dateTime';
import {
  CASHFLOW_TITLE, REPORT_TITLE, downloadReportExcel, downloadReportPdf, formatValue, machineTables, periodText, printReport, type ReportHeader, type Table,
} from './philmechExport';
import { MONTHS, inputClass, labelClass, peso, primaryButton, secondaryButton, yearOptions } from './shared';

const HEADER_KEY = 'acifac.philmechReportHeader';
const DEFAULT_HEADER: ReportHeader = { fcaName: 'Amnay-Cabagan Irrigators and Farmers Agriculture Cooperative (ACIFAC)', address: '', contactPerson: '', preparedBy: '', approvedBy: '' };

// The header is the same on every report, so it is remembered in this browser.
function loadHeader(): ReportHeader {
  try {
    const saved = window.localStorage.getItem(HEADER_KEY);
    return saved ? { ...DEFAULT_HEADER, ...(JSON.parse(saved) as Partial<ReportHeader>) } : DEFAULT_HEADER;
  } catch {
    return DEFAULT_HEADER;
  }
}

// Only names, addresses and long details wrap; dates, rates and amounts stay on one line.
const WRAPPING_COLUMNS = new Set(['Name', 'Address', 'Details']);

function ReportTable({ table }: { table: Table }) {
  const alignment = (index: number, kind: string) => [
    index >= table.numericFrom && kind !== 'text' ? 'text-right tabular-nums' : '',
    WRAPPING_COLUMNS.has(table.head[index]) ? 'min-w-[9rem]' : 'whitespace-nowrap',
  ].join(' ');
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold text-gray-900">{table.title}</h4>
      <div className="relative overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600">
            <tr>{table.head.map((label, index) => <th key={`${label}-${index}`} className={`px-3 py-2 ${index >= table.numericFrom ? 'text-right' : ''}`}>{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={row.strong ? 'bg-green-50/50 font-semibold' : ''}>
                {row.cells.map((value, index) => <td key={index} className={`px-3 py-2 align-top text-gray-800 ${alignment(index, value.kind)}`}>{formatValue(value)}</td>)}
              </tr>
            ))}
            {table.rows.length === 0 && <tr><td colSpan={table.head.length} className="px-3 py-6 text-center text-gray-500">No records for this cropping.</td></tr>}
          </tbody>
          {table.foot && table.rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <tr>{table.foot.cells.map((value, index) => <td key={index} className={`px-3 py-2 text-gray-900 ${alignment(index, value.kind)}`}>{formatValue(value)}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function BeginningCash({ machine, report, onSaved }: { machine: ReportMachine; report: PhilmechReport; onSaved: () => void }) {
  const [values, setValues] = useState({ beginningCash: machine.cashFlow.beginningCash.toFixed(2), otherIncome: machine.cashFlow.otherIncome.toFixed(2) });
  const [saving, setSaving] = useState(false);
  useEffect(() => setValues({ beginningCash: machine.cashFlow.beginningCash.toFixed(2), otherIncome: machine.cashFlow.otherIncome.toFixed(2) }), [machine.cashFlow.beginningCash, machine.cashFlow.otherIncome]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await savePeriodBalance({ machineryId: machine.machineryId, croppingPeriod: report.croppingPeriod, year: report.year, ...values });
      toast.success('Beginning cash saved');
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the beginning cash.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid grid-cols-1 gap-3 rounded-xl border border-dashed border-gray-300 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className={labelClass}>a. Beginning cash (₱)
        <input inputMode="decimal" value={values.beginningCash} onChange={(event) => setValues({ ...values, beginningCash: event.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>Other income (₱)
        <input inputMode="decimal" value={values.otherIncome} onChange={(event) => setValues({ ...values, otherIncome: event.target.value })} className={inputClass} />
      </label>
      <button type="submit" disabled={saving} className={secondaryButton}>{saving ? 'Saving…' : 'Save'}</button>
    </form>
  );
}

const WARNING_STYLE = {
  error: { icon: XCircle, className: 'border-red-200 bg-red-50 text-red-900' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-900' },
  info: { icon: Info, className: 'border-gray-200 bg-gray-50 text-gray-700' },
};

export function PhilmechReportPanel({ machinery }: { machinery: Machinery[] }) {
  const currentYear = Number(dateOnlyToday().slice(0, 4));
  const [params, setParams] = useState({ croppingPeriod: '1st' as CroppingPeriod, year: currentYear, fromMonth: 1, toMonth: 7, useMonths: true, machineryId: '' });
  const [header, setHeader] = useState<ReportHeader>(loadHeader);
  const [report, setReport] = useState<PhilmechReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  // An implement's records are reported under its tractor, so choosing one shows that tractor's report.
  const machineLabel = (machine: Machinery) => {
    const parent = machinery.find((row) => row.id === machine.parentMachineryId);
    return parent ? `${machine.name} (on ${parent.name})` : machine.name;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await fetchPhilmechReport({
        croppingPeriod: params.croppingPeriod,
        year: params.year,
        fromMonth: params.useMonths ? params.fromMonth : null,
        toMonth: params.useMonths ? params.toMonth : null,
        machineryId: params.machineryId || undefined,
      }));
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to generate the report.'));
    } finally {
      setLoading(false);
    }
  }, [params]);
  useEffect(() => { void load(); }, [load]);
  useLiveRefresh(['machinery_services', 'machinery_service_payments', 'machinery_expenses', 'machinery_period_balances', 'machinery_service_rates', 'machinery'], () => { void load(); }, 1000);

  const updateHeader = (field: keyof ReportHeader, value: string) => {
    const next = { ...header, [field]: value };
    setHeader(next);
    try { window.localStorage.setItem(HEADER_KEY, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  };

  const exportAs = async (kind: 'print' | 'pdf' | 'excel') => {
    if (!report) return;
    setExporting(kind);
    try {
      if (kind === 'print') printReport(report, header);
      else if (kind === 'pdf') await downloadReportPdf(report, header);
      else await downloadReportExcel(report, header);
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to export the report.'));
    } finally {
      setExporting('');
    }
  };

  const warningCount = report?.machines.reduce((sum, machine) => sum + machine.warnings.filter((warning) => warning.level !== 'info').length, 0) ?? 0;

  return (
    <div className="space-y-4">
      <SectionCard title="PhilMech Utilization Report" description={`${REPORT_TITLE} and ${CASHFLOW_TITLE}.`}
        actions={<>
          <button type="button" onClick={() => void exportAs('print')} disabled={!report || Boolean(exporting)} className={secondaryButton}><Printer className="h-4 w-4" />Print</button>
          <button type="button" onClick={() => void exportAs('pdf')} disabled={!report || Boolean(exporting)} className={secondaryButton}><Download className="h-4 w-4" />{exporting === 'pdf' ? 'Preparing…' : 'PDF'}</button>
          <button type="button" onClick={() => void exportAs('excel')} disabled={!report || Boolean(exporting)} className={primaryButton}><FileSpreadsheet className="h-4 w-4" />{exporting === 'excel' ? 'Preparing…' : 'Excel'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <label className={labelClass}>Cropping period
            <select value={params.croppingPeriod} onChange={(event) => setParams({ ...params, croppingPeriod: event.target.value as CroppingPeriod })} className={inputClass}>
              {CROPPING_PERIODS.map((period) => <option key={period} value={period}>{period} cropping</option>)}
            </select>
          </label>
          <label className={labelClass}>Year
            <select value={params.year} onChange={(event) => setParams({ ...params, year: Number(event.target.value) })} className={inputClass}>
              {yearOptions(currentYear).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className={labelClass}>From month
            <select value={params.fromMonth} disabled={!params.useMonths} onChange={(event) => { const fromMonth = Number(event.target.value); setParams({ ...params, fromMonth, toMonth: Math.max(fromMonth, params.toMonth) }); }} className={inputClass}>
              {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </label>
          <label className={labelClass}>To month
            <select value={params.toMonth} disabled={!params.useMonths} onChange={(event) => setParams({ ...params, toMonth: Number(event.target.value) })} className={inputClass}>
              {MONTHS.map((month, index) => <option key={month} value={index + 1} disabled={index + 1 < params.fromMonth}>{month}</option>)}
            </select>
          </label>
          <label className={`${labelClass} col-span-2`}>Machine
            <select value={params.machineryId} onChange={(event) => setParams({ ...params, machineryId: event.target.value })} className={inputClass}>
              <option value="">All machines in this cropping</option>
              {machinery.map((machine) => <option key={machine.id} value={machine.id}>{machineLabel(machine)}</option>)}
            </select>
          </label>
          <label className="col-span-2 inline-flex items-center gap-2 text-sm text-gray-700 md:col-span-6">
            <input type="checkbox" checked={params.useMonths} onChange={(event) => setParams({ ...params, useMonths: event.target.checked })} />
            Report covers these months (records dated outside them are flagged)
          </label>
        </div>

        <details className="mt-4 rounded-xl border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">Report header · {header.fcaName || 'FCA name not set'}</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([['fcaName', 'FCA name'], ['address', 'Address'], ['contactPerson', 'Contact person'], ['preparedBy', 'Prepared by'], ['approvedBy', 'Approved by']] as Array<[keyof ReportHeader, string]>).map(([field, label]) => (
              <label key={field} className={labelClass}>{label}
                <input value={header[field]} onChange={(event) => updateHeader(field, event.target.value)} maxLength={200} className={inputClass} />
              </label>
            ))}
          </div>
        </details>
      </SectionCard>

      {report && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
          <span>{periodText(report)} · {report.machines.length} machine{report.machines.length === 1 ? '' : 's'}{warningCount ? ` · ${warningCount} check${warningCount === 1 ? '' : 's'} to review` : ''}</span>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:text-green-900"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      )}

      {report?.machines.map((machine) => (
        <SectionCard key={machine.machineryId} title={machine.name}
          description={`${machine.machineryId}${machine.implements.length ? ` · with ${machine.implements.map((row) => row.name).join(', ')}` : ''} · ${machine.clients.length} service${machine.clients.length === 1 ? '' : 's'} · net cash flow ${peso(machine.cashFlow.netCashFlow)}`}>
          <div className="space-y-5">
            {machine.warnings.length > 0 && (
              <ul className="space-y-2">
                {machine.warnings.map((warning) => {
                  const style = WARNING_STYLE[warning.level];
                  const Icon = style.icon;
                  return <li key={warning.code} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${style.className}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" />{warning.message}</li>;
                })}
              </ul>
            )}
            {machineTables(machine).map((table) => (
              <div key={table.title} className="space-y-3">
                <ReportTable table={table} />
                {table.title.startsWith('IV.') && <BeginningCash machine={machine} report={report} onSaved={() => void load()} />}
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
      {report && report.machines.length === 0 && (
        <SectionCard><p className="py-6 text-center text-sm text-gray-500">No machine has services, expenses or per-service pricing for this cropping.</p></SectionCard>
      )}
    </div>
  );
}
