import type { ReactNode } from 'react';

/** A numbered step of a report page: what to do, in order. */
export function ReportStep({ number, title, hint, aside, children, plain = false }: {
  number: number;
  title: string;
  hint?: ReactNode;
  /** Shown at the right of the step's heading, e.g. a status. */
  aside?: ReactNode;
  children: ReactNode;
  /** Leaves out the card around the body (for content that brings its own cards). */
  plain?: boolean;
}) {
  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white" aria-hidden="true">{number}</span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900"><span className="sr-only">Step {number}: </span>{title}</h3>
          {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
  if (plain) {
    return <section className="space-y-3">{heading}{children}</section>;
  }
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      {heading}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The report's save and export buttons, kept in view at the bottom of the screen (above the phone navigation). */
export function ReportActionBar({ status, children }: { status: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-[var(--shadow-raised)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0 text-sm">{status}</div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </div>
  );
}

/** A small figure for a report's summary row. */
export function ReportFigure({ label, value, detail, strong = false }: { label: string; value: ReactNode; detail?: ReactNode; strong?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl p-3 ${strong ? 'bg-green-700 text-white' : 'bg-gray-50 ring-1 ring-inset ring-gray-100'}`}>
      <p className={`text-xs font-medium ${strong ? 'text-green-100' : 'text-gray-500'}`}>{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold tabular-nums sm:text-xl ${strong ? 'text-white' : 'text-gray-900'}`}>{value}</p>
      {detail && <p className={`truncate text-xs ${strong ? 'text-green-100' : 'text-gray-500'}`}>{detail}</p>}
    </div>
  );
}
