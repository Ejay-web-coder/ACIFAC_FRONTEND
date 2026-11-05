import { useState, type FormEvent } from 'react';
import { Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { transferKadiwaInventory, type KadiwaBranch, type KadiwaInventoryItem } from '../../../app/services/authApi';
import { productLabel } from './InventoryForms';

const INPUT = 'mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';

// Sends some of a product's stock to another branch: it leaves this branch's
// stock and joins the same product there (added with the same prices when the
// branch does not have it yet).
export function SendToBranchModal({ item, branches, onClose, onSent }: { item: KadiwaInventoryItem; branches: KadiwaBranch[]; onClose: () => void; onSent: () => void }) {
  const targets = branches.filter((branch) => branch.status === 'active' && branch.id !== item.branchId);
  const [branchId, setBranchId] = useState(targets[0]?.id ?? 0);
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const amount = Number(quantity);
  const tooMany = amount > item.stock;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !branchId || !(amount > 0) || tooMany) return;
    setSaving(true);
    try {
      const result = await transferKadiwaInventory(item.id, branchId, quantity.trim());
      const to = targets.find((branch) => branch.id === branchId)?.name ?? 'the branch';
      toast.success(`${quantity} ${item.unit} of ${productLabel(item)} sent to ${to}`, {
        description: `${result.addedToBranch ? 'Added to its inventory' : 'Added to its stock'}: ${result.to.stock} ${item.unit} there now. ${result.from.stock} ${item.unit} left here.`,
      });
      onSent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to send the stock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="send-stock-title"
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="send-stock-title" className="text-lg font-bold text-gray-900">Send to a branch</h2>
            <p className="text-sm text-gray-600">{productLabel(item)} · {item.stock} {item.unit} in {item.branchName ?? 'this branch'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {targets.length ? (
          <>
            <label className="block text-sm font-medium text-gray-700">Branch
              <select value={branchId} onChange={(event) => setBranchId(Number(event.target.value))} className={INPUT}>
                {targets.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">Quantity ({item.unit})
              <input required autoFocus inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={`At most ${item.stock}`} className={`${INPUT} ${tooMany ? 'border-red-400' : ''}`} />
              {tooMany && <span className="mt-1 block text-xs font-medium text-red-600">Only {item.stock} {item.unit} in stock.</span>}
            </label>
            <p className="text-xs text-gray-500">It leaves this stock and joins the same product at the branch, or is added there with the same selling and cost price.</p>
            <div className="flex gap-2">
              <button type="submit" disabled={saving || !(amount > 0) || tooMany} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Send className="h-4 w-4" />{saving ? 'Sending…' : 'Send'}</button>
              <button type="button" onClick={onClose} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
            </div>
          </>
        ) : <p className="text-sm text-gray-600">There is no other open branch to send to. Add one with Branches.</p>}
      </form>
    </div>
  );
}
