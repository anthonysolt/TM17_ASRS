import {
  findInitiativeByReportsSlug,
  getInitiativeReportsPath,
  getInitiativeReportsSlug,
  isInitiativeReportsSlug,
  slugifyInitiativeName,
} from '@/lib/initiative-slug';

describe('initiative-slug', () => {
  test('slugifies initiative names', () => {
    expect(slugifyInitiativeName('Youth Mentoring')).toBe('youth-mentoring');
    expect(slugifyInitiativeName('  STEM & Arts: 2026!  ')).toBe('stem-arts-2026');
    expect(slugifyInitiativeName('Café Programs')).toBe('cafe-programs');
    expect(slugifyInitiativeName('')).toBe('');
  });

  test('builds the _reports slug and path', () => {
    expect(getInitiativeReportsSlug('Youth Mentoring')).toBe('youth-mentoring_reports');
    expect(getInitiativeReportsPath('Youth Mentoring')).toBe('/youth-mentoring_reports');
    expect(getInitiativeReportsSlug('!!!')).toBe('');
    expect(getInitiativeReportsPath('!!!')).toBe('/reporting');
  });

  test('recognizes report page slugs', () => {
    expect(isInitiativeReportsSlug('youth-mentoring_reports')).toBe(true);
    expect(isInitiativeReportsSlug('_reports')).toBe(false);
    expect(isInitiativeReportsSlug('youth-mentoring')).toBe(false);
  });

  test('finds an initiative by slug, case-insensitively', () => {
    const initiatives = [{ id: 1, name: 'Youth Mentoring' }, { id: 2, name: 'Food Drive' }];
    expect(findInitiativeByReportsSlug(initiatives, 'food-drive_reports')).toEqual(initiatives[1]);
    expect(findInitiativeByReportsSlug(initiatives, 'Youth-Mentoring_reports')).toEqual(initiatives[0]);
    expect(findInitiativeByReportsSlug(initiatives, 'missing_reports')).toBeNull();
  });
});
