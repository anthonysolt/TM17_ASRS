import {
  validateReportCreatePayload,
  validateReportDeleteParams,
  validateReportQueryParams,
  validateReportUpdatePayload,
} from '@/lib/report-validation';

describe('report-validation', () => {
  test('validates report create payload happy path', () => {
    const result = validateReportCreatePayload({
      initiativeId: 2,
      name: 'My Report',
      description: 'desc',
      filters: { Grade: '7th' },
      expressions: [{ attribute: 'Grade', operator: '=', value: '7th' }],
      sorts: [{ attribute: 'Grade', direction: 'asc' }],
      trendConfig: { variables: ['Grade'] },
      questionSelections: [{ id: 12, method: 'delta_halves' }],
    });
    expect(result.valid).toBe(true);
    expect(result.value.initiativeId).toBe(2);
  });

  test('rejects malformed create payload', () => {
    const result = validateReportCreatePayload({
      initiativeId: 'abc',
      expressions: 'bad',
    });
    expect(result.valid).toBe(false);
  });

  test.each(['most_popular', 'average', 'least_common'])('accepts the %s question analysis method', (method) => {
    const result = validateReportCreatePayload({
      initiativeId: 2,
      questionSelections: [{ id: 12, method }],
    });
    expect(result.valid).toBe(true);
  });

  test('validates update payload', () => {
    const result = validateReportUpdatePayload({ id: 10, status: 'completed' });
    expect(result.valid).toBe(true);
  });

  test('rejects bad delete/query params', () => {
    const params = new URLSearchParams();
    params.set('id', 'nope');
    expect(validateReportDeleteParams(params).valid).toBe(false);

    const query = new URLSearchParams();
    query.set('initiativeId', '-2');
    expect(validateReportQueryParams(query).valid).toBe(false);
  });
});
