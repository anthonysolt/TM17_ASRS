'use client';

/** Bordered white action button used on entry cards (View, Edit, ...). */
export const entryButtonStyle = {
  display: 'inline-flex', alignItems: 'center', padding: '0.4rem 0.85rem', borderRadius: '7px',
  fontSize: '0.8rem', fontWeight: 500, border: '1px solid #E5E7EB', backgroundColor: '#fff',
  color: '#374151', cursor: 'pointer', textDecoration: 'none',
};

/** Red variant of entryButtonStyle for Delete actions. */
export const entryDeleteButtonStyle = { ...entryButtonStyle, border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#991b1b' };
const smallButtonStyle = { padding: '0.3rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer' };

/**
 * Delete button that turns into an inline "Delete? Yes / No" prompt.
 *
 * Props: confirming, onStart, onConfirm, onCancel, disabled, prompt
 */
export function InlineDeleteConfirm({ confirming, onStart, onConfirm, onCancel, disabled = false, prompt = 'Delete?' }) {
  if (!confirming) {
    return <button type="button" onClick={onStart} style={entryDeleteButtonStyle}>Delete</button>;
  }
  return (
    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.78rem', color: '#991b1b' }}>{prompt}</span>
      <button type="button" onClick={onConfirm} disabled={disabled} style={{ ...smallButtonStyle, border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#991b1b' }}>Yes</button>
      <button type="button" onClick={onCancel} style={{ ...smallButtonStyle, border: '1px solid #E5E7EB', backgroundColor: '#fff', color: '#374151' }}>No</button>
    </div>
  );
}

/**
 * One row in a management list (the Reports page look): title, meta line and
 * description on the left, then stats, a status control and action buttons.
 *
 * Props:
 * - title: heading text
 * - meta: array of short strings / nodes shown under the title (falsy items skipped)
 * - description: optional text, truncated to 80 characters
 * - stats: [{ label, value }] shown as number-over-label (null values skipped)
 * - statsUnderTitle: show stats as one inline line between the title and meta instead
 * - status: node for the status pill / dropdown
 * - children: action buttons
 */
export default function EntryCard({ title, meta = [], description, stats = [], statsUnderTitle = false, status, children }) {
  const visibleStats = stats.filter((stat) => stat.value != null);
  return (
    <div
      className="card"
      style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'box-shadow 0.15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: '0 0 0.2rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title || '(Untitled)'}
        </h3>
        {statsUnderTitle && visibleStats.length > 0 && (
          <div style={{ fontSize: '13px', color: '#6B7280', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
            {visibleStats.map((stat) => (
              <span key={stat.label}>
                <span style={{ fontWeight: 600, color: '#374151' }}>{stat.value}</span> {stat.label}
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: '13px', color: '#6B7280', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {meta.filter(Boolean).map((item, i) => <span key={i}>{item}</span>)}
        </div>
        {description && (
          <div style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.2rem' }}>
            {description.length > 80 ? description.slice(0, 80) + '...' : description}
          </div>
        )}
      </div>

      {!statsUnderTitle && visibleStats.length > 0 && (
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#6B7280', flexShrink: 0 }}>
          {visibleStats.map((stat) => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: '#374151', fontSize: '1rem' }}>{stat.value}</div>
              <div>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {status && <div style={{ flexShrink: 0 }}>{status}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  );
}
