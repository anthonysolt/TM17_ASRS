'use client';

/** Style for one underlined orange tab; also used by link-based tab bars (SurveysPageHeader). */
export function getTabStyle(active) {
  return {
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    border: 'none',
    borderBottom: active ? '3px solid #E67E22' : '3px solid transparent',
    backgroundColor: 'transparent',
    color: active ? '#E67E22' : '#6B7280',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all 0.15s',
    marginBottom: '-2px',
  };
}

export const TAB_BAR_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 0,
  borderBottom: '2px solid #E5E7EB',
  marginBottom: '1.5rem',
};

/**
 * Underlined tab bar used by the initiative page, the survey details page and
 * User Management.
 *
 * Props: tabs: [{ key, label }], activeTab, onChange(key), ariaLabel
 */
export default function TabBar({ tabs, activeTab, onChange, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} style={TAB_BAR_STYLE}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            style={getTabStyle(active)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
