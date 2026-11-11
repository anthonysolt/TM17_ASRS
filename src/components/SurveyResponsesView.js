'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SubmissionsDataTable from '@/components/SubmissionsDataTable';
import { InitiativeFilter, SelectFilter } from '@/components/ListFilters';
import { apiFetch } from '@/lib/api/client';
import { deleteSubmissions } from '@/lib/surveys/survey-admin-client';

// Responses loaded per request for one survey's table (more load on demand).
const SURVEY_PAGE_SIZE = 100;

/**
 * Survey responses in one card, as a table: every response is a row with one
 * column per question of the chosen survey (or, in the recent list, the shared
 * ID / Survey / Submitted columns). Tick rows (or the header box for all) and
 * use "Delete selected" to remove them.
 *
 * Responses are loaded from /api/surveys a page at a time (filtered on the
 * server), so pages never download every response; "Load more" fetches the
 * next page. Sorting a column sorts the responses loaded so far.
 *
 * Used by a survey's Responses tab, an initiative's Submissions tab and the
 * Surveys > Survey Responses tab. Which pickers appear depends on the props:
 * - one survey in `templates` and no `initiatives`: no pickers
 * - several surveys: a Survey picker
 * - `initiatives` given: an Initiative picker that narrows the Survey picker
 *
 * Props:
 * - templates: the surveys that can be shown
 * - initiatives: [{ id, name }] for the Initiative picker (optional)
 * - initiativeId: limit the recent list to one initiative (when there is no picker)
 * - onDeleted(ids): called after responses are deleted (e.g. to update counts)
 * - allowDelete: show the checkboxes and "Delete selected" (default true)
 * - onNotify(message, type): show a success / 'error' message
 * - recentPageSize: when no survey is chosen, list the most recent responses
 *   this many at a time; omit to ask the user to pick a survey instead
 */
export default function SurveyResponsesView({
  templates = [],
  initiatives,
  initiativeId: scopeInitiativeId = null,
  onDeleted,
  allowDelete = true,
  onNotify,
  recentPageSize,
}) {
  const [initiativeId, setInitiativeId] = useState('');
  const [chosenTemplateId, setChosenTemplateId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  // Loaded responses for the current view, and how many match in total.
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestSeq = useRef(0);

  const showInitiativePicker = Array.isArray(initiatives);
  // Only initiatives that have surveys; the Survey list narrows to the chosen initiative.
  const initiativeOptions = showInitiativePicker
    ? initiatives.filter((init) => templates.some((t) => String(t.initiative_id) === String(init.id)))
    : [];
  const surveyOptions = initiativeId
    ? templates.filter((t) => String(t.initiative_id) === String(initiativeId))
    : templates;
  const showSurveyPicker = showInitiativePicker || templates.length > 1;
  // With a single survey to choose from, it is shown straight away.
  const templateId = chosenTemplateId || (surveyOptions.length === 1 ? String(surveyOptions[0].id) : '');
  const template = surveyOptions.find((t) => String(t.id) === String(templateId)) || null;

  const templatesById = useMemo(() => Object.fromEntries(templates.map((t) => [String(t.id), t])), [templates]);

  // No survey chosen: the most recent responses (narrowed to an initiative).
  const showRecent = !template && Boolean(recentPageSize) && templates.length > 0;
  const recentInitiativeId = initiativeId || scopeInitiativeId || '';
  const pageSize = template ? SURVEY_PAGE_SIZE : recentPageSize;
  const viewKey = template ? `survey:${template.id}` : showRecent ? `recent:${recentInitiativeId}` : '';
  const templateKey = template ? String(template.id) : '';

  const fetchPage = useCallback(async (offset) => {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (templateKey) params.set('templateId', templateKey);
    else if (recentInitiativeId) params.set('initiativeId', String(recentInitiativeId));
    const res = await apiFetch(`/api/surveys?${params}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Could not load responses (server responded ${res.status})`);
    return { surveys: Array.isArray(body.surveys) ? body.surveys : [], total: Number(body.total) || 0 };
  }, [templateKey, recentInitiativeId, pageSize]);

  // Load the first page whenever the view (survey or recent scope) changes.
  useEffect(() => {
    const seq = ++requestSeq.current;
    setRows([]);
    setTotal(0);
    setSelectedIds([]);
    setLoadError('');
    if (!viewKey) return;
    setLoading(true);
    fetchPage(0)
      .then((page) => {
        if (seq !== requestSeq.current) return; // a newer view replaced this one
        setRows(page.surveys);
        setTotal(page.total);
      })
      .catch((err) => { if (seq === requestSeq.current) setLoadError(err.message); })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
  }, [viewKey, fetchPage]);

  async function loadMore() {
    const seq = requestSeq.current;
    setLoading(true);
    try {
      const page = await fetchPage(rows.length);
      if (seq !== requestSeq.current) return;
      // Skip rows already shown (a response may shift pages if others were added).
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.surveys.filter((r) => !seen.has(r.id))];
      });
      setTotal(page.total);
    } catch (err) {
      if (seq === requestSeq.current) onNotify?.(err.message, 'error');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  // Only rows still in the table count (e.g. after switching survey or deleting).
  const visibleIds = new Set(rows.map((s) => s.id));
  const selected = selectedIds.filter((id) => visibleIds.has(id));
  const canDelete = allowDelete;

  function handleInitiativeChange(nextId) {
    setInitiativeId(nextId);
    setChosenTemplateId('');
  }

  async function deleteSelected() {
    if (selected.length === 0) return;
    const label = selected.length === 1 ? `response #${selected[0]}` : `${selected.length} responses`;
    if (!confirm(`Delete ${label}? This permanently deletes the answers and cannot be undone.`)) return;
    setDeleting(true);
    try {
      const { deleted, failed } = await deleteSubmissions(selected);
      if (deleted.length) {
        const removed = new Set(deleted);
        setRows((prev) => prev.filter((r) => !removed.has(r.id)));
        setTotal((prev) => Math.max(0, prev - deleted.length));
        onDeleted?.(deleted);
        onNotify?.(deleted.length === 1 ? `Response #${deleted[0]} removed.` : `${deleted.length} responses removed.`);
      }
      if (failed.length) {
        // Group by message so different errors are all reported, not just the first.
        const byMessage = new Map();
        failed.forEach((f) => byMessage.set(f.error, [...(byMessage.get(f.error) || []), `#${f.id}`]));
        const details = [...byMessage].map(([message, ids]) => `${ids.join(', ')}: ${message}`).join('; ');
        onNotify?.(`Could not delete ${details}. They are still selected so you can try again.`, 'error');
      }
      // Keep the failed rows ticked for a retry; deleted rows drop out on their own.
      setSelectedIds(failed.map((f) => f.id));
    } finally {
      setDeleting(false);
    }
  }

  const placeholder = showInitiativePicker
    ? 'Pick an initiative and a survey above to see its responses, one row per response.'
    : 'Pick a survey above to see its responses, one row per response.';

  let countLabel = '';
  if (loading && rows.length === 0) countLabel = 'Loading…';
  else if (total > rows.length) countLabel = `Showing ${rows.length} of ${total}`;
  else countLabel = `${total} response${total !== 1 ? 's' : ''}`;
  if (showRecent && total > rows.length && !(loading && rows.length === 0)) countLabel = `Most recent: ${countLabel.charAt(0).toLowerCase()}${countLabel.slice(1)}`;

  const remaining = Math.max(0, total - rows.length);
  const loadMoreButton = viewKey && remaining > 0 && !loadError ? (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem', borderTop: '1px solid #F3F4F6' }}>
      <button type="button" className="btn-outline" onClick={loadMore} disabled={loading}>
        {loading ? 'Loading…' : `Load more (${Math.min(pageSize, remaining)} more)`}
      </button>
    </div>
  ) : null;

  const tableProps = {
    submissions: rows,
    embedded: true,
    selectedIds: canDelete ? selected : undefined,
    onSelectionChange: canDelete ? setSelectedIds : undefined,
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header: title + selection actions (left), pickers and response count (right) */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
        padding: '1rem 1.25rem', borderBottom: '1px solid #E5E7EB',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', minHeight: 36 }}>
          <h3 className="card-title" style={{ margin: 0 }}>Responses</h3>
          {canDelete && selected.length > 0 && (
            <>
              <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>{selected.length} selected</span>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={deleting}
                style={{
                  padding: '0.4rem 0.85rem', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 500,
                  border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#991b1b',
                  cursor: deleting ? 'wait' : 'pointer', opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deleting…' : `Delete selected (${selected.length})`}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                disabled={deleting}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.8rem', color: '#6B7280', cursor: 'pointer' }}
              >
                Clear
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {showInitiativePicker && (
            <InitiativeFilter value={initiativeId} onChange={handleInitiativeChange} initiatives={initiativeOptions} />
          )}
          {showSurveyPicker && (
            <SelectFilter
              label="Survey"
              value={templateId}
              onChange={setChosenTemplateId}
              options={surveyOptions.map((t) => ({ value: String(t.id), label: t.title }))}
              emptyLabel={recentPageSize ? 'All surveys' : 'Select a survey'}
            />
          )}
          {viewKey && (
            <span style={{ fontSize: '0.8rem', color: '#6B7280', paddingBottom: '0.5rem', whiteSpace: 'nowrap' }}>
              {countLabel}
            </span>
          )}
        </div>
      </div>

      {loadError ? (
        <p style={{ color: '#B91C1C', textAlign: 'center', padding: '2rem 1.5rem', margin: 0 }}>{loadError}</p>
      ) : template ? (
        <>
          <SubmissionsDataTable
            {...tableProps}
            template={template}
            emptyMessage={loading ? 'Loading responses…' : 'No responses yet for this survey.'}
          />
          {loadMoreButton}
        </>
      ) : showRecent ? (
        <>
          <SubmissionsDataTable
            {...tableProps}
            templatesById={templatesById}
            emptyMessage={loading ? 'Loading responses…' : 'No responses yet.'}
            paginate={false}
          />
          {loadMoreButton}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: '#9CA3AF' }}>
          {templates.length === 0 ? (
            <p style={{ fontSize: '1.05rem', margin: 0 }}>No surveys yet.</p>
          ) : (
            <>
              <p style={{ fontSize: '1.05rem', margin: '0 0 0.5rem' }}>Choose a survey</p>
              <p style={{ fontSize: '0.9rem', margin: 0 }}>{placeholder}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
