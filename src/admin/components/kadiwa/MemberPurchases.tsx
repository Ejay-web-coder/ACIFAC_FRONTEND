import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Plus, Search, Trash2, UserRound, X } from 'lucide-react';
import { searchKadiwaMembers, type KadiwaBuyer, type KadiwaMemberPurchase } from '../../../app/services/authApi';
import { peso } from './InventoryForms';

// The members who bought at the store on the day of the sale: found by member
// ID or name, with the amount each bought. They are part of the day's sales
// and count as the member's business for the patronage refund, 1 point per PHP 100.

export const PESOS_PER_POINT = 100;
const MONEY = /^\d+(\.\d{1,2})?$/;
const INPUT = 'w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600';

export interface MemberPurchaseRow { key: number; member: KadiwaBuyer | null; amount: string }

export const memberPurchaseTyped = (row: MemberPurchaseRow) => Boolean(row.member || row.amount.trim());
export function memberPurchaseProblem(row: MemberPurchaseRow, rows: MemberPurchaseRow[]) {
  if (!row.member) return 'Find the member by member ID or name.';
  if (rows.some((other) => other.key !== row.key && other.member?.id === row.member?.id)) return 'This member is already listed. Put their purchases on one line.';
  if (!MONEY.test(row.amount.trim()) || Number(row.amount) <= 0) return 'Enter the amount bought, like 250 or 250.50.';
  return '';
}
export const pointsFor = (amount: number) => Math.round((amount / PESOS_PER_POINT) * 100) / 100;
const pointsText = (points: number) => `${points.toLocaleString('en-PH', { maximumFractionDigits: 2 })} ${points === 1 ? 'point' : 'points'}`;

function MemberPicker({ value, onPick, invalid }: { value: KadiwaBuyer | null; onPick: (member: KadiwaBuyer | null) => void; invalid: boolean }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<KadiwaBuyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const search = text.trim();
    if (value || search.length < 2) { setResults([]); return undefined; }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchKadiwaMembers(search).then((data) => { if (active) { setResults(data.members); setOpen(true); } })
        .catch(() => { if (active) setResults([]); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [text, value]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (value) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-2.5 py-1.5 text-sm">
        <UserRound className="h-4 w-4 shrink-0 text-green-700" />
        <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-gray-900">{value.name}</span> <span className="text-gray-600">{value.memberNumber}</span></span>
        <button type="button" onClick={() => { onPick(null); setText(''); }} className="rounded p-1 text-gray-500 hover:bg-white" aria-label={`Change the member (${value.name})`}><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }
  return (
    <div ref={box} className="relative min-w-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input value={text} onChange={(event) => setText(event.target.value)} onFocus={() => results.length && setOpen(true)} autoComplete="off" placeholder="Member ID or name"
        aria-label="Find the member by member ID or name" aria-invalid={invalid || undefined}
        onKeyDown={(event) => { if (event.key === 'Enter' && results[0]) { event.preventDefault(); onPick(results[0]); setOpen(false); } }}
        className={`${INPUT} pl-8 ${invalid ? 'border-red-400' : ''}`} />
      {loading && <LoaderCircle className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      {open && text.trim().length >= 2 && !loading && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg" role="listbox">
          {results.length ? results.map((member) => (
            <li key={member.id}>
              <button type="button" onClick={() => { onPick(member); setOpen(false); }} className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-green-50">
                <span className="truncate font-medium text-gray-900">{member.name}</span>
                <span className="shrink-0 text-xs text-gray-500">{member.memberNumber}{member.barangay ? ` · ${member.barangay}` : ''}</span>
              </button>
            </li>
          )) : <li className="px-3 py-2 text-sm text-gray-500">No active member matches “{text.trim()}”.</li>}
        </ul>
      )}
    </div>
  );
}

// boxed: a box of its own on the Kadiwa vendor's page, titled without "(optional)".
export function MemberPurchasesInput({ rows, onChange, onAdd, onRemove, showProblems, salesTotal, boxed = false }: {
  rows: MemberPurchaseRow[]; onChange: (key: number, change: Partial<MemberPurchaseRow>) => void; onAdd: () => void; onRemove: (key: number) => void;
  showProblems: boolean; salesTotal: number; boxed?: boolean;
}) {
  const typed = rows.filter(memberPurchaseTyped);
  const total = Math.round(typed.reduce((sum, row) => sum + (MONEY.test(row.amount.trim()) ? Number(row.amount) : 0), 0) * 100) / 100;
  const over = total > salesTotal + 0.001;
  return (
    <div className={`${boxed ? 'rounded-2xl bg-white p-4' : 'mt-3 rounded-xl p-3'} border ${over && showProblems ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Member purchases{!boxed && <span className="font-normal text-gray-500"> (optional)</span>}</h3>
          <p className="text-xs text-gray-500">Members who bought today, by member ID or name, and how much. Each PHP {PESOS_PER_POINT} earns 1 patronage point.</p>
        </div>
        <p className="text-sm text-gray-600">{typed.length} {typed.length === 1 ? 'member' : 'members'} · <span className="font-semibold tabular-nums text-gray-900">{peso(total)}</span> · {pointsText(pointsFor(total))}</p>
      </div>
      <ul className="mt-2 space-y-2">
        {rows.map((row, index) => {
          const problem = showProblems && memberPurchaseTyped(row) ? memberPurchaseProblem(row, rows) : '';
          const amount = MONEY.test(row.amount.trim()) ? Number(row.amount) : 0;
          return (
            <li key={row.key}>
              <div className={`grid items-center gap-2 ${boxed ? 'grid-cols-[minmax(0,1fr)_6.5rem_2.25rem]' : 'grid-cols-[minmax(0,1fr)_6.5rem_2.25rem] sm:grid-cols-[minmax(0,1fr)_8rem_6.5rem_2.25rem]'}`}>
                <MemberPicker value={row.member} onPick={(member) => onChange(row.key, { member })} invalid={Boolean(problem) && !row.member} />
                <input inputMode="decimal" value={row.amount} onChange={(event) => onChange(row.key, { amount: event.target.value })} placeholder="0.00" aria-label={`Member purchase ${index + 1}: amount`}
                  className={`${INPUT} text-right ${problem && row.member ? 'border-red-400' : ''}`} />
                <span className={`hidden text-right text-xs font-medium tabular-nums text-green-700 ${boxed ? '' : 'sm:block'}`}>{amount > 0 ? pointsText(pointsFor(amount)) : ''}</span>
                {rows.length > 1 || memberPurchaseTyped(row)
                  ? <button type="button" onClick={() => onRemove(row.key)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove member purchase ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
                  : <span />}
              </div>
              {problem && <p className="pt-1 text-xs text-red-600">{problem}</p>}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onAdd} className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"><Plus className="h-4 w-4" />Another member</button>
      {over && <p className="mt-1 text-xs text-red-600">The member purchases ({peso(total)}) are more than the day's total sales ({peso(salesTotal)}).</p>}
    </div>
  );
}

// On a saved sale: who bought and the points they earned.
export function MemberPurchaseList({ purchases }: { purchases: KadiwaMemberPurchase[] }) {
  const total = Math.round(purchases.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
      {purchases.map((line) => (
        <li key={line.memberId} className="flex items-baseline justify-between gap-3 px-3 py-2">
          <span className="min-w-0 truncate text-gray-800">{line.name} <span className="text-xs text-gray-500">{line.memberNumber}</span></span>
          <span className="shrink-0 text-right tabular-nums"><span className="font-medium text-gray-900">{peso(line.amount)}</span> <span className="text-xs text-green-700">{pointsText(line.points)}</span></span>
        </li>
      ))}
      <li className="flex justify-between gap-3 bg-gray-50 px-3 py-2 font-semibold"><span>Total</span><span className="tabular-nums">{peso(total)} · {pointsText(pointsFor(total))}</span></li>
    </ul>
  );
}
