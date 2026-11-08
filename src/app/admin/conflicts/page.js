'use client';

import PageLayout from '@/components/PageLayout';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';

function FieldDiff({ label, before, after }) {
  const same = JSON.stringify(before) === JSON.stringify(after);
  return (
    <div style={{ marginBottom: '0.35rem', fontSize: '0.88rem' }}>
      <span style={{ fontWeight: 600 }}>{label}:</span>{' '}
      {same ? (
        <span style={{ color: '#6B7280' }}>{String(before ?? '—')}</span>
      ) : (
        <>
          <span style={{ textDecoration: 'line-through', color: '#DC2626' }}>{String(before ?? '—')}</span>
          {' → '}
          <span style={{ color: '#16A34A', fontWeight: 600 }}>{String(after ?? '—')}</span>
        </>
      )}
    </div>
  );
}

export default function AdminGoalConflictsPage() {
  const router = useRouter();
  const { user, hydrated } = useAuthStore();
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.user_type !== 'admin') {
      router.push('/dashboard');
    }
  }, [router, user, hydrated]);

  const load = useCallback(async () => {
    if (!user || user.user_type !== 'admin') return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      const resp = await apiFetch(`/api/admin/goal-conflicts?${params.toString()}`);
      const data = await resp.json();
      if (resp.ok) {
        setConflicts(data.conflicts || []);
      } else {
        setError(data.error || 'Failed to load conflicts');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(conflictId, action) {
    setBusyId(conflictId);
    setError('');
    try {
      const resp = await apiFetch('/api/admin/goal-conflicts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflict_id: conflictId, action }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || 'Action failed');
        return;
      }
      await load();
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  const fieldLabels = {
    goal_name: 'Goal name',
    description: 'Description',
    target_metric: 'Target metric',
    target_value: 'Target value',
    current_value: 'Current value',
    weight: 'Weight',
    scoring_method: 'Scoring method',
    deadline: 'Deadline',
  };

  const pendingCount = conflicts.filter(c => c.status === 'pending').length;
  const resolvedCount = conflicts.filter(c => c.status === 'resolved').length;

  const getStatusPill = (status, resolution) => {
    if (status === 'pending') return <span className="pill-yellow">Pending</span>;
    if (resolution === 'rejected') return <span className="pill-red">Rejected</span>;
    return <span className="pill-green">Resolved</span>;
  };

  return (
    <PageLayout title="Conflict Resolution">
      {/* Stats Row */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value">{pendingCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Resolved</div>
          <div className="stat-value">{resolvedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{conflicts.length}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ display: 'flex', gap: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', fontSize: '0.875rem', color: '#374151' }}>
          Status:
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '9px 14px', fontSize: '0.875rem', backgroundColor: 'white', outline: 'none', cursor: 'pointer' }}
          >
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="button" onClick={() => load()} className="btn-primary">
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', borderLeft: '4px solid #DC2626' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>Loading...</div>
      ) : conflicts.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
          No conflicts in this view.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {conflicts.map((c) => {
            const patch = c.proposed_patch || {};
            const snap = c.server_snapshot || {};
            const fields = new Set([...Object.keys(patch), ...Object.keys(snap)].filter((k) => k !== 'updated_at'));
            return (
              <div key={c.conflict_id} className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '1.05rem', color: '#111827' }}>
                      Goal #{c.goal_id} — {snap.goal_name || 'Goal'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: '0.25rem' }}>
                      {c.initiative_name} · Submitted by {c.submitter_email} · {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ alignSelf: 'flex-start' }}>
                    {getStatusPill(c.status, c.resolution)}
                    {c.resolution && (
                      <span style={{ fontSize: '0.75rem', color: '#6B7280', marginLeft: '0.4rem' }}>
                        {c.resolution.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem', fontSize: '0.82rem', color: '#9CA3AF' }}>
                  Client expected <code>updated_at</code> {c.expected_updated_at}; server had {c.detected_server_updated_at} when the conflict was recorded.
                </div>

                {/* Side-by-side diff */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: '#FEF2F2', borderRadius: '8px', padding: '0.75rem 1rem', border: '1px solid #FECACA' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Current (Server)</div>
                    {Array.from(fields).map((key) => (
                      <div key={key} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{fieldLabels[key] || key}:</span>{' '}
                        <span style={{ color: '#6B7280' }}>{String(snap[key] ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: '#F0FDF4', borderRadius: '8px', padding: '0.75rem 1rem', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Proposed (Incoming)</div>
                    {Array.from(fields).map((key) => (
                      <div key={key} style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{fieldLabels[key] || key}:</span>{' '}
                        <span style={{ color: JSON.stringify(snap[key]) !== JSON.stringify(patch[key]) ? '#16A34A' : '#6B7280', fontWeight: JSON.stringify(snap[key]) !== JSON.stringify(patch[key]) ? 600 : 400 }}>
                          {String(patch[key] ?? '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {c.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === c.conflict_id}
                      onClick={() => resolve(c.conflict_id, 'apply')}
                      style={{ opacity: busyId === c.conflict_id ? 0.6 : 1 }}
                    >
                      {busyId === c.conflict_id ? 'Working...' : 'Accept (apply proposed values)'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.conflict_id}
                      onClick={() => resolve(c.conflict_id, 'reject')}
                      className="btn-outline"
                      style={{ opacity: busyId === c.conflict_id ? 0.6 : 1 }}
                    >
                      Reject (keep current data)
                    </button>
                  </div>
                )}
                {c.status === 'resolved' && c.resolved_by_email && (
                  <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                    Resolved by {c.resolved_by_email}
                    {c.resolved_at ? ` · ${new Date(c.resolved_at).toLocaleString()}` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
