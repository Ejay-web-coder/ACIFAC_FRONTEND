import { formatPeso } from '../../utils/money';
import type { DuesRates } from '../services/duesApi';

// The dues of the Membership Policy, with the amounts the server charges.
export function DuesRatesNote({ rates }: { rates: DuesRates | null }) {
  const amount = (kind: string, fallback: number) => formatPeso(rates?.[kind]?.amount ?? fallback);
  return (
    <p className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-900">
      Membership Policy: <strong>{amount('share_capital', 250)}</strong> share capital and <strong>{amount('savings', 50)}</strong> savings at every meeting,
      a <strong>{amount('absence_fine', 250)}</strong> fine for missing a meeting without a valid reason, and a <strong>{amount('transfer_fee', 500)}</strong> fee to transfer a membership.
    </p>
  );
}
