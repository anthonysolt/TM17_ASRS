import db, { initializeDatabase } from '@/lib/db';
import { NextResponse } from 'next/server';

function toLocalYyyyMmDd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Public endpoint — no auth required. Returns only active survey distributions
// with minimal data (no recipient emails, no internal IDs).
export async function GET() {
  try {
    initializeDatabase();

    const today = toLocalYyyyMmDd(new Date());

    const rows = db.prepare(`
      SELECT sd.distribution_id, sd.survey_template_id, sd.title, sd.start_date, sd.end_date,
             sd.status, f.initiative_id, i.initiative_name
      FROM survey_distribution sd
      LEFT JOIN form f ON sd.survey_template_id = CAST(f.form_id AS TEXT)
      LEFT JOIN initiative i ON f.initiative_id = i.initiative_id
      ORDER BY sd.created_at DESC
    `).all();

    const surveys = rows
      .filter((row) => {
        if (row.status === 'closed') return false;
        return today >= row.start_date && today <= row.end_date;
      })
      .map((row) => ({
        id: row.distribution_id,
        templateId: row.survey_template_id,
        title: row.title,
        endDate: row.end_date,
        initiativeName: row.initiative_name || null,
      }));

    return NextResponse.json({ surveys });
  } catch (error) {
    console.error('Error fetching active surveys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch surveys' },
      { status: 500 }
    );
  }
}
