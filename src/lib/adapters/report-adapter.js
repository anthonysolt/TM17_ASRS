function safeParseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureStringifiedJson(value, fallback = '{}') {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

/**
 * A report as listed (GET /api/reports): its details without the saved snapshot.
 * Lists stay small however many reports or responses there are; the snapshot
 * is loaded with GET /api/reports/[id] when a report is viewed or downloaded.
 */
export function toReportListItemDto(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    initiative_id: row.initiative_id == null ? null : Number(row.initiative_id),
    initiative_name: row.initiative_name || null,
    name: row.name || '',
    description: row.description || '',
    status: row.status || 'completed',
    created_by: row.created_by || '',
    display_order: Number(row.display_order || 0),
    created_at: row.created_at || null,
    published_at: row.published_at || null,
  };
}

export function toReportCreateInput(body = {}) {
  return {
    initiativeId: Number(body.initiativeId),
    name: typeof body.name === 'string' ? body.name : '',
    description: typeof body.description === 'string' ? body.description : '',
    createdBy: typeof body.createdBy === 'string' ? body.createdBy : '',
    filters: body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)
      ? body.filters
      : {},
    expressions: Array.isArray(body.expressions) ? body.expressions : [],
    sorts: Array.isArray(body.sorts) ? body.sorts : [],
    trendConfig: body.trendConfig,
  };
}

/** One report with its saved snapshot (GET /api/reports/[id], PUT responses). */
export function toReportDetailDto(row) {
  if (!row) return null;

  return {
    ...toReportListItemDto(row),
    report_data: ensureStringifiedJson(row.report_data, '{}'),
    report_snapshot: safeParseJson(row.report_data, null),
  };
}
