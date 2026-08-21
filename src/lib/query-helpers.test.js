import Database from 'better-sqlite3';
import { queryTableData } from '@/lib/query-helpers';

function createTestDb() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE field (
      field_id INTEGER PRIMARY KEY,
      field_key TEXT,
      field_label TEXT,
      field_type TEXT
    );

    CREATE TABLE form (
      form_id INTEGER PRIMARY KEY,
      initiative_id INTEGER
    );

    CREATE TABLE form_questions (
      form_question_id INTEGER PRIMARY KEY,
      form_id INTEGER,
      field_id INTEGER,
      display_order INTEGER
    );

    CREATE TABLE submission (
      submission_id INTEGER PRIMARY KEY,
      initiative_id INTEGER,
      form_id INTEGER
    );

    CREATE TABLE submission_value (
      submission_value_id INTEGER PRIMARY KEY,
      submission_id INTEGER,
      form_question_id INTEGER,
      value_text TEXT,
      value_number REAL
    );
  `);

  return db;
}

describe('queryTableData', () => {
  test('pivots rating fields from value_number so preview uses real rating answers', () => {
    const db = createTestDb();

    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (?, ?)').run(9, 9);
    db.prepare('INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (?, ?, ?, ?)').run(1, 'grade', 'Grade', 'text');
    db.prepare('INSERT INTO field (field_id, field_key, field_label, field_type) VALUES (?, ?, ?, ?)').run(75, 'campusSatisfaction', 'How satisfied are you with campus facilities?', 'rating');
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, field_id, display_order) VALUES (?, ?, ?, ?)').run(1, 9, 1, 0);
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, field_id, display_order) VALUES (?, ?, ?, ?)').run(2, 9, 75, 1);
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
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, field_id, display_order) VALUES (?, ?, ?, ?)')
      .run(100, 10, 20, 0);
    db.prepare('INSERT INTO form_questions (form_question_id, form_id, field_id, display_order) VALUES (?, ?, ?, ?)')
      .run(101, 11, 20, 0);

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
});
