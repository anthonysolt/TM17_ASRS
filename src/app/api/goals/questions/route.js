import { NextResponse } from 'next/server';
import db, { initializeDatabase } from '@/lib/db';
import { requirePermission } from '@/lib/auth/server-auth';
import { queryInitiativeQuestions } from '@/lib/query-helpers';

// GET - Survey questions a goal can source its current value from.
// One entry per question (root id), labelled with its most recent iteration.
export async function GET(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'goals.manage');
    if (auth.error) return auth.error;

    const initiativeId = Number(new URL(request.url).searchParams.get('initiativeId'));
    if (!Number.isInteger(initiativeId) || initiativeId <= 0) {
      return NextResponse.json({ error: 'Missing or invalid initiativeId' }, { status: 400 });
    }

    const questions = queryInitiativeQuestions(db, initiativeId).map((question) => ({
      id: question.field_id,
      label: question.field_label || `Question ${question.field_id}`,
      type: question.field_type,
    }));

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error fetching goal questions:', error);
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 });
  }
}
