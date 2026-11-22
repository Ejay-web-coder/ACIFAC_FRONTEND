import { describe, expect, test } from 'vitest';
import { parseIdCardCode } from '../../src/app/services/idCardApi';
import { canScanCheckIn } from '../../src/app/services/attendanceApi';
import { qrModules, qrSvgPath } from '../../src/lib/qrCode';

const CODE = '7f3a9c0e1b2d4f6a8c0e2b4d6f8a0c1e';

describe('Member ID QR codes', () => {
  test('a scanned card gives the member\'s code, with or without "ACIFAC:", in any case', () => {
    expect(parseIdCardCode(`ACIFAC:${CODE.toUpperCase()}`)).toBe(CODE);
    expect(parseIdCardCode(` acifac:${CODE} `)).toBe(CODE);
    expect(parseIdCardCode(CODE)).toBe(CODE);
  });

  test('other QR codes are not member IDs', () => {
    expect(parseIdCardCode('https://example.com/pay')).toBeNull();
    expect(parseIdCardCode(`ACIFAC:${CODE.slice(2)}`)).toBeNull();
    expect(parseIdCardCode('')).toBeNull();
  });

  test('the card\'s QR is the compact 29 x 29 kind: "ACIFAC:" and the code in capitals', () => {
    expect(qrModules(`ACIFAC:${CODE.toUpperCase()}`)).toHaveLength(29);
    // In small letters the same text needs the larger 33 x 33 code.
    expect(qrModules(`ACIFAC:${CODE}`)).toHaveLength(33);
  });

  test('the SVG draws every dark square once, inside a light border', () => {
    const modules = qrModules('ACIFAC:TEST');
    const dark = modules.flat().filter(Boolean).length;
    const path = qrSvgPath(modules, 4);
    const drawn = [...path.matchAll(/h(\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0);
    expect(drawn).toBe(dark);
    expect(path.startsWith('M4 4')).toBe(true);
  });
});

describe('Scan check-in is open', () => {
  const activity = { status: 'scheduled' as const, final: false, activityDate: '2026-11-22', today: '2026-11-22' };
  test('on the day of the activity, before its attendance is final', () => {
    expect(canScanCheckIn(activity)).toBe(true);
  });
  test('not on another day, once final, or when cancelled', () => {
    expect(canScanCheckIn({ ...activity, today: '2026-11-23' })).toBe(false);
    expect(canScanCheckIn({ ...activity, final: true })).toBe(false);
    expect(canScanCheckIn({ ...activity, status: 'cancelled' })).toBe(false);
  });
});
