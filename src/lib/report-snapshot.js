function ensureObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureExplainability(explainability = {}) {
  const safe = ensureObject(explainability, {});
  return {
    inputRowCount: Number.isFinite(Number(safe.inputRowCount)) ? Number(safe.inputRowCount) : 0,
    afterFilterCount: Number.isFinite(Number(safe.afterFilterCount)) ? Number(safe.afterFilterCount) : 0,
    afterExpressionCount: Number.isFinite(Number(safe.afterExpressionCount)) ? Number(safe.afterExpressionCount) : 0,
    outputRowCount: Number.isFinite(Number(safe.outputRowCount)) ? Number(safe.outputRowCount) : 0,
    droppedByStep: ensureObject(safe.droppedByStep, {
      filters: 0,
      expressions: 0,
      sorting: 0,
    }),
  };
}

export function normalizeSnapshot(rawSnapshot) {
  if (!rawSnapshot || typeof rawSnapshot !== 'object') return null;

  const version = Number(rawSnapshot.version) || 1;
  const config = ensureObject(rawSnapshot.config, {});
  const results = ensureObject(rawSnapshot.results, {});

  if (version === 1) {
    return {
      version: 2,
      config: {
        ...config,
        trendConfig: ensureObject(config.trendConfig, {
          variables: [],
          enabledCalc: false,
          enabledDisplay: true,
          method: 'delta_halves',
          thresholdPct: 2,
        }),
      },
      results: {
        ...results,
        filteredTableData: ensureArray(results.filteredTableData),
        trendData: ensureArray(results.trendData).map((trend) => ({
          ...trend,
          confidenceScore: Number.isFinite(Number(trend?.confidenceScore))
            ? Number(trend.confidenceScore)
            : 50,
        })),
        explainability: ensureExplainability(results.explainability || {
          inputRowCount: ensureArray(results.filteredTableData).length,
          afterFilterCount: ensureArray(results.filteredTableData).length,
          afterExpressionCount: ensureArray(results.filteredTableData).length,
          outputRowCount: ensureArray(results.filteredTableData).length,
          droppedByStep: { filters: 0, expressions: 0, sorting: 0 },
        }),
      },
      generatedAt: rawSnapshot.generatedAt || null,
    };
  }

  return {
    version: 2,
    config: {
      ...config,
      trendConfig: ensureObject(config.trendConfig, {
        variables: [],
        enabledCalc: false,
        enabledDisplay: true,
        method: 'delta_halves',
        thresholdPct: 2,
      }),
    },
    results: {
      ...results,
      filteredTableData: ensureArray(results.filteredTableData),
      trendData: ensureArray(results.trendData),
      explainability: ensureExplainability(results.explainability),
    },
    generatedAt: rawSnapshot.generatedAt || null,
  };
}

// Converts a stored report row (with its report_data snapshot) into the props
// ReportDashboard expects.
export function parseReportForDashboard(report) {
  let parsed = null;
  try {
    parsed = typeof report?.report_data === 'string'
      ? JSON.parse(report.report_data)
      : report?.report_data;
  } catch {
    parsed = null;
  }

  const normalized = normalizeSnapshot(parsed);
  if (!normalized) return { reportData: null, trendData: [], aiInsights: null, initiative: null };

  const results = normalized.results;
  return {
    reportData: {
      reportId: results.reportId,
      initiativeId: normalized.config.initiativeId,
      initiativeName: results.initiativeName,
      generatedDate: results.generatedDate,
      summary: results.summary,
      chartData: results.chartData,
      tableData: results.filteredTableData,
      explainability: results.explainability,
    },
    trendData: results.trendData || [],
    aiInsights: results.aiInsights || null,
    initiative: {
      id: normalized.config.initiativeId,
      name: results.initiativeName,
    },
  };
}
