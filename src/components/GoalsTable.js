/**
 * ============================================================================
 * GOALS TABLE — Goal rows as shown in the Goals page "Scoring Criteria" card.
 * ============================================================================
 * GoalRow is shared by the Goals page (which adds an Actions cell) and the
 * report "Goals" section, so goals look the same on both.
 * ============================================================================
 */
'use client';

import { getScoreColor } from '@/lib/score-utils';
import {
  formatPercentage,
  getGoalAccentColor,
  getGoalProgress,
  getGoalSourceLabel,
  getGoalStatus,
} from '@/lib/goals/goal-display';

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

/** Read-only "Goals" card for reports and the report preview. */
export default function GoalsTable({ goals, title = 'Goals', subtitle = 'Each goal contributes independently to the initiative score.' }) {
  if (!Array.isArray(goals) || goals.length === 0) return null;

  return (
    <div className="card goal-list-section">
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
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => <GoalRow key={goal.goal_id} goal={goal} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
