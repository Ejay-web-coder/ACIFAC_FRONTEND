import { describe, expect, test } from 'vitest'
import type { AuditLogEntry } from '../../src/app/services/authApi'
import {
  auditActorName, auditChanges, auditDeviceLabel, auditExtraDetails, auditFieldLabel, auditRecordLabel, auditTarget, auditTargetText, formatAuditValue,
} from '../../src/app/components/auditLogDetails'

const entry = (overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 1, user_id: 7, user_name_snapshot: 'treasurer', user_full_name: 'Maria Santos', user_position: 'Treasurer', user_role_snapshot: 'ADMIN',
  action: 'PAYMENT_CREATED', module: 'Payments', entity_type: 'loan_payment', entity_id: '12', description: 'Recorded payment for loan LN-0001',
  old_values: {}, new_values: {}, target_user_id: null, ip_address: '127.0.0.1', status: 'SUCCESS', created_at: '2026-11-22T01:00:00Z',
  ...overrides,
})

describe('Audit log details: who the action was for', () => {
  test('a member is named with the member number', () => {
    const row = entry({ target_name: 'Juan Dela Cruz', target_member_number: 'ACF-0012', target_kind: 'member' })
    expect(auditTarget(row)).toEqual({ name: 'Juan Dela Cruz', note: 'Member ACF-0012', ownAccount: false })
    expect(auditTargetText(row)).toBe('Juan Dela Cruz')
  })

  test('an action on the account of whoever did it is their own account', () => {
    const row = entry({ action: 'LOGIN_SUCCESS', entity_type: 'user', entity_id: '7', target_name: 'Maria Santos', target_account_id: 7, target_role: 'ADMIN', target_kind: 'account' })
    expect(auditTarget(row)).toEqual({ name: 'Maria Santos', note: 'Administrator', ownAccount: true })
    expect(auditTargetText(row)).toBe('Maria Santos (own account)')
  })

  test('a non-member client, a buyer and an announcement audience', () => {
    expect(auditTarget(entry({ entity_type: 'rental_request', target_name: 'Rosa Reyes', target_kind: 'name' }))?.note).toBe('Not a member, by name only')
    expect(auditTarget(entry({ entity_type: 'machinery_bag_sale', target_name: 'Mang Ben', target_kind: 'name' }))?.note).toBe('Buyer, by name only')
    expect(auditTarget(entry({ entity_type: 'announcement', target_name: 'Members Only', target_kind: 'audience' }))?.name).toBe('Members only')
  })

  test('an action that is not about one person has no one', () => {
    expect(auditTarget(entry({ entity_type: 'machinery', target_name: null }))).toBeNull()
    expect(auditTargetText(entry({ target_name: '  ' }))).toBe('')
  })

  test('whoever did it: full name, else username, else System', () => {
    expect(auditActorName(entry())).toBe('Maria Santos')
    expect(auditActorName(entry({ user_full_name: null }))).toBe('treasurer')
    expect(auditActorName(entry({ user_full_name: null, user_name_snapshot: null, user_id: null }))).toBe('System')
  })
})

describe('Audit log details: what the entry kept', () => {
  test('a change shows before and after, leaving out what stayed the same', () => {
    const { mode, rows } = auditChanges(entry({ old_values: { balance: '5000.00', status: 'active' }, new_values: { balance: '4000.00', status: 'active', amount: '1000.00' } }))
    expect(mode).toBe('changed')
    expect(rows).toEqual([
      { field: 'balance', label: 'Balance', before: '5000.00', after: '4000.00' },
      { field: 'amount', label: 'Amount', before: null, after: '1000.00' },
    ])
  })

  test('something recorded or removed has only one side', () => {
    expect(auditChanges(entry({ new_values: { client_name: 'Rosa Reyes' } })).mode).toBe('recorded')
    expect(auditChanges(entry({ old_values: { client_name: 'Rosa Reyes' } })).mode).toBe('removed')
    expect(auditChanges(entry()).mode).toBe('none')
  })

  test('values are written for people: yes/no, lists, nested records, Manila times', () => {
    expect(formatAuditValue(true)).toBe('Yes')
    expect(formatAuditValue(null)).toBeNull()
    expect(formatAuditValue([{ name: 'Rice', quantity: 2 }, { name: 'Eggs', quantity: 1 }])).toBe('Name: Rice, Quantity: 2\nName: Eggs, Quantity: 1')
    expect(formatAuditValue('2026-11-10T20:00:00Z')).toMatch(/Nov(ember)? 11, 2026/)
    expect(formatAuditValue('2026-11-11')).toBe('2026-11-11')
  })

  test('field and record names read as words', () => {
    expect(auditFieldLabel('capital_change')).toBe('Capital change')
    expect(auditFieldLabel('amountPaid')).toBe('Amount paid')
    expect(auditFieldLabel('member_id')).toBe('Member ID')
    expect(auditRecordLabel(entry({ entity_type: 'member_dues_payment', entity_id: '12' }))).toBe('Member dues payment #12')
    expect(auditRecordLabel(entry({ entity_type: 'org_chart', entity_id: null }))).toBe('Org chart')
  })

  test('other details and the device', () => {
    expect(auditExtraDetails(entry({ details: { reason: 'wrong_password', empty: '' } }))).toEqual([{ field: 'reason', label: 'Reason', value: 'wrong_password' }])
    expect(auditDeviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome on Android')
    expect(auditDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge on Windows')
    expect(auditDeviceLabel('node-fetch')).toBeNull()
  })
})
