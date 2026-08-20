'use client';

export default function StepConfig({ initiatives, reportConfig, onChange }) {
  return (
    <div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: '600', marginBottom: '0.5rem' }}>
        Step 1: Report Configuration
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Select an initiative and provide a name for your report.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '1.5rem', marginBottom: '1.5rem',
      }}>
        {/* Initiative */}
        <div>
          <label className="asrs-label">Initiative *</label>
          <select
            className="asrs-input"
            value={reportConfig.selectedInitiative?.id || ''}
            onChange={(e) => {
              const initiative = initiatives.find(i => i.id === Number(e.target.value));
              onChange({
                selectedInitiative: initiative,
                analysisSelections: { attributes: [], questions: [] },
              });
            }}
          >
            {initiatives.map(i => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>

        {/* Report Name */}
        <div>
          <label className="asrs-label">Report Name *</label>
          <input
            className="asrs-input"
            placeholder="e.g. Q2 Safety Trends"
            value={reportConfig.reportName}
            onChange={(e) => onChange({ reportName: e.target.value })}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="asrs-label">Description</label>
        <textarea
          className="asrs-input"
          rows={3}
          placeholder="Optional description for the report"
          value={reportConfig.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      {/* AI Insights */}
      <div style={{ marginTop: '1.25rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={reportConfig.includeAiInsights || false}
            onChange={(e) => onChange({ includeAiInsights: e.target.checked })}
            style={{ width: '1rem', height: '1rem' }}
          />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            Include AI Analysis (GPT-4o)
          </span>
        </label>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', margin: '0.3rem 0 0 1.5rem' }}>
          Generates a narrative summary, key insights, and recommendations. Adds ~10 seconds to report generation.
        </p>
      </div>
    </div>
  );
}
