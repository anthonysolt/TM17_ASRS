import { getLikertOptionDetails, isLikertType } from '@/lib/forms/likert-scales';

const UI_TO_DB_TYPE = {
  textarea: 'text',
  select: 'text',
  radio: 'text',
  choice: 'text',
  checkbox: 'multiselect',
  email: 'text',
  url: 'text',
  likert_agreement: 'number',
  likert_good_bad: 'number',
  likert_like_dislike: 'number',
};

const OPTION_TYPES = new Set(['select', 'radio', 'choice', 'checkbox', 'multiselect', 'likert_agreement', 'likert_good_bad', 'likert_like_dislike']);

function parseJson(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function normalizeQuestion(question) {
  const source = question?.text || question || {};
  const uiType = String(source.type || 'text');
  return {
    fieldId: Number(source.field_id ?? source.id ?? question?.id) || null,
    label: String(source.question || source.label || '').trim(),
    uiType,
    required: source.required !== false,
    helpText: source.help_text ? String(source.help_text) : null,
    options: isLikertType(uiType)
      ? getLikertOptionDetails(uiType).map(option => option.label)
      : Array.isArray(source.options)
      ? source.options.map(option => String(option).trim()).filter(Boolean)
      : [],
    validationRules: source.form_validation_rules || source.validation_rules || null,
    isCoreQuestion: !!source.is_core_question,
    isInitiativeSpecific: !!source.is_initiative_specific,
  };
}

function validateQuestion(question) {
  if (!question.label) throw new Error('Every question must have question text');
  if (question.isCoreQuestion && question.isInitiativeSpecific) {
    throw new Error('A question cannot be both a core question and an initiative question');
  }
  if (OPTION_TYPES.has(question.uiType) && question.options.length === 0) {
    throw new Error(`Question "${question.label}" must have at least one answer option`);
  }
}

function getCurrentVersion(db, formId) {
  return db.prepare(`
    SELECT form_version_id, version_number
    FROM form_version
    WHERE form_id = ?
    ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
             version_number DESC
    LIMIT 1
  `).get(formId);
}

function loadCurrentQuestions(db, formId, versionId) {
  return db.prepare(`
    SELECT fq.*, fvq.display_order, f.field_key, f.field_label, f.field_type, f.scope, f.initiative_id,
           f.is_filterable, f.is_required_default, f.validation_rules AS field_rules
    FROM form_version_questions fvq
    JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
    JOIN field f ON f.field_id = fq.field_id
    WHERE fq.form_id = ? AND fvq.form_version_id = ?
    ORDER BY fvq.display_order
  `).all(formId, versionId);
}

function loadOptions(db, fieldId) {
  return db.prepare(`
    SELECT display_label
    FROM field_options
    WHERE field_id = ?
    ORDER BY display_order
  `).all(fieldId).map(option => option.display_label);
}

function sameOptions(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fieldDisplayType(field) {
  return parseJson(field.field_rules).ui_type || field.field_type;
}

function isSameDefinition(db, field, question) {
  return question.label === field.field_label
    && question.uiType === fieldDisplayType(field)
    && sameOptions(question.options, loadOptions(db, field.field_id));
}

function serializeRules(rules) {
  return rules ? JSON.stringify(rules) : null;
}

// A placement can be shared with the previous version when everything stored
// on it is unchanged; only its position lives in form_version_questions.
function isSamePlacement(source, fieldId, question) {
  return Number(source.field_id) === Number(fieldId)
    && !!source.required === question.required
    && !source.is_hidden
    && (source.help_text ?? null) === (question.helpText ?? null)
    && (source.validation_rules ?? null) === serializeRules(question.validationRules);
}

function loadLibraryField(db, fieldId) {
  return db.prepare(`
    SELECT field_id, field_label, field_type, scope, is_filterable, validation_rules AS field_rules
    FROM field
    WHERE field_id = ?
  `).get(fieldId);
}

/**
 * Permanently remove a question from a form: every placement of the question
 * (all versions), every answer to it, and any field snapshots that are no
 * longer used. Shared library questions (core/initiative) are kept.
 */
function deleteQuestionLineage(db, formId, rootFieldId) {
  const placements = db.prepare(`
    SELECT form_question_id, field_id
    FROM form_questions
    WHERE form_id = ? AND root_field_id = ?
  `).all(formId, rootFieldId);
  if (placements.length === 0) return 0;

  const placementIds = placements.map(placement => placement.form_question_id);
  const placementMarks = placementIds.map(() => '?').join(', ');
  const { count } = db.prepare(`
    SELECT COUNT(*) AS count FROM submission_value WHERE form_question_id IN (${placementMarks})
  `).get(...placementIds);

  db.prepare(`DELETE FROM submission_value WHERE form_question_id IN (${placementMarks})`).run(...placementIds);
  db.prepare(`DELETE FROM form_questions WHERE form_question_id IN (${placementMarks})`).run(...placementIds);

  const fieldIds = [...new Set([rootFieldId, ...placements.map(placement => placement.field_id)])];
  const fieldMarks = fieldIds.map(() => '?').join(', ');
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

  return Number(count) || 0;
}

function createFieldSnapshot(db, form, sourceField, question, versionNumber, index) {
  const dbType = UI_TO_DB_TYPE[question.uiType] || question.uiType;
  const rules = { ...parseJson(sourceField?.field_rules) };
  if (dbType !== question.uiType) rules.ui_type = question.uiType;
  else delete rules.ui_type;

  const fieldKey = `form_${form.form_id}_v${versionNumber}_q${index}_${Date.now()}`;
  const result = db.prepare(`
    INSERT INTO field (
      field_key, field_label, field_type, scope, initiative_id, is_filterable,
      is_required_default, is_core_question, is_initiative_specific, validation_rules
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
  `).run(
    fieldKey,
    question.label,
    dbType,
    sourceField?.scope || 'common',
    sourceField?.scope === 'initiative_specific' ? form.initiative_id : null,
    sourceField?.is_filterable || 0,
    question.required ? 1 : 0,
    Object.keys(rules).length ? JSON.stringify(rules) : null
  );

  const fieldId = Number(result.lastInsertRowid);
  const insertOption = db.prepare(`
    INSERT INTO field_options (field_id, option_value, display_label, display_order)
    VALUES (?, ?, ?, ?)
  `);
  const optionDetails = isLikertType(question.uiType)
    ? getLikertOptionDetails(question.uiType)
    : question.options.map(option => ({ value: option, label: option }));
  optionDetails.forEach((option, optionIndex) => insertOption.run(fieldId, String(option.value), option.label, optionIndex));
  return fieldId;
}

/**
 * Publish an immutable revision while retaining the same form identity.
 * Existing placements, fields, options, and submissions are never mutated;
 * unchanged placements are shared with the new version rather than copied.
 */
export function createFormRevision(db, form, body, userId = null) {
  const currentVersion = getCurrentVersion(db, form.form_id);
  if (!currentVersion) throw new Error('Form has no version to revise');

  const currentQuestions = loadCurrentQuestions(db, form.form_id, currentVersion.form_version_id);
  const requestedQuestions = body.questions === undefined
    ? currentQuestions.map(question => ({
        fieldId: question.field_id,
        label: question.field_label,
        uiType: fieldDisplayType(question),
        required: !!question.required,
        helpText: question.help_text,
        options: loadOptions(db, question.field_id),
        validationRules: parseJson(question.validation_rules, null),
      }))
    : body.questions.map(normalizeQuestion);

  requestedQuestions.forEach(validateQuestion);

  const currentByFieldId = new Map(currentQuestions.map(question => [Number(question.field_id), question]));
  // A question's type is fixed once it exists on the form.
  requestedQuestions.forEach(question => {
    const source = question.fieldId ? currentByFieldId.get(question.fieldId) : null;
    if (source && question.uiType !== fieldDisplayType(source)) {
      throw new Error(`The type of "${source.field_label}" cannot be changed. Remove it and add a new question instead.`);
    }
  });

  const versionNumber = Number(currentVersion.version_number) + 1;
  const now = new Date().toISOString();
  const versionResult = db.prepare(`
    INSERT INTO form_version (form_id, version_number, status, created_at, published_at, created_by_user_id)
    VALUES (?, ?, 'draft', ?, NULL, ?)
  `).run(form.form_id, versionNumber, now, userId);
  const versionId = Number(versionResult.lastInsertRowid);
  const insertPlacement = db.prepare(`
    INSERT INTO form_questions (
      form_id, field_id, root_field_id, required, is_hidden, help_text, validation_rules
    ) VALUES (?, ?, ?, ?, 0, ?, ?)
  `);
  const insertVersionQuestion = db.prepare(`
    INSERT INTO form_version_questions (form_version_id, form_question_id, display_order)
    VALUES (?, ?, ?)
  `);
  let reusedQuestionCount = 0;

  requestedQuestions.forEach((question, index) => {
    const source = question.fieldId ? currentByFieldId.get(question.fieldId) : null;
    let fieldId;
    let rootFieldId;

    if (source) {
      // Existing question: an edited definition becomes a new snapshot, but it
      // keeps the same root so earlier answers stay linked to it.
      fieldId = isSameDefinition(db, source, question)
        ? source.field_id
        : createFieldSnapshot(db, form, source, question, versionNumber, index);
      rootFieldId = source.root_field_id;
    } else {
      // New question: reuse an unchanged library question as-is so it is not
      // duplicated in reports; otherwise create a new field. Either way it
      // starts its own root and does not touch existing questions or answers.
      const libraryField = question.fieldId ? loadLibraryField(db, question.fieldId) : null;
      fieldId = libraryField && isSameDefinition(db, libraryField, question)
        ? libraryField.field_id
        : createFieldSnapshot(db, form, libraryField, question, versionNumber, index);
      rootFieldId = fieldId;
    }

    // Saving a question to the core or initiative library only promotes it;
    // removing a question from a library goes through the field catalog.
    if (question.isCoreQuestion || question.isInitiativeSpecific) {
      db.prepare(`
        UPDATE field
        SET is_core_question = ?, is_initiative_specific = ?, scope = ?, initiative_id = ?
        WHERE field_id = ? AND is_core_question = 0 AND is_initiative_specific = 0
      `).run(
        question.isCoreQuestion ? 1 : 0,
        question.isInitiativeSpecific ? 1 : 0,
        question.isCoreQuestion ? 'common' : 'initiative_specific',
        question.isCoreQuestion ? null : Number(body.initiative_id ?? form.initiative_id),
        fieldId
      );
    }

    let formQuestionId;
    if (source && isSamePlacement(source, fieldId, question)) {
      formQuestionId = source.form_question_id;
      reusedQuestionCount += 1;
    } else {
      formQuestionId = Number(insertPlacement.run(
        form.form_id,
        fieldId,
        rootFieldId,
        question.required ? 1 : 0,
        question.helpText,
        serializeRules(question.validationRules)
      ).lastInsertRowid);
    }
    insertVersionQuestion.run(versionId, formQuestionId, index);
  });

  // Questions left out of the revision are deleted along with all their answers.
  const keptFieldIds = new Set(requestedQuestions.map(question => question.fieldId).filter(Boolean));
  const removedQuestions = currentQuestions.filter(question => !keptFieldIds.has(Number(question.field_id)));
  const deletedAnswerCount = removedQuestions.reduce(
    (total, question) => total + deleteQuestionLineage(db, form.form_id, question.root_field_id),
    0
  );

  db.prepare(`UPDATE form_version SET status = 'retired' WHERE form_id = ? AND status = 'published'`).run(form.form_id);
  db.prepare(`UPDATE form_version SET status = 'published', published_at = ? WHERE form_version_id = ?`).run(now, versionId);

  const title = body.title === undefined ? form.form_name : String(body.title).trim();
  if (!title) throw new Error('Form title is required');
  const description = body.description === undefined ? form.description : String(body.description || '').trim();
  const initiativeId = body.initiative_id === undefined ? form.initiative_id : Number(body.initiative_id);
  const published = body.published !== undefined
    ? !!body.published
    : body.status !== undefined ? body.status === 'active' : !!form.is_published;

  db.prepare(`
    UPDATE form
    SET form_name = ?, description = ?, initiative_id = ?, is_published = ?, updated_at = ?, updated_by_user_id = ?
    WHERE form_id = ?
  `).run(title, description, initiativeId, published ? 1 : 0, now, userId, form.form_id);

  return {
    formVersionId: versionId,
    versionNumber,
    questionCount: requestedQuestions.length,
    reusedQuestionCount,
    removedQuestionCount: removedQuestions.length,
    deletedAnswerCount,
  };
}

export { normalizeQuestion };
