import { getAppliedQuestionFilters, getStoredRowInfo } from '@/lib/report-snapshot';

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('getStoredRowInfo', () => {
  test('legacy snapshot without a count uses the stored row count', () => {
    expect(getStoredRowInfo({ filteredTableData: rows(3) })).toEqual({ tableRowCount: 3, tableRowsTruncated: false });
  });

  test('null count falls back to the stored row count instead of 0', () => {
    expect(getStoredRowInfo({ filteredTableData: rows(4), tableRowCount: null }).tableRowCount).toBe(4);
  });

  test('truncated flag is ignored when the total fits in the stored rows', () => {
    expect(getStoredRowInfo({ filteredTableData: rows(5), tableRowCount: 5, tableRowsTruncated: true }))
      .toEqual({ tableRowCount: 5, tableRowsTruncated: false });
  });

  test('truncated when the total exceeds the stored rows', () => {
    expect(getStoredRowInfo({ filteredTableData: rows(2), tableRowCount: 900, tableRowsTruncated: true }))
      .toEqual({ tableRowCount: 900, tableRowsTruncated: true });
  });

  test('handles missing results', () => {
    expect(getStoredRowInfo(undefined)).toEqual({ tableRowCount: 0, tableRowsTruncated: false });
  });
});

describe('getAppliedQuestionFilters', () => {
  test('returns [] when questionSelections is missing', () => {
    expect(getAppliedQuestionFilters({})).toEqual([]);
    expect(getAppliedQuestionFilters(null)).toEqual([]);
  });

  test('keeps only selections with an active filter', () => {
    const active = { id: 'a', filter: { scope: 'report', values: ['Yes'] } };
    const range = { id: 'b', filter: { scope: 'question', min: 2 } };
    const selections = [
      active,
      { id: 'c', filter: null },
      { id: 'd', filter: { values: [] } },
      { id: 'e', filter: {} },
      range,
    ];
    expect(getAppliedQuestionFilters({ questionSelections: selections })).toEqual([active, range]);
  });
});
