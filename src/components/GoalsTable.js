/**
 * ============================================================================
 * GOALS TABLE — Goal listing used by the Goals page, initiative Goals tab and
 * report "Goals" sections, so goals look the same everywhere.
 * ============================================================================
 * GoalsTable lists goals read-only by default. With `editable` it adds the
 * Edit (drop-down) and Delete actions and saves changes through /api/goals.
 * The goal form helpers below are also used by the Goals page's Add Goal form.
 * ============================================================================
 */
'use client';

import { Fragment, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import {
  GOAL_SOURCE_METHODS,
  getGoalSourceMethodLabel,
  getMethodsForQuestion,
  getQuestionKind,
  isMethodAllowedForQuestion,
  methodNeedsAnswer,
} from '@/lib/analysis-methods';
import { getScoreColor } from '@/lib/score-utils';
import {
  formatPercentage,
  getGoalAccentColor,
  getGoalProgress,
  getGoalSourceLabel,
  getGoalStatus,
} from '@/lib/goals/goal-display';


/** Keep user-entered goal weights within the supported percentage range. */
export function clampWeight(value) {
  if (value === '') return '';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return String(Math.min(100, Math.max(0, numericValue)));
}

/** Prevent current values from going negative. */
export function clampCurrentValue(value) {
  if (value === '') return '';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return String(Math.max(0, numericValue));
}

/**
 * Optional survey-question source for a goal's current value. With a question
 * selected, the API computes current_value from that question's responses
 * using the chosen method: a report analysis method, or an answer-based method
 * (count / share of a target answer, or whether it is the most common answer).
 */
export function QuestionSourceFields({ goal, questions, onChange }) {
  const isSourced = Boolean(goal.source_root_field_id);
  const needsAnswer = isSourced && methodNeedsAnswer(goal.source_method);
  const question = questions.find((candidate) => String(candidate.id) === String(goal.source_root_field_id));
  const options = question?.options || [];
  const answerIsOption = !goal.source_answer || options.some((option) =>
    [option.value, option.label].some((text) => String(text).toLowerCase() === String(goal.source_answer).toLowerCase()));

  // Only the methods that fit this question's type; a saved method that no
  // longer fits stays listed (marked) so it can be seen and changed.
  const methods = question ? getMethodsForQuestion(question.type) : GOAL_SOURCE_METHODS;
  const currentMethodUnavailable = isSourced && question && goal.source_method
    && !isMethodAllowedForQuestion(goal.source_method, question.type);

  // Suggest the scoring that fits the method; it can still be changed.
  const methodChanges = (method) => {
    const changes = { source_method: method };
    // "Answer is most common" is 1 or 0, so it is met when it reaches a target of 1.
    if (method === 'answer_is_most_common') Object.assign(changes, { scoring_method: 'binary', target_value: 1 });
    else if (methodNeedsAnswer(method)) changes.scoring_method = 'linear';
    if (!methodNeedsAnswer(method)) changes.source_answer = '';
    return changes;
  };
  const changeMethod = (method) => onChange(methodChanges(method));

  const changeQuestion = (questionId) => {
    if (!questionId) {
      onChange({ source_root_field_id: '', source_method: '', source_answer: '' });
      return;
    }
    const next = questions.find((candidate) => String(candidate.id) === String(questionId));
    const keep = goal.source_method && isMethodAllowedForQuestion(goal.source_method, next?.type);
    // A goal needs a number: average for numeric questions, otherwise the share
    // of a chosen answer, else the first method the question allows (e.g. dates).
    const preferred = getQuestionKind(next?.type) === 'numeric' ? 'average' : 'answer_share';
    const method = keep ? goal.source_method
      : isMethodAllowedForQuestion(preferred, next?.type) ? preferred
        : getMethodsForQuestion(next?.type)[0].value;
    onChange({ source_root_field_id: questionId, ...methodChanges(method), source_answer: '' });
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: needsAnswer ? '2fr 1fr 1fr' : '2fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Current Value Source</label>
          <select
            value={goal.source_root_field_id || ''}
            onChange={(e) => changeQuestion(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Enter manually</option>
            {questions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}{candidate.active === false ? ' (retired)' : ''}
              </option>
            ))}
          </select>
          {questions.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
              This initiative has no survey questions yet.
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Analysis Method</label>
          <select
            value={goal.source_method || ''}
            disabled={!isSourced}
            onChange={(e) => changeMethod(e.target.value)}
            style={{ ...inputStyle, cursor: isSourced ? 'pointer' : 'default', opacity: isSourced ? 1 : 0.6 }}
          >
            {!isSourced && <option value="">—</option>}
            {currentMethodUnavailable && (
              <option value={goal.source_method}>
                {getGoalSourceMethodLabel(goal.source_method)} (not available for this question)
              </option>
            )}
            {methods.map((method) => (
              <option key={method.value} value={method.value}>{method.label}</option>
            ))}
          </select>
        </div>
        {needsAnswer && (
          <div>
            <label style={labelStyle}>Target Answer *</label>
            {options.length > 0 ? (
              <select
                value={goal.source_answer || ''}
                onChange={(e) => onChange({ source_answer: e.target.value })}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Select an answer…</option>
                {!answerIsOption && <option value={goal.source_answer}>{goal.source_answer} (no longer an option)</option>}
                {options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={goal.source_answer || ''}
                onChange={(e) => onChange({ source_answer: e.target.value })}
                placeholder="Exact answer text"
                style={inputStyle}
              />
            )}
          </div>
        )}
      </div>
      {isSourced && question?.active === false && (
        <div style={{ fontSize: 12, color: '#B45309', marginTop: 6 }}>
          This question was removed from its survey. The goal uses its earlier responses only.
        </div>
      )}
      {needsAnswer && options.length > 0 && !answerIsOption && (
        <div style={{ fontSize: 12, color: '#B45309', marginTop: 6 }}>
          The target answer is no longer an option on this question, so new responses won&apos;t match it.
        </div>
      )}
    </div>
  );
}

/** Convert form source fields into the API payload (null for manual goals). */
export function toSourcePayload(goal) {
  return goal.source_root_field_id
    ? {
        source_root_field_id: Number(goal.source_root_field_id),
        source_method: goal.source_method,
        source_answer: methodNeedsAnswer(goal.source_method) ? (goal.source_answer || '') : null,
      }
    : { source_root_field_id: null, source_method: null, source_answer: null };
}


export const labelStyle = {
  display: 'block',
  color: 'var(--color-text-primary)',
  marginBottom: '0.35rem',
  fontWeight: '600',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

export const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1.5px solid #E5E7EB',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-text-primary)',
  backgroundColor: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 150ms ease',
};

export const GOAL_TABLE_HEADERS = ['Goal', 'Weight (%)', 'Target Value', 'Current Value', 'Goal Progress', 'Status'];

export function GoalStatusBadge({ goal }) {
  const status = getGoalStatus(goal);
  return <span className={`pill ${status.pill}`}>{status.label}</span>;
}

function PercentBar({ value, color }) {
  return (
    <div style={{ width: 80, height: 4, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.min(value, 100)}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
    </div>
  );
}

/** One display-mode goal row; children render as extra trailing cells. */
export function GoalRow({ goal, children }) {
  const progress = getGoalProgress(goal);
  const sourceLabel = getGoalSourceLabel(goal);

  return (
    <tr className="goal-list-row" style={{ '--goal-accent': getGoalAccentColor(goal) }}>
      <td>
        <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 2 }}>
          {goal.goal_name}
        </div>
        {goal.description && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {goal.description}
          </div>
        )}
        {sourceLabel && (
          <div
            title={goal.source?.description || ''}
            style={{ fontSize: 11, color: '#2563EB', marginTop: 4 }}
          >
            Sourced from: {sourceLabel}
            {goal.source && goal.source.value === null && (
              <span style={{ color: 'var(--color-text-light)' }}> (not enough data yet)</span>
            )}
            {goal.source?.questionActive === false && (
              <span style={{ color: '#B45309' }}> · question retired</span>
            )}
            {goal.source?.answerAvailable === false && (
              <span style={{ color: '#B45309' }}> · target answer is no longer an option</span>
            )}
          </div>
        )}
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{formatPercentage(goal.weight)}%</span>
          <PercentBar value={goal.weight} color="var(--color-asrs-orange)" />
        </div>
      </td>
      <td style={{ fontWeight: 500 }}>{goal.target_value}</td>
      <td>
        <span style={{ fontWeight: 500, color: getScoreColor(goal.score) }}>
          {goal.current_value}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{formatPercentage(progress)}%</span>
          <PercentBar value={progress} color={getScoreColor(progress)} />
        </div>
      </td>
      <td><GoalStatusBadge goal={goal} /></td>
      {children}
    </tr>
  );
}

/**
 * "Goals" card: one GoalRow per goal. Read-only unless `editable`.
 *
 * Props:
 * - goals, title, subtitle
 * - editable: show Edit (opens the goal's fields as a drop-down; several can be
 *   open at once) and Delete
 * - questions: survey questions for the "Current Value Source" picker
 * - onGoalsChanged(): reload goals after a save / delete; should resolve to the
 *   fresh goal list (or undefined if the reload failed) so other open edits can
 *   be brought up to date. The caller must keep this component mounted while
 *   reloading, or the open edits are lost.
 * - onMessage(text): status / error text for the page banner
 */
export default function GoalsTable({
  goals,
  title = 'Goals',
  subtitle = 'Each goal contributes independently to the initiative score.',
  editable = false,
  questions = [],
  onGoalsChanged,
  onMessage,
  style,
}) {
  // Open edit panels, keyed by goal_id; several goals can be edited at once.
  // Each draft keeps its baseline updated_at for conflict detection (US-035)
  // and the weight it was opened with, so peer rebalancing can refresh it.
  const [editDrafts, setEditDrafts] = useState({});

  if (!Array.isArray(goals) || goals.length === 0) return null;

  /**
   * Save edits using the timestamp captured when editing began. Weight changes
   * are proportionally rebalanced across peer goals by the API.
   */
  async function handleUpdateGoal(goalId) {
    onMessage?.('');
    const editGoal = editDrafts[goalId];
    if (!editGoal) return;

    try {
      const res = await apiFetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal_id: goalId,
          expected_updated_at: editGoal.baselineUpdatedAt,
          goal_name: editGoal.goal_name,
          description: editGoal.description,
          target_value: parseFloat(editGoal.target_value),
          current_value: parseFloat(editGoal.current_value),
          weight: parseFloat(editGoal.weight),
          scoring_method: editGoal.scoring_method,
          deadline: editGoal.deadline || null,
          ...toSourcePayload(editGoal),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.conflict) {
        onMessage?.(
          data.error ||
            'Another user saved this goal first. Your edit was queued for an admin to review. The list below shows the current server copy—refresh after an admin resolves the conflict.'
        );
        closeEditing(goalId);
        onGoalsChanged?.();
        return;
      }
      if (!res.ok) throw new Error([data.error || 'Failed to update goal', data.details].filter(Boolean).join(': '));

      onMessage?.('Goal updated successfully!');
      closeEditing(goalId);
      const freshGoals = await onGoalsChanged?.();
      if (freshGoals) refreshOpenDrafts(freshGoals, goalId);
    } catch (err) {
      onMessage?.(err.message);
    }
  }

  /** Delete a goal after explicit confirmation, then refresh aggregate scores. */
  async function handleDeleteGoal(goalId) {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    onMessage?.('');

    try {
      const res = await apiFetch(`/api/goals?goalId=${goalId}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete goal');

      onMessage?.('Goal deleted.');
      closeEditing(goalId);
      const freshGoals = await onGoalsChanged?.();
      if (freshGoals) refreshOpenDrafts(freshGoals, goalId);
    } catch (err) {
      onMessage?.(err.message);
    }
  }

  /** Copy a persisted goal into a controlled edit draft. */
  function toEditDraft(goal) {
    return {
      goal_name: goal.goal_name,
      description: goal.description || '',
      target_value: goal.target_value,
      current_value: goal.current_value,
      weight: goal.weight,
      scoring_method: goal.scoring_method,
      deadline: goal.deadline || '',
      source_root_field_id: goal.source_root_field_id ? String(goal.source_root_field_id) : '',
      source_method: goal.source_method || '',
      source_answer: goal.source_answer || '',
      baselineUpdatedAt: goal.updated_at != null ? String(goal.updated_at) : '',
      originalWeight: goal.weight,
    };
  }

  /** Open or close a goal's edit panel (the Edit button's caret). */
  function toggleEditing(goal) {
    setEditDrafts((prev) => {
      if (prev[goal.goal_id]) {
        const { [goal.goal_id]: _closed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [goal.goal_id]: toEditDraft(goal) };
    });
  }

  function closeEditing(goalId) {
    setEditDrafts((prev) => {
      const { [goalId]: _closed, ...rest } = prev;
      return rest;
    });
  }

  function updateDraft(goalId, changes) {
    setEditDrafts((prev) => (prev[goalId] ? { ...prev, [goalId]: { ...prev[goalId], ...changes } } : prev));
  }

  /**
   * After a save or delete, a weight change rebalances the other goals and bumps
   * their updated_at. Refresh the other open drafts so saving them isn't flagged
   * as a conflict with this user's own edit; a weight the user hasn't touched
   * follows the rebalanced value. Trade-off: this also moves those drafts'
   * conflict baseline past any change another user made in the meantime.
   */
  function refreshOpenDrafts(freshGoals, savedGoalId) {
    setEditDrafts((prev) => {
      const next = { ...prev };
      for (const [id, draft] of Object.entries(prev)) {
        if (String(id) === String(savedGoalId)) continue;
        const fresh = freshGoals.find((g) => String(g.goal_id) === String(id));
        if (!fresh) continue;
        const weightUntouched = Number(draft.weight) === Number(draft.originalWeight);
        next[id] = {
          ...draft,
          baselineUpdatedAt: fresh.updated_at != null ? String(fresh.updated_at) : '',
          originalWeight: fresh.weight,
          ...(weightUntouched ? { weight: fresh.weight } : {}),
        };
      }
      return next;
    });
  }


  return (
    <div className="card goal-list-section" style={style}>
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="goal-list-subtitle">{subtitle}</div>}
        </div>
        <span className="goal-list-count">{goals.length} {goals.length === 1 ? 'goal' : 'goals'}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table goal-list-table">
          <thead>
            <tr>
              {GOAL_TABLE_HEADERS.map((header) => <th key={header}>{header}</th>)}
              {editable && <th style={{ width: 120 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => {
              if (!editable) return <GoalRow key={goal.goal_id} goal={goal} />;
              const draft = editDrafts[goal.goal_id];
              const isEditing = Boolean(draft);
              const panelId = `goal-edit-${goal.goal_id}`;
              return (
                <Fragment key={goal.goal_id}>
                  {/* ---- Goal row; Edit opens its fields as a drop-down below ---- */}
                  <GoalRow goal={goal}>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => toggleEditing(goal)}
                          className="btn-outline"
                          aria-expanded={isEditing}
                          aria-controls={panelId}
                          style={{ padding: '5px 10px 5px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, ...(isEditing ? { borderColor: '#E67E22', color: '#E67E22' } : {}) }}
                        >
                          Edit
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transition: 'transform 150ms ease', transform: isEditing ? 'rotate(180deg)' : 'none' }}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGoal(goal.goal_id)}
                          style={{
                            padding: '5px 12px',
                            fontSize: 12,
                            borderRadius: 8,
                            border: '1px solid #FECACA',
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
                            cursor: 'pointer',
                            transition: 'background 150ms ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </GoalRow>

                  {/* ---- Edit drop-down: all editable fields for this goal ---- */}
                  {isEditing && (
                    <tr id={panelId} className="goal-list-row goal-list-row-editing">
                      <td colSpan={GOAL_TABLE_HEADERS.length + 1} style={{ padding: 0 }}>
                        <div style={{ padding: '20px 16px', background: '#FAFAFA', borderRadius: 8 }}>
                          <div style={{ marginBottom: 12 }}>
                            <label style={labelStyle}>Goal Name</label>
                            <input
                              type="text"
                              value={draft.goal_name}
                              onChange={(e) => updateDraft(goal.goal_id, { goal_name: e.target.value })}
                              style={inputStyle}
                            />
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <label style={labelStyle}>Description</label>
                            <textarea
                              value={draft.description}
                              onChange={(e) => updateDraft(goal.goal_id, { description: e.target.value })}
                              rows={2}
                              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                            />
                          </div>
                          <div style={{ marginBottom: 12 }}>
                            <label style={labelStyle}>Deadline (Optional)</label>
                            <input
                              type="date"
                              value={draft.deadline}
                              onChange={(e) => updateDraft(goal.goal_id, { deadline: e.target.value })}
                              style={inputStyle}
                            />
                          </div>
                          <QuestionSourceFields
                            goal={draft}
                            questions={questions}
                            onChange={(changes) => updateDraft(goal.goal_id, { ...changes })}
                          />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                              <label style={labelStyle}>Target Value</label>
                              <input
                                type="number"
                                step="any"
                                value={draft.target_value}
                                onChange={(e) => updateDraft(goal.goal_id, { target_value: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Current Value</label>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={draft.source_root_field_id ? '' : draft.current_value}
                                disabled={Boolean(draft.source_root_field_id)}
                                onChange={(e) => updateDraft(goal.goal_id, { current_value: clampCurrentValue(e.target.value) })}
                                placeholder={draft.source_root_field_id ? 'From responses' : undefined}
                                style={{ ...inputStyle, opacity: draft.source_root_field_id ? 0.6 : 1 }}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Weight (%)</label>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                value={draft.weight}
                                onChange={(e) => updateDraft(goal.goal_id, { weight: clampWeight(e.target.value) })}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label style={labelStyle}>Scoring Method</label>
                              <select
                                value={draft.scoring_method}
                                onChange={(e) => updateDraft(goal.goal_id, { scoring_method: e.target.value })}
                                style={{ ...inputStyle, cursor: 'pointer' }}
                              >
                                <option value="linear">Linear</option>
                                {/* Threshold is no longer offered; goals already using it keep it. */}
                                {goal.scoring_method === 'threshold' && <option value="threshold">Threshold</option>}
                                <option value="binary">Binary</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => handleUpdateGoal(goal.goal_id)} className="btn-primary">
                              Save Changes
                            </button>
                            <button type="button" onClick={() => closeEditing(goal.goal_id)} className="btn-outline">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
