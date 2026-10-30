import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchAdminMachinery, type Machinery } from '../../app/services/authApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { PhilmechReportPanel } from '../components/machinery/PhilmechReportPanel';
import { MachineSettingsModal } from '../components/machinery/MachineSettingsModal';
import { KadiwaSalesReportPanel } from '../components/kadiwa/KadiwaSalesReportPanel';

type ReportTab = 'philmech' | 'kadiwa';
const TABS: Array<{ key: ReportTab; label: string }> = [{ key: 'philmech', label: 'PhilMech Report' }, { key: 'kadiwa', label: 'Kadiwa Sales Report' }];
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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1" role="tablist" aria-label="Reports">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => chooseTab(item.key)}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === item.key ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-green-50'}`}>{item.label}</button>
        ))}
      </div>

      {tab === 'philmech' ? <PhilmechReportPanel machinery={machinery} onEditMachine={setSettingsMachine} /> : <KadiwaSalesReportPanel />}

      {settingsMachine && (
        <MachineSettingsModal machine={settingsMachine} machinery={machinery} onClose={() => setSettingsMachine(null)} onChanged={() => { void loadMachinery(); }} />
      )}
    </div>
  );
}
