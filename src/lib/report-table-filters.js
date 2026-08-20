export function normalizeReportColumn(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findReportColumn(row, requestedColumn) {
  if (!row || !requestedColumn) return null;
  if (Object.prototype.hasOwnProperty.call(row, requestedColumn)) return requestedColumn;

  const normalizedRequested = normalizeReportColumn(requestedColumn);
  return Object.keys(row).find((column) => {
    const normalizedColumn = normalizeReportColumn(column);
    return normalizedColumn === normalizedRequested
      || (normalizedColumn.length >= 50 && normalizedRequested.startsWith(normalizedColumn));
  }) || null;
}

export function filterReportRows(rows, filters) {
  let filtered = [...(rows || [])];

  Object.entries(filters || {}).forEach(([column, value]) => {
    if (!value || value === 'All') return;
    filtered = filtered.filter((row) => {
      const matchingColumn = findReportColumn(row, column);
      if (!matchingColumn) return false;
      return String(row[matchingColumn] ?? '')
        .toLowerCase()
        .includes(String(value).toLowerCase());
    });
  });

  return filtered;
}
