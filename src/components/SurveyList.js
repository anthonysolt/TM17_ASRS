'use client';

import { useEffect, useState } from 'react';
import SurveyCard from '@/components/SurveyCard';
import { apiFetch } from '@/lib/api/client';
import {
  responseCountFor,
  deleteSurveyTemplate,
  getSurveyPreviewUrl,
} from '@/lib/surveys/survey-admin-client';

/**
 * Survey entries as shown on the Surveys page and an initiative's Surveys tab:
 * Questions / Responses counts, Details, Edit, Preview (opens the survey's
 * public QR link when it has one) and Delete (survey + its responses).
 *
 * Props:
 * - templates: survey templates to list (include initiative_name for the meta line)
 * - responseCounts: { [templateId]: n } from GET /api/surveys/counts
 * - allowDelete: show Delete (default true)
 * - onChanged(): reload after a survey is deleted
 * - onNotify(message, type): show a success / 'error' message
 * - emptyState: shown when there are no templates
 */
export default function SurveyList({ templates, responseCounts = {}, allowDelete = true, onChanged, onNotify, emptyState = null }) {
  // QR codes give each survey its public link (the Preview button).
  const [qrCodes, setQrCodes] = useState([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/qr-codes?scope=survey')
      .then((res) => (res.ok ? res.json() : { qrCodes: [] }))
      .then((data) => { if (!cancelled) setQrCodes(data.qrCodes || []); })
      .catch(() => { if (!cancelled) setQrCodes([]); });
    return () => { cancelled = true; };
  }, []);

  async function handleDelete(templateId) {
    // SurveyCard asks for confirmation inline before calling this.
    try {
      await deleteSurveyTemplate(templateId);
      onNotify?.(`Survey template #${templateId} and related submissions deleted successfully.`);
      await onChanged?.();
    } catch (err) {
      onNotify?.(err.message || 'Unable to delete survey', 'error');
    }
  }

  if (!templates || templates.length === 0) return emptyState;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {templates.map((template) => (
        <SurveyCard
          key={template.id}
          template={template}
          responseCount={responseCountFor(responseCounts, template.id)}
          onView={(templateId) => window.location.assign(getSurveyPreviewUrl(qrCodes, templateId))}
          onDelete={allowDelete ? handleDelete : undefined}
        />
      ))}
    </div>
  );
}
