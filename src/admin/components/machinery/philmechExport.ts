// The PhilMech report as ACIFAC submits it, laid out like the paper:
//   1. Farm Machinery Utilization Report and Feedback Form
//   2. Cashflow Statement of Farm Machinery Operation per Cropping
//   3. List of Farmers Clients, one per machine
// The tables (with the paper's merged headings) are built once here and drawn
// on screen, in the print window, as PDF and as Excel, so every copy shows the
// same figures. The figures come from the backend; nothing is recomputed here
// except column totals, which are added in centavos.
import {
  CROPPING_PERIODS, PROBLEM_GROUPS, type MachineCondition, type PhilmechReport, type ReportForm, type ReportMachine, type ServiceUnit,
} from '../../../app/services/machineryApi';
import type { CellDef, UserOptions } from 'jspdf-autotable';
import { escapeHtml } from '../../../utils/html';
import { MONTHS } from './shared';

export const REPORT_TITLE = 'Farm Machinery Utilization Report and Feedback Form';
export const CASHFLOW_TITLE = 'Cashflow Statement of Farm Machinery Operation per Cropping';
export const CLIENTS_TITLE = 'List of Farmers Clients';
export const INSTRUCTIONS = 'Instructions: Please supply the required information below by filling in the blanks and ticking appropriate information in the selections.';
export const DISCLAIMER = 'Disclaimer: The contents of this form will be used solely for monitoring purposes of PhilMech and will be treated with utmost confidentiality. This form is for enrollment to PhilMech-IMS.';
export const STATUS_HELP = 'Operational (being used for its intended purpose) / Non-Operational (not being used due to technical problems / for repair) / Functional (ready for use but presently idle due to organizational problems or other issues)';
export const FARM_OPERATIONS = [
  { field: 'landPreparation', label: 'Land Preparation and Plant Establishment' },
  { field: 'harvestingThreshing', label: 'Harvesting and Threshing' },
] as const;

export const STATUS_TEXT: Record<MachineCondition, string> = {
  operational: 'OPERATIONAL',
  non_operational: 'NON-OPERATIONAL',
  always_repair: 'ALWAYS REPAIR',
  idle: 'FUNCTIONAL (IDLE)',
};

// ----- Cells and tables --------------------------------------------------------------------------

export interface GridCell {
  text: string;
  /** The number behind the text, written to Excel as a number. */
  value?: number;
  /** Excel number format for `value`. */
  format?: string;
  colSpan?: number;
  rowSpan?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  indent?: boolean;
  /** Small print under a heading. */
  note?: string;
  /** Which machine's figure the cell holds (cash flow columns). */
  machineId?: string;
}
export interface GridRow { key?: string; cells: GridCell[] }
/** `widths` are millimetres on an A4 landscape page; renderers scale them. */
export interface Grid { head: GridRow[]; body: GridRow[]; foot?: GridRow[]; widths: number[] }

const MONEY_FORMAT = '#,##0.00';
const BAGS_FORMAT = 'General" bags"';

const grouped = (value: number, min: number, max: number) => value.toLocaleString('en-PH', { minimumFractionDigits: min, maximumFractionDigits: max });
export const amountText = (value: number) => grouped(value, 2, 2);
export const areaText = (value: number) => grouped(value, 0, 4);
const rateNumber = (value: number) => grouped(value, Number.isInteger(value) ? 0 : 2, 2);
const bagsText = (value: number) => `${grouped(value, 0, 2)} bag${value === 1 ? '' : 's'}`;
const cents = (value: number) => Math.round(value * 100);

const text = (value: string, extra: Partial<GridCell> = {}): GridCell => ({ text: value, ...extra });
const heading = (value: string, extra: Partial<GridCell> = {}): GridCell => ({ text: value, align: 'center', bold: true, ...extra });
const money = (value: number, extra: Partial<GridCell> = {}): GridCell => ({ text: amountText(value), value, format: MONEY_FORMAT, align: 'right', ...extra });
const quantity = (value: number, extra: Partial<GridCell> = {}): GridCell => ({ text: areaText(value), value, align: 'center', ...extra });
const blank = (extra: Partial<GridCell> = {}): GridCell => ({ text: '', ...extra });

// Dates as written on the paper form: delivery "2-21-25", services "2/25/2026", submission "9/25/2026".
function dateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}
export function deliveryText(value: string | null) {
  if (!value) return '';
  const { year, month, day } = dateParts(value);
  return `${month}-${String(day).padStart(2, '0')}-${String(year).slice(2)}`;
}
export function slashDate(value: string | null) {
  if (!value) return '';
  const { year, month, day } = dateParts(value);
  return `${month}/${day}/${year}`;
}

export function monthsText(report: PhilmechReport) {
  const first = report.fromMonth ?? 1;
  const last = report.toMonth ?? 12;
  return first === last ? MONTHS[first - 1] : `${MONTHS[first - 1]} to ${MONTHS[last - 1]}`;
}

export const priceText = (value: string) => (value.trim() === '' || Number.isNaN(Number(value)) ? '' : amountText(Number(value)));

const UNIT_SUFFIX: Record<ServiceUnit, string> = { per_ha: '/ha', per_100_bags: ' bags/100 bags', per_day: '/day' };

// The rate of service for members or non-members during the report months.
// A rate that changed shows each amount in order ("2,800 → 3,800/ha"); a
// machine with several services names each one.
export function rateText(machine: ReportMachine, member: boolean) {
  const byService = new Map<string, ReportMachine['rates']>();
  for (const rate of [...machine.rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) {
    byService.set(rate.serviceType, [...(byService.get(rate.serviceType) ?? []), rate]);
  }
  return [...byService.entries()].map(([service, rates]) => {
    const amounts = rates.map((rate) => (member ? rate.memberRate : rate.nonMemberRate)).filter((amount, index, all) => index === 0 || amount !== all[index - 1]);
    const value = `${amounts.map(rateNumber).join(' → ')}${UNIT_SUFFIX[rates[rates.length - 1].unit]}`;
    return byService.size > 1 ? `${service}: ${value}` : value;
  }).join('; ');
}

function feeText(unit: ServiceUnit, rate: number) {
  if (unit === 'per_100_bags') return `${rateNumber(rate)}/100 bags`;
  if (unit === 'per_day') return `${rateNumber(rate)}/day`;
  return rateNumber(rate);
}

export const machineTitle = (machine: ReportMachine, index: number) => `${index + 1}. ${machine.name.toUpperCase()}`;

/** Page 1: one row per machine, with the paper's three heading rows. */
export function utilizationGrid(report: PhilmechReport): Grid {
  return {
    widths: [28, 14, 29, 25, 25, 13, 14, 13, 14, 20, 20, 20, 20, 19],
    head: [
      {
        cells: [
          heading('Farm Machinery', { rowSpan: 3 }),
          heading('Date of Delivery of Machine', { rowSpan: 3 }),
          heading('Status of Machine', { rowSpan: 3, note: STATUS_HELP }),
          heading('Machinery Utilization Information', { colSpan: 6 }),
          heading('Gross Income (a)', { colSpan: 3, rowSpan: 2 }),
          heading('Operating Expenses (Gastos) (b)', { rowSpan: 3 }),
          heading('Available Funds (including collectibles) (a-b)', { rowSpan: 3 }),
        ],
      },
      {
        cells: [
          heading('Rate of Service Fee (Php)', { colSpan: 2 }),
          heading('Total No. of Farmers Availed the Service', { colSpan: 2, note: 'Bilang ng kliyenteng naserbisyuhan' }),
          heading('Total Area Serviced (ha)', { colSpan: 2, note: 'Kabuuang hektaryang naserbisyuhan' }),
        ],
      },
      {
        cells: ['Member', 'Non-Member', 'Member', 'Non-Member', 'Member', 'Non-Member', 'Collected (Nagbayad)', 'Collectibles (Utang)', 'Total'].map((label) => heading(label)),
      },
    ],
    body: report.machines.map((machine, index) => ({
      key: machine.machineryId,
      cells: [
        text(machineTitle(machine, index), { bold: true }),
        text(deliveryText(machine.deliveryDate), { align: 'center' }),
        text(machine.condition ? STATUS_TEXT[machine.condition] : '', { align: 'center', bold: true }),
        text(rateText(machine, true), { align: 'center' }),
        text(rateText(machine, false), { align: 'center' }),
        quantity(machine.summary.farmers.member),
        quantity(machine.summary.farmers.nonMember),
        quantity(machine.summary.areaHa.member),
        quantity(machine.summary.areaHa.nonMember),
        money(machine.summary.grossIncome.collected),
        money(machine.summary.grossIncome.collectibles),
        money(machine.summary.grossIncome.total),
        money(machine.summary.operatingExpenses),
        money(machine.summary.availableFunds, { bold: true }),
      ],
    })),
  };
}

/** Rows of the cash flow statement whose amounts are typed in, not computed. */
export const CASH_INPUT_ROWS = ['beginningCash', 'otherIncome'] as const;
export type CashInputRow = typeof CASH_INPUT_ROWS[number];

/** Page 2: Machinery 1 to 5 side by side (more columns when there are more machines). */
export function cashflowGrid(report: PhilmechReport): Grid {
  const slots = Array.from({ length: Math.max(5, report.machines.length) }, (_, index) => report.machines[index] ?? null);
  const line = (key: string, label: string, pick: ((machine: ReportMachine) => number) | null, extra: Partial<GridCell> = {}): GridRow => ({
    key,
    cells: [
      text(label, extra),
      ...slots.map((machine) => (machine && pick ? money(pick(machine), { bold: extra.bold, machineId: machine.machineryId }) : blank())),
    ],
  });
  const labelWidth = 62;
  return {
    widths: [labelWidth, ...slots.map(() => (273 - labelWidth) / slots.length)],
    head: [
      { cells: [heading('Amounts in Php', { rowSpan: 2 }), ...slots.map((_, index) => heading(`Machinery ${index + 1}:`))] },
      { cells: slots.map((machine) => heading(machine ? machine.name.toUpperCase() : '')) },
    ],
    body: [
      line('beginningCash', 'Operating Cash-Beginning (a)', (machine) => machine.cashFlow.beginningCash, { bold: true }),
      line('inflows', 'Cash Inflows (Income)', null, { bold: true }),
      line('serviceFees', 'Total Service Fee Collected', (machine) => machine.cashFlow.serviceFeesCollected, { indent: true }),
      line('otherIncome', 'Other Income', (machine) => machine.cashFlow.otherIncome, { indent: true }),
      line('totalInflows', 'Total Cash Inflows (b)', (machine) => machine.cashFlow.totalInflows, { bold: true }),
      line('sourceOfCash', 'Total Source of Cash (c = a + b)', (machine) => machine.cashFlow.totalSourceOfCash, { bold: true }),
      line('outflows', 'Cash Out Flows (Expenses)', null, { bold: true }),
      line('fuel', 'Fuel Expenses (diesel and etc.)', (machine) => machine.cashFlow.outflows.fuel, { indent: true }),
      line('labor', 'Labor Cost', (machine) => machine.cashFlow.outflows.labor, { indent: true }),
      line('repair', 'Repair and Maintenance', (machine) => machine.cashFlow.outflows.repair_maintenance, { indent: true }),
      line('other', 'Other Expenses', (machine) => machine.cashFlow.outflows.other, { indent: true }),
      line('totalOutflows', 'Total Cash Outflows (d)', (machine) => machine.cashFlow.totalOutflows, { bold: true }),
      line('net', 'Net Cash Flow Per Machinery (e = c − d)', (machine) => machine.cashFlow.netCashFlow, { bold: true }),
    ],
  };
}

/**
 * Page 3: the farmer clients of one machine. A harvest paid in bags shows the
 * bags in "Total Amount of Service", as on the paper; its peso value is in the
 * cash collection and accounts receivable columns.
 */
export function clientGrid(machine: ReportMachine): Grid {
  const showService = machine.implements.length > 0 || new Set(machine.clients.map((client) => client.serviceType.toLowerCase())).size > 1;
  const totals = machine.clients.reduce((sum, client) => {
    const paidInBags = client.unit === 'per_100_bags' && client.feeBags !== null;
    return {
      pesos: sum.pesos + (paidInBags ? 0 : cents(client.totalAmount)),
      bags: sum.bags + (paidInBags ? cents(client.feeBags ?? 0) : 0),
      hasPesos: sum.hasPesos || !paidInBags,
      hasBags: sum.hasBags || paidInBags,
      partial: sum.partial + (client.paymentStatus === 'partial' ? cents(client.cashCollection) : 0),
      full: sum.full + (client.paymentStatus === 'full' ? cents(client.cashCollection) : 0),
    };
  }, { pesos: 0, bags: 0, hasPesos: false, hasBags: false, partial: 0, full: 0 });
  const totalAmount: GridCell = totals.hasBags && !totals.hasPesos
    ? { text: bagsText(totals.bags / 100), value: totals.bags / 100, format: BAGS_FORMAT, align: 'right', bold: true }
    : totals.hasBags
      ? text(`${amountText(totals.pesos / 100)} + ${bagsText(totals.bags / 100)}`, { align: 'right', bold: true })
      : money(totals.pesos / 100, { bold: true });

  return {
    widths: showService ? [40, 30, 15, 22, 21, 16, 22, 24, 22, 22, 24] : [46, 36, 16, 23, 17, 24, 26, 24, 24, 27],
    head: [
      {
        cells: [
          heading('Name of Farmer Client', { rowSpan: 2 }),
          heading("Address/ location of client's farm", { rowSpan: 2 }),
          heading('Category', { rowSpan: 2, note: 'M / NM' }),
          ...(showService ? [heading('Type of Service', { rowSpan: 2 })] : []),
          heading('Date of farm machinery service provided', { rowSpan: 2 }),
          heading('Area Serviced (ha)', { rowSpan: 2 }),
          heading('Service Fee (Ha)', { rowSpan: 2 }),
          heading('Total Amount of Service', { rowSpan: 2 }),
          heading('Cash Collection of fees', { colSpan: 2 }),
          heading('Accounts Receivable', { rowSpan: 2 }),
        ],
      },
      { cells: [heading('Partial'), heading('Full')] },
    ],
    body: machine.clients.map((client) => {
      const paidInBags = client.unit === 'per_100_bags' && client.feeBags !== null;
      return {
        key: String(client.serviceId),
        cells: [
          text(client.name.toUpperCase()),
          text(client.address.toUpperCase()),
          text(client.category, { align: 'center' }),
          ...(showService ? [text(client.serviceType.toUpperCase(), { align: 'center' })] : []),
          text(slashDate(client.serviceDate), { align: 'center' }),
          quantity(client.areaHa),
          text(feeText(client.unit, client.rateUsed), { align: 'center' }),
          paidInBags ? { text: bagsText(client.feeBags ?? 0), value: client.feeBags ?? 0, format: BAGS_FORMAT, align: 'right' } : money(client.totalAmount),
          client.paymentStatus === 'partial' ? money(client.cashCollection) : blank(),
          client.paymentStatus === 'full' ? money(client.cashCollection) : blank(),
          client.accountsReceivable > 0 ? money(client.accountsReceivable) : blank(),
        ],
      };
    }),
    foot: [{
      cells: [
        text('TOTAL', { bold: true }),
        blank(),
        blank(),
        ...(showService ? [blank()] : []),
        blank(),
        quantity(machine.clientTotals.areaHa, { bold: true }),
        blank(),
        totalAmount,
        money(totals.partial / 100, { bold: true }),
        money(totals.full / 100, { bold: true }),
        money(machine.clientTotals.accountsReceivable, { bold: true }),
      ],
    }],
  };
}

export const problemsNone = (form: ReportForm) => form.problems.length === 0
  && ![form.organizationOthers, form.technicalOthers, form.financialOthers, form.otherProblems].some((value) => value.trim());

export const approvedCaption = (form: ReportForm) => `Name and Signature of ${form.approvedByPosition.trim() || 'Chairman/ President'}`;

export function fileBaseName(report: PhilmechReport) {
  return `philmech-report-${report.year}-${report.croppingPeriod}-cropping`;
}

// ----- Print --------------------------------------------------------------------------------------

const checkHtml = (checked: boolean, label: string) => `<span class="check"><span class="cb">${checked ? '&#10003;' : ''}</span>${escapeHtml(label)}</span>`;
const lineHtml = (value: string, className = '') => `<span class="line ${className}">${escapeHtml(value) || '&nbsp;'}</span>`;

function gridHtml(grid: Grid, minRows = 0) {
  const total = grid.widths.reduce((sum, width) => sum + width, 0);
  const cell = (tag: 'th' | 'td', value: GridCell) => {
    const classes = [value.align ?? 'left', value.bold ? 'bold' : '', value.indent ? 'indent' : ''].join(' ');
    const spans = `${value.colSpan ? ` colspan="${value.colSpan}"` : ''}${value.rowSpan ? ` rowspan="${value.rowSpan}"` : ''}`;
    return `<${tag} class="${classes}"${spans}>${escapeHtml(value.text)}${value.note ? `<span class="note">${escapeHtml(value.note)}</span>` : ''}</${tag}>`;
  };
  const rows = (list: GridRow[], tag: 'th' | 'td') => list.map((row) => `<tr>${row.cells.map((value) => cell(tag, value)).join('')}</tr>`).join('');
  const padding = Array.from({ length: Math.max(0, minRows - grid.body.length) }, () => `<tr>${grid.widths.map(() => '<td>&nbsp;</td>').join('')}</tr>`).join('');
  return `<table class="grid"><colgroup>${grid.widths.map((width) => `<col style="width:${((width / total) * 100).toFixed(2)}%">`).join('')}</colgroup>
    <thead>${rows(grid.head, 'th')}</thead><tbody>${rows(grid.body, 'td')}${padding}</tbody>${grid.foot ? `<tfoot>${rows(grid.foot, 'td')}</tfoot>` : ''}</table>`;
}

function topBoxesHtml(form: ReportForm) {
  return `<div class="top"><div class="box">${escapeHtml(INSTRUCTIONS)}</div><div class="box date">Date of Submission: ${lineHtml(slashDate(form.submissionDate || null), 'short')}</div></div>`;
}

function signaturesHtml(form: ReportForm) {
  return `<div class="sign">
    <div><span class="label">Prepared by:</span>
      <span class="slot wide">${lineHtml(form.preparedBy)}<small>Name and Signature</small></span> /
      <span class="slot">${lineHtml(form.preparedByPosition)}<small>Position or Designation</small></span></div>
    <div><span class="label">Reviewed/Approved by:</span>
      <span class="slot wide">${lineHtml(form.approvedBy)}<small>${escapeHtml(approvedCaption(form))}</small></span></div>
  </div>`;
}

function problemsHtml(form: ReportForm) {
  const groups = PROBLEM_GROUPS.map((group, index) => `
    <tr><td colspan="4" class="bold">${escapeHtml(group.title)}</td>${index === 0 ? `<td rowspan="7" class="text">${escapeHtml(form.suggestedSolutions)}</td><td rowspan="7" class="text">${escapeHtml(form.otherComments)}</td>` : ''}</tr>
    <tr>${group.items.map((item) => `<td>${checkHtml(form.problems.includes(item.code), item.label)}</td>`).join('')}
      <td>${checkHtml(Boolean(form[group.othersField].trim()), 'Others (Pls Specify):')} ${escapeHtml(form[group.othersField])}</td></tr>`).join('');
  return `<table class="grid problems"><colgroup><col style="width:17%"><col style="width:17%"><col style="width:17%"><col style="width:17%"><col style="width:16%"><col style="width:16%"></colgroup>
    <thead><tr><th colspan="4" class="left">Problems Encountered (if there's any) ${problemsNone(form) ? '<u>N/A</u>' : ''}</th><th>Suggested Solutions/ Recommendations</th><th>Other Comments/ Suggestions</th></tr></thead>
    <tbody>${groups}<tr><td colspan="4"><b>Other Problems Encountered:</b> ${escapeHtml(form.otherProblems)}</td></tr></tbody></table>`;
}

function croppingHtml(report: PhilmechReport) {
  return CROPPING_PERIODS.map((period) => checkHtml(report.croppingPeriod === period, `${period} cropping`)).join(' ');
}

export function formHtml(report: PhilmechReport, form: ReportForm) {
  const utilization = `<section class="page">
    ${topBoxesHtml(form)}
    <h1>${escapeHtml(REPORT_TITLE)}</h1>
    <div class="fields">
      <div>Name of FCA: ${lineHtml(form.fcaName, 'long')}</div><div>Address: ${lineHtml(form.address, 'long')}</div>
      <div>Contact Person: ${lineHtml(form.contactPerson, 'long')}</div><div>Contact Number: ${lineHtml(form.contactNumber)}</div>
      <div>Cropping Period: ${croppingHtml(report)}</div><div>Inclusive Months: ${lineHtml(monthsText(report))} Year: ${lineHtml(String(report.year), 'short')}</div>
      <div class="span">Type of Farm Operation: ${FARM_OPERATIONS.map((operation) => checkHtml(form[operation.field], operation.label)).join(' ')}</div>
      <div class="span">Present Buying Price of Palay in your Area (Php): Fresh (Sariwa) ${lineHtml(priceText(form.palayPriceFresh), 'short')}/kilo &nbsp; Dry (Tuyo) ${lineHtml(priceText(form.palayPriceDry), 'short')}/kilo</div>
    </div>
    ${gridHtml(utilizationGrid(report), 4)}
    ${problemsHtml(form)}
    ${signaturesHtml(form)}
    <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>
  </section>`;
  const cashflow = `<section class="page">
    <p class="disclaimer">${escapeHtml(DISCLAIMER)}</p>
    <h1>${escapeHtml(CASHFLOW_TITLE)}</h1>
    <div class="fields">
      <div>Name of FCA: ${lineHtml(form.fcaName, 'long')}</div><div>Address: ${lineHtml(form.address, 'long')}</div>
      <div>Contact Person: ${lineHtml(form.contactPerson, 'long')}</div><div>Contact Number: ${lineHtml(form.contactNumber)}</div>
      <div class="span">Cropping Period: ${croppingHtml(report)} &nbsp; ${escapeHtml(monthsText(report))} ${report.year}</div>
    </div>
    ${gridHtml(cashflowGrid(report))}
    ${signaturesHtml(form)}
  </section>`;
  const clients = report.machines.map((machine) => `<section class="page">
    ${topBoxesHtml(form)}
    <h1>${escapeHtml(CLIENTS_TITLE)}</h1>
    <p class="machine">Farm Machinery: ${lineHtml(machine.name.toUpperCase(), 'long')}</p>
    ${gridHtml(clientGrid(machine))}
    ${signaturesHtml(form)}
  </section>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(REPORT_TITLE)} - ${escapeHtml(report.croppingPeriod)} cropping ${report.year}</title><style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10px; margin: 0; }
    .page { break-after: page; } .page:last-child { break-after: auto; }
    .top { display: flex; justify-content: space-between; gap: 16px; }
    .box { border: 1px solid #000; padding: 3px 6px; font-weight: bold; font-style: italic; }
    .box.date { white-space: nowrap; }
    h1 { font-size: 13px; text-align: center; text-transform: uppercase; text-decoration: underline; margin: 10px 0 8px; }
    .fields { display: grid; grid-template-columns: 1.5fr 1fr; gap: 4px 28px; font-weight: bold; margin-bottom: 6px; }
    .fields .span { grid-column: 1 / -1; }
    .line { display: inline-block; min-width: 70px; border-bottom: 1px solid #000; padding: 0 4px; font-weight: bold; text-transform: uppercase; }
    .line.long { min-width: 260px; } .line.short { min-width: 50px; text-align: center; }
    .check { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; font-weight: normal; }
    .cb { display: inline-block; width: 11px; height: 11px; border: 1px solid #000; font-size: 10px; line-height: 10px; text-align: center; font-weight: bold; }
    table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 6px; }
    .grid th, .grid td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; overflow-wrap: anywhere; }
    .grid th { font-size: 9px; }
    .left { text-align: left; } .center { text-align: center; } .right { text-align: right; white-space: nowrap; }
    .bold { font-weight: bold; } .indent { padding-left: 16px !important; }
    .note { display: block; font-size: 7px; font-weight: normal; font-style: italic; }
    tfoot td { font-weight: bold; }
    .problems td.text { vertical-align: top; white-space: pre-wrap; }
    .sign { display: flex; justify-content: space-between; gap: 30px; margin-top: 22px; font-weight: bold; }
    .sign .label { margin-right: 6px; }
    .slot { display: inline-flex; flex-direction: column; align-items: center; min-width: 140px; vertical-align: top; }
    .slot.wide { min-width: 220px; } .slot .line { width: 100%; text-align: center; }
    .slot small { font-size: 8px; margin-top: 1px; }
    .disclaimer { font-size: 8px; font-weight: bold; font-style: italic; margin: 8px 0; }
    .machine { font-weight: bold; margin: 0 0 4px; }
  </style></head><body>${utilization}${cashflow}${clients}</body></html>`;
}

export function printForm(report: PhilmechReport, form: ReportForm) {
  // 'noopener' would make window.open return null, so the window is detached afterwards.
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Unable to open the print window. Please allow pop-ups and try again.');
  printWindow.opener = null;
  printWindow.document.write(formHtml(report, form));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

// ----- PDF ----------------------------------------------------------------------------------------

// The built-in PDF fonts cover Latin-1 only: no peso sign, arrows, long dashes or narrow spaces.
const pdfText = (value: string) => value
  .replace(/\u20b1/g, 'PHP ')
  .replace(/\u2192/g, '->')
  .replace(/[\u2013\u2212]/g, '-')
  .replace(/[\u00a0\u2009\u202f]/g, ' ');

const PAGE = { left: 12, right: 285, width: 273 };

export async function downloadFormPdf(report: PhilmechReport, form: ReportForm) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `${REPORT_TITLE} - ${report.croppingPeriod} cropping ${report.year}` });
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const font = (style: 'normal' | 'bold' | 'italic' | 'bolditalic', size: number) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
  const checkbox = (x: number, y: number, checked: boolean) => {
    doc.setLineWidth(0.25);
    doc.rect(x, y, 3, 3);
    if (checked) {
      doc.setLineWidth(0.45);
      doc.line(x + 0.6, y + 1.6, x + 1.3, y + 2.4);
      doc.line(x + 1.3, y + 2.4, x + 2.5, y + 0.6);
    }
  };
  // A label, then the value on an underline that ends at `end`.
  const field = (label: string, value: string, x: number, y: number, end: number) => {
    font('bold', 8.5);
    doc.text(`${label}:`, x, y);
    const start = x + doc.getTextWidth(`${label}:`) + 2;
    doc.setLineWidth(0.2);
    doc.line(start, y + 0.8, end, y + 0.8);
    const shown = doc.splitTextToSize(pdfText(value.toUpperCase()), end - start - 2)[0] ?? '';
    doc.text(shown, start + 1, y);
    return end;
  };
  // Checkboxes with labels in a row; returns where the row ends.
  const checks = (items: Array<[string, boolean]>, x: number, y: number) => {
    font('normal', 8.5);
    let at = x;
    for (const [label, checked] of items) {
      checkbox(at, y - 2.5, checked);
      doc.text(pdfText(label), at + 4.2, y);
      at += 4.2 + doc.getTextWidth(pdfText(label)) + 5;
    }
    return at;
  };
  const title = (value: string, y: number) => {
    font('bold', 11);
    const upper = value.toUpperCase();
    const width = doc.getTextWidth(upper);
    doc.text(upper, 148.5, y, { align: 'center' });
    doc.setLineWidth(0.3);
    doc.line(148.5 - width / 2, y + 0.9, 148.5 + width / 2, y + 0.9);
  };
  const topBoxes = () => {
    doc.setLineWidth(0.3);
    doc.rect(PAGE.left, 8, 200, 6.5);
    font('bolditalic', 8);
    doc.text(INSTRUCTIONS, PAGE.left + 2, 12.3);
    doc.rect(217, 8, PAGE.right - 217, 6.5);
    doc.text('Date of Submission:', 219, 12.3);
    font('bold', 8.5);
    doc.text(slashDate(form.submissionDate || null), 250, 12.3);
    doc.setLineWidth(0.2);
    doc.line(248, 13.1, PAGE.right - 2, 13.1);
  };
  const disclaimer = (y: number) => {
    font('bolditalic', 7.5);
    doc.text(doc.splitTextToSize(DISCLAIMER, 200), PAGE.left, y);
  };
  const croppingChecks = (x: number, y: number) => checks(CROPPING_PERIODS.map((period) => [`${period} cropping`, report.croppingPeriod === period]), x, y);
  const signatures = (startY: number) => {
    let y = startY;
    if (y > 186) { doc.addPage(); y = 20; }
    font('bold', 8.5);
    doc.text('Prepared by:', PAGE.left, y + 5);
    const slot = (value: string, caption: string, from: number, to: number) => {
      doc.setLineWidth(0.2);
      doc.line(from, y + 5.8, to, y + 5.8);
      font('bold', 8.5);
      doc.text(pdfText((value || '').toUpperCase()), (from + to) / 2, y + 5, { align: 'center', maxWidth: to - from });
      font('bold', 6.5);
      doc.text(pdfText(caption), (from + to) / 2, y + 8.6, { align: 'center' });
    };
    slot(form.preparedBy, 'Name and Signature', 32, 92);
    font('bold', 8.5);
    doc.text('/', 94, y + 5);
    slot(form.preparedByPosition, 'Position or Designation', 98, 138);
    font('bold', 8.5);
    doc.text('Reviewed/Approved by:', 168, y + 5);
    slot(form.approvedBy, approvedCaption(form), 205, PAGE.right);
    return y + 12;
  };

  const tableStyles: UserOptions = {
    theme: 'grid',
    margin: { left: PAGE.left, right: 297 - PAGE.right },
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 1, lineColor: 0, lineWidth: 0.2, textColor: 0, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold', halign: 'center', fontSize: 6.8 },
    footStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold' },
  };
  const cellsOf = (row: GridRow) => row.cells.map((cell): CellDef => ({
    // autoTable breaks lines at spaces only, so narrow columns get "Non-" / "Member".
    content: pdfText(cell.note ? `${cell.text}\n(${cell.note})` : cell.text).replace(/^Non-Member$/, 'Non-\nMember'),
    colSpan: cell.colSpan,
    rowSpan: cell.rowSpan,
    styles: {
      halign: cell.align ?? 'left',
      fontStyle: cell.bold ? 'bold' : 'normal',
      // The status definitions under "Status of Machine" are small print, as on the paper.
      ...(cell.note && cell.note.length > 60 ? { fontSize: 5.6 } : {}),
      ...(cell.indent ? { cellPadding: { top: 1, bottom: 1, right: 1, left: 5 } } : {}),
    },
  }));
  const drawGrid = (grid: Grid, startY: number, options: { minRows?: number; compact?: boolean } = {}) => {
    const total = grid.widths.reduce((sum, width) => sum + width, 0);
    const body = grid.body.map(cellsOf);
    for (let index = grid.body.length; index < (options.minRows ?? 0); index += 1) body.push(grid.widths.map((): CellDef => ({ content: ' ' })));
    autoTable(doc, {
      ...tableStyles,
      ...(options.compact ? { styles: { ...tableStyles.styles, fontSize: 6.8, cellPadding: 0.8 } } : {}),
      startY,
      head: grid.head.map(cellsOf),
      body,
      foot: grid.foot?.map(cellsOf),
      showFoot: 'lastPage',
      columnStyles: Object.fromEntries(grid.widths.map((width, index) => [index, { cellWidth: (width / total) * PAGE.width }])),
      // Machine rows on page 1 get the paper's height.
      ...(options.minRows ? { bodyStyles: { minCellHeight: 7 } } : {}),
    });
    return finalY();
  };

  // Page 1: utilization report and feedback form.
  topBoxes();
  title(REPORT_TITLE, 21);
  field('Name of FCA', form.fcaName, PAGE.left, 28, 160);
  field('Address', form.address, 168, 28, PAGE.right);
  field('Contact Person', form.contactPerson, PAGE.left, 33.5, 160);
  field('Contact Number', form.contactNumber, 168, 33.5, PAGE.right);
  font('bold', 8.5);
  doc.text('Cropping Period:', PAGE.left, 39);
  croppingChecks(PAGE.left + 27, 39);
  const monthsEnd = field('Inclusive Months', monthsText(report), 168, 39, 252);
  field('Year', String(report.year), monthsEnd + 3, 39, PAGE.right);
  font('bold', 8.5);
  doc.text('Type of Farm Operation:', PAGE.left, 44.5);
  checks(FARM_OPERATIONS.map((operation) => [operation.label, form[operation.field]]), PAGE.left + 37, 44.5);
  font('bold', 8.5);
  doc.text('Present Buying Price of Palay in your Area (Php):', PAGE.left, 50);
  let x = PAGE.left + doc.getTextWidth('Present Buying Price of Palay in your Area (Php):') + 4;
  for (const [label, value] of [['Fresh (Sariwa)', form.palayPriceFresh], ['Dry (Tuyo)', form.palayPriceDry]] as const) {
    font('normal', 8.5);
    doc.text(label, x, 50);
    x += doc.getTextWidth(label) + 2;
    doc.setLineWidth(0.2);
    doc.line(x, 50.8, x + 20, 50.8);
    font('bold', 8.5);
    doc.text(priceText(value), x + 10, 50, { align: 'center' });
    font('normal', 8.5);
    doc.text('/kilo', x + 21, 50);
    x += 34;
  }
  let y = drawGrid(utilizationGrid(report), 54, { minRows: 3 });

  // Problems encountered, with the suggestions beside them.
  const boxes = new Map<string, boolean>();
  const problemBody: CellDef[][] = [];
  const boxed: CellDef['styles'] = { cellPadding: { top: 1.3, bottom: 1.3, right: 1.1, left: 5.5 } };
  PROBLEM_GROUPS.forEach((group, index) => {
    problemBody.push([
      { content: group.title, colSpan: 4, styles: { fontStyle: 'bold' } },
      ...(index === 0 ? [
        { content: pdfText(form.suggestedSolutions), rowSpan: 7, styles: { valign: 'top' as const } },
        { content: pdfText(form.otherComments), rowSpan: 7, styles: { valign: 'top' as const } },
      ] : []),
    ]);
    const row = problemBody.length;
    group.items.forEach((item, column) => boxes.set(`${row}:${column}`, form.problems.includes(item.code)));
    boxes.set(`${row}:3`, Boolean(form[group.othersField].trim()));
    problemBody.push([
      ...group.items.map((item) => ({ content: item.label, styles: boxed })),
      { content: pdfText(`Others (Pls Specify): ${form[group.othersField]}`), styles: boxed },
    ]);
  });
  problemBody.push([{ content: pdfText(`Other Problems Encountered: ${form.otherProblems}`), colSpan: 4, styles: {} }]);
  autoTable(doc, {
    ...tableStyles,
    startY: y + 3,
    head: [[
      { content: `Problems Encountered (if there's any)${problemsNone(form) ? '   N/A' : ''}`, colSpan: 4, styles: { halign: 'left' } },
      { content: 'Suggested Solutions/ Recommendations' },
      { content: 'Other Comments/ Suggestions' },
    ]],
    body: problemBody,
    columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 46 }, 2: { cellWidth: 46 }, 3: { cellWidth: 47 }, 4: { cellWidth: 44 }, 5: { cellWidth: 44 } },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const checked = boxes.get(`${data.row.index}:${data.column.index}`);
      if (checked !== undefined) checkbox(data.cell.x + 1.3, data.cell.y + data.cell.height / 2 - 1.5, checked);
    },
  });
  y = signatures(finalY() + 3);
  disclaimer(Math.max(y + 3, 192));

  // Page 2: cash flow statement.
  doc.addPage();
  disclaimer(10);
  title(CASHFLOW_TITLE, 22);
  field('Name of FCA', form.fcaName, PAGE.left, 30, 160);
  field('Address', form.address, 168, 30, PAGE.right);
  field('Contact Person', form.contactPerson, PAGE.left, 35.5, 160);
  field('Contact Number', form.contactNumber, 168, 35.5, PAGE.right);
  font('bold', 8.5);
  doc.text('Cropping Period:', PAGE.left, 41);
  const periodEnd = croppingChecks(PAGE.left + 27, 41);
  font('normal', 8.5);
  doc.text(`(${monthsText(report)} ${report.year})`, periodEnd, 41);
  signatures(drawGrid(cashflowGrid(report), 45) + 4);

  // Page 3 onwards: farmer clients of each machine.
  for (const machine of report.machines) {
    doc.addPage();
    topBoxes();
    title(CLIENTS_TITLE, 21);
    field('Farm Machinery', machine.name, PAGE.left, 28, 120);
    signatures(drawGrid(clientGrid(machine), 31, { compact: true }) + 4);
  }

  doc.save(`${fileBaseName(report)}.pdf`);
}

// ----- Excel --------------------------------------------------------------------------------------

type CellValue = string | number | null;

// Rows of one worksheet with merged cells and number formats.
class SheetBuilder {
  rows: CellValue[][] = [];
  merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];
  formats: Array<[number, number, string]> = [];

  put(row: number, column: number, value: CellValue, options: { span?: number; down?: number; format?: string } = {}) {
    while (this.rows.length <= row) this.rows.push([]);
    this.rows[row][column] = value === '' ? null : value;
    const span = options.span ?? 1;
    const down = options.down ?? 1;
    if (span > 1 || down > 1) this.merges.push({ s: { r: row, c: column }, e: { r: row + down - 1, c: column + span - 1 } });
    if (options.format && typeof value === 'number') this.formats.push([row, column, options.format]);
  }

  /** Adds a row and returns its index; `cells` are [column, value, options]. */
  line(cells: Array<[number, CellValue, { span?: number; down?: number; format?: string }?]> = []) {
    const row = this.rows.length;
    this.rows.push([]);
    for (const [column, value, options] of cells) this.put(row, column, value, options);
    return row;
  }

  grid(grid: Grid) {
    const start = this.rows.length;
    const taken = new Set<string>();
    [...grid.head, ...grid.body, ...(grid.foot ?? [])].forEach((gridRow, offset) => {
      const row = start + offset;
      while (this.rows.length <= row) this.rows.push([]);
      let column = 0;
      for (const cell of gridRow.cells) {
        while (taken.has(`${row}:${column}`)) column += 1;
        const span = cell.colSpan ?? 1;
        const down = cell.rowSpan ?? 1;
        this.put(row, column, cell.value ?? (cell.note ? `${cell.text} (${cell.note})` : cell.text), { span, down, format: cell.format });
        for (let r = 0; r < down; r += 1) for (let c = 0; c < span; c += 1) taken.add(`${row + r}:${column + c}`);
        column += span;
      }
    });
  }
}

const checkText = (checked: boolean, label: string) => `${checked ? '☑' : '☐'} ${label}`;

export async function downloadFormExcel(report: PhilmechReport, form: ReportForm) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const cropping = CROPPING_PERIODS.map((period) => checkText(report.croppingPeriod === period, `${period} cropping`)).join('   ');

  const finish = (builder: SheetBuilder, name: string, widths: number[]) => {
    const sheet = XLSX.utils.aoa_to_sheet(builder.rows.map((row) => Array.from(row, (value) => value ?? null)));
    sheet['!merges'] = builder.merges;
    for (const [row, column, format] of builder.formats) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = format;
    }
    sheet['!cols'] = widths.map((width) => ({ wch: Math.max(9, Math.round(width / 1.8)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  const signatureRows = (builder: SheetBuilder, nameColumns: [number, number], approver: [number, number]) => {
    builder.line();
    builder.line([[0, 'Prepared by:'], [1, form.preparedBy, { span: nameColumns[0] }], [1 + nameColumns[0], '/'], [2 + nameColumns[0], form.preparedByPosition, { span: nameColumns[1] }],
      [approver[0], 'Reviewed/Approved by:'], [approver[0] + 1, form.approvedBy, { span: approver[1] }]]);
    builder.line([[1, 'Name and Signature', { span: nameColumns[0] }], [2 + nameColumns[0], 'Position or Designation', { span: nameColumns[1] }],
      [approver[0] + 1, approvedCaption(form), { span: approver[1] }]]);
  };

  // Utilization report and feedback form (14 columns).
  const utilization = new SheetBuilder();
  utilization.line([[0, INSTRUCTIONS, { span: 10 }], [11, 'Date of Submission:', { span: 2 }], [13, slashDate(form.submissionDate || null)]]);
  utilization.line();
  utilization.line([[0, REPORT_TITLE.toUpperCase(), { span: 14 }]]);
  utilization.line([[0, 'Name of FCA:'], [1, form.fcaName, { span: 7 }], [8, 'Address:', { span: 2 }], [10, form.address, { span: 4 }]]);
  utilization.line([[0, 'Contact Person:'], [1, form.contactPerson, { span: 7 }], [8, 'Contact Number:', { span: 2 }], [10, form.contactNumber, { span: 4 }]]);
  utilization.line([[0, 'Cropping Period:'], [1, cropping, { span: 7 }], [8, 'Inclusive Months:', { span: 2 }], [10, monthsText(report), { span: 2 }], [12, 'Year:'], [13, report.year]]);
  utilization.line([[0, 'Type of Farm Operation:'], [1, FARM_OPERATIONS.map((operation) => checkText(form[operation.field], operation.label)).join('   '), { span: 7 }]]);
  const fresh = priceText(form.palayPriceFresh) ? Number(form.palayPriceFresh) : null;
  const dry = priceText(form.palayPriceDry) ? Number(form.palayPriceDry) : null;
  utilization.line([[0, 'Present Buying Price of Palay in your Area (Php):', { span: 3 }], [3, 'Fresh (Sariwa)'], [4, fresh, { format: MONEY_FORMAT }], [5, '/kilo'],
    [6, 'Dry (Tuyo)'], [7, dry, { format: MONEY_FORMAT }], [8, '/kilo']]);
  utilization.line();
  utilization.grid(utilizationGrid(report));
  utilization.line();
  utilization.line([[0, `Problems Encountered (if there's any)${problemsNone(form) ? '   N/A' : ''}`, { span: 11 }], [11, 'Suggested Solutions/ Recommendations', { span: 2 }], [13, 'Other Comments/ Suggestions']]);
  PROBLEM_GROUPS.forEach((group, index) => {
    const titleRow = utilization.line([[0, group.title, { span: 11 }]]);
    if (index === 0) {
      utilization.put(titleRow, 11, form.suggestedSolutions, { span: 2, down: 7 });
      utilization.put(titleRow, 13, form.otherComments, { down: 7 });
    }
    utilization.line([
      ...group.items.map((item, column): [number, CellValue, { span: number }] => [column * 3, checkText(form.problems.includes(item.code), item.label), { span: 3 }]),
      [9, checkText(Boolean(form[group.othersField].trim()), `Others (Pls Specify): ${form[group.othersField]}`), { span: 2 }],
    ]);
  });
  utilization.line([[0, `Other Problems Encountered: ${form.otherProblems}`, { span: 11 }]]);
  signatureRows(utilization, [3, 2], [8, 5]);
  utilization.line();
  utilization.line([[0, DISCLAIMER, { span: 14 }]]);
  finish(utilization, 'Utilization Report', utilizationGrid(report).widths);

  // Cash flow statement.
  const cashflowTable = cashflowGrid(report);
  const columns = cashflowTable.widths.length;
  const cashflow = new SheetBuilder();
  cashflow.line([[0, DISCLAIMER, { span: columns }]]);
  cashflow.line();
  cashflow.line([[0, CASHFLOW_TITLE.toUpperCase(), { span: columns }]]);
  cashflow.line([[0, 'Name of FCA:'], [1, form.fcaName, { span: 3 }], [4, 'Address:'], [5, form.address, { span: Math.max(1, columns - 5) }]]);
  cashflow.line([[0, 'Contact Person:'], [1, form.contactPerson, { span: 3 }], [4, 'Contact Number:'], [5, form.contactNumber, { span: Math.max(1, columns - 5) }]]);
  cashflow.line([[0, 'Cropping Period:'], [1, `${cropping}   (${monthsText(report)} ${report.year})`, { span: columns - 1 }]]);
  cashflow.line();
  cashflow.grid(cashflowTable);
  signatureRows(cashflow, [1, 1], [4, Math.max(1, columns - 5)]);
  finish(cashflow, 'Cashflow Statement', cashflowTable.widths.map((width, index) => (index ? Math.max(width, 34) : width)));

  // Farmer clients, one sheet per machine.
  const used = new Set<string>();
  for (const machine of report.machines) {
    const table = clientGrid(machine);
    const last = table.widths.length - 1;
    const clients = new SheetBuilder();
    clients.line([[0, INSTRUCTIONS, { span: last - 2 }], [last - 1, 'Date of Submission:'], [last, slashDate(form.submissionDate || null)]]);
    clients.line();
    clients.line([[0, CLIENTS_TITLE.toUpperCase(), { span: last + 1 }]]);
    clients.line([[0, 'Farm Machinery:'], [1, machine.name.toUpperCase(), { span: 2 }]]);
    clients.line();
    clients.grid(table);
    signatureRows(clients, [2, 2], [last - 3, 3]);
    let name = `Clients - ${machine.name}`.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
    while (used.has(name)) name = `${name.slice(0, 28)} ${used.size}`;
    used.add(name);
    finish(clients, name, table.widths);
  }

  XLSX.writeFile(workbook, `${fileBaseName(report)}.xlsx`);
}
