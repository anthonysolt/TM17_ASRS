'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import { apiFetch } from '@/lib/api/client';
import ReasonModal from '@/components/ReasonModal';

export default function ManageReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [initiatives, setInitiatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit modal state
  const [editingReport, setEditingReport] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('completed');

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState(null);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Filter/sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');

  // Toast message
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, initRes] = await Promise.all([
        fetch('/api/reports'),
        fetch('/api/initiatives'),
      ]);
      const reportsData = await reportsRes.json();
      const initData = await initRes.json();
      setReports(reportsData.reports || []);
      setInitiatives(initData.initiatives || []);
    } catch (err) {
      console.error('Failed to load data:', err);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/login');
      return;
    }
    const parsed = JSON.parse(storedUser);
    if (parsed.user_type !== 'staff' && parsed.user_type !== 'admin') {
      router.push('/');
      return;
    }
    loadData();
  }, [router, loadData]);

  function getInitiativeName(initId) {
    const init = initiatives.find(i => i.initiative_id === initId || i.id === initId);
    return init ? (init.initiative_name || init.name) : '—';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ── Edit ──

  function openEdit(report) {
    setEditingReport(report);
    setEditName(report.name || '');
    setEditDescription(report.description || '');
    setEditStatus(report.status || 'completed');
  }

  function closeEdit() {
    setEditingReport(null);
    setEditName('');
    setEditDescription('');
    setEditStatus('completed');
  }

  async function handleSaveEdit() {
    // open reason modal before saving edit
    if (!editingReport) return;
    setPendingAction({ type: 'editReport', id: editingReport.id, name: editName, description: editDescription, status: editStatus });
    setShowReasonModal(true);
  }

  // ── Delete ──

  async function handleDelete(id) {
    // ask for reason before deleting
    setPendingAction({ type: 'deleteReport', id });
    setShowReasonModal(true);
  }

  // Called when modal confirms
  const handleReasonSubmit = async ({ reasonType, reasonText }) => {
    setShowReasonModal(false);
    if (!pendingAction) return;
    setSaving(true);
    try {
      if (pendingAction.type === 'editReport') {
        const res = await apiFetch('/api/reports', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pendingAction.id, name: pendingAction.name, description: pendingAction.description, status: pendingAction.status, reasonType, reasonText }),
        });
        if (!res.ok) throw new Error();
        showToast('Report updated successfully');
        closeEdit();
        await loadData();
      } else if (pendingAction.type === 'deleteReport') {
        const url = `/api/reports?id=${pendingAction.id}&reasonType=${encodeURIComponent(reasonType)}&reasonText=${encodeURIComponent(reasonText)}`;
        const res = await apiFetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        showToast('Report deleted');
        setDeletingId(null);
        await loadData();
      }
    } catch (e) {
      showToast('Operation failed', 'error');
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
  };

  // ── Reorder ──

  function moveReport(index, direction) {
    const newReports = [...reports];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newReports.length) return;
    [newReports[index], newReports[targetIndex]] = [newReports[targetIndex], newReports[index]];
    setReports(newReports);
  }

  async function saveOrder() {
    setSaving(true);
    try {
      const order = reports.map((r, i) => ({ id: r.id, display_order: i }));
      const res = await apiFetch('/api/reports/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error();
      showToast('Display order saved');
      await loadData();
    } catch {
      showToast('Failed to save order', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Status pill helper ──
  function getStatusPillClass(status) {
    if (status === 'published') return 'pill-green';
    if (status === 'completed') return 'pill-yellow';
    if (status === 'draft') return 'pill-yellow';
    if (status === 'archived') return 'pill-gray';
    return 'pill-gray';
  }

  // ── Filtered + sorted reports ──
  const STATUS_FILTERS = ['All', 'Published', 'Unpublished', 'Archived'];

  const filteredReports = reports
    .filter((r) => {
      const matchesSearch = !searchQuery ||
        (r.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.initiative_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const selectedStatus = statusFilter === 'Unpublished' ? 'completed' : statusFilter.toLowerCase();
      const matchesStatus = statusFilter === 'All' ||
        (r.status || '').toLowerCase() === selectedStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

  return (
    <PageLayout title="Manage Reports">
      {/* Filter bar */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: '1.5rem',
        padding: '1rem 1.25rem',
        backgroundColor: '#fff',
        borderRadius: '10px',
        border: '1px solid #E5E7EB',
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
          <input
            type="text"
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              fontSize: '0.875rem',
              backgroundColor: '#F9FAFB',
              boxSizing: 'border-box',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#E67E22'}
            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
          />
        </div>

        {/* Status pill filters */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid',
                cursor: 'pointer',
                transition: 'all 0.15s',
                backgroundColor: statusFilter === s ? '#E67E22' : '#F9FAFB',
                color: statusFilter === s ? '#fff' : '#374151',
                borderColor: statusFilter === s ? '#E67E22' : '#E5E7EB',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Sort select */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid #E5E7EB',
            fontSize: '0.875rem',
            backgroundColor: '#F9FAFB',
            cursor: 'pointer',
          }}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name">Name (A–Z)</option>
        </select>

        {/* Save Order button */}
        <button
          onClick={saveOrder}
          disabled={saving || reports.length === 0}
          className="btn-primary"
          style={{
            opacity: saving || reports.length === 0 ? 0.5 : 1,
            cursor: saving || reports.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Order'}
        </button>
      </div>

      {/* Report list */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
          Loading reports...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No reports found.</p>
          <p style={{ fontSize: '0.9rem' }}>
            {reports.length === 0
              ? 'Create reports from the Report Creation page, then manage them here.'
              : 'Try adjusting your search or filters.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredReports.map((r, idx) => {
            // Find the real index in the unsorted reports array for reorder
            const realIdx = reports.findIndex((rep) => rep.id === r.id);
            return (
              <div
                key={r.id}
                className="card"
                style={{
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = ''}
              >
                {/* Reorder arrows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flexShrink: 0 }}>
                  <button
                    onClick={() => moveReport(realIdx, -1)}
                    disabled={realIdx === 0}
                    style={{
                      padding: '0.2rem 0.4rem',
                      backgroundColor: 'transparent',
                      border: '1px solid #E5E7EB',
                      borderRadius: '4px',
                      cursor: realIdx === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem',
                      lineHeight: 1,
                      color: '#6B7280',
                      opacity: realIdx === 0 ? 0.3 : 1,
                    }}
                    title="Move up"
                  >
                    &#9650;
                  </button>
                  <button
                    onClick={() => moveReport(realIdx, 1)}
                    disabled={realIdx === reports.length - 1}
                    style={{
                      padding: '0.2rem 0.4rem',
                      backgroundColor: 'transparent',
                      border: '1px solid #E5E7EB',
                      borderRadius: '4px',
                      cursor: realIdx === reports.length - 1 ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem',
                      lineHeight: 1,
                      color: '#6B7280',
                      opacity: realIdx === reports.length - 1 ? 0.3 : 1,
                    }}
                    title="Move down"
                  >
                    &#9660;
                  </button>
                </div>

                {/* Left side: report info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#111827',
                    margin: '0 0 0.2rem 0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {r.name || '(Untitled)'}
                  </h3>
                  <div style={{ fontSize: '13px', color: '#6B7280', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span>{r.initiative_name || getInitiativeName(r.initiative_id)}</span>
                    <span>{formatDate(r.created_at)}</span>
                    {r.created_by && <span>by {r.created_by}</span>}
                  </div>
                  {r.description && (
                    <div style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.2rem' }}>
                      {r.description.length > 80 ? r.description.slice(0, 80) + '...' : r.description}
                    </div>
                  )}
                </div>

                {/* Right side: stats + status + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexShrink: 0 }}>
                  {/* Stats */}
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#6B7280' }}>
                    {r.views != null && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, color: '#374151', fontSize: '1rem' }}>{r.views}</div>
                        <div>Views</div>
                      </div>
                    )}
                    {r.downloads != null && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, color: '#374151', fontSize: '1rem' }}>{r.downloads}</div>
                        <div>Downloads</div>
                      </div>
                    )}
                  </div>

                  {/* Status pill */}
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      ...(
                        r.status === 'published'
                          ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                          : (r.status === 'completed' || r.status === 'draft')
                          ? { backgroundColor: '#FEF3C7', color: '#92400E' }
                          : { backgroundColor: '#E5E7EB', color: '#374151' }
                      ),
                    }}
                  >
                    {r.status === 'completed' || !r.status ? 'Unpublished' : r.status}
                  </span>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Link
                      href={`/report-creation/${r.id}`}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '7px',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        border: '1px solid #E5E7EB',
                        backgroundColor: '#fff',
                        color: '#374151',
                        textDecoration: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      View
                    </Link>
                    <button
                      onClick={() => openEdit(r)}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '7px',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        border: '1px solid #E5E7EB',
                        backgroundColor: '#fff',
                        color: '#374151',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      Edit
                    </button>
                    {deletingId === r.id ? (
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: '#991b1b' }}>Delete?</span>
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={saving}
                          style={{
                            padding: '0.3rem 0.55rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 500,
                            border: '1px solid #fecaca',
                            backgroundColor: '#fff5f5',
                            color: '#991b1b',
                            cursor: 'pointer',
                          }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          style={{
                            padding: '0.3rem 0.55rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 500,
                            border: '1px solid #E5E7EB',
                            backgroundColor: '#fff',
                            color: '#374151',
                            cursor: 'pointer',
                          }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(r.id)}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '7px',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          border: '1px solid #fecaca',
                          backgroundColor: '#fff5f5',
                          color: '#991b1b',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff5f5'}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reports.length > 1 && (
        <p style={{
          textAlign: 'center', marginTop: '1rem',
          fontSize: '0.85rem', color: '#9CA3AF',
        }}>
          Use the arrow buttons to reorder, then click <strong>Save Order</strong> to persist changes.
        </p>
      )}

      {/* ── Edit Modal ── */}
      {editingReport && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}>
          <div className="card" style={{
            width: '100%', maxWidth: '520px', margin: '1rem',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            padding: '2rem',
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', color: '#111827' }}>
              Edit Report
            </h2>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: '#6B7280' }}>
                Report Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  width: '100%', padding: '0.55rem 0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px', fontSize: '0.9rem',
                  backgroundColor: '#F9FAFB',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#E67E22'}
                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: '#6B7280' }}>
                Description
              </label>
              <textarea
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                style={{
                  width: '100%', padding: '0.55rem 0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px', fontSize: '0.9rem',
                  backgroundColor: '#F9FAFB',
                  resize: 'vertical', boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#E67E22'}
                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: '#6B7280' }}>
                Status
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                style={{
                  width: '100%', padding: '0.55rem 0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px', fontSize: '0.9rem',
                  backgroundColor: '#F9FAFB',
                }}
              >
                <option value="completed">Unpublished</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={closeEdit} className="btn-outline" disabled={saving}>
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editName.trim()}
                className="btn-primary"
                style={{
                  opacity: saving || !editName.trim() ? 0.5 : 1,
                  cursor: saving || !editName.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 300,
          padding: '0.75rem 1.25rem', borderRadius: '8px',
          fontWeight: 600, fontSize: '0.9rem',
          color: toast.type === 'error' ? '#991b1b' : '#065f46',
          backgroundColor: toast.type === 'error' ? '#fee2e2' : '#d1fae5',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast.message}
        </div>
      )}

      <ReasonModal
        open={showReasonModal}
        onClose={() => { setShowReasonModal(false); setPendingAction(null); }}
        onSubmit={handleReasonSubmit}
        title={pendingAction?.type === 'deleteReport' ? 'Why are you deleting this report?' : pendingAction?.type === 'editReport' ? 'Why are you editing this report?' : undefined}
      />
    </PageLayout>
  );
}
