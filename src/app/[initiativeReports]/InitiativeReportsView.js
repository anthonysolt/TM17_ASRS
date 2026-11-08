'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import ReportDashboard from '@/components/ReportDashboard';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { usePublicInitiatives } from '@/lib/use-public-initiatives';
import { findInitiativeByReportsSlug } from '@/lib/initiative-slug';
import { parseReportForDashboard } from '@/lib/report-snapshot';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function EmptyState({ title, body }) {
  return (
    <div className="asrs-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
      <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>
        {title}
      </p>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.55, maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto' }}>
        {body}
      </p>
      <Link href="/" className="btn-outline" style={{ marginTop: '1.25rem', display: 'inline-flex' }}>
        Back to home
      </Link>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="public-reporting-loading" role="status" aria-live="polite">
      <div className="public-reporting-loading-spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export default function InitiativeReportsView({ slug }) {
  const { user } = useAuthStore();
  const userRole = user?.user_type || 'public';
  const { initiatives, loading: initiativesLoading, error: initiativesError } = usePublicInitiatives();
  const initiative = useMemo(() => findInitiativeByReportsSlug(initiatives, slug), [initiatives, slug]);

  // Reports fetched for a given initiative id; loading is derived by comparing ids.
  const [reportsResult, setReportsResult] = useState({ initiativeId: null, reports: [], error: null });
  // Reports start collapsed; each caret opens that report's dashboard in place.
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const initiativeId = initiative?.id ?? null;
  const reportsLoading = initiativeId != null && reportsResult.initiativeId !== initiativeId;
  const reports = reportsLoading ? [] : reportsResult.reports;
  const reportsError = reportsLoading ? null : reportsResult.error;

  useEffect(() => {
    if (initiativeId == null) return;
    let cancelled = false;
    fetch(`/api/reports/public?initiativeId=${encodeURIComponent(initiativeId)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load reports'))))
      .then((data) => {
        if (cancelled) return;
        const list = data.reports || [];
        setReportsResult({ initiativeId, reports: list, error: null });
        setExpandedIds(new Set());
      })
      .catch((err) => {
        if (!cancelled) setReportsResult({ initiativeId, reports: [], error: err });
      });
    return () => { cancelled = true; };
  }, [initiativeId]);

  function toggleReport(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const title = initiative ? `${initiative.name} Reports` : 'Initiative reports';

  let content;
  if (initiativesLoading) {
    content = <LoadingState label="Loading initiative…" />;
  } else if (initiativesError) {
    content = <EmptyState title="Unable to load reports" body="Something went wrong while loading this page. Please try again later." />;
  } else if (!initiative) {
    content = (
      <EmptyState
        title="Initiative not found"
        body="This initiative may have been renamed or removed. Check the home page for the current list of initiatives."
      />
    );
  } else {
    content = (
      <>
        <section className="card public-reporting-intro" aria-labelledby="initiative-reports-heading">
          <p className="public-reporting-intro-eyebrow">Initiative reports</p>
          <h1 id="initiative-reports-heading" className="public-reporting-intro-title">
            {initiative.name}
          </h1>
          <p className="public-reporting-intro-body">
            {initiative.description || 'Published reports for this initiative. Expand a report to view its charts and tables.'}
          </p>
        </section>

        {reportsLoading ? (
          <LoadingState label="Loading published reports…" />
        ) : reportsError ? (
          <EmptyState title="Unable to load reports" body="Something went wrong while loading reports. Please try again later." />
        ) : reports.length === 0 ? (
          <EmptyState
            title="No published reports yet"
            body="When staff publish a report for this initiative, it will appear here. Check back later."
          />
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Published reports ({reports.length})
              </div>
              {reports.map((report) => {
                const isExpanded = expandedIds.has(report.id);
                const detailsId = `report-details-${report.id}`;
                const parsed = isExpanded ? parseReportForDashboard(report) : null;
                return (
                  <div
                    key={report.id}
                    style={{
                      border: isExpanded ? '2px solid #E67E22' : '1px solid #E5E7EB',
                      borderRadius: '10px',
                      backgroundColor: '#fff',
                      overflow: 'hidden',
                    }}
                  >
                    {/* The whole header toggles the report; the caret is the explicit control. */}
                    <div
                      onClick={() => toggleReport(report.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                        padding: '1rem 1.25rem',
                        backgroundColor: isExpanded ? '#FFF7ED' : '#fff',
                        color: '#111827',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{report.name || 'Untitled Report'}</div>
                        <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#6B7280' }}>
                          {formatDate(report.created_at)}
                          {report.description ? ` · ${report.description}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="row-icon-btn"
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                        aria-label={`${isExpanded ? 'Hide' : 'Show'} ${report.name || 'report'}`}
                        title={isExpanded ? 'Hide report' : 'Show report'}
                        onClick={(e) => { e.stopPropagation(); toggleReport(report.id); }}
                        style={{ flexShrink: 0 }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>

                    {isExpanded && (
                      <div id={detailsId} style={{ padding: '1rem 1.25rem 1.25rem', borderTop: '1px solid #FED7AA' }}>
                        {parsed?.reportData ? (
                          <ReportDashboard
                            reportData={parsed.reportData}
                            trendData={parsed.trendData}
                            selectedInitiative={initiative}
                            userRole={userRole}
                            reportDbId={report.id}
                            preloadedInsights={parsed.aiInsights}
                            showDataTable={false}
                          />
                        ) : (
                          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem', margin: 0 }}>
                            This report has no viewable data.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <PageLayout title={title} requireAuth={false} publicShell>
      {content}
    </PageLayout>
  );
}
