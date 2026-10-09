// Builds a download filename in the format REPORTNAME_DDMMYY (no extension).
export function buildReportFileName(reportName, date = new Date()) {
  const name = String(reportName || 'Report').trim().replace(/\s+/g, '_') || 'Report';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${name}_${dd}${mm}${yy}`;
}
