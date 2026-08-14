import { NextResponse } from 'next/server';
import { queryTableData } from '@/lib/query-helpers';
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
import { generateReportInsights } from '@/lib/openai-report-insights';

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

function safeParseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
    const sql = `SELECT r.*, i.initiative_name
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
      'SELECT initiative_id, initiative_name, description, attributes FROM initiative WHERE initiative_id = ?'
    ).get(initiativeId);

    if (!initiative) {
      return NextResponse.json({ error: 'No data found for this initiative' }, { status: 404 });
    }

    const tableData = queryTableData(db, initiativeId);
    const attributes = safeParseJson(initiative.attributes, []);

    // Compute summary from real submission data
    const submissionCount = db.prepare(
      'SELECT COUNT(*) as count FROM submission WHERE initiative_id = ?'
    ).get(initiativeId).count;

    const avgResult = db.prepare(`
      SELECT AVG(sv.value_number) as avg_score
      FROM submission_value sv
      JOIN submission s ON s.submission_id = sv.submission_id
      JOIN field f ON f.field_id = sv.field_id
      WHERE s.initiative_id = ? AND f.field_type = 'rating' AND sv.value_number IS NOT NULL
    `).get(initiativeId);

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

    // Compute chart data from real submission values
    const chartFields = db.prepare(`
      SELECT DISTINCT f.field_id, f.field_key, f.field_label, f.field_type
      FROM field f
      JOIN form_field ff ON ff.field_id = f.field_id
      JOIN form fm ON fm.form_id = ff.form_id
      WHERE fm.initiative_id = ?
    `).all(initiativeId);

    const chartData = {};
    const MAX_CATEGORICAL_VALUES = 15;
    for (const field of chartFields) {
      const key = field.field_key || field.field_label;

      if (['select', 'choice', 'multiselect', 'yesno', 'boolean'].includes(field.field_type)) {
        const distribution = db.prepare(`
          SELECT sv.value_text as name, COUNT(*) as value
          FROM submission_value sv
          JOIN submission s ON s.submission_id = sv.submission_id
          WHERE s.initiative_id = ? AND sv.field_id = ? AND sv.value_text IS NOT NULL
          GROUP BY sv.value_text
          ORDER BY value DESC
        `).all(initiativeId, field.field_id);
        if (distribution.length > 0) {
          chartData[key] = distribution;
        }
      } else if (field.field_type === 'rating') {
        const distribution = db.prepare(`
          SELECT CAST(sv.value_number AS INTEGER) as name, COUNT(*) as value
          FROM submission_value sv
          JOIN submission s ON s.submission_id = sv.submission_id
          WHERE s.initiative_id = ? AND sv.field_id = ? AND sv.value_number IS NOT NULL
          GROUP BY CAST(sv.value_number AS INTEGER)
          ORDER BY name
        `).all(initiativeId, field.field_id);
        if (distribution.length > 0) {
          chartData[key] = distribution.map(d => ({
            name: `Rating ${d.name}`,
            value: d.value,
          }));
        }
      } else if (field.field_type === 'text') {
        // Text fields with low cardinality are categorical — chart them
        const distribution = db.prepare(`
          SELECT sv.value_text as name, COUNT(*) as value
          FROM submission_value sv
          JOIN submission s ON s.submission_id = sv.submission_id
          WHERE s.initiative_id = ? AND sv.field_id = ? AND sv.value_text IS NOT NULL
          GROUP BY sv.value_text
          ORDER BY value DESC
        `).all(initiativeId, field.field_id);
        if (distribution.length > 1 && distribution.length <= MAX_CATEGORICAL_VALUES) {
          chartData[key] = distribution;
        }
      } else if (field.field_type === 'number') {
        // Number fields with few distinct values — chart as discrete distribution
        const distribution = db.prepare(`
          SELECT CAST(sv.value_number AS INTEGER) as name, COUNT(*) as value
          FROM submission_value sv
          JOIN submission s ON s.submission_id = sv.submission_id
          WHERE s.initiative_id = ? AND sv.field_id = ? AND sv.value_number IS NOT NULL
          GROUP BY CAST(sv.value_number AS INTEGER)
          ORDER BY name
        `).all(initiativeId, field.field_id);
        if (distribution.length > 1 && distribution.length <= 10) {
          chartData[key] = distribution.map(d => ({ name: String(d.name), value: d.value }));
        }
      }
    }

    const filters = payload.filters || {};
    const expressions = payload.expressions || [];
    const sorts = payload.sorts || [];

    const incomingTrendConfig = payload.trendConfig === undefined
      ? { variables: [], enabledCalc: false, enabledDisplay: true }
      : payload.trendConfig;

    // Combine initiative attributes with actual tableData columns for validation
    const tableColumns = tableData.length > 0
      ? Object.keys(tableData[0]).filter(k => k !== 'submission_id' && k !== 'submitted_at')
      : [];
    const allAvailableAttributes = [...new Set([...attributes, ...tableColumns])];
    const trendConfigValidation = reportEngine.validateTrendConfig(incomingTrendConfig, allAvailableAttributes);
    if (!trendConfigValidation.valid) {
      return NextResponse.json({ error: trendConfigValidation.error }, { status: 400 });
    }

    const trendConfig = trendConfigValidation.normalized;

    generationLogId = startGenerationLog(db, {
      initiativeId,
      inputRows: tableData.length,
      filtersCount: Object.keys(filters).length,
      expressionsCount: expressions.length,
      sortsCount: sorts.length,
      trendVariablesCount: trendConfig.variables.length,
    });

    const { filteredData, metrics, explainability } = reportEngine.processReportData(
      tableData,
      filters,
      expressions,
      sorts,
      attributes
    );

    const trendData = reportEngine.computeTrendData(filteredData, trendConfig, {
      initiativeId,
      reportName: payload.name || '',
    });

    // Optional AI insights generation
    let aiInsights = null;
    if (payload.includeAiInsights) {
      const aiStartedAt = Date.now();
      try {
        aiInsights = await generateReportInsights({
          initiativeName: initiative.initiative_name,
          summary,
          metrics,
          chartData,
          trendData,
          sampleTableData: filteredData.slice(0, 50),
        });
        if (!aiInsights.aiGenerated) aiInsights = null;
      } catch {
        aiInsights = null;
      }
      const aiDurationMs = Date.now() - aiStartedAt;
      // Log AI duration if generation log exists
      if (generationLogId) {
        try {
          db.prepare(
            'UPDATE report_generation_log SET ai_status = ?, ai_duration_ms = ? WHERE log_id = ?'
          ).run(aiInsights ? 'completed' : 'failed', aiDurationMs, Number(generationLogId));
        } catch {
          // ai columns may not exist yet — ignore
        }
      }
    }

    const snapshot = {
      version: 2,
      config: {
        initiativeId,
        initiativeName: initiative.initiative_name,
        filters,
        expressions,
        sorts,
        trendConfig,
      },
      results: {
        metrics,
        explainability,
        filteredTableData: filteredData,
        chartData,
        trendData,
        summary,
        aiInsights,
        reportId: `RPT-db-${initiativeId}`,
        initiativeName: initiative.initiative_name,
        generatedDate: clock.todayIsoDate(),
      },
      generatedAt: clock.nowIso(),
    };

    const result = db.prepare(
      `INSERT INTO reports (initiative_id, name, description, status, created_by, report_data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      initiativeId,
      payload.name || '',
      payload.description || '',
      'completed',
      payload.createdBy || '',
      JSON.stringify(snapshot),
      clock.nowIso()
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

    const existing = db.prepare('SELECT id FROM reports WHERE id = ?').get(Number(id));
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
