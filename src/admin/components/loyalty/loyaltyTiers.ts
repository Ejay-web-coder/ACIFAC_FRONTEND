// Loyalty awards: active members grouped by the full years of membership they
// have completed on the award date (counted from the membership date, the
// "Member Since" on their record). 5, 10 and 15 years earn an award; members
// under 5 years are listed with the day they reach 5.
import type { OrgChartEntry } from '../../../app/services/orgChartApi';
import type { LoyaltyMember } from '../../services/membersApi';

export type LoyaltyTierKey = '15' | '10' | '5' | 'under';

export interface LoyaltyTier {
  key: LoyaltyTierKey;
  label: string;
  /** The fewest full years of membership in the group. */
  min: number;
  /** The award the group earns; none under 5 years. */
  award: string | null;
}

/** Longest membership first, as the report lists them. */
export const LOYALTY_TIERS: LoyaltyTier[] = [
  { key: '15', label: '15+ years', min: 15, award: '15-Year Loyalty Award' },
  { key: '10', label: '10–14 years', min: 10, award: '10-Year Loyalty Award' },
  { key: '5', label: '5–9 years', min: 5, award: '5-Year Loyalty Award' },
  { key: 'under', label: 'Under 5 years', min: 0, award: null },
];

export const LOYALTY_MILESTONES = [5, 10, 15];

/**
 * A loyalty award needs good standing over the 12 months up to the award date:
 * attendance at the activities the member had to attend, and loans paid on time.
 * A member whose standing is not known (an older report) counts as in good standing.
 */
export const inGoodStanding = (member: Pick<LoyaltyMember, 'standing'>) => member.standing?.goodStanding !== false;
export const ATTENDANCE_CHOICES = [0, 50, 75, 90];
export const standingRule = (minAttendance: number) => (minAttendance > 0
  ? `attended at least ${minAttendance}% of the meetings and activities they had to attend, and paid loans on time (no overdue loan, no late penalty)`
  : 'paid loans on time (no overdue loan, no late penalty)');

export function tierOf(years: number): LoyaltyTier {
  return LOYALTY_TIERS.find((tier) => years >= tier.min) ?? LOYALTY_TIERS[LOYALTY_TIERS.length - 1];
}

/** Every group, in report order, with its members (empty groups included). */
export function groupByTier(members: LoyaltyMember[]) {
  return LOYALTY_TIERS.map((tier) => ({ tier, members: members.filter((member) => tierOf(member.years).key === tier.key) }));
}

/**
 * The day `years` after a date (YYYY-MM-DD). A membership that began on
 * 29 February reaches its anniversary on 1 March in common years, as the
 * server counts years.
 */
export function anniversary(date: string, years: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year + years, month - 1, day)).toISOString().slice(0, 10);
}

/** The next award a member reaches (5, 10 or 15 years) and the day; none from 15 years on. */
export function nextMilestone(member: Pick<LoyaltyMember, 'membershipDate' | 'years'>) {
  const years = LOYALTY_MILESTONES.find((milestone) => milestone > member.years);
  return years ? { years, date: anniversary(member.membershipDate, years) } : null;
}

export function matchesSearch(member: LoyaltyMember, search: string) {
  const text = search.trim().toLowerCase();
  return !text || member.name.toLowerCase().includes(text) || member.memberNumber.toLowerCase().includes(text);
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberInWords(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 99) return String(value);
  if (value < 20) return ONES[value];
  return TENS[Math.floor(value / 10)] + (value % 10 ? `-${ONES[value % 10]}` : '');
}

/** "twenty-two (22) years", as the certificate words it. */
export function yearsPhrase(years: number) {
  return `${numberInWords(years)} (${years}) ${years === 1 ? 'year' : 'years'}`;
}

export function ordinalDay(day: number) {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`;
  return `${day}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th'}`;
}

/** "19th day of November 2026", for "Given this … at …". */
export function givenOn(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en-PH', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
  return `${ordinalDay(day)} day of ${monthName} ${year}`;
}

/** Who signs the certificates. */
export interface CertificateSigners {
  chairperson: string;
  manager: string;
}

/** The Board Chairperson and the General Manager named on the organizational chart (blank if vacant). */
export function certificateSigners(entries: Pick<OrgChartEntry, 'group' | 'role' | 'name'>[]): CertificateSigners {
  const named = (group: OrgChartEntry['group'], role: RegExp) => entries.find((entry) => entry.group === group && role.test(entry.role.trim()) && entry.name.trim())?.name.trim() ?? '';
  return { chairperson: named('bod', /^chair/i), manager: named('manager', /^general manager/i) };
}
