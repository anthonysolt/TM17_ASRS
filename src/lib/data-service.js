/**
 * ============================================================================
 * DATA SERVICE — The central hub for all data retrieval in the application.
 * ============================================================================
 * All data is fetched from the Next.js API routes which read from SQLite.
 * ============================================================================
 */

/**
 * getInitiatives()
 * Returns the list of all ASRS initiatives (id, name, description, attributes).
 */
export async function getInitiatives() {
  const response = await fetch('/api/initiatives');
  if (!response.ok) return [];

  const data = await response.json();
  return Array.isArray(data.initiatives) ? data.initiatives : [];
}

/**
 * getReportData(initiativeId)
 * Returns the full report data for one specific initiative.
 * This includes: summary stats, chart data, and table data.
 */
export async function getReportData(initiativeId) {
  const response = await fetch(`/api/initiatives/${initiativeId}/report-data`);
  if (!response.ok) return null;
  return response.json();
}

/**
 * getTrendData(initiativeId)
 * Returns the trend analysis data for one specific initiative.
 * Only returns trends where enabledDisplay is true.
 */
export async function getTrendData(initiativeId) {
  const response = await fetch(`/api/trends/${initiativeId}`);
  const data = await response.json();
  return data.trends || [];
}

/**
 * getFilteredReportData(initiativeId, filters)
 * Returns report table data filtered by the given criteria.
 * Fetches from API then filters client-side.
 */
export async function getFilteredReportData(initiativeId, filters) {
  const report = await getReportData(initiativeId);
  if (!report) return [];

  let filteredData = [...report.tableData];

  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'All') {
      filteredData = filteredData.filter(row => {
        const camelKey = key.charAt(0).toLowerCase() + key.slice(1).replace(/\s/g, '');
        return String(row[camelKey]).toLowerCase().includes(String(value).toLowerCase());
      });
    }
  });

  return filteredData;
}

/**
 * getSortedReportData(data, sortConfig)
 * Sorts an array of report rows based on sort configuration.
 * sortConfig is an array of { attribute, direction } objects.
 *
 * @param {Array} data - The data rows to sort.
 * @param {Array} sortConfig - Array of { attribute: string, direction: 'asc'|'desc' }.
 * @returns {Array} The sorted data.
 *
 * [API ADJUSTMENT] When the API handles sorting, you would pass sort params
 * in the query string instead of sorting client-side:
 *   const sortParams = sortConfig.map(s => `${s.attribute}:${s.direction}`).join(',');
 *   const response = await fetch(
 *     `https://your-api-url.com/api/reports/${initiativeId}?sort=${sortParams}`
 *   );
 */
export function getSortedReportData(data, sortConfig) {
  if (!sortConfig || sortConfig.length === 0) return data;

  const sorted = [...data];
  sorted.sort((a, b) => {
    for (const { attribute, direction } of sortConfig) {
      const key = attribute.charAt(0).toLowerCase() + attribute.slice(1).replace(/\s/g, '');
      const valA = a[key];
      const valB = b[key];

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else {
        comparison = String(valA).localeCompare(String(valB));
      }

      if (comparison !== 0) {
        return direction === 'desc' ? -comparison : comparison;
      }
    }
    return 0;
  });

  return sorted;
}
