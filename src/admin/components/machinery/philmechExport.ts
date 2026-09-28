// Tables of the PhilMech "Farm Machinery Utilization Report and Feedback Form"
// and "Cashflow Statement of Farm Machinery Operation per Cropping", built once
// from the report and rendered on screen, for printing, as PDF and as Excel.
import { CONDITION_LABELS, EXPENSE_CATEGORIES, EXPENSE_LABELS, rateLabel, type PhilmechReport, type ReportMachine } from '../../../app/services/machineryApi';
import { formatDate } from '../../../utils/dateTime';
import { escapeHtml } from '../../../utils/html';

export interface ReportHeader { fcaName: string; address: string; contactPerson: string; preparedBy: string; approvedBy: string }

export type Value = { kind: 'text'; value: string } | { kind: 'money' | 'area' | 'count' | 'bags'; value: number };
export interface Row { cells: Value[]; strong?: boolean }
export interface Table { title: string; head: string[]; rows: Row[]; foot?: Row; numericFrom: number }

const text = (value: string | null | undefined): Value => ({ kind: 'text', value: value ?? '' });
const money = (value: number): Value => ({ kind: 'money', value });
const area = (value: number): Value => ({ kind: 'area', value });
const count = (value: number): Value => ({ kind: 'count', value });
const bagCount = (value: number): Value => ({ kind: 'bags', value });

export const REPORT_TITLE = 'Farm Machinery Utilization Report and Feedback Form';
export const CASHFLOW_TITLE = 'Cashflow Statement of Farm Machinery Operation per Cropping';

export function periodText(report: PhilmechReport) {
  return `${report.croppingPeriod} Cropping ${report.year}${report.window.monthsChosen ? ` (${report.window.label})` : ''}`;
}

function rateLines(machine: ReportMachine, member: boolean) {
  if (!machine.rates.length) return 'No rate in effect';
  return machine.rates.map((rate) => {
    const period = machine.rates.filter((other) => other.serviceType === rate.serviceType).length > 1
      ? ` (${formatDate(rate.effectiveFrom, true)}${rate.effectiveTo ? ` – ${formatDate(rate.effectiveTo, true)}` : ' onwards'})`
      : '';
    return `${rate.serviceType}: ${rateLabel(rate.unit, member ? rate.memberRate : rate.nonMemberRate)}${period}`;
  }).join('; ');
}

export function machineTables(machine: ReportMachine): Table[] {
  const { summary, cashFlow } = machine;
  const hasBags = machine.clients.some((client) => client.totalBags !== null);
  const served: Row[] = [
    { cells: [text('Number of farmers served'), count(summary.farmers.member), count(summary.farmers.nonMember), count(summary.farmers.total)] },
    { cells: [text('Area serviced (ha)'), area(summary.areaHa.member), area(summary.areaHa.nonMember), area(summary.areaHa.total)] },
  ];
  if (hasBags) served.push({ cells: [text('Bags harvested'), bagCount(summary.bags.member), bagCount(summary.bags.nonMember), bagCount(summary.bags.total)] });

  return [
    {
      title: 'I. Machine',
      head: ['Particulars', 'Details'],
      numericFrom: 99,
      rows: [
        { cells: [text('Machine'), text(`${machine.name} (${machine.type})`)] },
        { cells: [text('Attached implements'), text(machine.implements.map((row) => row.name).join(', ') || 'None')] },
        { cells: [text('Date of delivery'), text(machine.deliveryDate ? formatDate(machine.deliveryDate) : 'Not recorded')] },
        { cells: [text('Status'), text(machine.condition ? CONDITION_LABELS[machine.condition] : 'Not recorded')] },
        { cells: [text('Rate for members'), text(rateLines(machine, true))] },
        { cells: [text('Rate for non-members'), text(rateLines(machine, false))] },
      ],
    },
    { title: 'II. Utilization Summary', head: ['', 'Member', 'Non-member', 'Total'], numericFrom: 1, rows: served },
    {
      title: 'III. Income and Funds',
      head: ['', 'Collected', 'Collectibles', 'Total'],
      numericFrom: 1,
      rows: [
        { cells: [text('Gross income from service fees'), money(summary.grossIncome.collected), money(summary.grossIncome.collectibles), money(summary.grossIncome.total)] },
        { cells: [text('Operating expenses'), text(''), text(''), money(summary.operatingExpenses)] },
        { cells: [text('Available funds (total − expenses)'), text(''), text(''), money(summary.availableFunds)], strong: true },
      ],
    },
    {
      title: `IV. ${CASHFLOW_TITLE}`,
      head: ['Particulars', 'Amount'],
      numericFrom: 1,
      rows: [
        { cells: [text('a. Beginning cash'), money(cashFlow.beginningCash)], strong: true },
        { cells: [text('Cash inflows: service fees collected'), money(cashFlow.serviceFeesCollected)] },
        { cells: [text('Cash inflows: other income'), money(cashFlow.otherIncome)] },
        { cells: [text('b. Total cash inflows'), money(cashFlow.totalInflows)], strong: true },
        { cells: [text('c. Total source of cash (a + b)'), money(cashFlow.totalSourceOfCash)], strong: true },
        ...EXPENSE_CATEGORIES.map((category) => ({ cells: [text(`Cash outflows: ${EXPENSE_LABELS[category].toLowerCase()}`), money(cashFlow.outflows[category])] })),
        { cells: [text('d. Total cash outflows'), money(cashFlow.totalOutflows)], strong: true },
        { cells: [text('Net cash flow (c − d)'), money(cashFlow.netCashFlow)], strong: true },
      ],
    },
    {
      title: 'V. List of Farmer Clients',
      head: ['#', 'Name', 'Address', 'M/NM', 'Service', 'Date', 'Area (ha)', ...(hasBags ? ['Bags', 'Fee (bags)'] : []), 'Rate', 'Total amount', 'Cash collection', 'Payment', 'Accounts receivable'],
      numericFrom: 6,
      rows: machine.clients.map((client, index) => ({
        cells: [
          count(index + 1), text(client.name), text(client.address), text(client.category), text(client.serviceType), text(formatDate(client.serviceDate, true)),
          area(client.areaHa),
          ...(hasBags ? [client.totalBags === null ? text('') : bagCount(client.totalBags), client.feeBags === null ? text('') : bagCount(client.feeBags)] : []),
          text(rateLabel(client.unit, client.rateUsed)), money(client.totalAmount), money(client.cashCollection),
          text(client.paymentStatus === 'full' ? 'Full' : client.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'), money(client.accountsReceivable),
        ],
      })),
      foot: {
        strong: true,
        cells: [
          text(''), text('Total'), text(''), text(''), text(''), text(''), area(machine.clientTotals.areaHa),
          ...(hasBags ? [text(''), text('')] : []),
          text(''), money(machine.clientTotals.totalAmount), money(machine.clientTotals.cashCollection), text(''), money(machine.clientTotals.accountsReceivable),
        ],
      },
    },
  ];
}

// ----- Formatting -----------------------------------------------------------------------------

const number = (value: number, digits: number, max = digits) => value.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: max });

export function formatValue(value: Value, currency = '₱') {
  switch (value.kind) {
    case 'text': return value.value;
    case 'money': return `${currency}${number(value.value, 2)}`;
    case 'area': return number(value.value, 2, 4);
    case 'bags': return number(value.value, 0, 2);
    case 'count': return String(value.value);
  }
}

// The built-in PDF fonts have no peso sign; amounts there read "PHP".
const pdfText = (value: string) => value.replace(/₱/g, 'PHP ').replace(/[   ]/g, ' ').replace(/[–−]/g, '-');

export function fileBaseName(report: PhilmechReport) {
  return `philmech-utilization-${report.year}-${report.croppingPeriod}-cropping`;
}

// ----- Print ---------------------------------------------------------------------------------------

export function printReport(report: PhilmechReport, header: ReportHeader) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Unable to open the print window. Please allow pop-ups and try again.');
  printWindow.opener = null;
  const tableHtml = (table: Table) => {
    const cell = (value: Value, index: number, tag: 'td' | 'th') => `<${tag} class="${index >= table.numericFrom && value.kind !== 'text' ? 'num' : ''}">${escapeHtml(formatValue(value))}</${tag}>`;
    const rows = table.rows.map((row) => `<tr class="${row.strong ? 'strong' : ''}">${row.cells.map((value, index) => cell(value, index, 'td')).join('')}</tr>`).join('')
      || `<tr><td colspan="${table.head.length}">No records for this cropping.</td></tr>`;
    return `<h3>${escapeHtml(table.title)}</h3><table><thead><tr>${table.head.map((label) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody>${table.foot ? `<tfoot><tr class="strong">${table.foot.cells.map((value, index) => cell(value, index, 'td')).join('')}</tr></tfoot>` : ''}</table>`;
  };
  const machines = report.machines.map((machine, index) => `
    <section class="${index ? 'break' : ''}">
      ${headerHtml(report, header)}
      <h2>${escapeHtml(machine.name)}</h2>
      ${machineTables(machine).map(tableHtml).join('')}
      <div class="sign"><div><span>Prepared by:</span><strong>${escapeHtml(header.preparedBy) || '&nbsp;'}</strong></div><div><span>Approved by:</span><strong>${escapeHtml(header.approvedBy) || '&nbsp;'}</strong></div></div>
    </section>`).join('');
  printWindow.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(REPORT_TITLE)} - ${escapeHtml(periodText(report))}</title><style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 11px; }
    h1 { font-size: 16px; margin: 0; text-align: center; text-transform: uppercase; }
    h2 { font-size: 14px; margin: 14px 0 4px; }
    h3 { font-size: 12px; margin: 12px 0 4px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; margin-top: 8px; }
    .meta b { display: inline-block; min-width: 110px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 3px 5px; text-align: left; vertical-align: top; }
    th { background: #eef2ee; }
    .num { text-align: right; white-space: nowrap; }
    .strong td { font-weight: bold; }
    .sign { display: flex; gap: 60px; margin-top: 28px; }
    .sign div { flex: 1; } .sign strong { display: block; border-top: 1px solid #111; margin-top: 28px; padding-top: 2px; }
    .break { page-break-before: always; }
  </style></head><body>${machines || `${headerHtml(report, header)}<p>No machinery records for this cropping.</p>`}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function headerHtml(report: PhilmechReport, header: ReportHeader) {
  return `<h1>${escapeHtml(REPORT_TITLE)}</h1>
    <div class="meta">
      <div><b>FCA name:</b> ${escapeHtml(header.fcaName)}</div><div><b>Cropping period:</b> ${escapeHtml(periodText(report))}</div>
      <div><b>Address:</b> ${escapeHtml(header.address)}</div><div><b>Contact person:</b> ${escapeHtml(header.contactPerson)}</div>
    </div>`;
}

// ----- PDF -------------------------------------------------------------------------------------------

export async function downloadReportPdf(report: PhilmechReport, header: ReportHeader) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `${REPORT_TITLE} - ${periodText(report)}` });
  const left = 12;
  const pageWidth = doc.internal.pageSize.getWidth();

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(REPORT_TITLE.toUpperCase(), pageWidth / 2, 14, { align: 'center' });
    doc.setFontSize(9);
    const rows = [['FCA name', header.fcaName, 'Cropping period', periodText(report)], ['Address', header.address, 'Contact person', header.contactPerson]];
    rows.forEach((row, index) => {
      const y = 21 + index * 5;
      doc.setFont('helvetica', 'bold'); doc.text(`${row[0]}:`, left, y);
      doc.setFont('helvetica', 'normal'); doc.text(pdfText(row[1] || ''), left + 26, y);
      doc.setFont('helvetica', 'bold'); doc.text(`${row[2]}:`, pageWidth / 2, y);
      doc.setFont('helvetica', 'normal'); doc.text(pdfText(row[3] || ''), pageWidth / 2 + 30, y);
    });
    return 32;
  };

  const machines = report.machines.length ? report.machines : [null];
  machines.forEach((machine, machineIndex) => {
    if (machineIndex) doc.addPage();
    let y = drawHeader();
    if (!machine) {
      doc.setFont('helvetica', 'normal');
      doc.text('No machinery records for this cropping.', left, y + 4);
      return;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(pdfText(machine.name), left, y + 2);
    y += 5;
    for (const table of machineTables(machine)) {
      const format = (row: Row) => row.cells.map((value) => pdfText(formatValue(value, '')));
      // Amount columns are printed without a currency sign, so their heading says PHP.
      const allRows = [...table.rows, ...(table.foot ? [table.foot] : [])];
      const isMoneyColumn = (index: number) => allRows.some((row) => row.cells[index]?.kind === 'money');
      const isNumberColumn = (index: number) => index >= table.numericFrom && allRows.some((row) => row.cells[index] && row.cells[index].kind !== 'text');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 14; }
      doc.text(pdfText(table.title), left, y + 3);
      autoTable(doc, {
        startY: y + 5,
        margin: { left, right: left },
        head: [table.head.map((label, index) => (isMoneyColumn(index) ? `${label} (PHP)` : label))],
        body: table.rows.length ? table.rows.map(format) : [[{ content: 'No records for this cropping.', colSpan: table.head.length }]],
        foot: table.foot ? [format(table.foot)] : undefined,
        showFoot: 'lastPage',
        theme: 'grid',
        // Short tables keep a readable width instead of stretching across the landscape page.
        tableWidth: table.head.length <= 4 ? 190 : 'auto',
        styles: { fontSize: 7.5, cellPadding: 1.2, overflow: 'linebreak' },
        headStyles: { fillColor: [232, 240, 232], textColor: 20, fontStyle: 'bold' },
        footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold' },
        didParseCell: (data) => {
          data.cell.styles.halign = isNumberColumn(data.column.index) ? 'right' : 'left';
          if (data.section === 'body' && table.rows[data.row.index]?.strong) data.cell.styles.fontStyle = 'bold';
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
    }
    if (y > doc.internal.pageSize.getHeight() - 28) { doc.addPage(); y = 14; }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    [['Prepared by:', header.preparedBy, left], ['Approved by:', header.approvedBy, pageWidth / 2]].forEach(([label, name, x]) => {
      doc.text(String(label), Number(x), y + 8);
      doc.line(Number(x), y + 20, Number(x) + 80, y + 20);
      doc.setFont('helvetica', 'bold');
      doc.text(pdfText(String(name || '')), Number(x), y + 19);
      doc.setFont('helvetica', 'normal');
    });
  });

  doc.save(`${fileBaseName(report)}.pdf`);
}

// ----- Excel -----------------------------------------------------------------------------------------

export async function downloadReportExcel(report: PhilmechReport, header: ReportHeader) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const machines = report.machines.length ? report.machines : [null];
  const used = new Set<string>();
  machines.forEach((machine) => {
    const aoa: Array<Array<string | number | null>> = [
      [REPORT_TITLE],
      ['FCA name', header.fcaName, null, 'Cropping period', periodText(report)],
      ['Address', header.address, null, 'Contact person', header.contactPerson],
      [],
    ];
    const moneyCells: Array<[number, number]> = [];
    if (machine) {
      aoa.push([machine.name], []);
      for (const table of machineTables(machine)) {
        aoa.push([table.title]);
        aoa.push(table.head);
        for (const row of [...table.rows, ...(table.foot ? [table.foot] : [])]) {
          aoa.push(row.cells.map((value, column) => {
            if (value.kind === 'text') return value.value;
            if (value.kind === 'money') moneyCells.push([aoa.length, column]);
            return value.value;
          }));
        }
        aoa.push([]);
      }
      if (machine.warnings.length) {
        aoa.push(['Checks']);
        machine.warnings.forEach((warning) => aoa.push([warning.level.toUpperCase(), warning.message]));
        aoa.push([]);
      }
    } else {
      aoa.push(['No machinery records for this cropping.']);
    }
    aoa.push(['Prepared by', header.preparedBy, null, 'Approved by', header.approvedBy]);
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    for (const [row, column] of moneyCells) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = '#,##0.00';
    }
    sheet['!cols'] = [{ wch: 38 }, { wch: 28 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    let name = (machine?.name ?? 'Report').replace(/[[\]:*?/\\]/g, ' ').slice(0, 28) || 'Machine';
    while (used.has(name)) name = `${name.slice(0, 26)} ${used.size}`;
    used.add(name);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  });
  XLSX.writeFile(workbook, `${fileBaseName(report)}.xlsx`);
}
