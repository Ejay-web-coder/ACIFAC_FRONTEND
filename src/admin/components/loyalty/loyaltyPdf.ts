// The printable loyalty awards: a certificate for each member (A4 landscape,
// one page each, so a whole group prints in one go) and the Loyalty Awards
// report (A4 portrait) listing the members of each award group.
import type { jsPDF } from 'jspdf';
import { COOPERATIVE_NAME, drawPdfLogo, loadPdfLogo } from '../../../lib/pdfLogo';
import { formatDate } from '../../../utils/dateTime';
import type { LoyaltyMember } from '../../services/membersApi';
import { INVOICE_HEADER } from '../loanInvoice';
import { finalY, font, footers, PAGE, pdfText, tableStyles } from '../paperFormPdf';
import { givenOn, groupByTier, inGoodStanding, standingRule, tierOf, yearsPhrase, type CertificateSigners } from './loyaltyTiers';

const ADDRESS = INVOICE_HEADER.address;
const GREEN: [number, number, number] = [22, 101, 52];
const GOLD: [number, number, number] = [166, 124, 32];
// A4 landscape, in mm.
const WIDTH = 297;
const HEIGHT = 210;
const CENTER = WIDTH / 2;
const POINT = 0.3528; // mm per point

function drawCertificate(doc: jsPDF, logo: Uint8Array | null, member: LoyaltyMember, awardDate: string, signers: CertificateSigners) {
  // The frame: a green border, a thin gold line inside it, gold diamonds at the corners.
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(2.2);
  doc.rect(8, 8, WIDTH - 16, HEIGHT - 16);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.rect(12.5, 12.5, WIDTH - 25, HEIGHT - 25);
  doc.setFillColor(...GOLD);
  for (const [x, y] of [[12.5, 12.5], [WIDTH - 12.5, 12.5], [12.5, HEIGHT - 12.5], [WIDTH - 12.5, HEIGHT - 12.5]]) {
    doc.triangle(x - 3, y, x, y - 3, x + 3, y, 'F');
    doc.triangle(x - 3, y, x, y + 3, x + 3, y, 'F');
  }

  const logoSize = 24;
  let y = drawPdfLogo(doc, logo, CENTER - logoSize / 2, 18, logoSize) ? 49 : 32;
  font(doc, 'bold', 10.5);
  doc.setTextColor(...GREEN);
  doc.text(COOPERATIVE_NAME, CENTER, y, { align: 'center' });
  font(doc, 'normal', 9, 90);
  doc.text(ADDRESS, CENTER, y + 5, { align: 'center' });

  y += 21;
  doc.setFont('times', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(...GREEN);
  doc.text('CERTIFICATE OF LOYALTY', CENTER, y, { align: 'center' });

  // The award, between two short gold rules.
  const award = (tierOf(member.years).award ?? 'Loyalty Award').toUpperCase();
  font(doc, 'bold', 10);
  doc.setTextColor(...GOLD);
  doc.text(award, CENTER, y + 9, { align: 'center' });
  const half = doc.getTextWidth(award) / 2;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.4);
  doc.line(CENTER - half - 32, y + 7.8, CENTER - half - 5, y + 7.8);
  doc.line(CENTER + half + 5, y + 7.8, CENTER + half + 32, y + 7.8);

  y += 25;
  doc.setFont('times', 'italic');
  doc.setFontSize(14);
  doc.setTextColor(70);
  doc.text('is proudly presented to', CENTER, y, { align: 'center' });

  // The member's name, made smaller when a long name would not fit.
  y += 16;
  const name = pdfText(member.name.toUpperCase());
  doc.setFont('times', 'bold');
  let size = 30;
  doc.setFontSize(size);
  while (doc.getTextWidth(name) > 235 && size > 16) doc.setFontSize(--size);
  doc.setTextColor(17);
  doc.text(name, CENTER, y, { align: 'center' });
  // The gold line under the name, longer under a long name.
  const underline = Math.max(88, doc.getTextWidth(name) / 2 + 8);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(CENTER - underline, y + 4, CENTER + underline, y + 4);
  if (member.memberNumber) {
    font(doc, 'normal', 9, 100);
    doc.text(`Member No. ${member.memberNumber}`, CENTER, y + 9.5, { align: 'center' });
  }

  y += 22;
  const bodySize = 13.5;
  doc.setFont('times', 'normal');
  doc.setFontSize(bodySize);
  doc.setTextColor(40);
  const body = doc.splitTextToSize(pdfText(
    `in grateful recognition of ${yearsPhrase(member.years)} of loyal and continuous membership in the cooperative since ${formatDate(member.membershipDate)}, and for the faithful patronage and support given to the cooperative and its members.`,
  ), 205);
  doc.text(body, CENTER, y, { align: 'center', lineHeightFactor: 1.4 });
  y += body.length * bodySize * POINT * 1.4 + 4;
  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(70);
  doc.text(`Given this ${givenOn(awardDate)} at ${ADDRESS}.`, CENTER, y, { align: 'center' });

  // The signatures, with the officers' names when they are known.
  const lineY = 180;
  for (const [x, signer, role] of [[CENTER - 64, signers.chairperson, 'Chairperson, Board of Directors'], [CENTER + 64, signers.manager, 'General Manager']] as const) {
    if (signer.trim()) {
      font(doc, 'bold', 10.5);
      doc.text(pdfText(signer.trim().toUpperCase()), x, lineY - 2, { align: 'center' });
    }
    doc.setDrawColor(60);
    doc.setLineWidth(0.3);
    doc.line(x - 40, lineY, x + 40, lineY);
    font(doc, 'normal', 9, 90);
    doc.text(role, x, lineY + 4.5, { align: 'center' });
  }
}

/** One PDF with a certificate page for each member. */
export async function buildLoyaltyCertificates(members: LoyaltyMember[], awardDate: string, signers: CertificateSigners, title: string) {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadPdfLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  doc.setProperties({ title, creator: 'ACIFAC' });
  members.forEach((member, index) => {
    if (index > 0) doc.addPage('a4', 'landscape');
    drawCertificate(doc, logo, member, awardDate, signers);
  });
  return doc;
}

export async function downloadLoyaltyCertificates(members: LoyaltyMember[], awardDate: string, signers: CertificateSigners, fileName: string) {
  (await buildLoyaltyCertificates(members, awardDate, signers, fileName)).save(`${fileName}.pdf`);
}

export async function downloadLoyaltyReportPdf(members: LoyaltyMember[], awardDate: string, minAttendance?: number) {
  const doc = await buildLoyaltyReportPdf(members, awardDate, minAttendance);
  doc.save(`Loyalty Awards Report ${awardDate}.pdf`);
}

/** The Loyalty Awards report: the count in each group, then the members of each award group. */
export async function buildLoyaltyReportPdf(members: LoyaltyMember[], awardDate: string, minAttendance?: number) {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadPdfLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `Loyalty Awards Report ${awardDate}`, creator: 'ACIFAC' });

  const x = drawPdfLogo(doc, logo, PAGE.left, 9.5, 21) ? PAGE.left + 25 : PAGE.left;
  font(doc, 'bold', 8.3, 40);
  doc.text(COOPERATIVE_NAME, x, 15.5, { maxWidth: PAGE.right - x });
  font(doc, 'normal', 8, 80);
  doc.text(ADDRESS, x, 20);
  font(doc, 'bold', 17);
  doc.text('LOYALTY AWARDS REPORT', x, 29);
  doc.setDrawColor(17);
  doc.setLineWidth(0.6);
  doc.line(PAGE.left, 32.5, PAGE.right, 32.5);
  font(doc, 'normal', 9, 60);
  doc.text(`Active members by full years of membership as of ${formatDate(awardDate)}, counted from the membership date.`, PAGE.left, 39);
  if (minAttendance !== undefined) {
    font(doc, 'normal', 8, 80);
    doc.text(pdfText(`An award needs good standing in the 12 months before: ${standingRule(minAttendance)}.`), PAGE.left, 43, { maxWidth: PAGE.right - PAGE.left });
  }

  const styles = { ...tableStyles.styles, minCellHeight: 6.5 };
  const groups = groupByTier(members);
  autoTable(doc, {
    ...tableStyles,
    styles,
    startY: minAttendance !== undefined ? 50 : 43,
    head: [['Years of membership', 'Award', 'Members']],
    body: groups.map(({ tier, members: list }) => [pdfText(tier.label), tier.award ?? 'Not yet eligible', String(list.length)]),
    foot: [['Total active members', '', { content: String(members.length), styles: { halign: 'right' } }]],
    showFoot: 'lastPage',
    footStyles: { fillColor: 245, textColor: 17, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right', cellWidth: 28 } },
  });

  let y = finalY(doc) + 10;
  for (const { tier, members: list } of groups) {
    if (!tier.award) continue;
    if (y > PAGE.bottom - 30) { doc.addPage(); y = 22; }
    font(doc, 'bold', 10.5);
    doc.text(pdfText(`${tier.label}: ${tier.award} (${list.filter(inGoodStanding).length} of ${list.length} in good standing)`), PAGE.left, y);
    autoTable(doc, {
      ...tableStyles,
      styles,
      startY: y + 2.5,
      head: [['#', 'Member No.', 'Name', 'Member Since', 'Years', 'Barangay', 'Standing']],
      body: list.length
        ? list.map((member, index) => [String(index + 1), member.memberNumber, pdfText(member.name), formatDate(member.membershipDate, true), String(member.years), pdfText(member.barangay),
          inGoodStanding(member) ? 'Good standing' : pdfText(member.standing.reasons.join('; '))])
        : [[{ content: `No active member has reached ${tier.min} years yet.`, colSpan: 7, styles: { halign: 'center', textColor: 110 } }]],
      columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 30 }, 3: { cellWidth: 24 }, 4: { cellWidth: 12, halign: 'center' }, 5: { cellWidth: 26 }, 6: { cellWidth: 36 } },
    });
    y = finalY(doc) + 10;
  }

  footers(doc, 'Loyalty Awards Report', `As of ${formatDate(awardDate)}`);
  return doc;
}
