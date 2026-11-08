/**
 * GET    /api/surveys/templates/[id]/retired-questions
 *   Questions removed from the survey in an edit, with how many answers each keeps.
 * DELETE /api/surveys/templates/[id]/retired-questions?rootFieldId=N
 *   Permanently delete one retired question and every answer to it on this survey.
 */
import db from '@/lib/db.js';
import { requirePermission } from '@/lib/auth/server-auth';
import { logAudit } from '@/lib/audit';
import {
  deleteRetiredQuestion,
  listRetiredQuestions,
  QuestionNotRetiredError,
} from '@/lib/forms/retired-questions';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function loadForm(context) {
  const params = await context.params;
  const formId = Number(params.id);
  if (!Number.isInteger(formId) || formId <= 0) return { error: json({ error: 'Invalid template ID' }, 400) };
  const form = db.prepare('SELECT form_id, form_name FROM form WHERE form_id = ?').get(formId);
  if (!form) return { error: json({ error: 'Template not found' }, 404) };
  return { form };
}

export async function GET(request, context) {
  try {
    const auth = requirePermission(request, db, 'forms.create');
    if (auth.error) return auth.error;
    const { form, error } = await loadForm(context);
    if (error) return error;
    return json({ questions: listRetiredQuestions(db, form.form_id) });
  } catch (err) {
    console.error('Error listing retired questions:', err);
    return json({ error: 'Failed to load retired questions' }, 500);
  }
}

export async function DELETE(request, context) {
  try {
    const auth = requirePermission(request, db, 'forms.create');
    if (auth.error) return auth.error;
    const { form, error } = await loadForm(context);
    if (error) return error;

    const rootFieldId = Number(new URL(request.url).searchParams.get('rootFieldId'));
    if (!Number.isInteger(rootFieldId) || rootFieldId <= 0) return json({ error: 'Invalid question ID' }, 400);

    const label = listRetiredQuestions(db, form.form_id).find(q => q.rootFieldId === rootFieldId)?.label;
    const result = db.transaction(() => deleteRetiredQuestion(db, form.form_id, rootFieldId))();
    if (!result) return json({ error: 'Question not found on this survey' }, 404);

    logAudit(db, {
      event: 'survey.question_deleted',
      userEmail: auth.user.email,
      targetType: 'form',
      targetId: String(form.form_id),
      payload: {
        root_field_id: rootFieldId,
        label,
        answers_deleted: result.deletedAnswerCount,
        goals_unlinked: result.unlinkedGoalCount,
      },
    });

    return json({ success: true, ...result });
  } catch (err) {
    if (err instanceof QuestionNotRetiredError) return json({ error: err.message }, 409);
    console.error('Error deleting retired question:', err);
    return json({ error: 'Failed to delete question' }, 500);
  }
}
