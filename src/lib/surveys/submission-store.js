// Survey responses, read from the normalized submission / submission_value
// tables (the single store for responses). Used by /api/surveys and
// /api/surveys/counts.
//
// A response is identified by submission.submission_id. Answers are keyed by
// the question's root_field_id, which every revision of a question shares, so
// answers given to an earlier version of an edited survey still line up with
// the survey's current questions (template questions expose it as `rootId`).

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

function toPositiveInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : NaN;
}

/**
 * Reads and validates list parameters from a URL's search params.
 * Returns { valid: true, value } or { valid: false, error }.
 */
export function parseSubmissionListParams(searchParams) {
  const templateId = toPositiveInt(searchParams.get('templateId'));
  const initiativeId = toPositiveInt(searchParams.get('initiativeId'));
  const surveyId = toPositiveInt(searchParams.get('surveyId'));
  for (const [name, value] of [['templateId', templateId], ['initiativeId', initiativeId], ['surveyId', surveyId]]) {
    if (Number.isNaN(value)) return { valid: false, error: `${name} must be a positive integer` };
  }

  const rawLimit = searchParams.get('limit');
  const rawOffset = searchParams.get('offset');
  const limit = rawLimit === null || rawLimit === '' ? DEFAULT_PAGE_SIZE : Number(rawLimit);
  const offset = rawOffset === null || rawOffset === '' ? 0 : Number(rawOffset);
  if (!Number.isInteger(limit) || limit < 1) return { valid: false, error: 'limit must be a positive integer' };
  if (!Number.isInteger(offset) || offset < 0) return { valid: false, error: 'offset must be a non-negative integer' };

  return {
    valid: true,
    value: { templateId, initiativeId, surveyId, limit: Math.min(limit, MAX_PAGE_SIZE), offset },
  };
}

function whereClause({ templateId, initiativeId, surveyId }) {
  const conditions = [];
  const params = [];
  if (surveyId) { conditions.push('s.submission_id = ?'); params.push(surveyId); }
  if (templateId) { conditions.push('s.form_id = ?'); params.push(templateId); }
  if (initiativeId) { conditions.push('s.initiative_id = ?'); params.push(initiativeId); }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

/** Stored answer columns → the value the UI shows (numbers stay numbers, checkbox lists become arrays). */
function decodeAnswer(row) {
  if (row.value_json !== null && row.value_json !== undefined) {
    try {
      return JSON.parse(row.value_json);
    } catch {
      return row.value_json;
    }
  }
  if (row.value_number !== null && row.value_number !== undefined) return Number(row.value_number);
  if (row.value_bool !== null && row.value_bool !== undefined) return Boolean(Number(row.value_bool));
  if (row.value_date !== null && row.value_date !== undefined) return row.value_date;
  return row.value_text ?? null;
}

/**
 * One page of responses, newest first, plus the total matching the filters.
 * filters: { templateId, initiativeId, surveyId, limit, offset }
 * Returns { surveys: [{ id, templateId, templateTitle, initiativeId,
 *   formVersionId, submittedAt, respondent, answers }], total }.
 */
export function querySubmissions(db, { templateId = null, initiativeId = null, surveyId = null, limit = DEFAULT_PAGE_SIZE, offset = 0 } = {}) {
  const where = whereClause({ templateId, initiativeId, surveyId });

  const total = Number(db.prepare(
    `SELECT COUNT(*) AS count FROM submission s ${where.sql}`
  ).get(...where.params)?.count || 0);

  const rows = db.prepare(`
    SELECT s.submission_id, s.form_id, s.initiative_id, s.form_version_id, s.submitted_at,
           f.form_name, u.first_name, u.last_name
    FROM submission s
    LEFT JOIN form f ON f.form_id = s.form_id
    LEFT JOIN user u ON u.user_id = s.submitted_by_user_id
    ${where.sql}
    ORDER BY s.submitted_at DESC, s.submission_id DESC
    LIMIT ? OFFSET ?
  `).all(...where.params, Number(limit), Number(offset));

  const answersBySubmission = new Map(rows.map((row) => [Number(row.submission_id), {}]));
  if (rows.length > 0) {
    const ids = rows.map((row) => Number(row.submission_id));
    const values = db.prepare(`
      SELECT sv.submission_id, fq.root_field_id,
             sv.value_text, sv.value_number, sv.value_date, sv.value_bool, sv.value_json
      FROM submission_value sv
      JOIN form_questions fq ON fq.form_question_id = sv.form_question_id
      WHERE sv.submission_id IN (${ids.map(() => '?').join(', ')})
    `).all(...ids);
    for (const value of values) {
      const answers = answersBySubmission.get(Number(value.submission_id));
      if (answers) answers[Number(value.root_field_id)] = decodeAnswer(value);
    }
  }

  return {
    total,
    surveys: rows.map((row) => {
      const respondent = [row.first_name, row.last_name].filter(Boolean).join(' ');
      return {
        id: Number(row.submission_id),
        templateId: row.form_id == null ? null : Number(row.form_id),
        templateTitle: row.form_name || null,
        initiativeId: row.initiative_id == null ? null : Number(row.initiative_id),
        formVersionId: row.form_version_id == null ? null : Number(row.form_version_id),
        submittedAt: row.submitted_at,
        respondent: respondent || null,
        answers: answersBySubmission.get(Number(row.submission_id)) || {},
      };
    }),
  };
}

/**
 * Number of responses per survey, without loading any answers.
 * Returns { counts: { [templateId]: n }, total }.
 */
export function countSubmissionsByTemplate(db, { initiativeId = null } = {}) {
  const where = whereClause({ initiativeId });
  const rows = db.prepare(`
    SELECT s.form_id, COUNT(*) AS count
    FROM submission s
    ${where.sql}
    GROUP BY s.form_id
  `).all(...where.params);

  const counts = {};
  let total = 0;
  for (const row of rows) {
    const count = Number(row.count || 0);
    counts[Number(row.form_id)] = count;
    total += count;
  }
  return { counts, total };
}
