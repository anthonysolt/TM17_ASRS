import {
  describeDateRange,
  formatDateRange,
  getReportDateRange,
  hasInvalidDateRange,
  isDateRangeActive,
} from '@/lib/report-date-range';

describe('report-date-range', () => {
  test('hasInvalidDateRange only flags a From date after the To date', () => {
    expect(hasInvalidDateRange({ startDate: '2026-04-01', endDate: '2026-03-31' })).toBe(true);
    expect(hasInvalidDateRange({ startDate: '2026-03-31', endDate: '2026-03-31' })).toBe(false);
    expect(hasInvalidDateRange({ startDate: '2026-03-01' })).toBe(false);
    expect(hasInvalidDateRange()).toBe(false);
  });

  test('isDateRangeActive is true when either end is set', () => {
    expect(isDateRangeActive({ startDate: '2026-01-01' })).toBe(true);
    expect(isDateRangeActive({ endDate: '2026-01-01' })).toBe(true);
    expect(isDateRangeActive({ startDate: '', endDate: '' })).toBe(false);
    expect(isDateRangeActive(null)).toBe(false);
  });

  test('formatDateRange covers both ends, one end and none', () => {
    expect(formatDateRange({ startDate: '2026-01-01', endDate: '2026-03-31' })).toBe('Jan 1, 2026 – Mar 31, 2026');
    expect(formatDateRange({ startDate: '2026-01-01' })).toBe('on or after Jan 1, 2026');
    expect(formatDateRange({ endDate: '2026-03-31' })).toBe('on or before Mar 31, 2026');
    expect(formatDateRange({})).toBe('All dates');
  });

  test('formatDateRange shows a malformed date as given', () => {
    expect(formatDateRange({ startDate: 'soon' })).toBe('on or after soon');
  });

  test('describeDateRange reads as a sentence for every case', () => {
    expect(describeDateRange({ startDate: '2026-01-01', endDate: '2026-03-31' }))
      .toBe('Only responses submitted from Jan 1, 2026 through Mar 31, 2026 are included.');
    expect(describeDateRange({ startDate: '2026-01-01' })).toBe('Only responses submitted on or after Jan 1, 2026 are included.');
    expect(describeDateRange({ endDate: '2026-03-31' })).toBe('Only responses submitted on or before Mar 31, 2026 are included.');
    expect(describeDateRange()).toBe('No date range set. Responses from every date are included.');
  });

  test('getReportDateRange reads a saved snapshot config', () => {
    expect(getReportDateRange(undefined)).toBeNull();
    expect(getReportDateRange({})).toBeNull();
    expect(getReportDateRange({ dateRange: { startDate: null, endDate: null } })).toBeNull();
    expect(getReportDateRange({ dateRange: { startDate: '', endDate: '' } })).toBeNull();
    expect(getReportDateRange({ dateRange: { startDate: '2026-01-01', endDate: '' } }))
      .toEqual({ startDate: '2026-01-01', endDate: null });
  });
});
