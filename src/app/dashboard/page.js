'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/PageLayout';
import InitiativeReportLinks from '@/components/InitiativeReportLinks';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';
import { getInitiativeReportsPath } from '@/lib/initiative-slug';
import { normalizeInitiativeStatus } from '@/lib/initiative-status';
import { fetchResponseCounts, responseCountFor } from '@/lib/surveys/survey-admin-client';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}


const SECTION_HEADING_STYLE = { fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '16px' };

/** A titled row of stat cards (used by the Initiatives and Reports sections). */
function StatSection({ title, stats }) {
  return (
    <section style={{ marginBottom: '24px' }}>
      <h2 style={SECTION_HEADING_STYLE}>{title}</h2>
      <div className="stats-row">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Responses per survey template; same chart as Survey Analytics on the Surveys page. */
function SurveyAnalyticsSection({ templates, responseCounts }) {
  const countFor = (templateId) => responseCountFor(responseCounts, templateId);
  const maxCount = Math.max(...templates.map((t) => countFor(t.id)), 1);
  return (
    <section style={{ marginBottom: '24px' }}>
      <h2 style={SECTION_HEADING_STYLE}>Surveys</h2>
      <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px' }}>
        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginTop: 0, marginBottom: '16px' }}>
          Submission distribution across templates
        </p>
        {templates.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>No templates to analyze.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {templates.map((template) => {
              const count = countFor(template.id);
              const barWidth = Math.round((count / maxCount) * 100);
              return (
                <div key={template.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                    <span style={{ color: '#374151', fontWeight: 500 }}>{template.title}</span>
                    <span style={{ color: '#6B7280' }}>{count} response{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${barWidth}%`, height: '100%',
                      backgroundColor: '#E67E22', borderRadius: '4px',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Logged-in workspace dashboard. The public initiatives/reports page lives at
 * `/` for everyone; this page is where users land after logging in.
 */
export default function DashboardPage() {
  const { user, hydrated: isHydrated } = useAuthStore();
  const router = useRouter();
  const [initiatives, setInitiatives] = useState([]);
  const [reports, setReports]         = useState([]);
  const [surveyTotal, setSurveyTotal] = useState(0);
  const [surveyTemplates, setSurveyTemplates] = useState([]);
  const [responseCounts, setResponseCounts] = useState({});

  useEffect(() => {
    if (!isHydrated || !user) return;

    if (user.user_type === 'public') {
      fetch('/api/reports/public')
        .then(r => r.ok ? r.json() : { reports: [] })
        .then(d => setReports(d.reports || []))
        .catch(() => {});
      return;
    }

    apiFetch('/api/initiatives')
      .then(r => r.json())
      .then(d => setInitiatives(d.initiatives || []))
      .catch(() => {});
    apiFetch('/api/reports')
      .then(r => r.json())
      .then(d => setReports(d.reports || []))
      .catch(() => {});
    // Only the total is shown, so ask for the counts instead of the responses.
    apiFetch('/api/surveys/counts')
      .then(r => r.ok ? r.json() : { total: 0 })
      .then(d => setSurveyTotal(Number(d.total) || 0))
      .catch(() => {});
    // Survey Analytics chart: templates and responses per template.
    fetch('/api/surveys/templates')
      .then(r => r.ok ? r.json() : [])
      .then(d => setSurveyTemplates(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetchResponseCounts()
      .then(({ counts }) => setResponseCounts(counts || {}))
      .catch(() => {});
  }, [isHydrated, user]);

  if (!isHydrated) return null;

  // PageLayout sends logged-out visitors to /login.
  if (!user) {
    return <PageLayout title="Dashboard" />;
  }

  const isPublic = user.user_type === 'public';

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  /* ── Public user dashboard ── */
  if (isPublic) {
    const publishedReports = reports.filter(r => r.status === 'published' || r.is_public);
    return (
      <PageLayout title="Dashboard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
              {greeting}, {user.first_name || user.email?.split('@')[0] || 'there'}
            </h2>
            <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>{dateStr}</p>
          </div>
        </div>

        {/* ── Initiative Report Pages ── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Initiative Reports</span>
          </div>
          <InitiativeReportLinks />
        </div>

        {/* ── Published Reports ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Published Reports</span>
          </div>
          {publishedReports.length === 0 ? (
            <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
              No published reports available yet.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Initiative</th>
                    <th>Published</th>
                  </tr>
                </thead>
                <tbody>
                  {publishedReports.map((report) => (
                    <tr key={report.id || report.report_id} style={{ cursor: 'pointer' }} onClick={() => router.push(report.initiative_name ? getInitiativeReportsPath(report.initiative_name) : '/reporting')}>
                      <td style={{ fontWeight: 500, color: '#E67E22' }}>{report.title || report.name || 'Report'}</td>
                      <td>{report.initiative_name || '—'}</td>
                      <td style={{ color: '#6B7280' }}>{formatDate(report.published_at || report.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageLayout>
    );
  }

  /* ── Staff / Admin dashboard ── */
  const activeCount = initiatives.filter(i => normalizeInitiativeStatus(i.settings?.status ?? i.status) === 'active').length;
  const publishedReportCount = reports.filter(r => r.status === 'published').length;
  const archivedReportCount = reports.filter(r => r.status === 'archived').length;
  const unpublishedReportCount = reports.length - publishedReportCount - archivedReportCount;

  return (
    <PageLayout title="Dashboard">

      {/* ── Welcome Row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
            {greeting}, {user.first_name || user.email?.split('@')[0] || 'there'}
          </h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>{dateStr}</p>
        </div>
      </div>

      {/* ── Initiatives ── */}
      <StatSection
        title="Initiatives"
        stats={[
          { label: 'Active Initiatives', value: activeCount },
          { label: 'Surveys Collected', value: surveyTotal },
          { label: 'Total Initiatives', value: initiatives.length },
        ]}
      />

      {/* ── Reports ── */}
      <StatSection
        title="Reports"
        stats={[
          { label: 'Published Reports', value: publishedReportCount },
          { label: 'Unpublished Reports', value: unpublishedReportCount },
          { label: 'Archived Reports', value: archivedReportCount },
        ]}
      />

      {/* ── Surveys ── */}
      <SurveyAnalyticsSection templates={surveyTemplates} responseCounts={responseCounts} />

    </PageLayout>
  );
}
