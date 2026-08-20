import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requireAuth } from '@/lib/auth/server-auth';
import { queryInitiativeReportOptions } from '@/lib/query-helpers';

export async function GET(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requireAuth(request, db);
    if (auth.error) return auth.error;

    const { id } = await params;
    const initiativeId = Number(id);
    if (!Number.isFinite(initiativeId) || initiativeId <= 0) {
      return NextResponse.json({ error: 'Invalid initiative id' }, { status: 400 });
    }

    const initiative = db.prepare(
      'SELECT initiative_id FROM initiative WHERE initiative_id = ?'
    ).get(initiativeId);
    if (!initiative) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    return NextResponse.json(queryInitiativeReportOptions(db, initiativeId));
  } catch (error) {
    console.error('Error fetching report options:', error);
    return NextResponse.json({ error: 'Failed to load report options' }, { status: 500 });
  }
}
