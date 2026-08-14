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
      SELECT ff.form_field_id, f.field_id, f.field_label, f.field_type,
             ff.required, ff.help_text, f.scope, f.initiative_id,
             f.validation_rules AS field_rules, ff.validation_rules AS form_field_rules
      FROM form_field ff
      JOIN field f ON ff.field_id = f.field_id
      WHERE ff.form_id = ?
      ORDER BY ff.display_order
    `);
    const getOptions = db.prepare(`
      SELECT option_value, display_label FROM field_options WHERE field_id = ? ORDER BY display_order`);

    const questions = getQuestions.all(form.id).map(q => {
      const isOptionType = q.field_type === 'select' || q.field_type === 'multiselect' || q.field_type === 'choice';
      const isYesNo = q.field_type === 'yesno';
      const rawOptions = (isOptionType || isYesNo)
        ? getOptions.all(q.field_id).map(opt => opt.option_value)
        : undefined;
      return {
        id: q.field_id,
        text: {
          question: q.field_label,
          type: q.field_type,
          required: !!q.required,
          scope: q.scope,
          initiative_id: q.initiative_id,
          validation_rules: resolveRules(q.field_rules, q.form_field_rules),
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

    logAudit(db, {
      event: 'survey.updated',
      userEmail: auth.user.email,
      targetType: 'survey',
      targetId: String(templateId),
      payload: { title: body.title, status: body.status },
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
      event: 'survey.deleted',
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
