import { ActivityLog, type ActivityView } from '../../member/pages/ActivityLog';
import { fetchVendorActivity } from '../../member/services/activityApi';

// The Kadiwa vendor's activity log: sign-ins, the sales they sent, and what the
// office did (confirmed or rejected a sale, changed the account). The same page
// as the member's, with the vendor's own quick views.
const VENDOR_VIEWS: ActivityView[] = [
  { value: 'everything', label: 'Everything', short: 'Everything', filters: {} },
  { value: 'signins', label: 'Sign-ins and account', short: 'Sign-ins', filters: { category: 'security' } },
  { value: 'sales', label: 'My sales', short: 'My sales', filters: { category: 'sales' } },
  { value: 'office', label: 'By the office', short: 'By the office', filters: { actor: 'office' } },
  { value: 'failed', label: 'Failed attempts', short: 'Failed attempts', filters: { status: 'FAILED' } },
];

export function VendorActivity() {
  return <ActivityLog fetcher={fetchVendorActivity} views={VENDOR_VIEWS} subtitle={null} />;
}
