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

// ---------------------------------------------------------------------------
// Methods that fit each question type (report builder and goal editor).
// ---------------------------------------------------------------------------

/** Every question analysis method: the five shared ones plus the answer-based ones. */
export const QUESTION_METHODS = GOAL_SOURCE_METHODS;
export const QUESTION_METHOD_VALUES = GOAL_SOURCE_METHOD_VALUES;

const ANSWER_METHOD_VALUES = GOAL_ANSWER_METHODS.map((method) => method.value);

const NUMERIC_TYPES = new Set(['number', 'rating', 'likert_agreement', 'likert_good_bad', 'likert_like_dislike']);
const CHOICE_TYPES = new Set(['yesno', 'select', 'radio', 'choice', 'boolean']);
const MULTI_TYPES = new Set(['checkbox', 'multiselect']);
const DATE_TYPES = new Set(['date']);

const METHODS_BY_KIND = {
  numeric: QUESTION_METHOD_VALUES,
  choice: ['most_popular', 'least_common', 'delta_halves', ...ANSWER_METHOD_VALUES],
  multi: ['most_popular', 'least_common', ...ANSWER_METHOD_VALUES],
  text: ['most_popular', 'least_common', ...ANSWER_METHOD_VALUES],
  date: ['most_popular', 'least_common'],
};

/**
 * Broad kind of a question, from its builder type (validation_rules.ui_type)
 * or, failing that, its stored field_type: numeric | choice | multi | text | date.
 */
export function getQuestionKind(type) {
  if (NUMERIC_TYPES.has(type)) return 'numeric';
  if (CHOICE_TYPES.has(type)) return 'choice';
  if (MULTI_TYPES.has(type)) return 'multi';
  if (DATE_TYPES.has(type)) return 'date';
  return 'text';
}

/** The methods ({ value, label }) that can be applied to a question of this type. */
export function getMethodsForQuestion(type) {
  const allowed = METHODS_BY_KIND[getQuestionKind(type)];
  return QUESTION_METHODS.filter((method) => allowed.includes(method.value));
}

export function isMethodAllowedForQuestion(method, type) {
  return METHODS_BY_KIND[getQuestionKind(type)].includes(method);
}

/** Method preselected for a question: a trend where one fits, otherwise the most popular answer. */
export function getDefaultMethodForQuestion(type) {
  return isMethodAllowedForQuestion('delta_halves', type) ? 'delta_halves' : 'most_popular';
}

/** Builder type of a question row: validation_rules.ui_type when set, else field_type. */
export function resolveQuestionType(fieldType, validationRules) {
  if (validationRules) {
    try {
      const rules = typeof validationRules === 'string' ? JSON.parse(validationRules) : validationRules;
      if (rules?.ui_type) return rules.ui_type;
    } catch {
      // Malformed metadata: fall back to the stored type.
    }
  }
  return fieldType;
}

/** Error text for a method that does not fit a question. */
export function getMethodLabelForQuestionError(method, questionLabel) {
  return `"${getGoalSourceMethodLabel(method)}" cannot be used for the question "${questionLabel}"`;
}
