import db from '../../../../lib/db.js';
import { requirePermission } from '@/lib/auth/server-auth';
import { logAudit } from '@/lib/audit';

const VALID_TYPES = ['text', 'number', 'date', 'boolean', 'select', 'multiselect', 'rating', 'json', 'yesno'];
const VALID_SCOPES = ['common', 'initiative_specific', 'staff_only'];

export async function GET(request) {
  try {
    const auth = requirePermission(request, db, 'forms.create');
    if (auth.error) return auth.error;

    const fields = db.prepare(`
      SELECT f.field_id, f.field_key, f.field_label, f.field_type, f.scope,
             f.initiative_id, f.is_filterable, f.is_required_default,
             f.is_core_question, f.is_initiative_specific, f.validation_rules,
             i.initiative_name
      FROM field f
      LEFT JOIN initiative i ON f.initiative_id = i.initiative_id
      ORDER BY f.scope, f.field_id
    `).all();

    const getOptions = db.prepare(`
      SELECT option_value, display_label, display_order
      FROM field_options
      WHERE field_id = ?
      ORDER BY display_order
    `);

    const enriched = fields.map(field => {
      const options = getOptions.all(field.field_id);
      return {
        ...field,
        validation_rules: field.validation_rules ? (() => { try { return JSON.parse(field.validation_rules); } catch { return field.validation_rules; } })() : null,
        field_options: options,
        options: options.map(option => option.option_value),
      };
    });

    const grouped = {
      common: enriched.filter(f => f.scope === 'common'),
      initiative_specific: enriched.filter(f => f.scope === 'initiative_specific'),
      staff_only: enriched.filter(f => f.scope === 'staff_only'),
    };

    return new Response(JSON.stringify(grouped), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/fields GET] Error:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(request) {
  try {
    const auth = requirePermission(request, db, 'users.manage');
    if (auth.error) return auth.error;

    const body = await request.json();
    const { field_key, field_label, field_type, scope, initiative_id, options, validation_rules, is_filterable,
      is_core_question, is_initiative_specific } = body || {};

    if (is_core_question && is_initiative_specific) {
      return new Response(JSON.stringify({ error: 'A question cannot be both a core question and an initiative question' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (is_initiative_specific && !initiative_id) {
      return new Response(JSON.stringify({ error: 'initiative_id is required for an initiative question' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!field_key || !field_label || !field_type || !scope) {
      return new Response(JSON.stringify({ error: 'Missing required fields: field_key, field_label, field_type, scope' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!VALID_TYPES.includes(field_type)) {
      return new Response(JSON.stringify({ error: `Invalid field_type. Must be one of: ${VALID_TYPES.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!VALID_SCOPES.includes(scope)) {
      return new Response(JSON.stringify({ error: `Invalid scope. Must be one of: ${VALID_SCOPES.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (scope === 'initiative_specific' && !initiative_id) {
      return new Response(JSON.stringify({ error: 'initiative_id is required when scope is initiative_specific' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = db.prepare('SELECT field_id FROM field WHERE field_key = ?').get(field_key);
    if (existing) {
      return new Response(JSON.stringify({ error: `Field with key '${field_key}' already exists` }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validationRulesStr = validation_rules ? JSON.stringify(validation_rules) : null;

    const createField = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO field (field_key, field_label, field_type, scope, initiative_id, is_filterable,
                           is_core_question, is_initiative_specific, validation_rules)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        field_key,
        field_label,
        field_type,
        scope,
        initiative_id ?? null,
        is_filterable ? 1 : 0,
        is_core_question ? 1 : 0,
        is_initiative_specific ? 1 : 0,
        validationRulesStr,
      );

      const fieldId = Number(result.lastInsertRowid);

      if (Array.isArray(options) && options.length > 0) {
        const insertOption = db.prepare(`
          INSERT INTO field_options (field_id, option_value, display_label, display_order)
          VALUES (?, ?, ?, ?)
        `);
        options.forEach((opt, idx) => {
          insertOption.run(fieldId, opt.value, opt.label ?? opt.value, idx);
        });
      }

      return fieldId;
    });

    const fieldId = createField();

    const created = db.prepare(`
      SELECT f.*, i.initiative_name
      FROM field f
      LEFT JOIN initiative i ON f.initiative_id = i.initiative_id
      WHERE f.field_id = ?
    `).get(fieldId);

    const createdOptions = db.prepare('SELECT * FROM field_options WHERE field_id = ? ORDER BY display_order').all(fieldId);

    const response = {
      ...created,
      validation_rules: created.validation_rules ? (() => { try { return JSON.parse(created.validation_rules); } catch { return created.validation_rules; } })() : null,
      field_options: createdOptions,
    };

    logAudit(db, {
      event: 'field.created',
      userEmail: auth.user?.email,
      targetType: 'field',
      targetId: String(fieldId),
      payload: { field_key, field_label, field_type, scope },
    });

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/fields POST] Error:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PUT(request) {
  try {
    const auth = requirePermission(request, db, 'users.manage');
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const fieldId = Number(url.searchParams.get('fieldId'));

    if (!fieldId || Number.isNaN(fieldId)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid fieldId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = db.prepare('SELECT * FROM field WHERE field_id = ?').get(fieldId);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Field not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { field_label, field_type, scope, initiative_id, is_filterable, validation_rules, options,
      is_core_question, is_initiative_specific } = body || {};

    const effectiveCore = is_core_question === undefined ? existing.is_core_question : (is_core_question ? 1 : 0);
    const effectiveInitiativeQuestion = is_initiative_specific === undefined
      ? existing.is_initiative_specific
      : (is_initiative_specific ? 1 : 0);
    if (effectiveCore && effectiveInitiativeQuestion) {
      return new Response(JSON.stringify({ error: 'A question cannot be both a core question and an initiative question' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const effectiveInitiativeId = initiative_id === undefined ? existing.initiative_id : initiative_id;
    if (effectiveInitiativeQuestion && !effectiveInitiativeId) {
      return new Response(JSON.stringify({ error: 'initiative_id is required for an initiative question' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (field_type && !VALID_TYPES.includes(field_type)) {
      return new Response(JSON.stringify({ error: `Invalid field_type. Must be one of: ${VALID_TYPES.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (scope && !VALID_SCOPES.includes(scope)) {
      return new Response(JSON.stringify({ error: `Invalid scope. Must be one of: ${VALID_SCOPES.join(', ')}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const effectiveScope = scope ?? existing.scope;
    if (effectiveScope === 'initiative_specific' && initiative_id === null) {
      return new Response(JSON.stringify({ error: 'initiative_id is required when scope is initiative_specific' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updates = {};
    if (field_label !== undefined) updates.field_label = field_label;
    if (field_type !== undefined) updates.field_type = field_type;
    if (scope !== undefined) updates.scope = scope;
    if (initiative_id !== undefined) updates.initiative_id = initiative_id;
    if (is_filterable !== undefined) updates.is_filterable = is_filterable ? 1 : 0;
    if (is_core_question !== undefined) updates.is_core_question = is_core_question ? 1 : 0;
    if (is_initiative_specific !== undefined) updates.is_initiative_specific = is_initiative_specific ? 1 : 0;
    if (validation_rules !== undefined) updates.validation_rules = JSON.stringify(validation_rules);

    const updateField = db.transaction(() => {
      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(updates), fieldId];
        db.prepare(`UPDATE field SET ${setClauses} WHERE field_id = ?`).run(...values);
      }

      if (Array.isArray(options)) {
        db.prepare('DELETE FROM field_options WHERE field_id = ?').run(fieldId);
        const insertOption = db.prepare(`
          INSERT INTO field_options (field_id, option_value, display_label, display_order)
          VALUES (?, ?, ?, ?)
        `);
        options.forEach((opt, idx) => {
          insertOption.run(fieldId, opt.value, opt.label ?? opt.value, idx);
        });
      }
    });

    updateField();

    const updated = db.prepare(`
      SELECT f.*, i.initiative_name
      FROM field f
      LEFT JOIN initiative i ON f.initiative_id = i.initiative_id
      WHERE f.field_id = ?
    `).get(fieldId);

    const updatedOptions = db.prepare('SELECT * FROM field_options WHERE field_id = ? ORDER BY display_order').all(fieldId);

    const response = {
      ...updated,
      validation_rules: updated.validation_rules ? (() => { try { return JSON.parse(updated.validation_rules); } catch { return updated.validation_rules; } })() : null,
      field_options: updatedOptions,
    };

    logAudit(db, {
      event: 'field.updated',
      userEmail: auth.user?.email,
      targetType: 'field',
      targetId: String(fieldId),
      payload: { updates: Object.keys(updates) },
    });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/fields PUT] Error:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PATCH(request) {
  try {
    const auth = requirePermission(request, db, 'forms.create');
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const fieldId = Number(url.searchParams.get('fieldId'));
    if (!Number.isInteger(fieldId) || fieldId <= 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid fieldId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = db.prepare(
      'SELECT field_id, field_label FROM field WHERE field_id = ?'
    ).get(fieldId);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Field not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    db.prepare(`
      UPDATE field
      SET is_core_question = 0, is_initiative_specific = 0
      WHERE field_id = ?
    `).run(fieldId);

    logAudit(db, {
      event: 'field.classification_removed',
      userEmail: auth.user?.email,
      targetType: 'field',
      targetId: String(fieldId),
      payload: { field_label: existing.field_label },
    });

    return new Response(JSON.stringify({ success: true, fieldId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/fields PATCH] Error:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(request) {
  try {
    const auth = requirePermission(request, db, 'users.manage');
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const fieldId = Number(url.searchParams.get('fieldId'));

    if (!fieldId || Number.isNaN(fieldId)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid fieldId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = db.prepare('SELECT * FROM field WHERE field_id = ?').get(fieldId);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Field not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const usageCount = db.prepare('SELECT COUNT(*) AS c FROM form_questions WHERE field_id = ?').get(fieldId).c;
    if (usageCount > 0) {
      return new Response(JSON.stringify({ error: 'Field is in use', usageCount }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    db.prepare('DELETE FROM field WHERE field_id = ?').run(fieldId);

    logAudit(db, {
      event: 'field.deleted',
      userEmail: auth.user?.email,
      targetType: 'field',
      targetId: String(fieldId),
      payload: { field_key: existing.field_key, field_label: existing.field_label },
    });

    return new Response(JSON.stringify({ success: true, fieldId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[admin/fields DELETE] Error:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
