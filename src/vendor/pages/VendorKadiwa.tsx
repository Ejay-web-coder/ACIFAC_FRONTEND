import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { fetchVendorKadiwa, logoutRequest, type KadiwaGood, type KadiwaInventoryItem } from '../../app/services/authApi';
import { Skeleton } from '../../app/components/common/UiKit';
import { NewSaleSheet } from '../../admin/components/kadiwa/SalesForms';
import { closeLiveUpdates, useLiveRefresh } from '../../lib/liveUpdates';

// The Kadiwa store vendor's whole app: today's sales form (search, goods,
// store items from the inventory, expenses, member purchases) and Log out.
// What is sent waits for an administrator to confirm it.
export function VendorKadiwa() {
  const [goods, setGoods] = useState<KadiwaGood[] | null>(null);
  const [inventory, setInventory] = useState<KadiwaInventoryItem[]>([]);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  const loadData = useCallback(() => {
    fetchVendorKadiwa()
      .then((data) => { setGoods(data.goods); setInventory(data.inventory); setError(''); })
      .catch((loadError: Error) => setError(loadError.message));
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  // The stock shown follows the store's inventory as it changes.
  useLiveRefresh(['kadiwa_inventory'], loadData);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutRequest();
    } catch {
      toast.error('Unable to contact the server, but this session was cleared locally.');
    } finally {
      closeLiveUpdates();
      window.location.replace('/login');
    }
  };

  return (
    // Exactly one screen high: the panels of the form scroll, never the page.
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-3 sm:h-16 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/logo.png" alt="ACIFAC logo" className="h-9 w-9 shrink-0 rounded-full border border-green-100 object-cover" />
            <p className="truncate text-base font-bold text-green-800 sm:text-lg">Kadiwa Store</p>
          </div>
          <button type="button" onClick={() => void logout()} disabled={loggingOut} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60">
            <LogOut className="h-4 w-4" />{loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3">
        {error && <p className="mb-2 flex shrink-0 items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        {goods === null
          ? !error && <div className="space-y-2" role="status" aria-label="Loading the sales form"><Skeleton className="h-16 w-full rounded-2xl" /><Skeleton className="h-96 w-full rounded-2xl" /></div>
          : <NewSaleSheet vendor goods={goods} inventory={inventory} onClose={() => undefined} onSaved={loadData} />}
      </main>
    </div>
  );
}
