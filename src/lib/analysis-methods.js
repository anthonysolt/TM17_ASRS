/**
 * Question analysis methods shared by report generation and question-sourced
 * goals. Calculations live in computeTrendData (src/lib/report-engine.js).
 */
export const ANALYSIS_METHODS = [
  { value: 'most_popular', label: 'Most Popular Answer' },
  { value: 'average', label: 'Average Answer' },
  { value: 'least_common', label: 'Least Common Answer' },
  { value: 'delta_halves', label: 'Half-to-Half Delta' },
  { value: 'linear_slope', label: 'Linear Slope' },
];

export const ANALYSIS_METHOD_VALUES = ANALYSIS_METHODS.map((method) => method.value);

export function getAnalysisMethodLabel(value) {
  return ANALYSIS_METHODS.find((method) => method.value === value)?.label || value;
}

/**
 * Goal-only methods that score a specific answer (e.g. 50 "Yes" responses,
 * or "Swimming" being the most common answer). They need a target answer.
 */
export const GOAL_ANSWER_METHODS = [
  { value: 'answer_count', label: 'Responses With Answer (count)' },
  { value: 'answer_share', label: 'Responses With Answer (%)' },
  { value: 'answer_is_most_common', label: 'Answer Is Most Common (1 = yes)' },
];

export const GOAL_SOURCE_METHODS = [...ANALYSIS_METHODS, ...GOAL_ANSWER_METHODS];
export const GOAL_SOURCE_METHOD_VALUES = GOAL_SOURCE_METHODS.map((method) => method.value);

export function methodNeedsAnswer(value) {
  return GOAL_ANSWER_METHODS.some((method) => method.value === value);
}

export function getGoalSourceMethodLabel(value) {
  return GOAL_SOURCE_METHODS.find((method) => method.value === value)?.label || value;
}
