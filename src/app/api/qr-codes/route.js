import { NextResponse } from 'next/server';
import { db, initializeDatabase } from '@/lib/db';
import { requirePermission } from '@/lib/auth/server-auth';

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
          f.form_name AS template_title,
          COUNT(s.scan_id) AS total_scans,
          COUNT(DISTINCT s.ip_address) AS unique_ips,
          SUM(CASE WHEN s.converted_to_submission = 1 THEN 1 ELSE 0 END) AS conversions,
          MAX(s.scanned_at) AS last_scanned_at
        FROM qr_codes q
        LEFT JOIN qr_scans s ON s.qr_code_id = q.qr_code_id
        LEFT JOIN form f
          ON q.qr_type = 'survey_template'
         AND CAST(q.target_id AS INTEGER) = f.form_id
        WHERE (
          ? = 'all'
          OR (? = 'survey' AND q.qr_type IN ('survey', 'survey_template'))
          OR (? = 'report' AND q.qr_type = 'report')
        )
        GROUP BY q.qr_code_id, f.form_name
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
          uniqueIPs: Number(row.unique_ips || 0),
          conversions,
          conversionRate:
            totalScans > 0 ? Number(((conversions / totalScans) * 100).toFixed(2)) : 0,
          lastScannedAt: row.last_scanned_at || null,
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
