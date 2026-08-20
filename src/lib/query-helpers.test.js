import Database from 'better-sqlite3';
import { queryInitiativeReportOptions, querySelectedQuestionData, queryTableData } from '@/lib/query-helpers';

function createTestDb() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE initiative_attribute (
      attribute_id INTEGER PRIMARY KEY,
      name TEXT,
      data_type TEXT,
      initiative_id INTEGER
    );

    CREATE TABLE field (
      field_id INTEGER PRIMARY KEY,
      field_key TEXT,
      field_label TEXT,
      field_type TEXT,
      attribute_id INTEGER
    );

    CREATE TABLE form (
      form_id INTEGER PRIMARY KEY,
      initiative_id INTEGER
    );

    CREATE TABLE form_field (
      form_field_id INTEGER PRIMARY KEY,
      form_id INTEGER,
      field_id INTEGER,
      display_order INTEGER
    );

    CREATE TABLE submission (
      submission_id INTEGER PRIMARY KEY,
      initiative_id INTEGER
    );

    CREATE TABLE submission_value (
      submission_value_id INTEGER PRIMARY KEY,
      submission_id INTEGER,
      field_id INTEGER,
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
    db.prepare('INSERT INTO form_field (form_field_id, form_id, field_id, display_order) VALUES (?, ?, ?, ?)').run(1, 9, 1, 0);
    db.prepare('INSERT INTO form_field (form_field_id, form_id, field_id, display_order) VALUES (?, ?, ?, ?)').run(2, 9, 75, 1);
    db.prepare('INSERT INTO submission (submission_id, initiative_id) VALUES (?, ?)').run(26, 9);
    db.prepare('INSERT INTO submission_value (submission_value_id, submission_id, field_id, value_text, value_number) VALUES (?, ?, ?, ?, ?)').run(1, 26, 1, '9th', null);
    db.prepare('INSERT INTO submission_value (submission_value_id, submission_id, field_id, value_text, value_number) VALUES (?, ?, ?, ?, ?)').run(2, 26, 75, null, 3);

    expect(queryTableData(db, 9)).toEqual([
      {
        id: 26,
        Grade: '9th',
        'How satisfied are you with campus facilities?': 3,
      },
    ]);
  });

  test('uses linked attribute name when question text is renamed', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO initiative_attribute (attribute_id, name, data_type, initiative_id) VALUES (?, ?, ?, ?)')
      .run(4, 'Satisfaction Score', 'number', 9);
    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (?, ?)').run(9, 9);
    db.prepare('INSERT INTO field (field_id, field_key, field_label, field_type, attribute_id) VALUES (?, ?, ?, ?, ?)')
      .run(75, 'satisfaction', 'How do you feel today?', 'rating', 4);
    db.prepare('INSERT INTO form_field (form_field_id, form_id, field_id, display_order) VALUES (?, ?, ?, ?)').run(2, 9, 75, 0);
    db.prepare('INSERT INTO submission (submission_id, initiative_id) VALUES (?, ?)').run(26, 9);
    db.prepare('INSERT INTO submission_value (submission_value_id, submission_id, field_id, value_text, value_number) VALUES (?, ?, ?, ?, ?)')
      .run(2, 26, 75, null, 4);
    expect(queryTableData(db, 9)).toEqual([{ id: 26, 'Satisfaction Score': 4 }]);
  });

  test('returns initiative report options and pivots only selected questions', () => {
    const db = createTestDb();
    db.prepare('INSERT INTO initiative_attribute (attribute_id, name, data_type, initiative_id) VALUES (?, ?, ?, ?)')
      .run(4, 'Wellbeing', 'rating', 9);
    db.prepare('INSERT INTO form (form_id, initiative_id) VALUES (?, ?)').run(9, 9);
    db.prepare('INSERT INTO field (field_id, field_key, field_label, field_type, attribute_id) VALUES (?, ?, ?, ?, ?)')
      .run(90, 'safe', 'Do you feel safe?', 'rating', 4);
    db.prepare('INSERT INTO form_field (form_field_id, form_id, field_id, display_order) VALUES (?, ?, ?, ?)').run(1, 9, 90, 0);
    db.prepare('INSERT INTO submission (submission_id, initiative_id) VALUES (?, ?)').run(26, 9);
    db.prepare('INSERT INTO submission_value (submission_value_id, submission_id, field_id, value_number) VALUES (?, ?, ?, ?)')
      .run(1, 26, 90, 4);

    const options = queryInitiativeReportOptions(db, 9);
    expect(options.attributes).toContainEqual(expect.objectContaining({ id: 4, name: 'Wellbeing', questionCount: 1 }));
    expect(options.questions).toContainEqual(expect.objectContaining({ id: 90, label: 'Do you feel safe?', attributeId: 4 }));

    const selected = querySelectedQuestionData(db, 9, [90]);
    expect(selected.columnsByFieldId[90]).toBe('Do you feel safe?');
    expect(selected.tableData).toEqual([{ id: 26, 'Do you feel safe?': 4 }]);
  });
});
