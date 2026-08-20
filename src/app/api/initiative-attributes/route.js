import db from '@/lib/db';
import { requirePermission } from '@/lib/auth/server-auth';

export async function GET(request) {
  const auth = requirePermission(request, db, 'forms.create');
  if (auth.error) return auth.error;
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get('scope') === 'all') {
    const attributes = db.prepare(`
      SELECT MIN(attribute_id) AS attribute_id, name, MIN(data_type) AS data_type
      FROM initiative_attribute
      GROUP BY name
      ORDER BY name
    `).all().map(attribute => ({ ...attribute, shared: true }));
    return Response.json({ attributes });
  }

  const initiativeId = Number(searchParams.get('initiativeId'));
  if (!Number.isInteger(initiativeId) || initiativeId <= 0) {
    return Response.json({ error: 'initiativeId must be a positive integer' }, { status: 400 });
  }
  const attributes = db.prepare(`
    SELECT attribute_id, name, data_type, initiative_id
    FROM initiative_attribute WHERE initiative_id = ? ORDER BY name
  `).all(initiativeId);
  return Response.json({ attributes });
}
