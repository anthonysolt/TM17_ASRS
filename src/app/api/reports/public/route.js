import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { isInitiativePublic } from '@/lib/adapters/initiative-adapter';

export async function GET(request) {
  try {
    const { db } = getServiceContainer();

    const initiativeIdParam = request?.nextUrl?.searchParams?.get('initiativeId');
    const initiativeId = initiativeIdParam ? Number(initiativeIdParam) : null;
    if (initiativeIdParam && !Number.isInteger(initiativeId)) {
      return NextResponse.json({ error: 'Invalid initiativeId' }, { status: 400 });
    }

    const params = [];
    let initiativeFilter = '';
    if (initiativeId) {
      initiativeFilter = 'AND r.initiative_id = ?';
      params.push(initiativeId);
    }

    const rows = db.prepare(`
      SELECT r.id, r.initiative_id, r.name, r.description, r.status,
             r.created_at, r.published_at, r.display_order, r.report_data,
             i.initiative_name, i.settings AS initiative_settings
      FROM reports r
      LEFT JOIN initiative i ON r.initiative_id = i.initiative_id
      WHERE LOWER(r.status) = 'published'
        ${initiativeFilter}
      ORDER BY r.display_order ASC, COALESCE(r.published_at, r.created_at) DESC
    `).all(...params);

    // Only reports of initiatives marked public are shown.
    const reports = rows.filter((row) => isInitiativePublic(row.initiative_settings)).map((row) => ({
      id: Number(row.id),
      initiative_id: row.initiative_id == null ? null : Number(row.initiative_id),
      initiative_name: row.initiative_name || null,
      name: row.name || '',
      description: row.description || '',
      status: row.status || 'published',
      display_order: Number(row.display_order || 0),
      created_at: row.created_at || null,
      published_at: row.published_at || null,
      report_data: row.report_data || '{}',
    }));

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Error fetching public reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}
