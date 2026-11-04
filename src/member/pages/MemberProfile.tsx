import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { User, Phone, MapPin, Calendar, CreditCard, PiggyBank, HandCoins, Wallet, Coins, Receipt, CalendarCheck, X } from 'lucide-react';
import { UserRole } from '../../app/App';
import { useMyMemberData } from '../../lib/useMyMemberData';
import { fetchProtectedImage } from '../../lib/profilePhoto';
import { DividendBreakdown, peso, percent, periodText, useMyDividend, YearSelect } from '../components/MemberDividend';
import { PatronageBreakdown } from '../components/MemberPatronageRefund';
import { sumMoney } from '../../utils/money';
import { formatDate } from '../../utils/dateTime';
import { ParticipationProfile } from '../../app/components/attendance/ParticipationProfile';
import { useIsMobile } from '../../app/components/ui/use-mobile';

interface MemberProfileProps {
  userRole: UserRole;
}

/** The member's own picture, else their 2x2 registration photo; null while loading or when there is none. */
function useMyPicture(enabled: boolean) {
  const [picture, setPicture] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let url: string | null = null;
    fetchProtectedImage('/api/members/me/documents/avatar')
      .then((result) => {
        if (cancelled) { if (result) URL.revokeObjectURL(result); return; }
        url = result;
        setPicture(result);
      })
      .catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [enabled]);
  return picture;
}

// Raised, glossy icon tiles for the phone menu: a gradient face, a hard edge underneath and a soft shadow.
const ICON_3D = {
  purple: 'from-violet-400 to-purple-700 shadow-[0_5px_0_#581c87,0_10px_16px_rgba(88,28,135,0.35)]',
  green: 'from-emerald-400 to-green-700 shadow-[0_5px_0_#14532d,0_10px_16px_rgba(20,83,45,0.35)]',
  blue: 'from-sky-400 to-blue-700 shadow-[0_5px_0_#1e3a8a,0_10px_16px_rgba(30,58,138,0.35)]',
  orange: 'from-amber-300 to-orange-600 shadow-[0_5px_0_#9a3412,0_10px_16px_rgba(154,52,18,0.35)]',
} as const;

function Icon3D({ icon: Icon, color, small = false }: { icon: ComponentType<{ className?: string }>; color: keyof typeof ICON_3D; small?: boolean }) {
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br ring-1 ring-inset ring-white/30 ${ICON_3D[color]} ${small ? 'h-10 w-10' : 'h-14 w-14'}`} aria-hidden="true">
      <span className="absolute inset-x-1.5 top-1 h-1/2 rounded-xl bg-gradient-to-b from-white/55 to-white/0" />
      <Icon className={`relative text-white drop-shadow-[0_2px_1px_rgba(0,0,0,0.35)] ${small ? 'h-5 w-5' : 'h-7 w-7'}`} />
    </span>
  );
}

type PanelKey = 'financial' | 'shares' | 'loans' | 'attendance';

export function MemberProfile({ userRole }: MemberProfileProps) {
  const { memberData, error } = useMyMemberData();
  const picture = useMyPicture(userRole === 'member');
  const [dividendYear, setDividendYear] = useState<number | undefined>(undefined);
  const { dividend, error: dividendError } = useMyDividend(dividendYear, userRole === 'member');
  // Phones: the four records are icons; one opens at a time in a sheet.
  const isMobile = useIsMobile();
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  useEffect(() => {
    if (!openPanel) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPanel]);

  if (userRole !== 'member') {
    return <div className="p-8">Access restricted to members only</div>;
  }

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!memberData) return <div className="p-8 text-sm text-gray-500">Loading your member data...</div>;

  const { member, loans, payments, shareDetails } = memberData;
  const address = [member.address, member.barangay, member.municipality, member.province].filter(Boolean).join(', ');
  const totalLoanBalance = sumMoney(loans.map((loan) => loan.balance));
  const money = (value: number) => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  /* Financial Summary: balances, this year's estimates and how they are computed */
  const financialSummary = (
    <section className="bg-white rounded-2xl p-4 sm:p-6 shadow-[var(--shadow-card)] border border-gray-200" aria-labelledby="financial-summary-title" id="financial-summary">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="financial-summary-title" className="text-lg font-bold text-gray-900">Financial Summary</h2>
          {dividend && <p className="mt-1 text-sm text-gray-600">Dividend and patronage refund estimates for {periodText(dividend)}</p>}
        </div>
        <YearSelect dividend={dividend} onYearChange={setDividendYear} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-blue-700">Share Capital</p>
          </div>
          <p className="text-2xl font-bold text-blue-900">
            ₱{member.share_capital.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5 text-green-600" />
            <p className="text-sm text-green-700">Savings Deposits</p>
          </div>
          <p className="text-2xl font-bold text-green-900">
            ₱{(memberData.savings?.total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="p-4 bg-purple-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <PiggyBank className="w-5 h-5 text-purple-600" />
            <p className="text-sm text-purple-700">Estimated Dividend</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-purple-900">{dividend ? peso(dividend.dividend) : ''}</p>
          {dividend && <p className="mt-1 text-xs text-purple-700">{percent(dividend.shareRatio)} of the dividend pool</p>}
        </div>

        <div className="p-4 bg-teal-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <HandCoins className="w-5 h-5 text-teal-600" />
            <p className="text-sm text-teal-700">Estimated Patronage Refund</p>
          </div>
          <p className="text-2xl font-bold tabular-nums text-teal-900">{dividend?.patronage ? peso(dividend.patronage.refund) : ''}</p>
          {dividend?.patronage && <p className="mt-1 text-xs text-teal-700">{percent(dividend.patronage.poolShare)} of the patronage refund pool</p>}
        </div>
      </div>

      {dividendError && <p className="mt-4 text-sm text-red-600" role="alert">{dividendError}</p>}
      {dividend && (
        <div className="mt-5 space-y-3">
          <DividendBreakdown dividend={dividend} />
          {dividend.patronage && <PatronageBreakdown dividend={dividend} patronage={dividend.patronage} />}
        </div>
      )}
    </section>
  );

  const sharePercent = shareDetails.maximum > 0 ? Math.min(100, (shareDetails.total / shareDetails.maximum) * 100) : 0;
  const shareContributions = (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 shadow-sm sm:p-6">
      {/* On phones the sheet's header already names it. */}
      {!isMobile && <h2 className="mb-4 text-lg font-bold text-green-900">Share History</h2>}
      {/* The total and how far it is to the maximum, then the maximum and what remains. */}
      <div className="rounded-xl bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Share Capital</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-green-700">{money(shareDetails.total)}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-green-100"><div className="h-full rounded-full bg-green-600" style={{ width: `${sharePercent}%` }} /></div>
        <p className="mt-1.5 text-xs text-gray-500">{Math.round(sharePercent)}% of the maximum</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Maximum</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{money(shareDetails.maximum)}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Remaining</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-blue-700">{money(shareDetails.remaining)}</dd></div>
        </dl>
      </div>
      <div className="mt-4">
        {/* Phones: one row per contribution, newest first as recorded. */}
        {shareDetails.contributions.length === 0
          ? <p className="rounded-xl border border-dashed border-green-200 bg-white p-4 text-center text-sm text-gray-500 md:hidden">No share contributions yet.</p>
          : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white md:hidden">
              {shareDetails.contributions.map((contribution) => (
                <li key={contribution.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-100 text-green-700" aria-hidden="true"><Coins className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{formatDate(contribution.contributionDate)}</p>
                    {(contribution.paymentMethod || contribution.referenceNumber) && (
                      <p className="truncate text-xs text-gray-500">{[contribution.paymentMethod, contribution.referenceNumber && `Ref. ${contribution.referenceNumber}`].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-green-700">+{money(contribution.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        <div className="hidden max-h-72 overflow-auto rounded-lg border border-green-100 md:block"><table className="min-w-full text-sm"><thead className="sticky top-0 bg-green-100"><tr><th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Amount</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Payment Method</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Reference</th></tr></thead><tbody className="divide-y divide-green-100">{shareDetails.contributions.map((contribution) => <tr key={contribution.id}><td className="px-3 py-2 whitespace-nowrap">{formatDate(contribution.contributionDate)}</td><td className="px-3 py-2 font-medium text-green-700">{money(contribution.amount)}</td><td className="px-3 py-2">{contribution.paymentMethod || ''}</td><td className="px-3 py-2">{contribution.referenceNumber || ''}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );

  const loanPayments = (
    <div className="rounded-lg border border-green-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Loan Payments</h2>
          <p className="mt-1 text-sm text-gray-600">Payments linked to your member record</p>
        </div>
        <span className="w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Active</span>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="col-span-2 rounded-lg bg-green-50 p-4 sm:col-span-1 sm:p-5">
          <div className="mb-2 flex items-center gap-2 text-green-700"><CreditCard className="h-5 w-5" /><p className="text-sm font-medium">Total Loan Balance</p></div>
          <p className="text-3xl font-bold text-green-900">{money(totalLoanBalance)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-4 sm:p-5"><p className="mb-2 text-sm font-medium text-gray-600">Last Payment</p><p className="text-xl font-bold text-gray-900 sm:text-2xl">{payments[0] ? `₱${Number(payments[0].amount).toLocaleString()}` : 'None'}</p></div>
        <div className="rounded-lg bg-gray-50 p-4 sm:p-5"><p className="mb-2 text-sm font-medium text-gray-600">Payments</p><p className="text-xl font-bold text-gray-900 sm:text-2xl">{payments.length}</p></div>
      </div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Recent Loan Payments</h3>
      {/* Phones: one card per payment. */}
      <ul className="space-y-2 md:hidden">
        {payments.slice(0, 5).map((payment) => (
          <li key={payment.id} className="rounded-lg border border-gray-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-gray-900">{formatDate(payment.paymentDate)}</p>
              <p className="font-semibold tabular-nums text-gray-900">{money(payment.amount)}</p>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">Remaining balance <span className="font-medium tabular-nums text-gray-900">{money(payment.remainingBalance)}</span></p>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Completed</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[560px]"><thead className="border-y border-gray-200 bg-gray-50"><tr>{['Date', 'Amount', 'Remaining Balance', 'Status'].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">{payments.slice(0, 5).map((payment) => <tr key={payment.id}><td className="px-4 py-3 text-sm text-gray-600">{formatDate(payment.paymentDate)}</td><td className="px-4 py-3 text-sm font-semibold text-gray-900">{money(payment.amount)}</td><td className="px-4 py-3 text-sm text-gray-900">{money(payment.remainingBalance)}</td><td className="px-4 py-3"><span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Completed</span></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );

  const panels: Array<{ key: PanelKey; title: string; note: string; icon: ComponentType<{ className?: string }>; color: keyof typeof ICON_3D; body: ReactNode }> = [
    { key: 'financial', title: 'Financial Summary', note: dividend ? `Dividend ${peso(dividend.dividend)}` : 'Dividend & refund', icon: Wallet, color: 'purple', body: financialSummary },
    { key: 'shares', title: 'Share History', note: money(shareDetails.total), icon: Coins, color: 'green', body: shareContributions },
    { key: 'loans', title: 'Loan Payments', note: `Balance ${money(totalLoanBalance)}`, icon: Receipt, color: 'blue', body: loanPayments },
    { key: 'attendance', title: 'My Activity Attendance', note: 'Meetings & trainings', icon: CalendarCheck, color: 'orange', body: <ParticipationProfile variant="member" /> },
  ];
  const open = isMobile ? panels.find((panel) => panel.key === openPanel) : undefined;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-gray-600 mt-1">View your personal and membership information</p>
      </div>

      {/* Profile Overview */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
        <div className="flex items-start gap-6">
          {picture ? (
            <img src={picture} alt={`${member.full_name}'s picture`} className="h-28 w-28 shrink-0 rounded-full border border-gray-200 object-cover" />
          ) : (
            <div className="shrink-0 p-6 bg-blue-50 rounded-full">
              <User className="w-16 h-16 text-blue-600" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{member.full_name}</h2>
            <p className="text-gray-600 mt-1">Member ID: {member.member_number || member.id}</p>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Personal Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Phone className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Phone Number</p>
              <p className="font-medium text-gray-900">{member.phone || 'Not provided'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <MapPin className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Address</p>
              <p className="font-medium text-gray-900">{address || 'Not provided'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Calendar className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Member Since</p>
              <p className="font-medium text-gray-900">{formatDate(member.membership_date)}</p>
            </div>
          </div>
        </div>
      </div>

      {isMobile ? (
        <nav aria-label="My records" className="grid grid-cols-2 gap-3">
          {panels.map((panel) => (
            <button key={panel.key} type="button" onClick={() => setOpenPanel(panel.key)}
              className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 pb-4 pt-5 text-center shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] active:scale-[0.98]">
              <Icon3D icon={panel.icon} color={panel.color} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight text-gray-900">{panel.title}</span>
                <span className="mt-1 block truncate text-xs tabular-nums text-gray-500">{panel.note}</span>
              </span>
            </button>
          ))}
        </nav>
      ) : panels.map((panel) => <div key={panel.key}>{panel.body}</div>)}

      {open && (
        <div className="acf-modal fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50" role="dialog" aria-modal="true" aria-label={open.title} onClick={() => setOpenPanel(null)}>
          <div className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-gray-50" onClick={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
              <Icon3D icon={open.icon} color={open.color} small />
              <p className="min-w-0 flex-1 truncate font-bold text-gray-900">{open.title}</p>
              <button type="button" onClick={() => setOpenPanel(null)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{open.body}</div>
          </div>
        </div>
      )}

      {/* Contact Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-bold text-blue-900 mb-2">Need to Update Your Information?</h3>
        <p className="text-sm text-blue-800">
          To update your personal information, please visit the ACIFAC office during business hours
          or contact us at <span className="font-medium">info@acifac.org</span> or{' '}
          <span className="font-medium">+63 XXX XXX XXXX</span>
        </p>
      </div>
    </div>
  );
}
