import { describe, it, expect } from 'vitest';
import { validateFieldValue, resolveValidationRules } from './field-validation.js';

const textField = { field_type: 'text' };
const numberField = { field_type: 'number' };
const dateField = { field_type: 'date' };
const selectField = { field_type: 'select', options: ['a', 'b', 'c'] };

describe('validateFieldValue — text', () => {
  it('returns null for valid text within maxLength', () => {
    expect(validateFieldValue('hello', textField, { maxLength: 10 })).toBeNull();
  });

  it('returns error mentioning "at most N" when text exceeds maxLength', () => {
    const result = validateFieldValue('hello world', textField, { maxLength: 5 });
    expect(result).toMatch(/at most 5/);
  });

  it('returns error mentioning "at least N" when text is shorter than minLength', () => {
    const result = validateFieldValue('hi', textField, { minLength: 5 });
    expect(result).toMatch(/at least 5/);
  });

  it('returns error mentioning "format" when text fails pattern', () => {
    const result = validateFieldValue('abc', textField, { pattern: '^\\d+$' });
    expect(result).toMatch(/format/);
  });

  it('returns null when text matches pattern', () => {
    expect(validateFieldValue('123', textField, { pattern: '^\\d+$' })).toBeNull();
  });
});

describe('validateFieldValue — number', () => {
  it('accepts numeric strings from browser number inputs', () => {
    expect(validateFieldValue('42.5', numberField, null)).toBeNull();
  });

  it('rejects non-numeric strings', () => {
    expect(validateFieldValue('not-a-number', numberField, null)).toMatch(/valid number/);
  });

  it('returns error mentioning "at least N" when number is below min', () => {
    const result = validateFieldValue(3, numberField, { min: 5 });
    expect(result).toMatch(/at least 5/);
  });

  it('returns error mentioning "at most N" when number exceeds max', () => {
    const result = validateFieldValue(15, numberField, { max: 10 });
    expect(result).toMatch(/at most 10/);
  });

  it('returns null for valid number in range', () => {
    expect(validateFieldValue(7, numberField, { min: 1, max: 10 })).toBeNull();
  });
});

describe('validateFieldValue — no rules', () => {
  it('returns null when rules is null', () => {
    expect(validateFieldValue('anything', textField, null)).toBeNull();
  });

  it('returns null when rules is empty object', () => {
    expect(validateFieldValue('anything', textField, {})).toBeNull();
  });
});

describe('validateFieldValue — date', () => {
  it('returns error mentioning "valid date" for invalid date string', () => {
    const result = validateFieldValue('not-a-date', dateField, null);
    expect(result).toMatch(/valid date/);
  });

  it('returns null for valid ISO date string', () => {
    expect(validateFieldValue('2024-06-15', dateField, null)).toBeNull();
  });
});

describe('validateFieldValue — select', () => {
  it('returns error mentioning "valid option" for invalid select value', () => {
    const result = validateFieldValue('z', selectField, null);
    expect(result).toMatch(/valid option/);
  });

  it('returns null for valid select value', () => {
    expect(validateFieldValue('a', selectField, null)).toBeNull();
  });
});

describe('resolveValidationRules', () => {
  it('merges base and override, with override winning on conflict', () => {
    const base = JSON.stringify({ minLength: 2, maxLength: 10 });
    const override = JSON.stringify({ maxLength: 20, pattern: '^\\w+$' });
    const result = resolveValidationRules(base, override);
    expect(result).toEqual({ minLength: 2, maxLength: 20, pattern: '^\\w+$' });
  });

  it('returns null when both are null/empty', () => {
    expect(resolveValidationRules(null, null)).toBeNull();
  });

  it('returns base rules when override is null', () => {
    const base = JSON.stringify({ minLength: 3 });
    expect(resolveValidationRules(base, null)).toEqual({ minLength: 3 });
  });

  it('returns override rules when base is null', () => {
    const override = JSON.stringify({ maxLength: 50 });
    expect(resolveValidationRules(null, override)).toEqual({ maxLength: 50 });
  });
});
