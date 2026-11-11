'use client';

import {
  getDefaultMethodForQuestion,
  getMethodsForQuestion,
  methodNeedsAnswer,
} from '@/lib/analysis-methods';

/** True when a selected answer-based method has no target answer yet. */
export function hasMissingTargetAnswer(selections = []) {
  return selections.some((item) => methodNeedsAnswer(item.method) && !String(item.answer || '').trim());
}

const controlStyle = {
  padding: '0.3rem 0.45rem',
  borderRadius: '6px',
  border: '1px solid #D1D5DB',
  fontSize: '0.78rem',
};

export default function StepQuestions({ reportConfig, onChange, questions, loading }) {
  const selections = reportConfig.questionSelections || [];

  function toggleQuestion(question) {
    const selected = selections.some((item) => item.id === question.id);
    onChange({
      questionSelections: selected
        ? selections.filter((item) => item.id !== question.id)
        : [...selections, { id: question.id, label: question.label, method: getDefaultMethodForQuestion(question.type), thresholdPct: 2 }],
    });
  }

  function updateSelection(questionId, changes) {
    onChange({
      questionSelections: selections.map((item) =>
        item.id === questionId ? { ...item, ...changes } : item
      ),
    });
  }

  function updateMethod(question, method) {
    // Choosing a method on a question that isn't in the report yet adds it.
    if (!selections.some((item) => item.id === question.id)) {
      onChange({ questionSelections: [...selections, { id: question.id, label: question.label, method, thresholdPct: 2 }] });
      return;
    }
    // The target answer only applies to answer-based methods.
    updateSelection(question.id, methodNeedsAnswer(method) ? { method } : { method, answer: undefined });
  }

  // Opening the method dropdown of an unselected question includes the question
  // (with its default method); the dropdown still opens so a method can be picked.
  function includeQuestion(question) {
    if (selections.some((item) => item.id === question.id)) return;
    onChange({
      questionSelections: [...selections, { id: question.id, label: question.label, method: getDefaultMethodForQuestion(question.type), thresholdPct: 2 }],
    });
  }

  // One selectable question row (checkbox card with its method controls).
  const renderQuestion = (question) => {
    const selection = selections.find((item) => item.id === question.id);
    const selected = Boolean(selection);
    const methods = getMethodsForQuestion(question.type);
    const options = question.options || [];
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
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <label htmlFor={`question-method-${question.id}`} style={{ fontSize: '0.8rem', color: '#6B7280' }}>
            Analysis method
          </label>
          <select
            id={`question-method-${question.id}`}
            value={selection?.method || getDefaultMethodForQuestion(question.type)}
            onMouseDown={() => includeQuestion(question)}
            onKeyDown={(event) => {
              if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) includeQuestion(question);
            }}
            onChange={(event) => updateMethod(question, event.target.value)}
            title={selected ? undefined : 'Choosing a method adds this question to the report'}
            style={{ ...controlStyle, cursor: 'pointer', backgroundColor: selected ? '#fff' : '#F9FAFB' }}
          >
            {methods.map((method) => (
              <option key={method.value} value={method.value}>{method.label}</option>
            ))}
          </select>
          {selected && methodNeedsAnswer(selection.method) && (
            <>
              <label htmlFor={`question-answer-${question.id}`} style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                Target answer
              </label>
              {options.length > 0 ? (
                <select
                  id={`question-answer-${question.id}`}
                  value={selection.answer || ''}
                  onChange={(event) => updateSelection(question.id, { answer: event.target.value })}
                  style={{ ...controlStyle, backgroundColor: '#fff', borderColor: selection.answer ? '#D1D5DB' : '#F59E0B' }}
                >
                  <option value="">Select an answer…</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`question-answer-${question.id}`}
                  type="text"
                  value={selection.answer || ''}
                  maxLength={200}
                  placeholder="Type the answer"
                  onChange={(event) => updateSelection(question.id, { answer: event.target.value })}
                  style={{ ...controlStyle, width: '9rem', borderColor: selection.answer ? '#D1D5DB' : '#F59E0B' }}
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // Questions still on a published survey first, then retired ones (removed
  // from their survey; earlier responses are still included).
  const sections = [
    {
      key: 'active',
      title: 'Active questions',
      hint: 'Questions currently on a published survey.',
      list: questions.filter((question) => question.active !== false),
    },
    {
      key: 'retired',
      title: 'Retired questions',
      hint: 'Removed from their survey. Responses collected before they were removed are still included.',
      list: questions.filter((question) => question.active === false),
    },
  ].filter((section) => section.list.length > 0);

  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Select Survey Questions for Analysis
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Optional. Skip this step to build a report from goals only.
      </p>

      {loading ? (
        <p style={{ color: '#6B7280' }}>Loading survey questions...</p>
      ) : questions.length === 0 ? (
        <p className="card" style={{ color: '#6B7280', padding: '1rem' }}>
          This initiative does not have any survey questions yet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {sections.map((section) => (
            <section key={section.key} aria-labelledby={`question-section-${section.key}`}>
              <h3 id={`question-section-${section.key}`} style={{ fontSize: '0.95rem', fontWeight: 600, color: '#111827', margin: '0 0 0.25rem' }}>
                {section.title} ({section.list.length})
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#6B7280', margin: '0 0 0.75rem' }}>{section.hint}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {section.list.map(renderQuestion)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
