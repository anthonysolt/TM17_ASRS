/**
 * ============================================================================
 * DATA TABLE — Displays report data in a scrollable, responsive table.
 * ============================================================================
 * Per REP036: On mobile, this converts to a card-like layout (handled via
 * CSS class "responsive-table" in globals.css).
 *
 * Props:
 * - data: Array — The filtered & sorted rows to display.
 * - columns: Array<string> — The column keys from the data objects.
 * - totalRowCount: number — Total row count before inline filters (optional).
 * - columnFilters: Object — Current inline filter values keyed by column (optional).
 * - onColumnFilterChange: Function — Callback(column, value) for inline filters (optional).
 * - onClearFilters: Function — Callback to clear all inline filters (optional).
 * - sortColumn: string — Currently sorted column key (optional).
 * - sortDirection: string — 'asc' | 'desc' | null (optional).
 * - onSortChange: Function — Callback(column) to toggle sort (optional).
 * - showDataTools: boolean — Whether the Data Tools section is expanded (optional).
 * - onToggleDataTools: Function — Callback to toggle Data Tools visibility (optional).
 * - computedSummary: Object — Computed numeric summaries keyed by column (optional).
 * - title: string — Card heading (optional, default "Data Table").
 * - columnLabels: Object — Header labels keyed by column, used instead of the
 *   automatic camelCase formatting (optional).
 * - embedded: boolean — Render without the card frame and heading, for use
 *   inside another card (optional).
 * - selectedIds: Array — Row ids currently selected; passing it (with
 *   onSelectionChange) adds a checkbox column (optional).
 * - onSelectionChange: Function — Callback(nextSelectedIds) (optional).
 * - paginate: boolean — Show the rows-per-page pager (default true). Pass false
 *   to show every row in `data` (e.g. when the caller loads rows in batches).
 * ============================================================================
 */
'use client';

import { useMemo, useState } from 'react';

export default function DataTable({
  data,
  columns,
  totalRowCount,
  columnFilters,
  onColumnFilterChange,
  onClearFilters,
  sortColumn,
  sortDirection,
  onSortChange,
  showDataTools,
  onToggleDataTools,
  computedSummary,
  title = 'Data Table',
  columnLabels,
  embedded = false,
  selectedIds,
  onSelectionChange,
  paginate = true,
}) {
  const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const safeColumns = useMemo(() => (Array.isArray(columns) ? columns : []), [columns]);
  const displayColumns = safeColumns.filter(col => col !== 'id');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(safeData.length / pageSize));
  const displayPage = Math.min(page, totalPages);

  const pagedData = useMemo(() => {
    if (!paginate) return safeData;
    const start = (displayPage - 1) * pageSize;
    return safeData.slice(start, start + pageSize);
  }, [safeData, displayPage, pageSize, paginate]);

  /**
   * formatColumnName — Converts camelCase keys to human-readable labels.
   * Example: "sessionRating" -> "Session Rating"
   */
  function formatColumnName(key) {
    if (columnLabels && columnLabels[key] != null) return columnLabels[key];
    return key
      .replace(/([A-Z])/g, ' $1')    // Add space before capital letters
      .replace(/^./, str => str.toUpperCase())  // Capitalize first letter
      .trim();
  }

  /** Returns the sort indicator arrow for a column header */
  function renderSortArrow(col) {
    if (!onSortChange) return null;
    if (sortColumn !== col) {
      // Show a subtle indicator that the column is sortable
      return (
        <span style={{ marginLeft: '4px', opacity: 0.3, fontSize: '0.7rem' }}>
          &#x25B2;&#x25BC;
        </span>
      );
    }
    return (
      <span style={{ marginLeft: '4px', fontSize: '0.75rem', color: '#E67E22' }}>
        {sortDirection === 'asc' ? '\u25B2' : '\u25BC'}
      </span>
    );
  }

  // Optional row selection (checkbox column). The header box selects every row in `data`.
  const selectable = Array.isArray(selectedIds) && typeof onSelectionChange === 'function';
  const selectedSet = new Set(selectable ? selectedIds : []);
  const allRowIds = safeData.map(row => row.id);
  const allSelected = selectable && allRowIds.length > 0 && allRowIds.every(id => selectedSet.has(id));
  const someSelected = selectable && !allSelected && allRowIds.some(id => selectedSet.has(id));

  function toggleRow(id) {
    onSelectionChange(selectedSet.has(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  }

  function toggleAll() {
    onSelectionChange(allSelected ? [] : allRowIds);
  }

  const hasActiveFilters = columnFilters && Object.values(columnFilters).some(v => v);
  const effectiveTotalRowCount = totalRowCount ?? safeData.length;

  return (
    <div className={embedded ? undefined : 'asrs-card'} style={{ overflow: 'hidden', padding: '0' }}>
      {/* ---- HEADER (hidden when embedded in another card) ---- */}
      {!embedded && (
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid var(--color-bg-tertiary)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '600', margin: 0 }}>
          {title}
        </h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
          {hasActiveFilters
            ? `Showing ${safeData.length} of ${effectiveTotalRowCount} rows`
            : `${safeData.length} record${safeData.length !== 1 ? 's' : ''}`}
        </span>
      </div>
      )}

      {/* ---- DATA TOOLS TOGGLE ---- */}
      {onToggleDataTools && (
        <div
          onClick={onToggleDataTools}
          style={{
            padding: '0.5rem 1.5rem',
            borderBottom: '1px solid var(--color-bg-tertiary)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            cursor: 'pointer',
            backgroundColor: showDataTools ? '#FDF2E9' : 'transparent',
            userSelect: 'none',
            transition: 'background-color 0.15s ease',
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#E67E22' }}>
            {showDataTools ? '\u25BC' : '\u25B6'} Data Tools
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
            {showDataTools ? 'Click to collapse' : 'Filters, sorting & calculations'}
          </span>
        </div>
      )}

      {/* ---- INLINE FILTER ROW (inside Data Tools) ---- */}
      {showDataTools && onColumnFilterChange && displayColumns.length > 0 && (
        <div style={{
          padding: '0.5rem 1.5rem',
          borderBottom: '1px solid var(--color-bg-tertiary)',
          backgroundColor: '#FAFAFA',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '0.4rem',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
              Column Filters
            </span>
            {hasActiveFilters && onClearFilters && (
              <button
                onClick={onClearFilters}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.6rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '4px',
                  backgroundColor: '#fff',
                  color: '#E67E22',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {displayColumns.map(col => (
              <div key={col} style={{ minWidth: '100px', flex: '1 1 0' }}>
                <label style={{
                  display: 'block', fontSize: '0.65rem',
                  color: 'var(--color-text-light)', marginBottom: '2px',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {formatColumnName(col)}
                </label>
                <input
                  type="text"
                  value={columnFilters?.[col] || ''}
                  onChange={(e) => onColumnFilterChange(col, e.target.value)}
                  placeholder="Filter..."
                  style={{
                    width: '100%',
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.75rem',
                    border: '1px solid #E5E7EB',
                    borderRadius: '4px',
                    outline: 'none',
                    backgroundColor: columnFilters?.[col] ? '#FFF7ED' : '#fff',
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#E67E22'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- PAGINATION CONTROLS ---- */}
      {paginate && (
      <div style={{ padding: '0.6rem 1.5rem', borderBottom: '1px solid var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}>
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => {
              const next = Number(e.target.value);
              setPageSize(next);
              setPage(1);
            }}
            className="asrs-input"
            style={{ width: '80px', padding: '0.25rem 0.4rem' }}
          >
            {[20, 50, 100].map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <button
            className="asrs-btn-secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ padding: '0.3rem 0.55rem' }}
          >
            Prev
          </button>
          <span>Page {displayPage} of {totalPages}</span>
          <button
            className="asrs-btn-secondary"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{ padding: '0.3rem 0.55rem' }}
          >
            Next
          </button>
        </div>
      </div>
      )}

      {/* ---- EMPTY STATE ---- */}
      {safeData.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--color-text-light)' }}>
            No data matches your current filters.
          </p>
        </div>
      ) : (
        <>
          {/* Scrollable container for wide tables */}
          <div style={{ overflowX: 'auto' }}>
            <table className="responsive-table" style={{
              width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem'
            }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                  {selectable && (
                    <th style={{ width: 40, padding: '0.75rem 0.5rem 0.75rem 1rem', borderBottom: '2px solid var(--color-bg-tertiary)' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleAll}
                        aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'}
                        style={{ cursor: 'pointer', accentColor: '#E67E22', width: 16, height: 16 }}
                      />
                    </th>
                  )}
                  {displayColumns.map(col => (
                    <th
                      key={col}
                      onClick={onSortChange ? () => onSortChange(col) : undefined}
                      style={{
                        padding: '0.75rem 1rem', textAlign: 'left',
                        fontWeight: '600', color: 'var(--color-text-secondary)',
                        fontSize: '0.8rem', whiteSpace: 'nowrap',
                        borderBottom: '2px solid var(--color-bg-tertiary)',
                        cursor: onSortChange ? 'pointer' : 'default',
                        userSelect: onSortChange ? 'none' : 'auto',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={onSortChange ? (e) => { e.currentTarget.style.backgroundColor = '#F0F0F0'; } : undefined}
                      onMouseLeave={onSortChange ? (e) => { e.currentTarget.style.backgroundColor = ''; } : undefined}
                    >
                      {formatColumnName(col)}
                      {renderSortArrow(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedData.map((row, rowIndex) => {
                  const isSelected = selectable && selectedSet.has(row.id);
                  return (
                  <tr key={row.id || rowIndex} style={{
                    borderBottom: '1px solid var(--color-bg-secondary)',
                    transition: 'background-color 0.15s ease',
                    backgroundColor: isSelected ? '#FFF7ED' : 'transparent',
                  }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isSelected ? '#FFF7ED' : 'transparent'; }}
                  >
                    {selectable && (
                      <td style={{ padding: '0.65rem 0.5rem 0.65rem 1rem' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          aria-label={`Select row ${row.id}`}
                          style={{ cursor: 'pointer', accentColor: '#E67E22', width: 16, height: 16 }}
                        />
                      </td>
                    )}
                    {displayColumns.map(col => (
                      <td
                        key={col}
                        data-label={formatColumnName(col)}
                        style={{
                          padding: '0.65rem 1rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {row[col] === undefined ? '\u2014' : Array.isArray(row[col]) ? row[col].join(', ') : String(row[col])}
                      </td>
                    ))}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ---- COMPUTED SUMMARY ROW ---- */}
          {showDataTools && computedSummary && Object.keys(computedSummary).length > 0 && (
            <div style={{
              padding: '0.75rem 1.5rem',
              borderTop: '2px solid #E5E7EB',
              backgroundColor: '#F9FAFB',
            }}>
              <h4 style={{
                fontSize: '0.8rem', fontWeight: '600',
                color: 'var(--color-text-secondary)', margin: '0 0 0.5rem 0',
              }}>
                Calculations (on filtered data)
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem',
                }}>
                  <thead>
                    <tr>
                      <th style={{
                        padding: '0.35rem 0.75rem', textAlign: 'left',
                        fontWeight: '600', color: 'var(--color-text-light)',
                        fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB',
                      }}>
                        Column
                      </th>
                      <th style={{
                        padding: '0.35rem 0.75rem', textAlign: 'right',
                        fontWeight: '600', color: 'var(--color-text-light)',
                        fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB',
                      }}>
                        Sum
                      </th>
                      <th style={{
                        padding: '0.35rem 0.75rem', textAlign: 'right',
                        fontWeight: '600', color: 'var(--color-text-light)',
                        fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB',
                      }}>
                        Average
                      </th>
                      <th style={{
                        padding: '0.35rem 0.75rem', textAlign: 'right',
                        fontWeight: '600', color: 'var(--color-text-light)',
                        fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB',
                      }}>
                        Min
                      </th>
                      <th style={{
                        padding: '0.35rem 0.75rem', textAlign: 'right',
                        fontWeight: '600', color: 'var(--color-text-light)',
                        fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB',
                      }}>
                        Max
                      </th>
                      <th style={{
                        padding: '0.35rem 0.75rem', textAlign: 'right',
                        fontWeight: '600', color: 'var(--color-text-light)',
                        fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB',
                      }}>
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(computedSummary).map(([col, stats]) => (
                      <tr key={col}>
                        <td style={{
                          padding: '0.35rem 0.75rem', fontWeight: '500',
                          borderBottom: '1px solid #F3F4F6',
                        }}>
                          {formatColumnName(col)}
                        </td>
                        <td style={{
                          padding: '0.35rem 0.75rem', textAlign: 'right',
                          fontFamily: 'monospace', borderBottom: '1px solid #F3F4F6',
                        }}>
                          {stats.sum}
                        </td>
                        <td style={{
                          padding: '0.35rem 0.75rem', textAlign: 'right',
                          fontFamily: 'monospace', borderBottom: '1px solid #F3F4F6',
                        }}>
                          {stats.avg}
                        </td>
                        <td style={{
                          padding: '0.35rem 0.75rem', textAlign: 'right',
                          fontFamily: 'monospace', borderBottom: '1px solid #F3F4F6',
                        }}>
                          {stats.min}
                        </td>
                        <td style={{
                          padding: '0.35rem 0.75rem', textAlign: 'right',
                          fontFamily: 'monospace', borderBottom: '1px solid #F3F4F6',
                        }}>
                          {stats.max}
                        </td>
                        <td style={{
                          padding: '0.35rem 0.75rem', textAlign: 'right',
                          fontFamily: 'monospace', borderBottom: '1px solid #F3F4F6',
                        }}>
                          {stats.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
