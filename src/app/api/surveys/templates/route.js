import db from '../../../../lib/db.js';
import { requirePermission } from '@/lib/auth/server-auth';
import { logAudit } from '@/lib/audit';
import { attributeTypeAcceptsField } from '@/lib/initiative-attributes';
import { deleteSurveyTemplateData } from '@/lib/delete-survey-template';

// Map UI-only field types to valid DB types.
// DB CHECK constraint: field_type IN ('text','number','date','boolean','select','multiselect','rating','json','choice','yesno')
const UI_TO_DB_TYPE = {
  textarea: 'text',
  select: 'text',
  checkbox: 'boolean',
  radio: 'text',
  choice: 'text',
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
    SELECT ff.form_field_id, f.field_id, f.attribute_id, ia.name AS attribute_name,
           ia.data_type AS attribute_data_type, f.field_label, f.field_type,
           ff.required, ff.help_text, f.scope, f.initiative_id,
           f.validation_rules AS field_rules, ff.validation_rules AS form_field_rules
    FROM form_field ff
    JOIN field f ON ff.field_id = f.field_id
    LEFT JOIN initiative_attribute ia ON ia.attribute_id = f.attribute_id
    WHERE ff.form_id = ?
    ORDER BY ff.display_order
  `);
  const getOptions = db.prepare(`
    SELECT option_value, display_label FROM field_options WHERE field_id = ? ORDER BY display_order`);

  const surveys = forms.map(form => {
    const questions = getQuestions.all(form.id).map(q => {
      const rules = resolveRules(q.field_rules, q.form_field_rules);
      const displayType = (rules && rules.ui_type) || q.field_type;
      const isOptionType = ['select', 'radio', 'checkbox', 'multiselect', 'choice'].includes(displayType);
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
          attribute_id: q.attribute_id,
          attribute_name: q.attribute_name,
          attribute_data_type: q.attribute_data_type,
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

    const initiativeAttributes = db.prepare(`
      SELECT attribute_id, name, data_type FROM initiative_attribute WHERE initiative_id = ?
    `).all(effectiveInitiativeId);
    const attributesById = new Map(initiativeAttributes.map(attribute => [Number(attribute.attribute_id), attribute]));
    for (const question of questions) {
      const textObj = typeof question === 'object' && question.text ? question.text : question;
      if (textObj.attribute_id == null || textObj.attribute_id === '') continue;
      const attribute = attributesById.get(Number(textObj.attribute_id));
      if (!attribute) {
        return Response.json({ error: 'Each selected attribute must belong to the survey initiative' }, { status: 400 });
      }
      const questionType = textObj.type === 'checkbox' && Array.isArray(textObj.options) && textObj.options.length > 0
        ? 'multiselect'
        : (textObj.type || 'text');
      if (!attributeTypeAcceptsField(attribute.data_type, questionType)) {
        return Response.json({
          error: `Attribute "${attribute.name}" (${attribute.data_type}) is incompatible with question type "${textObj.type || 'text'}"`,
        }, { status: 400 });
      }
    }

    // Prepare all statements
    const now = new Date().toISOString();
    const insertForm = db.prepare(`
      INSERT INTO form (initiative_id, form_name, description, created_at, updated_at, updated_by_user_id, is_published)
      VALUES (?, ?, ?, ?, ?, NULL, 1)
    `);
    const insertField = db.prepare(`
      INSERT INTO field (field_key, field_label, field_type, scope, initiative_id, attribute_id, is_filterable, is_required_default, is_reusable, validation_rules)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `);
    const insertFormField = db.prepare(`
      INSERT INTO form_field (form_id, field_id, display_order, required, is_hidden, help_text, validation_rules)
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
        const helpText = null;
        const scope = textObj.scope || 'common';
        const fieldInitiativeId = scope === 'initiative_specific' ? effectiveInitiativeId : null;
        const attributeId = textObj.attribute_id ? Number(textObj.attribute_id) : null;

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
          const existingField = db.prepare('SELECT field_id, attribute_id FROM field WHERE field_id = ?').get(textObj.field_id);
          if (existingField && Number(existingField.attribute_id || 0) === Number(attributeId || 0)) {
            fieldId = existingField.field_id;
          }
        }
        if (!fieldId) {
          // Insert field with the DB-safe type
          const fieldResult = insertField.run(
            fieldKey,
            fieldLabel,
            dbFieldType,
            scope,
            fieldInitiativeId,
            attributeId,
            textObj.save_for_reuse === false ? 0 : 1,
            rulesJson
          );
          fieldId = fieldResult.lastInsertRowid;

          // Answer choices are stored independently from the scalar return type.
          if (['select', 'radio', 'checkbox', 'multiselect', 'choice'].includes(uiFieldType) && Array.isArray(textObj.options)) {
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

        // Insert form_field
        insertFormField.run(formId, fieldId, displayOrder, required, helpText, formFieldRulesJson);

        questionObjs.push({
          id: fieldId,
          text: {
            question: fieldLabel,
            type: uiFieldType,
            required: !!required,
            attribute_id: attributeId,
            ...(['select', 'radio', 'checkbox', 'multiselect', 'choice'].includes(uiFieldType) && textObj.options ? { options: textObj.options } : {}),
            ...(dbFieldType === 'yesno' && textObj.subQuestions ? { subQuestions: textObj.subQuestions } : {}),
            ...(helpText ? { help_text: helpText } : {})
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
      event: 'survey.created',
      userEmail: auth.user.email,
      targetType: 'survey',
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

    const deleted = deleteSurveyTemplateData(db, templateId);

    logAudit(db, {
      event: 'survey.deleted',
      userEmail: auth.user.email,
      targetType: 'survey',
      targetId: String(templateId),
      payload: { title: existing?.form_name },
    });

    return new Response(
      JSON.stringify({ success: true, templateId, deleted }),
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
