/**
 * ============================================================================
 * INITIATIVE SELECTOR — Displays clickable cards for each ASRS initiative.
 * ============================================================================
 * This is the row/grid of initiative cards right below the header.
 * When a user clicks a card, the report dashboard below updates to show
 * that initiative's data.
 *
 * Props:
 * - initiatives: Array — The list of all initiatives from the JSON/API.
 * - selectedInitiative: Object|null — The currently selected initiative.
 * - onSelect: function — Called when the user clicks an initiative card.
 * ============================================================================
 */
'use client';

export default function InitiativeSelector({
  initiatives,
  selectedInitiative,
  onSelect,
  heading = 'Select initiative',
  description = null,
}) {
  /**
   * Colors for each initiative card's left border accent.
   * This adds visual variety so users can quickly identify initiatives.
   */
  const accentColors = [
    '#C0392B', '#E67E22', '#F39C12', '#27AE60',
    '#2980B9', '#8E44AD', '#1ABC9C'
  ];

  return (
    <div>
      {/* Section title */}
      <h2
        className="initiative-selector-heading"
        style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          margin: '0 0 0.35rem',
        }}
      >
        {heading}
      </h2>
      {description ? (
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--color-text-secondary)',
            margin: '0 0 0.75rem',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      ) : null}

      {/* Grid of initiative cards — responsive via .initiative-grid CSS class */}
      <div className="initiative-grid">
        {initiatives.map((initiative, index) => {
          // Check if this card is the currently selected one
          const isSelected = selectedInitiative?.id === initiative.id;
          const accentColor = accentColors[index % accentColors.length];

          return (
            <button
              key={initiative.id}
              onClick={() => onSelect(initiative)}
              style={{
                // Card base styles
                background: isSelected ? 'white' : 'var(--color-bg-secondary)',
                borderTop: isSelected ? `2px solid ${accentColor}` : '2px solid transparent',
                borderRight: isSelected ? `2px solid ${accentColor}` : '2px solid transparent',
                borderBottom: isSelected ? `2px solid ${accentColor}` : '2px solid transparent',
                borderLeft: `4px solid ${accentColor}`,
                borderRadius: '10px',
                padding: '0.875rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 3px 12px rgba(0,0,0,0.1)' : 'none',
                transform: isSelected ? 'translateY(-2px)' : 'none'
              }}
            >
              <span style={{
                fontSize: '0.85rem',
                fontWeight: isSelected ? '700' : '500',
                color: isSelected ? accentColor : 'var(--color-text-primary)',
                display: 'block'
              }}>
                {initiative.name || initiative.initiative_name || 'Unnamed initiative'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
