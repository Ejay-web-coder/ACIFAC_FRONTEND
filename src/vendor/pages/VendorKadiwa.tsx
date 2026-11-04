import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { fetchVendorKadiwa, logoutRequest, type KadiwaGood, type KadiwaInventoryItem } from '../../app/services/authApi';
import { Skeleton } from '../../app/components/common/UiKit';
import { VendorSaleForm } from '../components/VendorSaleForm';
import { dateOnlyToday } from '../../utils/dateTime';
import { closeLiveUpdates, useLiveRefresh } from '../../lib/liveUpdates';

// The Kadiwa store vendor's whole app: today's sale (search a product, add it,
// then the member purchases and expenses at checkout) and Log out.
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

  const today = new Date(`${dateOnlyToday()}T00:00:00Z`);
  const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(today);
  const shortDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(today);

  return (
    // Exactly one screen high: the lists inside scroll, never the page.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#eef1ea]">
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 sm:h-[4.5rem] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="ACIFAC logo" className="h-11 w-11 shrink-0 rounded-full border border-green-100 object-cover" />
            <div className="min-w-0">
              <p className="truncate text-xl font-bold text-green-900">Kadiwa Store</p>
              <p className="truncate text-sm text-gray-600"><span className="sm:hidden">{shortDate}</span><span className="hidden sm:inline">Sales for {longDate}</span></p>
            </div>
          </div>
          <button type="button" onClick={() => void logout()} disabled={loggingOut} aria-label="Log out" className="inline-flex h-12 min-w-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 px-3 text-base font-semibold text-gray-800 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 sm:px-4">
            <LogOut className="h-5 w-5" /><span className="hidden sm:inline">{loggingOut ? 'Logging out...' : 'Log out'}</span>
          </button>
        </div>
      </header>

      {error && <p className="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:mx-6 xl:mx-auto xl:w-full xl:max-w-7xl" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      {goods === null
        ? !error && <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6" role="status" aria-label="Loading the sales form"><Skeleton className="h-40 w-full rounded-3xl" /><Skeleton className="h-72 w-full rounded-3xl" /></div>
        : <VendorSaleForm goods={goods} inventory={inventory} onSaved={loadData} />}
    </div>
  );
}
