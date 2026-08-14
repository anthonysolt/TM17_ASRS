function safeParseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function toInitiativeDto(row) {
  if (!row) return null;

  const settings = safeParseJson(row.settings, {});

  return {
    id: Number(row.initiative_id),
    name: row.initiative_name || '',
    description: row.description || '',
    attributes: safeParseJson(row.attributes, []),
    questions: safeParseJson(row.questions, []),
    settings,
    status: settings.status || 'Active',
    category: row.category_name || settings.category || null,
    participant_count: row.participant_count != null ? Number(row.participant_count) : 0,
    submission_count: row.submission_count != null ? Number(row.submission_count) : 0,
    avg_score: row.avg_score != null ? Math.round(Number(row.avg_score) * 10) / 10 : 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export function toInitiativeCreateInput(body = {}) {
  return {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    attributes: Array.isArray(body.attributes) ? body.attributes : [],
    questions: Array.isArray(body.questions) ? body.questions : [],
    settings: body.settings && typeof body.settings === 'object' ? body.settings : {},
  };
}
