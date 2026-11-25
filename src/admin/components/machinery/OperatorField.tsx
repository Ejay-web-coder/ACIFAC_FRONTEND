import { useEffect, useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { setOperationOperator, type MachineryOperation } from '../../../app/services/authApi';
import { fetchOperators } from '../../../app/services/machineryApi';
import { errorMessage } from '../../../lib/api';
import { formatDate } from '../../../utils/dateTime';
import { Modal, inputClass, labelClass, primaryButton, secondaryButton } from './shared';

/**
 * The name of who operated the machine. The names already entered are
 * offered as the office types, those who ran this machine first.
 */
export function OperatorField({ machineryId, value, onChange, className = '', autoFocus = false }: {
  machineryId?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    // Only suggestions: the field works without them.
    fetchOperators(machineryId || undefined)
      .then((rows) => { if (active) setNames(rows.map((row) => row.name)); })
      .catch(() => { if (active) setNames([]); });
    return () => { active = false; };
  }, [machineryId]);

  return (
    <label className={`${labelClass} ${className}`}>Operator <span className="font-normal text-gray-500">(optional)</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} list={listId} maxLength={200} autoComplete="off" autoFocus={autoFocus}
        className={inputClass} placeholder="Who ran the machine" />
      <datalist id={listId}>{names.map((name) => <option key={name} value={name} />)}</datalist>
    </label>
  );
}

/** Enter, change or remove the operator of an approved booking (also after it is completed). */
export function BookingOperatorModal({ operation, onClose, onSaved }: { operation: MachineryOperation; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(operation.operatorName ?? '');
  const [saving, setSaving] = useState(false);
  const unchanged = name.trim() === (operation.operatorName ?? '');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { operation: saved } = await setOperationOperator(operation.id, name.trim());
      toast.success(saved.operatorName ? `Operator saved: ${saved.operatorName}` : 'Operator removed');
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to save the operator.'));
    } finally {
      setSaving(false);
    }
  };

  const dates = `${formatDate(operation.startDate)}${operation.endDate !== operation.startDate ? ` to ${formatDate(operation.endDate)}` : ''}`;
  return (
    <Modal
      title={operation.operatorName ? 'Change operator' : 'Enter operator'}
      description={`${operation.machineryName} · ${operation.memberName} · ${dates}`}
      onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
        <button type="submit" form="booking-operator-form" disabled={saving || unchanged} className={primaryButton}>{saving ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <form id="booking-operator-form" onSubmit={save}>
        <OperatorField machineryId={operation.machineryId} value={name} onChange={setName} autoFocus />
        {operation.operatorName && <p className="mt-2 text-xs text-gray-500">Clear the name and save to remove the operator.</p>}
      </form>
    </Modal>
  );
}
