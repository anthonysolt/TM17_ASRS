import db, { initializeDatabase } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/server-auth';
import { validateAndCleanSurvey, validateTemplateAnswers } from '@/lib/survey-validation';
import { alertDb } from '@/lib/db-alerts';

function resolveRules(fieldRulesJson, formFieldRulesJson) {
  const parse = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
  };
  const base = parse(fieldRulesJson);
  const override = parse(formFieldRulesJson);
  if (!base && !override) return null;
  return { ...base, ...override };
}

function toLocalYyyyMmDd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// POST - Submit a survey
export async function POST(request) {
  try {
    initializeDatabase();

    const body = await request.json();
    const cleaned = validateAndCleanSurvey(body);

    // Duplicate submission guard: exact same email + responses JSON
    const responsesJSON = JSON.stringify(cleaned.responses);
    const existing = db.prepare(`SELECT id FROM surveys WHERE email = ? AND responses = ? LIMIT 1`).get(cleaned.email, responsesJSON);
    if (existing) {
      return NextResponse.json({ error: 'Duplicate submission detected' }, { status: 409 });
    }

    // Prefer an explicit templateId at top-level; fall back to responses.templateId
    const effectiveTemplateId = cleaned.templateId || (cleaned.responses && cleaned.responses.templateId) || null;

    // Validate template answers BEFORE persisting anything.
    {
      const templateCandidate = effectiveTemplateId || (cleaned.responses && cleaned.responses.templateId);
      if (templateCandidate) {
        const formRow = db.prepare(`SELECT form_id, initiative_id FROM form WHERE form_id = ? LIMIT 1`).get(Number(templateCandidate));
        if (formRow && formRow.form_id) {
          const answersToValidate = cleaned.responses && cleaned.responses.templateAnswers ? cleaned.responses.templateAnswers : null;
          if (answersToValidate && Object.keys(answersToValidate).length > 0) {
            // Load field definitions + options for this form
            const formFields = db.prepare(`
              SELECT f.field_id, f.field_type, ff.required,
                     f.validation_rules AS field_rules,
                     ff.validation_rules AS form_field_rules
              FROM form_field ff
              JOIN field f ON ff.field_id = f.field_id
              WHERE ff.form_id = ?
            `).all(formRow.form_id);

            const getOptions = db.prepare(`SELECT option_value FROM field_options WHERE field_id = ? ORDER BY display_order`);
            for (const ff of formFields) {
              const rules = resolveRules(ff.field_rules, ff.form_field_rules);
              const displayType = rules?.ui_type || ff.field_type;
              ff.field_type = displayType;
              if (['select', 'radio', 'choice', 'multiselect'].includes(displayType)) {
                ff.options = getOptions.all(ff.field_id).map(o => o.option_value);
              }
            }

            const validationErrors = validateTemplateAnswers(answersToValidate, formFields);
            if (validationErrors.length > 0) {
              return NextResponse.json({
                error: 'Validation failed',
                field_errors: validationErrors,
              }, { status: 400 });
            }
          }
        }
      }
    }

    // Keep survey persistence and distribution counting atomic.
    const insertSurvey = db.transaction((name, email, responsesJSONInner, templateId) => {
      const surveyInfo = db.prepare(`INSERT INTO surveys (name, email, responses) VALUES (?, ?, ?)`).run(name, email, responsesJSONInner);
      const surveyId = surveyInfo.lastInsertRowid;

      if (templateId) {
        const today = toLocalYyyyMmDd(new Date());
        const activeDistribution = db.prepare(`
          SELECT distribution_id
          FROM survey_distribution
          WHERE survey_template_id = ?
            AND ? >= start_date
            AND ? <= end_date
          ORDER BY created_at DESC
          LIMIT 1
        `).get(String(templateId), today, today);

        if (activeDistribution?.distribution_id) {
          db.prepare(`UPDATE survey_distribution SET response_count = response_count + 1 WHERE distribution_id = ?`).run(activeDistribution.distribution_id);
        }
      }

      return surveyId;
    });

    const surveyId = insertSurvey(
      cleaned.name,
      cleaned.email,
      responsesJSON,
      effectiveTemplateId
    );

    // Attempt to populate normalized submission tables when a form mapping exists.
    // This is best-effort and should not abort the main survey submission.
    try {
      const templateCandidate = effectiveTemplateId || (cleaned.responses && cleaned.responses.templateId);
      if (templateCandidate) {
        // Try to resolve to a numeric form_id
        const formRow = db.prepare(`SELECT form_id, initiative_id FROM form WHERE form_id = ? LIMIT 1`).get(Number(templateCandidate));
        if (formRow && formRow.form_id) {
          // Build and run a transaction for normalized inserts
          const insertNormalized = db.transaction((formId, initiativeId, answers) => {
            const submissionInfo = db.prepare(`INSERT INTO submission (initiative_id, form_id, submitted_by_user_id) VALUES (?, ?, NULL)`).run(initiativeId || 1, formId);
            const submissionId = submissionInfo.lastInsertRowid;

            const insertVal = db.prepare(`INSERT INTO submission_value (submission_id, field_id, value_text, value_number, value_date, value_bool, value_json) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            const getField = db.prepare(`
              SELECT f.field_type
              FROM field f
              JOIN form_field ff ON ff.field_id = f.field_id
              WHERE f.field_id = ? AND ff.form_id = ?
              LIMIT 1
            `);

            for (const [fieldKey, rawVal] of Object.entries(answers || {})) {
              const fieldId = Number(fieldKey);
              if (!fieldId) continue;
              const field = getField.get(fieldId, formId);
              if (!field) continue;

              let v_text = null;
              let v_number = null;
              let v_date = null;
              let v_bool = null;
              let v_json = null;

              if (rawVal === null || rawVal === undefined || rawVal === '') {
                // leave all null
              } else if (field.field_type === 'number' || field.field_type === 'rating') {
                const numericValue = Number(rawVal);
                if (Number.isFinite(numericValue)) v_number = numericValue;
              } else if (field.field_type === 'boolean' || field.field_type === 'yesno') {
                v_bool = rawVal === true || rawVal === 1 || rawVal === '1' || rawVal === 'true' || rawVal === 'yes' ? 1 : 0;
              } else if (field.field_type === 'date') {
                v_date = String(rawVal);
              } else if (field.field_type === 'json' || field.field_type === 'multiselect' || typeof rawVal === 'object') {
                v_json = JSON.stringify(rawVal);
              } else {
                v_text = String(rawVal).slice(0, 1000);
              }

              try {
                insertVal.run(submissionId, fieldId, v_text, v_number, v_date, v_bool, v_json);
              } catch (e) {
                // Ignore unique constraint or individual value errors; continue
              }
            }
          });

          // Look for answers in the conventional `templateAnswers` object sent by the UI
          const answers = cleaned.responses && cleaned.responses.templateAnswers ? cleaned.responses.templateAnswers : null;
          if (answers && Object.keys(answers).length > 0) {
            insertNormalized(formRow.form_id, formRow.initiative_id, answers);
          }
        }
      }
    } catch (err) {
      try {
        alertDb(err, { route: '/api/surveys POST (normalized insert)' }).catch(() => void 0);
      } catch (e) {
        // ignore
      }
      console.error('Normalized insert failed:', err);
    }

    const savedSurvey = db.prepare('SELECT id, name, email, responses, submitted_at FROM surveys WHERE id = ?').get(surveyId);
    const submissionInfo = savedSurvey
      ? {
          id: savedSurvey.id,
          name: savedSurvey.name,
          email: savedSurvey.email,
          responses: savedSurvey.responses ? JSON.parse(savedSurvey.responses) : null,
          submittedAt: savedSurvey.submitted_at,
        }
      : null;

    return NextResponse.json({
      success: true,
      surveyId: Number(surveyId),
      submittedAt: submissionInfo?.submittedAt || new Date().toISOString(),
      survey: submissionInfo,
    });
  } catch (error) {
    const errorMessage = String(error?.message || '');
    const isValidationError = /missing|required|invalid/i.test(errorMessage);

    try {
      if (!isValidationError) {
        alertDb(error, { route: '/api/surveys POST' }).catch(() => void 0);
      }
    } catch (e) {
      // ignore
    }
    console.error('Error submitting survey:', error);
    return NextResponse.json(
      { error: isValidationError ? 'Invalid survey payload' : 'Failed to submit survey', details: errorMessage },
      { status: isValidationError ? 400 : 500 }
    );
  }
}

// GET - Fetch all surveys and reports
export async function GET(request) {
  try {
    initializeDatabase();
    // PII-sensitive endpoint: only admins can retrieve raw survey submissions.
    const auth = requirePermission(request, db, 'surveys.distribute', { requireCsrf: false });
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const surveyId = url.searchParams.get('surveyId');

    const baseQuery = `
      SELECT
        s.id,
        s.name,
        s.email,
        s.responses,
        s.submitted_at,
        r.report_data,
        r.created_at AS report_created_at
      FROM surveys s
      LEFT JOIN reports r ON s.id = r.survey_id
    `;

    const rows = surveyId
      ? db.prepare(`${baseQuery} WHERE s.id = ? ORDER BY s.submitted_at DESC`).all(Number(surveyId))
      : db.prepare(`${baseQuery} ORDER BY s.submitted_at DESC`).all();

    const formattedSurveys = rows.map((survey) => ({
      id: survey.id,
      name: survey.name,
      email: survey.email,
      responses: JSON.parse(survey.responses),
      submittedAt: survey.submitted_at,
      report: survey.report_data ? JSON.parse(survey.report_data) : null,
      reportCreatedAt: survey.report_created_at,
    }));

    return NextResponse.json({ surveys: formattedSurveys });
  } catch (error) {
    console.error('Error fetching surveys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch surveys', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    initializeDatabase();
    const auth = requirePermission(request, db, 'surveys.distribute');
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const surveyId = Number(url.searchParams.get('surveyId'));
    if (!surveyId || Number.isNaN(surveyId)) {
      return NextResponse.json({ error: 'Missing or invalid surveyId' }, { status: 400 });
    }

    const survey = db.prepare('SELECT id, responses, submitted_at FROM surveys WHERE id = ?').get(surveyId);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }
    let templateId = null;
    try {
      templateId = JSON.parse(survey.responses || '{}')?.templateId || null;
    } catch {
      // Malformed legacy responses should not prevent deletion.
    }

    const deleteTransaction = db.transaction((id, linkedTemplateId, submittedAt) => {
      const reportIds = db.prepare('SELECT id FROM reports WHERE survey_id = ?').all(id).map(report => report.id);
      if (reportIds.length > 0) {
        const placeholders = reportIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM report_generation_log WHERE report_id IN (${placeholders})`).run(...reportIds);
      }
      const deletedReports = db.prepare('DELETE FROM reports WHERE survey_id = ?').run(id).changes;
      const deletedSubmissions = linkedTemplateId
        ? db.prepare('DELETE FROM submission WHERE form_id = ?').run(Number(linkedTemplateId)).changes
        : 0;
      const deletedQrCodes = db.prepare("DELETE FROM qr_codes WHERE qr_type = 'survey' AND target_id = ?").run(id).changes;

      if (linkedTemplateId) {
        const submittedDate = String(submittedAt || '').slice(0, 10);
        const distribution = db.prepare(`
          SELECT distribution_id
          FROM survey_distribution
          WHERE survey_template_id = ? AND ? BETWEEN start_date AND end_date
          ORDER BY created_at DESC
          LIMIT 1
        `).get(String(linkedTemplateId), submittedDate);
        if (distribution) {
          db.prepare(`
            UPDATE survey_distribution
            SET response_count = CASE WHEN response_count > 0 THEN response_count - 1 ELSE 0 END
            WHERE distribution_id = ?
          `).run(distribution.distribution_id);
        }
      }

      db.prepare('DELETE FROM surveys WHERE id = ?').run(id);
      return { deletedReports, deletedSubmissions, deletedQrCodes };
    });

    const deleted = deleteTransaction(surveyId, templateId, survey.submitted_at);

    return NextResponse.json({ success: true, surveyId, deleted });
  } catch (error) {
    console.error('Error deleting survey:', error);
    return NextResponse.json(
      { error: 'Failed to delete survey', details: String(error?.message || error) },
      { status: 500 }
    );
  }
}
