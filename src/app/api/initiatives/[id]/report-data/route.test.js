const state = vi.hoisted(() => ({ db: null }));
const dbProxy = vi.hoisted(() => ({
  prepare: (...args) => state.db.prepare(...args),
  exec: (...args) => state.db.exec(...args),
}));
const queryTableDataMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: dbProxy,
  default: dbProxy,
  initializeDatabase: vi.fn(),
}));

vi.mock('@/lib/query-helpers', () => ({
  queryTableData: (...args) => queryTableDataMock(...args),
}));

import { GET } from '@/app/api/initiatives/[id]/report-data/route';
import { closeTestDb, createTestDb, insertInitiative } from '@/test/integration/api-test-harness';

describe('/api/initiatives/:id/report-data GET integration', () => {
  beforeEach(() => {
    state.db = createTestDb();
    queryTableDataMock.mockReset();
    queryTableDataMock.mockReturnValue([{ grade: '7th', score: 88 }]);
  });

  afterEach(() => {
    closeTestDb(state.db);
    state.db = null;
  });

  test('returns 404 when initiative does not exist', async () => {
    const res = await GET(new Request('http://localhost:3000/api/initiatives/99/report-data'), {
      params: Promise.resolve({ id: '99' }),
    });

    expect(res.status).toBe(404);
  });

  test('returns report payload for existing initiative with real submission data', async () => {
    const initiativeId = insertInitiative(state.db, {
      initiative_name: 'Student Success',
    });

    // Create a form, field, submission, and submission_value for real data
    const formId = state.db.prepare(
      'INSERT INTO form (initiative_id, form_name) VALUES (?, ?)'
    ).run(initiativeId, 'Survey Form').lastInsertRowid;

    const fieldId = state.db.prepare(
      "INSERT INTO field (field_key, field_label, field_type) VALUES ('grade', 'Grade', 'select')"
    ).run().lastInsertRowid;

    state.db.prepare(
      'INSERT INTO form_questions (form_id, field_id, display_order) VALUES (?, ?, 0)'
    ).run(formId, fieldId);
    const formQuestionId = state.db.prepare(
      'SELECT form_question_id FROM form_questions WHERE form_id = ? AND field_id = ?'
    ).get(formId, fieldId).form_question_id;

    const subId = state.db.prepare(
      'INSERT INTO submission (initiative_id, form_id) VALUES (?, ?)'
    ).run(initiativeId, formId).lastInsertRowid;

    state.db.prepare(
      'INSERT INTO submission_value (submission_id, form_question_id, value_text) VALUES (?, ?, ?)'
    ).run(subId, formQuestionId, '7th');

    const res = await GET(new Request(`http://localhost:3000/api/initiatives/${initiativeId}/report-data`), {
      params: Promise.resolve({ id: String(initiativeId) }),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.initiativeName).toBe('Student Success');
    expect(payload.summary.totalParticipants).toBe(1);
    expect(payload.chartData.Grade).toEqual([{ name: '7th', value: 1 }]);
    expect(payload.tableData).toEqual([{ grade: '7th', score: 88 }]);
  });

  test('returns empty summary when initiative has no submissions', async () => {
    const initiativeId = insertInitiative(state.db, {
      initiative_name: 'Empty Initiative',
    });

    const res = await GET(new Request(`http://localhost:3000/api/initiatives/${initiativeId}/report-data`), {
      params: Promise.resolve({ id: String(initiativeId) }),
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.summary.totalParticipants).toBe(0);
    expect(payload.summary.averageRating).toBe(0);
    expect(payload.chartData).toEqual({});
  });
});
