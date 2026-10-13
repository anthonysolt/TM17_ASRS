// Statuses a new report can start in; same choices as the Reporting page edit form.
export const REPORT_STATUS_OPTIONS = [
  { value: 'completed', label: 'Unpublished' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

export function getReportStatusLabel(status) {
  return REPORT_STATUS_OPTIONS.find((option) => option.value === status)?.label || 'Unpublished';
}
