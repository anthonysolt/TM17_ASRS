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
  const [selectedReportId, setSelectedReportId] = useState(null);

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
        setSelectedReportId(list[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) setReportsResult({ initiativeId, reports: [], error: err });
      });
    return () => { cancelled = true; };
  }, [initiativeId]);

  const selectedReport = reports.find((r) => String(r.id) === String(selectedReportId)) || null;
  const parsed = useMemo(() => (selectedReport ? parseReportForDashboard(selectedReport) : null), [selectedReport]);

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
            {initiative.description || 'Published reports for this initiative. Select a report to view its charts and tables.'}
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
                const isSelected = String(selectedReportId) === String(report.id);
                return (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => setSelectedReportId(report.id)}
                    aria-pressed={isSelected}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      padding: '1rem 1.25rem',
                      border: isSelected ? '2px solid #E67E22' : '1px solid #E5E7EB',
                      borderRadius: '10px',
                      backgroundColor: isSelected ? '#FFF7ED' : '#fff',
                      color: '#111827',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{report.name || 'Untitled Report'}</div>
                      <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#6B7280' }}>
                        {formatDate(report.created_at)}
                        {report.description ? ` · ${report.description}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isSelected ? '#C2410C' : '#047857', whiteSpace: 'nowrap' }}>
                      {isSelected ? 'Viewing' : 'View report'}
                    </span>
                  </button>
                );
              })}
            </div>

            {parsed?.reportData ? (
              <ReportDashboard
                key={selectedReport.id}
                reportData={parsed.reportData}
                trendData={parsed.trendData}
                selectedInitiative={initiative}
                userRole={userRole}
                reportDbId={selectedReport.id}
                preloadedInsights={parsed.aiInsights}
                showDataTable={false}
              />
            ) : (
              <EmptyState title="Report data unavailable" body="This report has no viewable data. Try another report." />
            )}
          </>
        )}
      </>
    );
  }

  return (
    <PageLayout title={title} requireAuth={false}>
      {content}
    </PageLayout>
  );
}
