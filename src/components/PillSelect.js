'use client';

import { useState } from 'react';

/**
 * Pill-styled dropdown that saves as soon as a new option is picked. When not
 * editable it renders the plain pill. Used for initiative Status / View and
 * report status.
 *
 * Props:
 * - value: current option value
 * - options: [{ value, label, pill }] where pill is a CSS class like 'pill-green'
 * - fallback: option shown when value isn't in options (kept selectable so it isn't lost)
 * - editable: show the dropdown instead of the plain pill
 * - onChange(nextValue): async save; the pill stays disabled until it settles
 * - ariaLabel, title: accessible name and tooltip for the dropdown
 */
export default function PillSelect({ value, options, fallback, editable, onChange, ariaLabel, title }) {
  const [saving, setSaving] = useState(false);
  const current = options.find((option) => option.value === value)
    || fallback
    || { value, label: String(value), pill: 'pill-yellow' };

  if (!editable) {
    return <span className={`pill ${current.pill}`}>{current.label}</span>;
  }

  async function handleChange(event) {
    const next = event.target.value;
    if (next === current.value) return;
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      className={`pill ${current.pill}`}
      value={current.value}
      onChange={handleChange}
      disabled={saving}
      aria-label={ariaLabel}
      title={title}
      style={{
        border: 'none',
        cursor: saving ? 'wait' : 'pointer',
        opacity: saving ? 0.6 : 1,
        fontFamily: 'inherit',
        paddingRight: '6px',
      }}
    >
      {!options.some((option) => option.value === current.value) && (
        <option value={current.value}>{current.label}</option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
