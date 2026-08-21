/**
 * ============================================================================
 * TREND DISPLAY — Shows trend analysis results for the selected initiative.
 * ============================================================================
 * Per REP010/REP011/REP029:
 * - Only trends with enabledDisplay === true are shown (filtered in dataService).
 * - Each trend shows: direction (up/down/stable), magnitude, time period, and
 *   the attributes being analyzed.
 * - Trends accompany the report output when enabled for display.
 *
 * Props:
 * - trends: Array of trend objects (already filtered to enabled-only).
 * ============================================================================
 */
'use client';

export default function TrendDisplay({ trends }) {
  if (!trends || trends.length === 0) return null;

  /** directionArrow — Returns an arrow icon and color based on trend direction. */
  function directionArrow(direction) {
    switch (direction) {
      case 'up': return { arrow: '↑', color: '#27AE60', label: 'Increasing' };
      case 'down': return { arrow: '↓', color: '#C0392B', label: 'Decreasing' };
      default: return { arrow: '→', color: '#F39C12', label: 'Stable' };
    }
  }

  return (
    <div className="asrs-card">
      <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>
        Report Analysis
      </h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '0.75rem'
      }}>
        {trends.map(trend => {
          if (trend.analysisType) {
            return (
              <div key={trend.trendId} style={{
                padding: '1rem',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: '8px',
                borderLeft: '4px solid var(--color-asrs-orange, #E67E22)'
              }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', margin: '0 0 0.35rem' }}>
                  {trend.analysisLabel}
                </p>
                <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
                  {trend.result ?? 'No result'}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0 0 0.25rem' }}>
                  Question: {trend.attributes.join(', ')}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', margin: '0 0 0.5rem' }}>
                  Responses evaluated: {trend.responsesEvaluated}
                </p>
                <p style={{ fontSize: '0.8rem', margin: 0, lineHeight: 1.4 }}>{trend.description}</p>
              </div>
            );
          }
          const { arrow, color, label } = directionArrow(trend.direction);

          return (
            <div key={trend.trendId} style={{
              padding: '1rem',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: '8px',
              borderLeft: `4px solid ${color}`
            }}>
              {/* Trend direction indicator */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                marginBottom: '0.5rem'
              }}>
                <span style={{
                  fontSize: '1.5rem', fontWeight: '700', color
                }}>
                  {arrow}
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>
                  {label} ({trend.magnitude}%)
                </span>
              </div>

              {/* Attributes being analyzed */}
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0 0 0.25rem' }}>
                Attributes: {trend.attributes.join(', ')}
              </p>

              {/* Time period */}
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', margin: '0 0 0.5rem' }}>
                Period: {trend.timePeriod}
              </p>

              {/* Description */}
              <p style={{ fontSize: '0.8rem', margin: 0, lineHeight: 1.4 }}>
                {trend.description}
              </p>

              {/* Trend UUID — per REP031 */}
              <p style={{
                fontSize: '0.7rem', color: 'var(--color-text-light)',
                fontFamily: 'monospace', marginTop: '0.5rem'
              }}>
                {trend.trendId}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
