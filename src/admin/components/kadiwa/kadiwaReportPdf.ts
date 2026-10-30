// The Kadiwa ng Pangulo sales report for a period (15 days or a month), laid
// out like the Department of Agriculture's sheet the cooperative submits: the
// DA MIMAROPA letterhead, the store's address, the period and the FCA's name,
// then every good sold with its quantity, unit, price and total amount.
import type { KadiwaSalesReport } from '../../../app/services/authApi';
import { drawPdfLogo, loadPdfLogo } from '../../../lib/pdfLogo';
import { pdfText } from '../paperFormPdf';
import { formatPrice, formatQuantity, plainAmount } from './SalesForms';

const LETTERHEAD = [
  ['bold', 'Republic of the Philippines'],
  ['bold', 'DEPARTMENT OF AGRICULTURE'],
  ['bold', 'MIMAROPA REGION'],
  ['normal', 'JP Rizal St., Brgy. Camilmil, Calapan City, Oriental Mindoro'],
  ['normal', 'Satellite Office: ATI Building, Elliptical Rd., Brgy. Vasra, Diliman, Quezon City'],
  ['normal', 'Tel. No: (02)8927-43-50/8332-72-74'],
] as const;
export const KADIWA_STORE_ADDRESS = 'Brgy. Barahan Sta. Cruz Occidental Mindoro';
export const FCA_NAME = 'Amnay Cabagan Irrigators and Farmers Agriculture Cooperative';

/** title: the period as the sheet writes it, e.g. SEPTEMBER 1 TO 15, 2026. */
export async function downloadKadiwaSalesReportPdf(report: KadiwaSalesReport, title: string) {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadPdfLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `Kadiwa ng Pangulo ${title}`, creator: 'ACIFAC' });
  const center = 105;

  drawPdfLogo(doc, logo, 14, 10, 24);
  let y = 13;
  for (const [style, text] of LETTERHEAD) {
    doc.setFont('helvetica', style);
    doc.setFontSize(style === 'bold' ? 7.5 : 6.5);
    doc.setTextColor(30);
    doc.text(text, center, y, { align: 'center' });
    y += style === 'bold' ? 3.4 : 3;
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17);
  doc.text('KADIWA NG PANGULO', center, y + 5, { align: 'center' });
  y += 11;
  // A label with its value underlined, centered as one line.
  const labelled = (label: string, value: string, at: number, x?: number) => {
    doc.setFont('times', 'normal');
    doc.setFontSize(12.5);
    const labelWidth = doc.getTextWidth(label);
    const valueWidth = doc.getTextWidth(value);
    const start = x ?? center - (labelWidth + valueWidth) / 2;
    doc.text(label, start, at);
    doc.text(value, start + labelWidth, at);
    doc.setLineWidth(0.25);
    doc.line(start + labelWidth, at + 0.8, start + labelWidth + valueWidth, at + 0.8);
  };
  labelled('Address:', KADIWA_STORE_ADDRESS, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(12.5);
  doc.text(`Date: ${title}`, center, y + 6.5, { align: 'center' });
  labelled('Name of FCA:', FCA_NAME, y + 16, 18);

  const quantityTotal = report.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
  autoTable(doc, {
    startY: y + 21,
    theme: 'grid',
    margin: { left: 15, right: 15 },
    head: [['Goods Sold', 'Quantity', 'Unit', 'Price', 'Total Amount of Goods Sold']],
    body: report.lines.map((line) => [
      line.name, formatQuantity(line.quantity), line.unit ?? '', pdfText(formatPrice(line)), line.amount ? plainAmount(line.amount) : '',
    ]),
    foot: [['', formatQuantity(Math.round(quantityTotal * 10000) / 10000), '', 'TOTAL', plainAmount(report.totals.gross)]],
    showFoot: 'lastPage',
    styles: { font: 'times', fontSize: 11.5, textColor: 17, lineColor: 40, lineWidth: 0.25, halign: 'center', valign: 'middle', cellPadding: { top: 1.3, bottom: 1.3, left: 2, right: 2 } },
    headStyles: { fillColor: 255, textColor: 17, fontStyle: 'bold', minCellHeight: 12 },
    footStyles: { fillColor: 255, textColor: 17, fontStyle: 'normal' },
    columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 28 }, 2: { cellWidth: 24 }, 3: { cellWidth: 26 }, 4: { cellWidth: 50 } },
  });
  doc.save(`Kadiwa ng Pangulo ${title}.pdf`);
}
