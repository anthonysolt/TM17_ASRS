// Public per-initiative report pages live at /<slug>_reports, where <slug> is
// derived from the initiative name (e.g. "Youth Mentoring" -> "youth-mentoring_reports").
export const INITIATIVE_REPORTS_SUFFIX = '_reports';

export function slugifyInitiativeName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getInitiativeReportsSlug(name) {
  const slug = slugifyInitiativeName(name);
  return slug ? `${slug}${INITIATIVE_REPORTS_SUFFIX}` : '';
}

export function getInitiativeReportsPath(name) {
  const slug = getInitiativeReportsSlug(name);
  return slug ? `/${slug}` : '/reporting';
}

export function isInitiativeReportsSlug(slug) {
  const value = String(slug || '');
  return value.endsWith(INITIATIVE_REPORTS_SUFFIX) && value.length > INITIATIVE_REPORTS_SUFFIX.length;
}

export function findInitiativeByReportsSlug(initiatives, slug) {
  const target = String(slug || '').toLowerCase();
  if (!target) return null;
  return (initiatives || []).find((initiative) => getInitiativeReportsSlug(initiative?.name) === target) || null;
}
