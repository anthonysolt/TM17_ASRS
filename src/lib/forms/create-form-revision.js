import { getFixedOptionDetails, hasFixedOptions } from '@/lib/forms/fixed-options';
import { toDbFieldType } from '@/lib/forms/field-types';

const OPTION_TYPES = new Set(['select', 'radio', 'choice', 'checkbox', 'multiselect', 'likert_agreement', 'likert_good_bad', 'likert_like_dislike', 'yesno']);

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
    options: hasFixedOptions(uiType)
      ? getFixedOptionDetails(uiType).map(option => option.label)
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

// Questions may send an option's label or its stored value (library questions
// are added in the builder with option values), so either one matches.
function sameOptions(requested, storedRows) {
  return requested.length === storedRows.length && requested.every((value, index) =>
    value === storedRows[index].display_label || value === storedRows[index].option_value
  );
}

function fieldDisplayType(field) {
  return parseJson(field.field_rules).ui_type || field.field_type;
}

function isSameDefinition(db, field, question) {
  const storedRows = db.prepare(`
    SELECT option_value, display_label
    FROM field_options
    WHERE field_id = ?
    ORDER BY display_order
  `).all(field.field_id);
  return question.label === String(field.field_label || '').trim()
    && question.uiType === fieldDisplayType(field)
    && sameOptions(question.options, storedRows);
}

function serializeRules(rules) {
  return rules ? JSON.stringify(rules) : null;
}

// Validation rules sent by the form builder are the field's rules merged with
// the placement's overrides (see resolveRules in the template GET), so compare
// effective rules. ui_type belongs to the question type, compared separately.
function comparableRules(rules) {
  const copy = { ...(rules || {}) };
  delete copy.ui_type;
  return JSON.stringify(Object.keys(copy).sort().map(key => [key, copy[key]]));
}

function sameRules(source, question) {
  const stored = { ...parseJson(source.field_rules), ...parseJson(source.validation_rules) };
  return comparableRules(stored) === comparableRules(question.validationRules);
}

// A placement can be shared with the previous version when everything stored
// on it is unchanged; only its position lives in form_version_questions.
function isSamePlacement(source, fieldId, question) {
  return Number(source.field_id) === Number(fieldId)
    && !!source.required === question.required
    && !source.is_hidden
    && (source.help_text ?? null) === (question.helpText ?? null)
    && sameRules(source, question);
}

function loadLibraryField(db, fieldId) {
  return db.prepare(`
    SELECT field_id, field_label, field_type, scope, is_filterable, validation_rules AS field_rules
    FROM field
    WHERE field_id = ?
  `).get(fieldId);
}

/**
 * True when a submitted question still matches an existing field exactly
 * (text, type, options), so the field can be reused instead of copied.
 */
export function isUnchangedLibraryQuestion(db, fieldId, rawQuestion) {
  const field = loadLibraryField(db, fieldId);
  return !!field && isSameDefinition(db, field, normalizeQuestion(rawQuestion));
}

function createFieldSnapshot(db, form, sourceField, question, versionNumber, index) {
  const dbType = toDbFieldType(question.uiType);
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
  const optionDetails = hasFixedOptions(question.uiType)
    ? getFixedOptionDetails(question.uiType)
    : question.options.map(option => ({ value: option, label: option }));
  optionDetails.forEach((option, optionIndex) => insertOption.run(fieldId, String(option.value), option.label, optionIndex));
  return fieldId;
}


// Saving a question to the core or initiative library only promotes it;
// removing a question from a library goes through the field catalog.
function promoteToLibrary(db, form, body, question, fieldId) {
  if (!question.isCoreQuestion && !question.isInitiativeSpecific) return;
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

/**
 * Sort the requested edit into changes that alter what an answer means
 * (versioned: questions added or removed, wording, options, validation) and
 * settings that don't (in place: required, help text, order).
 */
function classifyChanges(db, currentQuestions, requestedQuestions) {
  const currentByFieldId = new Map(currentQuestions.map(question => [Number(question.field_id), question]));
  const requestedIds = new Set(requestedQuestions.map(question => question.fieldId).filter(Boolean));
  const removed = currentQuestions.filter(question => !requestedIds.has(Number(question.field_id)));

  let versioned = removed.length > 0 || requestedIds.size !== requestedQuestions.length;
  const placementUpdates = [];
  const orderUpdates = [];

  requestedQuestions.forEach((question, index) => {
    if (versioned) return;
    const source = question.fieldId ? currentByFieldId.get(question.fieldId) : null;
    if (!source || source.is_hidden || !isSameDefinition(db, source, question) || !sameRules(source, question)) {
      versioned = true;
      return;
    }
    if (!!source.required !== question.required || (source.help_text ?? null) !== (question.helpText ?? null)) {
      placementUpdates.push({ formQuestionId: source.form_question_id, required: question.required, helpText: question.helpText });
    }
    if (Number(source.display_order) !== index) {
      orderUpdates.push({ formQuestionId: source.form_question_id, displayOrder: index });
    }
  });

  return { versioned, removed, placementUpdates, orderUpdates };
}

// Placements are shared across versions, so these settings also show on
// earlier versions; they don't change what any answer means.
function applyInPlaceChanges(db, currentVersion, changes) {
  const updatePlacement = db.prepare('UPDATE form_questions SET required = ?, help_text = ? WHERE form_question_id = ?');
  const updateOrder = db.prepare(`
    UPDATE form_version_questions SET display_order = ?
    WHERE form_version_id = ? AND form_question_id = ?
  `);
  changes.placementUpdates.forEach(update =>
    updatePlacement.run(update.required ? 1 : 0, update.helpText ?? null, update.formQuestionId));
  changes.orderUpdates.forEach(update =>
    updateOrder.run(update.displayOrder, currentVersion.form_version_id, update.formQuestionId));
  return changes.placementUpdates.length + changes.orderUpdates.length;
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

/**
 * Publish a new version. Existing placements, fields, options, and answers are
 * never changed; unchanged placements are shared with the new version. Removed
 * questions are retired: left off the new version with their answers kept, so
 * reports still show their history.
 */
function createVersionedRevision(db, form, body, userId, currentVersion, currentQuestions, requestedQuestions, removed, now) {
  const currentByFieldId = new Map(currentQuestions.map(question => [Number(question.field_id), question]));
  const versionNumber = Number(currentVersion.version_number) + 1;
  const versionId = Number(db.prepare(`
    INSERT INTO form_version (form_id, version_number, status, created_at, published_at, created_by_user_id)
    VALUES (?, ?, 'draft', ?, NULL, ?)
  `).run(form.form_id, versionNumber, now, userId).lastInsertRowid);
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
      // starts its own root.
      const libraryField = question.fieldId ? loadLibraryField(db, question.fieldId) : null;
      fieldId = libraryField && isSameDefinition(db, libraryField, question)
        ? libraryField.field_id
        : createFieldSnapshot(db, form, libraryField, question, versionNumber, index);
      // A retired question being restored keeps its original root, even when
      // its latest wording is a later snapshot than the root field.
      const retiredPlacement = question.fieldId ? db.prepare(`
        SELECT root_field_id FROM form_questions
        WHERE form_id = ? AND field_id = ?
        ORDER BY form_question_id DESC
        LIMIT 1
      `).get(form.form_id, question.fieldId) : null;
      rootFieldId = retiredPlacement ? retiredPlacement.root_field_id : fieldId;
    }

    promoteToLibrary(db, form, body, question, fieldId);

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

  db.prepare(`UPDATE form_version SET status = 'retired' WHERE form_id = ? AND status = 'published'`).run(form.form_id);
  db.prepare(`UPDATE form_version SET status = 'published', published_at = ? WHERE form_version_id = ?`).run(now, versionId);

  return {
    formVersionId: versionId,
    versionNumber,
    reusedQuestionCount,
    retiredQuestionCount: removed.length,
    retainedAnswerCount: removed.reduce((total, question) => total + countAnswers(db, form.form_id, question.root_field_id), 0),
  };
}

function updateFormMetadata(db, form, body, userId, now) {
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
}

/**
 * Save an edit to a form. A new version is created only when a change alters
 * what an answer means; settings-only edits are written in place, and an
 * unchanged save only updates the form's details.
 */
export function createFormRevision(db, form, body, userId = null) {
  const currentVersion = getCurrentVersion(db, form.form_id);
  if (!currentVersion) throw new Error('Form has no version to revise');
  if (body.title !== undefined && !String(body.title).trim()) throw new Error('Form title is required');

  const currentQuestions = loadCurrentQuestions(db, form.form_id, currentVersion.form_version_id);
  // Without a questions list only the form's details are being edited.
  const requestedQuestions = body.questions === undefined
    ? currentQuestions.map(question => ({
        fieldId: Number(question.field_id),
        label: String(question.field_label || '').trim(),
        uiType: fieldDisplayType(question),
        required: !!question.required,
        helpText: question.help_text ?? null,
        options: loadOptions(db, question.field_id),
        validationRules: { ...parseJson(question.field_rules), ...parseJson(question.validation_rules) },
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

  const now = new Date().toISOString();
  const changes = classifyChanges(db, currentQuestions, requestedQuestions);
  let result;

  if (changes.versioned) {
    // Goals sourced from a reworded or option-changed question keep following
    // it; count them so the editor can be told.
    const changedRoots = requestedQuestions
      .map(question => (question.fieldId ? currentByFieldId.get(question.fieldId) : null))
      .filter((source, index) => source && !isSameDefinition(db, source, requestedQuestions[index]))
      .map(source => Number(source.root_field_id));
    const affectedGoalCount = changedRoots.length === 0 ? 0 : Number(db.prepare(`
      SELECT COUNT(*) AS count FROM initiative_goal
      WHERE source_root_field_id IN (${changedRoots.map(() => '?').join(', ')})
    `).get(...changedRoots).count) || 0;
    result = {
      affectedGoalCount,
      ...createVersionedRevision(db, form, body, userId, currentVersion, currentQuestions, requestedQuestions, changes.removed, now),
      versionCreated: true,
      editMode: 'versioned',
      inPlaceChangeCount: 0,
    };
  } else {
    requestedQuestions.forEach(question =>
      promoteToLibrary(db, form, body, question, currentByFieldId.get(question.fieldId).field_id));
    const inPlaceChangeCount = applyInPlaceChanges(db, currentVersion, changes);
    result = {
      formVersionId: Number(currentVersion.form_version_id),
      versionNumber: Number(currentVersion.version_number),
      reusedQuestionCount: requestedQuestions.length,
      retiredQuestionCount: 0,
      retainedAnswerCount: 0,
      affectedGoalCount: 0,
      versionCreated: false,
      editMode: inPlaceChangeCount > 0 ? 'in_place' : 'none',
      inPlaceChangeCount,
    };
  }

  updateFormMetadata(db, form, body, userId, now);
  return { ...result, questionCount: requestedQuestions.length };
}

export { normalizeQuestion };
