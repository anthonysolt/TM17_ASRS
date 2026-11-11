import { validateQuestionFilter, validateReportCreatePayload } from '@/lib/report-validation';

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

describe('answer-based question methods', () => {
  const payload = (selection) => validateReportCreatePayload({ initiativeId: 2, name: 'R', questionSelections: [{ id: 1, ...selection }] });

  test('require a target answer and keep it', () => {
    expect(payload({ method: 'answer_share' }).valid).toBe(false);
    expect(payload({ method: 'answer_share', answer: '   ' }).valid).toBe(false);
    expect(payload({ method: 'answer_share', answer: 'x'.repeat(201) }).valid).toBe(false);
    const ok = payload({ method: 'answer_share', answer: ' Yes ' });
    expect(ok.valid).toBe(true);
    expect(ok.value.questionSelections[0]).toMatchObject({ method: 'answer_share', answer: 'Yes' });
  });

  test('drop the answer for other methods and reject unknown methods', () => {
    expect(payload({ method: 'average', answer: 'Yes' }).value.questionSelections[0].answer).toBeUndefined();
    expect(payload({ method: 'median' }).valid).toBe(false);
  });
});
