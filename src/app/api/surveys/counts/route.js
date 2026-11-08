import { NextResponse } from 'next/server';
import db, { initializeDatabase } from '@/lib/db';
import { requirePermission } from '@/lib/auth/server-auth';
import { countSubmissionsByTemplate } from '@/lib/surveys/submission-store';

// GET /api/surveys/counts[?initiativeId=]
// Response counts per survey: { counts: { [templateId]: n }, total }.
// Lets pages show counts without downloading the responses themselves.
export async function GET(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'surveys.distribute', { requireCsrf: false });
    if (auth.error) return auth.error;

    const raw = new URL(request.url).searchParams.get('initiativeId');
    let initiativeId = null;
    if (raw !== null && raw !== '') {
      initiativeId = Number(raw);
      if (!Number.isInteger(initiativeId) || initiativeId < 1) {
        return NextResponse.json({ error: 'initiativeId must be a positive integer' }, { status: 400 });
      }
    }

    return NextResponse.json(countSubmissionsByTemplate(db, { initiativeId }));
  } catch (error) {
    console.error('Error counting survey responses:', error);
    return NextResponse.json({ error: 'Failed to count survey responses', details: error.message }, { status: 500 });
  }
}
