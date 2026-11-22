// Member ID cards. The QR on a card holds only "ACIFAC:" and the member's random
// code (no name or phone number); reissuing a card gives a new code, so the old
// card stops working. The office prints cards and looks members up by scanning
// them; a member shows their own card's QR on their phone.
import { apiGet, apiPost } from '../../lib/api';

export interface IdCard {
  memberId: number;
  name: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  memberNumber: string;
  /** The membership date (YYYY-MM-DD). */
  memberSince: string;
  status: 'active' | 'inactive' | 'suspended' | 'archived';
  /** The member's code; qr is what the QR holds. */
  token: string;
  qr: string;
  /** When the code (the card) was issued. */
  issuedAt: string;
  /** Where the 2x2 photo is downloaded (with the session); null without one. */
  photo: string | null;
}

/** The member a scanned card belongs to. */
export interface ScannedMember {
  id: number;
  memberNumber: string;
  name: string;
  status: string;
  membershipDate: string;
  hasPhoto: boolean;
}

const QR_PREFIX = 'ACIFAC:';

/** The member's code in what a scanner read ("ACIFAC:<code>"), lower case; null when it is not an ACIFAC member ID (the server reads it the same way). */
export function parseIdCardCode(text: string) {
  let value = String(text ?? '').trim();
  if (value.toUpperCase().startsWith(QR_PREFIX)) value = value.slice(QR_PREFIX.length).trim();
  value = value.toLowerCase();
  return /^[0-9a-f]{32}$/.test(value) ? value : null;
}

export const NOT_A_MEMBER_ID = 'This QR code is not an ACIFAC member ID.';

export const fetchMemberIdCard = (memberId: number) => apiGet<{ success: boolean; data: IdCard }>(`/api/members/${memberId}/id-card`);
export const fetchMyIdCard = () => apiGet<{ success: boolean; data: IdCard }>('/api/members/me/id-card');

export interface IdCardFilters {
  search?: string;
  joinedFrom?: string;
  joinedTo?: string;
  /** active: active members only; all: every member whose membership was not terminated. */
  status?: 'active' | 'all';
}

/** Several members' cards for the batch print, by name (at most `limit`; total is how many match). */
export function fetchMemberIdCards(filters: IdCardFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value));
  return apiGet<{ success: boolean; data: IdCard[]; total: number; limit: number }>(`/api/members/id-cards${params.toString() ? `?${params}` : ''}`);
}

/** A new code for a lost or damaged card: the old card stops working. */
export const reissueMemberIdCard = (memberId: number, reason: string) =>
  apiPost<{ success: boolean; message: string; data: IdCard }>(`/api/members/${memberId}/id-card/reissue`, { reason });

/** The member whose card was scanned (code from parseIdCardCode). */
export const findMemberByQr = (code: string) => apiGet<{ success: boolean; data: ScannedMember }>(`/api/members/by-qr/${encodeURIComponent(code)}`);
