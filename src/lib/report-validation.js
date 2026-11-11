import { QUESTION_METHOD_VALUES, methodNeedsAnswer } from '@/lib/analysis-methods';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function asFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const MAX_FILTER_VALUES = 200;

function hasBound(value) {
  return value !== undefined && value !== null && value !== '';
}

/**
 * validateQuestionFilter — Normalizes a per-question filter to
 * { scope, values } or { scope, min?, max? }; empty filters become null.
 */
export function validateQuestionFilter(filter) {
  if (filter === undefined || filter === null) return { valid: true, value: null };
  if (!isPlainObject(filter)) return { valid: false, error: 'Question filter must be an object' };

  const scope = filter.scope ?? 'report';
  if (!['report', 'question'].includes(scope)) {
    return { valid: false, error: 'Question filter scope must be "report" or "question"' };
  }

  if (filter.values !== undefined) {
    if (!Array.isArray(filter.values) || filter.values.some((value) => typeof value !== 'string')) {
      return { valid: false, error: 'Question filter values must be an array of strings' };
    }
    if (filter.values.length > MAX_FILTER_VALUES) {
      return { valid: false, error: `Question filter cannot include more than ${MAX_FILTER_VALUES} values` };
    }
    const values = [...new Set(filter.values)];
    return { valid: true, value: values.length > 0 ? { scope, values } : null };
  }

  const range = { scope };
  for (const bound of ['min', 'max']) {
    if (!hasBound(filter[bound])) continue;
    const num = asFiniteNumber(filter[bound]);
    if (num === null) return { valid: false, error: `Question filter ${bound} must be a number` };
    range[bound] = num;
  }
  if (range.min !== undefined && range.max !== undefined && range.min > range.max) {
    return { valid: false, error: 'Question filter min cannot be greater than max' };
  }
  if (range.min === undefined && range.max === undefined) return { valid: true, value: null };
  return { valid: true, value: range };
}

export function validateReportQueryParams(searchParams) {
  const initiativeId = searchParams.get('initiativeId');
  let parsedInitiativeId = null;
  if (initiativeId !== null) {
    parsedInitiativeId = asFiniteNumber(initiativeId);
    if (parsedInitiativeId === null || parsedInitiativeId <= 0) {
      return { valid: false, error: 'initiativeId must be a positive number' };
    }
  }

  const startDate = searchParams.get('startDate') || null;
  const endDate = searchParams.get('endDate') || null;
  const isoDateRe = /^\d{4}-\d{2}-\d{2}/;
  if (startDate !== null && !isoDateRe.test(startDate)) {
    return { valid: false, error: 'startDate must be in YYYY-MM-DD format' };
  }
  if (endDate !== null && !isoDateRe.test(endDate)) {
    return { valid: false, error: 'endDate must be in YYYY-MM-DD format' };
  }

  return { valid: true, initiativeId: parsedInitiativeId, startDate, endDate };
}

export function validateReportCreatePayload(body) {
  if (!isPlainObject(body)) {
    return { valid: false, error: 'Request body must be an object' };
  }

  const initiativeId = asFiniteNumber(body.initiativeId ?? body.surveyId ?? body.initiative_id);
  if (initiativeId === null || initiativeId <= 0) {
    return { valid: false, error: 'initiativeId is required and must be a positive number' };
  }

  if (body.name !== undefined && typeof body.name !== 'string') {
    return { valid: false, error: 'name must be a string' };
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    return { valid: false, error: 'description must be a string' };
  }

  // Questions are optional when the report includes goals (checked below).
  const rawQuestionSelections = body.questionSelections ?? [];
  if (!Array.isArray(rawQuestionSelections)) {
    return { valid: false, error: 'questionSelections must be an array' };
  }
  const questionIds = new Set();
  const questionSelections = [];
  for (const selection of rawQuestionSelections) {
    const id = asFiniteNumber(selection?.id);
    const method = selection?.method || 'delta_halves';
    if (id === null || id <= 0) {
      return { valid: false, error: 'Each selected question must have a valid id' };
    }
    if (questionIds.has(id)) {
      return { valid: false, error: 'A survey question cannot be selected more than once' };
    }
    if (!QUESTION_METHOD_VALUES.includes(method)) {
      return { valid: false, error: 'Invalid question analysis method' };
    }
    let answer = null;
    if (methodNeedsAnswer(method)) {
      answer = typeof selection.answer === 'string' ? selection.answer.trim() : '';
      if (!answer) return { valid: false, error: 'Choose the target answer for each answer-based analysis method' };
      if (answer.length > 200) return { valid: false, error: 'Target answer cannot be longer than 200 characters' };
    }
    const filterValidation = validateQuestionFilter(selection.filter);
    if (!filterValidation.valid) {
      return { valid: false, error: filterValidation.error };
    }
    questionIds.add(id);
    questionSelections.push({ id, method, thresholdPct: 2, filter: filterValidation.value, ...(answer ? { answer } : {}) });
  }

  // Goals are optional; each id must belong to the initiative (checked in the route).
  const rawGoalIds = body.goalIds ?? [];
  if (!Array.isArray(rawGoalIds)) {
    return { valid: false, error: 'goalIds must be an array' };
  }
  const goalIds = [];
  for (const rawId of rawGoalIds) {
    const id = asFiniteNumber(rawId);
    if (id === null || id <= 0 || !Number.isInteger(id)) {
      return { valid: false, error: 'Each selected goal must have a valid id' };
    }
    if (goalIds.includes(id)) {
      return { valid: false, error: 'A goal cannot be selected more than once' };
    }
    goalIds.push(id);
  }

  const status = body.status ?? 'completed';
  if (!['completed', 'published', 'archived'].includes(status)) {
    return { valid: false, error: 'status must be one of: completed, published, archived' };
  }

  if (questionSelections.length === 0 && goalIds.length === 0) {
    return { valid: false, error: 'Select at least one survey question or goal for the report' };
  }

  // Optional response date range (inclusive, YYYY-MM-DD); empty means no limit.
  const dateOnlyRe = /^\d{4}-\d{2}-\d{2}$/;
  const startDate = body.startDate ? String(body.startDate) : null;
  const endDate = body.endDate ? String(body.endDate) : null;
  if (startDate && !dateOnlyRe.test(startDate)) {
    return { valid: false, error: 'startDate must be in YYYY-MM-DD format' };
  }
  if (endDate && !dateOnlyRe.test(endDate)) {
    return { valid: false, error: 'endDate must be in YYYY-MM-DD format' };
  }
  if (startDate && endDate && startDate > endDate) {
    return { valid: false, error: 'startDate cannot be after endDate' };
  }

  if (body.filters !== undefined && !isPlainObject(body.filters)) {
    return { valid: false, error: 'filters must be an object of key/value pairs' };
  }

  const expressions = body.expressions ?? [];
  if (!Array.isArray(expressions)) {
    return { valid: false, error: 'expressions must be an array' };
  }
  for (const expr of expressions) {
    if (!isPlainObject(expr)) {
      return { valid: false, error: 'each expression must be an object' };
    }
    if (!isNonEmptyString(expr.attribute)) {
      return { valid: false, error: 'expression.attribute is required' };
    }
    if (!isNonEmptyString(expr.operator)) {
      return { valid: false, error: 'expression.operator is required' };
    }
  }

  const sorts = body.sorts ?? [];
  if (!Array.isArray(sorts)) {
    return { valid: false, error: 'sorts must be an array' };
  }
  for (const sort of sorts) {
    if (!isPlainObject(sort)) {
      return { valid: false, error: 'each sort must be an object' };
    }
    if (!isNonEmptyString(sort.attribute)) {
      return { valid: false, error: 'sort.attribute is required' };
    }
    if (!['asc', 'desc'].includes(String(sort.direction || '').toLowerCase())) {
      return { valid: false, error: 'sort.direction must be "asc" or "desc"' };
    }
  }

  return {
    valid: true,
    value: {
      initiativeId,
      name: body.name || '',
      description: body.description || '',
      createdBy: body.createdBy || '',
      filters: body.filters || {},
      expressions,
      sorts,
      trendConfig: body.trendConfig,
      questionSelections,
      goalIds,
      status,
      startDate,
      endDate,
      includeAiInsights: body.includeAiInsights === true,
      clientMeta: isPlainObject(body.clientMeta) ? body.clientMeta : {},
    },
  };
}

export function validateReportUpdatePayload(body) {
  if (!isPlainObject(body)) return { valid: false, error: 'Request body must be an object' };
  const id = asFiniteNumber(body.id);
  if (id === null || id <= 0) return { valid: false, error: 'id is required and must be a positive number' };

  if (body.name !== undefined && typeof body.name !== 'string') {
    return { valid: false, error: 'name must be a string' };
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    return { valid: false, error: 'description must be a string' };
  }
  if (body.status !== undefined && !['completed', 'published', 'draft', 'archived'].includes(body.status)) {
    return { valid: false, error: 'status must be one of: completed, published, draft, archived' };
  }
  if (body.name === undefined && body.description === undefined && body.status === undefined) {
    return { valid: false, error: 'No fields to update' };
  }

  const hasNonStatusChanges = body.name !== undefined || body.description !== undefined;
  if (hasNonStatusChanges) {
    if (typeof body.reasonType !== 'string' || body.reasonType.trim() === '') {
      return { valid: false, error: 'reasonType is required and must be a non-empty string' };
    }
  }
  if (body.reasonText !== undefined && typeof body.reasonText !== 'string') {
    return { valid: false, error: 'reasonText must be a string if provided' };
  }

  return { valid: true, value: { id, name: body.name, description: body.description, status: body.status, reasonType: body.reasonType, reasonText: body.reasonText } };
}

export function validateReportDeleteParams(searchParams) {
  const id = asFiniteNumber(searchParams.get('id'));
  if (id === null || id <= 0) return { valid: false, error: 'id query param is required and must be a positive number' };
  return { valid: true, id };
}
