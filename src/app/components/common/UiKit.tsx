// Small presentational building blocks shared by admin and member pages.
// They only render what they are given; no data loading lives here.
import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Archive, Ban, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, CircleDot, Clock3, Inbox, PauseCircle, XCircle,
} from 'lucide-react';

type IconType = ComponentType<{ className?: string }>;

export function StatCard({ label, value, icon: Icon, detail, href, loading, tone = 'green' }: {
  label: string;
  value: ReactNode;
  icon?: IconType;
  detail?: ReactNode;
  href?: string;
  loading?: boolean;
  tone?: 'green' | 'dark' | 'soft' | 'warning';
}) {
  const toneClass = {
    green: 'bg-green-50 text-green-700 ring-green-100',
    dark: 'bg-green-700 text-white ring-green-700',
    soft: 'bg-green-100 text-green-800 ring-green-200',
    warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium leading-snug text-gray-600 sm:text-sm">{label}</p>
        {Icon && <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-10 sm:w-10 ${toneClass}`}><Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" /></span>}
      </div>
      {loading ? <div className="acf-skeleton mt-2 h-8 w-28" aria-hidden="true" /> : <p className="mt-1 break-words text-lg font-bold leading-tight tracking-tight text-gray-900 tabular-nums min-[400px]:text-xl sm:text-2xl lg:text-[1.65rem]">{value}</p>}
      {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
    </>
  );
  const className = 'group block h-full min-w-0 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-[var(--shadow-card)] sm:p-5';
  if (href) {
    return <Link to={href} className={`${className} hover:-translate-y-0.5 hover:border-green-200 hover:shadow-[var(--shadow-raised)]`} aria-label={`Open ${label}`}>{body}</Link>;
  }
  return <div className={className}>{body}</div>;
}

export function EmptyState({ icon: Icon = Inbox, title, message, action, compact }: {
  icon?: IconType;
  title: string;
  message?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-8' : 'px-6 py-12'}`}>
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-600 ring-1 ring-green-100"><Icon className="h-6 w-6" /></span>
      <p className="font-semibold text-gray-900">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-gray-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`acf-skeleton ${className}`} aria-hidden="true" />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-3/5" /></div>
        </div>
      ))}
    </div>
  );
}

type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'progress';

const STATUS_TONES: Record<string, StatusTone> = {
  active: 'success', approved: 'success', paid: 'success', completed: 'success', complete: 'success', success: 'success', released: 'success', available: 'success', 'in stock': 'success', current: 'success', settled: 'success', verified: 'success', excellent: 'success', good: 'success', 'fully paid': 'success',
  pending: 'warning', 'for review': 'warning', review: 'warning', 'under review': 'warning', 'low stock': 'warning', 'due soon': 'warning', partial: 'warning', fair: 'warning', 'in use': 'progress',
  scheduled: 'info', ongoing: 'progress', 'in progress': 'progress', processing: 'progress', disbursed: 'progress', maintenance: 'info',
  overdue: 'danger', declined: 'danger', rejected: 'danger', cancelled: 'danger', canceled: 'danger', failed: 'danger', suspended: 'danger', defaulted: 'danger', 'out of stock': 'danger', poor: 'danger', locked: 'danger',
  inactive: 'neutral', archived: 'neutral', closed: 'neutral', draft: 'neutral', unavailable: 'neutral',
};

const TONE_STYLE: Record<StatusTone, { className: string; icon: IconType }> = {
  success: { className: 'bg-green-50 text-green-800 ring-green-200', icon: CheckCircle2 },
  progress: { className: 'bg-green-100 text-green-900 ring-green-300', icon: CircleDot },
  info: { className: 'bg-white text-green-800 ring-green-300', icon: CalendarClock },
  warning: { className: 'bg-amber-50 text-amber-800 ring-amber-200', icon: Clock3 },
  danger: { className: 'bg-red-50 text-red-700 ring-red-200', icon: AlertTriangle },
  neutral: { className: 'bg-gray-100 text-gray-700 ring-gray-200', icon: CircleDashed },
};

const SPECIFIC_ICONS: Record<string, IconType> = {
  archived: Archive, declined: XCircle, rejected: XCircle, cancelled: Ban, canceled: Ban, suspended: PauseCircle, inactive: PauseCircle,
};

// Status pill that pairs colour with an icon and the text, so meaning never
// depends on colour alone.
export function StatusBadge({ status, label, className = '' }: { status: string | null | undefined; label?: string; className?: string }) {
  const key = String(status ?? '').trim().toLowerCase().replace(/_/g, ' ');
  const tone = STATUS_TONES[key] ?? 'neutral';
  const { className: toneClass, icon } = TONE_STYLE[tone];
  const Icon = SPECIFIC_ICONS[key] ?? icon;
  const text = label ?? (key ? key.replace(/\b\w/g, (char) => char.toUpperCase()) : '—');
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneClass} ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {text}
    </span>
  );
}

export function SectionCard({ title, description, actions, children, className = '', bodyClassName = '' }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-gray-200 bg-white shadow-[var(--shadow-card)] ${className}`}>
      {(title || actions) && (
        <header className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName || 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

// Page numbers shown around the current page, with gaps as "…":
// 1 … 4 5 6 … 12
function pageWindow(page: number, totalPages: number): Array<number | 'gap'> {
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push('gap');
    result.push(value);
  });
  return result;
}

const PAGE_SIZES = [10, 25, 50];

// Pager for tables and lists. Hidden when everything fits on one page and the
// page size cannot make a difference.
export function Pagination({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange, label = 'records', className = '' }: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  label?: string;
  className?: string;
}) {
  if (total <= PAGE_SIZES[0] && totalPages <= 1) return null;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const sizes = [...new Set([pageSize, ...PAGE_SIZES])].sort((a, b) => a - b);
  const button = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium disabled:opacity-40';
  return (
    <nav aria-label={`${label} pages`} className={`flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span>Showing <span className="font-semibold text-gray-900">{first}–{last}</span> of <span className="font-semibold text-gray-900">{total}</span> {label}</span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">Rows
            <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-700">
              {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1 self-center sm:self-auto">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page" className={`${button} text-gray-600 hover:bg-gray-100`}><ChevronLeft className="h-4 w-4" /></button>
          {pageWindow(page, totalPages).map((item, index) => item === 'gap'
            ? <span key={`gap-${index}`} className="px-1 text-gray-400">…</span>
            : <button key={item} type="button" onClick={() => onPageChange(item)} aria-current={item === page ? 'page' : undefined} className={`${button} ${item === page ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>{item}</button>)}
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page" className={`${button} text-gray-600 hover:bg-gray-100`}><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </nav>
  );
}
