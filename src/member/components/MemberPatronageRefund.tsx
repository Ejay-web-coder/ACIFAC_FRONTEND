import { Info } from 'lucide-react';
import type { MemberDividend, MemberPatronageRefund } from '../../app/services/authApi';
import { ComputationToggle, Formula, peso, Rows, Step } from './MemberDividend';

const points = (value: number, decimals = 0) => value.toLocaleString('en-PH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
/** Business points have centavos: 1 point per ₱100 -> two decimals. */
const businessPoints = (value: number) => points(value, 2);

const ACTIVITIES = [
  ['meeting', 'Meetings'],
  ['community_development', 'Community development activities'],
  ['education_training', 'Educational and training activities'],
] as const;

/** How the member's patronage refund is computed, step by step, with their numbers (shown on request). */
export function PatronageBreakdown({ dividend, patronage }: { dividend: MemberDividend; patronage: MemberPatronageRefund }) {
  const { weights, rules } = patronage;
  const pool = dividend.patronageRefundPool;
  const onePart = pool > 0 && weights.business !== 70 ? (
    weights.business === 100 ? `No member has participation points for ${dividend.year} yet, so the whole pool is shared by business points.`
      : weights.participation === 100 ? `No member has business points for ${dividend.year} yet, so the whole pool is shared by participation points.`
        : `No member has business or participation points for ${dividend.year} yet.`
  ) : '';
  return (
    <div className="space-y-3">
      {pool <= 0 && (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />The cooperative has no net surplus for {dividend.year} yet, so the Patronage Refund Pool is empty.</p>
      )}
      {onePart && (
        <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><Info className="mt-0.5 h-4 w-4 shrink-0" />{onePart}</p>
      )}

      <ComputationToggle id="my-patronage-steps" label="your patronage refund">
        <Step number={1} title="Your Business Points">
          <Rows rows={[
            ['Machinery rental and service fees', patronage.business.machinery],
            ['Loan interest paid', patronage.business.loans],
            ['Your Total Business', patronage.business.total, 'total'],
          ]} />
          <Formula worked={`= ${peso(patronage.business.total)} ÷ ₱${rules.pesosPerBusinessPoint} = ${businessPoints(patronage.businessPoints)} points`}>
            Business Points = Your Total Business ÷ ₱{rules.pesosPerBusinessPoint}
          </Formula>
          <p className="text-xs text-gray-500">Kadiwa Store purchases are not counted yet: store sales are recorded as daily totals, without the buyer.</p>
        </Step>

        <Step number={2} title="Your Participation Points">
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr><th className="px-3 py-2">Activity</th><th className="px-3 py-2 text-right">Attended</th><th className="px-3 py-2 text-right">Points</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {ACTIVITIES.map(([key, label]) => (
                  <tr key={key}>
                    <td className="px-3 py-2">{label}<span className="block text-xs text-gray-500">{rules.activityPoints[key]} points each</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{points(patronage.attended[key])}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{points(patronage.attended[key] * rules.activityPoints[key])}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold text-gray-900">
                  <td className="px-3 py-2" colSpan={2}>Participation Points</td>
                  <td className="px-3 py-2 text-right tabular-nums">{points(patronage.participationPoints)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">Activities you attended (present or late) once the office has finalized their attendance.</p>
        </Step>

        <Step number={3} title="Your Patronage Refund">
          <Formula worked={`= ${peso(pool)} × ${weights.business}% = ${peso(patronage.businessPool)}`}>
            Business Part = Patronage Refund Pool × {weights.business}%
          </Formula>
          <Formula worked={`= ${peso(pool)} × ${weights.participation}% = ${peso(patronage.participationPool)}`}>
            Participation Part = Patronage Refund Pool × {weights.participation}%
          </Formula>
          <Formula worked={patronage.totalBusinessPoints > 0
            ? `= ${peso(patronage.businessPool)} × ${businessPoints(patronage.businessPoints)} ÷ ${businessPoints(patronage.totalBusinessPoints)} = ${peso(patronage.businessRefund)}`
            : `= ${peso(0)} (no member has business points yet)`}>
            From Business = Business Part × Your Business Points ÷ All Members&apos; Business Points
          </Formula>
          <Formula worked={patronage.totalParticipationPoints > 0
            ? `= ${peso(patronage.participationPool)} × ${points(patronage.participationPoints)} ÷ ${points(patronage.totalParticipationPoints)} = ${peso(patronage.participationRefund)}`
            : `= ${peso(0)} (no member has participation points yet)`}>
            From Participation = Participation Part × Your Participation Points ÷ All Members&apos; Participation Points
          </Formula>
          <Formula worked={`= ${peso(patronage.businessRefund)} + ${peso(patronage.participationRefund)} = ${peso(patronage.refund)}`}>
            Your Patronage Refund = From Business + From Participation
          </Formula>
          <p className="text-xs text-gray-500">All members&apos; points are the points of every current member for the same period.</p>
        </Step>

        <p className="flex gap-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          This is an estimate from the cooperative&apos;s records{dividend.yearComplete ? '' : ' so far this year'}. The actual patronage refund is approved by the General Assembly after the year&apos;s financial statements are audited.
        </p>
      </ComputationToggle>
    </div>
  );
}
