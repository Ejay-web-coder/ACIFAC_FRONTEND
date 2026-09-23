import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, FileText, ScanLine, Upload, User } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { analyzeDocument, fetchDocumentScans, OcrScan, saveDocumentReview } from '../services/ocrApi';

const fieldSets: Record<string, string[]> = {
  'Loan Application': ['Member Name', 'Member ID', 'Loan Amount', 'Loan Purpose', 'Loan Terms', 'Date'],
  'Loan Form': ['Member Name', 'Member ID', 'Loan Amount', 'Loan Terms', 'Agreement Date'],
  'Payment Receipt': ['Member Name', 'Member ID', 'Payment Amount', 'Payment Date', 'Reference/Receipt Number', 'Payment Type'],
  'ID Document': ['Full Name', 'ID Number', 'Date of Birth', 'Address', 'ID Type'],
  'Cooperative Form': ['Member Name', 'Member ID', 'Date', 'Form Details'],
};

interface OCRScannerProps { userRole: UserRole; }

function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function OCRScanner({ userRole }: OCRScannerProps) {
  const [scans, setScans] = useState<OcrScan[]>([]);
  const [activeScan, setActiveScan] = useState<OcrScan | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [correctingType, setCorrectingType] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDocumentScans()
      .then(({ data }) => setScans(data))
      .catch((error) => toast.error('Unable to load document scans', { description: error instanceof Error ? error.message : 'Please refresh and try again.' }));
  }, []);

  const processFile = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      toast.error('Unsupported file type', { description: 'Upload a PNG, JPG, WEBP, or PDF document.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large', { description: 'Documents must not exceed 10 MB.' });
      return;
    }
    try {
      setProcessingStage('Uploading and reading document (this can take up to a minute)...');
      const { data } = await analyzeDocument(file);
      setActiveScan(data);
      setScans((current) => [data, ...current.filter((scan) => scan.id !== data.id)]);
      if (data.processingStatus === 'failed') {
        toast.error('AI recognition failed', { description: data.processingError || 'Review the document or retry the upload.' });
      } else {
        toast.success(data.documentType === 'Document Type Not Recognized' ? 'Document needs review' : `Document detected: ${data.documentType}`);
      }
    } catch (error) {
      toast.error('OCR processing failed', { description: error instanceof Error ? error.message : 'Please retry the upload.' });
    } finally {
      setProcessingStage('');
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = '';
  };

  const updateField = (key: string, value: string) => {
    if (!activeScan) return;
    setActiveScan({ ...activeScan, extractedData: { ...activeScan.extractedData, [key]: value } });
  };

  const saveReview = async () => {
    if (!activeScan) return;
    setSaving(true);
    try {
      const { data } = await saveDocumentReview(activeScan.id, activeScan.documentType, activeScan.extractedData);
      setActiveScan(data);
      setScans((current) => current.map((scan) => scan.id === data.id ? data : scan));
      setCorrectingType(false);
      toast.success('Document review saved.');
    } catch (error) {
      toast.error('Unable to save document review', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const fields = activeScan
    ? (fieldSets[activeScan.documentType] || (Object.keys(activeScan.extractedData).length > 0 ? Object.keys(activeScan.extractedData) : ['Document Notes']))
    : [];
  const canEdit = userRole === 'admin';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div><p className="text-gray-600 mt-1">Upload a document and let AI identify it before extracting the relevant information.</p></div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-blue-50 rounded-lg"><ScanLine className="w-6 h-6 text-blue-600" /></div><div><p className="text-sm text-gray-600">Total Scans</p><p className="text-2xl font-bold text-gray-900">{scans.length}</p></div></div></div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-green-50 rounded-lg"><CheckCircle className="w-6 h-6 text-green-600" /></div><div><p className="text-sm text-gray-600">Reviewed</p><p className="text-2xl font-bold text-gray-900">{scans.filter((scan) => scan.reviewStatus === 'reviewed').length}</p></div></div></div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-yellow-50 rounded-lg"><AlertCircle className="w-6 h-6 text-yellow-600" /></div><div><p className="text-sm text-gray-600">Needs Review</p><p className="text-2xl font-bold text-gray-900">{scans.filter((scan) => scan.reviewStatus === 'needs_review').length}</p></div></div></div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"><div className="flex items-center gap-3"><div className="p-3 bg-purple-50 rounded-lg"><ScanLine className="w-6 h-6 text-purple-600" /></div><div><p className="text-sm text-gray-600">High Confidence</p><p className="text-2xl font-bold text-gray-900">{scans.filter((scan) => (scan.confidence || 0) >= 70).length}</p></div></div></div>
      </div>

      {canEdit && <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Upload Document</h2>
        <div onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDragActive(false); const file = event.dataTransfer.files[0]; if (file) void processFile(file); }} className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragActive ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
          <input type="file" id="file-upload" className="hidden" onChange={handleChange} accept="image/jpeg,image/png,image/webp,application/pdf" />
          <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <label htmlFor="file-upload" className="cursor-pointer"><span className="text-blue-600 hover:text-blue-700 font-medium">Click to upload</span><span className="text-gray-600"> or drag and drop</span></label>
          <p className="text-sm text-gray-500 mt-2">PNG, JPG, WEBP, PDF up to 10MB. Document type is detected automatically.</p>
          {processingStage && <p className="text-sm text-blue-700 mt-4 animate-pulse">{processingStage}</p>}
        </div>
      </div>}

      {activeScan && <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
          <div><p className="text-sm text-gray-500">Document detected</p><h2 className="text-xl font-bold text-gray-900">{activeScan.documentType}</h2><p className="text-sm text-gray-500 mt-1">{activeScan.fileName}</p></div>
          <div className="text-right"><p className="text-sm text-gray-600">Confidence: <span className="font-semibold">{activeScan.confidence === null ? (activeScan.processingStatus === 'failed' ? 'Unavailable' : 'Low confidence') : `${activeScan.confidence}%`}</span></p>{activeScan.processingStatus === 'failed' && <p className="text-sm text-red-700 mt-1">AI recognition failed. Review or retry.</p>}{(activeScan.confidence === null || activeScan.confidence < 70) && activeScan.processingStatus !== 'failed' && <p className="text-sm text-yellow-700 mt-1">Confidence score was not returned. Please review the detected information.</p>}<button type="button" onClick={() => setCorrectingType((current) => !current)} className="text-sm text-blue-600 hover:text-blue-700 mt-2">{correctingType ? 'Cancel correction' : 'Correct document type'}</button></div>
        </div>
        {correctingType && <div className="mt-4"><label className="text-sm font-medium text-gray-700">Correct document type</label><select value={activeScan.documentType} onChange={(event) => setActiveScan({ ...activeScan, documentType: event.target.value })} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5 text-sm"><option>Document Type Not Recognized</option><option>Loan Application</option><option>Loan Form</option><option>Payment Receipt</option><option>ID Document</option><option>Cooperative Form</option></select></div>}
        {activeScan.documentType === 'Document Type Not Recognized' && <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">The document type could not be identified confidently. Review the file or correct the type before saving.</div>}
        {fields.length > 0 && <div className="mt-5"><p className="text-sm font-medium text-gray-700 mb-3">Extracted information</p><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{fields.map((field) => <label key={field} className="text-sm text-gray-700">{titleCase(field)}<input value={activeScan.extractedData[field] || ''} onChange={(event) => updateField(field, event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 p-2.5 text-sm" /></label>)}</div><button type="button" disabled={saving} onClick={() => void saveReview()} className="mt-5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save reviewed document'}</button></div>}
      </div>}

      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200"><h2 className="text-lg font-bold text-gray-900 mb-4">Recent Scans</h2>{scans.length === 0 ? <p className="text-sm text-gray-500">Uploaded documents will appear here after AI analysis.</p> : <div className="space-y-3">{scans.map((scan) => <button type="button" key={scan.id} onClick={() => setActiveScan(scan)} className="w-full text-left border border-gray-200 rounded-lg p-4 hover:bg-gray-50"><div className="flex items-center gap-3"><div className="p-2 rounded-lg bg-blue-50"><User className="w-5 h-5 text-blue-600" /></div><div className="min-w-0"><p className="font-bold text-gray-900 truncate">{scan.documentType}</p><p className="text-sm text-gray-500 truncate">{scan.fileName}</p></div><span className="ml-auto text-xs rounded-full px-3 py-1 bg-gray-100 text-gray-700">{scan.reviewStatus}</span></div></button>)}</div>}</div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6"><div className="flex gap-3"><FileText className="w-5 h-5 text-blue-700 shrink-0" /><p className="text-sm text-blue-800">AI reads document text, labels, layout, keywords, and important fields. Low-confidence results remain available for review instead of being guessed.</p></div></div>
    </div>
  );
}