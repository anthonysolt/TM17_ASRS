export function templateToEditableForm(template, requiredFields = []) {
  const requiredByKey = new Map(requiredFields.map(field => [field.field_key, field]));
  const questions = (template.questions || []).map(question => {
    const text = question.text || question;
    const lockedDefinition = requiredByKey.get(text.field_key);
    return {
      field_id: question.id,
      field_key: text.field_key || `field_${question.id}`,
      field_label: text.question || text.label || '',
      field_type: text.type || 'text',
      scope: text.scope || 'common',
      initiative_id: text.initiative_id || null,
      is_core_question: !!text.is_core_question,
      is_initiative_specific: !!text.is_initiative_specific,
      required: text.required !== false,
      help_text: text.help_text || '',
      validation_rules: text.validation_rules || null,
      options: Array.isArray(text.optionDetails)
        ? text.optionDetails.map(option => option.label)
        : [...(text.options || [])],
      ...(lockedDefinition ? { _locked: true } : {}),
    };
  });

  return {
    title: template.title || '',
    description: template.description || '',
    initiativeId: template.initiative_id ? String(template.initiative_id) : '',
    questions,
  };
}

export function getEditTemplateUrl(templateId) {
  return `/api/surveys/templates/${encodeURIComponent(templateId)}`;
}
