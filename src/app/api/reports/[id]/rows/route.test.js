const state = vi.hoisted(() => ({ db: null }));

vi.mock('@/lib/container/service-container', async () => {
  const engine = await vi.importActual('@/lib/report-engine');
  return {
    getServiceContainer: () => ({ db: state.db, reportEngine: { processReportData: engine.processReportData } }),
  };
});

import { GET } from '@/app/api/reports/[id]/rows/route';
import { closeTestDb, createTestDb, insertInitiative } from '@/test/integration/api-test-harness';

// A survey with one "Grade" question and three dated responses.
function seed(db) {
  const initiativeId = insertInitiative(db, { initiative_name: 'Rows' });
  const formId = Number(db.prepare('INSERT INTO form (initiative_id, form_name) VALUES (?, ?)').run(initiativeId, 'Form').lastInsertRowid);
  const fieldId = Number(db.prepare("INSERT INTO field (field_key, field_label, field_type) VALUES ('grade', 'Grade', 'select')").run().lastInsertRowid);
  const versionId = Number(db.prepare("INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')").run(formId).lastInsertRowid);
  db.prepare('INSERT INTO form_questions (form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, 0)').run(formId, versionId, fieldId);
  const fqId = db.prepare('SELECT form_question_id FROM form_questions WHERE form_id = ?').get(formId).form_question_id;
  [['2026-01-15 10:00:00', '7th'], ['2026-02-10 10:00:00', '8th'], ['2026-03-20 10:00:00', '8th']].forEach(([at, grade]) => {
    const sid = db.prepare('INSERT INTO submission (initiative_id, form_id, submitted_at) VALUES (?, ?, ?)').run(initiativeId, formId, at).lastInsertRowid;
    db.prepare('INSERT INTO submission_value (submission_id, form_question_id, value_text) VALUES (?, ?, ?)').run(sid, fqId, grade);
  });
  return { initiativeId, fieldId };
}

function insertSnapshot(db, initiativeId, config, results = {}) {
  return Number(db.prepare('INSERT INTO reports (initiative_id, name, status, report_data) VALUES (?, ?, ?, ?)')
    .run(initiativeId, 'R', 'completed', JSON.stringify({ version: 2, config: { initiativeId, ...config }, results })).lastInsertRowid);
}

const get = (id) => GET(new Request(`http://localhost:3000/api/reports/${id}/rows`), { params: Promise.resolve({ id: String(id) }) });

describe('/api/reports/:id/rows GET', () => {
  beforeEach(() => { state.db = createTestDb(); });
  afterEach(() => { closeTestDb(state.db); state.db = null; });

  test('re-runs the saved selections, filter and date range against current responses', async () => {
    const { initiativeId, fieldId } = seed(state.db);
    const reportId = insertSnapshot(state.db, initiativeId, {
      questionSelections: [{ id: fieldId, filter: { scope: 'report', values: ['8th'] } }],
      dateRange: { startDate: '2026-02-01', endDate: null },
    }, { filteredTableData: [] });

    const body = await (await get(reportId)).json();
    expect(body.source).toBe('live');
    expect(body.total).toBe(2);
    expect(body.rows.map((r) => r.Grade)).toEqual(['8th', '8th']);
  });

  test('older reports without question selections return their stored rows', async () => {
    const { initiativeId } = seed(state.db);
    const reportId = insertSnapshot(state.db, initiativeId, {}, { filteredTableData: [{ id: 1, Score: 5 }] });
    const body = await (await get(reportId)).json();
    expect(body).toEqual({ rows: [{ id: 1, Score: 5 }], total: 1, source: 'snapshot' });
  });

  test('404 for a missing report, 400 for a bad id', async () => {
    expect((await get(999)).status).toBe(404);
    expect((await get('abc')).status).toBe(400);
  });
});
