// The printable member ID card, at ID card size (85.6 x 54 mm, CR80).
//   Front: the logo, the 2x2 photo, the name, the member number, member since.
//   Back: the QR (only "ACIFAC:" and the member's code), and the Board
//   Chairperson's and the General Manager's names over their signature lines,
//   from the organizational chart, as on the loyalty certificates.
// Two layouts: "card", each card on two pages of its own size (front, then
// back) for a card printer or one ID; and "sheet", A4 pages of five cards with
// each front and back side by side, to cut out, fold on the dashed line and
// laminate (no two-sided printing needed).
import type { jsPDF } from 'jspdf';
import { fetchProtectedBlob } from '../../../lib/api';
import { COOPERATIVE_NAME, drawPdfLogo, loadPdfLogo } from '../../../lib/pdfLogo';
import { drawQrOnPdf, qrModules } from '../../../lib/qrCode';
import { formatDate } from '../../../utils/dateTime';
import { INVOICE_HEADER } from '../../../admin/components/loanInvoice';
import { pdfText } from '../../../admin/components/paperFormPdf';
import { certificateSigners, type CertificateSigners } from '../../../admin/components/loyalty/loyaltyTiers';
import { fetchOrgChart } from '../../services/orgChartApi';
import type { IdCard } from '../../services/idCardApi';

export type IdCardLayout = 'card' | 'sheet';

export const CARD_WIDTH = 85.6;
export const CARD_HEIGHT = 54;
const GREEN: [number, number, number] = [22, 101, 52];
const GOLD: [number, number, number] = [166, 124, 32];
const POINT = 0.3528; // mm per point
// A4 sheets: five cards, each front and back side by side.
const SHEET = { width: 210, height: 297, rows: 5, gap: 4 };

/** A card to print and its photo, made small (a JPEG data URL), or null without one. */
export interface PrintableCard { card: IdCard; photo: string | null }

/**
 * The member's 2x2 photo for the card: the centre square, 320 px (about 340
 * dpi on the card), as a JPEG data URL; null when there is none or it cannot
 * be read. Keeps a PDF of hundreds of cards small.
 */
export async function loadCardPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const bitmap = await createImageBitmap(await fetchProtectedBlob(path));
    try {
      const side = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 320, 320);
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 320, 320);
      return canvas.toDataURL('image/jpeg', 0.86);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/** Who signs the cards: the Board Chairperson and the General Manager on the organizational chart (blank when vacant or unreadable). */
export async function loadCardSigners(): Promise<CertificateSigners> {
  try {
    return certificateSigners((await fetchOrgChart()).entries);
  } catch {
    return { chairperson: '', manager: '' };
  }
}

const setFont = (doc: jsPDF, style: 'normal' | 'bold', size: number, color: number | [number, number, number] = 17) => {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  if (Array.isArray(color)) doc.setTextColor(...color); else doc.setTextColor(color);
};

/** The name in capitals on at most two lines of `width` mm: smaller type, then the middle initial, before it is squeezed. */
function fitName(doc: jsPDF, card: IdCard, width: number) {
  const full = pdfText(card.name.toUpperCase());
  const initial = pdfText([card.firstName, card.middleName ? `${card.middleName.trim().charAt(0)}.` : '', card.lastName, card.suffix].filter(Boolean).join(' ').toUpperCase());
  for (const name of [full, initial]) {
    for (let size = 10.5; size >= 7.5; size -= 0.5) {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(name, width) as string[];
      if (lines.length <= 2 && lines.every((line) => doc.getTextWidth(line) <= width)) return { lines, size };
    }
  }
  doc.setFontSize(6.5);
  return { lines: (doc.splitTextToSize(initial, width) as string[]).slice(0, 2), size: 6.5 };
}

function drawFront(doc: jsPDF, x: number, y: number, { card, photo }: PrintableCard, logo: Uint8Array | null) {
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, CARD_WIDTH, CARD_HEIGHT, 'F');
  // The cooperative's band: logo, name and address.
  doc.setFillColor(...GREEN);
  doc.rect(x, y, CARD_WIDTH, 13.5, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(x, y + 13.5, CARD_WIDTH, 0.6, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x + 2.4, y + 1.6, 10.3, 10.3, 1.6, 1.6, 'F');
  const hasLogo = drawPdfLogo(doc, logo, x + 2.8, y + 2, 9.5);
  const textX = x + (hasLogo ? 14.6 : 3.5);
  setFont(doc, 'bold', 5.6, 255);
  const nameLines = (doc.splitTextToSize(COOPERATIVE_NAME, x + CARD_WIDTH - 3 - textX) as string[]).slice(0, 2);
  doc.text(nameLines, textX, y + 5, { lineHeightFactor: 1.2 });
  setFont(doc, 'normal', 4.7, [220, 252, 231]);
  doc.text(INVOICE_HEADER.address, textX, y + 11);

  // The 2x2 photo, or a frame saying there is none.
  const photoX = x + 4;
  const photoY = y + 17.2;
  const photoSize = 24;
  if (photo) {
    try { doc.addImage(photo, 'JPEG', photoX, photoY, photoSize, photoSize, undefined, 'FAST'); } catch { photo = null; }
  }
  if (!photo) {
    doc.setFillColor(243, 244, 246);
    doc.rect(photoX, photoY, photoSize, photoSize, 'F');
    setFont(doc, 'normal', 5, 140);
    doc.text('NO PHOTO', photoX + photoSize / 2, photoY + photoSize / 2 + 0.8, { align: 'center' });
  }
  doc.setDrawColor(190);
  doc.setLineWidth(0.25);
  doc.rect(photoX, photoY, photoSize, photoSize);

  // The member.
  const columnX = x + 32;
  const columnWidth = CARD_WIDTH - 32 - 4;
  setFont(doc, 'bold', 5.8, GREEN);
  doc.text('MEMBER ID', columnX, y + 19.8, { charSpace: 0.35 });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17);
  const { lines, size } = fitName(doc, card, columnWidth);
  const lineHeight = size * POINT * 1.12;
  doc.text(lines, columnX, y + 20.6 + lineHeight, { lineHeightFactor: 1.12 });
  const details: Array<[string, string]> = [
    ['Member No.', card.memberNumber || `#${card.memberId}`],
    ['Member since', formatDate(card.memberSince)],
  ];
  details.forEach(([label, value], index) => {
    const top = y + 33.8 + index * 7.2;
    setFont(doc, 'normal', 5, 110);
    doc.text(label, columnX, top);
    setFont(doc, 'bold', 7.6, 17);
    doc.text(pdfText(value), columnX, top + 3.3);
  });

  doc.setFillColor(...GOLD);
  doc.rect(x, y + 49.4, CARD_WIDTH, 0.5, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(x, y + 49.9, CARD_WIDTH, CARD_HEIGHT - 49.9, 'F');
}

function drawBack(doc: jsPDF, x: number, y: number, { card }: PrintableCard, signers: CertificateSigners) {
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, CARD_WIDTH, CARD_HEIGHT, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(x, y, CARD_WIDTH, 3, 'F');

  // The QR, with a light border around it as readers need.
  const qrX = x + 4;
  const qrY = y + 6.6;
  const qrSize = 29;
  drawQrOnPdf(doc, qrModules(card.qr), qrX, qrY, qrSize);
  setFont(doc, 'bold', 5.4, GREEN);
  doc.text('SCAN TO CHECK IN', qrX + qrSize / 2, qrY + qrSize + 3.4, { align: 'center' });
  setFont(doc, 'normal', 5, 90);
  doc.text(pdfText(card.memberNumber || `Member #${card.memberId}`), qrX + qrSize / 2, qrY + qrSize + 6.2, { align: 'center' });

  // The notice, then the two signatures.
  const columnX = x + 37.5;
  const columnWidth = CARD_WIDTH - 37.5 - 3.5;
  const center = columnX + columnWidth / 2;
  setFont(doc, 'normal', 5, 60);
  const notice = doc.splitTextToSize(pdfText(`This card is the property of ACIFAC and identifies the member named on the front. If found, please return it to the ACIFAC office, ${INVOICE_HEADER.address}.`), columnWidth) as string[];
  doc.text(notice, columnX, y + 7.6, { lineHeightFactor: 1.25 });
  [[signers.chairperson, 'Chairperson, Board of Directors', 27.4], [signers.manager, 'General Manager', 38.6]].forEach(([name, role, lineY]) => {
    const top = y + Number(lineY);
    if (String(name).trim()) {
      setFont(doc, 'bold', 5.9, 17);
      const printed = pdfText(String(name).trim().toUpperCase());
      while (doc.getTextWidth(printed) > columnWidth - 2 && doc.getFontSize() > 4.5) doc.setFontSize(doc.getFontSize() - 0.3);
      doc.text(printed, center, top - 0.9, { align: 'center' });
    }
    doc.setDrawColor(70);
    doc.setLineWidth(0.2);
    doc.line(columnX + 2, top, columnX + columnWidth - 2, top);
    setFont(doc, 'normal', 4.8, 90);
    doc.text(String(role), center, top + 2.3, { align: 'center' });
  });

  setFont(doc, 'normal', 4.8, 110);
  doc.text(`Issued ${formatDate(card.issuedAt)}`, x + 4, y + 47.6);
  doc.setFillColor(...GOLD);
  doc.rect(x, y + 49.4, CARD_WIDTH, 0.5, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(x, y + 49.9, CARD_WIDTH, CARD_HEIGHT - 49.9, 'F');
}

/** The cut line around a front-and-back pair on a sheet, and the dashed fold line between them. */
function drawCutAndFold(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(185);
  doc.setLineWidth(0.15);
  doc.rect(x, y, CARD_WIDTH * 2, CARD_HEIGHT);
  doc.setLineDashPattern([1.2, 1], 0);
  doc.line(x + CARD_WIDTH, y - 1.5, x + CARD_WIDTH, y + CARD_HEIGHT + 1.5);
  doc.setLineDashPattern([], 0);
}

/** The PDF of the cards in the layout chosen (see the top of this file). */
export async function buildIdCardPdf(cards: PrintableCard[], layout: IdCardLayout, signers: CertificateSigners, title: string) {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadPdfLogo()]);
  const doc = layout === 'card'
    ? new jsPDF({ unit: 'mm', format: [CARD_WIDTH, CARD_HEIGHT], orientation: 'landscape' })
    : new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title, creator: 'ACIFAC' });
  if (layout === 'card') {
    cards.forEach((item, index) => {
      if (index > 0) doc.addPage([CARD_WIDTH, CARD_HEIGHT], 'landscape');
      drawFront(doc, 0, 0, item, logo);
      doc.addPage([CARD_WIDTH, CARD_HEIGHT], 'landscape');
      drawBack(doc, 0, 0, item, signers);
    });
    return doc;
  }
  const left = (SHEET.width - CARD_WIDTH * 2) / 2;
  const top = (SHEET.height - (SHEET.rows * CARD_HEIGHT + (SHEET.rows - 1) * SHEET.gap)) / 2;
  cards.forEach((item, index) => {
    const row = index % SHEET.rows;
    if (index > 0 && row === 0) doc.addPage('a4', 'portrait');
    const y = top + row * (CARD_HEIGHT + SHEET.gap);
    drawFront(doc, left, y, item, logo);
    drawBack(doc, left + CARD_WIDTH, y, item, signers);
    drawCutAndFold(doc, left, y);
  });
  return doc;
}

/**
 * Loads each card's photo (a few at a time) and the signers, then downloads
 * the PDF. onProgress tells how many photos are ready.
 */
export async function downloadIdCards(cards: IdCard[], layout: IdCardLayout, fileName: string, onProgress?: (done: number, total: number) => void) {
  const signers = loadCardSigners();
  const printable: PrintableCard[] = cards.map((card) => ({ card, photo: null }));
  let next = 0;
  let done = 0;
  onProgress?.(0, cards.length);
  const worker = async () => {
    while (next < printable.length) {
      const item = printable[next];
      next += 1;
      item.photo = await loadCardPhoto(item.card.photo);
      done += 1;
      onProgress?.(done, cards.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, printable.length) }, worker));
  const doc = await buildIdCardPdf(printable, layout, await signers, fileName);
  doc.save(`${fileName}.pdf`);
}

/** The file name of one member's card. */
export const idCardFileName = (card: IdCard) => pdfText(`ACIFAC Member ID ${card.memberNumber || card.name}`).replace(/[\\/:*?"<>|]+/g, '-');
