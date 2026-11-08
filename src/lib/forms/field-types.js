// Form builder question types that are stored under a different field.field_type.
// DB CHECK constraint: field_type IN ('text','number','date','boolean','select','multiselect','rating','json','choice','yesno')
// The builder type is kept in validation_rules.ui_type so the survey renders it correctly.
export const UI_TO_DB_TYPE = {
  textarea: 'text',
  select: 'text',
  radio: 'text',
  choice: 'text',
  // Answers are a list of ticked options, saved as JSON in submission_value.value_json.
  checkbox: 'multiselect',
  email: 'text',
  url: 'text',
  likert_agreement: 'number',
  likert_good_bad: 'number',
  likert_like_dislike: 'number',
};

export function toDbFieldType(uiType) {
  return UI_TO_DB_TYPE[uiType] || uiType;
}
