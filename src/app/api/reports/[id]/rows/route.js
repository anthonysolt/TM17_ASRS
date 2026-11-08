import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requirePermission } from '@/lib/auth/server-auth';
import { normalizeSnapshot } from '@/lib/report-snapshot';
import { computeReportRows } from '@/lib/reports/report-rows';

// GET /api/reports/[id]/rows
// Every response row for a saved report, used by downloads. The snapshot only
// stores the first rows, so this re-runs the report's saved question
// selections, filters and date range against current responses.
// Returns { rows, total, source }: source is 'live', or 'snapshot' for older
// reports that have no question selections to re-run (their stored rows).
export async function GET(request, { params }) {
  try {
    const { db, reportEngine } = getServiceContainer();
    const auth = requirePermission(request, db, 'reporting.view');
    if (auth.error) return auth.error;

    const { id } = await params;
    const reportId = Number(id);
    if (!Number.isInteger(reportId) || reportId < 1) {
      return NextResponse.json({ error: 'Invalid report id' }, { status: 400 });
    }

    const row = db.prepare('SELECT id, report_data FROM reports WHERE id = ?').get(reportId);
    if (!row) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    let parsed = null;
    try {
      parsed = typeof row.report_data === 'string' ? JSON.parse(row.report_data) : row.report_data;
    } catch {
      parsed = null;
    }
    const snapshot = normalizeSnapshot(parsed);
    if (!snapshot) {
      return NextResponse.json({ error: 'This report has no saved data' }, { status: 422 });
    }

    const live = computeReportRows(db, reportEngine, snapshot.config);
    if (live) {
      return NextResponse.json({ rows: live.rows, total: live.rows.length, source: 'live' });
    }

    const stored = Array.isArray(snapshot.results?.filteredTableData) ? snapshot.results.filteredTableData : [];
    return NextResponse.json({ rows: stored, total: stored.length, source: 'snapshot' });
  } catch (error) {
    console.error('Error loading report rows:', error);
    return NextResponse.json({ error: 'Failed to load report rows', details: error.message }, { status: 500 });
  }
}
