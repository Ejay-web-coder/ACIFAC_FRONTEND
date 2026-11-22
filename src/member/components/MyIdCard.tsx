import { useCallback, useEffect, useState } from 'react';
import { Download, IdCard, LoaderCircle, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/api';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { fetchProtectedImage } from '../../lib/profilePhoto';
import { formatDate } from '../../utils/dateTime';
import { IdCardFront, QrCodeSvg } from '../../app/components/idcard/IdCardView';
import { fetchMyIdCard, type IdCard as Card } from '../../app/services/idCardApi';

/**
 * The member's own ID card on their phone: the front, and the QR large enough
 * for the office to scan at the door of a meeting or at the counter. If the
 * office reissues the card, the new QR shows by itself.
 */
export function MyIdCard({ onClose }: { onClose: () => void }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    fetchMyIdCard().then((response) => { setCard(response.data); setError(''); }).catch((reason) => setError(errorMessage(reason, 'Unable to load your member ID.')));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['members'], load);

  const photoPath = card?.photo ?? null;
  useEffect(() => {
    if (!photoPath) { setPhotoUrl(null); return undefined; }
    let url: string | null = null;
    let cancelled = false;
    void fetchProtectedImage(photoPath).then((result) => {
      if (cancelled) { if (result) URL.revokeObjectURL(result); return; }
      url = result;
      setPhotoUrl(result);
    }).catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [photoPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = async () => {
    if (!card || downloading) return;
    setDownloading(true);
    try {
      const { downloadIdCards, idCardFileName } = await import('../../app/components/idcard/idCardPdf');
      await downloadIdCards([card], 'card', idCardFileName(card));
    } catch (reason) {
      toast.error(errorMessage(reason, 'Unable to make the PDF of your ID.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-end justify-center bg-gray-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="my-id-title" onClick={onClose}>
      <div className="flex max-h-[96dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-gray-50 shadow-2xl sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <h2 id="my-id-title" className="flex items-center gap-2 text-lg font-bold text-gray-900"><IdCard className="h-5 w-5 text-green-700" />My Member ID</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>
            : !card ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500" role="status"><LoaderCircle className="h-4 w-4 animate-spin" />Loading your ID...</p>
              : (
                <>
                  <IdCardFront card={card} photoUrl={photoUrl} />
                  <div className="rounded-2xl bg-white p-4 text-center shadow-[var(--shadow-card)] ring-1 ring-gray-200">
                    <QrCodeSvg text={card.qr} label={`QR code of ${card.name}'s member ID`} className="mx-auto w-full max-w-[17rem]" />
                    <p className="mt-3 text-sm font-semibold text-gray-900">Show this QR to the ACIFAC office</p>
                    <p className="mt-1 text-sm text-gray-600">At the door of a meeting it checks you in; at the counter the office finds your record with it.</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500"><Sun className="h-3.5 w-3.5" />Turn your screen brightness up if it does not scan.</p>
                  </div>
                  <p className="text-center text-xs text-gray-500">Issued {formatDate(card.issuedAt)}. Lost your card? Tell the office: they give you a new one, and the old one stops working.</p>
                </>
              )}
        </div>
        {card && (
          <div className="shrink-0 border-t border-gray-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => void download()} disabled={downloading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-green-600 px-4 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-60">
              {downloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download my ID card (PDF)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
