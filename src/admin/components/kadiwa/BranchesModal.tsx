import { useState, type FormEvent } from 'react';
import { MapPin, Plus, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { createKadiwaBranch, updateKadiwaBranch, type KadiwaBranch } from '../../../app/services/authApi';
import { confirmAction } from '../../../app/components/common/ConfirmDialog';

const INPUT = 'mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';

// The cooperative's Kadiwa stores: add a branch, rename it or change its
// address, and close or reopen it. A closed branch keeps its records but takes
// no new sales or products.
export function BranchesModal({ branches, onClose, onChanged }: { branches: KadiwaBranch[]; onClose: () => void; onChanged: () => void }) {
  const [adding, setAdding] = useState({ name: '', address: '' });
  const [editing, setEditing] = useState<{ id: number; name: string; address: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const { branch } = await createKadiwaBranch({ name: adding.name.trim(), address: adding.address.trim() });
      toast.success(`${branch.name} added`, { description: 'Add its products with Add Inventory, and give it a vendor in Manage Users.' });
      setAdding({ name: '', address: '' });
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to add the branch.');
    } finally {
      setSaving(false);
    }
  };

  const save = async (branch: KadiwaBranch, changes: Partial<Pick<KadiwaBranch, 'name' | 'address' | 'status'>>) => {
    if (saving) return;
    setSaving(true);
    try {
      const { branch: saved } = await updateKadiwaBranch(branch.id, { name: changes.name ?? branch.name, address: changes.address ?? branch.address, status: changes.status ?? branch.status });
      toast.success(changes.status && changes.status !== branch.status ? `${saved.name} ${saved.status === 'closed' ? 'closed' : 'reopened'}` : `${saved.name} saved`);
      setEditing(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save the branch.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (branch: KadiwaBranch) => {
    const closing = branch.status === 'active';
    if (closing && !(await confirmAction(`Close ${branch.name}? Its records and stock stay, but it takes no new sales or products${branch.vendors ? `, and its ${branch.vendors} ${branch.vendors === 1 ? 'vendor' : 'vendors'} cannot send sales` : ''}.`, { confirmLabel: 'Close branch', danger: true }))) return;
    await save(branch, { status: closing ? 'closed' : 'active' });
  };

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="branches-title"
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="branches-title" className="text-lg font-bold text-gray-900">Store Branches</h2>
            <p className="text-sm text-gray-600">Each branch keeps its own stock and records its own sales. Totals and net income add up every branch.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close branches"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <ul className="space-y-2">
            {branches.map((branch) => (
              <li key={branch.id} className={`rounded-xl border p-3 ${branch.status === 'closed' ? 'border-gray-200 bg-gray-50' : 'border-gray-200'}`}>
                {editing?.id === branch.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); void save(branch, { name: editing.name.trim(), address: editing.address.trim() }); }} className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Name
                      <input required minLength={2} maxLength={120} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className={INPUT} autoFocus />
                    </label>
                    <label className="block text-sm font-medium text-gray-700">Address
                      <input maxLength={300} value={editing.address} onChange={(event) => setEditing({ ...editing, address: event.target.value })} className={INPUT} />
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" disabled={saving} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">Save</button>
                      <button type="button" onClick={() => setEditing(null)} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                        <Store className="h-4 w-4 text-green-700" />{branch.name}
                        {branch.status === 'closed' && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">Closed</span>}
                      </p>
                      {branch.address && <p className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="h-3.5 w-3.5" />{branch.address}</p>}
                      <p className="text-xs text-gray-500">{branch.products} {branch.products === 1 ? 'product' : 'products'} · {branch.vendors} {branch.vendors === 1 ? 'vendor' : 'vendors'}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => setEditing({ id: branch.id, name: branch.name, address: branch.address })} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Edit</button>
                      <button type="button" onClick={() => void toggle(branch)} disabled={saving} className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${branch.status === 'active' ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'border border-green-600 text-green-700 hover:bg-green-50'}`}>
                        {branch.status === 'active' ? 'Close' : 'Reopen'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <form onSubmit={(event) => void add(event)} className="space-y-2 rounded-xl border border-dashed border-green-300 bg-green-50/50 p-3">
            <p className="text-sm font-semibold text-gray-900">Add a branch</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Name
                <input required minLength={2} maxLength={120} value={adding.name} onChange={(event) => setAdding({ ...adding, name: event.target.value })} placeholder="e.g. Barahan Branch" className={INPUT} />
              </label>
              <label className="text-sm font-medium text-gray-700">Address
                <input maxLength={300} value={adding.address} onChange={(event) => setAdding({ ...adding, address: event.target.value })} placeholder="Optional" className={INPUT} />
              </label>
            </div>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"><Plus className="h-4 w-4" />Add branch</button>
          </form>
        </div>
      </div>
    </div>
  );
}
