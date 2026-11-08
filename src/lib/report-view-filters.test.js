import {
  describeQuestionFilter,
  describeQuestionFilterScope,
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

  test('builds filter options from the current rows', () => {
    expect(getReportFilterOptions(rows, ['Favorite Activity?'])['Favorite Activity?']).toEqual(['Esports', 'Track']);
  });

  test('lists each checkbox option once', () => {
    const checkboxRows = [{ Clubs: ['Chess', 'Art'] }, { Clubs: ['Art'] }, { Clubs: null }];
    expect(getReportFilterOptions(checkboxRows, ['Clubs']).Clubs).toEqual(['Art', 'Chess']);
  });

  test('describes question filters for display', () => {
    expect(describeQuestionFilter({ scope: 'report', values: ['Yes', 'Maybe'] })).toBe('is Yes or Maybe');
    expect(describeQuestionFilter({ scope: 'report', min: 2, max: 5 })).toBe('between 2 and 5');
    expect(describeQuestionFilter({ scope: 'report', min: 2 })).toBe('at least 2');
    expect(describeQuestionFilter({ scope: 'report', max: 5 })).toBe('at most 5');
    expect(describeQuestionFilter(null)).toBe('');
    expect(describeQuestionFilterScope({ scope: 'question' })).toBe('question filter');
    expect(describeQuestionFilterScope({})).toBe('report filter');
  });
});
