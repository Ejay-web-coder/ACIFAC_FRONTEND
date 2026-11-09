import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Compass, Eye, EyeOff, FileText, FolderOpen, Gem, Scale, LoaderCircle, Network, Pencil, Save, Search, Target, Trash2, Upload, X, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAbout, saveAbout, type AboutContent } from '../services/aboutApi';
import {
  deleteLegalDocumentRequest, fetchLegalDocuments, LEGAL_DOCUMENT_CATEGORIES, legalCategoryLabel, updateLegalDocumentRequest, uploadLegalDocumentRequest,
  type DocumentSection, type LegalDocumentRecord,
} from '../services/authApi';
import { openProtectedFile } from '../../lib/api';
import { formatDate, formatDateTime } from '../../utils/dateTime';
import { confirmAction } from './common/ConfirmDialog';
import { EmptyState } from './common/UiKit';
import { OrgChartPanel } from './OrgChart';
import { Policies } from './Policies';

// The About page: the cooperative's Mission & Vision, its organizational
// chart, its policies, its legal documents and its other papers (Others,
// searchable by title). Administrators edit them all;
// members read them (and only the documents the office shows to members).

type AboutTab = 'mission' | 'chart' | 'policy' | 'legal' | 'others';
const TABS: Array<{ id: AboutTab; label: string; icon: LucideIcon }> = [
  { id: 'mission', label: 'Mission & Vision', icon: Target },
  { id: 'chart', label: 'Chart', icon: Network },
  { id: 'policy', label: 'Policy', icon: FileText },
  { id: 'legal', label: 'Legal Documents', icon: Scale },
  { id: 'others', label: 'Others', icon: FolderOpen },
];
const isTab = (value: string | null): value is AboutTab => TABS.some((tab) => tab.id === value);

export function About({ editable = false }: { editable?: boolean }) {
  // ?tab=chart (policy, legal) opens that tab; the old Chart links send people here.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const activeTab: AboutTab = isTab(requested) ? requested : 'mission';
  const open = (tab: AboutTab) => setSearchParams(tab === 'mission' ? {} : { tab }, { replace: true });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)]">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto" role="tablist" aria-label="About ACIFAC">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => open(id)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === id ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 sm:p-6" role="tabpanel">
          {activeTab === 'mission' && <MissionVision editable={editable} />}
          {activeTab === 'chart' && <OrgChartPanel editable={editable} />}
          {activeTab === 'policy' && <Policies editable={editable} />}
          {activeTab === 'legal' && <DocumentLibrary key="legal" section="legal" editable={editable} />}
          {activeTab === 'others' && <DocumentLibrary key="others" section="others" editable={editable} />}
        </div>
      </div>
    </div>
  );
}

// ----- Mission & Vision ----------------------------------------------------------------------

type AboutText = Pick<AboutContent, 'mission' | 'vision' | 'coreValues'>;
const SECTIONS: Array<{ field: keyof AboutText; title: string; icon: LucideIcon; hint: string }> = [
  { field: 'mission', title: 'Mission', icon: Target, hint: 'What the cooperative does and for whom.' },
  { field: 'vision', title: 'Vision', icon: Compass, hint: 'What the cooperative wants to become.' },
  { field: 'coreValues', title: 'Core Values', icon: Gem, hint: 'One value per line (optional).' },
];
const MAX_LENGTH = 5000;

function Paragraphs({ text }: { text: string }) {
  return <div className="space-y-2 text-sm leading-relaxed text-gray-700 sm:text-base">{text.split(/\n{2,}/).map((part, index) => <p key={index} className="whitespace-pre-line">{part}</p>)}</div>;
}

function MissionVision({ editable }: { editable: boolean }) {
  const [about, setAbout] = useState<AboutContent | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<AboutText | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAbout().then((data) => { setAbout(data); setError(''); }).catch((reason: Error) => setError(reason.message || 'Unable to load the mission and vision.'));
  }, []);

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const saved = await saveAbout(draft);
      setAbout(saved);
      setDraft(null);
      toast.success('Mission & Vision saved');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to save the mission and vision.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !about) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>;
  if (!about) return <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading…</p>;

  const empty = !about.mission && !about.vision && !about.coreValues;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">{about.updatedAt ? `Last updated ${formatDateTime(about.updatedAt)}${about.updatedBy ? ` by ${about.updatedBy}` : ''}` : 'The cooperative’s mission and vision.'}</p>
        {editable && (draft ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(null)} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200"><X className="h-4 w-4" />Cancel</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save'}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setDraft({ mission: about.mission, vision: about.vision, coreValues: about.coreValues })} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-green-600 bg-white px-4 text-sm font-semibold text-green-700 hover:bg-green-50"><Pencil className="h-4 w-4" />Edit</button>
        ))}
      </div>

      {draft ? (
        <div className="space-y-4">
          {SECTIONS.map(({ field, title, hint }) => (
            <label key={field} className="block">
              <span className="text-sm font-semibold text-gray-900">{title}</span>
              <span className="ml-2 text-xs text-gray-500">{hint}</span>
              <textarea
                value={draft[field]}
                maxLength={MAX_LENGTH}
                rows={field === 'coreValues' ? 5 : 4}
                onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-green-500"
              />
            </label>
          ))}
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-dashed border-gray-300">
          <EmptyState icon={Target} title="No mission and vision yet" message={editable ? 'Click Edit to write the cooperative’s mission, vision and core values.' : 'The office has not filled this in yet.'} compact />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {SECTIONS.filter(({ field }) => about[field] || (editable && field !== 'coreValues')).map(({ field, title, icon: Icon }) => (
            <section key={field} className={`rounded-2xl border border-gray-200 p-5 ${field === 'coreValues' ? 'lg:col-span-2' : ''}`}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-900"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-green-700 ring-1 ring-green-100"><Icon className="h-5 w-5" /></span>{title}</h2>
              {field === 'coreValues'
                ? <ul className="grid gap-2 sm:grid-cols-2">{about.coreValues.split('\n').map((line) => line.trim()).filter(Boolean).map((value, index) => <li key={index} className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-800">{value}</li>)}</ul>
                : about[field] ? <Paragraphs text={about[field]} /> : <p className="text-sm italic text-gray-400">Not written yet.</p>}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ----- Legal Documents and Others -----------------------------------------------------------
// Files (PDF or picture); the policies are text, on the Policy tab. Legal
// Documents are grouped by category. Others is one list by title with a search
// box, and several files can be uploaded at once (each titled by its file name).

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const titleOf = (file: File) => file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || file.name;

function DocumentLibrary({ section, editable }: { section: DocumentSection; editable: boolean }) {
  const others = section === 'others';
  const [documents, setDocuments] = useState<LegalDocumentRecord[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [shareNew, setShareNew] = useState(true);
  // Legal Documents: the file picked waits in a modal for its title, category and sharing.
  const [pending, setPending] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchLegalDocuments(section).then(({ data }) => { setDocuments(data); setError(''); }).catch((reason: Error) => setError(reason.message || 'Unable to load the documents.'));
  }, [section]);
  useEffect(() => { load(); }, [load]);

  // One file at a time, so a failed one does not stop the others.
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const tooLarge = files.filter((file) => file.size > MAX_DOCUMENT_BYTES);
    if (tooLarge.length) toast.error(`Skipped ${tooLarge.map((file) => file.name).join(', ')}: a file can be at most 10 MB.`);
    const queue = files.filter((file) => file.size <= MAX_DOCUMENT_BYTES);
    if (!queue.length) return;
    if (!others) { setPending(queue[0]); return; }
    setUploading(true);
    let done = 0;
    for (const file of queue) {
      setProgress(queue.length > 1 ? `${done + 1} of ${queue.length}` : '');
      try {
        await uploadLegalDocumentRequest(file, 'Other', shareNew, section, titleOf(file));
        done += 1;
      } catch (reason) {
        toast.error(`${file.name}: ${reason instanceof Error ? reason.message : 'Unable to upload.'}`);
      }
    }
    setUploading(false);
    setProgress('');
    if (done) {
      const what = done === 1 ? 'Document uploaded' : `${done} documents uploaded`;
      toast.success(what, { description: shareNew ? 'Shown to members.' : 'Visible to administrators only.' });
    }
    load();
  };

  const uploadPending = async (title: string, category: string, shownToMembers: boolean) => {
    if (!pending) return;
    setUploading(true);
    try {
      await uploadLegalDocumentRequest(pending, category, shownToMembers, section, title);
      setPending(null);
      toast.success('Document uploaded', { description: shownToMembers ? 'Shown to members.' : 'Visible to administrators only.' });
      load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to upload.');
    } finally {
      setUploading(false);
    }
  };

  const toggleShared =async (document: LegalDocumentRecord) => {
    setBusy(document.id);
    try {
      const { data } = await updateLegalDocumentRequest(document.id, { shownToMembers: !document.shownToMembers });
      setDocuments((current) => current?.map((item) => (item.id === data.id ? data : item)) ?? null);
      toast.success(data.shownToMembers ? 'Shown to members' : 'Hidden from members');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to change the document.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (document: LegalDocumentRecord) => {
    if (!(await confirmAction(`Delete "${document.name}"? This cannot be undone.`, { confirmLabel: 'Delete', danger: true }))) return;
    setBusy(document.id);
    try {
      await deleteLegalDocumentRequest(document.id);
      toast.success('Document deleted');
      load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Unable to delete the document.');
    } finally {
      setBusy(null);
    }
  };

  const view = (document: LegalDocumentRecord) => {
    openProtectedFile(`/api/legal-documents/${document.id}/file`).catch((reason: Error) => toast.error(reason.message));
  };

  if (error && !documents) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>;
  if (!documents) return <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the documents…</p>;

  // Others: every word typed must be in the title (any order, any case).
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = others ? documents.filter((document) => words.every((word) => document.name.toLowerCase().includes(word))) : documents;
  // Legal documents are grouped by category, in the order of the list (any other category last).
  const known: string[] = [...LEGAL_DOCUMENT_CATEGORIES];
  const categories = [...known, ...new Set(shown.map((document) => document.category).filter((name) => !known.includes(name)))];
  const groups = others
    ? [{ name: '', items: shown }]
    : categories.map((name) => ({ name, items: shown.filter((document) => document.category === name) })).filter((group) => group.items.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <p className="text-sm text-gray-600">{others
          ? (editable ? 'The cooperative’s other papers: articles, by-laws, resolutions, tax returns, financial statements and more. You can upload several files at once; each is titled by its file name. Members see only the ones marked Shown to members.' : 'The cooperative’s other papers. Search by title and click View to open one.')
          : (editable ? 'By-laws, registration, compliance and other legal documents. Members see only the ones marked Shown to members.' : 'The cooperative’s by-laws and other legal documents. Click View to open one.')}</p>
        {editable && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {others && (
              <label className="inline-flex min-h-10 items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={shareNew} onChange={(event) => setShareNew(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                Show to members
              </label>
            )}
            <label className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 ${uploading ? 'opacity-60' : ''}`}>
              <Upload className="h-4 w-4" />
              {uploading ? `Uploading${progress ? ` ${progress}` : ''}…` : others ? 'Upload Files' : 'Upload Document'}
              <input type="file" multiple={others} accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => void upload(event)} className="sr-only" />
            </label>
          </div>
        )}
      </div>

      {others && documents.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Search by title</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by title…" className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-9 text-sm focus:border-transparent focus:ring-2 focus:ring-green-500" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>}
          </label>
          <p className="text-sm text-gray-500" aria-live="polite">{words.length ? `${shown.length} of ${documents.length} ${documents.length === 1 ? 'file' : 'files'}` : `${documents.length} ${documents.length === 1 ? 'file' : 'files'}`}</p>
        </div>
      )}

      {!documents.length && (
        <div className="rounded-2xl border border-dashed border-gray-300">
          {others
            ? <EmptyState icon={FolderOpen} title="No files yet" message={editable ? 'Upload the cooperative’s papers (PDF or picture, up to 10 MB each).' : 'The office has not shared any yet.'} compact />
            : <EmptyState icon={Scale} title="No legal documents yet" message={editable ? 'Upload a legal document (PDF or picture, up to 10 MB).' : 'The office has not shared any yet.'} compact />}
        </div>
      )}
      {others && documents.length > 0 && !shown.length && (
        <div className="rounded-2xl border border-dashed border-gray-300">
          <EmptyState icon={Search} title="No file matches" message={`Nothing titled “${search.trim()}”. Try another word.`} action={<button type="button" onClick={() => setSearch('')} className="text-sm font-semibold text-green-700 hover:text-green-900">Clear search</button>} compact />
        </div>
      )}

      {groups.map(({ name, items }) => (
        <section key={name || 'all'} className="space-y-3">
          {name && <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{legalCategoryLabel(name)}</h2>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((document) => (
              <DocumentCard key={document.id} document={document} editable={editable}>
                <button type="button" onClick={() => view(document)} className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-900"><Eye className="h-4 w-4" />View</button>
                {editable && (
                  <>
                    <button type="button" onClick={() => void toggleShared(document)} disabled={busy === document.id} className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50" title={document.shownToMembers ? 'Hide this document from members' : 'Let members open this document'}>
                      {document.shownToMembers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{document.shownToMembers ? 'Hide from members' : 'Show to members'}
                    </button>
                    <button type="button" onClick={() => void remove(document)} disabled={busy === document.id} className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"><Trash2 className="h-4 w-4" />Remove</button>
                  </>
                )}
              </DocumentCard>
            ))}
          </div>
        </section>
      ))}

      {pending && <LegalUploadModal file={pending} saving={uploading} onCancel={() => setPending(null)} onSave={(title, category, shown) => void uploadPending(title, category, shown)} />}
    </div>
  );
}

// The details of a new legal document: the title shown on its card (the file
// name is never shown), its category and whether members can open it.
function LegalUploadModal({ file, saving, onCancel, onSave }: { file: File; saving: boolean; onCancel: () => void; onSave: (title: string, category: string, shownToMembers: boolean) => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(LEGAL_DOCUMENT_CATEGORIES[0]);
  const [shown, setShown] = useState(true);
  const trimmed = title.trim();

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="legal-upload-title" onClick={saving ? undefined : onCancel}>
      <form
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => { event.preventDefault(); if (trimmed && !saving) onSave(trimmed, category, shown); }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <h2 id="legal-upload-title" className="text-lg font-bold text-gray-900">Upload Legal Document</h2>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600"><FileText className="h-4 w-4 text-green-700" />{file.type === 'application/pdf' ? 'PDF' : 'Picture'} · {formatSize(file.size)}</p>
          <label className="block">
            <span className="text-sm font-semibold text-gray-900">Title</span>
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required autoFocus placeholder="e.g. Certificate of Registration" className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-green-500" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gray-900">Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-green-500">
              {LEGAL_DOCUMENT_CATEGORIES.map((name) => <option key={name} value={name}>{legalCategoryLabel(name)}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={shown} onChange={(event) => setShown(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
            Show to members
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-10 items-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
          <button type="submit" disabled={!trimmed || saving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"><Upload className="h-4 w-4" />{saving ? 'Uploading…' : 'Upload'}</button>
        </div>
      </form>
    </div>
  );
}

function DocumentCard({ document, editable, children }: { document: LegalDocumentRecord; editable: boolean; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-green-50 p-3"><FileText className="h-5 w-5 text-green-700" /></div>
          <div className="min-w-0"><h3 className="truncate font-medium text-gray-900" title={document.name}>{document.name}</h3><p className="mt-1 text-xs text-gray-500">{document.mimeType === 'application/pdf' ? 'PDF' : 'Picture'} · {formatSize(document.fileSize)}</p></div>
        </div>
        {editable && (
          <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${document.shownToMembers ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{document.shownToMembers ? 'Shown to members' : 'Admins only'}</span>
        )}
      </div>
      <p className="mt-4 text-xs text-gray-500">Uploaded {formatDate(document.uploadedAt)}{editable && document.uploadedBy ? ` by ${document.uploadedBy}` : ''}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3">{children}</div>
    </div>
  );
}
