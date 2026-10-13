/**
 * Goal display helpers shared by the Goals page, the report builder, the report
 * dashboard, and report downloads, so a goal reads the same everywhere.
 * Works on initiative_goal rows and on goals stored in report snapshots
 * (both carry goal_name, weight, target_value, current_value, scoring_method, score).
 */
import { getScoreColor } from '@/lib/score-utils';
import { getAnalysisMethodLabel } from '@/lib/analysis-methods';

/** Calculate raw progress toward a goal independently of its scoring method. */
export function getGoalProgress(goal) {
  const currentValue = Number(goal.current_value);
  const targetValue = Number(goal.target_value);

  if (!Number.isFinite(currentValue) || !Number.isFinite(targetValue) || targetValue <= 0) {
    return 0;
  }

  return Math.max(0, (currentValue / targetValue) * 100);
}

/** Display percentages with no more than two decimal places. */
export function formatPercentage(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '0';

  return numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Status label and pill class, including value-aware threshold goal states. */
export function getGoalStatus(goal) {
  if (goal.scoring_method === 'threshold') {
    const currentValue = Number(goal.current_value);
    const targetValue = Number(goal.target_value);

    if (currentValue < targetValue) return { label: 'Not Met', pill: 'pill-yellow' };
    if (currentValue === targetValue) return { label: 'Reached', pill: 'pill-green' };
    return { label: 'Exceeded', pill: 'pill-green' };
  }

  if (goal.score >= 100) return { label: 'Exceeded', pill: 'pill-blue' };
  if (goal.score >= 70) return { label: 'On Track', pill: 'pill-green' };
  return { label: 'Not Met', pill: 'pill-yellow' };
}

/** Linear and threshold goals remain visually highlighted until fully met. */
export function isUnmetWeightedGoal(goal) {
  return ['linear', 'threshold'].includes(goal.scoring_method) && Number(goal.score) < 100;
}

export function getGoalAccentColor(goal) {
  return isUnmetWeightedGoal(goal) ? '#F59E0B' : getScoreColor(goal.score);
}

/** "Question · Method" for question-sourced goals, '' for manual goals. */
export function getGoalSourceLabel(goal) {
  if (!goal.source_root_field_id) return '';
  return `${goal.source?.questionLabel || 'Survey question'} · ${getAnalysisMethodLabel(goal.source_method)}`;
}

// ---------------------------------------------------------------------------
// Download formatting — every format uses the same columns and values.
// ---------------------------------------------------------------------------

export const GOAL_EXPORT_HEADERS = [
  'Goal', 'Description', 'Source', 'Weight (%)', 'Target Value', 'Current Value', 'Goal Progress', 'Status',
];

export function toGoalExportRows(goals = []) {
  return goals.map((goal) => [
    goal.goal_name ?? '',
    goal.description ?? '',
    getGoalSourceLabel(goal) || 'Manual entry',
    `${formatPercentage(goal.weight)}%`,
    goal.target_value ?? '',
    goal.current_value ?? '',
    `${formatPercentage(getGoalProgress(goal))}%`,
    getGoalStatus(goal).label,
  ].map(String));
}

function quoteCsv(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** CSV lines for a "Goals" section: title row, header row, one row per goal. */
export function buildGoalsCsvLines(goals = []) {
  return [
    quoteCsv('Goals'),
    GOAL_EXPORT_HEADERS.map(quoteCsv).join(','),
    ...toGoalExportRows(goals).map((row) => row.map(quoteCsv).join(',')),
  ];
}

/** Tab-separated lines for a "Goals" section of the spreadsheet download. */
export function buildGoalsTsvLines(goals = []) {
  const clean = (value) => String(value).replace(/[\t\r\n]+/g, ' ');
  return [
    'Goals',
    GOAL_EXPORT_HEADERS.join('\t'),
    ...toGoalExportRows(goals).map((row) => row.map(clean).join('\t')),
  ];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** HTML table for the "Goals" section of the HTML and PDF downloads. */
export function buildGoalsHtmlTable(goals = []) {
  return [
    '<table class="goals-table">',
    `<thead><tr>${GOAL_EXPORT_HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>`,
    `<tbody>${toGoalExportRows(goals).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('\n')}</tbody>`,
    '</table>',
  ].join('');
}
