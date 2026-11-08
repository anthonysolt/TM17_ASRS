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

vi.mock('@/lib/query-helpers', async (importOriginal) => ({
  ...(await importOriginal()),
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

    const versionId = state.db.prepare(
      "INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')"
    ).run(formId).lastInsertRowid;
    state.db.prepare(
      'INSERT INTO form_questions (form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, 0)'
    ).run(formId, versionId, fieldId);
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

  describe('response date range', () => {
    // One "Grade" question with answers on three dates.
    function seedDatedAnswers() {
      const initiativeId = insertInitiative(state.db, { initiative_name: 'Dated' });
      const formId = state.db.prepare('INSERT INTO form (initiative_id, form_name) VALUES (?, ?)').run(initiativeId, 'Form').lastInsertRowid;
      const fieldId = state.db.prepare("INSERT INTO field (field_key, field_label, field_type) VALUES ('grade', 'Grade', 'select')").run().lastInsertRowid;
      const versionId = state.db.prepare("INSERT INTO form_version (form_id, version_number, status) VALUES (?, 1, 'published')").run(formId).lastInsertRowid;
      state.db.prepare('INSERT INTO form_questions (form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, 0)').run(formId, versionId, fieldId);
      const formQuestionId = state.db.prepare('SELECT form_question_id FROM form_questions WHERE form_id = ? AND field_id = ?').get(formId, fieldId).form_question_id;
      [['2026-01-15 10:00:00', '7th'], ['2026-02-10 10:00:00', '8th'], ['2026-03-20 10:00:00', '8th']].forEach(([at, grade]) => {
        const subId = state.db.prepare('INSERT INTO submission (initiative_id, form_id, submitted_at) VALUES (?, ?, ?)').run(initiativeId, formId, at).lastInsertRowid;
        state.db.prepare('INSERT INTO submission_value (submission_id, form_question_id, value_text) VALUES (?, ?, ?)').run(subId, formQuestionId, grade);
      });
      return initiativeId;
    }

    const get = (initiativeId, query) => GET(
      new Request(`http://localhost:3000/api/initiatives/${initiativeId}/report-data${query}`),
      { params: Promise.resolve({ id: String(initiativeId) }) },
    );

    test('rejects dates that are not YYYY-MM-DD', async () => {
      const initiativeId = seedDatedAnswers();
      expect((await get(initiativeId, '?startDate=01/02/2026')).status).toBe(400);
      expect((await get(initiativeId, '?endDate=2026-2-1')).status).toBe(400);
    });

    test('passes the range to the row query', async () => {
      const initiativeId = seedDatedAnswers();
      await get(initiativeId, '?startDate=2026-02-01&endDate=2026-02-28');
      expect(queryTableDataMock).toHaveBeenLastCalledWith(expect.anything(), initiativeId, { startDate: '2026-02-01', endDate: '2026-02-28' });
      await get(initiativeId, '');
      expect(queryTableDataMock).toHaveBeenLastCalledWith(expect.anything(), initiativeId, { startDate: null, endDate: null });
    });

    test('summary counts and charts only include responses in the range', async () => {
      const initiativeId = seedDatedAnswers();
      const all = await (await get(initiativeId, '')).json();
      expect(all.summary.totalParticipants).toBe(3);
      expect(all.chartData.Grade).toEqual([{ name: '8th', value: 2 }, { name: '7th', value: 1 }]);

      const feb = await (await get(initiativeId, '?startDate=2026-02-01&endDate=2026-02-28')).json();
      expect(feb.summary.totalParticipants).toBe(1);
      expect(feb.chartData.Grade).toEqual([{ name: '8th', value: 1 }]);

      const fromFeb = await (await get(initiativeId, '?startDate=2026-02-01')).json();
      expect(fromFeb.summary.totalParticipants).toBe(2);
      expect(fromFeb.chartData.Grade).toEqual([{ name: '8th', value: 2 }]);
    });
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
