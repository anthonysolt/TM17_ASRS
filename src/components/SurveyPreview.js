'use client';

/**
 * Read-only preview of a survey as respondents see it. Inputs are disabled so
 * nothing can be submitted from here.
 *
 * Props:
 * - template: survey template from GET /api/surveys/templates/[id]
 */
const MULTI_SELECT_TYPES = new Set(['checkbox', 'multiselect']);
const INPUT_TYPES = { number: 'number', date: 'date', email: 'email', phone: 'tel', rating: 'number' };

const inputStyle = {
  width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E5E7EB', borderRadius: '8px',
  fontSize: '0.9rem', backgroundColor: '#F9FAFB', color: '#6B7280', boxSizing: 'border-box',
};

function optionLabels(text) {
  if (Array.isArray(text.optionDetails)) return text.optionDetails.map(option => option.label);
  return Array.isArray(text.options) ? text.options : [];
}

function PreviewInput({ text }) {
  const type = text.type || 'text';
  const options = optionLabels(text);

  if (type === 'select') {
    return (
      <select disabled style={inputStyle}>
        <option>Select an option…</option>
        {options.map(option => <option key={option}>{option}</option>)}
      </select>
    );
  }
  if (options.length > 0) {
    const inputType = MULTI_SELECT_TYPES.has(type) ? 'checkbox' : 'radio';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {options.map(option => (
          <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#374151' }}>
            <input type={inputType} disabled style={{ accentColor: '#E67E22' }} />
            {option}
          </label>
        ))}
      </div>
    );
  }
  if (type === 'textarea' || type === 'long_text') {
    return <textarea disabled rows={3} placeholder="Your answer" style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }} />;
  }
  return <input disabled type={INPUT_TYPES[type] || 'text'} placeholder="Your answer" style={inputStyle} />;
}

export default function SurveyPreview({ template }) {
  const questions = template?.questions || [];
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Preview</h3>
        <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Read-only: responses can&apos;t be submitted here</span>
      </div>
      <div style={{ maxWidth: '640px', margin: '0 auto', width: '100%' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 0.35rem' }}>{template?.title}</h2>
        {template?.description && (
          <p style={{ fontSize: '0.9rem', color: '#6B7280', margin: '0 0 1.25rem', lineHeight: 1.5 }}>{template.description}</p>
        )}
        {questions.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>No questions in this survey.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {questions.map((question, index) => {
              const text = question.text || question;
              return (
                <div key={question.id || index}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827', marginBottom: '0.4rem' }}>
                    {index + 1}. {text.question || text.label || 'Untitled'}
                    {text.required !== false && <span style={{ color: '#DC2626', marginLeft: '0.25rem' }}>*</span>}
                  </div>
                  {text.help_text && (
                    <div style={{ fontSize: '0.8rem', color: '#9CA3AF', marginBottom: '0.4rem' }}>{text.help_text}</div>
                  )}
                  <PreviewInput text={text} />
                </div>
              );
            })}
          </div>
        )}
        <button type="button" className="btn-primary" disabled style={{ marginTop: '1.5rem', opacity: 0.6, cursor: 'not-allowed' }}>
          Submit
        </button>
      </div>
    </div>
  );
}
