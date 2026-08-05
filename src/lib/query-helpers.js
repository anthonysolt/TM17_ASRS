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
    SELECT f.field_id, f.field_key, f.field_label, f.field_type
    FROM field f
    JOIN form_field ff ON ff.field_id = f.field_id
    JOIN form fm ON fm.form_id = ff.form_id
    WHERE fm.initiative_id = ?
    ORDER BY ff.display_order
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
