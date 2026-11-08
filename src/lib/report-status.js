// Report statuses (the report builder and ReportList's status dropdown and edit
// pop-up). `pill` is the CSS class used by the status pill / PillSelect dropdown.
export const REPORT_STATUS_OPTIONS = [
  { value: 'completed', label: 'Unpublished', pill: 'pill-yellow' },
  { value: 'published', label: 'Published', pill: 'pill-green' },
  { value: 'archived', label: 'Archived', pill: 'pill-gray' },
];

export function getReportStatusLabel(status) {
  return REPORT_STATUS_OPTIONS.find((option) => option.value === status)?.label || 'Unpublished';
}

/** Option for a stored report status; no status (or legacy "draft") shows as Draft. */
export function getReportStatusOption(status) {
  const value = String(status || 'draft').trim().toLowerCase();
  return REPORT_STATUS_OPTIONS.find((option) => option.value === value)
    || { value, label: value === 'draft' ? 'Draft' : String(status), pill: 'pill-yellow' };
}
