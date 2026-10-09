'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/PageLayout';
import PublicSiteHeader from '@/components/PublicSiteHeader';
import InitiativeReportLinks from '@/components/InitiativeReportLinks';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';
import { getInitiativeReportsPath } from '@/lib/initiative-slug';

const QUICK_ACTIONS = [
  { href: '/initiative-creation', icon: '📋', title: 'Create Initiative',   description: 'Set up a new initiative and configure scoring' },
  { href: '/report-creation',     icon: '📊', title: 'Generate Report',     description: 'Build and publish a new initiative report' },
  { href: '/survey-distribution', icon: '📤', title: 'Distribute Survey',   description: 'Send surveys to initiative participants' },
  { href: '/goals',               icon: '🎯', title: 'Review Goals',        description: 'Update scoring targets and criteria' },
];

function statusPill(status) {
  if (!status) return <span className="pill pill-gray">Draft</span>;
  const s = status.toLowerCase();
  if (s === 'active')    return <span className="pill pill-green">Active</span>;
  if (s === 'in review') return <span className="pill pill-yellow">In Review</span>;
  if (s === 'draft')     return <span className="pill pill-gray">Draft</span>;
  if (s === 'published') return <span className="pill pill-green">Published</span>;
  return <span className="pill pill-gray">{status}</span>;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function Home() {
  const { user, hasPermission } = useAuthStore();
  const router = useRouter();
  const [initiatives, setInitiatives] = useState([]);
  const [reports, setReports]         = useState([]);
  const [surveyTotal, setSurveyTotal] = useState(0);
  const [isHydrated, setIsHydrated]   = useState(false);

  useEffect(() => { setIsHydrated(true); }, []);

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
    apiFetch('/api/surveys')
      .then(r => r.ok ? r.json() : { surveys: [] })
      .then(d => setSurveyTotal((d.surveys || []).length))
      .catch(() => {});
  }, [isHydrated, user]);

  if (!isHydrated) return null;

  /* ── Non-logged-in landing ── */
  if (!user) {
    return <LandingPage />;
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
  const activeCount    = initiatives.filter(i => (i.status || '').toLowerCase() === 'active').length;
  const surveyCount    = surveyTotal;
  const reportCount    = reports.filter(r => r.status === 'published').length;

  const tableInitiatives = initiatives.slice(0, 8);

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

      {/* ── Quick Actions ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        {QUICK_ACTIONS.map((action, i) => (
          <Link key={action.href} href={action.href} className={i === 0 ? 'btn-primary' : 'btn-outline'}>
            {action.title}
          </Link>
        ))}
      </div>

      {/* ── Stats Row ── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Active Initiatives</div>
          <div className="stat-value">{activeCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Surveys Collected</div>
          <div className="stat-value">{surveyCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reports Published</div>
          <div className="stat-value">{reportCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Initiatives</div>
          <div className="stat-value">{initiatives.length}</div>
        </div>
      </div>


      {/* ── Active Initiatives Table ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Active Initiatives</span>
          <Link href="/initiative-creation" style={{ fontSize: 13, color: '#E67E22', textDecoration: 'none', fontWeight: 500 }}>
            View All →
          </Link>
        </div>
        {tableInitiatives.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            No initiatives yet. <Link href="/initiative-creation" style={{ color: '#E67E22' }}>Create one →</Link>
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Initiative</th>
                  <th>Participants</th>
                  <th>Avg Score</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {tableInitiatives.map((initiative) => (
                  <tr key={initiative.id}>
                    <td style={{ fontWeight: 500, color: '#111827' }}>
                      <Link href={`/initiative-creation?id=${initiative.id}`} style={{ color: '#111827', textDecoration: 'none' }}>
                        {initiative.name}
                      </Link>
                    </td>
                    <td>{initiative.participant_count ?? 0}</td>
                    <td>{(initiative.avg_score ?? 0).toFixed(1)}</td>
                    <td>{statusPill(initiative.status)}</td>
                    <td style={{ color: '#6B7280' }}>{formatDate(initiative.updated_at || initiative.created_at)}</td>
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

function LandingPage() {
  return (
    <div className="public-site-root">
      <PublicSiteHeader />
      <main className="public-site-hero">
        <h1 className="public-site-hero-title">ASRS Initiatives Reporting System</h1>
        <p className="public-site-hero-lede">
          Browse published reports for each initiative. Staff and administrators can log in above for the full workspace.
        </p>
        <div style={{ width: '100%', maxWidth: 720 }}>
          <InitiativeReportLinks />
        </div>
      </main>
    </div>
  );
}
