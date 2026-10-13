import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requirePermission } from '@/lib/auth/server-auth';
import { queryReportGoals } from '@/lib/goals/report-goals';

// GET - Goals of one initiative that can be included on a report
export async function GET(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'reports.create');
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

    return NextResponse.json({ goals: queryReportGoals(db, initiativeId) });
  } catch (error) {
    console.error('Error fetching report goals:', error);
    return NextResponse.json({ error: 'Failed to fetch report goals' }, { status: 500 });
  }
}
