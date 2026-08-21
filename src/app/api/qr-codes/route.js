import { NextResponse } from 'next/server';
import { db, initializeDatabase } from '@/lib/db';
import { requirePermission } from '@/lib/auth/server-auth';
import { logAudit } from '@/lib/audit';

initializeDatabase();

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export async function GET(request) {
  try {
    // Require authenticated user with minimum access rank 50 (admin/staff)
    const auth = await requirePermission(request, db, 'surveys.distribute', { requireCsrf: true });
    if (!auth || auth.error) {
      // Early return if user is not authenticated or not authorized
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || 'all';

    const rows = db
      .prepare(`
        SELECT
          q.qr_code_id,
          q.qr_code_key,
          q.qr_type,
          q.target_id,
          q.target_url,
          q.description,
          q.created_at,
          q.expires_at,
          q.is_active,
          q.qr_viewcount AS total_scans,
          q.qr_conversion AS conversions,
          f.form_name AS template_title
        FROM qr_codes q
        LEFT JOIN form f
          ON q.qr_type = 'survey_template'
         AND CAST(q.target_id AS INTEGER) = f.form_id
        WHERE (
          ? = 'all'
          OR (? = 'survey' AND q.qr_type IN ('survey', 'survey_template'))
          OR (? = 'report' AND q.qr_type = 'report')
        )
        ORDER BY q.created_at DESC
      `)
      .all(scope, scope, scope);

    const qrCodes = rows.map((row) => {
      const totalScans = Number(row.total_scans || 0);
      const conversions = Number(row.conversions || 0);
      return {
        qrCodeId: Number(row.qr_code_id),
        qrCodeKey: row.qr_code_key,
        qrType: row.qr_type,
        targetId: row.target_id,
        targetUrl: row.target_url,
        description: row.description,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        isActive: row.is_active === 1,
        isExpired: isExpired(row.expires_at),
        templateTitle: row.template_title || null,
        stats: {
          totalScans,
          conversions,
          conversionRate:
            totalScans > 0 ? Number(((conversions / totalScans) * 100).toFixed(2)) : 0,
        },
      };
    });

    return NextResponse.json({ qrCodes });
  } catch (error) {
    console.error('[QR Code List API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch QR codes', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const auth = await requirePermission(request, db, 'surveys.distribute');
    if (!auth || auth.error) return auth?.error || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const qrCodeKey = new URL(request.url).searchParams.get('qrCodeKey');
    if (!qrCodeKey) {
      return NextResponse.json({ error: 'qrCodeKey is required' }, { status: 400 });
    }
    const existing = db.prepare(
      'SELECT qr_code_id, qr_code_key, qr_type, target_id, description FROM qr_codes WHERE qr_code_key = ?'
    ).get(qrCodeKey);
    if (!existing) {
      return NextResponse.json({ error: 'QR code not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM qr_codes WHERE qr_code_id = ?').run(existing.qr_code_id);
    logAudit(db, {
      event: 'qr_code.deleted',
      userEmail: auth.user?.email,
      targetType: 'qr_code',
      targetId: String(existing.qr_code_id),
      payload: { qr_code_key: existing.qr_code_key, qr_type: existing.qr_type, target_id: existing.target_id },
    });
    return NextResponse.json({ success: true, qrCodeKey });
  } catch (error) {
    console.error('[QR Code DELETE API] Error:', error);
    return NextResponse.json({ error: 'Failed to delete QR code', details: error.message }, { status: 500 });
  }
}
