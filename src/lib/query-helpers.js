function getPivotValueColumn(fieldType) {
  if (fieldType === 'number' || fieldType === 'rating') return 'sv.value_number';
  if (fieldType === 'date') return 'sv.value_date';
  if (fieldType === 'boolean' || fieldType === 'yesno') return 'sv.value_bool';
  if (fieldType === 'json') return 'sv.value_json';
  return 'sv.value_text';
}

/**
 * queryTableData — Pivots EAV submission_value rows into flat table rows
 * for a given initiative.
 *
 * Returns rows like: [{ id: 1, grade: "7th", school: "Lincoln MS", ... }]
 */
export function queryTableData(database, initiativeId) {
  // Look up the fields linked to this initiative's form
  const fields = database.prepare(`
    SELECT f.field_id, f.field_key, f.field_label, f.field_type,
           MIN(fq.display_order) AS display_order
    FROM field f
    JOIN form_questions fq ON fq.field_id = f.field_id
    JOIN form fm ON fm.form_id = fq.form_id
    WHERE fm.initiative_id = ?
    GROUP BY f.field_id, f.field_key, f.field_label, f.field_type
    ORDER BY display_order, f.field_id
  `).all(initiativeId);

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
    return `MAX(CASE WHEN fq.field_id = ${f.field_id} THEN ${valCol} END) AS [${label}]`;
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

/** Returns initiative submission data restricted to explicitly selected questions. */
export function querySelectedQuestionData(database, initiativeId, fieldIds) {
  if (!Array.isArray(fieldIds) || fieldIds.length === 0) {
    return { tableData: [], questions: [] };
  }

  const placeholders = fieldIds.map(() => '?').join(', ');
  const fields = database.prepare(`
    SELECT f.field_id, f.field_key, f.field_label, f.field_type,
           MIN(fq.display_order) AS display_order
    FROM field f
    JOIN form_questions fq ON fq.field_id = f.field_id
    JOIN form fm ON fm.form_id = fq.form_id
    WHERE fm.initiative_id = ? AND f.field_id IN (${placeholders})
    GROUP BY f.field_id, f.field_key, f.field_label, f.field_type
    ORDER BY display_order, f.field_id
  `).all(initiativeId, ...fieldIds);

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
    return `MAX(CASE WHEN fq.field_id = ${field.field_id} THEN ${valueColumn} END) AS [${field.column}]`;
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
