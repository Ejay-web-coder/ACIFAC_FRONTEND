// The printable "Loan Application Form (Agri)", downloaded from New Loan. The
// borrower fills it in by hand; scanned in the OCR Scanner it is read as a
// Loan Form and, with the borrower's and co-maker's valid IDs, becomes a loan
// application waiting for approval. The sections follow what the scanner
// reads: borrower, farm, loan mode with the in-kind inputs table, cash
// amount, co-maker and collateral. The office-use approval box is not read.
import { blank, checkboxes, finalY, font, footers, heading, instructions, newForm, PAGE, ROW, sectionTitle, signatures, tableStyles } from './paperFormPdf';

export const LOAN_FORM_CODE = 'ACIFAC-LOAN';
// The rows of the in-kind farm inputs table, as the scanner reads them.
const INPUT_ROWS = ['Fertilizer', 'Pesticides', 'Herbicides', 'Insecticides', 'Seeds', 'Plant Chemicals for Spray'];

export async function downloadLoanFormPdf() {
  const { doc, autoTable } = await newForm('ACIFAC Loan Application Form (Agri)');
  let y = heading(doc, 'LOAN APPLICATION FORM (AGRI)', LOAN_FORM_CODE, 'Agricultural loan · write in block letters, black or blue pen');

  blank(doc, 'Form No.', PAGE.left, y, 70);
  font(doc, 'italic', 7, 120);
  doc.text('(office use)', 72, y);
  blank(doc, 'Date of Application', 100, y, PAGE.right, 'MM/DD/YYYY');
  y += 10;

  y = sectionTitle(doc, 'I. BORROWER', '', y);
  y += 5;
  blank(doc, 'Borrower Name', PAGE.left, y, 140, 'First name, middle name, last name');
  blank(doc, 'Member No.', 144, y, PAGE.right);
  y += 10;
  blank(doc, 'Occupation', PAGE.left, y, 90);
  blank(doc, 'Years of Farming', 94, y, 150);
  blank(doc, 'Age', 154, y, PAGE.right);
  y += 9;
  checkboxes(doc, 'Civil Status', ['Single', 'Married', 'Widowed', 'Separated'], PAGE.left, y);
  checkboxes(doc, 'Sex', ['Male', 'Female'], 140, y);
  y += 9;
  blank(doc, 'Address', PAGE.left, y, PAGE.right);
  y += 9;
  blank(doc, 'Contact No.', PAGE.left, y, 80, '09XXXXXXXXX');
  blank(doc, 'Email', 84, y, PAGE.right);
  y += 11;

  y = sectionTitle(doc, 'II. FARM', '', y);
  y += 5;
  blank(doc, 'Farm Location / Sitio & Barangay', PAGE.left, y, 140);
  blank(doc, 'Farm Area (ha)', 144, y, PAGE.right);
  y += 9;
  blank(doc, 'Crops Planted', PAGE.left, y, 120);
  blank(doc, 'Crop Season / Year', 124, y, PAGE.right);
  y += 9;
  checkboxes(doc, 'Irrigation', ['Rainfed', 'Irrigated', 'Other:'], PAGE.left, y);
  doc.setLineWidth(0.25);
  doc.line(103, y + 1, PAGE.right, y + 1);
  y += 11;

  y = sectionTitle(doc, 'III. LOAN', '', y);
  y += 5;
  checkboxes(doc, 'Loan Mode (tick one)', ['Cash', 'In-Kind', 'Combination'], PAGE.left, y);
  // Every loan is for 6 months, the whole amount due at the end of the term.
  font(doc, 'bold', 9.5);
  doc.text('Term: 6 months, due at end of term', PAGE.right, y, { align: 'right' });
  y += 4;
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['IN-KIND FARM INPUTS', 'DESCRIPTION / BRAND', 'QUANTITY', 'UNIT', 'UNIT PRICE (PHP)', 'TOTAL AMOUNT (PHP)']],
    body: INPUT_ROWS.map((row) => [row, '', '', '', '', '']),
    foot: [[{ content: 'GRAND TOTAL (IN-KIND)', colSpan: 5, styles: { halign: 'right' } }, '']],
    footStyles: { fillColor: 245, textColor: 17, fontStyle: 'bold', minCellHeight: 9 },
    columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' }, 1: { cellWidth: 46 }, 2: { cellWidth: 20 }, 3: { cellWidth: 18 }, 4: { cellWidth: 28 }, 5: { cellWidth: 34 } },
    rowPageBreak: 'avoid',
  });
  y = finalY(doc) + 8;
  blank(doc, 'Cash Amount Requested (PHP)', PAGE.left, y, 120);
  font(doc, 'italic', 7, 120);
  doc.text('(for a cash or combination loan)', 122, y);
  y += 10;

  y = sectionTitle(doc, 'IV. CO-MAKER', '(must be another person, not the borrower)', y);
  y += 5;
  blank(doc, 'Co-Maker Name', PAGE.left, y, 120);
  blank(doc, 'Relationship to Borrower', 124, y, PAGE.right);
  y += 9;
  blank(doc, 'Address', PAGE.left, y, 140);
  blank(doc, 'Contact No.', 144, y, PAGE.right);
  y += 11;

  y = sectionTitle(doc, 'V. COLLATERAL', '', y);
  y += 5;
  checkboxes(doc, 'Collateral Offered (tick one)', ['Land Title / Property', 'Harvest', 'Savings Deposit / Share Capital'], PAGE.left, y);
  y += 9;
  blank(doc, 'Description / Details of Collateral', PAGE.left, y, PAGE.right);
  y += 8;
  doc.setLineWidth(0.25);
  doc.line(PAGE.left, y + 1, PAGE.right, y + 1);
  y += 7;

  y = instructions(doc, [
    'I certify that the information above is true and correct. I authorize ACIFAC Cooperative to verify it and to conduct a credit investigation, and I agree to pay the loan according to its terms.',
  ], y);
  y = signatures(doc, y - 4, ['Signature of Borrower over Printed Name', 'Signature of Co-Maker over Printed Name']) + 8;

  y = sectionTitle(doc, 'VI. FOR OFFICE USE ONLY', '', y);
  y += 5;
  checkboxes(doc, 'Action', ['APPROVED', 'DISAPPROVED', 'FOR EVALUATION'], PAGE.left, y);
  y += 9;
  blank(doc, 'Approved Amount (PHP)', PAGE.left, y, 95);
  blank(doc, 'Approved by', 100, y, 160);
  blank(doc, 'Date', 164, y, PAGE.right);
  y += 4;
  autoTable(doc, {
    ...tableStyles,
    startY: y + 2,
    head: [['REQUIREMENT (attach)', 'RECEIVED', 'CHECKED BY']],
    body: [['Borrower\'s valid ID: front and back on one page, with 3 specimen signatures', '', ''], ['Co-maker\'s valid ID: front and back on one page, with 3 specimen signatures', '', '']],
    columnStyles: { 0: { cellWidth: 126 }, 1: { cellWidth: 22 }, 2: { cellWidth: 38 } },
    styles: { ...tableStyles.styles, minCellHeight: ROW + 1 },
    rowPageBreak: 'avoid',
  });
  y = finalY(doc) + 5;
  if (y > PAGE.bottom - 12) { doc.addPage(); y = 22; }
  instructions(doc, [
    'Office: scan this form in the OCR Scanner, then submit the borrower\'s and the co-maker\'s ID copies. The application goes to Loans & Payments for approval when every check passes; approving the loan stays an officer\'s decision.',
  ], y);
  footers(doc, LOAN_FORM_CODE, 'Scan in OCR Scanner to file the loan application');
  doc.save('ACIFAC Loan Application Form.pdf');
}
