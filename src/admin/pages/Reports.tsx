import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchAdminMachinery, type Machinery } from '../../app/services/authApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { PhilmechReportPanel } from '../components/machinery/PhilmechReportPanel';
import { MachineSettingsModal } from '../components/machinery/MachineSettingsModal';

export function Reports() {
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [settingsMachine, setSettingsMachine] = useState<Machinery | null>(null);

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
      <PhilmechReportPanel machinery={machinery} onEditMachine={setSettingsMachine} />

      {settingsMachine && (
        <MachineSettingsModal machine={settingsMachine} machinery={machinery} onClose={() => setSettingsMachine(null)} onChanged={() => { void loadMachinery(); }} />
      )}
    </div>
  );
}
