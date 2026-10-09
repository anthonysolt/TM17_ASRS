export const LIKERT_SCALES = {
  likert_agreement: { label: 'Likert Agreement', options: ['1 - Strongly Disagree', '2 - Disagree', '3 - Some What Disagree', '4 - Neutral', '5 - Some What Agree', '6 - Agree', '7 - Strongly Agree'] },
  likert_good_bad: { label: 'Likert Good/Bad', options: ['1 - Extremely Bad', '2 - Bad', '3 - Fair', '4 - Good', '5 - Extremely Good'] },
  likert_like_dislike: { label: 'Likert Like/Dislike', options: ['1 - Strongly Dislike', '2 - Dislike', '3 - Some What Dislike', '4 - Neutral', '5 - Some What Like', '6 - Like', '7 - Strongly Like'] },
};

export function isLikertType(type) {
  return Object.hasOwn(LIKERT_SCALES, type);
}

export function getLikertOptionDetails(type) {
  return (LIKERT_SCALES[type]?.options || []).map((label, index) => ({ value: index + 1, label }));
}

export function getLikertLabels(type) {
  return getLikertOptionDetails(type).map(option => option.label);
}
