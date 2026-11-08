import { getLikertOptionDetails, isLikertType } from '@/lib/forms/likert-scales';

// Yes/No question: a single choice of Yes, No or N/A, saved as its text in
// submission_value.value_text.
export const YES_NO_TYPE = 'yesno';
export const YES_NO_OPTIONS = ['Yes', 'No', 'N/A'];

/** Question types whose answer options are fixed and not editable in the builder. */
export function hasFixedOptions(type) {
  return type === YES_NO_TYPE || isLikertType(type);
}

/** [{ value, label }] stored in field_options for a fixed-option type. */
export function getFixedOptionDetails(type) {
  if (type === YES_NO_TYPE) return YES_NO_OPTIONS.map(label => ({ value: label, label }));
  return getLikertOptionDetails(type);
}

export function getFixedOptionLabels(type) {
  return getFixedOptionDetails(type).map(option => option.label);
}
