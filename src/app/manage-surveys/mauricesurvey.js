/**
 * Seed: E-Gaming and Careers Survey, questions from maurice
 */
export function seedEgamingSurvey(db) {
  try {

    const egamingInit = db
      .prepare("SELECT initiative_id, initiative_name FROM initiative WHERE initiative_name = 'E-Gaming and Careers'")
      .get();

    if (!egamingInit) {
      return;
    }

    const egamingInitId = egamingInit.initiative_id;

    const firstRun = !db.prepare("SELECT field_id FROM field WHERE field_key = 'egaming_grade'").get();

    if (firstRun) {
      const TEXTAREA = JSON.stringify({ ui_type: 'textarea' });
      const CHECKBOX = JSON.stringify({ ui_type: 'checkbox' });
      const RADIO    = JSON.stringify({ ui_type: 'radio' });

      const fieldDefs = [
        // [key, label, db_type, scope, is_filterable, validation_rules_json]
        ['egaming_grade',
          'What grade are you in?',
          'select', 'initiative_specific', 1, null],

        ['egaming_career_interest',
          'Please select the E-Gaming and Career that interested you.',
          'multiselect', 'initiative_specific', 1, CHECKBOX],

        ['liked_most',
          'What part of the E-Gaming and Career program did you like the most? Tell us why. (You can comment on the content of the workshops, activities, and/or speakers)',
          'text', 'initiative_specific', 0, TEXTAREA],

        ['liked_least',
          'What part of the E-Gaming and Career program did you like the least? Tell us why. (You can comment on the content of the workshops, activities, and/or speakers)',
          'text', 'initiative_specific', 0, TEXTAREA],

        ['new_learnings',
          'Tell us anything new that you learned during this program.',
          'text', 'initiative_specific', 0, TEXTAREA],

        ['improvements',
          'What would have made this class better?  (You can comment on the content of the workshops, activities, and/or speakers) ',
          'text', 'initiative_specific', 0, TEXTAREA],

        ['egaming_yesno',
          'Please select Yes or No for the following questions.',
          'yesno', 'initiative_specific', 0, null],

        ['overall_rating',
          'Overall, how would you rate your experience in this program?',
          'choice', 'initiative_specific', 1, RADIO],

        ['future_activities',
          'What new activities would you like the program to offer in the future?',
          'text', 'initiative_specific', 0, TEXTAREA],
      ];

      const insertField = db.prepare(
        'INSERT OR IGNORE INTO field (field_key, field_label, field_type, scope, is_filterable, validation_rules) VALUES (?,?,?,?,?,?)'
      );
      for (const [key, label, type, scope, filterable, rules] of fieldDefs) {
        insertField.run(key, label, type, scope, filterable, rules);
      }

      const getField  = db.prepare('SELECT field_id FROM field WHERE field_key = ?');
      const insertOpt = db.prepare(
        'INSERT INTO field_options (field_id, option_value, display_label, display_order) VALUES (?,?,?,?)'
      );

      const optionSets = {
        egaming_grade: [
          ['6th',   '6th',   0],
          ['7th',   '7th',   1],
          ['8th',   '8th',   2],
          ['other', 'Other', 3],
        ],
        egaming_career_interest: [
          ['programming', 'Programming', 0],
          ['narrative',   'Narrative',   1],
          ['audio',       'Audio',       2],
          ['art',         'Art',         3],
          ['design',      'Design',      4],
          ['production',  'Production',  5],
        ],
        egaming_yesno: [
          ['Did you feel actively involved in the program?',                   'Did you feel actively involved in the program?',                   0],
          ['Was the program interesting?',                                     'Was the program interesting?',                                     1],
          ['Were the topics important to you?',                                'Were the topics important to you?',                                2],
          ['Did the instructor do a good job of getting their points across?', 'Did the instructor do a good job of getting their points across?', 3],
          ['Were you able to ask questions and receive helpful responses?',    'Were you able to ask questions and receive helpful responses?',    4],
        ],
        overall_rating: [
          ['poor',      'Poor',      0],
          ['fair',      'Fair',      1],
          ['good',      'Good',      2],
          ['excellent', 'Excellent', 3],
        ],
      };

      for (const [fieldKey, opts] of Object.entries(optionSets)) {
        const fieldRow = getField.get(fieldKey);
        if (!fieldRow) continue;
        for (const [val, lbl, ord] of opts) insertOpt.run(fieldRow.field_id, val, lbl, ord);
      }
    } else {
    }

    const FORM_NAME = 'E-Gaming and Careers Survey';
    const getField  = db.prepare('SELECT field_id FROM field WHERE field_key = ?');

    const existingForm = db
      .prepare('SELECT form_id FROM form WHERE initiative_id = ? AND form_name = ?')
      .get(egamingInitId, FORM_NAME);

    let egamingFormId;
    if (existingForm) {
      egamingFormId = existingForm.form_id;
      db.prepare('UPDATE form SET is_published = 1, description = ? WHERE form_id = ?')
        .run('Feedback survey for the E-Gaming and Careers Program. Responses are anonymous.', egamingFormId);
    } else {
      const r = db
        .prepare('INSERT INTO form (initiative_id, form_name, description, is_published) VALUES (?,?,?,1)')
        .run(egamingInitId, FORM_NAME, 'Feedback survey for the E-Gaming and Careers Program. Responses are anonymous.');
      egamingFormId = r.lastInsertRowid;
    }
    db.prepare('DELETE FROM form_questions WHERE form_id = ?').run(egamingFormId);

    const WORKSHOPS_NOTE = 'You can comment on the content of the workshops, activities, and/or speakers';

    const formFieldOrder = [
      // [field_key,              required, help_text]
      ['school',                  1,        null],
      ['egaming_grade',           1,        null],
      ['egaming_career_interest', 0,        null],
      ['liked_most',              0,        WORKSHOPS_NOTE],
      ['liked_least',             0,        WORKSHOPS_NOTE],
      ['new_learnings',           0,        null],
      ['improvements',            0,        WORKSHOPS_NOTE],
      ['egaming_yesno',           0,        null],
      ['overall_rating',          0,        null],
      ['future_activities',       0,        null],
    ];

    const insertFF = db.prepare(
      'INSERT INTO form_questions (form_id, field_id, display_order, required, help_text) VALUES (?,?,?,?,?)'
    );

    for (let i = 0; i < formFieldOrder.length; i++) {
      const [key, required, helpText] = formFieldOrder[i];
      const fieldRow = getField.get(key);
      if (!fieldRow) continue;
      insertFF.run(egamingFormId, fieldRow.field_id, i, required, helpText);
    }

  } catch (err) {
  }
}
