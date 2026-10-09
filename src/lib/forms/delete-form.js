// Deletes a form and the fields that belong only to it. Field options cascade
// from field. Core and initiative questions are kept, as is any field another
// form still uses. Call inside a transaction after the form's submissions are gone.
export function deleteFormAndFields(db, formId) {
  // Collect this form's fields (current and earlier revisions) before the
  // form_questions rows cascade away.
  const fieldIds = db.prepare(`
    SELECT field_id FROM form_questions WHERE form_id = ?
    UNION
    SELECT root_field_id FROM form_questions WHERE form_id = ?
  `).all(formId, formId).map((row) => row.field_id);

  db.prepare('DELETE FROM form WHERE form_id = ?').run(formId);

  const deleteField = db.prepare(`
    DELETE FROM field
    WHERE field_id = ?
      AND is_core_question = 0
      AND is_initiative_specific = 0
      AND scope <> 'initiative_specific'
      AND NOT EXISTS (
        SELECT 1 FROM form_questions fq
        WHERE fq.field_id = field.field_id OR fq.root_field_id = field.field_id
      )
  `);
  fieldIds.forEach((fieldId) => deleteField.run(fieldId));
}
