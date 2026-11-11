'use client';

import { useMemo, useState } from 'react';
import { applyQuestionFilters, isQuestionFilterActive } from '@/lib/report-engine';
import { describeQuestionFilter, getReportFilterOptions } from '@/lib/report-view-filters';
import { DateFilter } from '@/components/ListFilters';
import { describeDateRange, hasInvalidDateRange } from '@/lib/report-date-range';
import { getQuestionKind } from '@/lib/analysis-methods';

// Re-exported for the report builder page's Next-button check.
export { hasInvalidDateRange };

// New filters only affect their own question until switched to the whole report.
const DEFAULT_SCOPE = 'question';
const SCOPES = [
  { value: 'question', label: 'This question', hint: 'Only this question’s results are filtered. Other questions use all responses.' },
  { value: 'report', label: 'Whole report', hint: 'Every question only includes people whose answer here matches.' },
];

const TYPE_LABELS = {
  number: 'Number', rating: 'Rating', likert_agreement: 'Likert', likert_good_bad: 'Likert', likert_like_dislike: 'Likert',
  yesno: 'Yes / No', select: 'Dropdown', radio: 'Choice', choice: 'Choice', boolean: 'Yes / No',
  checkbox: 'Checkboxes', multiselect: 'Checkboxes', date: 'Date', email: 'Email', url: 'URL',
};
const typeLabel = (type) => TYPE_LABELS[type] || 'Text';

const ORANGE = '#E67E22';

function isRangeInvalid(filter) {
  return Number.isFinite(filter?.min) && Number.isFinite(filter?.max) && filter.min > filter.max;
}

export function hasInvalidQuestionFilter(selections = []) {
  return selections.some((selection) => isRangeInvalid(selection.filter));
}

function getObservedRange(tableData, column) {
  const nums = (tableData || [])
    .map((row) => row[column])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function parseBound(raw) {
  if (raw === '') return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

/** "3 – 5", "≥ 3", "Swimming, Running" — the short form shown on a collapsed row. */
function summarizeFilter(filter) {
  if (Array.isArray(filter.values)) return filter.values.join(', ');
  const hasMin = Number.isFinite(filter.min);
  const hasMax = Number.isFinite(filter.max);
  if (hasMin && hasMax) return `${filter.min} – ${filter.max}`;
  return hasMin ? `≥ ${filter.min}` : `≤ ${filter.max}`;
}

function SegmentedScope({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Filter applies to" style={{ display: 'inline-flex', border: '1px solid #D1D5DB', borderRadius: 8, overflow: 'hidden' }}>
      {SCOPES.map((scope) => {
        const selected = value === scope.value;
        return (
          <button
            key={scope.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(scope.value)}
            title={scope.hint}
            style={{
              padding: '0.3rem 0.75rem', border: 'none', fontSize: '0.8rem', cursor: 'pointer',
              fontWeight: selected ? 600 : 500,
              backgroundColor: selected ? ORANGE : '#fff',
              color: selected ? '#fff' : '#374151',
            }}
          >
            {scope.label}
          </button>
        );
      })}
    </div>
  );
}

export default function StepFilters({ reportConfig, onChange, questions, tableData }) {
  const selections = useMemo(
    () => reportConfig.questionSelections || [],
    [reportConfig.questionSelections]
  );
  const typesById = useMemo(
    () => new Map((questions || []).map((question) => [question.id, question.type])),
    [questions]
  );
  // Rows open for editing; a row with an invalid range always stays open.
  const [openIds, setOpenIds] = useState(() => new Set());

  const totalRows = tableData?.length || 0;
  const matchingRows = useMemo(() => applyQuestionFilters(
    tableData || [],
    selections.map((selection) => ({ column: selection.label, filter: selection.filter }))
  ).length, [tableData, selections]);
  const activeCount = selections.filter((selection) => isQuestionFilterActive(selection.filter)).length;

  const allResponses = !reportConfig.startDate && !reportConfig.endDate;

  function toggleOpen(id) {
    setOpenIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateFilter(questionId, nextFilter) {
    onChange({
      questionSelections: selections.map((item) =>
        item.id === questionId ? { ...item, filter: nextFilter } : item
      ),
    });
  }

  function toggleValue(selection, value) {
    const current = selection.filter?.values || [];
    const values = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    updateFilter(selection.id, { scope: selection.filter?.scope || DEFAULT_SCOPE, values });
  }

  function updateBound(selection, bound, raw) {
    const scope = selection.filter?.scope || DEFAULT_SCOPE;
    updateFilter(selection.id, { scope, min: selection.filter?.min, max: selection.filter?.max, [bound]: parseBound(raw) });
  }

  function updateScope(selection, scope) {
    updateFilter(selection.id, { ...(selection.filter || {}), scope });
  }

  const numberInputStyle = {
    width: '90px', padding: '0.35rem 0.45rem', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem',
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.35rem' }}>
        Filter Responses (Optional)
      </h2>
      <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
        Limit which responses the report uses, by date or by how people answered a question.
      </p>

      {/* ── Responses summary: date range + how many responses are left ── */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
          <DateFilter label="From" value={reportConfig.startDate || ''} onChange={(value) => onChange({ startDate: value })} />
          <DateFilter label="To" value={reportConfig.endDate || ''} onChange={(value) => onChange({ endDate: value })} />
          <button
            type="button"
            aria-pressed={allResponses}
            onClick={() => onChange({ startDate: '', endDate: '' })}
            title="Include every response, regardless of when it was submitted"
            className="btn-outline"
            style={{
              marginLeft: 'auto',
              padding: '0.5rem 0.9rem', fontSize: '0.85rem',
              ...(allResponses ? { borderColor: ORANGE, color: ORANGE, backgroundColor: '#FFF7ED', fontWeight: 600 } : {}),
            }}
          >
            {allResponses ? '✓ All responses' : 'All responses'}
          </button>
        </div>
        {hasInvalidDateRange(reportConfig) ? (
          <p style={{ fontSize: '0.8rem', color: '#DC2626', margin: '0.6rem 0 0 0' }}>
            The From date cannot be after the To date.
          </p>
        ) : (
          <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: '0.6rem 0 0 0' }}>
            {describeDateRange(reportConfig)}
          </p>
        )}
        <div style={{ borderTop: '1px solid #F3F4F6', marginTop: '0.75rem', paddingTop: '0.75rem', fontSize: '0.9rem', color: '#111827' }}>
          <strong>{matchingRows}</strong> of {totalRows} responses match all whole-report filters
          {activeCount > 0 && (
            <span style={{ color: '#6B7280' }}> · {activeCount} question filter{activeCount === 1 ? '' : 's'} set</span>
          )}
        </div>
      </div>

      {/* ── Per-question filters: one compact row each ── */}
      {selections.length === 0 ? (
        <p className="card" style={{ color: '#6B7280', padding: '1rem', margin: 0 }}>
          No survey questions are selected, so there are no question filters. The date range above still applies.
        </p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {selections.map((selection, index) => {
            const type = typesById.get(selection.id) || 'text';
            const isRange = getQuestionKind(type) === 'numeric';
            const filter = selection.filter;
            const active = isQuestionFilterActive(filter);
            const invalid = isRangeInvalid(filter);
            const scope = filter?.scope || DEFAULT_SCOPE;
            const open = openIds.has(selection.id) || invalid;
            const panelId = `filter-panel-${selection.id}`;

            return (
              <div key={selection.id} style={{ borderTop: index === 0 ? 'none' : '1px solid #F3F4F6' }}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggleOpen(selection.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.85rem 1.25rem', border: 'none', textAlign: 'left', cursor: 'pointer',
                    backgroundColor: open ? '#FFFBF5' : '#fff',
                    borderLeft: `3px solid ${active ? ORANGE : 'transparent'}`,
                  }}
                >
                  <span aria-hidden="true" style={{ color: '#9CA3AF', width: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>▸</span>
                  <span style={{ flex: 1, minWidth: 0, color: '#111827', fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selection.label}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#6B7280', backgroundColor: '#F3F4F6', borderRadius: 999, padding: '0.1rem 0.5rem', flexShrink: 0 }}>
                    {typeLabel(type)}
                  </span>
                  {active ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, maxWidth: '45%' }}>
                      <span style={{ fontSize: '0.85rem', color: invalid ? '#DC2626' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {summarizeFilter(filter)}
                      </span>
                      <span className={scope === 'report' ? 'pill pill-orange' : 'pill pill-gray'} style={{ fontSize: '0.7rem' }}>
                        {scope === 'report' ? 'Whole report' : 'This question'}
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.82rem', color: open ? '#9CA3AF' : ORANGE, fontWeight: 500, flexShrink: 0 }}>
                      {open ? 'No filter' : '+ Add filter'}
                    </span>
                  )}
                </button>

                {open && (
                  <div id={panelId} style={{ padding: '0.25rem 1.25rem 1rem 2.6rem', backgroundColor: '#FFFBF5' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>Applies to</span>
                      <SegmentedScope value={scope} onChange={(value) => updateScope(selection, value)} />
                    </div>

                    {isRange ? (
                      <RangeEditor
                        filter={filter}
                        observed={getObservedRange(tableData, selection.label)}
                        inputStyle={numberInputStyle}
                        onChange={(bound, raw) => updateBound(selection, bound, raw)}
                      />
                    ) : (
                      <AnswerChips
                        options={getReportFilterOptions(tableData || [], [selection.label])[selection.label] || []}
                        selected={filter?.values || []}
                        onToggle={(value) => toggleValue(selection, value)}
                      />
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                      <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: 0, flex: 1, minWidth: 200 }}>
                        {active
                          ? `${scope === 'report' ? 'Every question only includes people whose answer here' : 'Only this question counts answers that'} ${describeQuestionFilter(filter)}.`
                          : SCOPES.find((item) => item.value === scope).hint}
                      </p>
                      {active && (
                        <button
                          type="button"
                          onClick={() => updateFilter(selection.id, null)}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.8rem', color: '#C0392B', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RangeEditor({ filter, observed, inputStyle, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          Min
          <input
            type="number"
            value={filter?.min ?? ''}
            placeholder={observed ? String(observed.min) : ''}
            onChange={(event) => onChange('min', event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: '0.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          Max
          <input
            type="number"
            value={filter?.max ?? ''}
            placeholder={observed ? String(observed.max) : ''}
            onChange={(event) => onChange('max', event.target.value)}
            style={inputStyle}
          />
        </label>
        <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>
          {observed ? `Responses range ${observed.min}–${observed.max}` : 'No responses yet'}
        </span>
      </div>
      {isRangeInvalid(filter) && (
        <p style={{ fontSize: '0.8rem', color: '#DC2626', margin: '0.5rem 0 0 0' }}>
          Min cannot be greater than max.
        </p>
      )}
    </div>
  );
}

function AnswerChips({ options, selected, onToggle }) {
  if (options.length === 0) {
    return <p style={{ fontSize: '0.85rem', color: '#9CA3AF', margin: 0 }}>No responses to filter on yet.</p>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: 180, overflowY: 'auto' }}>
      {options.map((option) => {
        const checked = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={checked}
            onClick={() => onToggle(option)}
            style={{
              padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.82rem', cursor: 'pointer',
              border: `1px solid ${checked ? ORANGE : '#D1D5DB'}`,
              backgroundColor: checked ? ORANGE : '#fff',
              color: checked ? '#fff' : '#374151',
              fontWeight: checked ? 600 : 400,
            }}
          >
            {checked ? '✓ ' : ''}{option}
          </button>
        );
      })}
    </div>
  );
}
