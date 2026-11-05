import { ParticipationProfile } from '../../app/components/attendance/ParticipationProfile';

// The member's own attendance at ACIFAC activities (moved here from My Profile).
export function MemberAttendance() {
  return (
    <div className="mx-auto max-w-7xl">
      <ParticipationProfile variant="member" />
    </div>
  );
}
