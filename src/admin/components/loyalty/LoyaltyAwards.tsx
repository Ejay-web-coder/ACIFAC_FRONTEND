// Loyalty Awards on the Members page: active members grouped by the full years
// of membership completed on the award date (5, 10 and 15+ years earn an
// award), with a printable certificate for one member or a whole group, and
// the report as a PDF.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Award, CalendarClock, CheckCircle2, FileDown, Medal, Printer, RotateCcw, Search, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ListSkeleton, Pagination, SectionCard, StatCard } from '../../../app/components/common/UiKit';
import { usePagination } from '../../../app/components/common/usePagination';
import { fetchOrgChart } from '../../../app/services/orgChartApi';
import { errorMessage } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/liveUpdates';
import { dateOnlyToday, formatDate, isDateOnly } from '../../../utils/dateTime';
import { fetchLoyaltyReport, type LoyaltyMember } from '../../services/membersApi';
import { ATTENDANCE_CHOICES, certificateSigners, groupByTier, inGoodStanding, matchesSearch, nextMilestone, standingRule, type CertificateSigners, type LoyaltyTier } from './loyaltyTiers';

const TIER_LOOK: Record<LoyaltyTier['key'], { icon: typeof Award; tone: 'dark' | 'green' | 'soft' | 'warning' }> = {
  '15': { icon: Trophy, tone: 'dark' },
  '10': { icon: Medal, tone: 'green' },
  '5': { icon: Award, tone: 'soft' },
  under: { icon: Users, tone: 'warning' },
};

const inputClass = 'mt-1 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900';

export function LoyaltyAwards() {
  const [awardDate, setAwardDate] = useState(dateOnlyToday());
  // Good standing: the share of required activities attended in the last 12 months.
  const [minAttendance, setMinAttendance] = useState(75);
  // The members and the date they were counted to (always loaded together).
  const [report, setReport] = useState<{ asOf: string; minAttendance?: number; members: LoyaltyMember[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [signers, setSigners] = useState<CertificateSigners>({ chairperson: '', manager: '' });
  const [printing, setPrinting] = useState<string | null>(null);
  const latestRequest = useRef(0);

  const load = async (asOf = awardDate, attendance = minAttendance) => {
    if (!isDateOnly(asOf)) return;
    const request = ++latestRequest.current;
    setIsLoading(true);
    setLoadError(false);
    try {
      const { data } = await fetchLoyaltyReport(asOf, attendance);
      if (request === latestRequest.current) setReport(data);
    } catch (error) {
      console.error('Load loyalty awards failed:', error);
      if (request === latestRequest.current) setLoadError(true);
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(awardDate, minAttendance); }, 300);
    return () => window.clearTimeout(timeout);
  }, [awardDate, minAttendance]);

  // New, updated or terminated members change the groups.
  useLiveRefresh(['members'], () => { void load(); }, 800);

  // The certificates are signed by the Board Chairperson and the General Manager on the organizational chart.
  useEffect(() => {
    let cancelled = false;
    fetchOrgChart()
      .then((chart) => {
        if (cancelled) return;
        const found = certificateSigners(chart.entries);
        setSigners((current) => ({ chairperson: current.chairperson || found.chairperson, manager: current.manager || found.manager }));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const allGroups = useMemo(() => groupByTier(report?.members ?? []), [report]);
  const shownGroups = useMemo(() => groupByTier((report?.members ?? []).filter((member) => matchesSearch(member, search))), [report, search]);
  // Only members in good standing receive an award.
  const awardees = allGroups.filter(({ tier }) => tier.award).reduce((sum, group) => sum + group.members.filter(inGoodStanding).length, 0);
  const heldBack = allGroups.filter(({ tier }) => tier.award).reduce((sum, group) => sum + group.members.filter((member) => !inGoodStanding(member)).length, 0);

  const run = async (key: string, task: () => Promise<void>, failure: string) => {
    setPrinting(key);
    try {
      await task();
    } catch (error) {
      toast.error(errorMessage(error, failure));
    } finally {
      setPrinting(null);
    }
  };
  const printCertificates = (members: LoyaltyMember[], key: string, fileName: string) => {
    if (!report) return;
    void run(key, () => (import('./loyaltyPdf')).then(({ downloadLoyaltyCertificates }) => downloadLoyaltyCertificates(members, report.asOf, signers, fileName)), 'Unable to make the certificate.');
  };
  const printReport = () => {
    if (!report) return;
    void run('report', () => (import('./loyaltyPdf')).then(({ downloadLoyaltyReportPdf }) => downloadLoyaltyReportPdf(report.members, report.asOf, report.minAttendance ?? minAttendance)), 'Unable to make the report.');
  };

  const showSkeleton = isLoading && !report;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Loyalty Awards"
        description={`Active members grouped by full years of membership, counted from their membership date to the award date. 5, 10 and 15 years earn a loyalty award for members in good standing: in the 12 months before the award date they ${standingRule(minAttendance)}.`}
        actions={(
          <button type="button" onClick={printReport} disabled={!report || printing !== null}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <FileDown className="h-4 w-4" />{printing === 'report' ? 'Preparing…' : 'Download report'}
          </button>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="block text-sm font-medium text-gray-700">
            Award date
            <input type="date" value={awardDate} onChange={(event) => setAwardDate(event.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-gray-500">{isDateOnly(awardDate) ? 'Years are counted to this day; certificates are dated this day.' : 'Choose the award date.'}</span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Attendance needed
            <select value={minAttendance} onChange={(event) => setMinAttendance(Number(event.target.value))} className={inputClass}>
              {ATTENDANCE_CHOICES.map((value) => <option key={value} value={value}>{value ? `At least ${value}%` : 'Not required'}</option>)}
            </select>
            <span className="mt-1 block text-xs font-normal text-gray-500">Of the activities each member had to attend in the last 12 months</span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Board Chairperson
            <input value={signers.chairperson} onChange={(event) => setSigners((current) => ({ ...current, chairperson: event.target.value }))} maxLength={80} placeholder="Name on the certificate" className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-gray-500">Signs the certificates</span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            General Manager
            <input value={signers.manager} onChange={(event) => setSigners((current) => ({ ...current, manager: event.target.value }))} maxLength={80} placeholder="Name on the certificate" className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-gray-500">Signs the certificates</span>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Find a member
            <span className="relative mt-1 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or member ID" className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900" />
            </span>
          </label>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {allGroups.map(({ tier, members }) => (
          <StatCard key={tier.key} label={tier.label} value={members.length.toLocaleString('en-PH')} icon={TIER_LOOK[tier.key].icon} tone={TIER_LOOK[tier.key].tone}
            detail={tier.award ?? 'Not yet eligible'} loading={showSkeleton}
            onClick={() => document.getElementById(`loyalty-${tier.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        ))}
      </div>
      {report && !loadError && (
        <p className="-mt-3 text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{awardees.toLocaleString('en-PH')}</span> of {report.members.length.toLocaleString('en-PH')} active members qualify for a loyalty award as of {formatDate(report.asOf)}.
          {heldBack > 0 && <> {heldBack.toLocaleString('en-PH')} more {heldBack === 1 ? 'has' : 'have'} the years but {heldBack === 1 ? 'is' : 'are'} not in good standing.</>}
        </p>
      )}

      {showSkeleton && <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><ListSkeleton rows={5} /></div>}
      {!isLoading && loadError && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-red-700">Unable to load the loyalty awards. Please try again.</p>
          <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"><RotateCcw className="h-4 w-4" />Retry</button>
        </div>
      )}
      {report && !loadError && (
        <div className={`space-y-6 transition-opacity ${isLoading ? 'opacity-60' : ''}`} aria-busy={isLoading}>
          {shownGroups.map(({ tier, members }) => (
            <TierSection key={tier.key} tier={tier} members={members} searching={Boolean(search.trim())} resetKey={`${search}|${report.asOf}`}
              printing={printing} onPrint={printCertificates} />
          ))}
        </div>
      )}
    </div>
  );
}

// Good standing, or why not (attendance, late or overdue loan payments).
function Standing({ member }: { member: LoyaltyMember }) {
  if (!member.standing) return null;
  if (member.standing.goodStanding) {
    return <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Good standing{member.standing.attendanceRate !== null ? ` · ${member.standing.attendanceRate}% attendance` : ''}</span>;
  }
  return (
    <span className="mt-0.5 block text-xs text-amber-800">
      <span className="inline-flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Not in good standing</span>
      <span className="block max-w-[22rem] text-amber-700">{member.standing.reasons.join('; ')}</span>
    </span>
  );
}

function TierSection({ tier, members, searching, resetKey, printing, onPrint }: {
  tier: LoyaltyTier;
  members: LoyaltyMember[];
  searching: boolean;
  resetKey: string;
  printing: string | null;
  onPrint: (members: LoyaltyMember[], key: string, fileName: string) => void;
}) {
  const pages = usePagination(members, { resetKey });
  const eligible = Boolean(tier.award);
  // Certificates are printed for members in good standing only.
  const qualified = members.filter(inGoodStanding);
  const groupKey = `group-${tier.key}`;
  const busy = printing !== null;
  const printOne = (member: LoyaltyMember) => onPrint([member], `member-${member.id}`, `Loyalty Certificate - ${member.name}`);
  const Icon = TIER_LOOK[tier.key].icon;

  return (
    <div id={`loyalty-${tier.key}`} className="scroll-mt-24">
      <SectionCard
        bodyClassName="p-0"
        title={(
          <span className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-green-700" aria-hidden="true" />
            {tier.label}
            <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800 ring-1 ring-green-200">{members.length}</span>
          </span>
        )}
        description={tier.award ?? 'Not yet eligible. Each member is shown with the day they reach 5 years.'}
        actions={eligible && qualified.length > 0 ? (
          <button type="button" disabled={busy} onClick={() => onPrint(qualified, groupKey, `Loyalty Certificates - ${tier.award}`)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50">
            <Printer className="h-4 w-4" />{printing === groupKey ? 'Preparing…' : `Print ${qualified.length === 1 ? 'certificate' : `all ${qualified.length} certificates`}`}
          </button>
        ) : undefined}
      >
        {members.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500 sm:px-5">{searching ? 'No member in this group matches your search.' : eligible ? `No active member has reached ${tier.min} years yet.` : 'Every active member has reached 5 years.'}</p>
        ) : (
          <>
            {/* Phones and small tablets */}
            <ul className="divide-y divide-gray-100 lg:hidden">
              {pages.pageItems.map((member) => {
                const next = nextMilestone(member);
                return (
                  <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-green-100 text-green-800">
                      <span className="text-base font-bold leading-none tabular-nums">{member.years}</span>
                      <span className="text-[10px] font-semibold uppercase leading-tight">{member.years === 1 ? 'year' : 'years'}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-gray-900">{member.name}</span>
                      <span className="block truncate text-sm text-gray-500">{member.memberNumber}</span>
                      <span className="block text-xs text-gray-500">Member since {formatDate(member.membershipDate, true)}</span>
                      {next && <span className="block text-xs text-green-700">{next.years} years on {formatDate(next.date, true)}</span>}
                      <Standing member={member} />
                    </span>
                    {eligible && inGoodStanding(member) && (
                      <button type="button" disabled={busy} onClick={() => printOne(member)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-green-700 hover:bg-green-50 disabled:opacity-50" aria-label={`Print the loyalty certificate of ${member.name}`} title="Print certificate">
                        <Printer className="h-5 w-5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Desktops */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr className="border-b border-gray-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Member</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Member Since</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Years</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Next Award</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Standing</th>
                    {eligible && <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Certificate</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pages.pageItems.map((member) => {
                    const next = nextMilestone(member);
                    return (
                      <tr key={member.id} className="hover:bg-green-50/40">
                        <td className="px-5 py-3">
                          <div className="max-w-[20rem] truncate font-semibold text-gray-900">{member.name}</div>
                          <div className="text-gray-500">{member.memberNumber}</div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-gray-900">{formatDate(member.membershipDate)}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-gray-900">{member.years}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-gray-600">
                          {next ? <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-gray-400" aria-hidden="true" />{next.years} years on {formatDate(next.date, true)}</span> : 'Highest award reached'}
                        </td>
                        <td className="px-5 py-3"><Standing member={member} /></td>
                        {eligible && (
                          <td className="whitespace-nowrap px-5 py-3 text-right">
                            <button type="button" disabled={busy || !inGoodStanding(member)} title={inGoodStanding(member) ? undefined : 'Not in good standing'} onClick={() => printOne(member)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50" aria-label={`Print the loyalty certificate of ${member.name}`}>
                              <Printer className="h-4 w-4" />{printing === `member-${member.id}` ? 'Preparing…' : 'Certificate'}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label="members" />
          </>
        )}
      </SectionCard>
    </div>
  );
}
