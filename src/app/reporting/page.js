'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import ReportDashboard from '@/components/ReportDashboard';
import { parseReportForDashboard } from '@/lib/report-snapshot';
import { apiFetch } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import SearchField, { FILTER_BAR_STYLE, InitiativeFilter, SortSelect, compareBySort } from '@/components/ListFilters';
import ReportList from '@/components/ReportList';

const STATUS_FILTERS = ['All', 'Published', 'Unpublished', 'Archived'];

export default function ReportingPage() {
  const { user: authUser, hydrated } = useAuthStore();
  const [userRole, setUserRole] = useState('public');

  const [selectedInitiative, setSelectedInitiative] = useState(null);
  const [initiatives, setInitiatives] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [reportDbId, setReportDbId] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [noReport, setNoReport] = useState(false);
  const [reportMap, setReportMap] = useState({});
  const [publishedReportMap, setPublishedReportMap] = useState({});

  const [allReports, setAllReports] = useState([]);
  const [publicSelectedInitiativeId, setPublicSelectedInitiativeId] = useState('');
  const [publicSelectedYear, setPublicSelectedYear] = useState('');
  const [publicSelectedReportId, setPublicSelectedReportId] = useState('');

  const [mgmtReports, setMgmtReports] = useState([]);
  const [mgmtLoading, setMgmtLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedInitiativeId, setSelectedInitiativeId] = useState('');

  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (hydrated && authUser) {
      setUserRole(authUser.user_type || 'public');
    } else if (hydrated) {
      setUserRole('public');
    }
  }, [hydrated, authUser]);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setIsLoading(true);
    try {
      let role = 'public';
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          role = parsed.user_type || 'public';
        }
      } catch {}
      const isStaff = role === 'staff' || role === 'admin';

      let initiativesData, reportsData;
      if (isStaff) {
        const [initiativesRes, reportsRes] = await Promise.all([
          apiFetch('/api/initiatives'),
          apiFetch('/api/reports'),
        ]);
        initiativesData = await initiativesRes.json();
        reportsData = await reportsRes.json();
      } else {
        const [initiativesRes, reportsRes] = await Promise.all([
          fetch('/api/initiatives/public'),
          fetch('/api/reports/public'),
        ]);
        initiativesData = await initiativesRes.json();
        reportsData = await reportsRes.json();
      }

      const initiativesList = initiativesData.initiatives || [];
      setInitiatives(initiativesList);

      const reportsList = reportsData.reports || [];
      setAllReports(reportsList);
      setMgmtReports(reportsList);

      const map = {};
      const pubMap = {};
      for (const r of reportsList) {
        if (!map[r.initiative_id]) {
          map[r.initiative_id] = r;
        }
        if ((r.status || '').toLowerCase() === 'published' && !pubMap[r.initiative_id]) {
          pubMap[r.initiative_id] = r;
        }
      }
      setReportMap(map);
      setPublishedReportMap(pubMap);

      const visibleInitiatives = isStaff
        ? initiativesList
        : initiativesList.filter(i => pubMap[i.id]);
      if (!isStaff) {
        setInitiatives(visibleInitiatives);
      }

      if (visibleInitiatives.length > 0) {
        if (isStaff) {
          // Staff see report management, which lists reports without their
          // snapshots; the published-report viewer below is public-only.
          setSelectedInitiative(visibleInitiatives[0]);
        } else {
          const publishedOnly = reportsList
            .filter((r) => (r.status || '').toLowerCase() === 'published')
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          const first = publishedOnly[0] || null;
          if (first) {
            const firstYear = String(new Date(first.created_at || Date.now()).getFullYear());
            setPublicSelectedInitiativeId(String(first.initiative_id || ''));
            setPublicSelectedYear(firstYear);
            setPublicSelectedReportId(String(first.id));
            loadReportFromRecord(first);
          } else {
            setReportData(null);
          }
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const loadMgmtData = useCallback(async () => {
    setMgmtLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedInitiativeId) params.set('initiativeId', selectedInitiativeId);
      const qs = params.toString();
      const res = await apiFetch(`/api/reports${qs ? '?' + qs : ''}`);
      const data = await res.json();
      const reportsList = data.reports || [];
      setMgmtReports(reportsList);
      setAllReports(reportsList);
    } catch {
      setMgmtReports([]);
    } finally {
      setMgmtLoading(false);
    }
  }, [selectedInitiativeId]);

  // Staff and admins land on report management; reload when the initiative filter changes.
  useEffect(() => {
    if (userRole === 'staff' || userRole === 'admin') loadMgmtData();
  }, [userRole, loadMgmtData]);

  function loadReportFromRecord(report) {
    if (!report) {
      setReportData(null);
      setTrendData([]);
      setReportDbId(null);
      setAiInsights(null);
      setNoReport(true);
      return;
    }

    if (reportDbId != null && String(reportDbId) === String(report.id)) {
      return;
    }

    setNoReport(false);
    setReportDbId(report.id ?? null);
    const parsed = parseReportForDashboard(report);
    if (parsed.reportData) {
      const matchedInitiative = initiatives.find(
        (initiative) => String(initiative.id) === String(parsed.initiative?.id)
      );
      setSelectedInitiative(matchedInitiative || parsed.initiative);
      setReportData(parsed.reportData);
      setTrendData(parsed.trendData || []);
      setAiInsights(null);
      return;
    }

    setReportData(null);
    setTrendData([]);
    setAiInsights(null);
    setNoReport(true);
  }

  const publishedReports = useMemo(
    () => allReports.filter((r) => (r.status || '').toLowerCase() === 'published'),
    [allReports]
  );
  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin';
  const publicPublishedReports = useMemo(
    () => (isStaffOrAdmin ? [] : publishedReports),
    [isStaffOrAdmin, publishedReports]
  );
  const publicReportsByInitiative = useMemo(() => {
    const grouped = {};
    for (const report of publicPublishedReports) {
      const initiativeId = String(report.initiative_id || '');
      if (!initiativeId) continue;
      const initiativeName = report.initiative_name || getInitiativeName(report.initiative_id) || 'Unnamed initiative';
      if (!grouped[initiativeId]) {
        grouped[initiativeId] = { initiativeId, initiativeName, years: {} };
      }
      const year = String(new Date(report.created_at || Date.now()).getFullYear());
      if (!grouped[initiativeId].years[year]) {
        grouped[initiativeId].years[year] = [];
      }
      grouped[initiativeId].years[year].push(report);
    }

    for (const initiative of Object.values(grouped)) {
      for (const year of Object.keys(initiative.years)) {
        initiative.years[year].sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
        );
      }
    }
    return grouped;
  }, [publicPublishedReports]);
  const publicInitiativeOptions = useMemo(
    () => Object.values(publicReportsByInitiative).sort((a, b) => a.initiativeName.localeCompare(b.initiativeName)),
    [publicReportsByInitiative]
  );
  const publicYearOptions = useMemo(() => {
    const initiative = publicReportsByInitiative[publicSelectedInitiativeId];
    if (!initiative) return [];
    return Object.keys(initiative.years).sort((a, b) => Number(b) - Number(a));
  }, [publicReportsByInitiative, publicSelectedInitiativeId]);
  const publicReportOptions = useMemo(() => {
    const initiative = publicReportsByInitiative[publicSelectedInitiativeId];
    if (!initiative) return [];
    return initiative.years[publicSelectedYear] || [];
  }, [publicReportsByInitiative, publicSelectedInitiativeId, publicSelectedYear]);

  function formatDate(dateStr) {
    if (!dateStr) return '\u2014';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getInitiativeName(initId) {
    const init = initiatives.find(i => i.initiative_id === initId || i.id === initId);
    return init ? (init.initiative_name || init.name) : '\u2014';
  }

  function handleClearFilters() {
    setSelectedInitiativeId('');
    setStatusFilter('All');
    setSearchQuery('');
  }


  const filteredMgmtReports = mgmtReports
    .filter((r) => {
      const matchesSearch = !searchQuery ||
        (r.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.initiative_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const selectedStatus = statusFilter === 'Unpublished' ? 'completed' : statusFilter.toLowerCase();
      const matchesStatus = statusFilter === 'All' ||
        (r.status || '').toLowerCase() === selectedStatus;
      return matchesSearch && matchesStatus;
    })
    .sort(compareBySort(sortBy, (r) => r.created_at, (r) => r.name));

  useEffect(() => {
    if (isStaffOrAdmin) return;
    if (publicInitiativeOptions.length === 0) {
      setPublicSelectedInitiativeId('');
      setPublicSelectedYear('');
      setPublicSelectedReportId('');
      setReportData(null);
      return;
    }

    const hasInitiative = publicReportsByInitiative[publicSelectedInitiativeId];
    const initiativeId = hasInitiative ? publicSelectedInitiativeId : publicInitiativeOptions[0].initiativeId;
    if (initiativeId !== publicSelectedInitiativeId) {
      setPublicSelectedInitiativeId(initiativeId);
      return;
    }

    const years = Object.keys(publicReportsByInitiative[initiativeId].years).sort((a, b) => Number(b) - Number(a));
    if (!years.length) return;
    const year = years.includes(publicSelectedYear) ? publicSelectedYear : years[0];
    if (year !== publicSelectedYear) {
      setPublicSelectedYear(year);
      return;
    }

    const reports = publicReportsByInitiative[initiativeId].years[year] || [];
    if (!reports.length) return;
    const selectedExists = reports.some((r) => String(r.id) === publicSelectedReportId);
    const reportId = selectedExists ? publicSelectedReportId : String(reports[0].id);
    if (reportId !== publicSelectedReportId) {
      setPublicSelectedReportId(reportId);
      return;
    }

    const selectedReport = reports.find((r) => String(r.id) === reportId) || null;
    loadReportFromRecord(selectedReport);
  }, [
    isStaffOrAdmin,
    reportDbId,
    initiatives,
    publicInitiativeOptions,
    publicReportsByInitiative,
    publicSelectedInitiativeId,
    publicSelectedYear,
    publicSelectedReportId,
  ]);


  const layoutTitle = hydrated && !authUser ? 'Published reports' : 'Reports';

  return (
    <PageLayout title={layoutTitle} requireAuth={false}>
      {isStaffOrAdmin && (
        <>
          {/* ── Page header (same style as the Initiatives page) ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Reports</h2>
            <Link href="/report-creation" className="btn-primary btn-create">
              Create Report
            </Link>
          </div>

        </>
      )}

      {/* Public view: published reports. Staff and admins see report management below. */}
      {!isStaffOrAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <>
              <section className="card public-reporting-intro" aria-labelledby="public-reporting-heading">
                <p className="public-reporting-intro-eyebrow">Community access</p>
                <h1 id="public-reporting-heading" className="public-reporting-intro-title">
                  Published initiative reports
                </h1>
                <p className="public-reporting-intro-body">
                  These reports are published by ASRS staff. Select an initiative to view charts and tables in your browser. Downloads and staff tools are available after you log in.
                </p>
              </section>

              {isLoading ? (
                <div className="public-reporting-loading" role="status" aria-live="polite">
                  <div className="public-reporting-loading-spinner" aria-hidden />
                  <span>Loading published reports…</span>
                </div>
              ) : initiatives.length === 0 ? (
                <div className="asrs-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>
                    No published reports yet
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.55, maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto' }}>
                    When staff publish a report for an initiative, it will appear here. You can still use the home page or check back later.
                  </p>
                  <Link href="/" className="btn-outline" style={{ marginTop: '1.25rem', display: 'inline-flex' }}>
                    Back to home
                  </Link>
                </div>
              ) : (
                <>
                  <section className="asrs-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                    <h2 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '1rem' }}>Choose report</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '0.3rem' }}>
                          Initiative
                        </label>
                        <select
                          value={publicSelectedInitiativeId}
                          onChange={(e) => {
                            setPublicSelectedInitiativeId(e.target.value);
                            setPublicSelectedYear('');
                            setPublicSelectedReportId('');
                          }}
                          style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}
                        >
                          {publicInitiativeOptions.map((initiative) => (
                            <option key={initiative.initiativeId} value={initiative.initiativeId}>
                              {initiative.initiativeName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '0.3rem' }}>
                          Year
                        </label>
                        <select
                          value={publicSelectedYear}
                          onChange={(e) => {
                            setPublicSelectedYear(e.target.value);
                            setPublicSelectedReportId('');
                          }}
                          style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}
                        >
                          {publicYearOptions.map((year) => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '0.3rem' }}>
                          Report
                        </label>
                        <select
                          value={publicSelectedReportId}
                          onChange={(e) => setPublicSelectedReportId(e.target.value)}
                          style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}
                        >
                          {publicReportOptions.map((report) => (
                            <option key={report.id} value={String(report.id)}>
                              {(report.name || '(Untitled)')} - {formatDate(report.created_at)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </section>

                  {reportData && (
                    <ReportDashboard
                      reportData={reportData}
                      trendData={trendData}
                      selectedInitiative={selectedInitiative}
                      userRole={userRole}
                      reportDbId={reportDbId}
                      preloadedInsights={aiInsights}
                    />
                  )}

                  {!reportData && (
                    <div className="asrs-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                      <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>
                        Report not available for this initiative
                      </p>
                      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.55 }}>
                        Try another initiative, or check back after staff have published a report.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
        </div>
      )}

      {isStaffOrAdmin && (
        <div>
          <div style={FILTER_BAR_STYLE}>
            <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search reports..." />

            <InitiativeFilter value={selectedInitiativeId} onChange={setSelectedInitiativeId} initiatives={initiatives} />

            <SortSelect value={sortBy} onChange={setSortBy} />

            {/* Status filter sits on its own row below the other controls, with Clear at the bottom right. */}
            <div style={{ flex: '1 1 100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status Filter</label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
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
              <button onClick={handleClearFilters} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 500, borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff', cursor: 'pointer', marginLeft: 'auto' }}>
                Clear
              </button>
            </div>
          </div>

          {mgmtLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem', color: '#9CA3AF' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid #E5E7EB', borderTop: '3px solid #E67E22', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <span style={{ marginLeft: '1rem' }}>Loading reports...</span>
            </div>
          ) : (
            <ReportList
              reports={filteredMgmtReports}
              getInitiativeName={getInitiativeName}
              onChanged={loadMgmtData}
              onNotify={showToast}
              emptyState={(
                <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
                  <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No reports found.</p>
                  <p style={{ fontSize: '0.9rem' }}>
                    {mgmtReports.length === 0 ? 'Create reports from the Report Creation page.' : 'Try adjusting your search or filters.'}
                  </p>
                </div>
              )}
            />
          )}

        </div>
      )}


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

    </PageLayout>
  );
}
