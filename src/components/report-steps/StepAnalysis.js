'use client';

const METHODS = [
  { value: 'delta_halves', label: 'Half-to-Half Delta' },
  { value: 'linear_slope', label: 'Linear Slope' },
];

function MethodSelect({ value, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
      <span style={{ color: '#6B7280' }}>Analysis method</span>
      <select
        aria-label={`Analysis method for ${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        style={{
          padding: '0.4rem 0.55rem', borderRadius: '7px', border: '1px solid #D1D5DB',
          backgroundColor: '#fff', color: '#111827', fontSize: '0.82rem',
        }}
      >
        {METHODS.map((method) => (
          <option key={method.value} value={method.value}>{method.label}</option>
        ))}
      </select>
    </label>
  );
}

function selectionFor(selections, id) {
  return selections.find((selection) => Number(selection.id) === Number(id));
}

export default function StepAnalysis({ reportConfig, reportOptions, isLoading, error, onChange }) {
  const analysis = reportConfig.analysisSelections || { attributes: [], questions: [] };
  const selectedAttributes = analysis.attributes || [];
  const selectedQuestions = analysis.questions || [];

  function toggle(kind, id) {
    const current = kind === 'attributes' ? selectedAttributes : selectedQuestions;
    const existing = selectionFor(current, id);
    const next = existing
      ? current.filter((selection) => Number(selection.id) !== Number(id))
      : [...current, { id: Number(id), method: 'delta_halves', thresholdPct: 2 }];
    onChange({
      analysisSelections: { ...analysis, [kind]: next },
    });
  }

  function updateMethod(kind, id, method) {
    const current = kind === 'attributes' ? selectedAttributes : selectedQuestions;
    onChange({
      analysisSelections: {
        ...analysis,
        [kind]: current.map((selection) =>
          Number(selection.id) === Number(id) ? { ...selection, method } : selection
        ),
      },
    });
  }

  if (isLoading) {
    return <p style={{ color: '#6B7280', padding: '2rem 0', textAlign: 'center' }}>Loading report options...</p>;
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.4rem' }}>
        Select Report Analysis
      </h2>
      <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
        Choose attributes, individual questions, or both for this report.
      </p>

      {error && (
        <p role="alert" style={{ color: '#B91C1C', background: '#FEF2F2', padding: '0.75rem', borderRadius: '8px' }}>
          {error}
        </p>
      )}

      <section aria-labelledby="attribute-selection-heading" style={{ marginBottom: '2rem' }}>
        <h3 id="attribute-selection-heading" style={{ fontSize: '1rem', fontWeight: 650, margin: '0 0 0.3rem' }}>
          Select an Attribute:
        </h3>
        <p style={{ color: '#6B7280', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          This report will analyze all questions with this attribute for this initiative
        </p>

        {reportOptions.attributes.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: '0.88rem' }}>No attributes are attached to this initiative.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(245px, 1fr))', gap: '0.75rem' }}>
            {reportOptions.attributes.map((attribute) => {
              const selected = selectionFor(selectedAttributes, attribute.id);
              return (
                <div
                  key={attribute.id}
                  role="checkbox"
                  aria-checked={Boolean(selected)}
                  tabIndex={0}
                  onClick={() => toggle('attributes', attribute.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggle('attributes', attribute.id);
                    }
                  }}
                  style={{
                    border: `2px solid ${selected ? '#E67E22' : '#E5E7EB'}`,
                    backgroundColor: selected ? '#FFF4E8' : '#fff',
                    borderRadius: '10px', padding: '0.9rem', cursor: 'pointer',
                    transition: 'background-color 150ms ease, border-color 150ms ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: selected ? '0.75rem' : 0 }}>
                    <div>
                      <div style={{ fontWeight: 650, color: '#111827' }}>{attribute.name}</div>
                      <div style={{ color: '#6B7280', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                        {attribute.questionCount} {attribute.questionCount === 1 ? 'question' : 'questions'}
                      </div>
                    </div>
                    <span aria-hidden="true" style={{ color: selected ? '#E67E22' : '#9CA3AF', fontWeight: 700 }}>
                      {selected ? '✓' : '+'}
                    </span>
                  </div>
                  {selected && (
                    <MethodSelect
                      label={attribute.name}
                      value={selected.method}
                      onChange={(method) => updateMethod('attributes', attribute.id, method)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="question-selection-heading" style={{ borderTop: '1px solid #E5E7EB', paddingTop: '1.5rem' }}>
        <h3 id="question-selection-heading" style={{ fontSize: '1rem', fontWeight: 650, margin: '0 0 0.3rem' }}>
          Select Individual Questions:
        </h3>
        <p style={{ color: '#6B7280', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          Select any question you want to analyze independently.
        </p>

        {reportOptions.questions.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: '0.88rem' }}>No questions are attached to this initiative.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {reportOptions.questions.map((question) => {
              const selected = selectionFor(selectedQuestions, question.id);
              return (
                <div
                  key={question.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                    border: `1px solid ${selected ? '#E67E22' : '#E5E7EB'}`,
                    backgroundColor: selected ? '#FFFAF5' : '#fff', borderRadius: '9px',
                    padding: '0.75rem 0.85rem',
                  }}
                >
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ color: '#111827', fontSize: '0.9rem' }}>{question.label}</div>
                    {question.attributeName && (
                      <div style={{ color: '#6B7280', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                        Attribute: {question.attributeName}
                      </div>
                    )}
                  </div>
                  {selected && (
                    <MethodSelect
                      label={question.label}
                      value={selected.method}
                      onChange={(method) => updateMethod('questions', question.id, method)}
                    />
                  )}
                  <input
                    type="checkbox"
                    aria-label={`Select ${question.label}`}
                    checked={Boolean(selected)}
                    onChange={() => toggle('questions', question.id)}
                    style={{ width: '18px', height: '18px', accentColor: '#E67E22', cursor: 'pointer', marginLeft: 'auto' }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
