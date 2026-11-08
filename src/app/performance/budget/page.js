'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageLayout from '@/components/PageLayout';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (!n) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Number(n).toFixed(2)}`;
}

function pct(spent, total) {
  if (!total) return 0;
  return Math.round((spent / total) * 100);
}

function getStatus(utilization) {
  if (utilization > 100) return { label: 'Over Budget', color: '#C0392B', bg: '#C0392B18' };
  if (utilization >= 80)  return { label: 'At Risk',    color: '#F39C12', bg: '#F39C1218' };
  return                         { label: 'On Track',   color: '#27AE60', bg: '#27AE6018' };
}

const CATEGORIES = [
  { key: 'personnel',  spentKey: 'personnel_spent',  label: 'Personnel',  color: '#3498DB' },
  { key: 'equipment',  spentKey: 'equipment_spent',  label: 'Equipment',  color: '#9B59B6' },
  { key: 'operations', spentKey: 'operations_spent', label: 'Operations', color: '#E67E22' },
  { key: 'travel',     spentKey: 'travel_spent',     label: 'Travel',     color: '#1ABC9C' },
];

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '0.75rem 1rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <p style={{ margin: '0 0 0.5rem 0', fontWeight: '700', color: '#111827', fontSize: '0.85rem' }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: entry.color, fontWeight: '600' }}>
          {entry.name}: {fmt(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ─── Drill-down row ───────────────────────────────────────────────────────────

function DrillDownRow({ initiative, colCount }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch(`/api/performance/budget?initiativeId=${initiative.initiative_id}`);
        if (!res.ok) throw new Error();
        setDetail(await res.json());
      } catch { setError('Failed to load details.'); }
      finally  { setLoading(false); }
    }
    load();
  }, [initiative.initiative_id]);

  const thStyle = { padding: '0.5rem 0.75rem', fontWeight: '700', color: '#6B7280', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' };

  return (
    <tr>
      <td colSpan={colCount} style={{ padding: 0, backgroundColor: '#F9FAFB' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderTop: '2px solid #E5E7EB', borderBottom: '2px solid #E5E7EB' }}>
          <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
            Budget Breakdown — {initiative.initiative_name}
          </p>

          {loading && <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>Loading...</p>}
          {error   && <p style={{ color: '#c62828', fontSize: '0.9rem' }}>{error}</p>}

          {!loading && !error && detail && (
            <>
              {detail.budgets.length === 0 ? (
                <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>No budget entries found.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', marginBottom: detail.history.length ? '1.25rem' : 0 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                      {['Fiscal Year', 'Category', 'Budget', 'Spent', 'Remaining', 'Utilization', 'Status'].map((h, i) => (
                        <th key={h} style={{ ...thStyle, textAlign: i < 2 ? 'left' : 'center' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.budgets.flatMap((b) =>
                      CATEGORIES.map((c, ci) => {
                        const budget    = b[c.key]      || 0;
                        const spent     = b[c.spentKey] || 0;
                        const remaining = budget - spent;
                        const util      = pct(spent, budget);
                        const status    = getStatus(util);
                        return (
                          <tr key={`${b.budget_id}-${c.key}`} style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: ci === 0 ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: ci === 0 ? '700' : '400', color: '#111827' }}>
                              {ci === 0 ? b.fiscal_year : ''}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: '600', color: c.color }}>{c.label}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#111827' }}>{fmt(budget)}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: status.color, fontWeight: '600' }}>{fmt(spent)}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: remaining < 0 ? '#C0392B' : '#111827' }}>{fmt(remaining)}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontWeight: '700', color: budget ? status.color : '#9CA3AF' }}>
                              {budget ? `${util}%` : '—'}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                              {budget ? (
                                <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '700', backgroundColor: status.bg, color: status.color }}>
                                  {status.label}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}

              {detail.history.length > 0 && (
                <>
                  <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Change History</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                        {['Date', 'Fiscal Year', 'Personnel', 'Equipment', 'Operations', 'Travel', 'Total', 'Changed By'].map((h, i) => (
                          <th key={h} style={{ ...thStyle, fontSize: '0.72rem', textAlign: i < 2 ? 'left' : 'center' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.history.map((h) => (
                        <tr key={h.history_id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '0.5rem 0.75rem', color: '#6B7280' }}>{new Date(h.created_at).toLocaleDateString()}</td>
                          <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600', color: '#111827' }}>{h.fiscal_year}</td>
                          {CATEGORIES.map((c) => (
                            <td key={c.key} style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#111827' }}>{fmt(h[c.key])}</td>
                          ))}
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: '700', color: '#111827' }}>{fmt(h.total)}</td>
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#6B7280' }}>{h.changed_by_name || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PerformanceBudget() {
  const router = useRouter();
  const [user, setUser]           = useState(null);
  const [data, setData]           = useState({ fiscalYears: [], departments: [], initiatives: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState(null);

  const [filterFiscalYear, setFilterFiscalYear] = useState('');
  const [filterDept,       setFilterDept]       = useState('');
  const [filterInitiative, setFilterInitiative] = useState('');
  const [filterStatus,     setFilterStatus]     = useState('');

  const [sortField,  setSortField]  = useState('utilization-desc');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) { router.push('/login'); return; }
    const parsed = JSON.parse(stored);
    if (parsed.user_type !== 'admin' && parsed.user_type !== 'staff') { router.push('/dashboard'); return; }
    setUser(parsed);
  }, [router]);

  useEffect(() => { if (user) fetchData(); }, [user, filterFiscalYear, filterDept]);

  async function fetchData() {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filterFiscalYear) params.set('fiscalYear', filterFiscalYear);
      if (filterDept)       params.set('department', filterDept);
      const res = await apiFetch(`/api/performance/budget?${params}`);
      if (!res.ok) throw new Error('Failed to fetch budget data');
      setData(await res.json());
    } catch (err) {
      console.error(err);
      setError('Failed to load budget data');
    } finally {
      setIsLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return data.initiatives.filter((i) => {
      if (filterInitiative && !i.initiative_name.toLowerCase().includes(filterInitiative.toLowerCase())) return false;
      if (filterStatus) {
        const util   = pct(i.total_spent, i.total);
        const status = getStatus(util);
        if (status.label !== filterStatus) return false;
      }
      return true;
    });
  }, [data.initiatives, filterInitiative, filterStatus]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aUtil = pct(a.total_spent, a.total);
      const bUtil = pct(b.total_spent, b.total);
      if (sortField === 'utilization-desc') return bUtil  - aUtil;
      if (sortField === 'utilization-asc')  return aUtil  - bUtil;
      if (sortField === 'budget-desc')      return b.total - a.total;
      if (sortField === 'budget-asc')       return a.total - b.total;
      if (sortField === 'spent-desc')       return b.total_spent - a.total_spent;
      if (sortField === 'name-asc')         return a.initiative_name.localeCompare(b.initiative_name);
      return 0;
    });
  }, [filtered, sortField]);

  const SORT_CYCLE   = ['utilization-desc', 'utilization-asc', 'budget-desc', 'budget-asc', 'spent-desc', 'name-asc'];
  const SORT_LABELS  = {
    'utilization-desc': '↓ Utilization (high→low)',
    'utilization-asc':  '↑ Utilization (low→high)',
    'budget-desc':      '↓ Budget (high→low)',
    'budget-asc':       '↑ Budget (low→high)',
    'spent-desc':       '↓ Spent (high→low)',
    'name-asc':         'A→Z Name',
  };
  function cycleSortField() {
    setSortField(prev => SORT_CYCLE[(SORT_CYCLE.indexOf(prev) + 1) % SORT_CYCLE.length]);
  }

  const allInits = data.initiatives;
  const visibleInitiatives = sorted;

  const grandBudget  = visibleInitiatives.reduce((s, i) => s + i.total,       0);
  const grandSpent   = visibleInitiatives.reduce((s, i) => s + i.total_spent, 0);
  const overBudget   = visibleInitiatives.filter((i) => pct(i.total_spent, i.total) > 100).length;
  const avgUtil      = visibleInitiatives.length
    ? Math.round(visibleInitiatives.reduce((s, i) => s + pct(i.total_spent, i.total), 0) / visibleInitiatives.length)
    : 0;

  // Remaining budget
  const remaining = grandBudget - grandSpent;
  // Cost per participant (approximate — total spent / number of initiatives as a proxy)
  const costPerParticipant = visibleInitiatives.length > 0
    ? Math.round(grandSpent / Math.max(visibleInitiatives.length, 1))
    : 0;
  // ROI score placeholder derived from avg utilization
  const roiScore = avgUtil > 0 ? Math.min((avgUtil / 100 * 4 + 1), 5).toFixed(1) : '—';

  // Monthly spend chart data (bar chart: Budget vs Spent per initiative)
  const barChartData = visibleInitiatives
    .filter(i => i.total > 0 || i.total_spent > 0)
    .map(i => ({
      name:   i.initiative_name.length > 16 ? i.initiative_name.slice(0, 16) + '…' : i.initiative_name,
      Budget: i.total,
      Spent:  i.total_spent,
    }));

  // Cost per participant chart (horizontal bar — use budget as proxy denominator)
  const costChartData = visibleInitiatives
    .filter(i => i.total_spent > 0)
    .map(i => ({
      name: i.initiative_name.length > 20 ? i.initiative_name.slice(0, 20) + '…' : i.initiative_name,
      Cost: Math.round(i.total_spent / Math.max(visibleInitiatives.length, 1)),
    }));

  // Star rating helper
  function starRating(utilization) {
    const score = Math.max(0, Math.min(5, Math.round((1 - Math.abs(utilization - 80) / 100) * 5)));
    return '★'.repeat(score) + '☆'.repeat(5 - score);
  }

  const TABLE_COLS = 7;

  if (!user) return null;

  return (
    <PageLayout title="Performance">
      {/* Page heading + filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#111827', margin: 0 }}>Budget Performance</h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {allInits.length > 0 && (
            <>
              <select
                value={filterInitiative}
                onChange={(e) => setFilterInitiative(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', backgroundColor: 'white', color: '#374151', fontSize: '13px', cursor: 'pointer', outline: 'none' }}
              >
                <option value="">All Initiatives</option>
                {data.initiatives.map(i => <option key={i.initiative_id} value={i.initiative_name}>{i.initiative_name}</option>)}
              </select>
              {data.fiscalYears.length > 0 && (
                <select
                  value={filterFiscalYear}
                  onChange={(e) => setFilterFiscalYear(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', backgroundColor: 'white', color: '#374151', fontSize: '13px', cursor: 'pointer', outline: 'none' }}
                >
                  <option value="">All Years</option>
                  {data.fiscalYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              {data.departments.length > 0 && (
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', backgroundColor: 'white', color: '#374151', fontSize: '13px', cursor: 'pointer', outline: 'none' }}
                >
                  <option value="">All Departments</option>
                  {data.departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
              {(filterFiscalYear || filterDept || filterInitiative || filterStatus) && (
                <button onClick={() => { setFilterFiscalYear(''); setFilterDept(''); setFilterInitiative(''); setFilterStatus(''); }}
                  className="btn-outline" style={{ fontSize: '13px' }}>
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem', marginBottom: '1rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6B7280' }}>
          Loading budget data...
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── 4 Stat Cards ── */}
          <div className="stats-row" style={{ marginBottom: '24px' }}>
            {/* Budget Utilization */}
            <div className="stat-card">
              <div className="stat-label">Budget Utilization</div>
              <div className="stat-value" style={{ color: getStatus(avgUtil).color }}>{avgUtil}%</div>
              <div style={{ marginTop: '12px', height: '6px', backgroundColor: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(avgUtil, 100)}%`, height: '100%', backgroundColor: '#E67E22', borderRadius: '3px' }} />
              </div>
            </div>

            {/* Cost per Participant */}
            <div className="stat-card">
              <div className="stat-label">Cost per Initiative</div>
              <div className="stat-value">{fmt(costPerParticipant)}</div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#9CA3AF' }}>avg across initiatives</div>
            </div>

            {/* ROI Score */}
            <div className="stat-card">
              <div className="stat-label">Efficiency Score</div>
              <div className="stat-value">{roiScore}<span style={{ fontSize: '16px', color: '#9CA3AF' }}>/5</span></div>
              <div style={{ marginTop: '8px', fontSize: '14px', color: '#E67E22' }}>
                {typeof roiScore === 'string' ? '' : '★'.repeat(Math.round(Number(roiScore)))}
              </div>
            </div>

            {/* Remaining Budget */}
            <div className="stat-card">
              <div className="stat-label">Remaining Budget</div>
              <div className="stat-value" style={{ color: remaining >= 0 ? '#059669' : '#DC2626' }}>{fmt(remaining)}</div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#9CA3AF' }}>of {fmt(grandBudget)} total</div>
            </div>
          </div>

          {/* ── Charts Row ── */}
          {barChartData.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {/* Left: Budget vs Spent line/bar chart */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Budget vs. Actual Spend</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} tickFormatter={(v) => fmt(v)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '0.5rem' }} />
                    <Bar dataKey="Budget" fill="#D1D5DB" radius={[3, 3, 0, 0]} strokeDasharray="4 2" />
                    <Bar dataKey="Spent"  fill="#E67E22" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Right: Cost per initiative (horizontal bar) */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Cost per Initiative</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={costChartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} tickFormatter={(v) => fmt(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Cost" fill="#E67E22" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Budget Breakdown Table ── */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Budget Breakdown</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#6B7280' }}>
                  Showing <strong>{sorted.length}</strong> of <strong>{allInits.length}</strong>
                </span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: 'white', color: '#374151', fontSize: '12px', cursor: 'pointer', outline: 'none' }}
                >
                  <option value="">All Statuses</option>
                  <option value="On Track">On Track</option>
                  <option value="At Risk">At Risk</option>
                  <option value="Over Budget">Over Budget</option>
                </select>
                <button onClick={cycleSortField} className="btn-outline" style={{ fontSize: '12px', padding: '6px 12px' }}>
                  {SORT_LABELS[sortField]}
                </button>
              </div>
            </div>

            {allInits.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B7280', padding: '2rem' }}>
                No budget data found. Add budgets to initiatives to see data here.
              </div>
            ) : sorted.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6B7280', padding: '2rem' }}>
                No initiatives match the current filters.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {['Initiative', 'Allocated', 'Spent', 'Variance', 'Cost/Unit', 'Efficiency', ''].map((h, i) => (
                        <th key={h + i} style={{ textAlign: i === 0 ? 'left' : 'center' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((initiative) => {
                      const util      = pct(initiative.total_spent, initiative.total);
                      const status    = getStatus(util);
                      const variance  = initiative.total - initiative.total_spent;
                      const isExpanded = expandedId === initiative.initiative_id;
                      const costUnit  = fmt(Math.round(initiative.total_spent / Math.max(visibleInitiatives.length, 1)));

                      return (
                        <React.Fragment key={initiative.initiative_id}>
                          <tr
                            onClick={() => setExpandedId(prev => prev === initiative.initiative_id ? null : initiative.initiative_id)}
                            style={{ cursor: 'pointer', backgroundColor: isExpanded ? '#FFF7ED' : undefined }}
                          >
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                                  style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', opacity: 0.4 }}>
                                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <span style={{ fontWeight: '600', color: '#111827' }}>{initiative.initiative_name}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {initiative.total ? fmt(initiative.total) : <span style={{ color: '#9CA3AF' }}>No budget</span>}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: '600', color: status.color }}>
                              {fmt(initiative.total_spent)}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: '600', color: variance >= 0 ? '#059669' : '#DC2626' }}>
                              {initiative.total ? fmt(variance) : '—'}
                            </td>
                            <td style={{ textAlign: 'center', color: '#374151' }}>{costUnit}</td>
                            <td style={{ textAlign: 'center', fontSize: '13px', color: '#E67E22', letterSpacing: '1px' }}>
                              {initiative.total ? starRating(util) : '—'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {initiative.total ? (
                                <span style={{ padding: '3px 8px', borderRadius: '9999px', fontSize: '11px', fontWeight: '600', backgroundColor: status.bg, color: status.color }}>
                                  {status.label}
                                </span>
                              ) : (
                                <span style={{ color: '#9CA3AF', fontSize: '12px' }}>No budget</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <DrillDownRow initiative={initiative} colCount={TABLE_COLS} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </PageLayout>
  );
}
