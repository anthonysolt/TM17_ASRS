import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getServiceContainer } from '@/lib/container/service-container';
import { logAudit } from '@/lib/audit';
import { toInitiativeDto } from '@/lib/adapters/initiative-adapter';
import { requireAuth, requirePermission } from '@/lib/auth/server-auth';

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

export async function GET(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requireAuth(request, db);
    if (auth.error) return auth.error;

    const { id } = await params;
    const row = db.prepare(`
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
      WHERE i.initiative_id = ?
      GROUP BY i.initiative_id
    `).get(Number(id));
    if (!row) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }
    return NextResponse.json({ initiative: toInitiativeDto(row) });
  } catch (error) {
    console.error('Error fetching initiative:', error);
    return NextResponse.json({ error: 'Failed to load initiative' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'initiatives.manage');
    if (auth.error) return auth.error;

    const { id } = await params;
    const existing = db.prepare('SELECT * FROM initiative WHERE initiative_id = ?').get(Number(id));
    if (!existing) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    const body = await request.json();
    const name = String(body.name || '').trim();
    const description = String(body.description || '').trim();
    const attributes = Array.isArray(body.attributes) ? body.attributes : JSON.parse(existing.attributes || '[]');
    const questions = Array.isArray(body.questions) ? body.questions : JSON.parse(existing.questions || '[]');
    const settings = body.settings && typeof body.settings === 'object' ? body.settings : JSON.parse(existing.settings || '{}');

    if (!name) {
      return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
    }

    const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    db.prepare(
      'UPDATE initiative SET initiative_name = ?, description = ?, attributes = ?, questions = ?, settings = ?, updated_at = ? WHERE initiative_id = ?'
    ).run(name, description, JSON.stringify(attributes), JSON.stringify(questions), JSON.stringify(settings), now, Number(id));

    const updated = db.prepare('SELECT * FROM initiative WHERE initiative_id = ?').get(Number(id));
    await syncInitiativesToJson(db);

    logAudit(db, {
      event: 'initiative.updated',
      userEmail: auth.user.email,
      targetType: 'initiative',
      targetId: String(id),
      payload: { name, description },
    });

    return NextResponse.json({ success: true, initiative: toInitiativeDto(updated) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return NextResponse.json({ error: 'Initiative with the same name already exists' }, { status: 409 });
    }
    console.error('Error updating initiative:', error);
    return NextResponse.json({ error: 'Failed to update initiative' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'initiatives.manage');
    if (auth.error) return auth.error;

    const { id } = await params;
    const existing = db.prepare('SELECT * FROM initiative WHERE initiative_id = ?').get(Number(id));
    if (!existing) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM initiative WHERE initiative_id = ?').run(Number(id));
    await syncInitiativesToJson(db);

    logAudit(db, {
      event: 'initiative.deleted',
      userEmail: auth.user.email,
      targetType: 'initiative',
      targetId: String(id),
      payload: { name: existing.initiative_name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting initiative:', error);
    return NextResponse.json({ error: 'Failed to delete initiative' }, { status: 500 });
  }
}
