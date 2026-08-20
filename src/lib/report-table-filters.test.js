import { filterReportRows, findReportColumn } from '@/lib/report-table-filters';

describe('report table filters', () => {
  const rows = [
    { id: 18, 'What school do you attend?': 'Rutgers', 'Select your grade': '5th' },
    { id: 20, 'What school do you attend?': 'Denver', 'Select your grade': '6th' },
  ];

  test('filters generated report rows using their question-text columns', () => {
    expect(filterReportRows(rows, { 'What school do you attend?': 'Rutgers' }))
      .toEqual([rows[0]]);
  });

  test('matches harmless column formatting differences', () => {
    expect(findReportColumn(rows[0], 'what school do you attend')).toBe('What school do you attend?');
  });

  test('matches long PostgreSQL identifiers that were truncated to 63 characters', () => {
    const row = { 'What was the most important thing you learned from the sports a': 'Teamwork' };
    expect(findReportColumn(row, 'What was the most important thing you learned from the sports activity workshop?'))
      .toBe('What was the most important thing you learned from the sports a');
  });

  test('does not silently keep rows when a filter column is absent', () => {
    expect(filterReportRows(rows, { 'Missing column': 'Rutgers' })).toEqual([]);
  });
});
