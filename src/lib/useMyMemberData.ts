import { useCallback, useEffect, useState } from 'react';
import { fetchMyMemberData, type MyMemberData } from '../app/services/authApi';
import { useLiveRefresh } from './liveUpdates';

// The signed-in member's own record, loans, payments, savings and rentals,
// refreshed automatically when any of them change.
export function useMyMemberData() {
  const [memberData, setMemberData] = useState<MyMemberData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchMyMemberData()
      .then((data) => { setMemberData(data); setError(''); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load member data.'));
  }, []);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['members', 'loans', 'loan_payments', 'loan_requests', 'share_contributions', 'rental_requests', 'machinery_operations'], load);

  return { memberData, error, reload: load };
}
