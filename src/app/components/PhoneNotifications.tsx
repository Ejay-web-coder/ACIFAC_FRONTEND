import { useEffect, useState } from 'react';
import { BellRing, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/api';
import { pushState, turnOffPush, turnOnPush, type PushState } from '../../lib/pushNotifications';

// Settings > Notifications: phone notifications for this device. Each device
// (phone, tablet, computer) is turned on separately.

const DESCRIPTIONS: Record<PushState, string> = {
  on: 'This device shows your ACIFAC notifications, even when the app is closed.',
  off: 'Get your ACIFAC notifications on this device even when the app is closed: dues, loans, meetings, rentals and announcements.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser\'s site settings (the lock icon beside the address), then turn this on.',
  'ios-needs-install': 'On iPhone and iPad, add ACIFAC to your Home Screen first (Share, then Add to Home Screen), open it from there, and turn this on.',
  unsupported: 'This browser cannot show phone notifications. Use Chrome, Edge, Firefox or Samsung Internet, or the ACIFAC app added to the Home Screen.',
};

export function PhoneNotifications() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    pushState().then((value) => { if (alive) setState(value); }).catch(() => { if (alive) setState('unsupported'); });
    return () => { alive = false; };
  }, []);

  const toggle = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      const next = state === 'on' ? await turnOffPush() : await turnOnPush();
      setState(next);
      if (next === 'on') toast.success('Phone notifications are on for this device.');
      else if (state === 'on') toast.success('Phone notifications are off for this device.');
      else if (next === 'blocked') toast.error('Notifications are blocked for this site in your browser settings.');
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to change phone notifications.'));
    } finally {
      setBusy(false);
    }
  };

  const canToggle = state === 'on' || state === 'off';
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700">
          {state === 'on' ? <BellRing className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-gray-900">Phone Notifications</p>
          <p className="text-sm text-gray-600">{state ? DESCRIPTIONS[state] : 'Checking this device…'}</p>
          {state === 'on' && <p className="mt-1 text-xs text-gray-500">Saved right away for this device. Signing out turns it off here.</p>}
        </div>
      </div>
      {canToggle ? (
        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
          <input type="checkbox" aria-label="Phone notifications on this device" checked={state === 'on'} disabled={busy} onChange={() => void toggle()} className="peer sr-only" />
          <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 peer-disabled:opacity-60" />
          {busy && <Loader2 className="absolute -left-6 h-4 w-4 animate-spin text-gray-400" aria-hidden />}
        </label>
      ) : null}
    </div>
  );
}
