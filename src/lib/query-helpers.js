function getPivotValueColumn(fieldType) {
  if (fieldType === 'number' || fieldType === 'rating') return 'sv.value_number';
  if (fieldType === 'date') return 'sv.value_date';
  if (fieldType === 'boolean' || fieldType === 'yesno') return 'sv.value_bool';
  if (fieldType === 'json') return 'sv.value_json';
  return 'sv.value_text';
}

/**
 * queryInitiativeQuestions — One row per question (root_field_id) used by an
 * initiative's forms, described by its most recent iteration. Every revision
 * of a question shares a root_field_id, so the question appears once and its
 * answers from all revisions are reported together. `field_id` is the root id.
 */
export function queryInitiativeQuestions(database, initiativeId, rootFieldIds = null) {
  if (Array.isArray(rootFieldIds) && rootFieldIds.length === 0) return [];
  const rootFilter = Array.isArray(rootFieldIds)
    ? `AND fq.root_field_id IN (${rootFieldIds.map(() => '?').join(', ')})`
    : '';

  return database.prepare(`
    SELECT fq.root_field_id AS field_id, f.field_key, f.field_label, f.field_type,
           fvq.display_order, fv.version_number
    FROM form_version_questions fvq
    JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
    JOIN field f ON f.field_id = fq.field_id
    JOIN form fm ON fm.form_id = fq.form_id
    JOIN form_version fv ON fv.form_version_id = fvq.form_version_id
    WHERE fm.initiative_id = ? ${rootFilter}
      AND (fvq.form_version_id, fvq.form_question_id) = (
        SELECT latest_fvq.form_version_id, latest_fvq.form_question_id
        FROM form_version_questions latest_fvq
        JOIN form_questions latest ON latest.form_question_id = latest_fvq.form_question_id
        JOIN form latest_form ON latest_form.form_id = latest.form_id
        WHERE latest.root_field_id = fq.root_field_id
          AND latest_form.initiative_id = fm.initiative_id
        ORDER BY latest_fvq.form_version_id DESC, latest_fvq.form_question_id DESC
        LIMIT 1
      )
    ORDER BY fvq.display_order, fq.root_field_id
  `).all(initiativeId, ...(rootFieldIds || []));
}

/**
 * queryTableData — Pivots EAV submission_value rows into flat table rows
 * for a given initiative.
 *
 * Returns rows like: [{ id: 1, grade: "7th", school: "Lincoln MS", ... }]
 */
export function queryTableData(database, initiativeId) {
  // Look up the questions linked to this initiative's forms
  const fields = queryInitiativeQuestions(database, initiativeId);

  if (fields.length === 0) return [];

  // Build dynamic pivot columns using field_label for readable column names
  // Fall back to field_key if label is empty; deduplicate by appending index
  const usedLabels = new Set();
  const pivotCols = fields.map(f => {
    const valCol = getPivotValueColumn(f.field_type);
    let label = f.field_label || f.field_key;
    if (usedLabels.has(label)) {
      label = `${label} (${f.field_id})`;
    }
    usedLabels.add(label);
    return `MAX(CASE WHEN fq.root_field_id = ${f.field_id} THEN ${valCol} END) AS [${label}]`;
  }).join(',\n    ');

  const sql = `
    SELECT s.submission_id AS id,
    ${pivotCols}
    FROM submission s
    JOIN submission_value sv ON sv.submission_id = s.submission_id
    JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
    WHERE s.initiative_id = ?
    GROUP BY s.submission_id
    ORDER BY s.submission_id
  `;

  return database.prepare(sql).all(initiativeId);
}

/**
 * Returns initiative submission data restricted to explicitly selected questions.
 * fieldIds are root question ids; answers from every revision are included.
 */
export function querySelectedQuestionData(database, initiativeId, fieldIds) {
  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    return { tableData: [], questions: [] };
  }

  const fields = queryInitiativeQuestions(database, initiativeId, fieldIds);

  const usedLabels = new Set();
  const questions = fields.map((field) => {
    let column = field.field_label || field.field_key || `Question ${field.field_id}`;
    if (usedLabels.has(column)) column = `${column} (${field.field_id})`;
    usedLabels.add(column);
    return { ...field, column };
  });

  if (questions.length === 0) return { tableData: [], questions };
  const pivotColumns = questions.map((field) => {
    const valueColumn = getPivotValueColumn(field.field_type);
    return `MAX(CASE WHEN fq.root_field_id = ${field.field_id} THEN ${valueColumn} END) AS [${field.column}]`;
  }).join(',\n    ');

  const tableData = database.prepare(`
    SELECT s.submission_id AS id,
    ${pivotColumns}
    FROM submission s
    LEFT JOIN submission_value sv ON sv.submission_id = s.submission_id
    LEFT JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
    WHERE s.initiative_id = ?
    GROUP BY s.submission_id
    ORDER BY s.submission_id
  `).all(initiativeId);

  return { tableData, questions };
}
