import { useMemo } from 'react';
import { UserRound } from 'lucide-react';
import { COOPERATIVE_NAME } from '../../../lib/pdfLogo';
import { qrModules, qrSvgPath } from '../../../lib/qrCode';
import { formatDate } from '../../../utils/dateTime';
import { INVOICE_HEADER } from '../../../admin/components/loanInvoice';
import type { IdCard } from '../../services/idCardApi';

/** A QR code as sharp squares at any size, on white with the light border readers need. */
export function QrCodeSvg({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const modules = qrModules(text);
    return { size: modules.length + 8, path: qrSvgPath(modules, 4) };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label={label} className={`block bg-white ${className}`}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/** The front of the member's ID card as the screen shows it (the printed card is idCardPdf). */
export function IdCardFront({ card, photoUrl }: { card: IdCard; photoUrl: string | null }) {
  return (
    <div className="relative mx-auto aspect-[85.6/54] w-full max-w-[24rem] overflow-hidden rounded-2xl bg-white text-left shadow-[var(--shadow-raised)] ring-1 ring-gray-200">
      <div className="flex h-[25%] items-center gap-2 border-b-2 border-amber-600 bg-green-800 px-[3.5%]">
        <img src="/logo.png" alt="" className="h-[72%] shrink-0 rounded-md bg-white p-0.5" />
        <div className="min-w-0 leading-tight text-white">
          <p className="text-[clamp(7px,2.3vw,9.5px)] font-bold uppercase">{COOPERATIVE_NAME}</p>
          <p className="text-[clamp(6.5px,2vw,8.5px)] text-green-100">{INVOICE_HEADER.address}</p>
        </div>
      </div>
      <div className="flex gap-[4%] px-[4.5%] pt-[4%]">
        <div className="aspect-square w-[28%] shrink-0 overflow-hidden border border-gray-300 bg-gray-100">
          {photoUrl ? <img src={photoUrl} alt={`${card.name}'s 2x2 photo`} className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-gray-400"><UserRound className="h-1/2 w-1/2" aria-label="No photo" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[clamp(7px,2.2vw,9px)] font-bold tracking-[0.15em] text-green-800">MEMBER ID</p>
          <p className="line-clamp-2 text-[clamp(11px,3.8vw,15px)] font-bold uppercase leading-tight text-gray-900">{card.name}</p>
          <dl className="mt-[3%] space-y-[2%] leading-tight">
            <div><dt className="text-[clamp(7px,2.1vw,8.5px)] text-gray-500">Member No.</dt><dd className="text-[clamp(9px,3vw,12px)] font-bold text-gray-900">{card.memberNumber || `#${card.memberId}`}</dd></div>
            <div><dt className="text-[clamp(7px,2.1vw,8.5px)] text-gray-500">Member since</dt><dd className="text-[clamp(9px,3vw,12px)] font-bold text-gray-900">{formatDate(card.memberSince)}</dd></div>
          </dl>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[8%] border-t-2 border-amber-600 bg-green-800" />
    </div>
  );
}
