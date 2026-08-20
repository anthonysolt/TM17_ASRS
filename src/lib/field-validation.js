/**
 * Validate a single field value against its type and optional rules.
 * @param {*} value - The submitted value
 * @param {{ field_type: string, options?: string[] }} field - Field metadata
 * @param {object|null} rules - Validation rules JSON: { minLength, maxLength, pattern, min, max }
 * @returns {string|null} Error message or null if valid
 */
export function validateFieldValue(value, field, rules) {
  if (!rules || typeof rules !== 'object') {
    return validateType(value, field);
  }
  const typeError = validateType(value, field);
  if (typeError) return typeError;
  const { field_type } = field;
  if (field_type === 'text' || field_type === 'yesno') {
    const str = typeof value === 'string' ? value : String(value ?? '');
    if (rules.minLength != null && str.length < rules.minLength) {
      return `Must be at least ${rules.minLength} characters`;
    }
    if (rules.maxLength != null && str.length > rules.maxLength) {
      return `Must be at most ${rules.maxLength} characters`;
    }
    if (rules.pattern) {
      // Handle named patterns (e.g. "email", "phone") vs raw regex
      const NAMED_PATTERNS = {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        phone: /^[\d\s\-\+\(\)\.]{7,20}$/,
        url: /^https?:\/\/.+/i,
      };
      const namedRe = NAMED_PATTERNS[rules.pattern.toLowerCase()];
      if (namedRe) {
        if (!namedRe.test(str)) {
          return 'Does not match required format';
        }
      } else {
        try {
          if (!new RegExp(rules.pattern).test(str)) {
            return 'Does not match required format';
          }
        } catch { /* skip invalid regex */ }
      }
    }
  }
  if (field_type === 'number' || field_type === 'rating') {
    const num = typeof value === 'number' ? value : Number(value);
    if (rules.min != null && num < rules.min) {
      return `Must be at least ${rules.min}`;
    }
    if (rules.max != null && num > rules.max) {
      return `Must be at most ${rules.max}`;
    }
  }
  return null;
}

function validateType(value, field) {
  const { field_type } = field;
  if (field_type === 'number' || field_type === 'rating') {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return 'Please enter a valid number';
  }
  if (field_type === 'date') {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (isNaN(d.getTime())) return 'Please enter a valid date';
      return null;
    }
    return 'Please enter a valid date';
  }
  if ((field_type === 'select' || field_type === 'choice') && Array.isArray(field.options)) {
    if (!field.options.includes(value)) {
      return 'Please select a valid option';
    }
  }
  if (field_type === 'multiselect' && Array.isArray(field.options)) {
    if (!Array.isArray(value) || !value.every(v => field.options.includes(v))) {
      return 'Please select valid options';
    }
  }
  return null;
}

export function resolveValidationRules(fieldRulesJson, formFieldRulesJson) {
  const base = safeParseJson(fieldRulesJson);
  const override = safeParseJson(formFieldRulesJson);
  if (!base && !override) return null;
  return { ...base, ...override };
}

function safeParseJson(val) {
  if (!val) return null;
  try { return JSON.parse(val); } catch { return null; }
}
