import { methodNeedsAnswer } from '@/lib/analysis-methods';
import { computeAnswerAnalysis } from '@/lib/answer-analysis';
import { computeTrendData, rowsForAnalysis, validateTrendConfig } from '@/lib/report-engine';

/**
 * Results for one selected question, as the report builder's preview shows
 * them: answer-based methods go through computeAnswerAnalysis (like the
 * server does when the report is generated), every other method through
 * computeTrendData. A question-only filter narrows its own rows first.
 *
 * selection: { id, label, method, answer?, filter? }
 * options: the question's [{ value, label }] answer options
 */
export function analyzeQuestionSelection(filteredRows, selection, { options = [], attributes = [], context = {} } = {}) {
  const analysis = { ...selection, column: selection.label };
  const rows = rowsForAnalysis(filteredRows, analysis);
  if (methodNeedsAnswer(selection.method)) {
    return [computeAnswerAnalysis(rows, selection.label, selection.method, selection.answer, options, context)];
  }
  const validation = validateTrendConfig({
    variables: [selection.label], enabledCalc: true, enabledDisplay: true,
    method: selection.method, thresholdPct: 2,
  }, attributes);
  return validation.valid ? computeTrendData(rows, validation.normalized, context) : [];
}
