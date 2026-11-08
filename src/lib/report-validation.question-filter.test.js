import { validateQuestionFilter } from '@/lib/report-validation';

describe('validateQuestionFilter limits and ranges', () => {
  test('accepts exactly 200 values and rejects 201', () => {
    const values = (n) => Array.from({ length: n }, (_, i) => `v${i}`);
    expect(validateQuestionFilter({ values: values(200) }).valid).toBe(true);
    const result = validateQuestionFilter({ values: values(201) });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/more than 200/);
  });

  test('accepts min-only and max-only ranges', () => {
    expect(validateQuestionFilter({ min: 3 })).toEqual({ valid: true, value: { scope: 'report', min: 3 } });
    expect(validateQuestionFilter({ scope: 'question', max: 4 })).toEqual({ valid: true, value: { scope: 'question', max: 4 } });
  });

  test('accepts min equal to max', () => {
    expect(validateQuestionFilter({ min: 3, max: 3 })).toEqual({ valid: true, value: { scope: 'report', min: 3, max: 3 } });
  });

  test('empty filters normalize to null', () => {
    expect(validateQuestionFilter({ values: [] }).value).toBeNull();
    expect(validateQuestionFilter({}).value).toBeNull();
  });
});
