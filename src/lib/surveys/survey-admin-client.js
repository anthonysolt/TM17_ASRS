// Helpers for survey admin views: the Surveys section pages, the survey list and
// responses components (also used on initiative pages), and the public /survey page.

import { apiFetch } from '@/lib/api/client';

const DATE_TIME_PARTS = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

/** Submission timestamp in US Eastern time, e.g. "11/4/2026, 02:15:09 PM EST". */
export function formatEasternDateTime(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Date(timestamp).toLocaleDateString('en-US', {
      ...DATE_TIME_PARTS,
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    });
  } catch {
    return new Date(timestamp).toLocaleDateString('en-US', DATE_TIME_PARTS);
  }
}

/**
 * Response counts per survey from GET /api/surveys/counts (optionally for one
 * initiative), without downloading the responses. Resolves to
 * { counts: { [templateId]: n }, total }; throws with the server's message.
 */
export async function fetchResponseCounts(initiativeId) {
  const qs = initiativeId ? `?initiativeId=${encodeURIComponent(initiativeId)}` : '';
  const res = await apiFetch(`/api/surveys/counts${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Could not load response counts (server responded ${res.status})`);
  return { counts: body.counts || {}, total: Number(body.total) || 0 };
}

/** A survey's response count from a counts map ({ [templateId]: n }). */
export function responseCountFor(counts, templateId) {
  return Number(counts?.[String(templateId)] ?? counts?.[Number(templateId)] ?? 0);
}

/**
 * Permanently delete survey submissions (DELETE /api/surveys?surveyId=...).
 * Resolves to { deleted: [ids], failed: [{ id, error }] }; never throws.
 */
export async function deleteSubmissions(ids) {
  const results = await Promise.all(ids.map(async (id) => {
    try {
      const res = await apiFetch(`/api/surveys?surveyId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      return res.ok ? { id, ok: true } : { id, ok: false, error: data.error || 'Failed to delete submission' };
    } catch (err) {
      return { id, ok: false, error: err.message || 'Failed to delete submission' };
    }
  }));
  return {
    deleted: results.filter((r) => r.ok).map((r) => r.id),
    failed: results.filter((r) => !r.ok).map(({ id, error }) => ({ id, error })),
  };
}

/** Public link for a survey: its QR code's target URL when one exists, else /survey?template=<id>. */
export function getSurveyPreviewUrl(qrCodes, templateId) {
  const surveyQrCode = (qrCodes || []).find((qr) =>
    qr.qrType === 'survey_template' && String(qr.targetId) === String(templateId));
  return surveyQrCode?.targetUrl || `/survey?template=${encodeURIComponent(templateId)}`;
}

/** Delete a survey template and all of its submissions; throws with the API's message on failure. */
export async function deleteSurveyTemplate(templateId) {
  const res = await apiFetch(`/api/surveys/templates?templateId=${encodeURIComponent(templateId)}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete survey template');
  return data;
}
