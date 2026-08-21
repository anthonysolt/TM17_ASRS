import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requirePermission } from '@/lib/auth/server-auth';

export async function GET(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'reporting.view');
    if (auth.error) return auth.error;

    const { id } = await params;
    const initiativeId = Number(id);
    if (!Number.isInteger(initiativeId) || initiativeId <= 0) {
      return NextResponse.json({ error: 'Invalid initiative id' }, { status: 400 });
    }

    const initiative = db.prepare(
      'SELECT initiative_id FROM initiative WHERE initiative_id = ?'
    ).get(initiativeId);
    if (!initiative) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    const questions = db.prepare(`
      SELECT f.field_id AS id, f.field_label AS label, f.field_type AS type,
             MIN(fq.display_order) AS display_order
      FROM field f
      JOIN form_questions fq ON fq.field_id = f.field_id
      JOIN form fm ON fm.form_id = fq.form_id
      WHERE fm.initiative_id = ?
      GROUP BY f.field_id, f.field_label, f.field_type
      ORDER BY display_order, f.field_id
    `).all(initiativeId).map((question) => ({
      ...question,
      label: question.label || `Question ${question.id}`,
    }));

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error fetching report questions:', error);
    return NextResponse.json({ error: 'Failed to fetch report questions' }, { status: 500 });
  }
}
