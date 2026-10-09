import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';

export async function GET() {
  try {
    const { db } = getServiceContainer();

    // Every initiative gets a public report page, so list all of them along with
    // how many published reports each one has.
    const rows = db.prepare(`
      SELECT i.initiative_id, i.initiative_name, i.description,
             i.attributes, i.created_at, i.updated_at,
             (
               SELECT COUNT(*) FROM reports r
               WHERE r.initiative_id = i.initiative_id
                 AND LOWER(r.status) = 'published'
             ) AS published_report_count
      FROM initiative i
      ORDER BY i.initiative_name ASC
    `).all();

    const initiatives = rows.map((row) => ({
      id: Number(row.initiative_id),
      name: row.initiative_name || '',
      description: row.description || '',
      attributes: (() => {
        try { return JSON.parse(row.attributes || '[]'); } catch { return []; }
      })(),
      status: 'active',
      published_report_count: Number(row.published_report_count || 0),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    }));

    return NextResponse.json({ initiatives });
  } catch (error) {
    console.error('Error fetching public initiatives:', error);
    return NextResponse.json(
      { error: 'Failed to fetch initiatives' },
      { status: 500 }
    );
  }
}
