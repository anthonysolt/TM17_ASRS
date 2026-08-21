/**
 * ============================================================================
 * FILTER PANEL — Allows users to filter report data by up to 7 attributes.
 * ============================================================================
 * Per REP001 and REP020:
 * - Users can select up to 7 attribute filters from dropdowns.
 * - The UI disables further selections once 7 are chosen.
 * - Filtering constructs WHERE clauses (simulated here, real in API).
 *
 * Per REP022: Changing filters does NOT affect existing sort configuration.
 *
 * Props:
 * - attributes: Array<string> — Names of filterable attributes for this initiative.
 * - activeFilters: Object — Currently applied filters (e.g., {grade: "7th"}).
 * - onFiltersChange: function — Called when filters are updated.
 * - tableData: Array — The raw table data, used to extract unique values for dropdowns.
 * ============================================================================
 */
'use client';

import { useMemo } from 'react';
import { getReportFilterOptions } from '@/lib/report-view-filters';

// Maximum number of filters allowed at once (per REP001/REP020)
const MAX_FILTERS = 7;

export default function FilterPanel({ attributes, activeFilters, onFiltersChange, tableData }) {
  /**
   * Build a map of each attribute → its unique values from the data.
   * This populates the dropdown options. For example, if the "grade" column
   * has values "6th", "7th", "8th", the dropdown shows those three options.
   */
  const attributeOptions = useMemo(() => {
    return getReportFilterOptions(tableData || [], attributes || []);
  }, [attributes, tableData]);

  // Count how many filters are actively applied (not set to "All")
  const activeFilterCount = Object.values(activeFilters).filter(v => v && v !== 'All').length;

  /**
   * handleFilterChange — Updates one filter's value.
   * If the user picks "All", that filter is effectively removed.
   */
  function handleFilterChange(attribute, value) {
    const newFilters = { ...activeFilters };
    if (value === 'All') {
      delete newFilters[attribute];
    } else {
      newFilters[attribute] = value;
    }
    onFiltersChange(newFilters);
  }

  /** clearAllFilters — Resets all filters back to unfiltered state. */
  function clearAllFilters() {
    onFiltersChange({});
  }

  return (
    <div className="asrs-card">
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '0.75rem'
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', margin: 0 }}>
          Filters ({activeFilterCount}/{MAX_FILTERS})
        </h3>
        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters} style={{
            fontSize: '0.8rem', color: 'var(--color-asrs-red)',
            background: 'none', border: 'none', cursor: 'pointer',
            textDecoration: 'underline'
          }}>
            Clear All
          </button>
        )}
      </div>

      {/* Grid of filter dropdowns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '0.5rem'
      }}>
        {attributes.map(attr => {
          // Check if this filter is currently active
          const isActive = activeFilters[attr] && activeFilters[attr] !== 'All';
          // Disable if we've hit the max and this one isn't already active
          const isDisabled = activeFilterCount >= MAX_FILTERS && !isActive;

          return (
            <div key={attr}>
              <label style={{
                fontSize: '0.75rem', color: 'var(--color-text-light)',
                display: 'block', marginBottom: '0.2rem'
              }}>
                {attr}
              </label>
              <select
                value={activeFilters[attr] || 'All'}
                onChange={(e) => handleFilterChange(attr, e.target.value)}
                disabled={isDisabled}
                style={{
                  width: '100%', padding: '0.4rem',
                  borderRadius: '6px', fontSize: '0.8rem',
                  border: `1px solid ${isActive ? 'var(--color-asrs-orange)' : 'var(--color-bg-tertiary)'}`,
                  backgroundColor: isDisabled ? 'var(--color-bg-secondary)' : 'white',
                  cursor: isDisabled ? 'not-allowed' : 'pointer'
                }}
              >
                <option value="All">All</option>
                {(attributeOptions[attr] || []).map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Warning when max filters reached — per REP020 */}
      {activeFilterCount >= MAX_FILTERS && (
        <p style={{
          fontSize: '0.75rem', color: 'var(--color-asrs-red)',
          marginTop: '0.5rem', fontStyle: 'italic'
        }}>
          Maximum of {MAX_FILTERS} filters reached. Remove a filter to add a new one.
        </p>
      )}
    </div>
  );
}
