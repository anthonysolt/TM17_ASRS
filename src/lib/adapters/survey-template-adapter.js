function normalizeQuestion(question, fallbackId) {
  const text = question?.text && typeof question.text === 'object' ? question.text : question || {};

  const options = Array.isArray(text.options)
    ? text.options.map((opt) => String(opt))
    : [];

  const subQuestions = Array.isArray(text.subQuestions)
    ? text.subQuestions.map((s) => String(s))
    : [];
  const optionDetails = Array.isArray(text.optionDetails)
    ? text.optionDetails.map(option => ({ value: option.value, label: String(option.label) }))
    : null;

  return {
    id: question?.id ?? fallbackId,
    label: text.question || '',
    type: text.type || 'text',
    required: text.required !== false,
    options,
    ...(optionDetails ? { optionDetails } : {}),
    subQuestions,
    helpText: text.help_text || '',
    scope: text.scope || null,
    initiative_id: text.initiative_id || null,
    validation_rules: text.validation_rules || null,
  };
}

export function toSurveyTemplateViewModel(template) {
  if (!template || typeof template !== 'object') return null;

  const questions = Array.isArray(template.questions)
    ? template.questions.map((q, idx) => normalizeQuestion(q, idx + 1))
    : [];

  return {
    id: template.id,
    title: template.title || 'Untitled Survey',
    description: template.description || '',
    initiative_id: template.initiative_id || null,
    initiative_name: template.initiative_name || null,
    questions,
    createdAt: template.createdAt || null,
    published: Boolean(template.published),
  };
}
