import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CROPPING_PERIODS, PROBLEM_GROUPS, type CroppingPeriod, type PhilmechReport, type ReportForm, type ReportProblem } from '../../../app/services/machineryApi';
import {
  CASHFLOW_TITLE, CASH_INPUT_ROWS, CLIENTS_TITLE, DISCLAIMER, FARM_OPERATIONS, INSTRUCTIONS, REPORT_TITLE, approvedCaption, cashflowGrid, clientGrid,
  monthsText, problemsNone, slashDate, utilizationGrid, type CashInputRow, type Grid, type GridCell, type GridRow,
} from './philmechExport';
import { MONTHS, primaryButton } from './shared';

// The three pages of the PhilMech form drawn like the paper, with inputs where
// the paper has blanks and the machine figures in its tables.

export interface ReportFilters { croppingPeriod: CroppingPeriod; year: number; fromMonth: number; toMonth: number; machineryId: string }
export type CashValues = Record<string, Record<CashInputRow, string>>;

const BLANK = 'min-w-0 flex-1 border-0 border-b border-slate-500 bg-transparent px-1 py-0.5 text-sm font-semibold uppercase text-slate-900 placeholder:font-normal placeholder:normal-case placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none';
const PLAIN_BLANK = `${BLANK} normal-case`;
const SELECT = 'border-0 border-b border-slate-500 bg-transparent px-1 py-0.5 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none';
const CELL = 'border border-slate-500 px-1.5 py-1 align-middle';
const NBSP = '\u00a0';
// The paper tables scroll sideways through an inline style, not the
// overflow-x-auto class: mobile.css keeps headings of .overflow-x-auto tables on
// one line and widens their cells on phones, which breaks the form's columns.
const SCROLL = { overflowX: 'auto' } as const;

function Paper({ label, children }: { label: string; children: ReactNode }) {
  return <section aria-label={label} className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-5 shadow-sm sm:px-6">{children}</section>;
}

function Title({ children }: { children: ReactNode }) {
  return <h3 className="my-4 text-center text-sm font-bold uppercase tracking-wide text-slate-900 underline underline-offset-4 sm:text-base">{children}</h3>;
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 items-end gap-2 ${className}`}>
      <span className="shrink-0 pb-0.5 text-sm font-bold text-slate-800">{label}:</span>
      {children}
    </label>
  );
}

function Shown({ value, className = '' }: { value: string; className?: string }) {
  return <span className={`min-w-0 flex-1 border-b border-slate-500 px-1 pb-0.5 text-sm font-semibold uppercase text-slate-900 ${className}`}>{value || NBSP}</span>;
}

function Choice({ type = 'checkbox', name, checked, label, onChange }: { type?: 'checkbox' | 'radio'; name?: string; checked: boolean; label: string; onChange?: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-slate-800">
      <input type={type} name={name} checked={checked} disabled={!onChange} onChange={(event) => onChange?.(event.target.checked)} className="h-4 w-4 shrink-0 accent-emerald-600" />
      {label}
    </label>
  );
}

function Group({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      <span className="text-sm font-bold text-slate-800">{label}:</span>
      {children}
    </div>
  );
}

/**
 * A table built in philmechExport, drawn with the paper's borders. `widths`
 * replaces the PDF column widths where the screen font needs other proportions;
 * `dense` fits a wide table such as page 1 into the page.
 */
export function GridTable({ grid, renderCell, widths = grid.widths, dense = false, className = 'min-w-[960px]', empty = 'No records for this cropping.' }: {
  grid: Grid;
  renderCell?: (row: GridRow, cell: GridCell) => ReactNode | undefined;
  widths?: number[];
  dense?: boolean;
  className?: string;
  empty?: string;
}) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const cellClass = (cell: GridCell) => [
    CELL,
    dense ? 'px-1' : '',
    cell.align === 'right' ? 'whitespace-nowrap text-right tabular-nums' : cell.align === 'center' ? 'text-center' : 'text-left',
    cell.bold ? 'font-bold' : '',
    cell.indent ? 'pl-6' : '',
  ].join(' ');
  return (
    <div style={SCROLL}>
      <table className={`w-full table-fixed border-collapse ${dense ? 'text-[11px]' : 'text-xs'} text-slate-900 ${className}`}>
        <colgroup>{widths.map((width, index) => <col key={index} style={{ width: `${(width / total) * 100}%` }} />)}</colgroup>
        <thead className="bg-slate-50 text-[11px] text-slate-800">
          {grid.head.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.cells.map((cell, index) => (
                <th key={index} scope="col" colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={cellClass(cell)}>
                  {cell.text}
                  {cell.note && <span className="mt-0.5 block text-[10px] font-normal italic leading-snug text-slate-600">{cell.note}</span>}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {grid.body.map((row, rowIndex) => (
            <tr key={row.key ?? rowIndex}>
              {row.cells.map((cell, index) => <td key={index} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={cellClass(cell)}>{renderCell?.(row, cell) ?? cell.text}</td>)}
            </tr>
          ))}
          {grid.body.length === 0 && <tr><td colSpan={grid.widths.length} className={`${CELL} py-6 text-center text-slate-500`}>{empty}</td></tr>}
        </tbody>
        {grid.foot && grid.body.length > 0 && (
          <tfoot className="bg-slate-50">
            {grid.foot.map((row, rowIndex) => <tr key={rowIndex}>{row.cells.map((cell, index) => <td key={index} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={cellClass(cell)}>{cell.text}</td>)}</tr>)}
          </tfoot>
        )}
      </table>
    </div>
  );
}

function TopBoxes({ form, onDate }: { form: ReportForm; onDate?: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:justify-between">
      <p className="border border-slate-600 px-2 py-1 text-xs font-bold italic text-slate-800">{INSTRUCTIONS}</p>
      <label className="flex shrink-0 items-center gap-2 border border-slate-600 px-2 py-1 text-xs font-bold italic text-slate-800">
        Date of Submission:
        {onDate
          ? <input type="date" value={form.submissionDate} onChange={(event) => onDate(event.target.value)} className="border-0 border-b border-slate-500 bg-transparent px-1 text-sm font-semibold not-italic text-slate-900 focus:border-emerald-600 focus:outline-none" />
          : <span className="min-w-[6rem] border-b border-slate-500 px-1 text-sm not-italic">{slashDate(form.submissionDate || null) || NBSP}</span>}
      </label>
    </div>
  );
}

type SignatureField = 'preparedBy' | 'preparedByPosition' | 'approvedBy' | 'approvedByPosition';

function Signatures({ form, onChange }: { form: ReportForm; onChange?: (field: SignatureField, value: string) => void }) {
  const slot = (field: SignatureField, caption: string, className: string) => (
    <label className={`flex min-w-0 flex-col items-center ${className}`}>
      {onChange
        ? <input value={form[field]} onChange={(event) => onChange(field, event.target.value)} maxLength={field.endsWith('Position') ? 100 : 200} className={`${BLANK} w-full text-center`} />
        : <Shown value={form[field]} className="w-full text-center" />}
      <span className="mt-0.5 text-center text-[11px] font-bold text-slate-600">{caption}</span>
    </label>
  );
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div>
        <p className="text-sm font-bold text-slate-800">Prepared by:</p>
        <div className="mt-1 flex items-start gap-2">
          {slot('preparedBy', 'Name and Signature', 'flex-[3]')}
          <span className="pt-1 font-bold">/</span>
          {slot('preparedByPosition', 'Position or Designation', 'flex-[2]')}
        </div>
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800">Reviewed/Approved by:</p>
        <div className="mt-1 flex items-start gap-2">
          {slot('approvedBy', approvedCaption(form), 'flex-[3]')}
          {onChange && slot('approvedByPosition', 'Position', 'flex-[2]')}
        </div>
      </div>
    </div>
  );
}

function Problems({ form, onForm }: { form: ReportForm; onForm: (patch: Partial<ReportForm>) => void }) {
  const toggle = (code: ReportProblem, checked: boolean) => onForm({ problems: checked ? [...form.problems, code] : form.problems.filter((value) => value !== code) });
  const note = 'h-full min-h-[15rem] w-full resize-y border-0 bg-transparent p-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600';
  return (
    <div className="mt-5" style={SCROLL}>
      <table className="w-full min-w-[960px] table-fixed border-collapse text-xs text-slate-900">
        <colgroup>{[16, 16, 16, 16, 18, 18].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead className="bg-slate-50 text-[11px] text-slate-800">
          <tr>
            <th colSpan={4} scope="col" className={`${CELL} text-left font-bold`}>
              Problems Encountered (if there&apos;s any){problemsNone(form) && <span className="ml-3 underline">N/A</span>}
            </th>
            <th scope="col" className={`${CELL} font-bold`}>Suggested Solutions/ Recommendations</th>
            <th scope="col" className={`${CELL} font-bold`}>Other Comments/ Suggestions</th>
          </tr>
        </thead>
        <tbody>
          {PROBLEM_GROUPS.map((group, index) => {
            const others = form[group.othersField];
            return (
              <Fragment key={group.title}>
                <tr>
                  <td colSpan={4} className={`${CELL} bg-slate-50/60 font-bold`}>{group.title}</td>
                  {index === 0 && (
                    <>
                      <td rowSpan={7} className={`${CELL} p-0 align-top`}>
                        <textarea aria-label="Suggested solutions / recommendations" value={form.suggestedSolutions} onChange={(event) => onForm({ suggestedSolutions: event.target.value })} maxLength={2000} className={note} />
                      </td>
                      <td rowSpan={7} className={`${CELL} p-0 align-top`}>
                        <textarea aria-label="Other comments / suggestions" value={form.otherComments} onChange={(event) => onForm({ otherComments: event.target.value })} maxLength={2000} className={note} />
                      </td>
                    </>
                  )}
                </tr>
                <tr>
                  {group.items.map((item) => (
                    <td key={item.code} className={`${CELL} py-1.5`}>
                      {/* Labels are 16px by default (theme.css); the form's cells use the table's size. */}
                      <label className="flex items-start gap-2 text-xs font-normal">
                        <input type="checkbox" checked={form.problems.includes(item.code)} onChange={(event) => toggle(item.code, event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
                        {item.label}
                      </label>
                    </td>
                  ))}
                  <td className={`${CELL} py-1.5`}>
                    <label className="block text-xs font-normal">
                      <span className="flex items-center gap-2">
                        {/* Ticked on the form when something is written here. */}
                        <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-none border border-slate-500 text-[11px] font-bold text-emerald-700">{others.trim() ? '✓' : ''}</span>
                        Others (Pls Specify):
                      </span>
                      <input value={others} onChange={(event) => onForm({ [group.othersField]: event.target.value } as Partial<ReportForm>)} maxLength={500} className={`${PLAIN_BLANK} mt-1 w-full text-xs`} />
                    </label>
                  </td>
                </tr>
              </Fragment>
            );
          })}
          <tr>
            <td colSpan={4} className={`${CELL} py-1.5`}>
              <label className="flex items-end gap-2 text-xs font-normal">
                <span className="shrink-0 font-bold">Other Problems Encountered:</span>
                <input value={form.otherProblems} onChange={(event) => onForm({ otherProblems: event.target.value })} maxLength={1000} className={PLAIN_BLANK} />
              </label>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Page 1's columns on screen: amounts and dates get room for the screen font.
const UTILIZATION_SCREEN_WIDTHS = [25, 17, 25, 23, 23, 13, 14, 13, 14, 23, 23, 24, 23, 24];

/** Page 1: Farm Machinery Utilization Report and Feedback Form. */
export function UtilizationSheet({ report, form, filters, years, onForm, onFilters, machineActions }: {
  report: PhilmechReport;
  form: ReportForm;
  filters: ReportFilters;
  years: number[];
  onForm: (patch: Partial<ReportForm>) => void;
  onFilters: (patch: Partial<ReportFilters>) => void;
  machineActions?: ReactNode;
}) {
  return (
    <Paper label={REPORT_TITLE}>
      <TopBoxes form={form} onDate={(submissionDate) => onForm({ submissionDate })} />
      <Title>{REPORT_TITLE}</Title>
      <div className="grid gap-x-10 gap-y-3 lg:grid-cols-[3fr_2fr]">
        <Field label="Name of FCA" className="lg:col-span-2"><input value={form.fcaName} onChange={(event) => onForm({ fcaName: event.target.value })} maxLength={200} className={BLANK} /></Field>
        <Field label="Address"><input value={form.address} onChange={(event) => onForm({ address: event.target.value })} maxLength={300} className={BLANK} /></Field>
        <Field label="Contact Number"><input type="tel" inputMode="tel" value={form.contactNumber} onChange={(event) => onForm({ contactNumber: event.target.value })} maxLength={40} className={BLANK} /></Field>
        <Field label="Contact Person"><input value={form.contactPerson} onChange={(event) => onForm({ contactPerson: event.target.value })} maxLength={200} className={BLANK} /></Field>
        <div className="flex flex-wrap items-end gap-x-2 gap-y-2 text-sm text-slate-800">
          <span className="font-bold">Inclusive Months:</span>
          <select aria-label="First month" value={filters.fromMonth} onChange={(event) => onFilters({ fromMonth: Number(event.target.value) })} className={SELECT}>
            {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
          </select>
          <span>to</span>
          <select aria-label="Last month" value={filters.toMonth} onChange={(event) => onFilters({ toMonth: Number(event.target.value) })} className={SELECT}>
            {MONTHS.map((month, index) => <option key={month} value={index + 1} disabled={index + 1 < filters.fromMonth}>{month}</option>)}
          </select>
          <span className="ml-3 font-bold">Year:</span>
          <select aria-label="Year" value={filters.year} onChange={(event) => onFilters({ year: Number(event.target.value) })} className={SELECT}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <Group label="Cropping Period" className="lg:col-span-2">
          {CROPPING_PERIODS.map((period) => (
            <Choice key={period} type="radio" name="philmech-cropping" checked={filters.croppingPeriod === period} label={`${period} cropping`} onChange={() => onFilters({ croppingPeriod: period })} />
          ))}
        </Group>
        <Group label="Type of Farm Operation" className="lg:col-span-2">
          {FARM_OPERATIONS.map((operation) => (
            <Choice key={operation.field} checked={form[operation.field]} label={operation.label} onChange={(checked) => onForm({ [operation.field]: checked } as Partial<ReportForm>)} />
          ))}
        </Group>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 text-sm text-slate-800 lg:col-span-2">
          <span className="font-bold">Present Buying Price of Palay in your Area (Php):</span>
          <label className="flex items-end gap-1">Fresh (Sariwa)
            <input inputMode="decimal" value={form.palayPriceFresh} onChange={(event) => onForm({ palayPriceFresh: event.target.value })} placeholder="0.00" className={`${BLANK} w-20 flex-none text-center`} />/kilo
          </label>
          <label className="flex items-end gap-1">Dry (Tuyo)
            <input inputMode="decimal" value={form.palayPriceDry} onChange={(event) => onForm({ palayPriceDry: event.target.value })} placeholder="0.00" className={`${BLANK} w-20 flex-none text-center`} />/kilo
          </label>
        </div>
      </div>

      <div className="mt-4">
        <GridTable grid={utilizationGrid(report)} widths={UTILIZATION_SCREEN_WIDTHS} dense empty="No machine has services, expenses or per-service pricing for this cropping." />
      </div>
      {machineActions}
      <Problems form={form} onForm={onForm} />
      <Signatures form={form} onChange={(field, value) => onForm({ [field]: value } as Partial<ReportForm>)} />
      <p className="mt-5 text-[11px] font-bold italic text-slate-600">{DISCLAIMER}</p>
    </Paper>
  );
}

function HeaderLines({ report, form }: { report: PhilmechReport; form: ReportForm }) {
  return (
    <div className="grid gap-x-10 gap-y-3 lg:grid-cols-[3fr_2fr]">
      <Field label="Name of FCA" className="lg:col-span-2"><Shown value={form.fcaName} /></Field>
      <Field label="Address"><Shown value={form.address} /></Field>
      <Field label="Contact Number"><Shown value={form.contactNumber} /></Field>
      <Field label="Contact Person"><Shown value={form.contactPerson} /></Field>
      <Group label="Cropping Period" className="lg:col-span-2">
        {CROPPING_PERIODS.map((period) => <Choice key={period} checked={report.croppingPeriod === period} label={`${period} cropping`} />)}
        <span className="text-sm text-slate-600">({monthsText(report)} {report.year})</span>
      </Group>
    </div>
  );
}

/** Page 2: Cashflow Statement, with the beginning cash and other income typed in. */
export function CashflowSheet({ report, form, cash, cashChanged, savingCash, onCash, onSaveCash }: {
  report: PhilmechReport;
  form: ReportForm;
  cash: CashValues;
  cashChanged: boolean;
  savingCash: boolean;
  onCash: (machineryId: string, field: CashInputRow, value: string) => void;
  onSaveCash: () => void;
}) {
  const inputRows: readonly string[] = CASH_INPUT_ROWS;
  return (
    <Paper label={CASHFLOW_TITLE}>
      <p className="text-[11px] font-bold italic text-slate-600">{DISCLAIMER}</p>
      <Title>{CASHFLOW_TITLE}</Title>
      <HeaderLines report={report} form={form} />
      <div className="mt-4">
        <GridTable
          grid={cashflowGrid(report)}
          className="min-w-[860px]"
          renderCell={(row, cell) => {
            if (!cell.machineId || !row.key || !inputRows.includes(row.key)) return undefined;
            const field = row.key as CashInputRow;
            const machine = report.machines.find((entry) => entry.machineryId === cell.machineId);
            return (
              <input
                aria-label={`${field === 'beginningCash' ? 'Operating cash at the beginning' : 'Other income'} of ${machine?.name ?? cell.machineId}`}
                inputMode="decimal"
                value={cash[cell.machineId]?.[field] ?? ''}
                onChange={(event) => onCash(cell.machineId ?? '', field, event.target.value)}
                className="w-full rounded border border-amber-300 bg-amber-50/70 px-1.5 py-0.5 text-right text-xs font-semibold tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            );
          }}
        />
      </div>
      <div className="mt-2 flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Type each machine&apos;s operating cash at the beginning and other income in the highlighted boxes. Service fees come from{' '}
          <Link to="/machinery?tab=services" className="font-semibold text-emerald-700 hover:underline">Services</Link> and expenses from{' '}
          <Link to="/machinery?tab=expenses" className="font-semibold text-emerald-700 hover:underline">Expenses</Link>.
        </p>
        <button type="button" onClick={onSaveCash} disabled={!cashChanged || savingCash} className={`${primaryButton} shrink-0`}>{savingCash ? 'Saving…' : 'Save cash amounts'}</button>
      </div>
      <Signatures form={form} />
    </Paper>
  );
}

/** Page 3: List of Farmers Clients, one per machine. */
export function ClientsSheet({ report, form }: { report: PhilmechReport; form: ReportForm }) {
  if (!report.machines.length) {
    return <Paper label={CLIENTS_TITLE}><p className="py-6 text-center text-sm text-slate-500">No machine has services for this cropping.</p></Paper>;
  }
  return (
    <div className="space-y-4">
      {report.machines.map((machine) => (
        <Paper key={machine.machineryId} label={`${CLIENTS_TITLE}: ${machine.name}`}>
          <TopBoxes form={form} />
          <Title>{CLIENTS_TITLE}</Title>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">Farm Machinery: <span className="ml-1 border-b border-slate-500 px-2 uppercase">{machine.name}</span></p>
            <Link to="/machinery?tab=services" className="text-xs font-semibold text-emerald-700 hover:underline">Add or correct services</Link>
          </div>
          <GridTable grid={clientGrid(machine)} className="min-w-[900px]" empty="No services recorded for this machine in this cropping." />
          <Signatures form={form} />
        </Paper>
      ))}
    </div>
  );
}
