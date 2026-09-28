import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { StatusBadge } from '../../../app/components/common/UiKit';
import { CONDITION_LABELS, type MachineCondition, type PaymentStatus } from '../../../app/services/machineryApi';

export const inputClass = 'mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 disabled:bg-gray-50';
export const labelClass = 'block text-sm font-medium text-gray-700';
export const primaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60';
export const secondaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60';

export const peso = (value: number | null | undefined) => `₱${Number(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const hectares = (value: number | null | undefined) => `${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 4 })} ha`;
export const bags = (value: number | null | undefined) => `${Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })} bags`;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const periodLabel = (period: string) => `${period} cropping`;

// Years offered in filters: from the machines' first deliveries to next year.
export function yearOptions(current: number) {
  return Array.from({ length: current - 2020 + 2 }, (_, index) => current + 1 - index);
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <StatusBadge status={status === 'full' ? 'paid' : status} label={status === 'full' ? 'Full' : status === 'partial' ? 'Partial' : 'Unpaid'} />;
}

const CONDITION_TONE: Record<MachineCondition, string> = { operational: 'active', non_operational: 'failed', always_repair: 'pending', idle: 'inactive' };

export function ConditionBadge({ condition }: { condition: MachineCondition | null | undefined }) {
  if (!condition) return <StatusBadge status="draft" label="Condition not set" />;
  return <StatusBadge status={CONDITION_TONE[condition]} label={CONDITION_LABELS[condition]} />;
}

export function Modal({ title, description, onClose, children, footer, wide = false }: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-600">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
