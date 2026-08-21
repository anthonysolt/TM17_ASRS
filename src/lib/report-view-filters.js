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

export function filterReportRows(rows = [], filters = {}) {
  return rows.filter(row => Object.entries(filters).every(([column, expected]) => {
    if (expected === '' || expected === null || expected === undefined || expected === 'All') return true;
    const rowColumn = findReportColumn(row, column);
    if (!rowColumn) return false;
    return String(row[rowColumn] ?? '').trim().toLowerCase() === String(expected).trim().toLowerCase();
  }));
}

export function getReportFilterOptions(rows = [], columns = []) {
  return Object.fromEntries(columns.map(column => {
    const values = rows.map(row => {
      const rowColumn = findReportColumn(row, column);
      return rowColumn ? row[rowColumn] : null;
    }).filter(value => value !== null && value !== undefined && value !== '');
    return [column, [...new Set(values.map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }));
}

export function buildFilteredChartData(rows = []) {
  const chartData = {};
  getReportFilterColumns(rows).forEach(column => {
    const counts = new Map();
    rows.forEach(row => {
      const value = row[column];
      if (value === null || value === undefined || value === '') return;
      const label = String(value);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    if (counts.size > 0 && counts.size <= 25) {
      chartData[column] = [...counts.entries()].map(([name, value]) => ({ name, value }));
    }
  });
  return chartData;
}
