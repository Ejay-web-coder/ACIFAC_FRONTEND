import { describe, expect, test } from 'vitest'
import { CONDITION_LABELS, isBagUnit, rateLabel, seasonForDate, UNIT_LABELS } from '../../src/app/services/machineryApi'

describe('Machinery rates shown in the web application (rateLabel)', () => {
  test('a per-hectare rate is shown in pesos per hectare', () => {
    expect(rateLabel('per_ha', 3800)).toBe('₱3,800.00/ha')
  })

  test('a per-day rate is shown in pesos per day', () => {
    expect(rateLabel('per_day', 800)).toBe('₱800.00/day')
  })

  test('a harvest rate is shown in bags per 100 bags', () => {
    expect(rateLabel('per_100_bags', 10)).toBe('10 bags per 100')
    expect(rateLabel('per_100_bags', 12.5)).toBe('12.5 bags per 100')
  })

  test('a wet-season harvest rate is shown in bags per hectare', () => {
    expect(rateLabel('bags_per_ha', 4)).toBe('4 bags per ha')
    expect(rateLabel('bags_per_ha', 4.5)).toBe('4.5 bags per ha')
  })

  test('the harvest season follows the date: June to November is the wet season', () => {
    expect(['2026-05-31', '2026-06-01', '2026-11-30', '2026-12-01'].map(seasonForDate)).toEqual(['dry', 'wet', 'wet', 'dry'])
    expect([isBagUnit('per_100_bags'), isBagUnit('bags_per_ha'), isBagUnit('per_ha'), isBagUnit(null)]).toEqual([true, true, false, false])
  })

  test('every rate unit and machine condition has a label', () => {
    expect(UNIT_LABELS).toEqual({ per_ha: 'per hectare', per_100_bags: 'bags per 100 bags', per_day: 'per day', bags_per_ha: 'bags per hectare' })
    expect(Object.values(CONDITION_LABELS).every((label) => label.length > 0)).toBe(true)
  })

  test('edge case: a zero rate still shows its unit', () => {
    expect(rateLabel('per_ha', 0)).toBe('₱0.00/ha')
  })
})
