import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, IdCard, LoaderCircle, Printer, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../../lib/api';
import { dateOnlyToday, formatDate } from '../../../utils/dateTime';
import { fetchMemberIdCards, type IdCard as Card, type IdCardFilters } from '../../../app/services/idCardApi';
import type { IdCardLayout } from '../../../app/components/idcard/idCardPdf';

// Photos are fetched and the PDF is built in the browser: keep one PDF to a size an office PC handles.
const MAX_PER_PDF = 300;
const INPUT = 'h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm';

/** Batch print: the ID cards of several members in one PDF, several per page. */
export function PrintIdCardsModal({ onClose }: { onClose: () => void }) {
  const [filters, setFilters] = useState<IdCardFilters>({ status: 'active' });
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(0);
  const [error, setError] = useState('');
  // Members unticked; everyone else in the list is printed.
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [layout, setLayout] = useState<IdCardLayout>('sheet');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, search: query.trim() || undefined })), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setCards(null);
    fetchMemberIdCards(filters)
      .then((response) => {
        if (cancelled) return;
        setCards(response.data);
        setTotal(response.total);
        setLimit(response.limit);
        setError('');
      })
      .catch((reason) => { if (!cancelled) { setError(errorMessage(reason, 'Unable to load the members.')); setCards([]); } });
    return () => { cancelled = true; };
  }, [filters]);

  const busy = progress !== null;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const chosen = useMemo(() => (cards ?? []).filter((card) => !unticked.has(card.memberId)), [cards, unticked]);
  const allTicked = Boolean(cards?.length) && chosen.length === cards?.length;
  const toggle = (id: number) => setUnticked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const tooMany = chosen.length > MAX_PER_PDF;
  const withoutPhoto = chosen.filter((card) => !card.photo).length;

  const print = async () => {
    if (!chosen.length || tooMany || busy) return;
    setProgress({ done: 0, total: chosen.length });
    try {
      const { downloadIdCards } = await import('../../../app/components/idcard/idCardPdf');
      await downloadIdCards(chosen, layout, `ACIFAC Member IDs ${dateOnlyToday()} (${chosen.length})`, (done, count) => setProgress({ done, total: count }));
      toast.success(`${chosen.length} ID ${chosen.length === 1 ? 'card is' : 'cards are'} ready`, { description: layout === 'sheet' ? 'Print at actual size (100%), cut on the outer lines, fold on the dashed line and laminate.' : 'Each card is two pages: the front, then the back.' });
    } catch (reason) {
      toast.error(errorMessage(reason, 'Unable to make the ID cards.'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="print-ids-title">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="print-ids-title" className="flex items-center gap-2 text-xl font-bold text-gray-900"><IdCard className="h-5 w-5 text-green-700" />Print ID Cards</h2>
            <p className="mt-0.5 text-sm text-gray-600">The cards of the members ticked below, in one PDF. Each card has the member&apos;s photo, name, member number and member since on the front, and their QR code with the Chairperson&apos;s and General Manager&apos;s signatures on the back.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-3 border-b border-gray-100 bg-gray-50/70 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative block sm:col-span-2">
            <span className="sr-only">Search members</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or member ID" className={`${INPUT} pl-9`} />
          </label>
          <label className="block text-xs font-medium text-gray-600">Joined from
            <input type="date" value={filters.joinedFrom ?? ''} max={filters.joinedTo || dateOnlyToday()} onChange={(event) => setFilters((current) => ({ ...current, joinedFrom: event.target.value || undefined }))} className={`${INPUT} mt-1`} />
          </label>
          <label className="block text-xs font-medium text-gray-600">Joined to
            <input type="date" value={filters.joinedTo ?? ''} min={filters.joinedFrom} max={dateOnlyToday()} onChange={(event) => setFilters((current) => ({ ...current, joinedTo: event.target.value || undefined }))} className={`${INPUT} mt-1`} />
          </label>
          <label className="block text-xs font-medium text-gray-600 sm:col-span-2">Members
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as IdCardFilters['status'] }))} className={`${INPUT} mt-1`}>
              <option value="active">Active members</option>
              <option value="all">All members (active, inactive and suspended)</option>
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-xs font-medium text-gray-600">Paper</legend>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
              {([['sheet', 'A4 sheets, 5 per page'], ['card', 'Card size (85.6 x 54 mm)']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setLayout(value)} aria-pressed={layout === value}
                  className={`min-h-9 rounded-lg px-2 text-xs font-semibold ${layout === value ? 'bg-white text-green-800 shadow-sm ring-1 ring-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>{label}</button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
          {!cards ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading the members...</p>
            : !cards.length ? <p className="p-10 text-center text-sm text-gray-500">No member matches. Try another search or dates.</p>
              : (
                <>
                  <label className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700">
                    <input type="checkbox" checked={allTicked} onChange={() => setUnticked(allTicked ? new Set(cards.map((card) => card.memberId)) : new Set())} className="h-4 w-4 accent-green-600" />
                    Tick all ({cards.length}{total > cards.length ? ` of ${total}; the first ${limit} by name are listed` : ''})
                  </label>
                  <ul className="divide-y divide-gray-100">
                    {cards.map((card) => (
                      <li key={card.memberId}>
                        <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                          <input type="checkbox" checked={!unticked.has(card.memberId)} onChange={() => toggle(card.memberId)} className="h-4 w-4 shrink-0 accent-green-600" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-gray-900">{card.name}</span>
                            <span className="block text-xs text-gray-500">{card.memberNumber || `#${card.memberId}`} · since {formatDate(card.memberSince, true)}{card.status !== 'active' ? ` · ${card.status}` : ''}</span>
                          </span>
                          {!card.photo && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">No photo</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
        </div>

        <div className="space-y-2 border-t border-gray-200 px-5 py-4">
          {tooMany && <p className="flex items-center gap-2 text-sm text-red-700" role="alert"><CircleAlert className="h-4 w-4 shrink-0" />Print at most {MAX_PER_PDF} cards at a time: untick some, or narrow the list by name or dates.</p>}
          {!tooMany && withoutPhoto > 0 && <p className="text-xs text-amber-800">{withoutPhoto} of the ticked {withoutPhoto === 1 ? 'member has' : 'members have'} no 2x2 photo on file: {withoutPhoto === 1 ? 'that card says' : 'those cards say'} NO PHOTO. Add the photo with Update first if you can.</p>}
          {layout === 'sheet' && <p className="text-xs text-gray-500">Print at actual size (100%), not &quot;fit to page&quot;. Cut each card out on its outer line, fold on the dashed line so the QR is on the back, and laminate.</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600" aria-live="polite">{progress ? `Preparing the photos: ${progress.done} of ${progress.total}...` : `${chosen.length} ${chosen.length === 1 ? 'card' : 'cards'} ticked`}</p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={onClose} disabled={busy} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50">Close</button>
              <button type="button" onClick={() => void print()} disabled={busy || !chosen.length || tooMany} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}Make the PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
