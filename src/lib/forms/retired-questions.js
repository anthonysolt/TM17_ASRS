/**
 * Retired questions: questions removed from a form in an edit. They are left
 * off the published version but keep their placements and answers so reports
 * still show their history, until someone deletes them permanently here.
 */

function publishedRootIds(db, formId) {
  return new Set(db.prepare(`
    SELECT DISTINCT fq.root_field_id
    FROM form_version_questions fvq
    JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
    JOIN form_version fv ON fv.form_version_id = fvq.form_version_id
    WHERE fv.form_id = ? AND fv.status = 'published'
  `).all(formId).map(row => Number(row.root_field_id)));
}

function countAnswers(db, formId, rootFieldId) {
  const { count } = db.prepare(`
    SELECT COUNT(*) AS count
    FROM submission_value sv
    JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
    WHERE fq.form_id = ? AND fq.root_field_id = ?
  `).get(formId, rootFieldId);
  return Number(count) || 0;
}

// Goals only lose their source when no form uses the question any more.
function countLinkedGoals(db, rootFieldId) {
  const { count } = db.prepare(
    'SELECT COUNT(*) AS count FROM initiative_goal WHERE source_root_field_id = ?'
  ).get(rootFieldId);
  return Number(count) || 0;
}

function isUsedByOtherForms(db, formId, rootFieldId) {
  return !!db.prepare(
    'SELECT 1 FROM form_questions WHERE root_field_id = ? AND form_id <> ? LIMIT 1'
  ).get(rootFieldId, formId);
}

/** The form's retired questions, each labelled with its latest wording. */
export function listRetiredQuestions(db, formId) {
  const published = publishedRootIds(db, formId);
  const roots = db.prepare(
    'SELECT DISTINCT root_field_id FROM form_questions WHERE form_id = ?'
  ).all(formId).map(row => Number(row.root_field_id)).filter(rootId => !published.has(rootId));

  return roots.map(rootFieldId => {
    const latest = db.prepare(`
      SELECT f.field_id, f.field_key, f.field_label, f.field_type, f.validation_rules, f.scope, f.initiative_id,
             f.is_core_question, f.is_initiative_specific, fq.required, fq.help_text
      FROM form_questions fq
      JOIN field f ON f.field_id = fq.field_id
      WHERE fq.form_id = ? AND fq.root_field_id = ?
      ORDER BY fq.form_question_id DESC
      LIMIT 1
    `).get(formId, rootFieldId);
    let uiType = latest?.field_type || 'text';
    try { uiType = JSON.parse(latest?.validation_rules || '{}').ui_type || uiType; } catch { /* keep field_type */ }
    const sharedWithOtherForms = isUsedByOtherForms(db, formId, rootFieldId);
    const options = db.prepare(
      'SELECT display_label FROM field_options WHERE field_id = ? ORDER BY display_order'
    ).all(latest?.field_id).map(option => option.display_label);
    return {
      rootFieldId,
      // Latest wording of the question; sending it back on a save restores it.
      fieldId: Number(latest?.field_id) || rootFieldId,
      fieldKey: latest?.field_key || null,
      label: latest?.field_label || `Question ${rootFieldId}`,
      type: uiType,
      options,
      required: !!latest?.required,
      helpText: latest?.help_text || null,
      scope: latest?.scope || 'common',
      initiativeId: latest?.initiative_id ?? null,
      isCoreQuestion: !!latest?.is_core_question,
      isInitiativeSpecific: !!latest?.is_initiative_specific,
      answerCount: countAnswers(db, formId, rootFieldId),
      linkedGoalCount: sharedWithOtherForms ? 0 : countLinkedGoals(db, rootFieldId),
      sharedWithOtherForms,
    };
  });
}

export class QuestionNotRetiredError extends Error {}

/**
 * Permanently delete a retired question from a form: its placements on every
 * version, every answer to it on this form, field snapshots nothing else uses,
 * and (when no other form uses it) the goal links to it. Shared library
 * questions (core/initiative) are kept. Questions on the published version
 * can't be deleted here; remove them in an edit first.
 */
export function deleteRetiredQuestion(db, formId, rootFieldId) {
  const placements = db.prepare(`
    SELECT form_question_id, field_id
    FROM form_questions
    WHERE form_id = ? AND root_field_id = ?
  `).all(formId, rootFieldId);
  if (placements.length === 0) return null;
  if (publishedRootIds(db, formId).has(Number(rootFieldId))) {
    throw new QuestionNotRetiredError('This question is still on the survey. Remove it in the editor before deleting it.');
  }

  const deletedAnswerCount = countAnswers(db, formId, rootFieldId);
  const placementIds = placements.map(placement => placement.form_question_id);
  const placementMarks = placementIds.map(() => '?').join(', ');
  db.prepare(`DELETE FROM submission_value WHERE form_question_id IN (${placementMarks})`).run(...placementIds);
  db.prepare(`DELETE FROM form_version_questions WHERE form_question_id IN (${placementMarks})`).run(...placementIds);
  db.prepare(`DELETE FROM form_questions WHERE form_question_id IN (${placementMarks})`).run(...placementIds);

  let unlinkedGoalCount = 0;
  if (!isUsedByOtherForms(db, formId, rootFieldId)) {
    unlinkedGoalCount = Number(db.prepare(`
      UPDATE initiative_goal SET source_root_field_id = NULL, source_method = NULL
      WHERE source_root_field_id = ?
    `).run(rootFieldId).changes) || 0;
  }

  const fieldIds = [...new Set([Number(rootFieldId), ...placements.map(placement => Number(placement.field_id))])];
  const fieldMarks = fieldIds.map(() => '?').join(', ');
  // field_options cascade with their field.
  db.prepare(`
    DELETE FROM field
    WHERE field_id IN (${fieldMarks})
      AND is_core_question = 0
      AND is_initiative_specific = 0
      AND NOT EXISTS (
        SELECT 1 FROM form_questions fq
        WHERE fq.field_id = field.field_id OR fq.root_field_id = field.field_id
      )
  `).run(...fieldIds);

  return { rootFieldId: Number(rootFieldId), deletedAnswerCount, unlinkedGoalCount };
}
