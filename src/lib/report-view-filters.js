const HIDDEN_COLUMNS = new Set(['id', 'submission_id', 'submitted_at', 'initiative_id', 'form_id', 'user_id']);

export function normalizeReportColumn(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findReportColumn(row, requestedColumn) {
  if (!row) return null;
  if (Object.prototype.hasOwnProperty.call(row, requestedColumn)) return requestedColumn;
  const normalized = normalizeReportColumn(requestedColumn);
  return Object.keys(row).find(column => normalizeReportColumn(column) === normalized) || null;
}

export function getReportFilterColumns(rows = []) {
  const columns = [];
  const seen = new Set();
  rows.forEach(row => {
    Object.keys(row || {}).forEach(column => {
      if (HIDDEN_COLUMNS.has(column.toLowerCase()) || seen.has(column)) return;
      seen.add(column);
      columns.push(column);
    });
  });
  return columns;
}

export function getReportFilterOptions(rows = [], columns = []) {
  return Object.fromEntries(columns.map(column => {
    const values = rows.map(row => {
      const rowColumn = findReportColumn(row, column);
      return rowColumn ? row[rowColumn] : null;
    }).flat().filter(value => value !== null && value !== undefined && value !== '');
    return [column, [...new Set(values.map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }));
}

export const QUESTION_FILTER_SCOPE_LABELS = {
  report: 'Report filter',
  question: 'Question filter',
};

export function describeQuestionFilterScope(filter) {
  return (QUESTION_FILTER_SCOPE_LABELS[filter?.scope] || QUESTION_FILTER_SCOPE_LABELS.report).toLowerCase();
}

export function describeQuestionFilter(filter) {
  if (!filter) return '';
  if (Array.isArray(filter.values)) {
    return filter.values.length > 0 ? `is ${filter.values.join(' or ')}` : '';
  }
  const hasMin = Number.isFinite(filter.min);
  const hasMax = Number.isFinite(filter.max);
  if (hasMin && hasMax) return `between ${filter.min} and ${filter.max}`;
  if (hasMin) return `at least ${filter.min}`;
  if (hasMax) return `at most ${filter.max}`;
  return '';
}
