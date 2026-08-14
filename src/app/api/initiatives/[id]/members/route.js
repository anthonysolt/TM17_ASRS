import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requirePermission } from '@/lib/auth/server-auth';

export async function GET(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'initiatives.manage', { requireCsrf: false });
    if (auth.error) return auth.error;

    const { id } = await params;
    const initiativeId = Number(id);

    // Get explicit members from initiative_member table
    const members = db.prepare(`
      SELECT im.member_id, im.role, im.joined_at,
             u.user_id, u.first_name, u.last_name, u.email, u.phone_number,
             ut.type AS user_type
      FROM initiative_member im
      JOIN user u ON u.user_id = im.user_id
      LEFT JOIN user_type ut ON ut.user_type_id = u.user_type_id
      WHERE im.initiative_id = ?
      ORDER BY im.joined_at DESC
    `).all(initiativeId);

    // Get participants who submitted surveys for this initiative (linked users)
    const participants = db.prepare(`
      SELECT DISTINCT u.user_id, u.first_name, u.last_name, u.email, u.phone_number,
             ut.type AS user_type,
             MIN(s.submitted_at) AS first_submission,
             COUNT(s.submission_id) AS submission_count
      FROM submission s
      JOIN user u ON u.user_id = s.submitted_by_user_id
      LEFT JOIN user_type ut ON ut.user_type_id = u.user_type_id
      WHERE s.initiative_id = ?
        AND s.submitted_by_user_id IS NOT NULL
      GROUP BY u.user_id, u.first_name, u.last_name, u.email, u.phone_number, ut.type
      ORDER BY MIN(s.submitted_at) DESC
    `).all(initiativeId);

    // Get total submission count and anonymous count for this initiative
    const submissionStats = db.prepare(`
      SELECT
        COUNT(*) AS total_submissions,
        COUNT(CASE WHEN submitted_by_user_id IS NULL THEN 1 END) AS anonymous_submissions
      FROM submission
      WHERE initiative_id = ?
    `).get(initiativeId);

    // Get all submissions with their field values for this initiative
    const submissions = db.prepare(`
      SELECT s.submission_id, s.submitted_at, s.submitted_by_user_id,
             u.first_name, u.last_name, u.email
      FROM submission s
      LEFT JOIN user u ON u.user_id = s.submitted_by_user_id
      WHERE s.initiative_id = ?
      ORDER BY s.submitted_at DESC
    `).all(initiativeId);

    // Get field values for all submissions in one query
    const submissionIds = submissions.map(s => s.submission_id);
    let submissionValues = [];
    if (submissionIds.length > 0) {
      submissionValues = db.prepare(`
        SELECT sv.submission_id, sv.field_id, f.field_label,
               COALESCE(sv.value_text, CAST(sv.value_number AS TEXT), sv.value_date,
                 CASE WHEN sv.value_bool IS NOT NULL THEN CASE sv.value_bool WHEN 1 THEN 'Yes' ELSE 'No' END END,
                 sv.value_json) AS display_value
        FROM submission_value sv
        JOIN field f ON f.field_id = sv.field_id
        WHERE sv.submission_id IN (${submissionIds.map(() => '?').join(',')})
        ORDER BY sv.field_id
      `).all(...submissionIds);
    }

    // Group values by submission_id
    const valuesBySubmission = {};
    for (const v of submissionValues) {
      if (!valuesBySubmission[v.submission_id]) valuesBySubmission[v.submission_id] = [];
      valuesBySubmission[v.submission_id].push({ field_label: v.field_label, value: v.display_value });
    }

    const submissionsWithValues = submissions.map(s => ({
      ...s,
      values: valuesBySubmission[s.submission_id] || [],
    }));

    return NextResponse.json({
      success: true,
      members,
      participants,
      submissions: submissionsWithValues,
      totalMembers: members.length,
      totalParticipants: participants.length,
      totalSubmissions: submissionStats?.total_submissions || 0,
      anonymousSubmissions: submissionStats?.anonymous_submissions || 0,
    });
  } catch (error) {
    console.error('GET /api/initiatives/[id]/members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'initiatives.manage');
    if (auth.error) return auth.error;

    const { id } = await params;
    const initiativeId = Number(id);
    const body = await request.json();
    const { email, role } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user by email
    const user = db.prepare('SELECT user_id, first_name, last_name, email FROM user WHERE email = ?').get(email.trim().toLowerCase());
    if (!user) {
      return NextResponse.json({ error: `No user found with email "${email}"` }, { status: 404 });
    }

    // Check if already a member
    const existing = db.prepare(
      'SELECT member_id FROM initiative_member WHERE initiative_id = ? AND user_id = ?'
    ).get(initiativeId, user.user_id);

    if (existing) {
      return NextResponse.json({ error: 'User is already a member of this initiative' }, { status: 409 });
    }

    const memberRole = role || 'participant';
    const result = db.prepare(
      'INSERT INTO initiative_member (initiative_id, user_id, role) VALUES (?, ?, ?)'
    ).run(initiativeId, user.user_id, memberRole);

    return NextResponse.json({
      success: true,
      member: {
        member_id: result.lastInsertRowid,
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: memberRole,
      },
    });
  } catch (error) {
    console.error('POST /api/initiatives/[id]/members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'initiatives.manage');
    if (auth.error) return auth.error;

    const { id } = await params;
    const initiativeId = Number(id);
    const url = new URL(request.url);
    const memberId = url.searchParams.get('memberId');

    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }

    const result = db.prepare(
      'DELETE FROM initiative_member WHERE member_id = ? AND initiative_id = ?'
    ).run(Number(memberId), initiativeId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/initiatives/[id]/members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
