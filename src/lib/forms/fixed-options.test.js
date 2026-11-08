import { getFixedOptionDetails, getFixedOptionLabels, hasFixedOptions } from '@/lib/forms/fixed-options';

describe('fixed answer options', () => {
  test('Yes/No offers Yes, No and N/A saved as their text', () => {
    expect(hasFixedOptions('yesno')).toBe(true);
    expect(getFixedOptionDetails('yesno')).toEqual([
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
      { value: 'N/A', label: 'N/A' },
    ]);
  });

  test('Likert scales keep their numeric values', () => {
    expect(hasFixedOptions('likert_good_bad')).toBe(true);
    expect(getFixedOptionDetails('likert_good_bad')[0]).toEqual({ value: 1, label: '1 - Extremely Bad' });
    expect(getFixedOptionLabels('likert_good_bad')).toHaveLength(5);
  });

  test('editable choice types have no fixed options', () => {
    expect(hasFixedOptions('radio')).toBe(false);
    expect(hasFixedOptions('text')).toBe(false);
  });
});
