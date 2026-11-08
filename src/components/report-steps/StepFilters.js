'use client';

import { useMemo } from 'react';
import { applyQuestionFilters, isQuestionFilterActive } from '@/lib/report-engine';
import { describeQuestionFilter, getReportFilterOptions } from '@/lib/report-view-filters';
import { DateFilter } from '@/components/ListFilters';
import { describeDateRange, hasInvalidDateRange } from '@/lib/report-date-range';

// Re-exported for the report builder page's Next-button check.
export { hasInvalidDateRange };

const RANGE_TYPES = ['rating', 'number'];

const SCOPE_EXPLANATIONS = {
  report: { name: 'Report', text: 'Applies the filter to all report questions and survey responses.' },
  question: { name: 'Question', text: 'Applies the filter only to the selected question.' },
};

// Dropdown order. New filters default to the question scope.
const SCOPE_OPTION_ORDER = ['question', 'report'];
const DEFAULT_SCOPE = 'question';

function describeScopeEffect(filter, active) {
  if (!active) {
    return 'No filter set. Pick answers or a range, then choose whether it applies to the whole report or just this question.';
  }
  const description = describeQuestionFilter(filter);
  const match = Array.isArray(filter.values) ? description : `is ${description}`;
  if (filter.scope === 'question') {
    return `Question filter: only this question’s results will count responses where the answer ${match}. Other questions use all responses.`;
  }
  return `Report filter: every question in this report will only include people whose answer here ${match}.`;
}

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

export default function StepFilters({ reportConfig, onChange, questions, tableData }) {
  const selections = useMemo(
    () => reportConfig.questionSelections || [],
    [reportConfig.questionSelections]
  );
  const typesById = useMemo(
    () => new Map((questions || []).map((question) => [question.id, question.type])),
    [questions]
  );

  const totalRows = tableData?.length || 0;
  const matchingRows = useMemo(() => applyQuestionFilters(
    tableData || [],
    selections.map((selection) => ({ column: selection.label, filter: selection.filter }))
  ).length, [tableData, selections]);

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
    const next = { scope, min: selection.filter?.min, max: selection.filter?.max, [bound]: parseBound(raw) };
    updateFilter(selection.id, next);
  }

  function updateScope(selection, scope) {
    updateFilter(selection.id, { ...(selection.filter || {}), scope });
  }

  const numberInputStyle = {
    width: '110px',
    padding: '0.35rem 0.45rem',
    borderRadius: '6px',
    border: '1px solid #D1D5DB',
    fontSize: '0.85rem',
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Filter Question Responses (Optional)
      </h2>
      <div style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1rem' }}>
        <p style={{ margin: '0 0 0.5rem 0' }}>
          Add filters to questions and select the scope you would like the filter to affect.
        </p>
        <dl style={{ margin: 0 }}>
          {Object.entries(SCOPE_EXPLANATIONS).map(([value, { name, text }]) => (
            <div key={value} style={{ display: 'flex', flexWrap: 'wrap', gap: '0 0.4rem', padding: '0.15rem 0' }}>
              <dt style={{ fontWeight: 700, color: '#111827' }}>{name}:</dt>
              <dd style={{ margin: 0 }}>{text}</dd>
            </div>
          ))}
        </dl>
      </div>
      {/* Response date range: limits every part of the report to responses submitted in it */}
      <div style={{
        padding: '1rem 1.25rem', marginBottom: '1.25rem', borderRadius: '10px', backgroundColor: '#fff',
        border: `2px solid ${reportConfig.startDate || reportConfig.endDate ? '#E67E22' : '#E5E7EB'}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <span style={{ color: '#111827', fontWeight: 600 }}>Response Date Range</span>
          {(reportConfig.startDate || reportConfig.endDate) && (
            <button
              type="button"
              onClick={() => onChange({ startDate: '', endDate: '' })}
              style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.8rem', color: '#6B7280', cursor: 'pointer' }}
            >
              Clear dates
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <DateFilter label="From" value={reportConfig.startDate || ''} onChange={(value) => onChange({ startDate: value })} />
          <DateFilter label="To" value={reportConfig.endDate || ''} onChange={(value) => onChange({ endDate: value })} />
        </div>
        {hasInvalidDateRange(reportConfig) ? (
          <p style={{ fontSize: '0.8rem', color: '#DC2626', margin: '0.5rem 0 0 0' }}>
            The From date cannot be after the To date.
          </p>
        ) : (
          <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: '0.75rem 0 0 0' }}>
            {describeDateRange(reportConfig)}
          </p>
        )}
      </div>

      {selections.length === 0 ? (
        <p className="card" style={{ color: '#6B7280', padding: '1rem' }}>
          No survey questions are selected, so there are no question filters. The date range above still applies.
        </p>
      ) : (
        <p style={{ color: '#111827', fontSize: '0.88rem', fontWeight: 600, marginBottom: '1.25rem' }}>
          {matchingRows} of {totalRows} people meet all report filters
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {selections.map((selection) => {
          const type = typesById.get(selection.id) || 'text';
          const isRange = RANGE_TYPES.includes(type);
          const filter = selection.filter;
          const active = isQuestionFilterActive(filter);
          const scope = filter?.scope || DEFAULT_SCOPE;
          const options = isRange ? [] : (getReportFilterOptions(tableData || [], [selection.label])[selection.label] || []);
          const observed = isRange ? getObservedRange(tableData, selection.label) : null;

          return (
            <div
              key={selection.id}
              style={{
                padding: '1rem 1.25rem',
                border: `2px solid ${active ? '#E67E22' : '#E5E7EB'}`,
                borderRadius: '10px',
                backgroundColor: '#fff',
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#111827', fontWeight: 600 }}>{selection.label}</span>
                  <span style={{
                    fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em',
                    padding: '0.1rem 0.45rem', borderRadius: '999px',
                    backgroundColor: '#F3F4F6', color: '#6B7280',
                  }}>
                    {type}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {/* Hidden (not removed) while inactive so the dropdown doesn't shift */}
                  <button
                    type="button"
                    onClick={() => updateFilter(selection.id, null)}
                    disabled={!active}
                    aria-hidden={!active}
                    aria-label={`Remove filter for ${selection.label}`}
                    title="Remove filter"
                    style={{
                      visibility: active ? 'visible' : 'hidden',
                      width: '26px', height: '26px', padding: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      border: 'none', background: 'none', color: '#C0392B',
                      fontSize: '1.25rem', fontWeight: 700, lineHeight: 1, cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
                    Filter Scope
                    <select
                      value={scope}
                      onChange={(event) => updateScope(selection, event.target.value)}
                      title={SCOPE_EXPLANATIONS[scope].text}
                      style={{
                        padding: '0.3rem 0.5rem', borderRadius: '6px',
                        border: '1px solid #D1D5DB', backgroundColor: '#fff',
                        fontSize: '0.82rem', color: '#111827', cursor: 'pointer',
                      }}
                    >
                      {SCOPE_OPTION_ORDER.map((value) => (
                        <option key={value} value={value}>{SCOPE_EXPLANATIONS[value].name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {isRange ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      Min{' '}
                      <input
                        type="number"
                        value={filter?.min ?? ''}
                        placeholder={observed ? String(observed.min) : ''}
                        onChange={(event) => updateBound(selection, 'min', event.target.value)}
                        style={numberInputStyle}
                      />
                    </label>
                    <label style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      Max{' '}
                      <input
                        type="number"
                        value={filter?.max ?? ''}
                        placeholder={observed ? String(observed.max) : ''}
                        onChange={(event) => updateBound(selection, 'max', event.target.value)}
                        style={numberInputStyle}
                      />
                    </label>
                    {observed && (
                      <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>
                        Responses range from {observed.min} to {observed.max}
                      </span>
                    )}
                  </div>
                  {isRangeInvalid(filter) && (
                    <p style={{ fontSize: '0.8rem', color: '#DC2626', margin: '0.5rem 0 0 0' }}>
                      Min cannot be greater than max.
                    </p>
                  )}
                </div>
              ) : options.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: '#9CA3AF', margin: 0 }}>
                  No responses to filter on yet.
                </p>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '0.35rem',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}>
                  {options.map((option) => {
                    const checked = (filter?.values || []).includes(option);
                    return (
                      <label
                        key={option}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.35rem 0.55rem', borderRadius: '6px', fontSize: '0.85rem',
                          cursor: 'pointer',
                          border: `1px solid ${checked ? '#E67E22' : 'transparent'}`,
                          backgroundColor: checked ? '#fff' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleValue(selection, option)}
                          style={{ accentColor: '#E67E22' }}
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              )}

              <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: '0.75rem 0 0 0' }}>
                {describeScopeEffect({ ...filter, scope }, active)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
