import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getServiceContainer } from '@/lib/container/service-container';
import { logAudit } from '@/lib/audit';
import { toInitiativeCreateInput, toInitiativeDto } from '@/lib/adapters/initiative-adapter';
import { requireAuth, requirePermission } from '@/lib/auth/server-auth';
import { syncInitiativeAttributes } from '@/lib/initiative-attributes';

const INITIATIVES_PATH = path.join(process.cwd(), 'src', 'data', 'initiatives.json');

async function syncInitiativesToJson(db) {
  try {
    const rows = db.prepare('SELECT * FROM initiative').all();
    const initiatives = rows.map(r => ({
      id: r.initiative_id,
      name: r.initiative_name,
      description: r.description || '',
      attributes: JSON.parse(r.attributes || '[]'),
      questions: JSON.parse(r.questions || '[]'),
      settings: JSON.parse(r.settings || '{}'),
    }));
    await fs.writeFile(INITIATIVES_PATH, JSON.stringify({ initiatives }, null, 2), 'utf8');
  } catch (e) {
    console.warn('[initiatives] Could not sync to JSON:', e.message);
  }
}

export async function GET(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requireAuth(request, db);
    if (auth.error) return auth.error;

    const rows = db.prepare(`
      SELECT
        i.*,
        MIN(c.category_name) AS category_name,
        (SELECT COUNT(*) FROM submission s WHERE s.initiative_id = i.initiative_id) AS submission_count,
        (SELECT COUNT(DISTINCT s.submitted_by_user_id) FROM submission s WHERE s.initiative_id = i.initiative_id AND s.submitted_by_user_id IS NOT NULL) AS participant_count,
        (SELECT AVG(
          CASE WHEN g.target_value > 0 THEN (g.current_value / g.target_value) * 100 ELSE 0 END
        ) FROM initiative_goal g WHERE g.initiative_id = i.initiative_id) AS avg_score
      FROM initiative i
      LEFT JOIN initiative_category ic ON ic.initiative_id = i.initiative_id
      LEFT JOIN category c ON c.category_id = ic.category_id
      GROUP BY i.initiative_id
    `).all();
    const initiatives = rows.map(toInitiativeDto);
    return NextResponse.json({ initiatives });
  } catch (error) {
    console.error('Error fetching initiatives:', error);
    return NextResponse.json({ error: 'Failed to load initiatives' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'initiatives.manage');
    if (auth.error) return auth.error;

    const body = await request.json();
    const input = toInitiativeCreateInput(body);

    if (!input.name) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
    }

    const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    const result = db.prepare(
      'INSERT INTO initiative (initiative_name, description, attributes, questions, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      input.name,
      input.description,
      JSON.stringify(input.attributes),
      JSON.stringify(input.questions),
      JSON.stringify(input.settings),
      now,
      now
    );

    const row = db.prepare('SELECT * FROM initiative WHERE initiative_id = ?').get(Number(result.lastInsertRowid));
    syncInitiativeAttributes(
      db,
      Number(result.lastInsertRowid),
      Array.isArray(body.attribute_variables) ? body.attribute_variables : input.attributes
    );

    // Sync full initiative list back to JSON seed file
    await syncInitiativesToJson(db);

    logAudit(db, {
      event: 'initiative.created',
      userEmail: auth.user.email,
      targetType: 'initiative',
      targetId: String(result.lastInsertRowid),
      payload: { name: input.name, description: input.description },
    });

    return NextResponse.json({
      success: true,
      initiative: toInitiativeDto(row),
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return NextResponse.json({ error: 'Initiative with the same name already exists' }, { status: 409 });
    }

    console.error('Error creating initiative:', error);
    return NextResponse.json(
      { error: 'Failed to create initiative', details: error.message },
      { status: 500 }
    );
  }
}
