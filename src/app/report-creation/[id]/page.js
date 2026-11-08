'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import ReportDashboard from '@/components/ReportDashboard';
import { getInitiatives, getReportData, getTrendData } from '@/lib/data-service';
import { getAppliedQuestionFilters, getStoredRowInfo, normalizeSnapshot } from '@/lib/report-snapshot';
import { formatDateRange, getReportDateRange } from '@/lib/report-date-range';

export default function ReportViewPage() {
  const { id } = useParams();
  const [userRole, setUserRole] = useState('staff');

  const [report, setReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [selectedInitiative, setSelectedInitiative] = useState(null);
  const [snapshotConfig, setSnapshotConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadReport() {
      try {
        // 1. Fetch report metadata from DB
        const res = await fetch(`/api/reports/${id}`);
        if (!res.ok) {
          setError('Report not found.');
          return;
        }
        const { report: row } = await res.json();
        setReport(row);

        // 2. Parse report_data to check for snapshot format
        let parsed = null;
        try {
          parsed = typeof row.report_data === 'string'
            ? JSON.parse(row.report_data)
            : row.report_data;
        } catch {
          parsed = null;
        }

        // 3. Find the matching initiative
        const initiatives = await getInitiatives();
        const initiative = initiatives.find(i => i.id === row.initiative_id) || null;
        setSelectedInitiative(initiative);

        const normalized = normalizeSnapshot(parsed);
        if (normalized) {
          // ── New snapshot format ──
          // Shape the snapshot results into the format ReportDashboard expects
          const results = normalized.results;
          const shaped = {
            reportId: results.reportId,
            initiativeId: normalized.config.initiativeId,
            initiativeName: results.initiativeName,
            generatedDate: results.generatedDate,
            summary: results.summary,
            chartData: results.chartData,
            tableData: results.filteredTableData,
            ...getStoredRowInfo(results),
            explainability: results.explainability,
            goals: results.goals,
            questionFilters: getAppliedQuestionFilters(normalized.config),
            dateRange: getReportDateRange(normalized.config),
          };
          setReportData(shaped);
          setTrendData(results.trendData || []);
          setSnapshotConfig(normalized.config);
        } else {
          // ── Legacy format — load from static JSON ──
          const data = await getReportData(row.initiative_id);
          setReportData(data);
          const trends = await getTrendData(row.initiative_id);
          setTrendData(trends);
        }
      } catch {
        setError('Failed to load report.');
      } finally {
        setIsLoading(false);
      }
    }
    loadReport();
  }, [id]);

  // Helper to render snapshot config summary
  function renderConfigSummary() {
    if (!snapshotConfig) return null;

    const filterEntries = Object.entries(snapshotConfig.filters || {}).filter(([, v]) => v && v !== 'All');
    const expressions = snapshotConfig.expressions || [];
    const sorts = snapshotConfig.sorts || [];
    const trendConfig = snapshotConfig.trendConfig || null;
    const hasTrendVariables = (trendConfig?.variables || []).length > 0;
    const dateRange = getReportDateRange(snapshotConfig);

    if (filterEntries.length === 0 && expressions.length === 0 && sorts.length === 0 && !hasTrendVariables && !dateRange) {
      return null;
    }

    return (
      <div className="card" style={{
        borderLeft: '4px solid #E67E22',
        marginBottom: '1rem',
        padding: '1rem 1.25rem',
      }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: '0 0 0.5rem 0', color: '#111827' }}>
          Report Configuration
        </h3>
        <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {dateRange && (
            <div>
              <span style={{ fontWeight: '600', color: '#6B7280' }}>Date range: </span>
              responses submitted {formatDateRange(dateRange)}
            </div>
          )}
          {filterEntries.length > 0 && (
            <div>
              <span style={{ fontWeight: '600', color: '#6B7280' }}>Filters: </span>
              {filterEntries.map(([k, v]) => `${k} = "${v}"`).join(', ')}
            </div>
          )}
          {expressions.length > 0 && (
            <div>
              <span style={{ fontWeight: '600', color: '#6B7280' }}>Expressions: </span>
              {expressions.map((e, i) =>
                `${i > 0 ? (e.connector || 'AND') + ' ' : ''}${e.attribute} ${e.operator} "${e.value}"`
              ).join(' ')}
            </div>
          )}
          {sorts.length > 0 && (
            <div>
              <span style={{ fontWeight: '600', color: '#6B7280' }}>Sort: </span>
              {sorts.map((s, i) => `${i + 1}. ${s.attribute} (${s.direction === 'desc' ? 'Z\u2192A' : 'A\u2192Z'})`).join(', ')}
            </div>
          )}
          {hasTrendVariables && (
            <div>
              <span style={{ fontWeight: '600', color: '#6B7280' }}>Trends: </span>
              Variables ({trendConfig.variables.join(', ')}), method {trendConfig.method || 'delta_halves'}, threshold {trendConfig.thresholdPct ?? 2}%,
              display {trendConfig.enabledDisplay === false ? 'off' : 'on'}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <PageLayout title={report ? (report.name || 'Untitled Report') : 'Create Report'}>
      {/* Header: report name + description on the left, back button top right (like the initiative and survey pages) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div style={{ minWidth: 0 }}>
          {report && (
            <>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                {report.name || 'Untitled Report'}
              </h1>
              {report.description && (
                <p style={{ color: '#6B7280', marginTop: '0.25rem' }}>
                  {report.description}
                </p>
              )}
            </>
          )}
        </div>
        <Link href="/reporting" className="btn-outline" style={{ marginLeft: 'auto', fontSize: '0.85rem' }}>← Back to Reporting</Link>
      </div>

      {isLoading ? (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          padding: '4rem', color: '#9CA3AF',
        }}>
          <div style={{
            width: '40px', height: '40px', border: '4px solid #E5E7EB',
            borderTop: '4px solid #E67E22',
            borderRadius: '50%', animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ marginLeft: '1rem', fontSize: '1.1rem' }}>Loading report...</span>
        </div>
      ) : error ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#DC2626', fontSize: '1.1rem' }}>{error}</p>
        </div>
      ) : reportData ? (
        <>
          {renderConfigSummary()}
          <ReportDashboard
            reportData={reportData}
            trendData={trendData}
            selectedInitiative={selectedInitiative}
            userRole={userRole}
          />
        </>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: '#9CA3AF', fontSize: '1.1rem' }}>
            No report data available for this initiative.
          </p>
        </div>
      )}
    </PageLayout>
  );
}
