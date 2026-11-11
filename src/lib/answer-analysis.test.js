import { computeAnswerAnalysis, computeAnswerValue } from '@/lib/answer-analysis';

const rows = ['Yes', 'yes ', 'No', null, 'Yes'].map((value, id) => ({ id, Q: value }));
const options = [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }];

describe('answer-analysis', () => {
  test('count and share ignore unanswered rows and match case-insensitively', () => {
    expect(computeAnswerValue(rows, 'Q', 'answer_count', 'yes', options)).toMatchObject({ value: 3, answered: 4 });
    expect(computeAnswerValue(rows, 'Q', 'answer_share', 'Yes', options).value).toBe(75);
  });

  test('most common treats ties as a win', () => {
    const tied = ['A', 'B'].map((value, id) => ({ id, Q: value }));
    expect(computeAnswerValue(tied, 'Q', 'answer_is_most_common', 'B').value).toBe(1);
    expect(computeAnswerValue(rows, 'Q', 'answer_is_most_common', 'No', options).value).toBe(0);
  });

  test('matches an option by its label and multi-select answers that include it', () => {
    const likert = [{ value: '5', label: '5 - Some What Like' }];
    expect(computeAnswerValue([{ Q: 5 }, { Q: 3 }], 'Q', 'answer_count', '5 - Some What Like', likert).value).toBe(1);
    expect(computeAnswerValue([{ Q: ['Swim', 'Run'] }, { Q: ['Run'] }], 'Q', 'answer_count', 'swim').value).toBe(1);
  });

  test('report result shape', () => {
    const result = computeAnswerAnalysis(rows, 'Q', 'answer_share', 'Yes', options, { initiativeId: 1 });
    expect(result).toMatchObject({
      analysisType: 'answer_share',
      analysisLabel: 'Responses With Answer (%) — "Yes"',
      attributes: ['Q'],
      result: '75%',
      responsesEvaluated: 4,
    });
    expect(result.trendId).toMatch(/^TRD-/);
    expect(computeAnswerAnalysis(rows, 'Q', 'answer_is_most_common', 'Yes', options).result).toBe('Yes');
    expect(computeAnswerAnalysis([], 'Q', 'answer_count', 'Yes', options).result).toBeNull();
  });
});
