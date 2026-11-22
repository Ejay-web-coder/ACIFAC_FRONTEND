import { useEffect, type ReactNode } from 'react';
import { ArrowRight, UserCheck, UserPen, X } from 'lucide-react';
import type { AuditLogEntry } from '../services/authApi';
import { formatDateTime } from '../../utils/dateTime';
import {
  AUDIT_ROLE_LABELS, AUDIT_STATUS_LABELS, auditActorName, auditChanges, auditDeviceLabel, auditExtraDetails, auditRecordLabel, auditTarget,
} from './auditLogDetails';

const CHANGE_HEADINGS = { changed: 'What changed', recorded: 'What was recorded', removed: 'What was removed', none: '' } as const;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function Person({ icon: Icon, label, name, lines, muted }: { icon: typeof UserPen; label: string; name: string; lines: string[]; muted?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className={`mt-1 break-words text-[15px] font-semibold ${muted ? 'font-normal text-gray-500' : 'text-gray-900'}`}>{name}</p>
      {lines.map((line) => <p key={line} className="break-words text-xs text-gray-600">{line}</p>)}
    </div>
  );
}

/** Everything one audit log entry kept: who did it, who it was for, when, from where, and what changed. */
export function AuditLogDetailsModal({ entry, onClose }: { entry: AuditLogEntry; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const target = auditTarget(entry);
  const changes = auditChanges(entry);
  const extra = auditExtraDetails(entry);
  const device = auditDeviceLabel(entry.user_agent);
  const failed = entry.status === 'FAILED';
  const actorLines = [
    entry.user_position,
    entry.user_full_name && entry.user_name_snapshot ? `Username: ${entry.user_name_snapshot}` : null,
    AUDIT_ROLE_LABELS[entry.user_role_snapshot ?? ''] ?? null,
  ].filter((line): line is string => Boolean(line));
  const targetLines = target ? [target.note, target.ownAccount ? 'Their own account' : null].filter((line): line is string => Boolean(line)) : ['The action is not about one person.'];

  return (
    <div className="acf-modal fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="audit-log-detail-title" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 md:px-6">
          <div className="min-w-0">
            <span className={`inline-block max-w-full break-all rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${failed ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>{entry.action}</span>
            <h2 id="audit-log-detail-title" className="mt-1.5 text-lg font-bold text-gray-900">Audit log #{entry.id}</h2>
            <p className="text-xs text-gray-500">{entry.created_at ? formatDateTime(entry.created_at) : 'Unknown time'}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close details">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 md:px-6">
          {entry.description && <p className="text-sm text-gray-900">{entry.description}</p>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Person icon={UserPen} label="Done by" name={auditActorName(entry)} lines={actorLines} />
            <Person icon={UserCheck} label="For" name={target ? target.name : 'No particular person'} lines={targetLines} muted={!target} />
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Fact label="Result"><span className={failed ? 'font-semibold text-red-700' : ''}>{AUDIT_STATUS_LABELS[entry.status] ?? entry.status}</span></Fact>
            <Fact label="Module">{entry.module || 'System'}</Fact>
            <Fact label="Record">{auditRecordLabel(entry)}</Fact>
            <Fact label="IP address">{entry.ip_address || <span className="text-gray-500">Not recorded</span>}</Fact>
            <Fact label="Device">
              {device ?? (entry.user_agent ? null : <span className="text-gray-500">Not recorded</span>)}
              {entry.user_agent && <span className={`block text-xs text-gray-500 ${device ? 'mt-0.5' : ''}`}>{entry.user_agent}</span>}
            </Fact>
          </dl>

          {changes.mode !== 'none' && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900">{CHANGE_HEADINGS[changes.mode]}</h3>
              <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
                {changes.rows.map((row) => (
                  <li key={row.field} className="px-3 py-2">
                    <p className="text-xs font-medium text-gray-500">{row.label}</p>
                    {changes.mode === 'changed' ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                        <span className="whitespace-pre-line break-words text-gray-500">{row.before ?? 'none'}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="changed to" />
                        <span className="whitespace-pre-line break-words font-medium text-gray-900">{row.after ?? 'none'}</span>
                      </div>
                    ) : (
                      <p className="mt-0.5 whitespace-pre-line break-words text-sm text-gray-900">{row.after ?? row.before}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {extra.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900">Other details</h3>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {extra.map((row) => <Fact key={row.field} label={row.label}><span className="whitespace-pre-line">{row.value}</span></Fact>)}
              </dl>
            </section>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-100 px-4 py-3 md:px-6">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
