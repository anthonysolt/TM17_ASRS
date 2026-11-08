import { toDbFieldType } from '@/lib/forms/field-types';

describe('toDbFieldType', () => {
  test.each([
    ['checkbox', 'multiselect'],
    ['radio', 'text'],
    ['select', 'text'],
    ['textarea', 'text'],
    ['likert_agreement', 'number'],
    ['rating', 'rating'],
    ['date', 'date'],
  ])('stores %s questions as %s', (uiType, dbType) => {
    expect(toDbFieldType(uiType)).toBe(dbType);
  });
});
