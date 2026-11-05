import { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { fetchVendorKadiwa, type KadiwaGood, type KadiwaInventoryItem } from '../../app/services/authApi';
import { Skeleton } from '../../app/components/common/UiKit';
import { VendorSaleForm } from '../components/VendorSaleForm';
import { dateOnlyToday } from '../../utils/dateTime';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { usePageHeading } from '../../app/components/pageHeading';

// The Kadiwa store vendor's page, inside the app's layout (sidebar, notifications
// and Log out): today's sale (search a product, add it, then the member
// purchases and expenses at checkout). What is sent waits for an administrator
// to confirm it.
export function VendorKadiwa() {
  const [goods, setGoods] = useState<KadiwaGood[] | null>(null);
  const [inventory, setInventory] = useState<KadiwaInventoryItem[]>([]);
  const [branchName, setBranchName] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(() => {
    fetchVendorKadiwa()
      .then((data) => { setGoods(data.goods); setInventory(data.inventory); setBranchName(data.branch?.name ?? ''); setError(''); })
      .catch((loadError: Error) => setError(loadError.message));
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  // The stock shown follows the store's inventory as it changes.
  useLiveRefresh(['kadiwa_inventory'], loadData);

  const today = new Date(`${dateOnlyToday()}T00:00:00Z`);
  const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(today);
  // The top bar shows the vendor's branch and today's date instead of the page name.
  usePageHeading(branchName ? { title: branchName, subtitle: `Sales for ${longDate}` } : null);

  return (
    // The screen below the layout's bars: the lists inside scroll, never the page.
    <div className="-mx-3 -my-4 flex h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-none bg-[#eef1ea] sm:-mx-4 sm:-my-5 md:-mx-6 md:-my-6 md:h-[calc(100dvh-4rem)] lg:-mx-8">
      {error && <p className="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:mx-6 xl:mx-auto xl:w-full xl:max-w-7xl" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      {goods === null
        ? !error && <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6" role="status" aria-label="Loading the sales form"><Skeleton className="h-40 w-full rounded-3xl" /><Skeleton className="h-72 w-full rounded-3xl" /></div>
        : <VendorSaleForm goods={goods} inventory={inventory} onSaved={loadData} />}
    </div>
  );
}
