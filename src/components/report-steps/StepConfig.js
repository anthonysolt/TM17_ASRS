'use client';

import { REPORT_STATUS_OPTIONS } from '@/lib/report-status';

// Matches the selectable cards on the Questions and Goals steps.
function optionStyle(selected) {
  return {
    display: 'flex',
    alignItems: 'center',
    minHeight: '56px',
    padding: '0.85rem 1.25rem',
    border: `2px solid ${selected ? '#E67E22' : '#E5E7EB'}`,
    borderRadius: '10px',
    backgroundColor: selected ? 'rgba(230, 126, 34, 0.1)' : '#fff',
    color: '#111827',
    fontWeight: selected ? 600 : 500,
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, background-color 0.15s ease',
  };
}

const fieldStyle = {
  width: '100%',
  padding: '0.85rem 1.25rem',
  border: '2px solid #E5E7EB',
  borderRadius: '10px',
  backgroundColor: '#fff',
  color: '#111827',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
};

const sectionLabelStyle = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '0.5rem',
};

function highlightOnFocus(event) {
  event.target.style.borderColor = '#E67E22';
}

function clearOnBlur(event) {
  event.target.style.borderColor = '#E5E7EB';
}

/** Single-choice group of option cards (initiative, status). */
function OptionCards({ label, options, selectedValue, onSelect, columns }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: 'grid', gridTemplateColumns: columns, gap: '0.75rem' }}
    >
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <div
            key={option.value}
            role="radio"
            aria-checked={selected}
            tabIndex={0}
            onClick={() => onSelect(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(option.value);
              }
            }}
            style={optionStyle(selected)}
          >
            {option.label}
          </div>
        );
      })}
    </div>
  );
}

export default function StepConfig({ initiatives, reportConfig, onChange }) {
  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Report Configuration
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Select an initiative, provide a name for your report, and choose its status after generating.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Initiative */}
        <div>
          <label htmlFor="report-initiative" style={sectionLabelStyle}>Initiative *</label>
          <select
            id="report-initiative"
            style={{ ...fieldStyle, cursor: 'pointer' }}
            value={reportConfig.selectedInitiative?.id || ''}
            onChange={(e) => {
              const initiative = initiatives.find((i) => i.id === Number(e.target.value));
              onChange({ selectedInitiative: initiative });
            }}
            onFocus={highlightOnFocus}
            onBlur={clearOnBlur}
          >
            {initiatives.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>

        {/* Report Name */}
        <div>
          <label htmlFor="report-name" style={sectionLabelStyle}>Report Name *</label>
          <input
            id="report-name"
            style={fieldStyle}
            placeholder="e.g. Q2 Safety Trends"
            value={reportConfig.reportName}
            onChange={(e) => onChange({ reportName: e.target.value })}
            onFocus={highlightOnFocus}
            onBlur={clearOnBlur}
          />
        </div>

        {/* Status after generating — sits below Report Name */}
        <div>
          <span style={sectionLabelStyle}>Status After Generating *</span>
          <OptionCards
            label="Status after generating"
            options={REPORT_STATUS_OPTIONS}
            selectedValue={reportConfig.status || 'completed'}
            onSelect={(status) => onChange({ status })}
            columns="repeat(auto-fit, minmax(160px, 1fr))"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="report-description" style={sectionLabelStyle}>Description</label>
          <textarea
            id="report-description"
            rows={3}
            style={{ ...fieldStyle, resize: 'vertical' }}
            placeholder="Optional description for the report"
            value={reportConfig.description}
            onChange={(e) => onChange({ description: e.target.value })}
            onFocus={highlightOnFocus}
            onBlur={clearOnBlur}
          />
        </div>
      </div>

      {/*
      AI Insights (disabled)
      <div style={{ marginTop: '1.25rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={reportConfig.includeAiInsights || false}
            onChange={(e) => onChange({ includeAiInsights: e.target.checked })}
            style={{ width: '1rem', height: '1rem' }}
          />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            Include AI Analysis (GPT-4o)
          </span>
        </label>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: '0.3rem 0 0 1.5rem' }}>
          Generates a narrative summary, key insights, and recommendations. Adds ~10 seconds to report generation.
        </p>
      </div>
      */}
    </div>
  );
}
