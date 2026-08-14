import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requireAuth } from '@/lib/auth/server-auth';
import { buildNotificationsFeed } from '@/lib/notifications';

function toLocalYyyyMmDd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function GET(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requireAuth(request, db, { requireCsrf: false });
    if (auth.error) return auth.error;

    const surveySubmissions = db.prepare(
      'SELECT id, name, email, submitted_at FROM surveys ORDER BY submitted_at DESC LIMIT 20'
    ).all();

    const reports = db.prepare(
      'SELECT id, name, status, created_at FROM reports ORDER BY created_at DESC LIMIT 20'
    ).all();

    const initiatives = db.prepare(
      'SELECT initiative_id, initiative_name FROM initiative ORDER BY initiative_id DESC LIMIT 20'
    ).all();

    const today = toLocalYyyyMmDd(new Date());
    const activeSurveys = db.prepare(`
      SELECT sd.distribution_id, sd.title, sd.created_at, sd.start_date, sd.end_date, sd.status,
             i.initiative_name
      FROM survey_distribution sd
      LEFT JOIN form f ON sd.survey_template_id = CAST(f.form_id AS TEXT)
      LEFT JOIN initiative i ON f.initiative_id = i.initiative_id
      ORDER BY sd.created_at DESC
      LIMIT 20
    `).all().filter((survey) => {
      if (survey.status === 'closed') return false;
      return today >= survey.start_date && today <= survey.end_date;
    });

    const notifications = buildNotificationsFeed({
      userType: auth.user.user_type,
      surveySubmissions,
      reports,
      initiatives,
      activeSurveys,
    });

    return NextResponse.json({ notifications: notifications.slice(0, 50) });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}
