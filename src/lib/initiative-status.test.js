import {
  applySavedInitiativeSettings,
  getInitiativeStatusOption,
  getInitiativeViewOption,
  normalizeInitiativeStatus,
} from '@/lib/initiative-status';

describe('initiative status and view', () => {
  test('old draft status and missing status normalize', () => {
    expect(normalizeInitiativeStatus('draft')).toBe('inactive');
    expect(normalizeInitiativeStatus('Active')).toBe('active');
    expect(normalizeInitiativeStatus('')).toBe('active');
    expect(normalizeInitiativeStatus(undefined)).toBe('active');
    expect(normalizeInitiativeStatus('Archived')).toBe('archived');
  });

  test('labels show Inactive instead of Draft and keep unknown values', () => {
    expect(getInitiativeStatusOption('draft').label).toBe('Inactive');
    expect(getInitiativeStatusOption('inactive').label).toBe('Inactive');
    expect(getInitiativeStatusOption('In Review')).toMatchObject({ value: 'in review', label: 'In Review' });
  });

  test('view is public only when isPublic is true', () => {
    expect(getInitiativeViewOption({ isPublic: true }).label).toBe('Public');
    expect(getInitiativeViewOption({ isPublic: false }).label).toBe('Private');
    expect(getInitiativeViewOption({}).label).toBe('Private');
    expect(getInitiativeViewOption(undefined).label).toBe('Private');
  });

  test('saving updates settings without dropping list counts', () => {
    const rows = [
      { id: 1, name: 'A', submission_count: 12, settings: { status: 'active' } },
      { id: 2, name: 'B', submission_count: 3, settings: { status: 'active' } },
    ];
    const saved = { id: 1, settings: { status: 'inactive', isPublic: true }, status: 'inactive', updated_at: 'now', submission_count: 0 };
    const next = applySavedInitiativeSettings(rows, saved);
    expect(next[0]).toEqual({ id: 1, name: 'A', submission_count: 12, settings: saved.settings, status: 'inactive', updated_at: 'now' });
    expect(next[1]).toBe(rows[1]);
  });
});
