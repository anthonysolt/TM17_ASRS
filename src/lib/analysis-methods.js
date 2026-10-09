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
