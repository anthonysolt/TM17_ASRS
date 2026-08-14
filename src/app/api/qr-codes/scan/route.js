// ═══════════════════════════════════════════════════════════════════════════
// API ROUTE: Track QR Code Scans
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Records when a QR code is scanned and provides analytics data
// Requirements: Implements scan tracking requirement for QR codes
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import EVENTS from '@/lib/events/event-types';
import { requirePermission } from '@/lib/auth/server-auth';

// ══════════════════════════════════════════════════════════════════════════
// POST /api/qr-codes/scan
// ══════════════════════════════════════════════════════════════════════════
// Records a QR code scan event in the database for analytics
//
// This endpoint is called when:
// 1. A user scans a QR code and lands on a page with ?qr=qr_xxxxx parameter
// 2. The frontend JavaScript detects the QR parameter and calls this endpoint
//
// Request Body (JSON):
//   {
//     "qrCodeKey": string (required - the QR code identifier from URL),
//     "convertedToSubmission": boolean (optional - did user submit survey?)
//   }
//
// Response (JSON):
//   {
//     "success": true,
//     "scan": {
//       "scanId": number,
//       "qrCodeId": number,
//       "scannedAt": string (ISO timestamp)
//     },
//     "qrCode": {
//       "targetUrl": string,
//       "qrType": string,
//       "isActive": boolean,
//       "isExpired": boolean
//     }
//   }
//
// Error Response:
//   { "error": "Error message", "details": "Additional info" }
// ══════════════════════════════════════════════════════════════════════════
export async function POST(request) {
  try {
    const { db, eventBus, clock } = getServiceContainer();

    // ─────────────────────────────────────────────────────────────────────
    // STEP 1: Parse Request Body and Headers
    // ─────────────────────────────────────────────────────────────────────
    const body = await request.json();
    const { qrCodeKey, convertedToSubmission } = body;

    // Validate required field
    if (!qrCodeKey) {
      return NextResponse.json(
        { error: 'Missing required field: qrCodeKey' },
        { status: 400 }
      );
    }

    // Extract metadata from request headers for analytics
    // These help us understand who is scanning the QR codes and from where
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';
    const referrer = request.headers.get('referer') || null;

    // ─────────────────────────────────────────────────────────────────────
    // STEP 2: Look Up QR Code in Database
    // ─────────────────────────────────────────────────────────────────────
    // Find the QR code by its unique key
    // Also check if it's active and not expired
    const qrCode = db.prepare(`
      SELECT
        qr_code_id,
        qr_code_key,
        qr_type,
        target_id,
        target_url,
        is_active,
        expires_at,
        created_at
      FROM qr_codes
      WHERE qr_code_key = ?
    `).get(qrCodeKey);

    // QR code not found
    if (!qrCode) {
      return NextResponse.json(
        {
          error: 'QR code not found',
          details: `No QR code exists with key: ${qrCodeKey}`
        },
        { status: 404 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 3: Check if QR Code is Active and Not Expired
    // ─────────────────────────────────────────────────────────────────────
    const isActive = qrCode.is_active === 1;

    // Check expiration (if expires_at is set)
    let isExpired = false;
    if (qrCode.expires_at) {
      const expirationDate = new Date(qrCode.expires_at);
      const now = new Date();
      isExpired = now > expirationDate;
    }

    // Note: We still record the scan even if inactive/expired
    // This helps track attempted access to disabled QR codes
    // But we'll include this info in the response so the frontend can handle it

    // ─────────────────────────────────────────────────────────────────────
    // STEP 4: Record the Scan in Database
    // ─────────────────────────────────────────────────────────────────────
    // Insert a new record in the qr_scans table
    // This creates an audit trail of all QR code usage
    const insertScanStmt = db.prepare(`
      INSERT INTO qr_scans (
        qr_code_id,
        ip_address,
        user_agent,
        referrer,
        converted_to_submission
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const scanResult = insertScanStmt.run(
      qrCode.qr_code_id,                      // Which QR code was scanned
      ipAddress,                               // IP address of scanner
      userAgent,                               // Browser/device info
      referrer,                                // Where they came from
      convertedToSubmission ? 1 : null        // Did they submit? (null = unknown yet)
    );

    const scanId = scanResult.lastInsertRowid;

    eventBus.publish(EVENTS.QR_SCANNED, {
      scanId: Number(scanId),
      qrCodeId: Number(qrCode.qr_code_id),
      qrCodeKey: qrCode.qr_code_key,
      convertedToSubmission: Boolean(convertedToSubmission),
      scannedAt: clock.nowIso(),
    });

    // ─────────────────────────────────────────────────────────────────────
    // STEP 5: Return Success Response with QR Code Info
    // ─────────────────────────────────────────────────────────────────────
    // The frontend can use this information to:
    // - Redirect to the target URL
    // - Show a message if the QR code is expired/inactive
    // - Track conversion when user submits the survey
    return NextResponse.json({
      success: true,
      scan: {
        scanId: Number(scanId),
        qrCodeId: qrCode.qr_code_id,
        scannedAt: clock.nowIso()
      },
      qrCode: {
        qrCodeKey: qrCode.qr_code_key,
        targetUrl: qrCode.target_url,
        qrType: qrCode.qr_type,
        targetId: qrCode.target_id,
        isActive,
        isExpired
      }
    });

  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────
    // ERROR HANDLING
    // ─────────────────────────────────────────────────────────────────────
    console.error('[QR Code Scan API] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to record QR code scan',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// GET /api/qr-codes/scan?qrCodeKey=xxx
// ══════════════════════════════════════════════════════════════════════════
// Retrieves scan statistics for a specific QR code
//
// This endpoint is useful for:
// - Displaying analytics dashboards
// - Generating reports on QR code performance
// - Tracking conversion rates
//
// Query Parameters:
//   - qrCodeKey: string (required - the QR code identifier)
//
// Response (JSON):
//   {
//     "success": true,
//     "qrCode": { ... QR code details ... },
//     "stats": {
//       "totalScans": number,
//       "uniqueIPs": number,
//       "conversions": number,
//       "conversionRate": number (percentage),
//       "lastScannedAt": string (ISO timestamp),
//       "scansByDate": [ { date: string, count: number }, ... ]
//     }
//   }
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ 🔒 ACCESS CONTROL PLACEHOLDER - FOR FUTURE IMPLEMENTATION           │
// ├─────────────────────────────────────────────────────────────────────┤
// │ REQUIREMENT: Only Staff (access_rank >= 50) and Admin (access_rank │
// │ >= 100) users should be able to view scan analytics per            │
// │ requirements 9h (generate report output metrics).                  │
// │                                                                      │
// │ TO IMPLEMENT:                                                        │
// │ 1. Get the authenticated user from the session/token                │
// │ 2. Check user's access rank is >= 50 (staff or admin)              │
// │ 3. Return 403 Forbidden if insufficient permissions                │
// │                                                                      │
// │ Example:                                                             │
// │   const user = await getAuthenticatedUser(request);                 │
// │   if (!user || user.access_rank < 50) {                             │
// │     return NextResponse.json(                                       │
// │       { error: 'Staff access required to view analytics' },        │
// │       { status: 403 }                                               │
// │     );                                                               │
// │   }                                                                  │
// └─────────────────────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════════════════════
export async function GET(request) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'surveys.distribute', { requireCsrf: false });
    if (auth.error) return auth.error;

    // ─────────────────────────────────────────────────────────────────────
    // STEP 1: Parse Query Parameters
    // ─────────────────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const qrCodeKey = searchParams.get('qrCodeKey');

    if (!qrCodeKey) {
      return NextResponse.json(
        { error: 'Missing required parameter: qrCodeKey' },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 2: Get QR Code Details
    // ─────────────────────────────────────────────────────────────────────
    const qrCode = db.prepare(`
      SELECT
        qr_code_id,
        qr_code_key,
        qr_type,
        target_id,
        target_url,
        description,
        created_at,
        created_by_user_id,
        is_active,
        expires_at
      FROM qr_codes
      WHERE qr_code_key = ?
    `).get(qrCodeKey);

    if (!qrCode) {
      return NextResponse.json(
        { error: 'QR code not found' },
        { status: 404 }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 3: Calculate Scan Statistics
    // ─────────────────────────────────────────────────────────────────────

    // Total number of scans
    const totalScansResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM qr_scans
      WHERE qr_code_id = ?
    `).get(qrCode.qr_code_id);
    const totalScans = totalScansResult.count;

    // Number of unique IP addresses (approximate unique users)
    const uniqueIPsResult = db.prepare(`
      SELECT COUNT(DISTINCT ip_address) as count
      FROM qr_scans
      WHERE qr_code_id = ?
    `).get(qrCode.qr_code_id);
    const uniqueIPs = uniqueIPsResult.count;

    // Number of scans that converted to submissions
    const conversionsResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM qr_scans
      WHERE qr_code_id = ? AND converted_to_submission = 1
    `).get(qrCode.qr_code_id);
    const conversions = conversionsResult.count;

    // Calculate conversion rate (percentage)
    const conversionRate = totalScans > 0
      ? ((conversions / totalScans) * 100).toFixed(2)
      : 0;

    // Get last scan timestamp
    const lastScanResult = db.prepare(`
      SELECT scanned_at
      FROM qr_scans
      WHERE qr_code_id = ?
      ORDER BY scanned_at DESC
      LIMIT 1
    `).get(qrCode.qr_code_id);
    const lastScannedAt = lastScanResult?.scanned_at || null;

    // Get scans grouped by date (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const scansByDate = db.prepare(`
      SELECT
        DATE(scanned_at) as date,
        COUNT(*) as count
      FROM qr_scans
      WHERE qr_code_id = ?
        AND scanned_at >= ?
      GROUP BY DATE(scanned_at)
      ORDER BY date DESC
    `).all(qrCode.qr_code_id, thirtyDaysAgo);

    // ─────────────────────────────────────────────────────────────────────
    // STEP 4: Return Statistics
    // ─────────────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      qrCode: {
        qrCodeId: qrCode.qr_code_id,
        qrCodeKey: qrCode.qr_code_key,
        qrType: qrCode.qr_type,
        targetId: qrCode.target_id,
        targetUrl: qrCode.target_url,
        description: qrCode.description,
        createdAt: qrCode.created_at,
        isActive: qrCode.is_active === 1,
        expiresAt: qrCode.expires_at
      },
      stats: {
        totalScans,
        uniqueIPs,
        conversions,
        conversionRate: parseFloat(conversionRate),
        lastScannedAt,
        scansByDate
      }
    });

  } catch (error) {
    // ─────────────────────────────────────────────────────────────────────
    // ERROR HANDLING
    // ─────────────────────────────────────────────────────────────────────
    console.error('[QR Code Scan Stats API] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve scan statistics',
        details: error.message
      },
      { status: 500 }
    );
  }
}
