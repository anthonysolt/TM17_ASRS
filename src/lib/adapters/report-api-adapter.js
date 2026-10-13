import { normalizeSnapshot } from '@/lib/report-snapshot';

function parseReportSnapshot(report) {
  if (!report) return null;

  if (report.report_snapshot && typeof report.report_snapshot === 'object') {
    return report.report_snapshot;
  }

  if (typeof report.report_data === 'string') {
    try {
      return JSON.parse(report.report_data);
    } catch {
      return null;
    }
  }

  if (report.report_data && typeof report.report_data === 'object') {
    return report.report_data;
  }

  return null;
}

export function toReportMapByInitiative(reports = []) {
  const map = {};
  for (const report of reports) {
    if (report?.initiative_id == null) continue;
    if (!map[report.initiative_id]) {
      map[report.initiative_id] = report;
    }
  }
  return map;
}

export function toReportingViewModel(report) {
  const raw = parseReportSnapshot(report);
  const normalized = normalizeSnapshot(raw);

  if (!normalized) {
    return { reportData: null, trendData: [] };
  }

  const results = normalized.results || {};
  return {
    reportData: {
      reportId: results.reportId,
      initiativeId: normalized.config?.initiativeId,
      initiativeName: results.initiativeName,
      generatedDate: results.generatedDate,
      summary: results.summary,
      chartData: results.chartData,
      tableData: Array.isArray(results.filteredTableData) ? results.filteredTableData : [],
      explainability: results.explainability,
      goals: Array.isArray(results.goals) ? results.goals : [],
    },
    trendData: Array.isArray(results.trendData) ? results.trendData : [],
  };
}
