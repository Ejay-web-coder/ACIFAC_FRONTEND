import { describe, expect, test } from 'vitest'
import { anniversary, certificateSigners, givenOn, groupByTier, matchesSearch, nextMilestone, numberInWords, ordinalDay, tierOf, yearsPhrase } from '../../src/admin/components/loyalty/loyaltyTiers'
import type { LoyaltyMember } from '../../src/admin/services/membersApi'

const member = (id: number, years: number, membershipDate = '2010-06-01', name = `Member ${id}`): LoyaltyMember => ({
  id, years, membershipDate, name, memberNumber: `ACIFAC-${id}`, barangay: '', municipality: '',
})

describe('Loyalty awards (loyaltyTiers)', () => {
  test('members are grouped as 15+, 10 to 14, 5 to 9 and under 5 years', () => {
    expect([0, 4, 5, 9, 10, 14, 15, 32].map((years) => tierOf(years).key)).toEqual(['under', 'under', '5', '5', '10', '10', '15', '15'])
    const groups = groupByTier([member(1, 22), member(2, 3), member(3, 10), member(4, 5), member(5, 16)])
    expect(groups.map(({ tier, members }) => [tier.label, members.map((m) => m.id)])).toEqual([
      ['15+ years', [1, 5]], ['10–14 years', [3]], ['5–9 years', [4]], ['Under 5 years', [2]],
    ])
    expect(groups.map(({ tier }) => tier.award)).toEqual(['15-Year Loyalty Award', '10-Year Loyalty Award', '5-Year Loyalty Award', null])
  })

  test('every group is listed even when empty', () => {
    expect(groupByTier([]).map(({ members }) => members.length)).toEqual([0, 0, 0, 0])
  })

  test('the next award is 5, 10 or 15 years, on the membership anniversary', () => {
    expect(nextMilestone({ membershipDate: '2023-03-04', years: 3 })).toEqual({ years: 5, date: '2028-03-04' })
    expect(nextMilestone({ membershipDate: '2014-08-20', years: 12 })).toEqual({ years: 15, date: '2029-08-20' })
    expect(nextMilestone({ membershipDate: '2004-03-04', years: 22 })).toBeNull()
  })

  test('edge case: a 29 February membership reaches its anniversary on 1 March in common years', () => {
    expect(anniversary('2024-02-29', 5)).toBe('2029-03-01')
    expect(anniversary('2024-02-29', 4)).toBe('2028-02-29')
  })

  test('the certificate words the years and the day', () => {
    expect(yearsPhrase(5)).toBe('five (5) years')
    expect(yearsPhrase(22)).toBe('twenty-two (22) years')
    expect(yearsPhrase(1)).toBe('one (1) year')
    expect([0, 13, 40, 99].map(numberInWords)).toEqual(['zero', 'thirteen', 'forty', 'ninety-nine'])
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinalDay)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'])
    expect(givenOn('2026-11-19')).toBe('19th day of November 2026')
  })

  test('search matches the name or the member ID, ignoring case', () => {
    const juan = member(7, 12, '2014-01-01', 'Juan Dela Cruz')
    expect(matchesSearch(juan, 'dela')).toBe(true)
    expect(matchesSearch(juan, 'acifac-7')).toBe(true)
    expect(matchesSearch(juan, '  ')).toBe(true)
    expect(matchesSearch(juan, 'santos')).toBe(false)
  })

  test('the Board Chairperson and the General Manager sign; a vacant position leaves the line blank', () => {
    const entries = [
      { group: 'bod' as const, role: 'Vice Chairperson', name: 'Pedro Reyes' },
      { group: 'bod' as const, role: 'Chairperson', name: ' Maria Santos ' },
      { group: 'manager' as const, role: 'General Manager', name: '' },
    ]
    expect(certificateSigners(entries)).toEqual({ chairperson: 'Maria Santos', manager: '' })
  })
})
