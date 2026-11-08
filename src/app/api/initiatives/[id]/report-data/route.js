import { NextResponse } from 'next/server';
import { db, initializeDatabase } from '@/lib/db';
import { queryInitiativeQuestions, queryTableData, submittedAtClause } from '@/lib/query-helpers';
import { requirePermission } from '@/lib/auth/server-auth';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request, { params }) {
  try {
    initializeDatabase();

    const auth = requirePermission(request, db, 'reporting.view');
    if (auth.error) return auth.error;

    const { id } = await params;
    const initiativeId = Number(id);

    const initiative = db.prepare(
      'SELECT initiative_id, initiative_name FROM initiative WHERE initiative_id = ?'
    ).get(initiativeId);

    if (!initiative) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    // Optional response date range for the rows (the report builder's live counts).
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || null;
    const endDate = searchParams.get('endDate') || null;
    if ((startDate && !DATE_ONLY_RE.test(startDate)) || (endDate && !DATE_ONLY_RE.test(endDate))) {
      return NextResponse.json({ error: 'startDate and endDate must be in YYYY-MM-DD format' }, { status: 400 });
    }

    const dateRange = { startDate, endDate };
    // Applied to the rows and to the summary and chart queries below, so they all agree.
    const dateClause = submittedAtClause(dateRange);
    const tableData = queryTableData(db, initiativeId, dateRange);

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

    // Compute chart data from real submission values
    // field_id is the question's root id, so answers from every revision count.
    const chartFields = queryInitiativeQuestions(db, initiativeId);

    const chartData = {};
    const MAX_CATEGORICAL_VALUES = 15;
    for (const field of chartFields) {
      const key = field.field_label || field.field_key;

      if (['select', 'choice', 'multiselect', 'yesno', 'boolean'].includes(field.field_type)) {
        const distribution = db.prepare(`
          SELECT sv.value_text as name, COUNT(*) as value
          FROM submission_value sv
          JOIN submission s ON s.submission_id = sv.submission_id
          JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
          WHERE s.initiative_id = ? AND fq.root_field_id = ? AND sv.value_text IS NOT NULL${dateClause.sql}
          GROUP BY sv.value_text
          ORDER BY value DESC
        `).all(initiativeId, field.field_id, ...dateClause.params);
        if (distribution.length > 0) {
          chartData[key] = distribution;
        }
      } else if (field.field_type === 'rating') {
        const distribution = db.prepare(`
          SELECT CAST(sv.value_number AS INTEGER) as name, COUNT(*) as value
          FROM submission_value sv
          JOIN submission s ON s.submission_id = sv.submission_id
          JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
          WHERE s.initiative_id = ? AND fq.root_field_id = ? AND sv.value_number IS NOT NULL${dateClause.sql}
          GROUP BY CAST(sv.value_number AS INTEGER)
          ORDER BY name
        `).all(initiativeId, field.field_id, ...dateClause.params);
        if (distribution.length > 0) {
          chartData[key] = distribution.map(d => ({
            name: `Rating ${d.name}`,
            value: d.value,
          }));
        }
      } else if (field.field_type === 'text') {
        const distribution = db.prepare(`
          SELECT sv.value_text as name, COUNT(*) as value
          FROM submission_value sv
          JOIN submission s ON s.submission_id = sv.submission_id
          JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
          WHERE s.initiative_id = ? AND fq.root_field_id = ? AND sv.value_text IS NOT NULL${dateClause.sql}
          GROUP BY sv.value_text
          ORDER BY value DESC
        `).all(initiativeId, field.field_id, ...dateClause.params);
        if (distribution.length > 1 && distribution.length <= MAX_CATEGORICAL_VALUES) {
          chartData[key] = distribution;
        }
      } else if (field.field_type === 'number') {
        const distribution = db.prepare(`
          SELECT CAST(sv.value_number AS INTEGER) as name, COUNT(*) as value
          FROM submission_value sv
          JOIN submission s ON s.submission_id = sv.submission_id
          JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
          WHERE s.initiative_id = ? AND fq.root_field_id = ? AND sv.value_number IS NOT NULL${dateClause.sql}
          GROUP BY CAST(sv.value_number AS INTEGER)
          ORDER BY name
        `).all(initiativeId, field.field_id, ...dateClause.params);
        if (distribution.length > 1 && distribution.length <= 10) {
          chartData[key] = distribution.map(d => ({ name: String(d.name), value: d.value }));
        }
      }
    }

    return NextResponse.json({
      reportId: `RPT-db-${initiativeId}`,
      initiativeId,
      initiativeName: initiative.initiative_name,
      generatedDate: new Date().toISOString().slice(0, 10),
      summary,
      chartData,
      tableData,
    });
  } catch (error) {
    console.error('Error fetching report data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch report data', details: error.message },
      { status: 500 }
    );
  }
}
