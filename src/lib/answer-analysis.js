/**
 * Answer-based analysis methods (answer_count, answer_share,
 * answer_is_most_common), shared by question-sourced goals and reports.
 */
import { getGoalSourceMethodLabel } from '@/lib/analysis-methods';
import { createDeterministicTrendId } from '@/lib/report-engine';

const normalize = (value) => String(value ?? '').trim().toLowerCase();

/**
 * A response matches the target when it equals the option's stored value or
 * its label (ignoring case); multi-select answers match when they include it.
 * options: [{ value, label }] (empty for free-text questions).
 */
export function answerMatcher(answer, options = []) {
  const target = normalize(answer);
  const option = options.find((candidate) => normalize(candidate.value) === target || normalize(candidate.label) === target);
  const aliases = new Set([target, ...(option ? [normalize(option.value), normalize(option.label)] : [])]);
  const matches = (value) => (Array.isArray(value) ? value.some(matches) : aliases.has(normalize(value)));
  return { matches, option };
}

export const isAnswered = (value) => (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && String(value).trim() !== '');

/**
 * Value of an answer method over table rows: { value, matching, answered, description }.
 * value is null when nobody has answered.
 */
export function computeAnswerValue(tableData, column, method, answer, options = []) {
  const { matches, option } = answerMatcher(answer, options);
  const answerLabel = option?.label || answer;
  const answers = tableData.map((row) => row[column]).filter(isAnswered);
  const matching = answers.filter(matches).length;
  const answered = answers.length;

  if (answered === 0) return { value: null, matching: 0, answered: 0, description: 'No responses yet.' };
  if (method === 'answer_count') {
    return { value: matching, matching, answered, description: `${matching} of ${answered} responses chose "${answerLabel}".` };
  }
  if (method === 'answer_share') {
    const share = (matching / answered) * 100;
    return { value: share, matching, answered, description: `${Math.round(share * 10) / 10}% of responses (${matching} of ${answered}) chose "${answerLabel}".` };
  }

  // answer_is_most_common: count every distinct answer; ties count as a win.
  const counts = new Map();
  answers.flatMap((value) => (Array.isArray(value) ? value : [value])).forEach((value) => {
    const key = matches(value) ? '__target__' : normalize(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const targetCount = counts.get('__target__') || 0;
  const topCount = Math.max(...counts.values());
  const isTop = targetCount > 0 && targetCount === topCount;
  return {
    value: isTop ? 1 : 0,
    matching,
    answered,
    description: isTop
      ? `"${answerLabel}" is the most common answer (${targetCount} responses).`
      : `"${answerLabel}" is not the most common answer (${targetCount} vs ${topCount} for the top answer).`,
  };
}

function formatResult(method, value) {
  if (value === null) return null;
  if (method === 'answer_share') return `${Math.round(value * 10) / 10}%`;
  if (method === 'answer_is_most_common') return value === 1 ? 'Yes' : 'No';
  return value;
}

/**
 * Report result for an answer method, in the same shape as the single-answer
 * methods (analysisType / analysisLabel / result / description), so the report
 * dashboard, preview and downloads show it like Average or Most Popular.
 */
export function computeAnswerAnalysis(rows, column, method, answer, options = [], context = {}) {
  const { value, answered, description } = computeAnswerValue(rows, column, method, answer, options);
  const answerLabel = answerMatcher(answer, options).option?.label || answer;
  return {
    trendId: createDeterministicTrendId(context, [column], `${method}:${answer}`, rows),
    analysisType: method,
    analysisLabel: `${getGoalSourceMethodLabel(method)} — "${answerLabel}"`,
    attributes: [column],
    targetAnswer: answerLabel,
    result: formatResult(method, value),
    responsesEvaluated: answered,
    enabledDisplay: true,
    enabledCalc: true,
    description,
  };
}
