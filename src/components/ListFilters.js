'use client';

import { useId } from 'react';

// Filter controls shared by the Reports and Surveys list pages.

/** White bordered bar that holds list filters. */
export const FILTER_BAR_STYLE = {
  display: 'flex',
  gap: '0.75rem',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  marginBottom: '1.5rem',
  padding: '1rem 1.25rem',
  backgroundColor: '#fff',
  borderRadius: '10px',
  border: '1px solid #E5E7EB',
};

const labelStyle = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280',
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem',
};

/**
 * Labelled "Search" text box.
 *
 * Props: value, onChange(text), placeholder
 */
export default function SearchField({ value, onChange, placeholder = 'Search...' }) {
  const inputId = useId();
  return (
    <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
      <label htmlFor={inputId} style={labelStyle}>Search</label>
      <input
        id={inputId}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.875rem', backgroundColor: '#F9FAFB', boxSizing: 'border-box', outline: 'none' }}
        onFocus={(e) => { e.target.style.borderColor = '#E67E22'; }}
        onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; }}
      />
    </div>
  );
}

/**
 * Labelled dropdown for a filter bar. The '' option comes first.
 *
 * Props: label, value, onChange(value), options: [{ value, label }],
 *        emptyLabel (text of the '' option), disabled
 */
export function SelectFilter({ label, value, onChange, options = [], emptyLabel = 'All', disabled = false }) {
  const selectId = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label htmlFor={selectId} style={labelStyle}>{label}</label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB', minWidth: '180px', opacity: disabled ? 0.6 : 1 }}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * Labelled "Initiative" dropdown with an "All Initiatives" option ('' value).
 *
 * Props: value, onChange(id), initiatives: [{ id, name }], emptyLabel
 */
export function InitiativeFilter({ value, onChange, initiatives = [], emptyLabel = 'All Initiatives' }) {
  return (
    <SelectFilter
      label="Initiative"
      value={value}
      onChange={onChange}
      emptyLabel={emptyLabel}
      options={initiatives.map((init) => ({ value: String(init.id), label: init.name }))}
    />
  );
}

/**
 * Labelled date picker for a filter bar.
 *
 * Props: label, value (YYYY-MM-DD), onChange(value)
 */
export function DateFilter({ label, value, onChange }) {
  const inputId = useId();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label htmlFor={inputId} style={labelStyle}>{label}</label>
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}
      />
    </div>
  );
}

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name (A-Z)' },
];

/**
 * Sort order dropdown (newest / oldest / name).
 *
 * Props: value, onChange(sortKey)
 */
export function SortSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Sort order"
      style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.875rem', backgroundColor: '#F9FAFB', cursor: 'pointer' }}
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

/**
 * Comparator for Array.sort matching a SortSelect value.
 *
 * @param {string} sortBy 'newest' | 'oldest' | 'name'
 * @param {(item) => string} getDate item's date (ISO / date string)
 * @param {(item) => string} getName item's display name
 */
export function compareBySort(sortBy, getDate, getName) {
  return (a, b) => {
    if (sortBy === 'newest') return new Date(getDate(b)) - new Date(getDate(a));
    if (sortBy === 'oldest') return new Date(getDate(a)) - new Date(getDate(b));
    if (sortBy === 'name') return (getName(a) || '').localeCompare(getName(b) || '');
    return 0;
  };
}
