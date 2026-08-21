/**
 * ============================================================================
 * REPORT DASHBOARD — The main content area displaying the selected report.
 * ============================================================================
 * This is the "brain" of the report page. It assembles all the sub-components:
 * - Report header (title, UUID, date)
 * - Summary statistics cards
 * - Filter and Sort panels
 * - Chart display (pie, bar, line)
 * - Data table
 * - Trend display
 * - Export and Share panels (conditional on user role)
 *
 * Props:
 * - reportData: Object — The full report data from dataService
 * - trendData: Array — The trend data for this initiative
 * - selectedInitiative: Object — The currently selected initiative
 * - userRole: string — 'public', 'staff', or 'admin'
 * ============================================================================
 */
'use client';

import { useState, useMemo } from 'react';
import FilterPanel from './FilterPanel';
import SortPanel from './SortPanel';
import ChartDisplay from './ChartDisplay';
import DataTable from './DataTable';
import TrendDisplay from './TrendDisplay';
import ExportPanel from './ExportPanel';
import SharePanel from './SharePanel';
import AIInsightsPanel from './AIInsightsPanel';
import { getSortedReportData } from '@/lib/data-service';
import { buildFilteredChartData, filterReportRows, getReportFilterColumns } from '@/lib/report-view-filters';

export default function ReportDashboard({ reportData, trendData, selectedInitiative, userRole, reportDbId, preloadedInsights }) {
  // ---- STATE for filters and sorts ----
  // activeFilters stores the user's current filter selections as key-value pairs
  // Example: { grade: "7th", school: "Lincoln MS" }
  const [activeFilters, setActiveFilters] = useState({});

  // activeSorts stores the user's sorting preferences as an array of objects
  // Example: [{ attribute: "Grade", direction: "asc" }]
  const [activeSorts, setActiveSorts] = useState([]);

  // Track which view tab is active: 'charts', 'table', or 'both'
  const [activeView, setActiveView] = useState('both');

  // ---- STATE for inline Data Tools (filters, sort, calculations) ----
  // Inline column filters — keyed by column name, value is the filter text
  const [columnFilters, setColumnFilters] = useState({});
  // Inline sort — single column sort via clickable headers
  const [inlineSortColumn, setInlineSortColumn] = useState(null);
  const [inlineSortDirection, setInlineSortDirection] = useState('asc');
  // Whether the Data Tools section is expanded
  const [showDataTools, setShowDataTools] = useState(false);

  const filterAttributes = getReportFilterColumns(reportData?.tableData || []);

  /**
   * useMemo — Recalculates filtered & sorted table data only when
   * the filters, sorts, or base report data change. This prevents
   * unnecessary recalculations on every render.
   */
  const processedTableData = useMemo(() => {
    if (!reportData?.tableData) return [];

    // Step 1: Apply filters (simulates database WHERE clause per REP020)
    let data = filterReportRows(reportData.tableData, activeFilters);

    // Step 2: Apply sorts (simulates database ORDER BY per REP021)
    // Per REP022, filtering happens BEFORE sorting
    if (activeSorts.length > 0) {
      data = getSortedReportData(data, activeSorts);
    }

    return data;
  }, [reportData, activeFilters, activeSorts]);

  /**
   * Recompute chart data from the filtered table rows so charts
   * update when the user applies filters (Bug 2 fix).
   */
  const processedChartData = useMemo(() => {
    if (!reportData?.chartData) return null;

    const hasActiveFilters = Object.values(activeFilters).some(v => v && v !== 'All');
    if (!hasActiveFilters) return reportData.chartData;

    return buildFilteredChartData(processedTableData);
  }, [reportData, processedTableData, activeFilters]);

  const filteredAverageRating = (() => {
    const ratingColumn = filterAttributes.find(column => /rating/i.test(column));
    if (!ratingColumn) return reportData?.summary?.averageRating ?? 0;
    const values = processedTableData.map(row => Number(row[ratingColumn])).filter(Number.isFinite);
    if (values.length === 0) return 0;
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  })();

  const hasActiveReportFilters = Object.values(activeFilters).some(value => value && value !== 'All');
  const liveDroppedByFilters = Math.max((reportData.tableData?.length || 0) - processedTableData.length, 0);

  /**
   * Inline-filtered & sorted table data — applies the Data Tools column
   * filters and inline sort on top of the already-processed data from the
   * main Filter/Sort panels. All client-side, local to this component.
   */
  const inlineProcessedData = useMemo(() => {
    let data = processedTableData;

    // Apply inline column filters
    Object.entries(columnFilters).forEach(([col, val]) => {
      if (val) {
        data = data.filter(row =>
          String(row[col] ?? '').toLowerCase().includes(val.toLowerCase())
        );
      }
    });

    // Apply inline sort
    if (inlineSortColumn) {
      data = [...data].sort((a, b) => {
        const aVal = a[inlineSortColumn];
        const bVal = b[inlineSortColumn];
        // Handle nulls — push them to the end
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        // Numeric comparison
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return inlineSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        // String comparison
        return inlineSortDirection === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });
    }

    return data;
  }, [processedTableData, columnFilters, inlineSortColumn, inlineSortDirection]);

  /**
   * Computed summary — calculates sum, average, min, max, count for each
   * numeric column in the inline-filtered data. Updates reactively when
   * filters change.
   */
  const computedSummary = useMemo(() => {
    if (!inlineProcessedData || inlineProcessedData.length === 0) return {};

    const columns = Object.keys(inlineProcessedData[0] || {}).filter(c => c !== 'id');
    const summary = {};

    columns.forEach(col => {
      const numericValues = inlineProcessedData
        .map(row => row[col])
        .filter(v => typeof v === 'number' && !isNaN(v));

      if (numericValues.length > 0) {
        const sum = numericValues.reduce((a, b) => a + b, 0);
        const avg = sum / numericValues.length;
        summary[col] = {
          sum: Number.isInteger(sum) ? sum : sum.toFixed(2),
          avg: avg.toFixed(2),
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          count: numericValues.length,
        };
      }
    });

    return summary;
  }, [inlineProcessedData]);

  /** Handle inline sort toggle: asc -> desc -> no sort */
  function handleInlineSortChange(col) {
    if (inlineSortColumn === col) {
      if (inlineSortDirection === 'asc') {
        setInlineSortDirection('desc');
      } else {
        // Already desc, clear sort
        setInlineSortColumn(null);
        setInlineSortDirection('asc');
      }
    } else {
      setInlineSortColumn(col);
      setInlineSortDirection('asc');
    }
  }

  /** Handle inline column filter change */
  function handleColumnFilterChange(col, value) {
    setColumnFilters(prev => ({ ...prev, [col]: value }));
  }

  /** Clear all inline column filters */
  function handleClearFilters() {
    setColumnFilters({});
  }

  // If no report data exists, show a message
  if (!reportData) {
    return (
      <div className="asrs-card" style={{ textAlign: 'center', padding: '3rem' }}>
        <p>No report data available for this initiative.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ---- REPORT HEADER ---- */}
      {/* Shows the report title, UUID, and generation date (per REP030) */}
      <div className="asrs-card" style={{
        borderLeft: '4px solid var(--color-asrs-orange)'
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem'
        }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '700', margin: 0 }}>
              {reportData.initiativeName}
            </h2>
            <p style={{
              fontSize: '0.8rem', color: 'var(--color-text-light)',
              margin: '0.25rem 0 0 0', fontFamily: 'monospace'
            }}>
              {/* Per REP030: Report UUID displayed in header */}
              Report ID: {reportData.reportId}
            </p>
          </div>
          <span style={{
            fontSize: '0.85rem', color: 'var(--color-text-secondary)',
            backgroundColor: 'var(--color-bg-secondary)',
            padding: '0.35rem 0.75rem', borderRadius: '20px'
          }}>
            Generated: {reportData.generatedDate}
          </span>
        </div>
      </div>

      {/* ---- SUMMARY STATISTICS ---- */}
      {/* Three cards showing key metrics at a glance — responsive via .summary-grid */}
      <div className="summary-grid">
        <div className="asrs-card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: 0 }}>
            Total Participants
          </p>
          <p style={{
            fontSize: '2rem', fontWeight: '700',
            color: 'var(--color-asrs-red)', margin: '0.25rem 0 0 0'
          }}>
            {processedTableData.length}
          </p>
        </div>
        <div className="asrs-card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: 0 }}>
            Average Rating
          </p>
          <p style={{
            fontSize: '2rem', fontWeight: '700',
            color: 'var(--color-asrs-orange)', margin: '0.25rem 0 0 0'
          }}>
            {filteredAverageRating}/5
          </p>
        </div>
        <div className="asrs-card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: 0 }}>
            Completion Rate
          </p>
          <p style={{
            fontSize: '2rem', fontWeight: '700',
            color: 'var(--color-asrs-yellow)', margin: '0.25rem 0 0 0'
          }}>
            {reportData.summary?.completionRate ?? 0}%
          </p>
        </div>
      </div>

      {/* ---- VIEW TOGGLE + EXPORT/SHARE ROW ---- */}
      {/* Stacks vertically on mobile via .view-toggle-bar */}
      <div className="view-toggle-bar">
        {/* View toggle: Charts / Table / Both */}
        <div className="view-toggle-buttons">
          {['charts', 'table', 'both'].map(view => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={activeView === view ? 'asrs-btn-primary' : 'asrs-btn-secondary'}
              style={{ textTransform: 'capitalize', fontSize: '0.85rem' }}
            >
              {view === 'both' ? 'Charts & Table' : view === 'charts' ? 'Charts Only' : 'Table Only'}
            </button>
          ))}
        </div>

        {/* Export and Share panels — only visible to Staff and Admin (per REP033) */}
        {(userRole === 'staff' || userRole === 'admin') && (
          <div className="action-buttons-group">
            <ExportPanel reportData={reportData} />
            <SharePanel reportId={reportData.reportId} />
          </div>
        )}
      </div>

      {/* ---- FILTER & SORT PANELS ---- */}
      {/* Stacks vertically on mobile via .filter-sort-grid */}
      <div className="filter-sort-grid">
        {/* Filter Panel — up to 7 attribute filters (per REP001/REP020) */}
        <FilterPanel
          attributes={filterAttributes}
          activeFilters={activeFilters}
          onFiltersChange={setActiveFilters}
          tableData={reportData.tableData}
        />
        {/* Sort Panel — up to 7 sorting levels (per REP002/REP021) */}
        <SortPanel
          attributes={selectedInitiative?.attributes || []}
          activeSorts={activeSorts}
          onSortsChange={setActiveSorts}
        />
      </div>

      {/* ---- CHARTS ---- */}
      {/* Displayed for Public (website view) per REP016 — graphical displays */}
      {(activeView === 'charts' || activeView === 'both') && (
        <ChartDisplay chartData={processedChartData} />
      )}

      {/* ---- DATA TABLE (with Data Tools: inline filters, sort, calculations) ---- */}
      {(activeView === 'table' || activeView === 'both') && (
        <DataTable
          data={inlineProcessedData}
          columns={reportData.tableData.length > 0 ? Object.keys(reportData.tableData[0]) : []}
          totalRowCount={processedTableData.length}
          columnFilters={columnFilters}
          onColumnFilterChange={handleColumnFilterChange}
          onClearFilters={handleClearFilters}
          sortColumn={inlineSortColumn}
          sortDirection={inlineSortDirection}
          onSortChange={handleInlineSortChange}
          showDataTools={showDataTools}
          onToggleDataTools={() => setShowDataTools(prev => !prev)}
          computedSummary={computedSummary}
        />
      )}

      {/* ---- TREND DISPLAY ---- */}
      {/* Only shows trends that have enabledDisplay === true (per REP010/REP011) */}
      {trendData && trendData.length > 0 && (
        <TrendDisplay trends={trendData} />
      )}

      {/* ---- AI INSIGHTS ---- */}
      {/* On-demand AI analysis — staff/admin only */}
      {(userRole === 'staff' || userRole === 'admin') && reportDbId && (
        <AIInsightsPanel
          reportDbId={reportDbId}
          userRole={userRole}
          preloadedInsights={preloadedInsights}
        />
      )}

      {reportData.explainability && (
        <div className="asrs-card">
          <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>
            Calculation Explainability
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.88rem' }}>
            <div>Input rows: {hasActiveReportFilters ? reportData.tableData.length : reportData.explainability.inputRowCount}</div>
            <div>After filters: {hasActiveReportFilters ? processedTableData.length : reportData.explainability.afterFilterCount}</div>
            <div>After expressions: {reportData.explainability.afterExpressionCount}</div>
            <div>Output rows: {hasActiveReportFilters ? processedTableData.length : reportData.explainability.outputRowCount}</div>
            <div>Dropped by filters: {hasActiveReportFilters ? liveDroppedByFilters : (reportData.explainability.droppedByStep?.filters ?? 0)}</div>
            <div>Dropped by expressions: {reportData.explainability.droppedByStep?.expressions ?? 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}
