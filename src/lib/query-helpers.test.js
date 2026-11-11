import Database from 'better-sqlite3';
import { querySelectedQuestionData, queryTableData, submittedAtClause } from '@/lib/query-helpers';

function createTestDb() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE field (
      field_id INTEGER PRIMARY KEY,
      field_key TEXT,
      field_label TEXT,
      field_type TEXT,
      validation_rules TEXT
    );

    CREATE TABLE form (
      form_id INTEGER PRIMARY KEY,
      initiative_id INTEGER
    );

    CREATE TABLE form_version (
      form_version_id INTEGER PRIMARY KEY,
      version_number INTEGER,
      status TEXT NOT NULL DEFAULT 'published'
    );

    CREATE TABLE form_questions (
      form_question_id INTEGER PRIMARY KEY,
      form_id INTEGER,
      form_version_id INTEGER,
      field_id INTEGER,
      root_field_id INTEGER,
      display_order INTEGER
    );

    CREATE TRIGGER form_questions_default_root AFTER INSERT ON form_questions
    WHEN NEW.root_field_id IS NULL
    BEGIN
      UPDATE form_questions SET root_field_id = NEW.field_id WHERE form_question_id = NEW.form_question_id;
    END;

    CREATE TABLE form_version_questions (
      form_version_id INTEGER,
      form_question_id INTEGER,
      display_order INTEGER
    );

    CREATE TRIGGER form_questions_default_version AFTER INSERT ON form_questions
    WHEN NEW.form_version_id IS NOT NULL
    BEGIN
      INSERT INTO form_version_questions (form_version_id, form_question_id, display_order)
      VALUES (NEW.form_version_id, NEW.form_question_id, NEW.display_order);
    END;

    CREATE TABLE submission (
      submission_id INTEGER PRIMARY KEY,
      initiative_id INTEGER,
      form_id INTEGER,
      submitted_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE submission_value (
      submission_value_id INTEGER PRIMARY KEY,
      submission_id INTEGER,
      form_question_id INTEGER,
      value_text TEXT,
      value_number REAL,
      value_json TEXT
    );
  `);

  return db;
}

describe('queryTableData', () => {
  test('pivots rating fields from value_number so preview uses real rating answers', () => {
    const db = createTestDb();

    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (?, ?)').run(9, 9);
    db.prepare('INSERT INTO form_version (form_version_id, version_number) VALUES (?, 1)').run(9);
    db.prepare('INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (?, ?, ?, ?)').run(1, 'grade', 'Grade', 'text');
    db.prepare('INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (?, ?, ?, ?)').run(75, 'campusSatisfaction', 'How satisfied are you with campus facilities?', 'rating');
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, ?, ?)').run(1, 9, 9, 1, 0);
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, ?, ?)').run(2, 9, 9, 75, 1);
    db.prepare('INSERT INTO submission (submission_id, initiative_id, form_id) VALUES (?, ?, ?)').run(26, 9, 9);
    db.prepare('INSERT INTO submission_value (submission_value_id, submission_id, form_question_id, value_text, value_number) VALUES (?, ?, ?, ?, ?)').run(1, 26, 1, '9th', null);
    db.prepare('INSERT INTO submission_value (submission_value_id, submission_id, form_question_id, value_text, value_number) VALUES (?, ?, ?, ?, ?)').run(2, 26, 2, null, 3);

    expect(queryTableData(db, 9)).toEqual([
      {
        id: 26,
        Grade: '9th',
        'How satisfied are you with campus facilities?': 3,
      },
    ]);
  });

  test('keeps answers separate when two forms reuse the same core question', () => {
    const db = createTestDb();

    db.prepare('INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (?, ?, ?, ?)')
      .run(20, 'shared_rating', 'Shared Rating', 'rating');
    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (?, ?)').run(10, 4);
    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (?, ?)').run(11, 4);
    db.prepare('INSERT INTO form_version (form_version_id, version_number) VALUES (?, 1)').run(10);
    db.prepare('INSERT INTO form_version (form_version_id, version_number) VALUES (?, 1)').run(11);
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, ?, ?)')
      .run(100, 10, 10, 20, 0);
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, ?, ?)')
      .run(101, 11, 11, 20, 0);

    db.prepare('INSERT INTO submission (submission_id, initiative_id, form_id) VALUES (?, ?, ?)').run(201, 4, 10);
    db.prepare('INSERT INTO submission (submission_id, initiative_id, form_id) VALUES (?, ?, ?)').run(202, 4, 11);
    db.prepare('INSERT INTO submission_value (submission_value_id, submission_id, form_question_id, value_number) VALUES (?, ?, ?, ?)')
      .run(301, 201, 100, 2);
    db.prepare('INSERT INTO submission_value (submission_value_id, submission_id, form_question_id, value_number) VALUES (?, ?, ?, ?)')
      .run(302, 202, 101, 5);

    expect(queryTableData(db, 4)).toEqual([
      { id: 201, 'Shared Rating': 2 },
      { id: 202, 'Shared Rating': 5 },
    ]);
  });

  test('reads checkbox answers from value_json as lists of ticked options', () => {
    const db = createTestDb();

    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (?, ?)').run(5, 5);
    db.prepare('INSERT INTO form_version (form_version_id, version_number) VALUES (?, 1)').run(5);
    db.prepare('INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (?, ?, ?, ?)')
      .run(30, 'activities', 'Activities', 'multiselect');
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, form_version_id, field_id, display_order) VALUES (?, ?, ?, ?, ?)')
      .run(40, 5, 5, 30, 0);
    const insertSubmission = db.prepare('INSERT INTO submission (submission_id, initiative_id, form_id) VALUES (?, 5, 5)');
    const insertValue = db.prepare('INSERT INTO submission_value (submission_id, form_question_id, value_json) VALUES (?, 40, ?)');
    [[1, '["Esports","Track"]'], [2, '["Track"]'], [3, '[]'], [4, '"Chess"']].forEach(([id, json]) => {
      insertSubmission.run(id);
      insertValue.run(id, json);
    });

    const expected = [
      { id: 1, Activities: ['Esports', 'Track'] },
      { id: 2, Activities: ['Track'] },
      { id: 3, Activities: null },
      { id: 4, Activities: ['Chess'] },
    ];
    expect(queryTableData(db, 5)).toEqual(expected);
    expect(querySelectedQuestionData(db, 5, [30]).tableData).toEqual(expected);
  });
});

describe('response date range', () => {
  function seedDatedSubmissions() {
    const db = createTestDb();
    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (7, 7)').run();
    db.prepare('INSERT INTO form_version (form_version_id, version_number) VALUES (7, 1)').run();
    db.prepare("INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (50, 'score', 'Score', 'number')").run();
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, form_version_id, field_id, display_order) VALUES (60, 7, 7, 50, 0)').run();
    const insertSubmission = db.prepare('INSERT INTO submission (submission_id, initiative_id, form_id, submitted_at) VALUES (?, 7, 7, ?)');
    const insertValue = db.prepare('INSERT INTO submission_value (submission_id, form_question_id, value_number) VALUES (?, 60, ?)');
    // Both stored timestamp styles: CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS') and ISO.
    [
      [1, '2026-01-31 23:59:59', 1],
      [2, '2026-02-01 00:00:00', 2],
      [3, '2026-02-15T12:30:00.000Z', 3],
      [4, '2026-02-28 23:59:58', 4],
      [6, '2026-02-28T23:59:59.500Z', 6],
      [5, '2026-03-01 00:00:00', 5],
    ].forEach(([id, at, value]) => {
      insertSubmission.run(id, at);
      insertValue.run(id, value);
    });
    return db;
  }

  const ids = (rows) => rows.map((row) => row.id);

  test('limits rows to submissions in the range, including both end days', () => {
    const db = seedDatedSubmissions();
    const range = { startDate: '2026-02-01', endDate: '2026-02-28' };
    expect(ids(queryTableData(db, 7, range))).toEqual([2, 3, 4, 6]);
    expect(ids(querySelectedQuestionData(db, 7, [50], range).tableData)).toEqual([2, 3, 4, 6]);
  });

  test('either end can be left open', () => {
    const db = seedDatedSubmissions();
    expect(ids(queryTableData(db, 7, { startDate: '2026-02-15' }))).toEqual([3, 4, 5, 6]);
    expect(ids(queryTableData(db, 7, { endDate: '2026-02-01' }))).toEqual([1, 2]);
  });

  test('no range returns every submission', () => {
    const db = seedDatedSubmissions();
    expect(ids(queryTableData(db, 7))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids(querySelectedQuestionData(db, 7, [50], { startDate: null, endDate: null }).tableData)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('submittedAtClause builds inclusive bounds', () => {
    expect(submittedAtClause({})).toEqual({ sql: '', params: [] });
    expect(submittedAtClause({ startDate: '2026-02-01', endDate: '2026-02-28' })).toEqual({
      sql: ' AND s.submitted_at >= ? AND s.submitted_at < ?',
      params: ['2026-02-01', '2026-03-01'],
    });
    // Month and year rollovers.
    expect(submittedAtClause({ endDate: '2026-12-31' }).params).toEqual(['2027-01-01']);
    expect(submittedAtClause({ endDate: '2028-02-28' }).params).toEqual(['2028-02-29']);
  });
});

describe('pivot columns with long or quoted labels', () => {
  // PostgreSQL truncates identifiers over 63 bytes and a quote/bracket in a label
  // would break a quoted alias, so pivot columns are aliased q_<id> in SQL and
  // renamed to the label afterwards.
  const LONG = 'Did the workshop inform you about key communication skills, planning skills, and team work?';
  const QUOTED = 'Rate the "Lab" ] session';

  function seed() {
    const db = createTestDb();
    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (8, 8)').run();
    db.prepare('INSERT INTO form_version (form_version_id, version_number) VALUES (8, 1)').run();
    db.prepare("INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (70, 'long', ?, 'text')").run(LONG);
    db.prepare("INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (71, 'quoted', ?, 'number')").run(QUOTED);
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, form_version_id, field_id, display_order) VALUES (80, 8, 8, 70, 0)').run();
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, form_version_id, field_id, display_order) VALUES (81, 8, 8, 71, 1)').run();
    db.prepare('INSERT INTO submission (submission_id, initiative_id, form_id) VALUES (1, 8, 8)').run();
    db.prepare("INSERT INTO submission_value (submission_id, form_question_id, value_text) VALUES (1, 80, 'Yes')").run();
    db.prepare('INSERT INTO submission_value (submission_id, form_question_id, value_number) VALUES (1, 81, 4)').run();
    return db;
  }

  test('rows use the full labels as keys', () => {
    const db = seed();
    const expected = [{ id: 1, [LONG]: 'Yes', [QUOTED]: 4 }];
    expect(queryTableData(db, 8)).toEqual(expected);
    expect(querySelectedQuestionData(db, 8, [70, 71]).tableData).toEqual(expected);
  });

  test('labels never appear as SQL identifiers', () => {
    const db = seed();
    const sqls = [];
    const spy = { prepare: (sql) => { sqls.push(sql); return db.prepare(sql); } };
    queryTableData(spy, 8);
    querySelectedQuestionData(spy, 8, [70, 71]);
    const pivotSql = sqls.filter((sql) => sql.includes('MAX(CASE'));
    expect(pivotSql).toHaveLength(2);
    pivotSql.forEach((sql) => {
      expect(sql).toContain('AS q_70');
      expect(sql).toContain('AS q_71');
      expect(sql).not.toContain(LONG);
      expect(sql).not.toContain('"Lab"');
    });
  });
});
