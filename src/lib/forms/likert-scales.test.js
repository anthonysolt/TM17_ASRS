import { describe, expect, test } from 'vitest';
import { getLikertOptionDetails, LIKERT_SCALES } from './likert-scales';

describe('Likert scales', () => {
  test('provides numeric report values for every displayed label', () => {
    for (const [type, scale] of Object.entries(LIKERT_SCALES)) {
      const options = getLikertOptionDetails(type);
      expect(options.map(option => option.value)).toEqual(
        Array.from({ length: scale.options.length }, (_, index) => index + 1)
      );
      expect(options.map(option => option.label)).toEqual(scale.options);
    }
  });
});
