import { useEffect, useState, type ReactNode } from 'react';
import { Info, PiggyBank } from 'lucide-react';
import { fetchMyDividend, type MemberDividend } from '../../app/services/authApi';
import { formatDate } from '../../utils/dateTime';

export const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** 0.0523 -> "5.2300%" */
export const percent = (ratio: number) => `${(ratio * 100).toLocaleString('en-PH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`;
const ratioText = (ratio: number) => ratio.toLocaleString('en-PH', { minimumFractionDigits: 6, maximumFractionDigits: 6 });

/** The member's dividend for a year; undefined year = this year. */
export function useMyDividend(year: number | undefined, enabled = true) {
  const [dividend, setDividend] = useState<MemberDividend | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setError('');
    fetchMyDividend(year)
      .then((data) => { if (!cancelled) setDividend(data); })
      .catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [year, enabled]);
  return { dividend, error };
}

// A formula line: the formula in words, then with the member's numbers.
function Formula({ children, worked }: { children: ReactNode; worked?: ReactNode }) {
  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/60 px-3 py-2.5 font-mono text-[13px] leading-relaxed text-purple-950">
      <p className="break-words">{children}</p>
      {worked && <p className="mt-1 break-words text-purple-800">{worked}</p>}
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs text-white">{number}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: Array<[ReactNode, number, ('less' | 'total')?]> }) {
  return (
    <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
      {rows.map(([label, amount, kind], index) => (
        <div key={index} className={`flex items-baseline justify-between gap-3 px-3 py-2 ${kind === 'total' ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700'}`}>
          <dt className="min-w-0">{label}</dt>
          <dd className={`shrink-0 tabular-nums ${kind === 'less' ? 'text-red-700' : ''}`}>{kind === 'less' ? `− ${peso(amount)}` : peso(amount)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** How the member's dividend is computed, step by step, with their numbers. */
export function MemberDividendSection({ dividend, error, year, onYearChange }: {
  dividend: MemberDividend | null;
  error: string;
  year: number | undefined;
  onYearChange: (year: number) => void;
}) {
  const shownYear = dividend?.year ?? year;
  const thisYear = dividend ? (dividend.yearComplete ? Math.max(dividend.year + 1, new Date().getFullYear()) : dividend.year) : new Date().getFullYear();
  const years = dividend ? Array.from({ length: Math.max(1, thisYear - dividend.firstYear + 1) }, (_, index) => thisYear - index) : [];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6" id="my-dividend">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900"><PiggyBank className="h-5 w-5 text-purple-600" />My Dividend</h2>
          <p className="mt-1 text-sm text-gray-600">How your share of the cooperative&apos;s net income is computed.</p>
        </div>
        {years.length > 0 && (
          <label className="text-sm font-medium text-gray-700">
            Year
            <select value={shownYear} onChange={(event) => onYearChange(Number(event.target.value))} className="ml-2 rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {years.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!error && !dividend && <div className="acf-skeleton mt-4 h-40 w-full" aria-hidden="true" />}

      {dividend && (
        <div className="mt-5 space-y-6">
          <div className="rounded-xl bg-purple-600 p-4 text-white sm:p-5">
            <p className="text-sm text-purple-100">Your estimated dividend for {dividend.year}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{peso(dividend.dividend)}</p>
            <p className="mt-1 text-sm text-purple-100">
              {dividend.yearComplete ? `January 1 to December 31, ${dividend.year}` : `Year to date: January 1 to ${formatDate(dividend.asOf)}`}
              {' · '}{percent(dividend.shareRatio)} of the dividend pool
            </p>
          </div>

          {dividend.netIncome <= 0 && (
            <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />The cooperative has no net income for {dividend.year} yet, so there is no surplus to share.</p>
          )}

          <Step number={1} title="Net Surplus">
            <Formula worked={`= ${peso(Math.max(0, dividend.netIncome))} − ${peso(dividend.statutoryTotal)} = ${peso(dividend.netSurplus)}`}>
              Net Surplus = Net Income − Statutory Funds ({dividend.rates.statutory}% of Net Income)
            </Formula>
            <Rows rows={[
              ['Net Income: Kadiwa Store', dividend.netIncomeParts.kadiwa],
              ['Net Income: Machinery', dividend.netIncomeParts.machinery],
              ['Net Income: Loan interest', dividend.netIncomeParts.loans],
              ['Total Net Income', dividend.netIncome, 'total'],
              ...dividend.statutoryFunds.map((fund): [string, number, 'less'] => [`${fund.label} (${fund.percent}%)`, fund.amount, 'less']),
              [`Net Surplus (${100 - dividend.rates.statutory}% of Net Income)`, dividend.netSurplus, 'total'],
            ]} />
          </Step>

          <Step number={2} title="Dividend & Patronage Refund Pools">
            <Formula worked={`= ${peso(dividend.netSurplus)} × ${dividend.rates.dividendPool}% = ${peso(dividend.dividendPool)}`}>
              Dividend Pool = Net Surplus × {dividend.rates.dividendPool}%
            </Formula>
            <Formula worked={`= ${peso(dividend.netSurplus)} × ${dividend.rates.patronageRefundPool}% = ${peso(dividend.patronageRefundPool)}`}>
              Patronage Refund Pool = Net Surplus × {dividend.rates.patronageRefundPool}%
            </Formula>
          </Step>

          <Step number={3} title="Your Share Ratio & Dividend">
            <Formula worked={`= ${peso(dividend.memberShareCapital)} ÷ ${peso(dividend.totalShareCapital)} = ${ratioText(dividend.shareRatio)} (${percent(dividend.shareRatio)})`}>
              Share Ratio = Your Share Capital ÷ Total Paid-up Share Capital
            </Formula>
            <Formula worked={`= ${peso(dividend.dividendPool)} × ${ratioText(dividend.shareRatio)} = ${peso(dividend.dividend)}`}>
              Your Dividend = Dividend Pool × Share Ratio
            </Formula>
            <p className="text-xs text-gray-500">Share capital paid up to {formatDate(dividend.asOf)}, of all current members.</p>
          </Step>

          <Step number={4} title="Summary">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Formula</th><th className="px-3 py-2 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {([
                    ['Net Income', 'Kadiwa + Machinery + Loan interest', peso(dividend.netIncome)],
                    ['Statutory Funds', `Net Income × ${dividend.rates.statutory}%`, peso(dividend.statutoryTotal)],
                    ['Net Surplus', 'Net Income − Statutory Funds', peso(dividend.netSurplus)],
                    ['Dividend Pool', `Net Surplus × ${dividend.rates.dividendPool}%`, peso(dividend.dividendPool)],
                    ['Patronage Refund Pool', `Net Surplus × ${dividend.rates.patronageRefundPool}%`, peso(dividend.patronageRefundPool)],
                    ['Your Share Capital', 'Paid-up share capital', peso(dividend.memberShareCapital)],
                    ['Total Paid-up Share Capital', 'All members', peso(dividend.totalShareCapital)],
                    ['Share Ratio', 'Your Share Capital ÷ Total', `${ratioText(dividend.shareRatio)} (${percent(dividend.shareRatio)})`],
                    ['Your Dividend', 'Dividend Pool × Share Ratio', peso(dividend.dividend)],
                  ] as const).map(([item, formula, amount]) => (
                    <tr key={item} className={item === 'Your Dividend' ? 'bg-purple-50 font-semibold text-purple-950' : 'text-gray-700'}>
                      <td className="px-3 py-2 font-medium">{item}</td>
                      <td className="px-3 py-2 font-mono text-[13px]">{formula}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Step>

          <p className="flex gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            This is an estimate from the cooperative&apos;s records{dividend.yearComplete ? '' : ' so far this year'}. The actual dividend is approved by the General Assembly after the year&apos;s financial statements are audited. The patronage refund is shared by how much each member used the cooperative&apos;s services and is not shown here.
          </p>
        </div>
      )}
    </div>
  );
}
