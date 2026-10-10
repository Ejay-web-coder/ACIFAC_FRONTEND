import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LoaderCircle, Search, X } from 'lucide-react';
import { fetchShareCapitalBandMembers, type AdminDashboardData, type ShareCapitalBandMember } from '../../../app/services/authApi';
import { Pagination } from '../../../app/components/common/UiKit';
import { usePagination } from '../../../app/components/common/usePagination';

// The members cards of the admin dashboard: who has a login account, and how
// much share capital the members have (a bar opens its members).

const AXIS_TICK = { fontSize: 12, fill: '#5f6660' };
const TOOLTIP_STYLE = { borderRadius: 12, border: '1px solid #e4e7e4', boxShadow: '0 4px 12px -2px rgba(16,24,16,0.08)', fontSize: 13 };

/**
 * One small card: how many members (terminated ones left out) have a login
 * account and how many do not, with a bar showing the split. The percentages
 * always add up to 100.
 */
export function MemberAccountsCard({ registered, unregistered, loading }: { registered?: number; unregistered?: number; loading: boolean }) {
  const known = registered !== undefined && unregistered !== undefined;
  const total = known ? registered + unregistered : 0;
  const registeredPercent = total ? Math.round((registered! / total) * 100) : 0;
  const parts = [
    { label: 'Registered Members', detail: 'with an account', value: registered, percent: registeredPercent, color: '#16a34a' },
    { label: 'Unregistered Members', detail: 'without an account', value: unregistered, percent: total ? 100 - registeredPercent : 0, color: '#9ca3af' },
  ];
  return <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-[var(--shadow-card)]">
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-sm font-semibold text-gray-900">Member Accounts</p>
      <p className="text-xs text-gray-500">{known ? `${total.toLocaleString()} ${total === 1 ? 'member' : 'members'}` : loading ? '…' : ''}</p>
    </div>
    <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={total ? `${registered} of ${total} members have an account` : 'No members yet'}>
      {total > 0 && parts.map((part) => part.value ? <span key={part.label} className="h-full" style={{ width: `${(part.value / total) * 100}%`, background: part.color }} /> : null)}
    </div>
    <div className="mt-2 grid grid-cols-2 gap-3">
      {parts.map((part) => <div key={part.label} className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-medium leading-tight text-gray-600"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: part.color }} />{part.label}</p>
        <p className="text-xl font-bold leading-tight tabular-nums text-gray-900">{part.value !== undefined ? part.value.toLocaleString() : loading ? '…' : '0'}</p>
        <p className="text-xs leading-tight text-gray-500">{part.detail}{total ? ` · ${part.percent}%` : ''}</p>
      </div>)}
    </div>
  </div>;
}

export type ShareCapitalLevel = AdminDashboardData['shareCapitalLevels'][number];
// From red (little share capital) to green (the PHP 20,000 maximum); each bar
// is also named on the axis, so the color is not the only way to tell them apart.
const SHARE_CAPITAL_BANDS: Record<ShareCapitalLevel['key'], { label: string; color: string }> = {
  below1k: { label: 'Below ₱1,000', color: '#dc2626' },
  from1kTo5k: { label: '₱1,000–₱4,999', color: '#f97316' },
  from5kTo15k: { label: '₱5,000–₱14,999', color: '#eab308' },
  from15kTo20k: { label: '₱15,000–₱19,999', color: '#84cc16' },
  maximum: { label: '₱20,000 (max)', color: '#16a34a' },
};
const formatPercent = (value: number) => `${value.toLocaleString('en-PH', { maximumFractionDigits: 1 })}%`;

/** How many members, and what share of them, have share capital in each band now. Clicking a bar lists its members. */
export function ShareCapitalChart({ levels, loading, onSelect }: { levels: ShareCapitalLevel[]; loading: boolean; onSelect: (band: ShareCapitalLevel['key']) => void }) {
  const total = levels.reduce((sum, level) => sum + level.members, 0);
  const bars = levels.map((level) => {
    const percent = total ? (level.members / total) * 100 : 0;
    return { ...level, ...SHARE_CAPITAL_BANDS[level.key], percent, valueLabel: `${level.members.toLocaleString()} · ${formatPercent(percent)}` };
  });
  return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-6">
    <h2 className="text-lg font-bold text-gray-900">Members by Share Capital</h2>
    <p className="mb-4 mt-1 text-sm text-gray-500">{total ? `${total.toLocaleString()} ${total === 1 ? 'member' : 'members'}, current share capital` : 'Current share capital of the members'}</p>
    <div className="h-[276px]">{total ? <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 276 }}>
      <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 76, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e7e4" horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#e4e7e4' }} width={132} />
        <Tooltip cursor={{ fill: 'rgba(139,202,132,0.12)' }} content={({ active, payload }) => {
          const bar = active && payload?.length ? payload[0].payload as (typeof bars)[number] : null;
          return bar ? <div className="space-y-1 bg-white p-3 text-[13px]" style={TOOLTIP_STYLE}>
            <p className="flex items-center gap-2 font-semibold text-gray-900"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: bar.color }} />{bar.label}</p>
            <p className="text-gray-600"><span className="font-semibold tabular-nums text-gray-900">{bar.members.toLocaleString()}</span> {bar.members === 1 ? 'member' : 'members'} · {formatPercent(bar.percent)} of {total.toLocaleString()}</p>
            {bar.members > 0 && <p className="text-xs text-gray-500">Click to see the members</p>}
          </div> : null;
        }} />
        {/* A click on a bar, or anywhere on its row (the clear background), opens its members, so a
            short bar is easy to hit. The band is read from the clicked bar's own data: the chart's click
            reports the bar hovered last (a different one after a tap on a phone), and the click index
            skips bars recharts does not draw. minPointSize keeps an empty band drawn (1px), so it still
            shows "0 · 0%" and can be clicked. */}
        <Bar dataKey="members" name="Members" radius={[0, 4, 4, 0]} maxBarSize={32} minPointSize={1} isAnimationActive={false} style={{ cursor: 'pointer' }}
          background={{ fill: 'transparent', style: { cursor: 'pointer' } }} onClick={(item) => { const key = (item?.payload as (typeof bars)[number] | undefined)?.key; if (key) onSelect(key); }}>
          {bars.map((bar) => <Cell key={bar.key} fill={bar.color} />)}
          {/* Clicks go through the label to the row under it. */}
          <LabelList dataKey="valueLabel" position="right" fontSize={12} fill="#374151" className="pointer-events-none" />
        </Bar>
      </BarChart>
    </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-gray-500">{loading ? 'Loading live data...' : 'No members yet.'}</div>}</div>
  </div>;
}

const peso2 = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The members of one share capital band, most share capital first, with a search by name or member ID. */
export function ShareCapitalMembersModal({ band, onClose }: { band: ShareCapitalLevel['key']; onClose: () => void }) {
  const [members, setMembers] = useState<ShareCapitalBandMember[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const info = SHARE_CAPITAL_BANDS[band];

  useEffect(() => {
    let cancelled = false;
    fetchShareCapitalBandMembers(band)
      .then((response) => { if (!cancelled) setMembers(response.members); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load the members.'); });
    return () => { cancelled = true; };
  }, [band]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const term = search.trim().toLowerCase();
  const shown = (members || []).filter((member) => !term || member.memberName.toLowerCase().includes(term) || member.memberNumber.toLowerCase().includes(term));
  const pages = usePagination(shown, { pageSize: 10, resetKey: term });
  const totalShare = (members || []).reduce((sum, member) => sum + member.shareCapital, 0);
  const status = (member: ShareCapitalBandMember) => member.status !== 'active' && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">{member.status}</span>;

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="share-band-title" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-600">Members by Share Capital</p>
            <h2 id="share-band-title" className="flex items-center gap-2 text-lg font-bold text-gray-900"><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ background: info.color }} />{info.label}</h2>
            <p className="text-sm text-gray-500">{members ? `${members.length.toLocaleString()} ${members.length === 1 ? 'member' : 'members'} · ${peso2(totalShare)} share capital in all` : 'Loading…'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close the member list"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? <p className="p-6 text-sm text-red-600">{error}</p>
            : !members ? <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading members…</p>
              : !members.length ? <p className="p-10 text-center text-sm text-gray-500">No members have share capital in this range.</p>
                : <>
                  <div className="border-b border-gray-200 p-3 sm:px-6">
                    <label className="relative block">
                      <span className="sr-only">Search by name or member ID</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or member ID" className="h-11 w-full rounded-xl border border-gray-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
                    </label>
                  </div>
                  {!shown.length ? <p className="p-8 text-center text-sm text-gray-500">No member matches “{search.trim()}”.</p> : <>
                    {/* Phone: one line per member */}
                    <ul className="divide-y divide-gray-100 sm:hidden">
                      {pages.pageItems.map((member) => (
                        <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">{member.memberName}{status(member)}</p>
                            <p className="text-xs text-gray-500">{member.memberNumber}</p>
                          </div>
                          <p className="shrink-0 font-semibold tabular-nums text-gray-900">{peso2(member.shareCapital)}</p>
                        </li>
                      ))}
                    </ul>
                    <table className="hidden w-full text-left text-sm sm:table">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-6 py-2.5 font-medium">Member ID</th><th className="px-4 py-2.5 font-medium">Name</th><th className="px-6 py-2.5 text-right font-medium">Share Capital</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {pages.pageItems.map((member) => (
                          <tr key={member.id}>
                            <td className="whitespace-nowrap px-6 py-2.5 text-gray-600">{member.memberNumber}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-900">{member.memberName}{status(member)}</td>
                            <td className="whitespace-nowrap px-6 py-2.5 text-right font-semibold tabular-nums text-gray-900">{peso2(member.shareCapital)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="members" />
                  </>}
                </>}
        </div>
      </div>
    </div>
  );
}
