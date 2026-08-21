'use client';

const METHODS = [
  { value: 'most_popular', label: 'Most Popular Answer' },
  { value: 'average', label: 'Average Answer' },
  { value: 'least_common', label: 'Least Common Answer' },
  { value: 'delta_halves', label: 'Half-to-Half Delta' },
  { value: 'linear_slope', label: 'Linear Slope' },
];

export default function StepQuestions({ reportConfig, onChange, questions, loading }) {
  const selections = reportConfig.questionSelections || [];

  function toggleQuestion(question) {
    const selected = selections.some((item) => item.id === question.id);
    onChange({
      questionSelections: selected
        ? selections.filter((item) => item.id !== question.id)
        : [...selections, { id: question.id, label: question.label, method: 'delta_halves', thresholdPct: 2 }],
    });
  }

  function updateMethod(questionId, method) {
    onChange({
      questionSelections: selections.map((item) =>
        item.id === questionId ? { ...item, method } : item
      ),
    });
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '1rem' }}>
        Select Survey Questions for Analysis
      </h2>

      {loading ? (
        <p style={{ color: '#6B7280' }}>Loading survey questions...</p>
      ) : questions.length === 0 ? (
        <p className="card" style={{ color: '#6B7280', padding: '1rem' }}>
          This initiative does not have any survey questions yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {questions.map((question) => {
            const selection = selections.find((item) => item.id === question.id);
            const selected = Boolean(selection);
            return (
              <div
                key={question.id}
                role="checkbox"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => toggleQuestion(question)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleQuestion(question);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  minHeight: '64px',
                  padding: '1rem 1.25rem',
                  border: `2px solid ${selected ? '#E67E22' : '#E5E7EB'}`,
                  borderRadius: '10px',
                  backgroundColor: selected ? 'rgba(230, 126, 34, 0.1)' : '#fff',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                }}
              >
                <span style={{ color: '#111827', fontWeight: selected ? 600 : 500 }}>
                  {question.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                  <label htmlFor={`question-method-${question.id}`} style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                    Analysis method
                  </label>
                  <select
                    id={`question-method-${question.id}`}
                    value={selection?.method || 'delta_halves'}
                    disabled={!selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => updateMethod(question.id, event.target.value)}
                    style={{
                      padding: '0.3rem 0.45rem',
                      borderRadius: '6px',
                      border: '1px solid #D1D5DB',
                      backgroundColor: selected ? '#fff' : '#F3F4F6',
                      fontSize: '0.78rem',
                    }}
                  >
                    {METHODS.map((method) => (
                      <option key={method.value} value={method.value}>{method.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
