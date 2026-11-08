// Full response rows for a saved report, computed on demand.
//
// Saved reports keep at most STORED_ROW_LIMIT rows (as of generation) for the
// on-screen table. Downloads need every row, so they re-run the report's saved
// question selections, question filters and response date range against the
// current responses. Rows therefore reflect current data: responses added since
// generation are included and deleted ones are gone.

import { querySelectedQuestionData } from '@/lib/query-helpers';

/** Rows stored in a report snapshot (results.filteredTableData). */
export const STORED_ROW_LIMIT = 500;

/**
 * Rows to store in a new snapshot, plus the facts the UI needs to explain a cap.
 * Returns { rows, totalRows, truncated }.
 */
export function capStoredRows(rows) {
  const all = Array.isArray(rows) ? rows : [];
  return {
    rows: all.slice(0, STORED_ROW_LIMIT),
    totalRows: all.length,
    truncated: all.length > STORED_ROW_LIMIT,
  };
}

/**
 * Re-runs a saved report's configuration and returns its current rows.
 *
 * config: the snapshot's config ({ initiativeId, questionSelections, filters,
 *   expressions, sorts, dateRange }). questionSelections carry the question id
 *   and its filter; the column name comes from the question's current label.
 * reportEngine: the engine from the service container (processReportData).
 *
 * Returns { rows, columns } or null when the report has no question
 * selections to re-run (reports from before question selections existed).
 */
export function computeReportRows(db, reportEngine, config) {
  const initiativeId = Number(config?.initiativeId);
  const selections = Array.isArray(config?.questionSelections) ? config.questionSelections : [];
  if (!initiativeId || selections.length === 0) return null;

  const ids = selections.map((selection) => Number(selection.id)).filter(Number.isInteger);
  const { tableData, questions } = querySelectedQuestionData(db, initiativeId, ids, config.dateRange || {});

  const savedById = new Map(selections.map((selection) => [Number(selection.id), selection]));
  const columns = questions.map((question) => question.column);
  const analyses = questions.map((question) => ({
    id: question.field_id,
    column: question.column,
    type: question.field_type,
    filter: savedById.get(Number(question.field_id))?.filter || null,
  }));

  const { filteredData } = reportEngine.processReportData(
    tableData,
    config.filters || {},
    config.expressions || [],
    config.sorts || [],
    columns,
    analyses
  );
  return { rows: filteredData, columns };
}
