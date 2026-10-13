'use client';

import { formatPercentage, getGoalProgress, getGoalStatus } from '@/lib/goals/goal-display';

export default function StepGoals({ reportConfig, onChange, goals, loading }) {
  const selectedIds = reportConfig.goalIds || [];
  const allSelected = goals.length > 0 && goals.every((goal) => selectedIds.includes(goal.goal_id));

  function toggleGoal(goalId) {
    onChange({
      goalIds: selectedIds.includes(goalId)
        ? selectedIds.filter((id) => id !== goalId)
        : [...selectedIds, goalId],
    });
  }

  function toggleAll() {
    onChange({ goalIds: allSelected ? [] : goals.map((goal) => goal.goal_id) });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>
          Select Goals to Include
        </h2>
        {goals.length > 0 && (
          <button type="button" className="btn-outline" onClick={toggleAll} style={{ padding: '5px 12px', fontSize: 12 }}>
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Selected goals appear in a &quot;Goals&quot; section of the report, scored as of when it is generated.
        {(reportConfig.questionSelections || []).length === 0
          ? ' No survey questions are selected, so select at least one goal to continue.'
          : ' Optional.'}
      </p>

      {loading ? (
        <p style={{ color: '#6B7280' }}>Loading goals...</p>
      ) : goals.length === 0 ? (
        <p className="card" style={{ color: '#6B7280', padding: '1rem' }}>
          This initiative does not have any goals yet. Goals can be added on the Goals &amp; Scoring page.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {goals.map((goal) => {
            const selected = selectedIds.includes(goal.goal_id);
            const status = getGoalStatus(goal);
            return (
              <div
                key={goal.goal_id}
                role="checkbox"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => toggleGoal(goal.goal_id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleGoal(goal.goal_id);
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
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#111827', fontWeight: selected ? 600 : 500 }}>
                    {goal.goal_name}
                  </div>
                  {goal.description && (
                    <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: 2 }}>
                      {goal.description}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, fontSize: '0.8rem', color: '#6B7280' }}>
                  <span>{goal.current_value} / {goal.target_value}</span>
                  <span>{formatPercentage(getGoalProgress(goal))}%</span>
                  <span className={`pill ${status.pill}`}>{status.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
