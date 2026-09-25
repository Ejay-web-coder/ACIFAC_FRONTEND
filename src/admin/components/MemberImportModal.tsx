import { useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { importMembersRequest, MEMBER_IMPORT_BATCH_SIZE, type MemberImportResult, type MemberImportRow } from '../services/membersApi';

// Spreadsheet column → API field. Headers are matched case-insensitively with
// spaces, dots and underscores ignored, so "First Name", "first_name" and
// "FIRSTNAME" all map to first_name.
const COLUMN_ALIASES: Record<string, keyof MemberImportRow> = {
  firstname: 'first_name', givenname: 'first_name', fname: 'first_name',
  middlename: 'middle_name', mname: 'middle_name', middleinitial: 'middle_name', mi: 'middle_name',
  lastname: 'last_name', surname: 'last_name', familyname: 'last_name', lname: 'last_name',
  suffix: 'suffix', ext: 'suffix', extension: 'suffix',
  name: 'full_name', fullname: 'full_name', membername: 'full_name',
  email: 'email', emailaddress: 'email',
  phone: 'phone', phonenumber: 'phone', mobile: 'phone', mobilenumber: 'phone', contact: 'phone', contactnumber: 'phone', cpno: 'phone', cellphone: 'phone',
  address: 'address', permanentaddress: 'address', homeaddress: 'address',
  barangay: 'barangay', brgy: 'barangay',
  municipality: 'municipality', city: 'municipality', town: 'municipality', citymunicipality: 'municipality',
  province: 'province',
  birthday: 'date_of_birth', birthdate: 'date_of_birth', dateofbirth: 'date_of_birth', dob: 'date_of_birth',
  gender: 'gender', sex: 'gender',
  civilstatus: 'civil_status',
  education: 'education', highesteducation: 'education', educationalattainment: 'education',
  idtype: 'id_type', idnumber: 'id_number', idno: 'id_number',
  rsbsa: 'rsbsa_no', rsbsano: 'rsbsa_no', rsbsanumber: 'rsbsa_no',
  livelihood: 'livelihood', occupation: 'livelihood',
  farmarea: 'farm_area_ha', farmareaha: 'farm_area_ha', farmsize: 'farm_area_ha',
  annualincome: 'yearly_income', yearlyincome: 'yearly_income', income: 'yearly_income',
  spouse: 'spouse_name', spousename: 'spouse_name', spouseage: 'spouse_age', spousecontact: 'spouse_contact',
  membershipdate: 'membership_date', datejoined: 'membership_date', dateofmembership: 'membership_date', acceptancedate: 'membership_date',
  sharecapital: 'share_capital', initialsharecapital: 'share_capital', paidupcapital: 'share_capital', initialpaidupcapital: 'share_capital',
};

const TEMPLATE_HEADERS = ['First Name', 'Middle Name', 'Last Name', 'Suffix', 'Email', 'Phone', 'Address', 'Barangay', 'Municipality', 'Province', 'Birthday', 'Gender', 'Civil Status', 'RSBSA No', 'Livelihood', 'Farm Area', 'Membership Date', 'Share Capital'];
const TEMPLATE_EXAMPLE = ['Juan', 'Santos', 'Dela Cruz', '', 'juan.delacruz@example.com', '09171234567', 'Purok 1', 'San Isidro', 'Cabanatuan', 'Nueva Ecija', '1985-04-12', 'Male', 'Married', '', 'Rice farming', '1.5', '', '500'];

const REQUIRED: Array<[keyof MemberImportRow, string]> = [['first_name', 'first name'], ['last_name', 'last name'], ['email', 'email'], ['phone', 'phone'], ['address', 'address']];
const DATE_FIELDS = new Set<keyof MemberImportRow>(['date_of_birth', 'membership_date']);

const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = (value: number) => String(value).padStart(2, '0');

// Excel cells arrive as Date objects (cellDates) and text cells as strings.
// Both are converted to YYYY-MM-DD, which is what the backend accepts.
function toDateOnly(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  const slash = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slash) return `${slash[3]}-${pad(Number(slash[1]))}-${pad(Number(slash[2]))}`; // MM/DD/YYYY, as Excel shows it in PH locale
  return text;
}

function splitFullName(fullName: string) {
  const text = fullName.trim();
  if (text.includes(',')) {
    // "Dela Cruz, Juan Santos"
    const [last, rest = ''] = text.split(',', 2).map((part) => part.trim());
    const [first = '', ...middle] = rest.split(/\s+/).filter(Boolean);
    return { first_name: first, middle_name: middle.join(' '), last_name: last };
  }
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], middle_name: '', last_name: '' };
  return { first_name: parts[0], middle_name: parts.slice(1, -1).join(' '), last_name: parts[parts.length - 1] };
}

interface PreviewRow {
  data: MemberImportRow;
  problems: string[];
}

async function parseSpreadsheet(file: File): Promise<{ rows: PreviewRow[]; unmatched: string[] }> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The file has no worksheet.');
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
  if (!records.length) throw new Error('No rows found. The first row must contain column headers.');

  const headers = Object.keys(records[0]);
  const unmatched = headers.filter((header) => !COLUMN_ALIASES[normalizeHeader(header)] && !header.startsWith('__EMPTY'));

  const rows = records.map((record, index) => {
    const data: MemberImportRow = { row_number: index + 2 }; // +2: header row, and spreadsheets count from 1
    for (const [header, value] of Object.entries(record)) {
      const field = COLUMN_ALIASES[normalizeHeader(header)];
      if (!field || field === 'row_number') continue;
      const text = DATE_FIELDS.has(field) ? toDateOnly(value) : String(value ?? '').trim();
      if (text) (data as Record<string, unknown>)[field] = text;
    }
    if (data.full_name && !data.first_name && !data.last_name) Object.assign(data, splitFullName(String(data.full_name)));
    delete data.full_name;
    if (data.email) data.email = String(data.email).toLowerCase();
    if (data.share_capital) data.share_capital = String(data.share_capital).replace(/[,₱\s]|PHP/gi, '');
    const problems = REQUIRED.filter(([field]) => !data[field]).map(([, label]) => `Missing ${label}`);
    return { data, problems };
  }).filter(({ data }) => Object.keys(data).length > 1); // skip fully blank lines

  return { rows, unmatched };
}

async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);
  sheet['!cols'] = TEMPLATE_HEADERS.map((header) => ({ wch: Math.max(14, header.length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Members');
  XLSX.writeFile(workbook, 'acifac-member-import-template.xlsx');
}

export function MemberImportModal({ onClose, onImported }: { onClose: () => void; onImported: (imported: number) => void | Promise<void> }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<MemberImportResult[] | null>(null);

  const readyRows = rows.filter((row) => !row.problems.length);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setRows([]);
    setUnmatched([]);
    setResults(null);
    setParseError('');
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setParseError('Choose an Excel file (.xlsx or .xls).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError('The file is larger than 5 MB.');
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseSpreadsheet(file);
      setRows(parsed.rows);
      setUnmatched(parsed.unmatched);
      if (!parsed.rows.length) setParseError('No member rows found in the file.');
    } catch (error) {
      setParseError(errorMessage(error, 'Unable to read the file.'));
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!readyRows.length) return;
    setImporting(true);
    setProgress(0);
    const collected: MemberImportResult[] = [];
    try {
      for (let start = 0; start < readyRows.length; start += MEMBER_IMPORT_BATCH_SIZE) {
        const batch = readyRows.slice(start, start + MEMBER_IMPORT_BATCH_SIZE).map((row) => row.data);
        const response = await importMembersRequest(batch);
        collected.push(...response.data.results);
        setProgress(Math.min(readyRows.length, start + batch.length));
      }
    } catch (error) {
      collected.push({ row: 0, success: false, errors: [errorMessage(error, 'The import stopped unexpectedly.')] });
    } finally {
      const skipped: MemberImportResult[] = rows.filter((row) => row.problems.length).map((row) => ({ row: row.data.row_number, success: false, errors: row.problems }));
      const all = [...collected, ...skipped].sort((a, b) => a.row - b.row);
      setResults(all);
      setImporting(false);
      const imported = all.filter((result) => result.success).length;
      if (imported) await onImported(imported);
    }
  };

  const importedCount = results?.filter((result) => result.success).length ?? 0;
  const failed = results?.filter((result) => !result.success) ?? [];

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Import members">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Associate membership</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">Import Members</h2>
            <p className="text-sm text-slate-500">Upload an Excel file. Each member is saved and given the next ACIFAC member ID automatically.</p>
          </div>
          <button type="button" onClick={onClose} disabled={importing} aria-label="Close import modal" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {!results && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 ${importing || parsing ? 'pointer-events-none opacity-60' : ''}`}>
                  <Upload className="h-4 w-4" />
                  {fileName ? 'Choose another file' : 'Choose file'}
                  <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleFile} className="sr-only" />
                </label>
                <button type="button" onClick={() => { void downloadTemplate(); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50">
                  <Download className="h-4 w-4" /> Download template
                </button>
                {fileName && <span className="inline-flex items-center gap-2 truncate text-sm text-slate-600"><FileSpreadsheet className="h-4 w-4 shrink-0 text-green-600" />{fileName}</span>}
              </div>
              <p className="text-sm text-slate-500">Required columns: <strong>First Name</strong>, <strong>Last Name</strong> (or a single <strong>Name</strong> column), <strong>Email</strong>, <strong>Phone</strong>, <strong>Address</strong>. Leave the member ID out; it is assigned on import. A blank Membership Date means today. ID documents can be attached to each member afterwards.</p>

              {parsing && <p className="text-sm text-slate-500">Reading file...</p>}
              {parseError && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{parseError}</div>}
              {unmatched.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">These columns were not recognised and will be ignored: {unmatched.join(', ')}</div>}

              {rows.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">{readyRows.length} of {rows.length} row(s) ready to import{rows.length > readyRows.length ? `; ${rows.length - readyRows.length} will be skipped` : ''}.</p>
                  <div className="max-h-[45vh] overflow-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">Check</th></tr></thead>
                      <tbody>
                        {rows.map(({ data, problems }) => (
                          <tr key={data.row_number} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-500">{data.row_number}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">{[data.first_name, data.middle_name, data.last_name].filter(Boolean).join(' ') || '—'}</td>
                            <td className="px-3 py-2">{data.email || '—'}</td>
                            <td className="px-3 py-2">{data.phone || '—'}</td>
                            <td className="max-w-[220px] truncate px-3 py-2">{data.address || '—'}</td>
                            <td className="px-3 py-2">{problems.length ? <span className="text-red-600">{problems.join(', ')}</span> : <span className="text-green-700">Ready</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {results && (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${importedCount ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {importedCount ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                {importedCount} member(s) imported{failed.length ? `, ${failed.length} row(s) not imported` : ''}.
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Member ID / Reason</th></tr></thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={`${result.row}-${index}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-500">{result.row || '—'}</td>
                        <td className="px-3 py-2">{result.success ? <span className="font-medium text-green-700">Imported{result.name ? ` — ${result.name}` : ''}</span> : <span className="font-medium text-red-600">Not imported</span>}</td>
                        <td className="px-3 py-2">{result.success ? <span className="font-semibold text-slate-900">{result.memberNumber}</span> : <span className="text-red-600">{result.errors?.join(' ')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={importing} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50">{results ? 'Done' : 'Cancel'}</button>
          {!results && (
            <button type="button" onClick={handleImport} disabled={!readyRows.length || importing || parsing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
              <Upload className="h-4 w-4" />
              {importing ? `Importing ${progress}/${readyRows.length}...` : `Import ${readyRows.length} member(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
