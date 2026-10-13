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

  test('goal ids are optional and default to none', () => {
    const result = validateReportCreatePayload({ initiativeId: 2, questionSelections: [{ id: 12 }] });
    expect(result.valid).toBe(true);
    expect(result.value.goalIds).toEqual([]);
  });

  test('allows a goals-only report but not an empty one', () => {
    const goalsOnly = validateReportCreatePayload({ initiativeId: 2, goalIds: [3] });
    expect(goalsOnly.valid).toBe(true);
    expect(goalsOnly.value.questionSelections).toEqual([]);

    const empty = validateReportCreatePayload({ initiativeId: 2, questionSelections: [], goalIds: [] });
    expect(empty.valid).toBe(false);
    expect(empty.error).toContain('question or goal');
  });

  test('status after generating defaults to unpublished and is limited to known statuses', () => {
    const base = { initiativeId: 2, questionSelections: [{ id: 12 }] };
    expect(validateReportCreatePayload(base).value.status).toBe('completed');
    expect(validateReportCreatePayload({ ...base, status: 'published' }).value.status).toBe('published');
    expect(validateReportCreatePayload({ ...base, status: 'archived' }).value.status).toBe('archived');
    const invalid = validateReportCreatePayload({ ...base, status: 'generating' });
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('status');
  });

  test('accepts selected goal ids', () => {
    const result = validateReportCreatePayload({ initiativeId: 2, questionSelections: [{ id: 12 }], goalIds: [3, '4'] });
    expect(result.valid).toBe(true);
    expect(result.value.goalIds).toEqual([3, 4]);
  });

  test.each([
    ['not an array', 3, 'goalIds must be an array'],
    ['invalid id', [0], 'valid id'],
    ['fractional id', [1.5], 'valid id'],
    ['duplicate id', [3, 3], 'more than once'],
  ])('rejects goal ids: %s', (_label, goalIds, error) => {
    const result = validateReportCreatePayload({ initiativeId: 2, questionSelections: [{ id: 12 }], goalIds });
    expect(result.valid).toBe(false);
    expect(result.error).toContain(error);
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
