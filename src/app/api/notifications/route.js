import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requireAuth } from '@/lib/auth/server-auth';
import { buildNotificationsFeed } from '@/lib/notifications';

export async function GET(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requireAuth(request, db, { requireCsrf: false });
    if (auth.error) return auth.error;

    const activity = db.prepare(`
      SELECT audit_id, event, payload, created_at
      FROM audit_log
      WHERE event IN ('report.created', 'report.deleted', 'form.created', 'form.deleted', 'goal.met')
      ORDER BY created_at DESC, audit_id DESC
      LIMIT 50
    `).all();

    const notifications = buildNotificationsFeed({
      activity,
    });

    return NextResponse.json({ notifications: notifications.slice(0, 50) });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}
