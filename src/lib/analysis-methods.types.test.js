import {
  getDefaultMethodForQuestion,
  getMethodsForQuestion,
  isMethodAllowedForQuestion,
  resolveQuestionType,
} from '@/lib/analysis-methods';

const values = (type) => getMethodsForQuestion(type).map((method) => method.value);
const ANSWER = ['answer_count', 'answer_share', 'answer_is_most_common'];

describe('analysis methods per question type', () => {
  test('numeric questions get every method', () => {
    for (const type of ['number', 'rating', 'likert_agreement', 'likert_good_bad', 'likert_like_dislike']) {
      expect(values(type)).toEqual(['most_popular', 'average', 'least_common', 'delta_halves', 'linear_slope', ...ANSWER]);
    }
  });

  test('single-choice questions get counts, a trend and answer methods, but no average or slope', () => {
    for (const type of ['yesno', 'select', 'radio', 'choice', 'boolean']) {
      expect(values(type)).toEqual(['most_popular', 'least_common', 'delta_halves', ...ANSWER]);
    }
  });

  test('checkbox and text questions get counts and answer methods', () => {
    for (const type of ['checkbox', 'multiselect', 'text', 'textarea', 'email', 'url', undefined]) {
      expect(values(type)).toEqual(['most_popular', 'least_common', ...ANSWER]);
    }
  });

  test('date questions only get counts', () => {
    expect(values('date')).toEqual(['most_popular', 'least_common']);
  });

  test('defaults and checks', () => {
    expect(getDefaultMethodForQuestion('rating')).toBe('delta_halves');
    expect(getDefaultMethodForQuestion('yesno')).toBe('delta_halves');
    expect(getDefaultMethodForQuestion('text')).toBe('most_popular');
    expect(isMethodAllowedForQuestion('average', 'yesno')).toBe(false);
    expect(isMethodAllowedForQuestion('average', 'likert_agreement')).toBe(true);
  });

  test('resolveQuestionType prefers ui_type from validation rules', () => {
    expect(resolveQuestionType('number', '{"ui_type":"likert_agreement"}')).toBe('likert_agreement');
    expect(resolveQuestionType('text', { ui_type: 'radio' })).toBe('radio');
    expect(resolveQuestionType('yesno', null)).toBe('yesno');
    expect(resolveQuestionType('text', '{bad json')).toBe('text');
  });
});
