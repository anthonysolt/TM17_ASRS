'use client';

import PageLayout from '@/components/PageLayout';
import Link from 'next/link';
import InitiativeNameLink from '@/components/InitiativeNameLink';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import InitiativeSettingSelect from '@/components/InitiativeSettingSelect';
import { applySavedInitiativeSettings, normalizeInitiativeStatus } from '@/lib/initiative-status';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function InitiativeCreationPage() {
  return (
    <Suspense fallback={<PageLayout title="Initiatives"><div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>Loading...</div></PageLayout>}>
      <InitiativeCreationContent />
    </Suspense>
  );
}

function InitiativeCreationContent() {

  const [userRole, setUserRole] = useState('public');

  // Check for logged-in user and set their role
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setUserRole(user.user_type || 'public');
    }
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Initiative list state ──────────────────────────────
  const [initiatives, setInitiatives] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  const fetchInitiatives = async () => {
    try {
      setIsLoadingList(true);
      const [initResponse, catResponse] = await Promise.all([
        apiFetch('/api/initiatives'),
        apiFetch('/api/initiative-categories'),
      ]);
      const initData = await initResponse.json();
      const catData = await catResponse.json();
      if (initResponse.ok) {
        const catMap = {};
        if (catData.relationships) {
          for (const rel of catData.relationships) {
            catMap[rel.initiative_id] = rel.category_name;
          }
        }
        const enriched = (initData.initiatives || []).map(init => ({
          ...init,
          category: catMap[init.id] || init.settings?.category || null,
        }));
        setInitiatives(enriched);
      }
    } catch (error) {
      console.error('Error fetching initiatives:', error);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchInitiatives();
  }, []);

  // ── Page message ───────────────────────────────────────
  // The create page and the initiative page send people back here with the
  // name of the initiative they created or deleted.
  const [message, setMessage] = useState('');
  const createdName = searchParams.get('created');
  const deletedName = searchParams.get('deleted');

  useEffect(() => {
    if (createdName) setMessage(`"${createdName}" was created successfully.`);
    else if (deletedName) setMessage(`"${deletedName}" was deleted successfully.`);
  }, [createdName, deletedName]);

  // ── Derived stats ──────────────────────────────────────
  const totalCount    = initiatives.length;
  const activeCount   = initiatives.filter(i => normalizeInitiativeStatus(i.settings?.status) === 'active').length;
  const inactiveCount = initiatives.filter(i => ['inactive', 'archived'].includes(normalizeInitiativeStatus(i.settings?.status))).length;

  const canCreate = userRole === 'admin' || userRole === 'staff';

  return (
    <PageLayout title="Initiatives">

      {/* ── Page-level status message ── */}
      {message && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          backgroundColor: message.includes('successfully') ? '#e8f5e9' : '#ffebee',
          border: `1px solid ${message.includes('successfully') ? '#c8e6c9' : '#ffcdd2'}`,
          borderRadius: '8px',
          color: message.includes('successfully') ? '#2e7d32' : '#c62828',
          fontSize: '0.9rem',
        }}>
          {message}
        </div>
      )}

      {/* ── Page header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Initiatives</h2>
        {canCreate && (
          <button
            className="btn-primary btn-create"
            onClick={() => router.push('/initiatives/new')}
          >
            Create Initiative
          </button>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Initiatives</div>
          <div className="stat-value">{totalCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">{activeCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inactive / Archived</div>
          <div className="stat-value">{inactiveCount}</div>
        </div>
      </div>

      {/* ── Initiatives table card ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">All Initiatives</span>
        </div>

        {isLoadingList ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            Loading initiatives…
          </p>
        ) : initiatives.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            No initiatives yet. {canCreate && 'Use Create Initiative to add one.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Initiative</th>
                  <th>Goal %</th>
                  <th>Last Updated</th>
                  <th>Submissions</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th>View</th>
                  {canCreate && <th aria-label="Open initiative" style={{ width: 40 }} />}
                </tr>
              </thead>
              <tbody>
                {initiatives.map((initiative) => {
                  const handleSaved = (saved) => setInitiatives(prev => applySavedInitiativeSettings(prev, saved));
                  return (
                    <tr key={initiative.id}>
                      <td style={{ fontWeight: 600, color: '#111827' }}>
                        {/* The initiative page is staff/admin only, so others just see the name. */}
                        {canCreate ? (
                          <InitiativeNameLink initiative={initiative} />
                        ) : initiative.name}
                      </td>
                      <td style={{ color: '#6B7280' }}>
                        {initiative.overall_score == null ? '—' : `${Math.round(initiative.overall_score * 10) / 10}%`}
                      </td>
                      <td style={{ color: '#6B7280' }}>{formatDate(initiative.updated_at || initiative.created_at)}</td>
                      <td style={{ color: '#6B7280' }}>{initiative.submission_count ?? '—'}</td>
                      <td style={{ color: '#6B7280' }}>{initiative.member_count ?? '—'}</td>
                      <td>
                        <InitiativeSettingSelect initiative={initiative} setting="status" editable={canCreate} onSaved={handleSaved} />
                      </td>
                      <td>
                        <InitiativeSettingSelect initiative={initiative} setting="view" editable={canCreate} onSaved={handleSaved} />
                      </td>
                      {canCreate && (
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            href={`/initiatives/${initiative.id}/manage`}
                            aria-label={`Open ${initiative.name}`}
                            title={`Open ${initiative.name}`}
                            style={{ display: 'inline-flex', alignItems: 'center', color: '#9CA3AF', padding: 4, verticalAlign: 'middle' }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </PageLayout>
  );
}
