'use client';

import PageLayout from '@/components/PageLayout';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { getScoreColor } from '@/lib/score-utils';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import {
  formatPercentage,
  getGoalAccentColor,
  getGoalProgress,
  isUnmetWeightedGoal,
} from '@/lib/goals/goal-display';
import GoalsTable, {
  GoalStatusBadge,
  QuestionSourceFields,
  clampCurrentValue,
  clampWeight,
  inputStyle,
  labelStyle,
  toSourcePayload,
} from '@/components/GoalsTable';

export default function GoalsPage() {
  // ---------------------------------------------------------------------------
  // Page state
  // ---------------------------------------------------------------------------
  const router = useRouter();
  const { user } = useAuthStore();

  // Initiative and goal data loaded from the goals API.
  const [initiatives, setInitiatives] = useState([]);
  const [selectedInitiative, setSelectedInitiative] = useState('');
  const [goals, setGoals] = useState([]);
  const [overallScore, setOverallScore] = useState(0);
  // Survey questions of the selected initiative that goals can source from.
  const [questions, setQuestions] = useState([]);

  // Page-level UI state and user feedback.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [message, setMessage] = useState('');

  // Form values are stored as strings so number fields can temporarily be empty.
  const [newGoal, setNewGoal] = useState({
    goal_name: '',
    description: '',
    target_value: '',
    current_value: '0',
    weight: '2',
    scoring_method: 'linear',
    deadline: '',
    source_root_field_id: '',
    source_method: '',
    source_answer: '',
  });


  // ---------------------------------------------------------------------------
  // Authorization and data loading
  // ---------------------------------------------------------------------------

  // Only staff and administrators may manage initiative goals.
  useEffect(() => {
    if (user && user.user_type !== 'admin' && user.user_type !== 'staff') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const fetchInitiatives = useCallback(async () => {
    try {
      const res = await apiFetch('/api/goals/initiatives');
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('user');
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch initiatives');
      const data = await res.json();
      const list = data.initiatives || [];
      setInitiatives(list);
      // ?initiative=<id> (e.g. from an initiative's Goals tab) opens that initiative's goals.
      const requested = new URLSearchParams(window.location.search).get('initiative');
      if (requested && list.some((i) => String(i.id ?? i.initiative_id) === requested)) {
        setSelectedInitiative(requested);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load initiatives');
    }
  }, [router]);

  // background: refresh without the loading state, so the goal table stays
  // mounted and keeps any open Edit drop-downs (used after saves and deletes).
  const fetchGoals = useCallback(async (initiativeId, { background = false } = {}) => {
    try {
      if (!background) setIsLoading(true);
      setError(null);
      const res = await apiFetch(`/api/goals?initiativeId=${initiativeId}`);
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('user');
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch goals');
      const data = await res.json();
      setGoals(data.goals || []);
      setOverallScore(data.overallScore || 0);
      // Keep the initiative card's goal count current after adds and deletes.
      setInitiatives((previous) => previous.map((init) => (
        String(init.initiative_id) === String(initiativeId) ? { ...init, goal_count: (data.goals || []).length } : init
      )));
      return data.goals || [];
    } catch (err) {
      console.error(err);
      setError('Failed to load goals');
    } finally {
      if (!background) setIsLoading(false);
    }
  }, [router]);

  // Load the initiative selector when the page mounts.
  useEffect(() => {
    fetchInitiatives();
  }, [fetchInitiatives]);

  // Keep goal data and the overall score synchronized with the selection.
  useEffect(() => {
    if (selectedInitiative) {
      fetchGoals(selectedInitiative);
      apiFetch(`/api/goals/questions?initiativeId=${selectedInitiative}`)
        .then((res) => (res.ok ? res.json() : { questions: [] }))
        .then((data) => setQuestions(data.questions || []))
        .catch(() => setQuestions([]));
    } else {
      setGoals([]);
      setOverallScore(0);
      setQuestions([]);
    }
  }, [selectedInitiative, fetchGoals]);

  // ---------------------------------------------------------------------------
  // Goal mutations
  // ---------------------------------------------------------------------------

  /** Create a goal and reload the initiative's complete scoring configuration. */
  async function handleAddGoal(e) {
    e.preventDefault();
    setMessage('');

    try {
      const res = await apiFetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiative_id: parseInt(selectedInitiative),
          goal_name: newGoal.goal_name,
          description: newGoal.description,
          target_value: parseFloat(newGoal.target_value),
          current_value: parseFloat(newGoal.current_value) || 0,
          weight: parseFloat(newGoal.weight),
          scoring_method: newGoal.scoring_method,
          deadline: newGoal.deadline || null,
          ...toSourcePayload(newGoal),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error([data.error || 'Failed to create goal', data.details].filter(Boolean).join(': '));

      setMessage('Goal created successfully!');
      setShowAddForm(false);
      setNewGoal({
        goal_name: '',
        description: '',
        target_value: '',
        current_value: '0',
        weight: '2',
        scoring_method: 'linear',
        deadline: '',
        source_root_field_id: '',
        source_method: '',
        source_answer: '',
      });
      fetchGoals(selectedInitiative, { background: true });
    } catch (err) {
      setMessage(err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Scoring display helpers
  // ---------------------------------------------------------------------------

  /** Convert the stored scoring identifier into a user-facing explanation. */
  function getScoringLabel(method) {
    switch (method) {
      case 'linear': return 'Linear (proportional)';
      case 'threshold': return 'Threshold (all-or-nothing at target)';
      case 'binary': return 'Binary (target reached = 100%)';
      default: return method;
    }
  }

  /** Render the compact progress indicator used by target metric cards. */
  function RingProgress({ score, size = 80 }) {
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const pct = Math.min(Math.max(score || 0, 0), 100);
    const offset = circumference - (pct / 100) * circumference;
    const color = getScoreColor(pct);

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F3F4F6"
          strokeWidth="8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    );
  }

  // ---------------------------------------------------------------------------
  // Page rendering
  // ---------------------------------------------------------------------------

  return (
    <PageLayout title="Goals & Scoring">
      {/* Initiative selector — always visible */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Initiatives</h2>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Choose an initiative to view and manage its scoring goals</p>
        {initiatives.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 14 }}>
            No initiatives found. Create one first.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {initiatives.map((init) => {
              const isSelected = selectedInitiative === String(init.initiative_id);
              return (
                <button
                  key={init.initiative_id}
                  onClick={() => setSelectedInitiative(String(init.initiative_id))}
                  style={{
                    textAlign: 'left',
                    padding: '16px 20px',
                    borderRadius: 12,
                    border: isSelected ? '2px solid #E67E22' : '1px solid #E5E7EB',
                    backgroundColor: isSelected ? '#FFF7ED' : '#fff',
                    cursor: 'pointer',
                    transition: 'border-color 150ms, box-shadow 150ms',
                    boxShadow: isSelected ? '0 2px 8px rgba(230,126,34,.15)' : 'none',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = '#E67E22'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(230,126,34,.12)'; } }}
                  onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; } }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                      {init.initiative_name}
                    </span>
                    <span style={{ fontSize: 12, color: isSelected ? '#E67E22' : '#6B7280', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {Number(init.goal_count) || 0} {Number(init.goal_count) === 1 ? 'goal' : 'goals'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Goals header */}
      {selectedInitiative && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>
              Goals: {initiatives.find(i => String(i.initiative_id) === selectedInitiative)?.initiative_name || 'Initiative'}
            </h2>
          </div>

          {!isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Overall score:</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: getScoreColor(overallScore) }}>
                {overallScore}%
              </span>
            </div>
          )}

          <button
            type="button"
            className="btn-outline btn-icon"
            onClick={() => fetchGoals(selectedInitiative)}
            disabled={isLoading}
            aria-label="Refresh goals"
            title="Refresh goals"
          >
            <svg
              className={isLoading ? 'icon-spin' : undefined}
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          <button
            className="btn-primary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Cancel' : 'Create Goal'}
          </button>
        </div>
      )}

      {/* Placeholder when no initiative selected */}
      {!selectedInitiative && initiatives.length > 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 15 }}>
          Click an initiative above to manage goals
        </div>
      )}

      {/* Feedback message */}
      {message && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 20,
          borderRadius: 8,
          fontSize: 13,
          backgroundColor: message.includes('successfully') || message.includes('deleted') ? '#ECFDF5' : '#FEF2F2',
          border: `1px solid ${message.includes('successfully') || message.includes('deleted') ? '#A7F3D0' : '#FECACA'}`,
          color: message.includes('successfully') || message.includes('deleted') ? '#065F46' : '#991B1B',
        }}>
          {message}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 20,
          borderRadius: 8,
          fontSize: 13,
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          color: '#991B1B',
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Loading goals...
        </div>
      )}

      {/* Add Goal Form */}
      {showAddForm && selectedInitiative && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">New Goal</span>
          </div>
          <form onSubmit={handleAddGoal}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Goal Name *</label>
              <input
                type="text"
                value={newGoal.goal_name}
                onChange={(e) => setNewGoal({ ...newGoal, goal_name: e.target.value })}
                placeholder="e.g., Increase Participation"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={newGoal.description}
                onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                placeholder="Optional description of this goal..."
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Deadline (Optional)</label>
              <input
                type="date"
                value={newGoal.deadline}
                onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                style={inputStyle}
              />
            </div>

            <QuestionSourceFields
              goal={newGoal}
              questions={questions}
              onChange={(changes) => setNewGoal({ ...newGoal, ...changes })}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Target Value *</label>
                <input
                  type="number"
                  step="any"
                  value={newGoal.target_value}
                  onChange={(e) => setNewGoal({ ...newGoal, target_value: e.target.value })}
                  placeholder="500"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Current Value</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newGoal.source_root_field_id ? '' : newGoal.current_value}
                  disabled={Boolean(newGoal.source_root_field_id)}
                  onChange={(e) => setNewGoal({ ...newGoal, current_value: clampCurrentValue(e.target.value) })}
                  placeholder={newGoal.source_root_field_id ? 'From responses' : '0'}
                  style={{ ...inputStyle, opacity: newGoal.source_root_field_id ? 0.6 : 1 }}
                />
              </div>
              <div>
                <label style={labelStyle}>Weight (%) *</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={newGoal.weight}
                  onChange={(e) => setNewGoal({ ...newGoal, weight: clampWeight(e.target.value) })}
                  placeholder="2"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Scoring Method *</label>
                <select
                  value={newGoal.scoring_method}
                  onChange={(e) => setNewGoal({ ...newGoal, scoring_method: e.target.value })}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="linear">Linear</option>
                  <option value="binary">Binary</option>
                </select>
              </div>
            </div>

            <button type="submit" className="btn-primary">
              Save Goal
            </button>
          </form>
        </div>
      )}


      {/* Goals content */}
      {selectedInitiative && !isLoading && goals.length === 0 && !showAddForm && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 48, fontSize: 14 }}>
          No goals configured for this initiative yet. Click &quot;Create Goal&quot; to add one.
        </div>
      )}

      {selectedInitiative && !isLoading && goals.length > 0 && (
        <>
          {/* Scoring Criteria card: goal list with Edit drop-downs (shared GoalsTable) */}
          <GoalsTable
            key={selectedInitiative}
            goals={goals}
            title="Scoring Criteria"
            editable
            questions={questions}
            onGoalsChanged={() => fetchGoals(selectedInitiative, { background: true })}
            onMessage={setMessage}
            style={{ marginBottom: 24 }}
          />

          {/* Target Metrics card */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="card-title">Target Metrics</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 16,
              }}
            >
              {goals.map((goal) => (
                <div
                  key={goal.goal_id}
                  style={{
                    border: `1px solid ${getGoalAccentColor(goal)}`,
                    borderRadius: 12,
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    background: isUnmetWeightedGoal(goal) ? '#FFFBEB' : '#FAFAFA',
                    transition: 'border-color 150ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = getGoalAccentColor(goal); }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'center', marginBottom: 4 }}>
                    {goal.goal_name}
                  </div>

                  {/* Ring progress */}
                  <div style={{ position: 'relative', width: 80, height: 80 }}>
                    <RingProgress score={goal.score} size={80} />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, color: getScoreColor(goal.score), lineHeight: 1 }}>
                        {goal.score}%
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Target
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {goal.target_value}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Current
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: getScoreColor(goal.score) }}>
                      {goal.current_value}
                    </div>
                  </div>

                  {/* Display-only: threshold and binary scoring stay all-or-nothing */}
                  {(goal.scoring_method === 'threshold' || goal.scoring_method === 'binary') && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Goal Progress
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: getScoreColor(getGoalProgress(goal)) }}>
                        {formatPercentage(getGoalProgress(goal))}%
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 4 }}>
                    <GoalStatusBadge goal={goal} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}

// Shared styles keep create and edit controls visually consistent.

