'use client';

import { useMemo, useState } from 'react';
import DataTable from '@/components/DataTable';
import { computeTrendData, processReportData } from '@/lib/report-engine';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';

const COLORS = ['#C0392B', '#E67E22', '#F39C12', '#27AE60', '#2980B9'];

export default function StepPreview({ reportConfig, reportOptions, tableData, onGenerate, isSubmitting }) {
  const selectedInitiativeId = reportConfig.selectedInitiative?.id;
  const reportName = reportConfig.reportName;
  const analysisSelections = useMemo(
    () => reportConfig.analysisSelections || { attributes: [], questions: [] },
    [reportConfig.analysisSelections]
  );

  const [viewMode, setViewMode] = useState('table');
  const previewAttributes = useMemo(() => tableData?.[0]
    ? Object.keys(tableData[0]).filter((key) => key !== 'id')
    : [], [tableData]);

  const analysisGroups = useMemo(() => {
    const keys = tableData?.[0] ? Object.keys(tableData[0]) : [];
    const columnFor = (question) => keys.find((key) => key === question.label)
      || keys.find((key) => key === `${question.label} (${question.id})`)
      || null;
    const attributesById = new Map(reportOptions.attributes.map((attribute) => [Number(attribute.id), attribute]));
    const questionsById = new Map(reportOptions.questions.map((question) => [Number(question.id), question]));
    return [
      ...(analysisSelections.attributes || []).map((selection) => ({
        ...selection,
        type: 'Attribute',
        label: attributesById.get(Number(selection.id))?.name || `Attribute ${selection.id}`,
        variables: reportOptions.questions
          .filter((question) => Number(question.attributeId) === Number(selection.id))
          .map(columnFor).filter(Boolean),
      })),
      ...(analysisSelections.questions || []).map((selection) => {
        const question = questionsById.get(Number(selection.id));
        return {
          ...selection,
          type: 'Question',
          label: question?.label || `Question ${selection.id}`,
          variables: question ? [columnFor(question)].filter(Boolean) : [],
        };
      }),
    ];
  }, [analysisSelections, reportOptions, tableData]);

  // Run the full pipeline client-side for preview
  const { filteredData, metrics, trendData, explainability } = useMemo(() => {
    const attributes = previewAttributes;
    if (!tableData || tableData.length === 0) {
      return {
        filteredData: [],
        metrics: { totalRows: 0, totalRowsUnfiltered: 0, filterMatchRate: 0, numericAverages: {}, categoryCounts: {} },
        trendData: [],
        explainability: {
          inputRowCount: 0,
          afterFilterCount: 0,
          afterExpressionCount: 0,
          outputRowCount: 0,
          droppedByStep: { filters: 0, expressions: 0, sorting: 0 },
        },
      };
    }
    const processed = processReportData(
      tableData,
      reportConfig.filters || {},
      reportConfig.expressions || [],
      reportConfig.sorts || [],
      attributes
    );
    return {
      ...processed,
      trendData: analysisGroups.flatMap((group) => group.variables.length > 0
        ? computeTrendData(processed.filteredData, {
          variables: group.variables,
          method: group.method,
          thresholdPct: group.thresholdPct,
          enabledCalc: true,
          enabledDisplay: true,
        }, {
          initiativeId: selectedInitiativeId,
          reportName: `${reportName}:${group.type}:${group.id}`,
        }).map((trend) => ({ ...trend, selectionLabel: group.label, selectionType: group.type.toLowerCase() }))
        : []),
    };
  }, [tableData, reportConfig.filters, reportConfig.expressions, reportConfig.sorts, previewAttributes, analysisGroups, selectedInitiativeId, reportName]);

  // Build human-readable config summary
  const activeFilterEntries = Object.entries(reportConfig.filters || {}).filter(([, v]) => v && v !== 'All');
  const hasExpressions = (reportConfig.expressions || []).length > 0;
  const hasSorts = (reportConfig.sorts || []).length > 0;

  // Preview limited to 20 rows
  const previewData = filteredData.slice(0, 20);
  const previewColumns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

  // Build chart data from metrics
  const numericChartData = useMemo(() => {
    return Object.entries(metrics.numericAverages).map(([attr, avg]) => ({
      name: attr,
      value: Number(avg),
    }));
  }, [metrics.numericAverages]);

  const categoryCharts = useMemo(() => {
    return Object.entries(metrics.categoryCounts).map(([attr, counts]) => ({
      attribute: attr,
      data: Object.entries(counts).map(([val, count]) => ({ name: val, count })),
    }));
  }, [metrics.categoryCounts]);

  const toggleBtnStyle = (active) => ({
    padding: '0.45rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    borderRadius: active ? '6px' : '6px',
    backgroundColor: active ? 'var(--color-asrs-orange)' : 'var(--color-bg-secondary, #f1f5f9)',
    color: active ? '#fff' : 'var(--color-text-secondary)',
  });

  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: '600', marginBottom: '0.5rem' }}>
        Step 3: Preview & Generate
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        Review your configuration and preview the results before generating the report.
      </p>

      {/* View Mode Toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <button onClick={() => setViewMode('table')} style={toggleBtnStyle(viewMode === 'table')}>
          Table
        </button>
        <button onClick={() => setViewMode('chart')} style={toggleBtnStyle(viewMode === 'chart')}>
          Chart
        </button>
      </div>

      {/* Config Summary Card — shown in both views */}
      <div className="asrs-card" style={{ marginBottom: '1.25rem', borderLeft: '4px solid var(--color-asrs-orange)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', margin: '0 0 0.75rem 0' }}>
          Report Configuration
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.88rem' }}>
          <div>
            <span style={{ color: 'var(--color-text-light)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Initiative</span>
            <p style={{ margin: '0.15rem 0 0 0', fontWeight: '500' }}>{reportConfig.selectedInitiative?.name || '—'}</p>
          </div>
          <div>
            <span style={{ color: 'var(--color-text-light)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Report Name</span>
            <p style={{ margin: '0.15rem 0 0 0', fontWeight: '500' }}>{reportConfig.reportName || '—'}</p>
          </div>
          {reportConfig.description && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: 'var(--color-text-light)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Description</span>
              <p style={{ margin: '0.15rem 0 0 0' }}>{reportConfig.description}</p>
            </div>
          )}
          {activeFilterEntries.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: 'var(--color-text-light)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Filters</span>
              <p style={{ margin: '0.15rem 0 0 0' }}>
                {activeFilterEntries.map(([k, v]) => `${k} = "${v}"`).join(', ')}
              </p>
            </div>
          )}
          {hasExpressions && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: 'var(--color-text-light)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Expressions</span>
              <p style={{ margin: '0.15rem 0 0 0' }}>
                {reportConfig.expressions.map((e, i) =>
                  `${i > 0 ? (e.connector || 'AND') + ' ' : ''}${e.attribute} ${e.operator} "${e.value}"`
                ).join(' ')}
              </p>
            </div>
          )}
          {hasSorts && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: 'var(--color-text-light)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Sort Order</span>
              <p style={{ margin: '0.15rem 0 0 0' }}>
                {reportConfig.sorts.map((s, i) => `${i + 1}. ${s.attribute} (${s.direction === 'desc' ? 'Z→A' : 'A→Z'})`).join(', ')}
              </p>
            </div>
          )}
          {analysisGroups.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ color: 'var(--color-text-light)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Analysis</span>
              {analysisGroups.map((group) => (
                <p key={`${group.type}-${group.id}`} style={{ margin: '0.2rem 0 0' }}>
                  <strong>{group.type}:</strong> {group.label} — {group.method === 'linear_slope' ? 'Linear Slope' : 'Half-to-Half Delta'}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== TABLE VIEW ===== */}
      {viewMode === 'table' && (
        <>
          {/* Metrics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem', marginBottom: '1.25rem',
          }}>
            {/* Record Count */}
            <div className="asrs-card" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', margin: 0, textTransform: 'uppercase' }}>
                Matching Records
              </p>
              <p style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--color-asrs-red)', margin: '0.2rem 0 0 0' }}>
                {metrics.totalRows}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', margin: '0.15rem 0 0 0' }}>
                of {metrics.totalRowsUnfiltered} total ({metrics.filterMatchRate}%)
              </p>
            </div>

            {/* Numeric Averages */}
            {Object.entries(metrics.numericAverages).map(([attr, avg]) => (
              <div key={attr} className="asrs-card" style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', margin: 0, textTransform: 'uppercase' }}>
                  Avg {attr}
                </p>
                <p style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--color-asrs-orange)', margin: '0.2rem 0 0 0' }}>
                  {avg}
                </p>
              </div>
            ))}
          </div>

          {/* Category Distributions */}
          {Object.keys(metrics.categoryCounts).length > 0 && (
            <div className="asrs-card" style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: '0 0 0.75rem 0' }}>
                Category Distributions
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {Object.entries(metrics.categoryCounts).map(([attr, counts]) => (
                  <div key={attr}>
                    <p style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-secondary)', margin: '0 0 0.35rem 0' }}>
                      {attr}
                    </p>
                    {Object.entries(counts).map(([val, count]) => (
                      <div key={val} style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: '0.8rem', padding: '0.15rem 0',
                        borderBottom: '1px solid var(--color-bg-secondary)',
                      }}>
                        <span>{val}</span>
                        <span style={{ fontWeight: '600', color: 'var(--color-asrs-dark)' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data Table Preview */}
          <div style={{ marginBottom: '1.5rem' }}>
            {filteredData.length > 20 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                Showing first 20 of {filteredData.length} records
              </p>
            )}
            <DataTable data={previewData} columns={previewColumns} />
          </div>

          {trendData.length > 0 && (
            <div className="asrs-card" style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: '0 0 0.75rem 0' }}>
                Trend Preview
              </h3>
              {trendData.map((trend) => (
                <div key={trend.trendId} style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
                  <p style={{ margin: '0 0 0.4rem 0' }}>
                    <strong>Variables:</strong> {trend.attributes.join(', ')}
                  </p>
                  <p style={{ margin: '0 0 0.4rem 0' }}>
                    <strong>Direction:</strong> {trend.direction} ({trend.magnitude}%)
                  </p>
                  <p style={{ margin: '0 0 0.4rem 0' }}>
                    <strong>Confidence:</strong> {trend.confidenceScore}%
                  </p>
                  <p style={{ margin: 0 }}>
                    {trend.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="asrs-card" style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: '0 0 0.75rem 0' }}>
              Explainability
            </h3>
            <div style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>
              <div>Input rows: {explainability.inputRowCount}</div>
              <div>After filters: {explainability.afterFilterCount}</div>
              <div>After expressions: {explainability.afterExpressionCount}</div>
              <div>Output rows: {explainability.outputRowCount}</div>
              <div>Dropped by filters: {explainability.droppedByStep.filters}</div>
              <div>Dropped by expressions: {explainability.droppedByStep.expressions}</div>
            </div>
          </div>
        </>
      )}

      {/* ===== CHART VIEW ===== */}
      {viewMode === 'chart' && (
        <>
          {/* Numeric Averages Bar Chart */}
          {numericChartData.length > 0 && (
            <div className="asrs-card" style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: '0 0 0.75rem 0' }}>
                Numeric Averages
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={numericChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg-tertiary)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Average" radius={[4, 4, 0, 0]}>
                    {numericChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Category Distribution Bar Charts */}
          {categoryCharts.map(({ attribute, data }) => (
            <div key={attribute} className="asrs-card" style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', margin: '0 0 0.75rem 0' }}>
                {attribute}
              </h3>
              <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
                <BarChart data={data} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg-tertiary)" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                  <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                    {data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}

          {numericChartData.length === 0 && categoryCharts.length === 0 && (
            <div className="asrs-card" style={{ textAlign: 'center', padding: '2rem', marginBottom: '1.25rem' }}>
              <p style={{ color: 'var(--color-text-light)' }}>
                No chart data available. Apply filters or check that the initiative has data.
              </p>
            </div>
          )}
        </>
      )}

      {/* Generate Button — shown in both views */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={onGenerate}
          disabled={isSubmitting}
          style={{
            padding: '0.85rem 2.5rem',
            backgroundColor: 'var(--color-asrs-orange)',
            color: '#fff',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '1rem',
            border: 'none',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting ? 'Generating...' : 'Generate Report'}
        </button>
      </div>
    </div>
  );
}
