import { validateFieldValue, resolveValidationRules } from './field-validation';

// Lightweight survey payload validation and sanitization
function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeValue(v, depth = 0) {
  const MAX_DEPTH = 3;
  const MAX_STRING = 1000;
  if (depth > MAX_DEPTH) return null;
  if (v === null) return null;
  if (typeof v === 'string') return v.trim().slice(0, MAX_STRING);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) {
    return v.slice(0, 100).map((it) => sanitizeValue(it, depth + 1));
  }
  if (isPlainObject(v)) {
    const out = {};
    const keys = Object.keys(v).slice(0, 500);
    for (const k of keys) {
      const keyName = String(k).slice(0, 100);
      out[keyName] = sanitizeValue(v[k], depth + 1);
    }
    return out;
  }
  return String(v).slice(0, MAX_STRING);
}

// Responses are anonymous and identified by their submission id, so any
// `name` / `email` sent by older clients is ignored.
export function validateAndCleanSurvey(body) {
  if (!isPlainObject(body)) throw new Error('Invalid payload');

  const responses = body.responses;
  if (!isPlainObject(responses)) throw new Error('Missing or invalid `responses` object');

  const cleanedResponses = {};
  const keys = Object.keys(responses).slice(0, 500);
  for (const k of keys) {
    const keyName = String(k).slice(0, 100);
    cleanedResponses[keyName] = sanitizeValue(responses[k]);
  }

  const cleaned = {
    responses: cleanedResponses,
  };

  if (body.templateId) cleaned.templateId = String(body.templateId).slice(0, 100);

  return cleaned;
}

/**
 * Validate template answers against field definitions.
 * @param {object} answers - { [field_id]: value }
 * @param {Array} fields - Array of { field_id, field_type, required, field_rules, form_field_rules }
 * @returns {Array<{ field_id: number, error: string }>}
 */
export function validateTemplateAnswers(answers, fields) {
  const errors = [];
  for (const field of fields) {
    const value = answers[field.field_id];
    const isEmpty = value === undefined || value === null || (typeof value === 'string' && value === '');
    if (field.required && isEmpty) {
      errors.push({ field_id: field.field_id, error: 'This field is required' });
      continue;
    }
    if (isEmpty) continue;
    const rules = resolveValidationRules(field.field_rules, field.form_field_rules);
    const error = validateFieldValue(value, field, rules);
    if (error) {
      errors.push({ field_id: field.field_id, error });
    }
  }
  return errors;
}

export default { validateAndCleanSurvey, validateTemplateAnswers };
