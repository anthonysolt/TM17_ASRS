import db from '../../../../lib/db.js';
import { requirePermission } from '@/lib/auth/server-auth';
import { logAudit } from '@/lib/audit';

// Map UI-only field types to valid DB types.
// DB CHECK constraint: field_type IN ('text','number','date','boolean','select','multiselect','rating','json','choice','yesno')
const UI_TO_DB_TYPE = {
  textarea: 'text',
  select: 'text',
  choice: 'text',
  checkbox: 'boolean',
  radio: 'text',
  email: 'text',
  url: 'text',
};

function resolveRules(fieldRulesJson, formFieldRulesJson) {
  const base = fieldRulesJson ? JSON.parse(fieldRulesJson) : null;
  const override = formFieldRulesJson ? JSON.parse(formFieldRulesJson) : null;
  if (!base && !override) return undefined;
  return { ...base, ...override };
}

export async function GET() {
  // Query all forms (survey templates)
  const forms = db.prepare(`
    SELECT form_id AS id, form_name AS title, description, created_at,
           is_published AS published, initiative_id
    FROM form
    WHERE is_published = 1
  `).all();

  // For each form, get questions
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

  const surveys = forms.map(form => {
    const questions = getQuestions.all(form.id).map(q => {
      const rules = resolveRules(q.field_rules, q.form_question_rules);
      const displayType = (rules && rules.ui_type) || q.field_type;
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
          ...(q.help_text ? { help_text: q.help_text } : {}),
        }
      };
    });
    return {
      id: form.id,
      title: form.title,
      description: form.description,
      initiative_id: form.initiative_id,
      questions,
      createdAt: form.created_at,
      published: !!form.published
    };
  });
  return new Response(JSON.stringify(surveys), { status: 200, headers: { "Content-Type": "application/json" } });
}

export async function POST(request) {
  try {
    const auth = requirePermission(request, db, 'forms.create');
    if (auth.error) return auth.error;

    const body = await request.json();
    const { title, description, questions, initiative_id } = body || {};
    const effectiveInitiativeId = initiative_id || 1;
    if (!title || !Array.isArray(questions)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const hasConflictingClassification = questions.some(q => {
      const question = typeof q === 'object' && q.text ? q.text : q;
      return question?.is_core_question && question?.is_initiative_specific;
    });
    if (hasConflictingClassification) {
      return new Response(JSON.stringify({ error: 'A question cannot be both a core question and an initiative question' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prepare all statements
    const now = new Date().toISOString();
    const insertForm = db.prepare(`
      INSERT INTO form (initiative_id, form_name, description, created_at, updated_at, updated_by_user_id, is_published)
      VALUES (?, ?, ?, ?, ?, NULL, 1)
    `);
    const insertField = db.prepare(`
      INSERT INTO field (field_key, field_label, field_type, scope, initiative_id, is_filterable,
                         is_required_default, is_core_question, is_initiative_specific, validation_rules)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
    `);
    const insertFormQuestion = db.prepare(`
      INSERT INTO form_questions (form_id, field_id, display_order, required, is_hidden, help_text, validation_rules)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `);
    const insertOption = db.prepare(`
      INSERT INTO field_options (field_id, option_value, display_label, display_order)
      VALUES (?, ?, ?, ?)
    `);

    // Use transaction to ensure atomicity
    const createSurvey = db.transaction(() => {
      // Insert new form (survey template)
      const result = insertForm.run(effectiveInitiativeId, title, description || '', now, now);
      const formId = result.lastInsertRowid;

      let displayOrder = 0;
      const questionObjs = [];

      // Insert questions
      for (const q of questions) {
        const textObj = typeof q === 'object' && q.text ? q.text : q;
        const fieldKey = `${title}_${displayOrder}_${Date.now()}`;
        const fieldLabel = textObj.question || '';
        const uiFieldType = textObj.type || 'text';
        // For checkbox with options, use multiselect instead of boolean
        let dbFieldType;
        if (uiFieldType === 'checkbox' && Array.isArray(textObj.options) && textObj.options.length > 0) {
          dbFieldType = 'multiselect';
        } else {
          dbFieldType = UI_TO_DB_TYPE[uiFieldType] || uiFieldType;
        }
        const required = textObj.required ? 1 : 0;
        const isCoreQuestion = textObj.is_core_question ? 1 : 0;
        const isInitiativeSpecific = textObj.is_initiative_specific ? 1 : 0;
        if (isCoreQuestion && isInitiativeSpecific) {
          throw new Error('A question cannot be both a core question and an initiative question');
        }
        const scope = isCoreQuestion ? 'common' : (isInitiativeSpecific ? 'initiative_specific' : (textObj.scope || 'common'));
        const fieldInitiativeId = isInitiativeSpecific || scope === 'initiative_specific' ? effectiveInitiativeId : null;

        // Merge ui_type into validation_rules so the renderer knows the original display type
        const baseRules = textObj.validation_rules || {};
        if (uiFieldType !== dbFieldType) {
          baseRules.ui_type = uiFieldType;
        }
        const rulesJson = Object.keys(baseRules).length > 0 ? JSON.stringify(baseRules) : null;
        const formFieldRulesJson = textObj.form_validation_rules ? JSON.stringify(textObj.form_validation_rules) : null;

        let fieldId;
        // Only look up existing fields by numeric ID; synthetic IDs (strings) are always new
        if (textObj.field_id && typeof textObj.field_id === 'number') {
          const existingField = db.prepare('SELECT field_id FROM field WHERE field_id = ?').get(textObj.field_id);
          if (existingField) fieldId = existingField.field_id;
        }
        if (!fieldId) {
          // Insert field with the DB-safe type
          const fieldResult = insertField.run(
            fieldKey, fieldLabel, dbFieldType, scope, fieldInitiativeId,
            isCoreQuestion, isInitiativeSpecific, rulesJson
          );
          fieldId = fieldResult.lastInsertRowid;

          // Options remain attached even when the answer value is stored as text.
          if (['select', 'radio', 'choice', 'checkbox', 'multiselect'].includes(uiFieldType) && Array.isArray(textObj.options)) {
            textObj.options.forEach((opt, idx) => {
              insertOption.run(fieldId, opt, opt, idx);
            });
          }

          // Insert sub-questions for yesno type (stored as field_options)
          if (dbFieldType === 'yesno' && Array.isArray(textObj.subQuestions)) {
            textObj.subQuestions.forEach((sub, idx) => {
              insertOption.run(fieldId, sub, sub, idx);
            });
          }
        }

        // Link the canonical question to this form without duplicating it.
        insertFormQuestion.run(formId, fieldId, displayOrder, required, null, formFieldRulesJson);

        questionObjs.push({
          id: fieldId,
          text: {
            question: fieldLabel,
            type: uiFieldType,
            required: !!required,
            ...(['select', 'radio', 'choice', 'checkbox', 'multiselect'].includes(uiFieldType) && textObj.options ? { options: textObj.options } : {}),
            ...(dbFieldType === 'yesno' && textObj.subQuestions ? { subQuestions: textObj.subQuestions } : {}),
            is_core_question: !!isCoreQuestion,
            is_initiative_specific: !!isInitiativeSpecific
          }
        });
        displayOrder++;
      }

      return {
        id: formId,
        title,
        description: description || '',
        initiative_id: effectiveInitiativeId,
        questions: questionObjs,
        createdAt: now,
        published: true
      };
    });

    // Execute the transaction
    const newSurvey = createSurvey();

    logAudit(db, {
      event: 'form.created',
      userEmail: auth.user.email,
      targetType: 'form',
      targetId: String(newSurvey.id),
      payload: { title, questionCount: questions.length },
    });

    return new Response(JSON.stringify(newSurvey), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error('[surveys/templates POST] Error:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function DELETE(request) {
  try {
    const auth = requirePermission(request, db, 'forms.create');
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const templateId = Number(url.searchParams.get('templateId'));

    if (!templateId || Number.isNaN(templateId)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid templateId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get template name before deleting for audit log
    const existing = db.prepare('SELECT form_name FROM form WHERE form_id = ?').get(templateId);

    const tableExists = (tableName) => {
      try {
        return !!db.prepare(
          'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?'
        ).get(tableName);
      } catch {
        // The integration harness uses SQLite while production uses PostgreSQL.
        return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
      }
    };

    const deleteTx = db.transaction((id) => {
      const quoteSurveyIds = tableExists('surveys')
        ? db.prepare('SELECT id, responses FROM surveys').all()
            .filter((survey) => {
              try {
                return Number(JSON.parse(survey.responses)?.templateId) === Number(id);
              } catch {
                return false;
              }
            })
            .map((survey) => survey.id)
        : [];

      if (quoteSurveyIds.length && tableExists('reports')) {
        const deleteReport = db.prepare('DELETE FROM reports WHERE survey_id = ?');
        quoteSurveyIds.forEach((sid) => deleteReport.run(sid));
      }

      if (tableExists('surveys')) {
        const deleteSurvey = db.prepare('DELETE FROM surveys WHERE id = ?');
        quoteSurveyIds.forEach((surveyId) => deleteSurvey.run(surveyId));
      }

      if (tableExists('survey_distribution')) {
        db.prepare('DELETE FROM survey_distribution WHERE survey_template_id = ?').run(String(id));
      }

      if (tableExists('submission')) {
        // submission_value rows cascade from submission; form_questions can
        // then cascade safely when the form is removed.
        db.prepare('DELETE FROM submission WHERE form_id = ?').run(id);
      }

      if (tableExists('form')) {
        db.prepare('DELETE FROM form WHERE form_id = ?').run(id);
      }
    });

    deleteTx(templateId);

    logAudit(db, {
      event: 'form.deleted',
      userEmail: auth.user.email,
      targetType: 'form',
      targetId: String(templateId),
      payload: { title: existing?.form_name },
    });

    return new Response(
      JSON.stringify({ success: true, templateId }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[surveys/templates DELETE] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to delete template', message: err.message || String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
