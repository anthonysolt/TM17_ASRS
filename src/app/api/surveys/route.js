import db, { initializeDatabase } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/server-auth';
import { validateAndCleanSurvey, validateTemplateAnswers } from '@/lib/survey-validation';
import { alertDb } from '@/lib/db-alerts';
import { hasFixedOptions } from '@/lib/forms/fixed-options';
import { syncQuestionSourcedGoals } from '@/lib/goals/question-source';
import { parseSubmissionListParams, querySubmissions } from '@/lib/surveys/submission-store';

function toLocalYyyyMmDd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// POST - Submit a survey

/**
 * Re-sync goals sourced from survey answers after a response changes. The
 * response itself is already saved, so a failure is alerted and returned as a
 * warning instead of failing the request. Returns the warning text, or null.
 */
function runGoalSync(initiativeId, userEmail, route) {
  try {
    if (initiativeId == null) {
      throw new Error('Submission has no initiative_id; goals were not synced');
    }
    syncQuestionSourcedGoals(db, initiativeId, { userEmail });
    return null;
  } catch (err) {
    console.error(`${route} failed:`, err);
    Promise.resolve()
      .then(() => alertDb(err, { route }))
      .catch((alertErr) => console.error('Failed to send goal sync alert:', alertErr));
    return 'The response was saved, but linked goals could not be updated.';
  }
}

export async function POST(request) {
  try {
    initializeDatabase();

    const body = await request.json();
    const cleaned = validateAndCleanSurvey(body);

    // Prefer an explicit templateId at top-level; fall back to responses.templateId
    const effectiveTemplateId = cleaned.templateId || (cleaned.responses && cleaned.responses.templateId) || null;
    if (!effectiveTemplateId) {
      return NextResponse.json({ error: 'A survey (templateId) is required to submit a response' }, { status: 400 });
    }

    const formRow = db.prepare(`
      SELECT f.form_id, f.form_name, f.initiative_id, fv.form_version_id
      FROM form f
      JOIN form_version fv ON fv.form_id = f.form_id AND fv.status = 'published'
      WHERE f.form_id = ?
      ORDER BY fv.version_number DESC
      LIMIT 1
    `).get(Number(effectiveTemplateId));
    if (!formRow || !formRow.form_id) {
      return NextResponse.json({ error: 'Survey not found or not published' }, { status: 404 });
    }

    const answers = cleaned.responses && cleaned.responses.templateAnswers ? cleaned.responses.templateAnswers : {};

    // Validate template answers BEFORE persisting anything.
    if (Object.keys(answers).length > 0) {
      // Load field definitions + options for this form
      const formFields = db.prepare(`
        SELECT f.field_id, f.field_type, fq.required,
               f.validation_rules AS field_rules,
               fq.validation_rules AS form_field_rules
        FROM form_version_questions fvq
        JOIN form_questions fq ON fq.form_question_id = fvq.form_question_id
        JOIN field f ON fq.field_id = f.field_id
        WHERE fq.form_id = ? AND fvq.form_version_id = ? AND fq.is_hidden = 0
      `).all(formRow.form_id, formRow.form_version_id);

      const getOptions = db.prepare(`SELECT option_value FROM field_options WHERE field_id = ? ORDER BY display_order`);
      for (const ff of formFields) {
        try {
          const rules = ff.field_rules ? JSON.parse(ff.field_rules) : null;
          if (rules?.ui_type) ff.field_type = rules.ui_type;
        } catch (err) {
          // Keep the stored field type when validation metadata is malformed.
          console.warn(`Malformed field_rules for field ${ff.field_id}:`, err?.message || err);
        }
        if (['select', 'radio', 'choice', 'multiselect', 'checkbox'].includes(ff.field_type) || hasFixedOptions(ff.field_type)) {
          ff.options = getOptions.all(ff.field_id).map(o => o.option_value);
        }
      }

      const validationErrors = validateTemplateAnswers(answers, formFields);
      if (validationErrors.length > 0) {
        return NextResponse.json({
          error: 'Validation failed',
          field_errors: validationErrors,
        }, { status: 400 });
      }
    }

    // The submission, its answers and the distribution's response count are
    // saved together: either all of them are stored or none are.
    const insertSubmission = db.transaction((formId, formVersionId, initiativeId, templateAnswers) => {
      const submissionInfo = db.prepare(`INSERT INTO submission (initiative_id, form_id, form_version_id, submitted_by_user_id) VALUES (?, ?, ?, NULL)`).run(initiativeId || 1, formId, formVersionId);
      const submissionId = Number(submissionInfo.lastInsertRowid);

      const insertVal = db.prepare(`INSERT INTO submission_value (submission_id, form_question_id, value_text, value_number, value_date, value_bool, value_json) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      const getField = db.prepare(`
        SELECT fq.form_question_id, f.field_type, f.validation_rules
        FROM field f
        JOIN form_questions fq ON fq.field_id = f.field_id
        JOIN form_version_questions fvq ON fvq.form_question_id = fq.form_question_id
        WHERE f.field_id = ? AND fq.form_id = ? AND fvq.form_version_id = ? AND fq.is_hidden = 0
        LIMIT 1
      `);

      for (const [fieldKey, rawVal] of Object.entries(templateAnswers || {})) {
        const fieldId = Number(fieldKey);
        if (!fieldId) continue;
        // Answers to questions that aren't on the current version are ignored.
        const field = getField.get(fieldId, formId, formVersionId);
        if (!field) continue;

        let displayType = field.field_type;
        try {
          displayType = JSON.parse(field.validation_rules || '{}').ui_type || displayType;
        } catch (err) {
          // Fall back to the storage type when optional UI metadata is malformed.
          console.warn(`Malformed validation_rules for field ${fieldId}:`, err?.message || err);
        }

        let v_text = null;
        let v_number = null;
        let v_date = null;
        let v_bool = null;
        let v_json = null;

        if (rawVal === null || rawVal === undefined) {
          // leave all null
        } else if (field.field_type === 'number' || field.field_type === 'rating') {
          const numericValue = Number(rawVal);
          if (Number.isFinite(numericValue)) v_number = numericValue;
        } else if (['select', 'radio', 'choice', 'yesno'].includes(displayType)) {
          v_text = String(rawVal).slice(0, 1000);
        } else if (field.field_type === 'boolean') {
          v_bool = rawVal === true || rawVal === 1 || rawVal === '1' || rawVal === 'true' || rawVal === 'yes' ? 1 : 0;
        } else if (field.field_type === 'date') {
          v_date = String(rawVal);
        } else if (field.field_type === 'json' || field.field_type === 'multiselect' || displayType === 'checkbox' || typeof rawVal === 'object') {
          v_json = JSON.stringify(rawVal);
        } else {
          v_text = String(rawVal).slice(0, 1000);
        }

        insertVal.run(submissionId, field.form_question_id, v_text, v_number, v_date, v_bool, v_json);
      }

      const today = toLocalYyyyMmDd(new Date());
      const activeDistribution = db.prepare(`
        SELECT distribution_id
        FROM survey_distribution
        WHERE survey_template_id = ?
          AND ? >= start_date
          AND ? <= end_date
        ORDER BY created_at DESC
        LIMIT 1
      `).get(String(formId), today, today);

      if (activeDistribution?.distribution_id) {
        db.prepare(`UPDATE survey_distribution SET response_count = response_count + 1 WHERE distribution_id = ?`).run(activeDistribution.distribution_id);
      }

      return submissionId;
    });

    const surveyId = insertSubmission(formRow.form_id, formRow.form_version_id, formRow.initiative_id, answers);

    // Keep goals that source their current value from survey questions up to date.
    // The response is already saved, so a failure here is reported but not fatal.
    const goalSyncWarning = runGoalSync(formRow.initiative_id, 'system:survey-submission', '/api/surveys POST (goal sync)');

    const saved = db.prepare('SELECT submission_id, submitted_at FROM submission WHERE submission_id = ?').get(surveyId);

    return NextResponse.json({
      success: true,
      surveyId,
      ...(goalSyncWarning ? { warning: goalSyncWarning } : {}),
      submittedAt: saved?.submitted_at || new Date().toISOString(),
      survey: {
        id: surveyId,
        templateId: Number(formRow.form_id),
        templateTitle: formRow.form_name || null,
        submittedAt: saved?.submitted_at || null,
      },
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

// GET - One page of survey responses (newest first), read from the submission tables.
// Query params: templateId, initiativeId, surveyId, limit (default 50, max 500), offset.
// Returns { surveys, total, limit, offset }.
export async function GET(request) {
  try {
    initializeDatabase();
    // Survey responses are restricted to staff who distribute surveys.
    const auth = requirePermission(request, db, 'surveys.distribute', { requireCsrf: false });
    if (auth.error) return auth.error;

    const params = parseSubmissionListParams(new URL(request.url).searchParams);
    if (!params.valid) {
      return NextResponse.json({ error: params.error }, { status: 400 });
    }

    const { surveys, total } = querySubmissions(db, params.value);
    return NextResponse.json({ surveys, total, limit: params.value.limit, offset: params.value.offset });
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

    const existing = db.prepare('SELECT submission_id, initiative_id FROM submission WHERE submission_id = ?').get(surveyId);
    if (!existing) {
      return NextResponse.json({ error: 'Response not found' }, { status: 404 });
    }

    // submission_value rows are removed with the submission (ON DELETE CASCADE).
    db.prepare('DELETE FROM submission WHERE submission_id = ?').run(surveyId);

    // Goals sourced from survey answers must stop counting the deleted response.
    const goalSyncWarning = runGoalSync(existing.initiative_id, auth.user?.email || 'system:survey-delete', '/api/surveys DELETE (goal sync)');

    return NextResponse.json({ success: true, surveyId, ...(goalSyncWarning ? { warning: goalSyncWarning } : {}) });
  } catch (error) {
    console.error('Error deleting survey:', error);
    return NextResponse.json(
      { error: 'Failed to delete survey', details: String(error?.message || error) },
      { status: 500 }
    );
  }
}
