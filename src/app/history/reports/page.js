'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import ReportDashboard from '@/components/ReportDashboard';
import { normalizeSnapshot } from '@/lib/report-snapshot';
import { apiFetch } from '@/lib/api/client';

export default function HistoricalReportsPage() {
  const [userRole, setUserRole] = useState('public');
  const [authChecked, setAuthChecked] = useState(false);

  const [reports, setReports] = useState([]);
  const [initiatives, setInitiatives] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedInitiativeId, setSelectedInitiativeId] = useState('');

  // Status filter
  const [statusFilter, setStatusFilter] = useState('All');

  // Comparison
  const [selectedIds, setSelectedIds] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  // Auth check
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUserRole(parsed.user_type || 'public');
      } catch {
        setUserRole('public');
      }
    } else {
      setUserRole('public');
    }
    setAuthChecked(true);
  }, []);

  // Load initiatives on mount
  useEffect(() => {
    async function loadInitiatives() {
      try {
        const res = await fetch('/api/initiatives');
        const data = await res.json();
        setInitiatives(data.initiatives || []);
      } catch {
        setInitiatives([]);
      }
    }
    loadInitiatives();
  }, []);

  // Fetch reports whenever filters change
  useEffect(() => {
    if (!authChecked || (userRole !== 'staff' && userRole !== 'admin')) return;
    fetchReports();
  }, [authChecked, userRole, startDate, endDate, selectedInitiativeId]);

  async function fetchReports() {
    setIsLoading(true);
    setShowComparison(false);
    setSelectedIds([]);
    try {
      const params = new URLSearchParams();
      if (selectedInitiativeId) params.set('initiativeId', selectedInitiativeId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString();
      const res = await fetch(`/api/reports${qs ? '?' + qs : ''}`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch {
      setReports([]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCheckbox(reportId) {
    setSelectedIds((prev) => {
      if (prev.includes(reportId)) {
        return prev.filter((id) => id !== reportId);
      }
      if (prev.length >= 2) return prev;
      return [...prev, reportId];
    });
    setShowComparison(false);
  }

  function handleCompare() {
    if (selectedIds.length === 2) {
      setShowComparison(true);
    }
  }

  function handleClearFilters() {
    setStartDate('');
    setEndDate('');
    setSelectedInitiativeId('');
    setStatusFilter('All');
  }

  function downloadCsv(report) {
    let parsed = null;
    try {
      parsed = typeof report.report_data === 'string'
        ? JSON.parse(report.report_data)
        : report.report_data;
    } catch {
      parsed = null;
    }

    const normalized = normalizeSnapshot(parsed);
    const rows = normalized?.results?.filteredTableData || [];
    if (rows.length === 0) {
      alert('No table data available to export.');
      return;
    }

    const columns = Object.keys(rows[0]);
    const csvLines = [
      columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) =>
        columns.map((c) => {
          const val = row[c] == null ? '' : String(row[c]);
          return `"${val.replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(report.name || 'report').replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '\u2014';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatMonthYear(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function getMonthKey(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function parseReportForDashboard(report) {
    let parsed = null;
    try {
      parsed = typeof report.report_data === 'string'
        ? JSON.parse(report.report_data)
        : report.report_data;
    } catch {
      parsed = null;
    }

    const normalized = normalizeSnapshot(parsed);
    if (!normalized) return { reportData: null, trendData: [], initiative: null };

    const results = normalized.results;
    return {
      reportData: {
        reportId: results.reportId,
        initiativeId: normalized.config.initiativeId,
        initiativeName: results.initiativeName,
        generatedDate: results.generatedDate,
        summary: results.summary,
        chartData: results.chartData,
        tableData: results.filteredTableData,
        explainability: results.explainability,
      },
      trendData: results.trendData || [],
      initiative: {
        id: normalized.config.initiativeId,
        name: results.initiativeName,
      },
    };
  }

  // Group reports by month
  function groupByMonth(reports) {
    const groups = {};
    reports.forEach((r) => {
      const key = getMonthKey(r.created_at);
      if (!groups[key]) groups[key] = { label: formatMonthYear(r.created_at), reports: [] };
      groups[key].reports.push(r);
    });
    // Sort descending by month key
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);
  }

  // Compute stats
  const totalReports = reports.length;
  const now = new Date();
  const thisMonthReports = reports.filter((r) => {
    if (!r.created_at) return false;
    const d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const initiativeCount = {};
  reports.forEach((r) => {
    const name = r.initiative_name || 'Unknown';
    initiativeCount[name] = (initiativeCount[name] || 0) + 1;
  });
  const mostActiveInitiative = Object.entries(initiativeCount).sort(([, a], [, b]) => b - a)[0]?.[0] || '\u2014';

  const comparedReports = showComparison
    ? selectedIds.map((id) => reports.find((r) => r.id === id)).filter(Boolean)
    : [];

  const STATUS_FILTERS = ['All', 'Published', 'Unpublished', 'Archived'];

  const visibleReports = reports.filter((r) => {
    if (statusFilter === 'All') return true;
    const selectedStatus = statusFilter === 'Unpublished' ? 'completed' : statusFilter.toLowerCase();
    return (r.status || '').toLowerCase() === selectedStatus;
  });

  const monthGroups = groupByMonth(visibleReports);

  async function updateReportStatus(reportId, newStatus) {
    try {
      const res = await apiFetch('/api/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, status: newStatus }),
      });
      if (res.ok) {
        fetchReports();
      } else {
        const data = await res.json();
        alert(data.error || `Failed to ${newStatus} report`);
      }
    } catch {
      alert('Connection error. Please try again.');
    }
  }

  function getStatusPill(status) {
    const s = (status || 'draft').toLowerCase();
    if (s === 'published') return { bg: '#D1FAE5', color: '#065F46', label: 'Published' };
    if (s === 'archived') return { bg: '#F3F4F6', color: '#6B7280', label: 'Archived' };
    if (s === 'completed') return { bg: '#FEF3C7', color: '#92400E', label: 'Unpublished' };
    return { bg: '#FEF3C7', color: '#92400E', label: 'Draft' };
  }

  function getFormatPill(format) {
    if (!format) return null;
    const fmt = format.toUpperCase();
    if (fmt === 'PDF') return { bg: '#FEE2E2', color: '#991B1B', label: 'PDF' };
    if (fmt === 'CSV') return { bg: '#D1FAE5', color: '#065F46', label: 'CSV' };
    if (fmt === 'HTML') return { bg: '#DBEAFE', color: '#1E40AF', label: 'HTML' };
    return { bg: '#F3F4F6', color: '#374151', label: fmt };
  }

  return (
    <PageLayout title="Historical Reports">
      <div style={{ padding: '0' }}>
        {/* Page heading */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1F2937', margin: 0 }}>
            Historical Reports
          </h1>
          <p style={{ color: '#6B7280', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            Browse, filter, compare, and download previously generated reports.
          </p>
        </div>

        {/* Stats Row */}
        <div className="stats-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div className="stat-card" style={{ flex: '1 1 160px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
            <div className="stat-label" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
              Total Reports
            </div>
            <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, color: '#1F2937' }}>
              {isLoading ? '—' : totalReports}
            </div>
          </div>
          <div className="stat-card" style={{ flex: '1 1 160px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
            <div className="stat-label" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
              This Month
            </div>
            <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 700, color: '#1F2937' }}>
              {isLoading ? '—' : thisMonthReports}
            </div>
          </div>
          <div className="stat-card" style={{ flex: '2 1 260px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
            <div className="stat-label" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
              Most Active Initiative
            </div>
            <div className="stat-value" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1F2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isLoading ? '—' : mostActiveInitiative}
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Initiative
              </label>
              <select
                value={selectedInitiativeId}
                onChange={(e) => setSelectedInitiativeId(e.target.value)}
                style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB', minWidth: '180px' }}
              >
                <option value="">All Initiatives</option>
                {initiatives.map((init) => (
                  <option key={init.id} value={init.id}>{init.name}</option>
                ))}
              </select>
            </div>
            {/* Status pill filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Status
              </label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: '0.35rem 0.85rem',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
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
            </div>

            <button
              onClick={handleClearFilters}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 500, borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff', cursor: 'pointer', alignSelf: 'flex-end' }}
            >
              Clear Filters
            </button>

            {/* Compare controls */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', alignSelf: 'flex-end' }}>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => { setSelectedIds([]); setShowComparison(false); }}
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff', cursor: 'pointer', color: '#6B7280' }}
                >
                  Clear Selection
                </button>
              )}
              <button
                onClick={handleCompare}
                disabled={selectedIds.length !== 2}
                className="btn-primary"
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: selectedIds.length === 2 ? '#E67E22' : '#D1D5DB',
                  color: '#fff',
                  borderRadius: '8px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: selectedIds.length === 2 ? 'pointer' : 'not-allowed',
                  fontSize: '0.88rem',
                }}
              >
                Compare ({selectedIds.length}/2)
              </button>
            </div>
          </div>
        </div>

        {/* Reports grouped by month */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem', color: '#9CA3AF' }}>
            <div style={{ width: '32px', height: '32px', border: '3px solid #E5E7EB', borderTop: '3px solid #E67E22', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ marginLeft: '1rem' }}>Loading reports...</span>
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
            No reports found matching your filters.
          </div>
        ) : (
          monthGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: '2rem' }}>
              {/* Month header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#374151', margin: 0 }}>{group.label}</h2>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
                <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>{group.reports.length} report{group.reports.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Report cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {group.reports.map((r) => {
                  const isChecked = selectedIds.includes(r.id);
                  const isDisabled = !isChecked && selectedIds.length >= 2;
                  const formatPill = getFormatPill(r.format || 'PDF');
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '16px 20px',
                        backgroundColor: isChecked ? 'rgba(230, 126, 34, 0.05)' : '#fff',
                        borderRadius: '10px',
                        border: `1px solid ${isChecked ? '#E67E22' : '#E5E7EB'}`,
                        transition: 'box-shadow 0.15s ease',
                        cursor: 'default',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={() => handleCheckbox(r.id)}
                        style={{ cursor: isDisabled ? 'not-allowed' : 'pointer', width: '16px', height: '16px', flexShrink: 0 }}
                      />

                      {/* Document icon */}
                      <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#D97706" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>

                      {/* Report info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#1F2937', fontSize: '0.95rem', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name || '(Untitled)'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                          {r.initiative_name || '\u2014'} &bull; {formatDate(r.created_at)}
                          {r.created_by ? ` \u00B7 Generated by ${r.created_by}` : ''}
                        </div>
                      </div>

                      {/* Format pill */}
                      {formatPill && (
                        <span style={{ padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.73rem', fontWeight: 700, backgroundColor: formatPill.bg, color: formatPill.color, flexShrink: 0 }}>
                          {formatPill.label}
                        </span>
                      )}

                      {/* File size */}
                      {r.file_size && (
                        <span style={{ fontSize: '0.8rem', color: '#9CA3AF', flexShrink: 0 }}>
                          {r.file_size}
                        </span>
                      )}

                      {/* Status pill */}
                      {(() => {
                        const sp = getStatusPill(r.status);
                        return (
                          <span style={{ padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.73rem', fontWeight: 700, backgroundColor: sp.bg, color: sp.color, flexShrink: 0 }}>
                            {sp.label}
                          </span>
                        );
                      })()}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
                        {(r.status || '').toLowerCase() !== 'published' && (
                          <button
                            onClick={() => updateReportStatus(r.id, 'published')}
                            style={{ fontSize: '0.83rem', fontWeight: 500, color: '#065F46', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}
                          >
                            Publish
                          </button>
                        )}
                        {(r.status || '').toLowerCase() === 'published' && (
                          <button
                            onClick={() => updateReportStatus(r.id, 'completed')}
                            style={{ fontSize: '0.83rem', fontWeight: 500, color: '#92400E', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}
                          >
                            Unpublish
                          </button>
                        )}
                        {(r.status || '').toLowerCase() !== 'archived' && (
                          <button
                            onClick={() => { if (confirm('Archive this report?')) updateReportStatus(r.id, 'archived'); }}
                            style={{ fontSize: '0.83rem', fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}
                          >
                            Archive
                          </button>
                        )}
                        <button
                          onClick={() => downloadCsv(r)}
                          style={{ fontSize: '0.83rem', fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}
                        >
                          Download
                        </button>
                        <Link
                          href={`/report-creation/${r.id}`}
                          style={{ fontSize: '0.83rem', fontWeight: 600, color: '#E67E22', textDecoration: 'none', padding: '0.25rem 0' }}
                          onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                          onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                        >
                          View Report
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Side-by-Side Comparison */}
        {showComparison && comparedReports.length === 2 && (
          <div className="card" style={{ marginTop: '2rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1F2937', margin: 0 }}>Report Comparison</h2>
              <button
                onClick={() => setShowComparison(false)}
                style={{ fontSize: '0.83rem', color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {comparedReports.map((report) => {
                const { reportData, trendData, initiative } = parseReportForDashboard(report);
                return (
                  <div key={report.id} style={{ border: '1px solid #E5E7EB', borderRadius: '10px', padding: '1rem', overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1F2937', borderBottom: '2px solid #E67E22', paddingBottom: '0.5rem' }}>
                      {report.name || '(Untitled)'}
                      <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#6B7280', marginLeft: '0.5rem' }}>{formatDate(report.created_at)}</span>
                    </h3>
                    {reportData ? (
                      <ReportDashboard
                        reportData={reportData}
                        trendData={trendData}
                        selectedInitiative={initiative}
                        userRole={userRole}
                      />
                    ) : (
                      <p style={{ color: '#9CA3AF', padding: '1rem', textAlign: 'center' }}>No report data available.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
