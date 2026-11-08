'use client';

// Moved from src/app/performance-dashboard/page.js
// Content is identical

import PageLayout from '@/components/PageLayout';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { getScoreColor } from '@/lib/score-utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ─── Weighted score helpers ───────────────────────────────────────────────────

/**
 * Normalizes raw weights against their sum, matching the server's computeOverallScore.
 * e.g. weights [2, 1] → 66.7% and 33.3%.
 * Returns { totalWeight, weightError, breakdown }.
 */
function calcWeightedScore(goals) {
  if (!goals?.length) return { totalWeight: 100, weightError: false, breakdown: [] };

  const totalWeightRaw = goals.reduce((s, g) => s + (g.weight ?? 0), 0);
  const weightError = totalWeightRaw === 0;

  const breakdown = goals.map((g) => {
    const w = g.weight ?? 0;
    const normalizedWeight = totalWeightRaw > 0 ? w / totalWeightRaw : 0;
    const progress = (g.score ?? 0) / 100;
    return { ...g, decimalWeight: normalizedWeight, displayWeight: parseFloat((normalizedWeight * 100).toFixed(1)), contribution: progress * normalizedWeight };
  });

  return { totalWeight: 100, weightError, breakdown };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PerformanceGoals() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [initiatives, setInitiatives] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortOrder, setSortOrder] = useState('descending');
  const [expandedId, setExpandedId] = useState(null);

  // Chart state
  const [selectedInitiativeId, setSelectedInitiativeId] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [chartInitiative, setChartInitiative] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(null);

  // Check admin / staff access
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) { router.push('/login'); return; }
    const parsed = JSON.parse(storedUser);
    if (parsed.user_type !== 'admin' && parsed.user_type !== 'staff') { router.push('/dashboard'); return; }
    setUser(parsed);
  }, [router]);

  useEffect(() => { if (user) fetchInitiativesWithScores(); }, [user]);

  useEffect(() => {
    if (selectedInitiativeId) {
      fetchChartData(selectedInitiativeId);
    } else {
      setChartData([]);
      setChartInitiative(null);
      setChartError(null);
    }
  }, [selectedInitiativeId]);

  async function fetchInitiativesWithScores() {
    try {
      setIsLoading(true);
      setError(null);

      const initiativesRes = await apiFetch('/api/goals/initiatives');
      if (!initiativesRes.ok) throw new Error('Failed to fetch initiatives');
      const initiativesData = await initiativesRes.json();
      const allInitiatives = initiativesData.initiatives || [];

      const initiativesWithScores = await Promise.all(
        allInitiatives.map(async (init) => {
          try {
            const goalsRes = await apiFetch(`/api/goals?initiativeId=${init.initiative_id}`);
            if (goalsRes.ok) {
              const goalsData = await goalsRes.json();
              const goals = goalsData.goals || [];

              // ── use server-computed score; calcWeightedScore is for breakdown display only ──
              const { totalWeight, weightError, breakdown } = calcWeightedScore(goals);
              const score = goalsData.overallScore ?? 0;

              const today = new Date();
              today.setHours(0, 0, 0, 0);

              let nearestDeadline = null;
              let daysUntilNearest = null;

              for (const goal of goals) {
                if (goal.deadline) {
                  const deadlineDate = new Date(goal.deadline);
                  deadlineDate.setHours(0, 0, 0, 0);
                  const daysUntil = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
                  if (daysUntilNearest === null || daysUntil < daysUntilNearest) {
                    nearestDeadline = goal.deadline;
                    daysUntilNearest = daysUntil;
                  }
                }
              }

              return {
                ...init,
                overallScore: score,
                goalsCount: goals.length,
                totalWeight,
                weightError,
                breakdown,
                nearestDeadline,
                daysUntilNearest,
              };
            }
            return {
              ...init,
              overallScore: 0,
              goalsCount: 0,
              totalWeight: 0,
              weightError: false,
              breakdown: [],
              nearestDeadline: null,
              daysUntilNearest: null,
            };
          } catch (err) {
            console.error(`Error fetching goals for initiative ${init.initiative_id}:`, err);
            return {
              ...init,
              overallScore: 0,
              goalsCount: 0,
              totalWeight: 0,
              weightError: false,
              breakdown: [],
              nearestDeadline: null,
              daysUntilNearest: null,
            };
          }
        })
      );

      setInitiatives(initiativesWithScores);
    } catch (err) {
      console.error(err);
      setError('Failed to load performance data');
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchChartData(initiativeId) {
    try {
      setChartLoading(true);
      setChartError(null);

      const res = await apiFetch(`/api/goals/history?initiativeId=${initiativeId}`);
      if (!res.ok) throw new Error('Failed to fetch history');

      const data = await res.json();
      setChartInitiative(data.initiative);

      if (data.timeline && data.timeline.length > 0) {
        setChartData(
          data.timeline.map((entry) => ({
            date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            rawDate: entry.date,
            'Current Performance': entry.overallScore,
            'Goal Target': entry.targetScore,
          }))
        );
      } else {
        setChartData([]);
      }
    } catch (err) {
      console.error('Error fetching chart data:', err);
      setChartError('Failed to load progress history');
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }

  function getSortedInitiatives() {
    return [...initiatives].sort((a, b) => {
      if (sortOrder === 'ascending') return a.overallScore - b.overallScore;
      if (sortOrder === 'descending') return b.overallScore - a.overallScore;
      // 'deadline' — soonest first, nulls last
      const aDays = a.daysUntilNearest !== null ? a.daysUntilNearest : Infinity;
      const bDays = b.daysUntilNearest !== null ? b.daysUntilNearest : Infinity;
      return aDays - bDays;
    });
  }

  function toggleSortOrder() {
    setSortOrder((prev) =>
      prev === 'ascending' ? 'descending' : prev === 'descending' ? 'deadline' : 'ascending'
    );
  }

  function handleRowClick(initiative) {
    const sid = String(initiative.initiative_id);
    setSelectedInitiativeId(sid);
    setExpandedId((prev) => (prev === sid ? null : sid));
  }

  function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}>
        <p style={{ margin: '0 0 0.5rem 0', fontWeight: '700', color: '#111827', fontSize: '0.85rem' }}>
          {label}
        </p>
        {payload.map((entry, i) => (
          <p key={i} style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: entry.color, fontWeight: '600' }}>
            {entry.name}: {entry.value}%
          </p>
        ))}
      </div>
    );
  }

  /** Expandable per-goal weight breakdown, rendered as an extra <tr> below the initiative row. */
  function WeightBreakdownPanel({ breakdown, totalWeight, weightError }) {
    if (!breakdown?.length) return null;

    return (
      <tr>
        <td colSpan={6} style={{ padding: '0', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ padding: '1rem 1.5rem', backgroundColor: '#F9FAFB' }}>

            {/* Weight-error banner */}
            {weightError && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.75rem',
                padding: '0.6rem 0.9rem',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '8px',
                color: '#856404',
                fontSize: '0.85rem',
                fontWeight: '600',
              }}>
                <span>⚠️</span>
                <span>
                  Goal weights sum to <strong>{totalWeight}%</strong> — they must total exactly <strong>100%</strong>.
                  Performance score cannot be calculated until weights are corrected.
                </span>
              </div>
            )}

            {/* Formula legend */}
            <p style={{ fontSize: '0.78rem', color: '#6B7280', margin: '0 0 0.75rem 0', fontStyle: 'italic' }}>
              Performance % = Σ (Current ÷ Target) × Weight &nbsp;|&nbsp; Weights must sum to 100%
            </p>

            {/* Goals breakdown table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: '#6B7280', fontWeight: '700' }}>
                  {['Goal', 'Current', 'Target', 'Weight', 'Progress', 'Contribution'].map((h, i) => (
                    <th key={h} style={{
                      padding: '0.4rem 0.6rem',
                      textAlign: i >= 1 ? 'center' : 'left',
                      borderBottom: '1px solid #F3F4F6',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdown.map((g, idx) => {
                  const pct = g.score ?? 0;
                  const contrib = (g.contribution * 100).toFixed(2);
                  return (
                    <tr key={g.goal_id ?? idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '0.5rem 0.6rem', fontWeight: '600', color: '#111827' }}>
                        {g.goal_name ?? `Goal ${idx + 1}`}
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>{g.current_value ?? 0}</td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>{g.target_value ?? 0}</td>

                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          backgroundColor: weightError ? '#fff3cd' : '#e8f5e9',
                          color: weightError ? '#856404' : '#2e7d32',
                          fontWeight: '700',
                        }}>
                          {g.displayWeight}%
                        </span>
                      </td>

                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', minWidth: '120px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <div style={{ flex: 1, height: '6px', backgroundColor: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', backgroundColor: getScoreColor(pct), borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: '600', color: '#6B7280', minWidth: '36px' }}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: '700', color: weightError ? '#6B7280' : getScoreColor(parseFloat(contrib)) }}>
                        {weightError ? '—' : `${contrib}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr style={{ borderTop: '2px solid #F3F4F6', fontWeight: '700' }}>
                  <td style={{ padding: '0.5rem 0.6rem', color: '#6B7280' }} colSpan={3}>Totals</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      backgroundColor: weightError ? '#ffebee' : '#e8f5e9',
                      color: weightError ? '#c62828' : '#2e7d32',
                      fontWeight: '800',
                    }}>
                      {totalWeight}%
                    </span>
                  </td>
                  <td />
                  <td style={{
                    padding: '0.5rem 0.6rem',
                    textAlign: 'center',
                    fontSize: '1rem',
                    color: weightError ? '#c62828' : getScoreColor(breakdown.reduce((s, b) => s + b.contribution, 0) * 100),
                  }}>
                    {weightError
                      ? '⚠️ Invalid'
                      : `${(breakdown.reduce((s, b) => s + b.contribution, 0) * 100).toFixed(2)}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </td>
      </tr>
    );
  }

  const sortedInitiatives = getSortedInitiatives();

  // Derived stats for the overall progress ring
  const totalGoals = initiatives.reduce((s, i) => s + i.goalsCount, 0);
  const onTrackGoals = initiatives.filter((i) => !i.weightError && i.overallScore >= 70).length;
  const overallPct = initiatives.length
    ? Math.round(initiatives.reduce((s, i) => s + i.overallScore, 0) / initiatives.length)
    : 78;

  // Ring SVG params
  const ringRadius = 70;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - overallPct / 100);

  // Milestone quarters
  const milestones = [
    { label: 'Q1', status: 'done' },
    { label: 'Q2', status: 'current' },
    { label: 'Q3', status: 'future' },
    { label: 'Q4', status: 'future' },
  ];

  return (
    <PageLayout title="Goals">
      {error && (
        <div style={{ padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6B7280' }}>
          Loading performance data...
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── Overall Progress Card ── */}
          <div className="card" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '48px', flexWrap: 'wrap' }}>
            {/* SVG Ring */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <svg width="180" height="180" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r={ringRadius} fill="none" stroke="#F3F4F6" strokeWidth="14" />
                <circle
                  cx="90" cy="90" r={ringRadius}
                  fill="none"
                  stroke="#E67E22"
                  strokeWidth="14"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 90 90)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
                <text x="90" y="84" textAnchor="middle" fontSize="28" fontWeight="700" fill="#111827">{overallPct}%</text>
                <text x="90" y="104" textAnchor="middle" fontSize="12" fill="#6B7280">Overall</text>
              </svg>
            </div>

            {/* Ring info */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
                Overall Progress
              </h2>
              <p style={{ color: '#6B7280', fontSize: '15px', marginBottom: '16px' }}>
                {onTrackGoals} of {initiatives.length} initiatives on track
              </p>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                  <div className="stat-label">Total Goals</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginTop: '4px' }}>{totalGoals}</div>
                </div>
                <div>
                  <div className="stat-label">Initiatives</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginTop: '4px' }}>{initiatives.length}</div>
                </div>
                <div>
                  <div className="stat-label">Weight Errors</div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: initiatives.filter(i => i.weightError).length ? '#DC2626' : '#059669', marginTop: '4px' }}>
                    {initiatives.filter(i => i.weightError).length}
                  </div>
                </div>
              </div>
            </div>

            {/* Chart selector */}
            {initiatives.length > 0 && (
              <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  View Progress Chart
                </label>
                <select
                  value={selectedInitiativeId || ''}
                  onChange={(e) => setSelectedInitiativeId(e.target.value || null)}
                  style={{
                    padding: '0.5rem 1rem', borderRadius: '8px',
                    border: '1px solid #E5E7EB', backgroundColor: 'white',
                    color: '#111827', fontSize: '0.9rem', fontWeight: '500',
                    cursor: 'pointer', minWidth: '220px', outline: 'none',
                  }}
                >
                  <option value="">Choose an initiative...</option>
                  {initiatives.map((init) => (
                    <option key={init.initiative_id} value={init.initiative_id}>
                      {init.initiative_name} ({init.weightError ? '⚠️ weight error' : `${init.overallScore}%`})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ── Chart Section ── */}
          {selectedInitiativeId && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <span className="card-title">Goal Progress Over Time</span>
                {chartInitiative && (
                  <span style={{ fontSize: '13px', color: '#6B7280' }}>{chartInitiative.initiative_name}</span>
                )}
              </div>

              {chartLoading && (
                <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ color: '#6B7280' }}>Loading chart data...</p>
                </div>
              )}

              {chartError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', fontSize: '0.9rem' }}>
                  {chartError}
                </div>
              )}

              {!chartLoading && !chartError && chartData.length === 0 && (
                <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px dashed #E5E7EB', flexDirection: 'column', gap: '0.5rem' }}>
                  <p style={{ color: '#6B7280', fontWeight: '600', margin: 0 }}>No progress history yet</p>
                  <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: 0 }}>History is recorded each time a goal&apos;s progress is updated.</p>
                </div>
              )}

              {!chartLoading && !chartError && chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '0.85rem', paddingTop: '0.5rem' }} />
                    <Line type="monotone" dataKey="Goal Target" stroke="#27AE60" strokeWidth={2} strokeDasharray="8 4" dot={false} activeDot={false} />
                    <Line type="monotone" dataKey="Current Performance" stroke="#E67E22" strokeWidth={3}
                      dot={{ r: 5, fill: '#E67E22', stroke: 'white', strokeWidth: 2 }}
                      activeDot={{ r: 7, fill: '#E67E22', stroke: 'white', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* ── Category Goal Cards ── */}
          {initiatives.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#111827', margin: 0 }}>
                  Initiative Goals
                  <span style={{ fontSize: '13px', fontWeight: '400', color: '#6B7280', marginLeft: '8px' }}>
                    Click a card to expand goal weights
                  </span>
                </h2>
                <button onClick={toggleSortOrder} className="btn-outline" style={{ fontSize: '13px' }}>
                  Sort: {sortOrder === 'ascending' ? '↑ Ascending Score' : sortOrder === 'descending' ? '↓ Descending Score' : '⏰ Upcoming Deadline'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                {sortedInitiatives.map((initiative) => {
                  const sid = String(initiative.initiative_id);
                  const isExpanded = expandedId === sid;
                  const score = initiative.overallScore;
                  const passCount = initiative.breakdown.filter(g => (g.score ?? 0) >= 70).length;
                  const totalCount = initiative.breakdown.length || initiative.goalsCount;

                  return (
                    <div
                      key={initiative.initiative_id}
                      className="card"
                      style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', padding: '20px' }}
                      onClick={() => handleRowClick(initiative)}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = ''; }}
                    >
                      {/* Card header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '15px', color: '#111827', marginBottom: '4px' }}>
                            <span style={{ marginRight: '6px', fontSize: '10px', display: 'inline-block', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                            {initiative.initiative_name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6B7280' }}>{totalCount > 0 ? `${passCount}/${totalCount} goals met` : `${initiative.goalsCount} goals`}</div>
                        </div>
                        {initiative.weightError ? (
                          <span className="pill-yellow pill" style={{ fontSize: '11px' }}>⚠️ Weight Error</span>
                        ) : (
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '12px',
                            fontWeight: '700',
                            backgroundColor: getScoreColor(score) + '18',
                            color: getScoreColor(score),
                          }}>
                            {score}%
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ height: '8px', backgroundColor: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(initiative.weightError ? 0 : score, 100)}%`,
                            height: '100%',
                            backgroundColor: initiative.weightError ? '#ffc107' : '#E67E22',
                            borderRadius: '4px',
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>

                      {/* Goal checklist */}
                      {initiative.breakdown.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {initiative.breakdown.slice(0, isExpanded ? undefined : 3).map((g, idx) => {
                            const pass = (g.score ?? 0) >= 70;
                            return (
                              <div key={g.goal_id ?? idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                <span style={{ color: pass ? '#059669' : '#DC2626', fontWeight: '700', flexShrink: 0 }}>
                                  {pass ? '✓' : '✗'}
                                </span>
                                <span style={{ flex: 1, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {g.goal_name ?? `Goal ${idx + 1}`}
                                </span>
                                <span style={{ fontSize: '11px', color: '#9CA3AF', flexShrink: 0 }}>
                                  {g.current_value ?? 0}/{g.target_value ?? 0}
                                </span>
                              </div>
                            );
                          })}
                          {!isExpanded && initiative.breakdown.length > 3 && (
                            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                              +{initiative.breakdown.length - 3} more goals — click to expand
                            </div>
                          )}
                        </div>
                      )}

                      {/* Nearest deadline */}
                      {initiative.nearestDeadline && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F3F4F6', fontSize: '12px', color: '#6B7280', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Next deadline:</span>
                          <span style={{ fontWeight: '600', color: initiative.daysUntilNearest <= 7 ? '#DC2626' : initiative.daysUntilNearest <= 30 ? '#D97706' : '#059669' }}>
                            {initiative.daysUntilNearest <= 0 ? 'Overdue' : initiative.daysUntilNearest === 1 ? 'Tomorrow' : `${initiative.daysUntilNearest} days`}
                          </span>
                        </div>
                      )}

                      {/* Weight breakdown (expanded) */}
                      {isExpanded && initiative.breakdown.length > 0 && (
                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F3F4F6' }}>
                          {initiative.weightError && (
                            <div style={{ padding: '8px 12px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', color: '#856404', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}>
                              ⚠️ Weight error: weights must total 100%
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '6px', fontStyle: 'italic' }}>
                            Score = Σ (Current ÷ Target) × Weight
                          </div>
                          {initiative.breakdown.map((g, idx) => (
                            <div key={g.goal_id ?? idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', borderBottom: '1px solid #F9FAFB' }}>
                              <span style={{ color: '#374151', flex: 1 }}>{g.goal_name ?? `Goal ${idx + 1}`}</span>
                              <span style={{ color: '#9CA3AF', marginRight: '8px' }}>{g.displayWeight}%</span>
                              <span style={{ fontWeight: '600', color: getScoreColor(g.score ?? 0) }}>{(g.score ?? 0).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {initiatives.length === 0 && !isLoading && (
            <div className="card" style={{ textAlign: 'center', color: '#6B7280', padding: '3rem' }}>
              No initiatives found. Create initiatives to see performance data.
            </div>
          )}

          {/* ── Milestone Timeline ── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Milestone Timeline</span>
              <span style={{ fontSize: '12px', color: '#6B7280' }}>FY Progress</span>
            </div>
            <div style={{ position: 'relative', padding: '24px 40px' }}>
              {/* Track line */}
              <div style={{ position: 'absolute', top: '50%', left: '40px', right: '40px', height: '3px', backgroundColor: '#F3F4F6', borderRadius: '2px', transform: 'translateY(-50%)' }} />
              {/* Fill line up to current */}
              <div style={{ position: 'absolute', top: '50%', left: '40px', width: '50%', height: '3px', backgroundColor: '#E67E22', borderRadius: '2px', transform: 'translateY(-50%)' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                {milestones.map((m) => (
                  <div key={m.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: m.status === 'current' ? '20px' : '16px',
                      height: m.status === 'current' ? '20px' : '16px',
                      borderRadius: '50%',
                      backgroundColor: m.status === 'done' ? '#059669' : m.status === 'current' ? '#E67E22' : '#D1D5DB',
                      border: m.status === 'current' ? '3px solid #FFF7ED' : '2px solid white',
                      boxShadow: m.status === 'current' ? '0 0 0 3px rgba(230,126,34,0.3)' : '0 1px 4px rgba(0,0,0,0.15)',
                      position: 'relative',
                      zIndex: 2,
                    }} />
                    <span style={{
                      fontSize: '12px',
                      fontWeight: m.status === 'current' ? '700' : '500',
                      color: m.status === 'done' ? '#059669' : m.status === 'current' ? '#E67E22' : '#9CA3AF',
                    }}>
                      {m.label}
                    </span>
                    <span style={{ fontSize: '10px', color: m.status === 'done' ? '#059669' : m.status === 'current' ? '#E67E22' : '#D1D5DB' }}>
                      {m.status === 'done' ? 'Done' : m.status === 'current' ? 'Active' : 'Upcoming'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}
