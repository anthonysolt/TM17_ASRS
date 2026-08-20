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
           f.attribute_id, ia.name AS attribute_name
    FROM field f
    LEFT JOIN initiative_attribute ia ON ia.attribute_id = f.attribute_id
    JOIN form_field ff ON ff.field_id = f.field_id
    JOIN form fm ON fm.form_id = ff.form_id
    WHERE fm.initiative_id = ?
    ORDER BY ff.display_order
  `).all(initiativeId);

  if (fields.length === 0) return [];

  // Attribute names are stable reporting identities. Legacy fields without an
  // explicit attribute retain their readable label/key fallback.
  const usedLabels = new Set();
  const pivotCols = fields.map(f => {
    const valCol = getPivotValueColumn(f.field_type);
    let label = f.attribute_name || f.field_label || f.field_key;
    if (usedLabels.has(label)) {
      label = `${label} (${f.field_id})`;
    }
    usedLabels.add(label);
    return `MAX(CASE WHEN sv.field_id = ${f.field_id} THEN ${valCol} END) AS [${label}]`;
  }).join(',\n    ');

  const sql = `
    SELECT s.submission_id AS id,
    ${pivotCols}
    FROM submission s
    JOIN submission_value sv ON sv.submission_id = s.submission_id
    WHERE s.initiative_id = ?
    GROUP BY s.submission_id
    ORDER BY s.submission_id
  `;

  return database.prepare(sql).all(initiativeId);
}

/**
 * Returns the attributes and survey questions that are actually attached to an
 * initiative's forms. IDs are used by report configuration so duplicate labels
 * and renamed fields cannot silently change what a saved report analyzes.
 */
export function queryInitiativeReportOptions(database, initiativeId) {
  const attributes = database.prepare(`
    SELECT ia.attribute_id, ia.name, ia.data_type,
           COUNT(DISTINCT f.field_id) AS question_count
    FROM initiative_attribute ia
    LEFT JOIN field f ON f.attribute_id = ia.attribute_id
      AND EXISTS (
        SELECT 1
        FROM form_field ff
        JOIN form fm ON fm.form_id = ff.form_id
        WHERE ff.field_id = f.field_id AND fm.initiative_id = ia.initiative_id
      )
    WHERE ia.initiative_id = ?
    GROUP BY ia.attribute_id, ia.name, ia.data_type
    ORDER BY ia.name
  `).all(initiativeId).map((row) => ({
    id: Number(row.attribute_id),
    name: row.name,
    dataType: row.data_type,
    questionCount: Number(row.question_count || 0),
  }));

  const questions = database.prepare(`
    SELECT DISTINCT f.field_id, f.field_label, f.field_type, f.attribute_id,
           ia.name AS attribute_name, MIN(ff.display_order) AS display_order
    FROM field f
    JOIN form_field ff ON ff.field_id = f.field_id
    JOIN form fm ON fm.form_id = ff.form_id
    LEFT JOIN initiative_attribute ia ON ia.attribute_id = f.attribute_id
    WHERE fm.initiative_id = ?
    GROUP BY f.field_id, f.field_label, f.field_type, f.attribute_id, ia.name
    ORDER BY display_order, f.field_id
  `).all(initiativeId).map((row) => ({
    id: Number(row.field_id),
    label: row.field_label,
    type: row.field_type,
    attributeId: row.attribute_id == null ? null : Number(row.attribute_id),
    attributeName: row.attribute_name || null,
  }));

  return { attributes, questions };
}

/** Pivot only the selected fields, using question labels as report columns. */
export function querySelectedQuestionData(database, initiativeId, fieldIds) {
  const requestedIds = [...new Set((fieldIds || []).map(Number).filter(Number.isFinite))];
  if (requestedIds.length === 0) return { tableData: [], columnsByFieldId: {} };

  const options = queryInitiativeReportOptions(database, initiativeId);
  const requested = new Set(requestedIds);
  const selectedFields = options.questions.filter((question) => requested.has(question.id));
  if (selectedFields.length === 0) return { tableData: [], columnsByFieldId: {} };

  const usedLabels = new Set();
  const columnsByFieldId = {};
  const pivotCols = selectedFields.map((field) => {
    const valCol = getPivotValueColumn(field.type);
    let label = field.label || `Question ${field.id}`;
    if (usedLabels.has(label)) label = `${label} (${field.id})`;
    usedLabels.add(label);
    columnsByFieldId[field.id] = label;
    return `MAX(CASE WHEN sv.field_id = ${field.id} THEN ${valCol} END) AS [${label}]`;
  }).join(',\n    ');

  const tableData = database.prepare(`
    SELECT s.submission_id AS id,
    ${pivotCols}
    FROM submission s
    LEFT JOIN submission_value sv ON sv.submission_id = s.submission_id
    WHERE s.initiative_id = ?
    GROUP BY s.submission_id
    ORDER BY s.submission_id
  `).all(initiativeId);

  return { tableData, columnsByFieldId };
}
