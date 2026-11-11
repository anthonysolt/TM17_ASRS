function getPivotValueColumn(fieldType) {
  if (fieldType === 'number' || fieldType === 'rating') return 'sv.value_number';
  if (fieldType === 'date') return 'sv.value_date';
  if (fieldType === 'boolean') return 'sv.value_bool';
  // Checkbox answers are saved as a JSON array of the ticked options.
  if (fieldType === 'json' || fieldType === 'multiselect') return 'sv.value_json';
  return 'sv.value_text';
}

function parseMultiselectAnswer(value) {
  if (value === null || value === undefined || value === '') return null;
  let parsed = value;
  try {
    parsed = JSON.parse(value);
  } catch {
    // A bare string is treated as a single ticked option.
  }
  const options = (Array.isArray(parsed) ? parsed : [parsed])
    .filter((option) => option !== null && option !== undefined && String(option).trim() !== '')
    .map(String);
  return options.length > 0 ? options : null;
}

/**
 * decodeMultiselectColumns — Turns stored JSON checkbox answers into arrays of
 * ticked options so reports can count each option separately.
 */
function decodeMultiselectColumns(rows, questions) {
  const columns = questions.filter((question) => question.field_type === 'multiselect').map((question) => question.column);
  if (columns.length === 0) return rows;
  return rows.map((row) => {
    const decoded = { ...row };
    columns.forEach((column) => {
      decoded[column] = parseMultiselectAnswer(row[column]);
    });
    return decoded;
  });
}

/**
 * pivotQuestionColumns — SELECT expressions for one pivot column per question.
 * Columns are aliased by id (q_<id>) rather than by label: PostgreSQL silently
 * truncates identifiers longer than 63 bytes, and a label containing " or ]
 * would break out of a quoted identifier. remapPivotRows renames them back.
 * questions: [{ field_id, field_type, column }]
 */
function pivotQuestionColumns(questions) {
  return questions.map((question) => {
    const id = Number(question.field_id);
    if (!Number.isInteger(id)) throw new Error(`Invalid question id: ${question.field_id}`);
    return `MAX(CASE WHEN fq.root_field_id = ${id} THEN ${getPivotValueColumn(question.field_type)} END) AS q_${id}`;
  }).join(',\n    ');
}

/** Renames q_<id> pivot keys to each question's column name (its label). */
function remapPivotRows(rows, questions) {
  return rows.map((row) => {
    const mapped = { id: row.id };
    questions.forEach((question) => {
      mapped[question.column] = row[`q_${Number(question.field_id)}`] ?? null;
    });
    return mapped;
  });
}

/** The calendar day after a YYYY-MM-DD date, as YYYY-MM-DD. */
function nextDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * submittedAtClause — SQL condition limiting submissions (alias `s`) to a date
 * range on submitted_at. Both dates are YYYY-MM-DD and inclusive; either may be
 * empty. The end bound is "before the next day", which covers every timestamp
 * on the end day in both stored formats ('YYYY-MM-DD HH:MM:SS' and ISO with
 * fractional seconds) when compared as text.
 */
export function submittedAtClause({ startDate, endDate } = {}) {
  const conditions = [];
  const params = [];
  if (startDate) {
    conditions.push('s.submitted_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('s.submitted_at < ?');
    params.push(nextDay(endDate));
  }
  return { sql: conditions.map((condition) => ` AND ${condition}`).join(''), params };
}

/**
 * queryInitiativeQuestions — One row per question (root_field_id) used by an
 * initiative's forms, described by its most recent iteration. Every revision
 * of a question shares a root_field_id, so the question appears once and its
 * answers from all revisions are reported together. `field_id` is the root id.
 * `is_active` is 1 when the question is on a form's published version and 0
 * when it was retired (removed in an edit); retired questions keep their
 * answers so reports can still show them.
 */
export function queryInitiativeQuestions(database, initiativeId, rootFieldIds = null) {
  if (Array.isArray(rootFieldIds) && rootFieldIds.length === 0) return [];
  const rootFilter = Array.isArray(rootFieldIds)
    ? `AND fq.root_field_id IN (${rootFieldIds.map(() => '?').join(', ')})`
    : '';

  // One pass over the initiative's placements, keeping the latest per root.
  return database.prepare(`
    SELECT field_id, field_key, field_label, field_type, validation_rules, display_order, version_number, is_active
    FROM (
      SELECT fq.root_field_id AS field_id, f.field_key, f.field_label, f.field_type, f.validation_rules,
             fvq.display_order, fv.version_number,
             CASE WHEN SUM(CASE WHEN fv.status = 'published' THEN 1 ELSE 0 END)
                    OVER (PARTITION BY fq.root_field_id) > 0 THEN 1 ELSE 0 END AS is_active,
             ROW_NUMBER() OVER (
               PARTITION BY fq.root_field_id
               ORDER BY fvq.form_version_id DESC, fvq.form_question_id DESC
             ) AS latest_rank
      FROM form_version_questions fvq
      JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
      JOIN field f ON f.field_id = fq.field_id
      JOIN form fm ON fm.form_id = fq.form_id
      JOIN form_version fv ON fv.form_version_id = fvq.form_version_id
      WHERE fm.initiative_id = ? ${rootFilter}
    ) ranked
    WHERE latest_rank = 1
    ORDER BY display_order, field_id
  `).all(initiativeId, ...(rootFieldIds || []));
}

/**
 * queryTableData — Pivots EAV submission_value rows into flat table rows
 * for a given initiative.
 *
 * Returns rows like: [{ id: 1, grade: "7th", school: "Lincoln MS", ... }]
 * dateRange: optional { startDate, endDate } on submitted_at (see submittedAtClause).
 */
export function queryTableData(database, initiativeId, dateRange) {
  // Look up the questions linked to this initiative's forms
  const fields = queryInitiativeQuestions(database, initiativeId);

  if (fields.length === 0) return [];

  // Build dynamic pivot columns using field_label for readable column names
  // Fall back to field_key if label is empty; deduplicate by appending index
  const usedLabels = new Set();
  const columns = fields.map(f => {
    let label = f.field_label || f.field_key;
    if (usedLabels.has(label)) {
      label = `${label} (${f.field_id})`;
    }
    usedLabels.add(label);
    return { field_id: f.field_id, field_type: f.field_type, column: label };
  });
  const pivotCols = pivotQuestionColumns(columns);
  const dateClause = submittedAtClause(dateRange);

  const sql = `
    SELECT s.submission_id AS id,
    ${pivotCols}
    FROM submission s
    JOIN submission_value sv ON sv.submission_id = s.submission_id
    JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
    WHERE s.initiative_id = ?${dateClause.sql}
    GROUP BY s.submission_id
    ORDER BY s.submission_id
  `;

  const rows = remapPivotRows(database.prepare(sql).all(initiativeId, ...dateClause.params), columns);
  return decodeMultiselectColumns(rows, columns);
}

/**
 * Returns initiative submission data restricted to explicitly selected questions.
 * fieldIds are root question ids; answers from every revision are included.
 * dateRange: optional { startDate, endDate } on submitted_at (see submittedAtClause).
 */
export function querySelectedQuestionData(database, initiativeId, fieldIds, dateRange) {
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
  const pivotColumns = pivotQuestionColumns(questions);
  const dateClause = submittedAtClause(dateRange);

  const tableData = database.prepare(`
    SELECT s.submission_id AS id,
    ${pivotColumns}
    FROM submission s
    LEFT JOIN submission_value sv ON sv.submission_id = s.submission_id
    LEFT JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
    WHERE s.initiative_id = ?${dateClause.sql}
    GROUP BY s.submission_id
    ORDER BY s.submission_id
  `).all(initiativeId, ...dateClause.params);

  return { tableData: decodeMultiselectColumns(remapPivotRows(tableData, questions), questions), questions };
}
