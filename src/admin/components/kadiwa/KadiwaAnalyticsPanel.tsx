import { useEffect, useState } from 'react';
import { fetchKadiwaAnalytics, fetchKadiwaBranches, type KadiwaBranch, type KadiwaBranchFilter, type KadiwaProducts } from '../../../app/services/authApi';
import { KadiwaChart, type KadiwaChartRow } from './KadiwaChart';
import { KadiwaProductsCard } from './KadiwaProductInsights';

type Load = (from: string, to: string) => Promise<{ sales: KadiwaChartRow[]; products: KadiwaProducts }>;

/** The Kadiwa chart and products for a period, as `load` gives them (one branch's, or every branch's). */
export function KadiwaAnalyticsPanel({ from, to, daily, refreshKey, load }: { from: string; to: string; daily: boolean; refreshKey: number; load: Load }) {
  const [data, setData] = useState<{ key: string; sales: KadiwaChartRow[]; products: KadiwaProducts } | null>(null);
  const [error, setError] = useState('');
  const key = `${from}|${to}`;

  useEffect(() => {
    let active = true;
    load(from, to)
      .then((result) => { if (active) { setData({ key, ...result }); setError(''); } })
      .catch((reason: Error) => { if (active) setError(reason.message || 'Unable to load the Kadiwa figures.'); });
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshKey, load]);

  // The figures of the period picked, not the last one while the next loads.
  const shown = data && data.key === key ? data : null;
  return (
    <>
      <KadiwaChart rows={shown?.sales ?? []} daily={daily} loading={!shown && !error} />
      <KadiwaProductsCard data={shown?.products ?? null} error={error} />
    </>
  );
}

/**
 * The office's Kadiwa tab: the main store's figures first, any other branch,
 * or every branch together (the branch list shows only when there are several).
 */
export function KadiwaBranchAnalytics({ from, to, daily, refreshKey }: { from: string; to: string; daily: boolean; refreshKey: number }) {
  const [branches, setBranches] = useState<KadiwaBranch[]>([]);
  const [branch, setBranch] = useState<KadiwaBranchFilter>(1);
  useEffect(() => { fetchKadiwaBranches().then((response) => setBranches(response.branches)).catch(() => undefined); }, []);
  const [load, setLoad] = useState<Load>(() => (f: string, t: string) => fetchKadiwaAnalytics(f, t, 1));
  useEffect(() => { setLoad(() => (f: string, t: string) => fetchKadiwaAnalytics(f, t, branch)); }, [branch]);

  return (
    <>
      {branches.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="kadiwa-analytics-branch" className="text-sm font-medium text-gray-700">Branch</label>
          <select id="kadiwa-analytics-branch" value={String(branch)} onChange={(event) => setBranch(event.target.value === 'all' ? 'all' : Number(event.target.value))} className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800">
            {branches.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === 'closed' ? ' (closed)' : ''}</option>)}
            <option value="all">All branches</option>
          </select>
        </div>
      )}
      <KadiwaAnalyticsPanel from={from} to={to} daily={daily} refreshKey={refreshKey} load={load} />
    </>
  );
}
