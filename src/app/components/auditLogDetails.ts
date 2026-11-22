import type { AuditLogEntry } from '../services/authApi';
import { formatDateTime } from '../../utils/dateTime';

/** Who did the action, by full name (e.g. "Krezner Allado"), else the username. */
export const auditActorName = (entry: AuditLogEntry) =>
  entry.user_full_name || entry.user_name_snapshot || (entry.user_id ? `User #${entry.user_id}` : 'System');

export const AUDIT_ROLE_LABELS: Record<string, string> = { ADMIN: 'Administrator', MEMBER: 'Member', VENDOR: 'Kadiwa vendor' };

const AUDIENCE_LABELS: Record<string, string> = {
  Everyone: 'Everyone', 'All Members': 'All members', 'Members Only': 'Members only', 'Admins Only': 'Administrators only', 'Vendors Only': 'Kadiwa vendors only',
};

export interface AuditTarget {
  name: string;
  /** What the person is: "Member ACF-0012", "Administrator", "Not a member, by name only", ... */
  note: string | null;
  /** The action was on the account of whoever did it (signing in, their own profile). */
  ownAccount: boolean;
}

/** Who the action was for; null when it is not about a particular person (a machine, a product, a policy). */
export function auditTarget(entry: AuditLogEntry): AuditTarget | null {
  const name = entry.target_name?.trim();
  if (!name) return null;
  const ownAccount = entry.target_account_id != null && entry.target_account_id === entry.user_id;
  switch (entry.target_kind) {
    case 'member':
      return { name, note: entry.target_member_number ? `Member ${entry.target_member_number}` : 'Member', ownAccount };
    case 'account':
      return { name, note: AUDIT_ROLE_LABELS[entry.target_role ?? ''] ?? null, ownAccount };
    case 'audience':
      return { name: AUDIENCE_LABELS[name] ?? name, note: 'Who the announcement is for', ownAccount: false };
    default:
      return {
        name,
        note: entry.entity_type === 'machinery_bag_sale' ? 'Buyer, by name only' : entry.entity_type === 'kadiwa_sale' ? 'Kadiwa vendor' : 'Not a member, by name only',
        ownAccount: false,
      };
  }
}

/** The "For" text in the list: the name, "(own account)" when it was the person's own. */
export function auditTargetText(entry: AuditLogEntry) {
  const target = auditTarget(entry);
  if (!target) return '';
  return target.ownAccount ? `${target.name} (own account)` : target.name;
}

const ACRONYMS = new Set(['id', 'ip', 'sms', 'ocr', 'rsbsa', 'url', 'ai']);

/** capital_change → "Capital change", amountPaid → "Amount paid". */
export function auditFieldLabel(key: string) {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[_\s]+/).filter(Boolean).map((word) => word.toLowerCase());
  if (!words.length) return key;
  const text = words.map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word)).join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A value kept with the entry as readable text; null when there is nothing to show. */
export function formatAuditValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return TIMESTAMP.test(value) ? formatDateTime(value) : value;
  if (Array.isArray(value)) {
    const lines = value.map((item) => formatAuditValue(item)).filter((line): line is string => line !== null);
    return lines.length ? lines.join('\n') : null;
  }
  if (typeof value === 'object') {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => { const text = formatAuditValue(nested); return text === null ? null : `${auditFieldLabel(key)}: ${text}`; })
      .filter((part): part is string => part !== null);
    return parts.length ? parts.join(', ') : null;
  }
  return String(value);
}

export interface AuditChange { field: string; label: string; before: string | null; after: string | null }

/**
 * What the entry kept: before and after for a change, the values of something
 * recorded, or of something removed. Fields that stayed the same are left out.
 */
export function auditChanges(entry: AuditLogEntry): { mode: 'changed' | 'recorded' | 'removed' | 'none'; rows: AuditChange[] } {
  const before = entry.old_values ?? {};
  const after = entry.new_values ?? {};
  const hasBefore = Object.keys(before).length > 0;
  const hasAfter = Object.keys(after).length > 0;
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const rows = fields
    .map((field) => ({ field, label: auditFieldLabel(field), before: formatAuditValue(before[field]), after: formatAuditValue(after[field]) }))
    .filter((row) => (row.before !== null || row.after !== null) && row.before !== row.after);
  if (!rows.length) return { mode: 'none', rows };
  return { mode: hasBefore && hasAfter ? 'changed' : hasAfter ? 'recorded' : 'removed', rows };
}

/** Anything else kept with the entry (the reason a sign-in failed, ...). */
export function auditExtraDetails(entry: AuditLogEntry) {
  return Object.entries(entry.details ?? {})
    .map(([field, value]) => ({ field, label: auditFieldLabel(field), value: formatAuditValue(value) }))
    .filter((row): row is { field: string; label: string; value: string } => row.value !== null);
}

/** member_dues_payment #12 → "Member dues payment #12". */
export function auditRecordLabel(entry: AuditLogEntry) {
  const type = entry.entity_type && entry.entity_type !== 'record' ? auditFieldLabel(entry.entity_type) : 'Record';
  return entry.entity_id != null && entry.entity_id !== '' ? `${type} #${entry.entity_id}` : type;
}

/** "Chrome on Android" from the browser's user agent; null when it is not a browser we know. */
export function auditDeviceLabel(userAgent: string | null | undefined) {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /SamsungBrowser\//.test(userAgent) ? 'Samsung Internet'
    : /Firefox\/|FxiOS\//.test(userAgent) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) && /Version\//.test(userAgent) ? 'Safari'
    : null;
  const system = /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent) ? 'iPhone or iPad'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X|Macintosh/.test(userAgent) ? 'Mac'
    : /CrOS/.test(userAgent) ? 'Chromebook'
    : /Linux/.test(userAgent) ? 'Linux'
    : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system;
}

export const AUDIT_STATUS_LABELS: Record<string, string> = { SUCCESS: 'Successful', FAILED: 'Failed', PENDING: 'Pending' };
