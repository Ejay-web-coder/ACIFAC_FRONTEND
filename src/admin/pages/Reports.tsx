import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ShoppingBasket, Tractor } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAdminMachinery, type Machinery } from '../../app/services/authApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { PhilmechReportPanel } from '../components/machinery/PhilmechReportPanel';
import { MachineSettingsModal } from '../components/machinery/MachineSettingsModal';
import { KadiwaSalesReportPanel } from '../components/kadiwa/KadiwaSalesReportPanel';

type ReportTab = 'philmech' | 'kadiwa';
// Each report: what it is, who it goes to, and how often.
const TABS: Array<{ key: ReportTab; label: string; text: string; when: string; icon: typeof Tractor }> = [
  { key: 'philmech', label: 'PhilMech Report', text: 'Machinery use, cash flow and farmer clients', when: 'Per cropping · to PhilMech', icon: Tractor },
  { key: 'kadiwa', label: 'Kadiwa Sales Report', text: 'Every good sold at the Kadiwa store', when: 'Every 15 days or monthly · to the DA', icon: ShoppingBasket },
];
const TAB_KEY = 'acifac.reports.tab';

// The reports the cooperative submits: PhilMech (machinery) and the Kadiwa ng Pangulo sales report.
export function Reports() {
  const [tab, setTab] = useState<ReportTab>(() => {
    try { return window.localStorage.getItem(TAB_KEY) === 'kadiwa' ? 'kadiwa' : 'philmech'; } catch { return 'philmech'; }
  });
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [settingsMachine, setSettingsMachine] = useState<Machinery | null>(null);

  const chooseTab = (next: ReportTab) => {
    setTab(next);
    try { window.localStorage.setItem(TAB_KEY, next); } catch { /* the tab is only remembered when storage works */ }
  };

  // Only the machine list is needed, so a single operation is requested.
  const loadMachinery = useCallback(async () => {
    try {
      setMachinery((await fetchAdminMachinery({ limit: 1 })).machinery);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load machinery.');
    }
  }, []);

  useEffect(() => { void loadMachinery(); }, [loadMachinery]);
  useLiveRefresh(['machinery'], () => { void loadMachinery(); });

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* The top bar already names the page. */}
      <p className="text-sm text-gray-600">Choose a report, pick the period, check the figures, then save and export it.</p>

      {/* Which report: one card each. */}
      <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Reports">
        {TABS.map((item) => {
          const selected = tab === item.key;
          const Icon = item.icon;
          return (
            <button key={item.key} type="button" role="tab" aria-selected={selected} onClick={() => chooseTab(item.key)}
              className={`relative flex items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] ${selected ? 'border-green-600 bg-green-50 ring-1 ring-green-600' : 'border-gray-200 bg-white shadow-[var(--shadow-card)]'}`}>
              <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-gray-900">{item.label}</span>
                <span className="block text-sm text-gray-600">{item.text}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{item.when}</span>
              </span>
              {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {tab === 'philmech' ? <PhilmechReportPanel machinery={machinery} onEditMachine={setSettingsMachine} /> : <KadiwaSalesReportPanel />}

      {settingsMachine && (
        <MachineSettingsModal machine={settingsMachine} machinery={machinery} onClose={() => setSettingsMachine(null)} onChanged={() => { void loadMachinery(); }} />
      )}
    </div>
  );
}
