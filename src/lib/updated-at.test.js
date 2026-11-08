import { hasExpectedUpdatedAt, sameUpdatedAt } from '@/lib/updated-at';

describe('updated-at', () => {
  test('sameUpdatedAt compares trimmed strings', () => {
    expect(sameUpdatedAt(' 2026-01-01 10:00:00 ', '2026-01-01 10:00:00')).toBe(true);
    expect(sameUpdatedAt('2026-01-01', '2026-01-02')).toBe(false);
    expect(sameUpdatedAt(null, undefined)).toBe(true);
  });

  test('hasExpectedUpdatedAt ignores blank values', () => {
    expect(hasExpectedUpdatedAt(undefined)).toBe(false);
    expect(hasExpectedUpdatedAt('   ')).toBe(false);
    expect(hasExpectedUpdatedAt('2026-01-01')).toBe(true);
  });
});
