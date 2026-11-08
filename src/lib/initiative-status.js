// Initiative status and public-view settings, stored on initiative.settings as
// { status, isPublic }. Shared by the dashboard, the initiatives list, and the
// create / manage forms so labels and values stay consistent.

export const INITIATIVE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active', pill: 'pill-green' },
  { value: 'inactive', label: 'Inactive', pill: 'pill-gray' },
  { value: 'archived', label: 'Archived', pill: 'pill-red' },
];

export const INITIATIVE_VIEW_OPTIONS = [
  { value: 'public', label: 'Public', pill: 'pill-blue' },
  { value: 'private', label: 'Private', pill: 'pill-gray' },
];

/**
 * Lower-cases a stored status. No status means active, and the old "draft"
 * status is now called "inactive".
 */
export function normalizeInitiativeStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return 'active';
  if (value === 'draft') return 'inactive';
  return value;
}

export function getInitiativeStatusOption(status) {
  const value = normalizeInitiativeStatus(status);
  return INITIATIVE_STATUS_OPTIONS.find((option) => option.value === value)
    // Unknown legacy values (e.g. "in review") still display as stored.
    || { value, label: String(status), pill: 'pill-yellow' };
}

/**
 * Applies a saved initiative (from PUT /api/initiatives/[id]) to a list row.
 * Only the settings change; the PUT response doesn't include list counts.
 */
export function applySavedInitiativeSettings(initiatives, saved) {
  if (!saved) return initiatives;
  return initiatives.map((item) => (
    Number(item.id) === Number(saved.id)
      ? { ...item, settings: saved.settings, status: saved.status, updated_at: saved.updated_at }
      : item
  ));
}

export function getInitiativeView(settings) {
  return settings?.isPublic === true ? 'public' : 'private';
}

export function getInitiativeViewOption(settings) {
  const value = getInitiativeView(settings);
  return INITIATIVE_VIEW_OPTIONS.find((option) => option.value === value);
}
