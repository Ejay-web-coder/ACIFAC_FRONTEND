import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ImageUp, Loader2, Save } from 'lucide-react';
import { ProtectedImage } from '../../app/components/common/ProtectedImage';
import { errorMessage } from '../../lib/api';
import { formatDateTime } from '../../utils/dateTime';
import {
  channelQrPath, fetchPaymentChannels, PAYMENT_CHANNEL_NAMES, savePaymentChannel, type PaymentChannel, type PaymentChannelName,
} from '../../app/services/onlinePaymentApi';

// Settings → Online Payments: the cooperative's GCash and Maya accounts that
// members pay into from Pay online (name, mobile number, QR code). Members see
// an account only while it is turned on.

export function PaymentChannelsSettings() {
  const [channels, setChannels] = useState<PaymentChannel[] | null>(null);
  const load = useCallback(() => {
    fetchPaymentChannels().then((response) => setChannels(response.data)).catch((error) => toast.error(errorMessage(error, 'Unable to load the payment accounts.')));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Online Payments</h2>
        <p className="mt-1 text-sm text-gray-600">
          The cooperative&apos;s GCash and Maya accounts members pay into from Pay online. Members send the money, then report it with the screenshot;
          the office checks the account and approves it under <span className="font-semibold">Finance → Online Payments</span>.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {PAYMENT_CHANNEL_NAMES.map((name) => (
          <ChannelCard key={name} name={name} channel={channels?.find((row) => row.channel === name) ?? null} loading={!channels} onSaved={load} />
        ))}
      </div>
    </div>
  );
}

function ChannelCard({ name, channel, loading, onSaved }: { name: PaymentChannelName; channel: PaymentChannel | null; loading: boolean; onSaved: () => void }) {
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [qr, setQr] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccountName(channel?.accountName ?? '');
    setAccountNumber(channel?.accountNumber ?? '');
    setEnabled(Boolean(channel?.enabled));
  }, [channel]);
  useEffect(() => {
    if (!qr) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(qr);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [qr]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await savePaymentChannel(name, { accountName, accountNumber, enabled, qr });
      toast.success(response.message);
      setQr(null);
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, `Unable to save the ${name} account.`));
    } finally {
      setSaving(false);
    }
  };

  const field = 'mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500';
  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-900">{name}</h3>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 accent-green-700" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={loading} />
          Members can pay by {name}
        </label>
      </div>
      <label className="block text-sm font-medium text-gray-700">Account name
        <input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={150} placeholder="As shown in the app, e.g. ACIFAC" className={field} disabled={loading} />
      </label>
      <label className="block text-sm font-medium text-gray-700">Mobile number of the account
        <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} inputMode="tel" placeholder="0917 123 4567" className={field} disabled={loading} />
      </label>
      <div className="flex items-start gap-3">
        {preview ? <img src={preview} alt={`New ${name} QR code`} className="h-32 w-32 rounded-xl object-contain ring-1 ring-gray-200" />
          : channel?.hasQr ? <ProtectedImage path={channelQrPath(name)} alt={`${name} QR code`} version={channel.updatedAt ?? ''} className="h-32 w-32 ring-1 ring-gray-200" />
            : <div className="flex h-32 w-32 items-center justify-center rounded-xl bg-gray-50 text-center text-xs text-gray-500 ring-1 ring-gray-200">No QR code yet</div>}
        <div className="space-y-1 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 font-semibold text-gray-700 hover:bg-gray-50">
            <ImageUp className="h-4 w-4" aria-hidden="true" />{channel?.hasQr ? 'Replace the QR code' : 'Upload the QR code'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setQr(event.target.files?.[0] ?? null)} />
          </label>
          <p className="text-xs text-gray-500">In the {name} app: the QR code to receive money, saved as a picture.</p>
        </div>
      </div>
      {channel?.updatedAt && <p className="text-xs text-gray-500">Last changed {formatDateTime(channel.updatedAt)}{channel.updatedBy ? ` by ${channel.updatedBy}` : ''}.</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save {name}
        </button>
      </div>
    </form>
  );
}
