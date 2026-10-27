// The printable ACIFAC associate membership form, downloaded from Add Member.
// An applicant fills it in by hand; scanned in the OCR Scanner it is read as
// a Membership Form and, with the applicant's valid ID, registers the member.
// The sections follow what the scanner reads: personal details, permanent
// address, family, sources of income, membership acceptance / separation,
// and the "For Cooperative" certification.
import { blank, checkboxes, finalY, font, footers, heading, instructions, newForm, PAGE, ROW, sectionTitle, signatures, tableStyles } from './paperFormPdf';

export const MEMBERSHIP_FORM_CODE = 'ACIFAC-MEM';
const CHILD_ROWS = 3;
const INCOME_ROWS = 2;
// The 2x2 picture box at the top right, beside the personal details.
const PHOTO = { size: 40, x: PAGE.right - 40, y: 37 };
const BESIDE_PHOTO = PHOTO.x - 6;

export async function downloadMembershipFormPdf() {
  const { doc, autoTable } = await newForm('ACIFAC Associate Membership Form');
  let y = heading(doc, 'ASSOCIATE MEMBERSHIP FORM', MEMBERSHIP_FORM_CODE, 'Application for membership · write in block letters, black or blue pen');

  // The 2x2 picture box.
  doc.setDrawColor(17);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.5, 1.2], 0);
  doc.rect(PHOTO.x, PHOTO.y, PHOTO.size, PHOTO.size);
  doc.setLineDashPattern([], 0);
  font(doc, 'bold', 8, 110);
  doc.text('ATTACH', PHOTO.x + PHOTO.size / 2, PHOTO.y + PHOTO.size / 2 - 3, { align: 'center' });
  doc.text('2x2 PICTURE', PHOTO.x + PHOTO.size / 2, PHOTO.y + PHOTO.size / 2 + 1.5, { align: 'center' });
  font(doc, 'normal', 6.5, 130);
  doc.text('recent, clear face', PHOTO.x + PHOTO.size / 2, PHOTO.y + PHOTO.size / 2 + 5.5, { align: 'center' });

  blank(doc, 'Membership No.', PAGE.left, y, 95);
  font(doc, 'italic', 7, 120);
  doc.text('(office use; given by the system)', 97, y);
  y += 9;

  y = sectionTitle(doc, 'I. PERSONAL INFORMATION', '', y);
  y += 5;
  blank(doc, 'Last Name', PAGE.left, y, 85);
  blank(doc, 'First Name', 88, y, BESIDE_PHOTO);
  y += 9;
  blank(doc, 'Middle Name', PAGE.left, y, 85);
  blank(doc, 'Suffix (Jr., Sr., III)', 88, y, BESIDE_PHOTO);
  y += 9;
  blank(doc, 'Birthday', PAGE.left, y, 62, 'MM/DD/YYYY');
  blank(doc, 'Age', 66, y, 86);
  checkboxes(doc, 'Gender', ['Male', 'Female'], 90, y);
  y += 9;
  checkboxes(doc, 'Civil Status', ['Single', 'Married', 'Widowed', 'Separated'], PAGE.left, y);
  y += 9;
  blank(doc, 'CP No.', PAGE.left, y, 72, '09XXXXXXXXX');
  blank(doc, 'Email', 76, y, PAGE.right);
  y += 9;
  blank(doc, 'Highest Educational Attainment', PAGE.left, y, PAGE.right);
  y += 9;
  blank(doc, 'Valid ID Type', PAGE.left, y, 100);
  blank(doc, 'ID No.', 104, y, PAGE.right);
  y += 9;
  blank(doc, 'RSBSA No.', PAGE.left, y, 120, 'e.g. 17-51-08-012-000123');
  blank(doc, 'Farm Area (ha)', 124, y, PAGE.right);
  y += 11;

  y = sectionTitle(doc, 'II. PERMANENT ADDRESS', '', y);
  y += 5;
  blank(doc, 'House No. / Street / Sitio / Purok', PAGE.left, y, PAGE.right);
  y += 9;
  blank(doc, 'Barangay', PAGE.left, y, 72);
  blank(doc, 'Municipality', 76, y, 138);
  blank(doc, 'Province', 142, y, PAGE.right);
  y += 11;

  y = sectionTitle(doc, 'III. FAMILY', '', y);
  y += 5;
  blank(doc, 'Spouse Name', PAGE.left, y, 110);
  blank(doc, 'Age', 114, y, 134);
  blank(doc, 'Contact No.', 138, y, PAGE.right);
  y += 9;
  font(doc, 'bold', 9.5);
  doc.text('Mother\'s Maiden Name', PAGE.left, y);
  y += 7;
  blank(doc, 'Last Name', PAGE.left, y, 72);
  blank(doc, 'First Name', 76, y, 136);
  blank(doc, 'Middle Name', 140, y, PAGE.right);
  y += 5;
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['#', 'NAME OF CHILD', 'AGE']],
    body: Array.from({ length: CHILD_ROWS }, (_, index) => [String(index + 1), '', '']),
    columnStyles: { 0: { cellWidth: 9, halign: 'center', textColor: 90 }, 1: { cellWidth: 147 }, 2: { cellWidth: 30 } },
  });
  y = finalY(doc) + 8;

  y = sectionTitle(doc, 'IV. SOURCES OF INCOME', '', y);
  autoTable(doc, {
    ...tableStyles,
    startY: y + 1,
    head: [['#', 'SOURCE OF INCOME (e.g. Palay farming)', 'ANNUAL INCOME (PHP)']],
    body: Array.from({ length: INCOME_ROWS }, (_, index) => [String(index + 1), '', '']),
    columnStyles: { 0: { cellWidth: 9, halign: 'center', textColor: 90 }, 1: { cellWidth: 127 }, 2: { cellWidth: 50 } },
  });
  y = finalY(doc) + 6;

  y = instructions(doc, [
    'I apply for associate membership in ACIFAC Cooperative. I certify that the information above is true and correct, and I agree to abide by the by-laws and policies of the cooperative.',
  ], y);
  y = signatures(doc, y - 4, ['Signature of Applicant over Printed Name', 'Date Signed']) + 8;

  y = sectionTitle(doc, 'V. MEMBERSHIP', '(office use)', y);
  autoTable(doc, {
    ...tableStyles,
    startY: y + 1,
    head: [['', 'DATE', 'B.O.D. RESOLUTION NO.', 'TYPE OF MEMBERSHIP']],
    body: [['ACCEPTANCE', '', '', 'Associate'], ['SEPARATION', '', '', '']],
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold' }, 1: { cellWidth: 40 }, 2: { cellWidth: 57 }, 3: { cellWidth: 57, textColor: 110 } },
    rowPageBreak: 'avoid',
  });
  y = finalY(doc) + 8;

  y = sectionTitle(doc, 'VI. FOR COOPERATIVE', '(office use)', y);
  y += 5;
  blank(doc, 'Membership Fee (PHP)', PAGE.left, y, 95);
  blank(doc, 'Date Received', 100, y, PAGE.right, 'MM/DD/YYYY');
  y += 7;
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['REQUIREMENT', 'O.R. NO.', 'AMOUNT (PHP)', 'CERTIFIED BY']],
    body: [['Pre-Membership Education Seminar', '', '', ''], ['Payment of Membership Fee', '', '', ''], ['Initial Paid-Up Capital', '', '', '']],
    columnStyles: { 0: { cellWidth: 62, fontStyle: 'bold' }, 1: { cellWidth: 36 }, 2: { cellWidth: 36 }, 3: { cellWidth: 52 } },
    styles: { ...tableStyles.styles, minCellHeight: ROW + 1 },
    rowPageBreak: 'avoid',
  });
  y = finalY(doc) + 6;

  if (y > PAGE.bottom - 18) { doc.addPage(); y = 22; }
  instructions(doc, [
    `Requirements: (1) a 2x2 picture in the box on page 1; (2) a photocopy of a valid ID, front and back on one page, with the applicant's 3 specimen signatures.`,
    'Office: scan this form in the OCR Scanner, then submit the ID copy (or capture the ID with the live camera). The member is registered when every check passes.',
  ], y);
  footers(doc, MEMBERSHIP_FORM_CODE, 'Scan in OCR Scanner to register the member');
  doc.save('ACIFAC Membership Form.pdf');
}
