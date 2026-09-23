import { useEffect, useState } from 'react';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, TrendingUp, AlertTriangle, X } from 'lucide-react';
import { UserRole } from '../../app/App';
import { fetchAnalytics, type AnalyticsData } from '../../app/services/authApi';
import { toast } from 'sonner';

const COLORS = ['#2563eb', '#059669', '#d97706'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface AnalyticsProps { userRole: UserRole; }

function dateKey(year: number, month: number, day: number) {
  // Date accepts day 0 as the final day of the preceding month. This is used
  // by getPeriod for the end of a month/quarter, while avoiding invalid URLs
  // such as 2026-10-00.
  const value = new Date(year, month, day);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function getPeriod(range: 'month' | 'quarter' | 'year', month: number, year: number) {
  if (range === 'year') return { from: dateKey(year, 0, 1), to: dateKey(year, 11, 31) };
  if (range === 'quarter') {
    const quarterStart = Math.floor(month / 3) * 3;
    return { from: dateKey(year, quarterStart, 1), to: dateKey(year, quarterStart + 3, 0) };
  }
  return { from: dateKey(year, month, 1), to: dateKey(year, month + 1, 0) };
}

function formatCurrency(value: number) {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function downloadCsv(data: AnalyticsData) {
  const rows = [
    ['Metric', 'Value'],
    ['Period', `${data.period.from} to ${data.period.to}`],
    ['Active Members', data.summary.activeMembers],
    ['New Members', data.summary.newMembers],
    ['Operating Revenue', data.summary.totalOperatingRevenue],
    ['Loan Payments', data.summary.loanPayments],
    ['Interest Collected', data.summary.interestCollected],
    ['Share Capital Contributions', data.summary.shareCapital],
    ['Machinery Revenue', data.summary.machineryRevenue],
    ['Kadiwa Net Sales', data.summary.kadiwaNetSales],
    ['Outstanding Loan Balance', data.summary.outstandingBalance],
    ['Overdue Loans', data.summary.overdueLoans],
    ['Loan Applications', data.summary.loanApplications],
    ['Pending Applications', data.summary.pendingLoanApplications],
    ['Requested Loan Amount', data.summary.requestedLoanAmount],
    ['Maximum Eligible Amount', data.summary.maximumEligibleAmount],
    ['Projected Repayment', data.summary.projectedRepayment],
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `acifac-analytics-${data.period.from}-to-${data.period.to}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function Analytics({ userRole: _userRole }: AnalyticsProps) {
  const today = new Date();
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year'>('month');
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Re-runs the analytics query only when underlying records change (no polling).
  useLiveRefresh(['members', 'loans', 'loan_payments', 'loan_requests', 'share_contributions', 'machinery_operations', 'kadiwa_sales'], () => setRefreshKey((key) => key + 1), 2000);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<AnalyticsData['memberAnalytics'][number] | null>(null);
  const [section, setSection] = useState<'system' | 'member'>('system');

  const period = getPeriod(dateRange, selectedMonth, selectedYear);
  const periodLabel = dateRange === 'month'
    ? `${monthNames[selectedMonth]} ${selectedYear}`
    : dateRange === 'quarter'
      ? `Q${Math.floor(selectedMonth / 3) + 1} ${selectedYear}`
      : `Year ${selectedYear}`;

  useEffect(() => {
    let active = true;

    const loadAnalytics = (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      fetchAnalytics(period.from, period.to)
        .then((nextData) => {
          if (active) setData(nextData);
        })
        .catch((error) => {
          if (active) toast.error(error instanceof Error ? error.message : 'Unable to load analytics.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    loadAnalytics(refreshKey === 0);

    return () => {
      active = false;
    };
  }, [period.from, period.to, refreshKey]);

  const summary = data?.summary;
  const empty = loading ? 'Loading...' : '₱0';
  const systemCards: Array<[string, string | number, string]> = [
    ['Operating Revenue', summary ? formatCurrency(summary.totalOperatingRevenue) : empty, 'Interest + machinery + Kadiwa'],
    ['Active Members', summary ? summary.activeMembers.toLocaleString() : loading ? 'Loading...' : '0', summary ? `+${summary.newMembers} in period` : 'No data'],
    ['Loan Payments', summary ? formatCurrency(summary.loanPayments) : empty, summary ? `${summary.paymentToOutstandingRate}% paid vs outstanding` : 'No data'],
    ['Outstanding Balance', summary ? formatCurrency(summary.outstandingBalance) : empty, summary ? `${summary.overdueLoans} overdue loan(s)` : 'No data'],
    ['Total Outstanding Loans', summary ? formatCurrency(summary.outstandingBalance) : empty, 'Active and overdue balances'],
    ['Loan Applications', summary ? summary.loanApplications.toLocaleString() : loading ? 'Loading...' : '0', summary ? `${summary.pendingLoanApplications} pending review` : 'No data'],
    ['Requested Amount', summary ? formatCurrency(summary.requestedLoanAmount) : empty, 'Applications submitted in period'],
    ['Projected Repayment', summary ? formatCurrency(summary.projectedRepayment) : empty, 'Includes approved or pending application estimates'],
  ];
  const memberCards: Array<[string, string | number, string]> = [
    ['Members with Good Repayment Records', data ? data.memberAnalytics.filter((member) => ['Excellent', 'Good'].includes(member.repaymentRating)).length : empty, 'Excellent or Good rating'],
    ['Top Share Holder', data?.memberAnalytics[0]?.memberName || (loading ? 'Loading...' : 'No data'), data?.memberAnalytics[0] ? formatCurrency(data.memberAnalytics[0].shareCapital) : 'No data'],
    ['Total Share Capital', data ? formatCurrency(data.memberAnalytics.reduce((total, member) => total + member.shareCapital, 0)) : empty, 'All active members'],
    ['Members Recommended for Loan Review', data ? data.memberAnalytics.filter((member) => ['Strong', 'Good'].includes(member.assessment)).length : empty, 'Decision support only'],
  ];
  const revenue = data?.revenue || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div><p className="mt-1 text-gray-600">Live cooperative performance for {periodLabel}</p></div>
        <div className="flex flex-wrap gap-2">
          <select value={dateRange} onChange={(event) => setDateRange(event.target.value as typeof dateRange)} className="rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="month">By Month</option><option value="quarter">By Quarter</option><option value="year">By Year</option></select>
          {dateRange === 'month' && <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-2">{monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}</select>}
          {dateRange === 'quarter' && <select value={Math.floor(selectedMonth / 3) * 3} onChange={(event) => setSelectedMonth(Number(event.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-2">{[0, 3, 6, 9].map((index) => <option key={index} value={index}>Q{index / 3 + 1}</option>)}</select>}
          <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-2">{[selectedYear - 2, selectedYear - 1, selectedYear, selectedYear + 1].map((year) => <option key={year} value={year}>{year}</option>)}</select>
          <button onClick={() => data && downloadCsv(data)} disabled={!data || loading} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /> Export CSV</button>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Analytics sections">
        <button type="button" role="tab" aria-selected={section === 'system'} onClick={() => setSection('system')} className={`rounded-md px-4 py-2 text-sm font-medium ${section === 'system' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>System Analytics</button>
        <button type="button" role="tab" aria-selected={section === 'member'} onClick={() => setSection('member')} className={`rounded-md px-4 py-2 text-sm font-medium ${section === 'member' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Member Analytics</button>
      </div>

      {summary && summary.overdueLoans > 0 && <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="h-5 w-5" /><span>{summary.overdueLoans} loan(s) are overdue with {formatCurrency(summary.outstandingBalance)} currently outstanding.</span></div>}
      {section === 'system' && <>
        <SectionHeading title="System Analytics" description="Cooperative-wide financial, membership, sales, and machinery performance." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{systemCards.map(([label, value, detail]) => <MetricCard key={label} label={label} value={value} detail={detail} />)}</div>
        {summary && summary.overdueLoans > 0 && <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="h-5 w-5" /><span>{summary.overdueLoans} loan(s) are overdue with {formatCurrency(summary.outstandingBalance)} currently outstanding.</span></div>}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartPanel title="New Memberships"><LineChart data={data?.membership || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="members" name="Members" stroke="#2563eb" strokeWidth={2} /></LineChart></ChartPanel>
          <ChartPanel title="Loan Disbursement"><BarChart data={data?.loans || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="amount" name="Amount" fill="#059669" /></BarChart></ChartPanel>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-bold text-gray-900">Operating Revenue Breakdown</h2><div className="h-[300px]">{revenue.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={revenue} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${String(name ?? '')}: ${(Number(percent ?? 0) * 100).toFixed(0)}%`}>{revenue.map((entry, index) => <Cell key={entry.category} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatCurrency(Number(value))} /></PieChart></ResponsiveContainer> : <EmptyState loading={loading} />}</div></div>
          <ChartPanel title="Kadiwa Net Sales"><LineChart data={data?.sales || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Legend /><Line type="monotone" dataKey="sales" name="Net sales" stroke="#d97706" strokeWidth={2} /><Line type="monotone" dataKey="expenses" name="Expenses" stroke="#dc2626" strokeWidth={2} /></LineChart></ChartPanel>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-bold text-gray-900">Machinery Revenue and Usage</h2>{data?.machinery.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b text-gray-500"><th className="pb-3">Machinery</th><th className="pb-3">Operations</th><th className="pb-3">Days</th><th className="pb-3 text-right">Revenue</th></tr></thead><tbody>{(data?.machinery || []).map((machine) => <tr key={machine.name} className="border-b last:border-0"><td className="py-3 font-medium text-gray-900">{machine.name}</td><td className="py-3">{machine.operations}</td><td className="py-3">{machine.days}</td><td className="py-3 text-right font-medium">{formatCurrency(machine.revenue)}</td></tr>)}</tbody></table></div> : <EmptyState loading={loading} />}</div>
      </>}
      {section === 'member' && <>
        <SectionHeading title="Member Analytics" description="Member repayment performance, share ownership, and loan-capacity decision support." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{memberCards.map(([label, value, detail]) => <MetricCard key={label} label={label} value={value} detail={detail} />)}</div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ChartPanel title="Loan Repayment Performance"><BarChart data={data?.repaymentRatings || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="rating" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="members" name="Members" fill="#2563eb" /></BarChart></ChartPanel>
          <ChartPanel title="Largest Share Holders"><BarChart data={(data?.memberAnalytics || []).slice(0, 5)} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="memberName" width={90} /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="shareCapital" name="Share capital" fill="#059669" /></BarChart></ChartPanel>
          <ChartPanel title="Loan Capacity Recommendation (rule-based)"><BarChart data={data?.loanCapacity || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="assessment" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="members" name="Members" fill="#d97706" /></BarChart></ChartPanel>
        </div>
        <AnalyticsMembers members={data?.memberAnalytics || []} loading={loading} onSelect={setSelectedMember} />
      </>}

      {false && <><div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartPanel title="New Memberships"><LineChart data={data?.membership || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="members" name="Members" stroke="#2563eb" strokeWidth={2} /></LineChart></ChartPanel>
        <ChartPanel title="Loan Disbursement"><BarChart data={data?.loans || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="amount" name="Amount" fill="#059669" /></BarChart></ChartPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartPanel title="Loan Repayment Performance"><BarChart data={data?.repaymentRatings || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="rating" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="members" name="Members" fill="#2563eb" /></BarChart></ChartPanel>
        <ChartPanel title="Largest Share Holders"><BarChart data={(data?.memberAnalytics || []).slice(0, 5)} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="memberName" width={90} /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="shareCapital" name="Share capital" fill="#059669" /></BarChart></ChartPanel>
        <ChartPanel title="Loan Capacity Recommendation (rule-based)"><BarChart data={data?.loanCapacity || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="assessment" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="members" name="Members" fill="#d97706" /></BarChart></ChartPanel>
      </div>

      <AnalyticsMembers members={data?.memberAnalytics || []} loading={loading} onSelect={setSelectedMember} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-bold text-gray-900">Operating Revenue Breakdown</h2><div className="h-[300px]">{data?.revenue.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data?.revenue || []} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${String(name ?? '')}: ${(Number(percent ?? 0) * 100).toFixed(0)}%`}>{(data?.revenue || []).map((entry, index) => <Cell key={entry.category} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatCurrency(Number(value))} /></PieChart></ResponsiveContainer> : <EmptyState loading={loading} />}</div></div>
        <ChartPanel title="Kadiwa Net Sales"><LineChart data={data?.sales || []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Legend /><Line type="monotone" dataKey="sales" name="Net sales" stroke="#d97706" strokeWidth={2} /><Line type="monotone" dataKey="expenses" name="Expenses" stroke="#dc2626" strokeWidth={2} /></LineChart></ChartPanel>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-bold text-gray-900">Machinery Revenue and Usage</h2>{data?.machinery.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b text-gray-500"><th className="pb-3">Machinery</th><th className="pb-3">Operations</th><th className="pb-3">Days</th><th className="pb-3 text-right">Revenue</th></tr></thead><tbody>{(data?.machinery || []).map((machine) => <tr key={machine.name} className="border-b last:border-0"><td className="py-3 font-medium text-gray-900">{machine.name}</td><td className="py-3">{machine.operations}</td><td className="py-3">{machine.days}</td><td className="py-3 text-right font-medium">{formatCurrency(machine.revenue)}</td></tr>)}</tbody></table></div> : <EmptyState loading={loading} />}</div></>}
      {selectedMember && <MemberDetail member={selectedMember} onClose={() => setSelectedMember(null)} />}
    </div>
  );
}

function AnalyticsMembers({ members, loading, onSelect }: { members: AnalyticsData['memberAnalytics']; loading: boolean; onSelect: (member: AnalyticsData['memberAnalytics'][number]) => void }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><div className="mb-4"><h2 className="text-lg font-bold text-gray-900">Loan Repayment Performance</h2><p className="text-sm text-gray-500">Select a member to review repayment history and decision-support notes.</p></div>{members.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-gray-500"><th className="pb-3">Member</th><th className="pb-3">Member ID</th><th className="pb-3">Completed Loans</th><th className="pb-3">On-Time Rate</th><th className="pb-3">Outstanding</th><th className="pb-3">Rating</th></tr></thead><tbody>{members.map((member) => <tr key={member.databaseId} onClick={() => onSelect(member)} className="cursor-pointer border-b last:border-0 hover:bg-gray-50"><td className="py-3 font-medium text-gray-900">{member.memberName || 'Unknown Member'}</td><td className="py-3">{member.memberId || '—'}</td><td className="py-3">{member.completedLoans}</td><td className="py-3">{member.paymentCount ? `${member.onTimePaymentRate}%` : 'Insufficient data'}</td><td className="py-3">{formatCurrency(member.outstandingBalance)}</td><td className="py-3">{member.repaymentRating}</td></tr>)}</tbody></table></div> : <EmptyState loading={loading} />}</div>;
}

function MemberDetail({ member, onClose }: { member: AnalyticsData['memberAnalytics'][number]; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="dialog" aria-modal="true" aria-label="Member analytics details"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold text-gray-900">{member.memberName}</h2><p className="text-sm text-gray-500">Member ID: {member.memberId || '—'}</p></div><button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close member details"><X className="h-5 w-5" /></button></div><div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4"><Detail label="Share Capital" value={formatCurrency(member.shareCapital)} /><Detail label="Savings" value={formatCurrency(member.savings)} /><Detail label="Completed Loans" value={String(member.completedLoans)} /><Detail label="Active Loans" value={String(member.activeLoans)} /><Detail label="Total Borrowed" value={formatCurrency(member.totalBorrowed)} /><Detail label="Total Paid" value={formatCurrency(member.totalPaid)} /><Detail label="Outstanding" value={formatCurrency(member.outstandingBalance)} /><Detail label="On-Time Rate" value={member.paymentCount ? `${member.onTimePaymentRate}%` : 'Insufficient data'} /></div><div className="mt-6 rounded-lg border border-gray-200 p-4"><h3 className="font-semibold text-gray-900">Loan Capacity Recommendation (rule-based)</h3><p className="mt-2 text-sm"><strong>Assessment:</strong> {member.assessment}</p><p className="mt-1 text-sm"><strong>Recommendation:</strong> {member.recommendation}</p>{member.reasons.length > 0 && <><p className="mt-3 text-sm font-semibold">Why this member was recommended:</p><ul className="mt-1 list-disc pl-5 text-sm text-gray-600">{member.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></>}</div><div className="mt-6"><h3 className="mb-3 font-semibold text-gray-900">Loan History</h3>{member.loanHistory.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-gray-500"><th className="pb-2">Loan</th><th className="pb-2">Status</th><th className="pb-2">Borrowed</th><th className="pb-2">Paid</th><th className="pb-2">Balance</th></tr></thead><tbody>{member.loanHistory.map((loan) => <tr key={loan.id} className="border-b last:border-0"><td className="py-2">{loan.loanNumber}</td><td className="py-2">{loan.status}</td><td className="py-2">{formatCurrency(Number(loan.amount))}</td><td className="py-2">{formatCurrency(Number(loan.totalPaid))}</td><td className="py-2">{formatCurrency(Number(loan.balance))}</td></tr>)}</tbody></table></div> : <p className="text-sm text-gray-500">Insufficient data</p>}</div></div></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-gray-500">{label}</p><p className="mt-1 font-semibold text-gray-900">{value}</p></div>; }

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-xl font-bold text-gray-900">{title}</h2><p className="mt-1 text-sm text-gray-600">{description}</p></div>;
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-2 flex items-center justify-between"><p className="text-sm text-gray-600">{label}</p><TrendingUp className="h-4 w-4 text-green-600" /></div><p className="text-2xl font-bold text-gray-900">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>;
}

function ChartPanel({ title, children }: { title: string; children: React.ReactElement }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></div>;
}

function EmptyState({ loading }: { loading: boolean }) { return <div className="flex h-full items-center justify-center text-sm text-gray-500">{loading ? 'Loading live data...' : 'No data for this period.'}</div>; }
