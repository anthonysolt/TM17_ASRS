'use client';

import { useMemo, useState } from 'react';
import DataTable from '@/components/DataTable';

// Stable default so the memoized rows aren't rebuilt on every render.
const NO_TEMPLATES = {};

function formatDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

function formatAnswer(val) {
  if (val === undefined || val === null || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return Array.isArray(val) ? val.join(', ') : String(val);
}

/** A question's key in a response's answers: its root id, shared by every revision. */
const answerKey = (question) => question.rootId ?? question.id;

function compareValues(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && a != null && b != null && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Table view of submissions: one row per submission. With a `template`, the
 * columns are ID, Submitted, then one per question (in the survey's order);
 * without one (submissions from several surveys), they are ID, Survey and
 * Submitted. A Respondent column is added when any row came from a logged-in
 * user. Responses are otherwise anonymous and identified by their ID.
 * Click a header to sort.
 * Uses the shared DataTable, so it pages and looks like report data tables.
 *
 * Props:
 * - submissions: /api/surveys responses to show (one survey's when `template` is set);
 *   answers are keyed by question root id
 * - template: the survey template (its questions become the columns); optional
 * - templatesById: { [id]: template } for the Survey column when there is no template
 * - title: card heading
 * - emptyMessage: shown when there are no submissions
 * - embedded: render without its own card (inside another card)
 * - selectedIds, onSelectionChange: optional checkbox selection (submission ids)
 * - paginate: pass false to show every row (no pager), e.g. with a Load more button
 */
export default function SubmissionsDataTable({ submissions, template, title = 'All Responses', emptyMessage = 'No submissions yet for this survey.', embedded = false, selectedIds, onSelectionChange, templatesById = NO_TEMPLATES, paginate = true }) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState(null);

  const { columns, columnLabels, rows } = useMemo(() => {
    const questions = template?.questions || [];
    const questionKeys = questions.map((q) => `q_${answerKey(q)}`);
    const labels = { submissionId: 'ID', survey: 'Survey', respondent: 'Respondent', submittedAt: 'Submitted' };
    const surveyTitle = (s) => templatesById[String(s.templateId)]?.title || s.templateTitle || 'N/A';
    questions.forEach((q, qi) => {
      const text = q.text || q;
      labels[`q_${answerKey(q)}`] = `Q${qi + 1}: ${text.question || text.label || 'Question'}`;
    });
    const showRespondent = (submissions || []).some((s) => s.respondent);

    const tableRows = (submissions || []).map((s) => {
      const answers = s.answers || {};
      const display = {
        id: s.id,
        submissionId: `#${s.id}`,
        ...(template ? {} : { survey: surveyTitle(s) }),
        ...(showRespondent ? { respondent: s.respondent || 'Anonymous' } : {}),
        submittedAt: formatDateTime(s.submittedAt),
      };
      // Raw values for sorting (dates and numbers sort by value, not by display text).
      const sortValues = { submissionId: s.id, survey: template ? null : surveyTitle(s), respondent: s.respondent, submittedAt: new Date(s.submittedAt || 0).getTime() };
      questions.forEach((q) => {
        const value = answers[answerKey(q)];
        display[`q_${answerKey(q)}`] = formatAnswer(value);
        sortValues[`q_${answerKey(q)}`] = Array.isArray(value) ? value.join(', ') : value;
      });
      return { display, sortValues };
    });

    const respondentColumn = showRespondent ? ['respondent'] : [];
    return {
      columns: template
        ? ['submissionId', ...respondentColumn, 'submittedAt', ...questionKeys]
        : ['submissionId', 'survey', ...respondentColumn, 'submittedAt'],
      columnLabels: labels,
      rows: tableRows,
    };
  }, [submissions, template, templatesById]);

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return rows.map((r) => r.display);
    const sorted = [...rows].sort((a, b) => compareValues(a.sortValues[sortColumn], b.sortValues[sortColumn]));
    if (sortDirection === 'desc') sorted.reverse();
    return sorted.map((r) => r.display);
  }, [rows, sortColumn, sortDirection]);

  // Header clicks cycle: ascending -> descending -> unsorted.
  function handleSortChange(col) {
    if (sortColumn !== col) { setSortColumn(col); setSortDirection('asc'); return; }
    if (sortDirection === 'asc') { setSortDirection('desc'); return; }
    setSortColumn(null);
    setSortDirection(null);
  }

  if (rows.length === 0) {
    const message = <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem', margin: 0 }}>{emptyMessage}</p>;
    return embedded ? message : <div className="card">{message}</div>;
  }

  return (
    <DataTable
      title={title}
      data={sortedData}
      columns={columns}
      columnLabels={columnLabels}
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      onSortChange={handleSortChange}
      embedded={embedded}
      paginate={paginate}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
    />
  );
}
