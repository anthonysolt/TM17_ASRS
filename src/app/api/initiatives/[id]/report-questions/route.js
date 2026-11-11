import { NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/container/service-container';
import { requirePermission } from '@/lib/auth/server-auth';
import { queryInitiativeQuestions } from '@/lib/query-helpers';
import { resolveQuestionType } from '@/lib/analysis-methods';
import { loadQuestionOptions } from '@/lib/goals/question-source';

export async function GET(request, { params }) {
  try {
    const { db } = getServiceContainer();
    const auth = requirePermission(request, db, 'reporting.view');
    if (auth.error) return auth.error;

    const { id } = await params;
    const initiativeId = Number(id);
    if (!Number.isInteger(initiativeId) || initiativeId <= 0) {
      return NextResponse.json({ error: 'Invalid initiative id' }, { status: 400 });
    }

    const initiative = db.prepare(
      'SELECT initiative_id FROM initiative WHERE initiative_id = ?'
    ).get(initiativeId);
    if (!initiative) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    // One entry per question, labelled with its most recent iteration.
    const questions = queryInitiativeQuestions(db, initiativeId).map((question) => ({
      id: question.field_id,
      label: question.field_label || `Question ${question.field_id}`,
      // Builder type (e.g. likert_agreement, radio), which decides the analysis methods offered.
      type: resolveQuestionType(question.field_type, question.validation_rules),
      display_order: question.display_order,
      version: question.version_number,
      // False once the question was removed from its survey; its answers are kept.
      active: Number(question.is_active) === 1,
      // Current answer options, for the answer-based methods' target answer.
      options: loadQuestionOptions(db, initiativeId, question.field_id),
    }));

    return NextResponse.json({ questions });
  } catch (error) {
    console.error('Error fetching report questions:', error);
    return NextResponse.json({ error: 'Failed to fetch report questions' }, { status: 500 });
  }
}
