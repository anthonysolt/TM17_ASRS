import { NextResponse } from 'next/server';
import { querySelectedQuestionData, submittedAtClause } from '@/lib/query-helpers';
import { queryReportGoals } from '@/lib/goals/report-goals';
import {
  validateReportCreatePayload,
  validateReportDeleteParams,
  validateReportQueryParams,
  validateReportUpdatePayload,
} from '@/lib/report-validation';
import { toReportDetailDto, toReportListItemDto } from '@/lib/adapters/report-adapter';
import { getServiceContainer } from '@/lib/container/service-container';
import EVENTS from '@/lib/events/event-types';
import { requirePermission } from '@/lib/auth/server-auth';
import { alertDb } from '@/lib/db-alerts';
import { logAudit } from '@/lib/audit';
// import { generateReportInsights } from '@/lib/openai-report-insights';
import { buildQuestionChartData, isQuestionFilterActive, rowsForAnalysis } from '@/lib/report-engine';
import { capStoredRows } from '@/lib/reports/report-rows';
import {
  getMethodLabelForQuestionError, isMethodAllowedForQuestion, methodNeedsAnswer, resolveQuestionType,
} from '@/lib/analysis-methods';
import { answerMatcher, computeAnswerAnalysis } from '@/lib/answer-analysis';
import { loadQuestionOptions } from '@/lib/goals/question-source';

function startGenerationLog(db, payload) {
  return db.prepare(`
    INSERT INTO report_generation_log (
      initiative_id,
      status,
      input_rows,
      output_rows,
      filters_count,
      expressions_count,
      sorts_count,
      trend_variables_count
    ) VALUES (?, 'started', ?, 0, ?, ?, ?, ?)
  `).run(
    payload.initiativeId,
    payload.inputRows,
    payload.filtersCount,
    payload.expressionsCount,
    payload.sortsCount,
    payload.trendVariablesCount
  ).lastInsertRowid;
}

function finishGenerationLog(db, logId, result) {
  db.prepare(`
    UPDATE report_generation_log
    SET status = ?,
        report_id = ?,
        duration_ms = ?,
        output_rows = ?,
        error_message = ?
    WHERE log_id = ?
  `).run(
    result.status,
    result.reportId || null,
    result.durationMs || 0,
    result.outputRows || 0,
    result.errorMessage || null,
    Number(logId)
  );
}

export async function GET(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'reporting.view');
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const queryValidation = validateReportQueryParams(searchParams);
    if (!queryValidation.valid) {
      return NextResponse.json({ error: queryValidation.error }, { status: 400 });
    }

    const { initiativeId, startDate, endDate } = queryValidation;

    const conditions = [];
    const params = [];

    if (initiativeId) {
      conditions.push('r.initiative_id = ?');
      params.push(Number(initiativeId));
    }
    if (startDate) {
      conditions.push('r.created_at >= ?');
      params.push(startDate);
    }
    if (endDate) {
      conditions.push('r.created_at <= ?');
      params.push(endDate + 'T23:59:59');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    // The list leaves out report_data (the saved snapshot, which can be large);
    // GET /api/reports/[id] returns it when a report is opened or downloaded.
    const sql = `SELECT r.id, r.initiative_id, r.name, r.description, r.status, r.created_by,
                r.display_order, r.created_at, r.published_at, i.initiative_name
         FROM reports r
         LEFT JOIN initiative i ON r.initiative_id = i.initiative_id
         ${whereClause}
         ORDER BY r.display_order ASC, r.created_at DESC`;

    const rows = db.prepare(sql).all(...params);

    return NextResponse.json({ reports: rows.map(toReportListItemDto) });
  } catch (error) {
    try {
      alertDb(error, { route: '/api/reports GET' }).catch(() => void 0);
    } catch (e) {
      // ignore
    }
    console.error('Error fetching reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  let generationLogId = null;
  const startedAt = Date.now();

  try {
    const container = getServiceContainer();
    const { db, reportEngine, eventBus, clock } = container;
    const auth = requirePermission(request, db, 'reports.create');
    if (auth.error) return auth.error;

    const body = await request.json();
    const payloadValidation = validateReportCreatePayload(body);
    if (!payloadValidation.valid) {
      return NextResponse.json({ error: payloadValidation.error }, { status: 400 });
    }

    const payload = payloadValidation.value;
    const initiativeId = Number(payload.initiativeId);

    const initiative = db.prepare(
      'SELECT initiative_id, initiative_name, description FROM initiative WHERE initiative_id = ?'
    ).get(initiativeId);

    if (!initiative) {
      return NextResponse.json({ error: 'No data found for this initiative' }, { status: 404 });
    }

    const selectedIds = payload.questionSelections.map((selection) => selection.id);
    // Optional response date range (submission.submitted_at, inclusive).
    const dateRange = { startDate: payload.startDate, endDate: payload.endDate };
    const dateClause = submittedAtClause(dateRange);
    const selectedQuestionData = querySelectedQuestionData(db, initiativeId, selectedIds, dateRange);
    if (selectedQuestionData.questions.length !== selectedIds.length) {
      return NextResponse.json(
        { error: 'One or more selected questions do not belong to this initiative' },
        { status: 400 }
      );
    }
    const tableData = selectedQuestionData.tableData;
    const attributes = selectedQuestionData.questions.map((question) => question.column);

    // Goals are stored as scored when the report is generated.
    const goals = queryReportGoals(db, initiativeId, payload.goalIds);
    if (goals.length !== payload.goalIds.length) {
      return NextResponse.json(
        { error: 'One or more selected goals do not belong to this initiative' },
        { status: 400 }
      );
    }

    // Compute summary from real submission data
    const submissionCount = db.prepare(
      `SELECT COUNT(*) as count FROM submission s WHERE s.initiative_id = ?${dateClause.sql}`
    ).get(initiativeId, ...dateClause.params).count;

    const avgResult = db.prepare(`
      SELECT AVG(sv.value_number) as avg_score
      FROM submission_value sv
      JOIN submission s ON s.submission_id = sv.submission_id
      JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
      JOIN field f ON f.field_id = fq.field_id
      WHERE s.initiative_id = ? AND f.field_type = 'rating' AND sv.value_number IS NOT NULL${dateClause.sql}
    `).get(initiativeId, ...dateClause.params);

    const totalForms = db.prepare(
      'SELECT COUNT(*) as count FROM form WHERE initiative_id = ?'
    ).get(initiativeId).count;

    const summary = {
      totalParticipants: submissionCount,
      averageRating: avgResult?.avg_score != null
        ? Math.round(Number(avgResult.avg_score) * 10) / 10
        : 0,
      completionRate: totalForms > 0
        ? Math.round((submissionCount / Math.max(submissionCount, 1)) * 100 * 10) / 10
        : 0,
    };

    const filters = payload.filters || {};
    const expressions = payload.expressions || [];
    const sorts = payload.sorts || [];

    const selectionsById = new Map(payload.questionSelections.map((selection) => [selection.id, selection]));
    const questionAnalyses = selectedQuestionData.questions.map((question) => ({
      id: question.field_id,
      // Label and survey version as they were when this report was generated.
      label: question.field_label || question.column,
      versionNumber: question.version_number,
      column: question.column,
      type: question.field_type,
      uiType: resolveQuestionType(question.field_type, question.validation_rules),
      method: selectionsById.get(question.field_id).method,
      ...(selectionsById.get(question.field_id).answer ? { answer: selectionsById.get(question.field_id).answer } : {}),
      thresholdPct: 2,
      filter: selectionsById.get(question.field_id).filter || null,
    }));
    // Answer options of questions using an answer-based method (by question id).
    const answerOptions = new Map();
    for (const analysis of questionAnalyses) {
      if (!isMethodAllowedForQuestion(analysis.method, analysis.uiType)) {
        return NextResponse.json(
          { error: getMethodLabelForQuestionError(analysis.method, analysis.label) },
          { status: 400 }
        );
      }
      if (methodNeedsAnswer(analysis.method)) {
        const options = loadQuestionOptions(db, initiativeId, analysis.id);
        // A target that isn't one of the options (typo, renamed option) would
        // otherwise read as "0 responses chose it".
        if (options.length > 0 && !answerMatcher(analysis.answer, options).option) {
          return NextResponse.json(
            { error: `"${analysis.answer}" is not an answer option for the question "${analysis.label}"` },
            { status: 400 }
          );
        }
        answerOptions.set(analysis.id, options);
      }
    }
    for (const analysis of questionAnalyses) {
      const validation = reportEngine.validateTrendConfig({
        variables: [analysis.column], enabledCalc: true, enabledDisplay: true,
        method: analysis.method, thresholdPct: analysis.thresholdPct,
      }, attributes);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      analysis.trendConfig = validation.normalized;
    }

    generationLogId = startGenerationLog(db, {
      initiativeId,
      inputRows: tableData.length,
      filtersCount: Object.keys(filters).length,
      expressionsCount: expressions.length,
      sortsCount: sorts.length,
      trendVariablesCount: questionAnalyses.length,
    });

    const { filteredData, metrics, explainability } = reportEngine.processReportData(
      tableData,
      filters,
      expressions,
      sorts,
      attributes,
      questionAnalyses
    );

    const chartData = buildQuestionChartData(filteredData, questionAnalyses);

    // Whole-report question filters narrow the respondent pool, so the
    // headline numbers must describe the filtered rows instead of every submission.
    const hasReportScopedFilter = questionAnalyses.some((analysis) =>
      analysis.filter?.scope === 'report' && isQuestionFilterActive(analysis.filter)
    );
    if (hasReportScopedFilter) {
      const ratingAnalyses = questionAnalyses.filter((analysis) => analysis.type === 'rating');
      const ratingValues = ratingAnalyses
        .flatMap((analysis) => filteredData.map((row) => row[analysis.column]))
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(Number)
        .filter(Number.isFinite);
      summary.totalParticipants = filteredData.length;
      // Without selected rating questions there is nothing to recompute from,
      // so keep the initiative-wide average rather than reporting 0.
      if (ratingAnalyses.length > 0) {
        summary.averageRating = ratingValues.length > 0
          ? Math.round((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length) * 10) / 10
          : 0;
      }
    }

    const trendContext = { initiativeId, reportName: payload.name || '' };
    const trendData = questionAnalyses.flatMap((analysis) => {
      const rows = rowsForAnalysis(filteredData, analysis);
      if (methodNeedsAnswer(analysis.method)) {
        return [computeAnswerAnalysis(rows, analysis.column, analysis.method, analysis.answer, answerOptions.get(analysis.id) || [], trendContext)];
      }
      return reportEngine.computeTrendData(rows, analysis.trendConfig, trendContext);
    });

    // Optional AI insights generation
    let aiInsights = null;
    // if (payload.includeAiInsights) {
    //   const aiStartedAt = Date.now();
    //   try {
    //     aiInsights = await generateReportInsights({
    //       initiativeName: initiative.initiative_name,
    //       summary,
    //       metrics,
    //       chartData,
    //       trendData,
    //       sampleTableData: filteredData.slice(0, 50),
    //     });
    //     if (!aiInsights.aiGenerated) aiInsights = null;
    //   } catch {
    //     aiInsights = null;
    //   }
    //   const aiDurationMs = Date.now() - aiStartedAt;
    //   // Log AI duration if generation log exists
    //   if (generationLogId) {
    //     try {
    //       db.prepare(
    //         'UPDATE report_generation_log SET ai_status = ?, ai_duration_ms = ? WHERE log_id = ?'
    //       ).run(aiInsights ? 'completed' : 'failed', aiDurationMs, Number(generationLogId));
    //     } catch {
    //       // ai columns may not exist yet — ignore
    //     }
    //   }
    // }

    // The snapshot keeps the summary, charts, trends and goals in full, but only
    // the first rows for the on-screen table; downloads fetch every row live
    // from GET /api/reports/[id]/rows.
    const storedRows = capStoredRows(filteredData);

    const snapshot = {
      version: 2,
      config: {
        initiativeId,
        initiativeName: initiative.initiative_name,
        filters,
        expressions,
        sorts,
        questionSelections: questionAnalyses.map(({ trendConfig: _trendConfig, ...analysis }) => analysis),
        goalIds: payload.goalIds,
        dateRange: { startDate: payload.startDate || null, endDate: payload.endDate || null },
      },
      results: {
        metrics,
        explainability,
        filteredTableData: storedRows.rows,
        tableRowCount: storedRows.totalRows,
        tableRowsTruncated: storedRows.truncated,
        chartData,
        trendData,
        goals,
        summary,
        aiInsights,
        reportId: `RPT-db-${initiativeId}`,
        initiativeName: initiative.initiative_name,
        generatedDate: clock.todayIsoDate(),
      },
      generatedAt: clock.nowIso(),
    };

    const result = db.prepare(
      `INSERT INTO reports (initiative_id, name, description, status, created_by, report_data, created_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      initiativeId,
      payload.name || '',
      payload.description || '',
      payload.status || 'completed',
      payload.createdBy || '',
      JSON.stringify(snapshot),
      clock.nowIso(),
      // A report generated as published is stamped like one published later.
      payload.status === 'published' ? clock.nowIso() : null
    );

    if (generationLogId) {
      finishGenerationLog(db, generationLogId, {
        status: 'completed',
        reportId: Number(result.lastInsertRowid),
        durationMs: Date.now() - startedAt,
        outputRows: filteredData.length,
      });
    }

    eventBus.publish(EVENTS.REPORT_CREATED, {
      reportId: Number(result.lastInsertRowid),
      initiativeId,
      reportName: payload.name || '',
      createdBy: payload.createdBy || '',
      generatedAt: clock.nowIso(),
    });

    logAudit(db, {
      event: 'report.created',
      userEmail: auth.user.email,
      targetType: 'report',
      targetId: String(result.lastInsertRowid),
      payload: {
        name: payload.name || '',
        initiative_id: initiativeId,
        initiative_name: initiative.initiative_name,
      },
    });

    return NextResponse.json({ success: true, reportId: result.lastInsertRowid });
  } catch (error) {
    const { db } = getServiceContainer();
    if (generationLogId) {
      finishGenerationLog(db, generationLogId, {
        status: 'failed',
        durationMs: Date.now() - startedAt,
        outputRows: 0,
        errorMessage: error.message,
      });
    }
    try {
      alertDb(error, { route: '/api/reports POST' }).catch(() => void 0);
    } catch (e) {
      // ignore
    }
    console.error('Error creating report:', error);
    return NextResponse.json(
      { error: 'Failed to create report', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const payloadValidation = validateReportUpdatePayload(body);
    if (!payloadValidation.valid) {
      return NextResponse.json({ error: payloadValidation.error }, { status: 400 });
    }

    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'reports.create');
    if (auth.error) return auth.error;

    const { id, name, description, status } = payloadValidation.value;

    const existing = db.prepare('SELECT id, status FROM reports WHERE id = ?').get(Number(id));
    if (!existing) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
      // Every publish refreshes the publish date, whatever the previous status.
      if (status === 'published') {
        updates.push('published_at = ?');
        params.push(new Date().toISOString());
      }
    }

    params.push(Number(id));
    db.prepare(`UPDATE reports SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare(
      `SELECT r.*, i.initiative_name
       FROM reports r
       LEFT JOIN initiative i ON r.initiative_id = i.initiative_id
       WHERE r.id = ?`
    ).get(Number(id));

    logAudit(db, {
      event: 'report.updated',
      userEmail: auth.user.email,
      targetType: 'report',
      targetId: String(id),
      payload: {
        changes: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(status !== undefined ? { status } : {}),
        },
      },
    });

    return NextResponse.json({ success: true, report: toReportDetailDto(updated) });
  } catch (error) {
    console.error('Error updating report:', error);
    return NextResponse.json(
      { error: 'Failed to update report', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const deleteValidation = validateReportDeleteParams(searchParams);
    if (!deleteValidation.valid) {
      return NextResponse.json({ error: deleteValidation.error }, { status: 400 });
    }

    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'reports.create');
    if (auth.error) return auth.error;

    const { id } = deleteValidation;

    const existing = db.prepare('SELECT id, name FROM reports WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM reports WHERE id = ?').run(id);

    logAudit(db, {
      event: 'report.deleted',
      userEmail: auth.user.email,
      targetType: 'report',
      targetId: String(id),
      payload: { name: existing.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    return NextResponse.json(
      { error: 'Failed to delete report', details: error.message },
      { status: 500 }
    );
  }
}
