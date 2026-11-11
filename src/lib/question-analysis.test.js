import { analyzeQuestionSelection } from '@/lib/question-analysis';

const rows = [
  { id: 1, Enjoy: 'Yes', Score: 5 },
  { id: 2, Enjoy: 'No', Score: 1 },
  { id: 3, Enjoy: 'Yes', Score: 3 },
  { id: 4, Enjoy: 'No', Score: 2 },
  { id: 5, Enjoy: 'Yes', Score: 4 },
];
const yesNo = [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }];

describe('analyzeQuestionSelection (report preview)', () => {
  test('answer-based methods give the answer result, not a trend', () => {
    const [result] = analyzeQuestionSelection(rows, { id: 10, label: 'Enjoy', method: 'answer_share', answer: 'Yes' }, { options: yesNo });
    expect(result).toMatchObject({ analysisType: 'answer_share', result: '60%', responsesEvaluated: 5 });
    expect(result.direction).toBeUndefined();
  });

  test('a question-only filter narrows the answer analysis', () => {
    const [result] = analyzeQuestionSelection(rows, {
      id: 11, label: 'Score', method: 'answer_count', answer: '5', filter: { scope: 'question', min: 3 },
    });
    expect(result).toMatchObject({ result: 1, responsesEvaluated: 3 });
  });

  test('other methods still use the trend calculation', () => {
    const [average] = analyzeQuestionSelection(rows, { id: 11, label: 'Score', method: 'average' }, { attributes: ['Score'] });
    expect(average).toMatchObject({ analysisType: 'average', result: 3 });
    const [trend] = analyzeQuestionSelection(rows, { id: 11, label: 'Score', method: 'delta_halves' }, { attributes: ['Score'] });
    expect(trend.direction).toBeDefined();
  });
});
