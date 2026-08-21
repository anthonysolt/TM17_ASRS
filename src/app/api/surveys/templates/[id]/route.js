/**
 * ═══════════════════════════════════════════════════════════════════════════
 * API ENDPOINT: GET /api/surveys/templates/[id]
 * ═══════════════════════════════════════════════════════════════════════════
 * Purpose: Fetch a specific survey template by its ID
 *
 * This endpoint is used when a user scans a template-linked QR code.
 * The survey page loads the template to display custom questions instead
 * of the default hardcoded survey form.
 *
 * URL Format: /api/surveys/templates/123456789
 * Method: GET
 *
 * Response:
 * {
 *   "id": "123456789",
 *   "title": "Student Experience Survey",
 *   "description": "Tell us about your experience",
 *   "questions": [
 *     { "id": 1, "text": "How satisfied are you?" },
 *     { "id": 2, "text": "What can we improve?" }
 *   ],
 *   "createdAt": "2024-01-15T10:30:00.000Z",
 *   "published": true
 * }
 *
 * Error Responses:
 * - 404: Template not found
 * - 500: Server error
 * ═══════════════════════════════════════════════════════════════════════════
 */

import db from '@/lib/db.js';
import { requirePermission } from '@/lib/auth/server-auth';
import { logAudit } from '@/lib/audit';

const UI_TO_DB_TYPE = {
  textarea: 'text', select: 'text', radio: 'text', choice: 'text',
  checkbox: 'multiselect', email: 'text', url: 'text',
};
const OPTION_TYPES = new Set(['select', 'radio', 'choice', 'checkbox', 'multiselect']);

function resolveRules(fieldRulesJson, formFieldRulesJson) {
  const base = fieldRulesJson ? JSON.parse(fieldRulesJson) : null;
  const override = formFieldRulesJson ? JSON.parse(formFieldRulesJson) : null;
  if (!base && !override) return undefined;
  return { ...base, ...override };
}

export async function GET(request, context) {
  try {
    // Access params using context.params (Next.js 15+ requirement)
    const params = await context.params;
    const templateId = params.id;

    if (!templateId) {
      return new Response(
        JSON.stringify({ error: "Template ID is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Query form by form_id (with initiative name)
    const form = db.prepare(`
      SELECT f.form_id AS id, f.form_name AS title, f.description, f.created_at,
             f.is_published AS published, f.initiative_id,
             i.initiative_name
      FROM form f
      LEFT JOIN initiative i ON i.initiative_id = f.initiative_id
      WHERE f.form_id = ?
    `).get(templateId);

    if (!form) {
      return new Response(
        JSON.stringify({
          error: "Template not found",
          message: `No survey template exists with ID: ${templateId}`
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Get questions
    const getQuestions = db.prepare(`
      SELECT fq.form_question_id, f.field_id, f.field_label, f.field_type,
             fq.required, fq.help_text, f.scope, f.initiative_id,
             f.validation_rules AS field_rules, fq.validation_rules AS form_question_rules
      FROM form_questions fq
      JOIN field f ON fq.field_id = f.field_id
      WHERE fq.form_id = ?
      ORDER BY fq.display_order
    `);
    const getOptions = db.prepare(`
      SELECT option_value, display_label FROM field_options WHERE field_id = ? ORDER BY display_order`);

    const questions = getQuestions.all(form.id).map(q => {
      const rules = resolveRules(q.field_rules, q.form_question_rules);
      const displayType = rules?.ui_type || q.field_type;
      const isOptionType = ['select', 'radio', 'checkbox', 'choice', 'multiselect'].includes(displayType);
      const isYesNo = displayType === 'yesno';
      const rawOptions = (isOptionType || isYesNo)
        ? getOptions.all(q.field_id).map(opt => opt.option_value)
        : undefined;
      return {
        id: q.field_id,
        text: {
          question: q.field_label,
          type: displayType,
          required: !!q.required,
          scope: q.scope,
          initiative_id: q.initiative_id,
          validation_rules: rules,
          ...(isOptionType && rawOptions ? { options: rawOptions } : {}),
          ...(isYesNo && rawOptions ? { subQuestions: rawOptions } : {}),
          ...(q.help_text ? { help_text: q.help_text } : {})
        }
      };
    });

    const template = {
      id: form.id,
      title: form.title,
      description: form.description,
      initiative_id: form.initiative_id,
      initiative_name: form.initiative_name || null,
      questions,
      createdAt: form.created_at,
      published: !!form.published
    };

    return new Response(
      JSON.stringify(template),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (err) {
    console.error('Error fetching survey template:', err);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: err.message || String(err)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

export async function PUT(request, context) {
  try {
    const auth = requirePermission(request, db, 'forms.create');
    if (auth.error) return auth.error;

    const params = await context.params;
    const templateId = Number(params.id);
    if (!templateId || Number.isNaN(templateId)) {
      return new Response(JSON.stringify({ error: 'Invalid template ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const existing = db.prepare('SELECT * FROM form WHERE form_id = ?').get(templateId);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Template not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json();
    const now = new Date().toISOString();

    if (body.questions !== undefined && !Array.isArray(body.questions)) {
      return new Response(JSON.stringify({ error: 'questions must be an array' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const questionUpdates = [];
    for (const question of body.questions || []) {
      const fieldId = Number(question.id);
      const label = String(question.question || '').trim();
      const uiType = String(question.type || 'text');
      const options = Array.isArray(question.options)
        ? question.options.map(option => String(option).trim()).filter(Boolean)
        : [];
      if (!Number.isInteger(fieldId) || fieldId <= 0 || !label) {
        return new Response(JSON.stringify({ error: 'Every question must have a valid id and question text' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      if (OPTION_TYPES.has(uiType) && options.length === 0) {
        return new Response(JSON.stringify({ error: `Question "${label}" must have at least one answer option` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const placement = db.prepare(`
        SELECT fq.form_question_id, f.validation_rules
        FROM form_questions fq
        JOIN field f ON f.field_id = fq.field_id
        WHERE fq.form_id = ? AND fq.field_id = ?
      `).get(templateId, fieldId);
      if (!placement) {
        return new Response(JSON.stringify({ error: 'One or more questions do not belong to this survey' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      questionUpdates.push({ ...question, fieldId, label, uiType, options, placement });
    }

    // Update basic fields
    if (body.title !== undefined) {
      db.prepare('UPDATE form SET form_name = ?, updated_at = ? WHERE form_id = ?').run(String(body.title).trim(), now, templateId);
    }
    if (body.description !== undefined) {
      db.prepare('UPDATE form SET description = ?, updated_at = ? WHERE form_id = ?').run(String(body.description).trim(), now, templateId);
    }
    if (body.published !== undefined) {
      db.prepare('UPDATE form SET is_published = ?, updated_at = ? WHERE form_id = ?').run(body.published ? 1 : 0, now, templateId);
    }
    if (body.status !== undefined) {
      // Map status to is_published: 'active' = published, 'draft'/'archived' = unpublished
      const isPublished = body.status === 'active' ? 1 : 0;
      db.prepare('UPDATE form SET is_published = ?, updated_at = ? WHERE form_id = ?').run(isPublished, now, templateId);
    }

    if (questionUpdates.length > 0) {
      db.transaction(() => {
        const updateField = db.prepare(
          'UPDATE field SET field_label = ?, field_type = ?, validation_rules = ? WHERE field_id = ?'
        );
        const updatePlacement = db.prepare(
          'UPDATE form_questions SET required = ? WHERE form_question_id = ?'
        );
        const deleteOptions = db.prepare('DELETE FROM field_options WHERE field_id = ?');
        const insertOption = db.prepare(`
          INSERT INTO field_options (field_id, option_value, display_label, display_order)
          VALUES (?, ?, ?, ?)
        `);

        questionUpdates.forEach(question => {
          let rules = {};
          try { rules = question.placement.validation_rules ? JSON.parse(question.placement.validation_rules) : {}; } catch { rules = {}; }
          const dbType = UI_TO_DB_TYPE[question.uiType] || question.uiType;
          if (dbType !== question.uiType) rules.ui_type = question.uiType;
          else delete rules.ui_type;
          updateField.run(
            question.label,
            dbType,
            Object.keys(rules).length ? JSON.stringify(rules) : null,
            question.fieldId
          );
          updatePlacement.run(question.required === false ? 0 : 1, question.placement.form_question_id);
          if (OPTION_TYPES.has(question.uiType)) {
            deleteOptions.run(question.fieldId);
            question.options.forEach((option, index) => insertOption.run(question.fieldId, option, option, index));
          }
        });
      })();
    }

    logAudit(db, {
      event: 'survey.updated',
      userEmail: auth.user.email,
      targetType: 'form',
      targetId: String(templateId),
      payload: { title: body.title, status: body.status, questions_updated: questionUpdates.length },
    });

    const updated = db.prepare('SELECT form_id AS id, form_name AS title, description, is_published AS published, updated_at FROM form WHERE form_id = ?').get(templateId);
    return new Response(JSON.stringify({ success: true, template: updated }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Error updating survey template:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function DELETE(request, context) {
  try {
    const auth = requirePermission(request, db, 'forms.create');
    if (auth.error) return auth.error;

    const params = context?.params || {};
    const templateId = Number(params.id);

    if (!templateId || Number.isNaN(templateId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid template ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get template name before deleting for audit log
    const existing = db.prepare('SELECT form_name FROM form WHERE form_id = ?').get(templateId);

    const deleteTx = db.transaction((id) => {
      const affectedSurveyIds = db.prepare('SELECT id, responses FROM surveys').all()
        .filter((survey) => {
          try {
            return Number(JSON.parse(survey.responses)?.templateId) === id;
          } catch {
            return false;
          }
        })
        .map((survey) => survey.id);

      if (affectedSurveyIds.length) {
        const deleteReport = db.prepare('DELETE FROM reports WHERE survey_id = ?');
        affectedSurveyIds.forEach((sid) => deleteReport.run(sid));
      }

      if (affectedSurveyIds.length) {
        const deleteSurvey = db.prepare('DELETE FROM surveys WHERE id = ?');
        affectedSurveyIds.forEach((surveyId) => deleteSurvey.run(surveyId));
      }
      db.prepare('DELETE FROM submission WHERE form_id = ?').run(id);
      db.prepare('DELETE FROM survey_distribution WHERE survey_template_id = ?').run(String(id));
      db.prepare('DELETE FROM form WHERE form_id = ?').run(id);
    });

    deleteTx(templateId);

    logAudit(db, {
      event: 'form.deleted',
      userEmail: auth.user.email,
      targetType: 'survey',
      targetId: String(templateId),
      payload: { title: existing?.form_name },
    });

    return new Response(
      JSON.stringify({ success: true, templateId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error deleting survey template:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to delete template', message: err.message || String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
