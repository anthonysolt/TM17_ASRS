import { NextResponse } from 'next/server';
import { db, initializeDatabase } from '@/lib/db';
import { queryTableData } from '@/lib/query-helpers';
import { requirePermission } from '@/lib/auth/server-auth';

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

    const tableData = queryTableData(db, initiativeId);

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
