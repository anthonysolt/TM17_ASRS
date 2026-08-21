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

  if (!Array.isArray(body.questionSelections) || body.questionSelections.length === 0) {
    return { valid: false, error: 'Select at least one survey question for analysis' };
  }
  const questionIds = new Set();
  const questionSelections = [];
  for (const selection of body.questionSelections) {
    const id = asFiniteNumber(selection?.id);
    const method = selection?.method || 'delta_halves';
    if (id === null || id <= 0) {
      return { valid: false, error: 'Each selected question must have a valid id' };
    }
    if (questionIds.has(id)) {
      return { valid: false, error: 'A survey question cannot be selected more than once' };
    }
    if (!['delta_halves', 'linear_slope', 'most_popular', 'average', 'least_common'].includes(method)) {
      return { valid: false, error: 'Invalid question analysis method' };
    }
    questionIds.add(id);
    questionSelections.push({ id, method, thresholdPct: 2 });
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
  if (body.status !== undefined && !['generating', 'completed', 'failed', 'published', 'draft', 'archived'].includes(body.status)) {
    return { valid: false, error: 'status must be one of: generating, completed, failed, published, draft, archived' };
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
