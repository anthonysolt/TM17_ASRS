import {
  buildFilteredChartData,
  filterReportRows,
  getReportFilterColumns,
  getReportFilterOptions,
} from '@/lib/report-view-filters';

describe('report view filters', () => {
  const rows = [
    { id: 1, 'Favorite Activity?': 'Esports', Rating: 5 },
    { id: 2, 'Favorite Activity?': 'Track', Rating: 3 },
    { id: 3, 'Favorite Activity?': 'Esports', Rating: 4 },
  ];

  test('uses survey question columns and excludes internal identifiers', () => {
    expect(getReportFilterColumns(rows)).toEqual(['Favorite Activity?', 'Rating']);
  });

  test('matches formatted question labels and exact answer values', () => {
    expect(filterReportRows(rows, { favoriteactivity: 'Esports' })).toHaveLength(2);
    expect(filterReportRows(rows, { Rating: '3' })).toEqual([rows[1]]);
    expect(filterReportRows(rows, { Missing: 'value' })).toEqual([]);
  });

  test('builds filter options and charts from the current rows', () => {
    expect(getReportFilterOptions(rows, ['Favorite Activity?'])['Favorite Activity?']).toEqual(['Esports', 'Track']);
    expect(buildFilteredChartData(rows)['Favorite Activity?']).toEqual([
      { name: 'Esports', value: 2 },
      { name: 'Track', value: 1 },
    ]);
  });
});
