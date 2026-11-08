// Response date range for reports: { startDate, endDate } as YYYY-MM-DD,
// both inclusive, matched against submission.submitted_at. Either end may be
// empty (no limit on that side).

function formatDay(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return String(isoDate);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** True when a From date is after the To date. */
export function hasInvalidDateRange({ startDate, endDate } = {}) {
  return Boolean(startDate && endDate && startDate > endDate);
}

/** True when either end of the range is set. */
export function isDateRangeActive(range) {
  return Boolean(range && (range.startDate || range.endDate));
}

/** Short label, e.g. "Jan 1, 2026 – Mar 31, 2026", "on or after Jan 1, 2026". */
export function formatDateRange({ startDate, endDate } = {}) {
  if (startDate && endDate) return `${formatDay(startDate)} – ${formatDay(endDate)}`;
  if (startDate) return `on or after ${formatDay(startDate)}`;
  if (endDate) return `on or before ${formatDay(endDate)}`;
  return 'All dates';
}

/** Sentence describing which responses the range includes. */
export function describeDateRange(range = {}) {
  const { startDate, endDate } = range;
  if (startDate && endDate) return `Only responses submitted from ${formatDay(startDate)} through ${formatDay(endDate)} are included.`;
  if (startDate) return `Only responses submitted on or after ${formatDay(startDate)} are included.`;
  if (endDate) return `Only responses submitted on or before ${formatDay(endDate)} are included.`;
  return 'No date range set. Responses from every date are included.';
}

/** The date range saved in a report snapshot's config, or null for reports without one. */
export function getReportDateRange(config) {
  const range = config?.dateRange;
  if (!isDateRangeActive(range)) return null;
  return { startDate: range.startDate || null, endDate: range.endDate || null };
}
