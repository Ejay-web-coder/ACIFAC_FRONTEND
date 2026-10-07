import { useState } from 'react';
import { UserX, X } from 'lucide-react';
import type { InvoluntaryCause, MemberTermination, TerminationType } from '../services/membersApi';

// Termination of membership as worded in the by-laws. The involuntary causes
// follow the Philippine Cooperative Code (RA 9520, Art. 30).
export const TERMINATION_TYPES: Array<{ value: TerminationType; letter: string; title: string; short: string; text: string }> = [
  {
    value: 'automatic', letter: 'a', title: 'Automatic Termination of Membership', short: 'Automatic',
    text: 'The death or insanity of a member shall be considered an automatic termination of his/her membership in the Cooperative. Provided, however, that in case of death or insanity of a member of the Cooperative, the next-of-kin shall assume the duties and responsibilities of the original member.',
  },
  {
    value: 'voluntary', letter: 'b', title: 'Voluntary Termination', short: 'Voluntary',
    text: 'A member may, for any valid reason, withdraw his/her membership from the Cooperative by giving a sixty (60) day notice to the Board of Directors.',
  },
  {
    value: 'involuntary', letter: 'c', title: 'Involuntary Termination', short: 'Involuntary',
    text: 'A member may be terminated by a vote of the majority of all the members of the Board of Directors for any of the following causes:',
  },
];

export const INVOLUNTARY_CAUSES: Array<{ value: InvoluntaryCause; short: string; text: string }> = [
  { value: 'noPatronage', short: 'Did not patronize the services', text: 'Has not patronized any of the services of the Cooperative for an unreasonable period of time as previously determined by the Board of Directors.' },
  { value: 'failedObligations', short: 'Failed to comply with obligations', text: 'Has continuously failed to comply with his/her obligations.' },
  { value: 'violatedBylaws', short: 'Violated the By-laws or rules', text: 'Has acted in violation of the By-laws and the rules of the Cooperative.' },
  { value: 'injuriousAct', short: 'Act injurious to the Cooperative', text: 'Any act or omission injurious or prejudicial to the interest or the welfare of the Cooperative.' },
];

/** "Involuntary: Failed to comply with obligations", "Voluntary", or "" when not recorded. */
export function terminationSummary(termination?: MemberTermination | null) {
  const type = TERMINATION_TYPES.find((option) => option.value === termination?.type);
  if (!type) return '';
  const cause = INVOLUNTARY_CAUSES.find((option) => option.value === termination?.cause);
  return cause ? `${type.short}: ${cause.short}` : type.short;
}

const RADIO = 'mt-1 h-4 w-4 shrink-0 accent-red-600';

/** Asks which kind of termination (and, for an involuntary one, which cause) before the membership is terminated. */
export function TerminationModal({ memberName, submitting, onCancel, onConfirm }: {
  memberName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (termination: { type: TerminationType; cause?: InvoluntaryCause }) => void;
}) {
  const [type, setType] = useState<TerminationType | null>(null);
  const [cause, setCause] = useState<InvoluntaryCause | null>(null);
  const ready = Boolean(type && (type !== 'involuntary' || cause));

  return (
    <div className="acf-modal fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="termination-title">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="termination-title" className="text-xl font-bold text-gray-900">Termination of Membership</h2>
            <p className="mt-0.5 text-sm text-gray-600">{memberName}</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close termination window"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold text-gray-800">Choose the kind of termination:</legend>
            {TERMINATION_TYPES.map((option) => {
              const selected = type === option.value;
              return (
                <div key={option.value} className={`rounded-xl border p-3 ${selected ? 'border-red-300 bg-red-50/60' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="radio" name="termination-type" className={RADIO} checked={selected} onChange={() => { setType(option.value); if (option.value !== 'involuntary') setCause(null); }} />
                    <span className="text-sm text-gray-700">
                      <span className="font-semibold text-gray-900">{option.letter}. {option.title}.</span> {option.text}
                    </span>
                  </label>
                  {option.value === 'involuntary' && selected && (
                    <fieldset className="ml-7 mt-3 space-y-2 border-l-2 border-red-200 pl-3">
                      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-800">Cause</legend>
                      {INVOLUNTARY_CAUSES.map((item, index) => (
                        <label key={item.value} className={`flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm ${cause === item.value ? 'bg-white ring-1 ring-red-200' : 'hover:bg-white'}`}>
                          <input type="radio" name="termination-cause" className={RADIO} checked={cause === item.value} onChange={() => setCause(item.value)} />
                          <span className="text-gray-700"><span className="font-semibold text-gray-900">{index + 1}.</span> {item.text}</span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                </div>
              );
            })}
          </fieldset>
          <p className="text-xs text-gray-500">The member moves to Terminated Members. Their records and transaction history are kept, and the Separation date on their membership form is set to today.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-200">Cancel</button>
          <button
            type="button"
            disabled={!ready || submitting}
            onClick={() => { if (type) onConfirm(type === 'involuntary' && cause ? { type, cause } : { type }); }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserX className="h-4 w-4" />{submitting ? 'Terminating…' : 'Terminate Membership'}
          </button>
        </div>
      </div>
    </div>
  );
}
