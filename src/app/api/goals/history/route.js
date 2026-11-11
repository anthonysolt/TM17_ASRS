import { NextResponse } from 'next/server';
import db, { initializeDatabase } from '@/lib/db';
import { requirePermission } from '@/lib/auth/server-auth';
import { hasInvalidDateRange } from '@/lib/report-date-range';
import { buildTimeline } from '@/lib/goals/goal-history';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects e.g. 2026-02-31). */
function isValidIsoDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** 12 months before `endDate` (YYYY-MM-DD), or before today when there is none. */
function defaultFromDate(endDate) {
  const date = endDate ? new Date(`${endDate}T00:00:00Z`) : new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'goals.manage');
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const initiativeId = searchParams.get('initiativeId');

    if (!initiativeId) {
      return NextResponse.json(
        { error: 'Missing required parameter: initiativeId' },
        { status: 400 }
      );
    }

    const initiative = db.prepare(
      'SELECT initiative_id, initiative_name FROM initiative WHERE initiative_id = ?'
    ).get(initiativeId);

    if (!initiative) {
      return NextResponse.json(
        { error: 'Initiative not found' },
        { status: 404 }
      );
    }

    // Optional range as YYYY-MM-DD (inclusive). Without a from date it covers
    // the 12 months up to the to date (or up to today).
    const to = searchParams.get('to') || null;
    const requestedFrom = searchParams.get('from') || null;
    for (const [name, value] of [['from', requestedFrom], ['to', to]]) {
      if (value && !isValidIsoDate(value)) {
        return NextResponse.json({ error: `Invalid ${name} date; use a real date as YYYY-MM-DD` }, { status: 400 });
      }
    }
    const from = requestedFrom || defaultFromDate(to);
    if (hasInvalidDateRange({ startDate: from, endDate: to })) {
      return NextResponse.json({ error: 'The from date is after the to date' }, { status: 400 });
    }

    // Each goal's last recorded value before the range, so the first day of the
    // timeline starts from every goal's known value.
    const seedRows = db.prepare(`
      SELECT DISTINCT ON (gph.goal_id)
        gph.goal_id, gph.recorded_value, gph.target_value, gph.score, gph.recorded_at
      FROM goal_progress_history gph
      WHERE gph.initiative_id = ? AND substr(gph.recorded_at, 1, 10) < ?
      ORDER BY gph.goal_id, gph.recorded_at DESC, gph.history_id DESC
    `).all(initiativeId, from);

    // The last value per goal per day inside the range (at most goals x days rows).
    const dailyRows = db.prepare(`
      SELECT DISTINCT ON (gph.goal_id, substr(gph.recorded_at, 1, 10))
        gph.goal_id, gph.recorded_value, gph.target_value, gph.score, gph.recorded_at,
        substr(gph.recorded_at, 1, 10) AS day
      FROM goal_progress_history gph
      WHERE gph.initiative_id = ?
        AND substr(gph.recorded_at, 1, 10) >= ?
        AND (?::text IS NULL OR substr(gph.recorded_at, 1, 10) <= ?)
      ORDER BY gph.goal_id, substr(gph.recorded_at, 1, 10), gph.recorded_at DESC, gph.history_id DESC
    `).all(initiativeId, from, to, to);

    const goals = new Map(
      db.prepare('SELECT goal_id, goal_name, weight FROM initiative_goal WHERE initiative_id = ?')
        .all(initiativeId)
        .map((goal) => [goal.goal_id, goal])
    );

    const timeline = buildTimeline(seedRows, dailyRows, goals, from);
    return NextResponse.json({
      initiative: initiative,
      timeline,
      range: { from, to },
      totalSnapshots: dailyRows.length,
    });
  } catch (error) {
    console.error('Error fetching goal history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goal history', details: error.message },
      { status: 500 }
    );
  }
}
