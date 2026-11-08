'use client';

export const PDF_DISPLAY_OPTIONS = [
  { value: 'charts', label: 'Charts only' },
  { value: 'table', label: 'Data table only' },
  { value: 'both', label: 'Both' },
];

export const PDF_LAYOUT_OPTIONS = [
  { value: 'side-by-side', label: 'Side-by-side' },
  { value: 'sequential', label: 'Sequential' },
];

export const DOWNLOAD_FORMATS = ['pdf', 'csv', 'xlsx', 'html'];

const selectStyle = {
  padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px',
  border: '1px solid #E5E7EB', backgroundColor: '#fff', outline: 'none',
};

/**
 * Report download options (used by ReportList's Download pop-up): PDF content
 * and layout pickers plus a Format dropdown. The caller runs the download.
 *
 * Props: displayMode, onDisplayModeChange, layoutMode, onLayoutModeChange,
 *        selectedFormat, onFormatChange(format), gap
 */
export default function ReportDownloadOptions({
  displayMode, onDisplayModeChange, layoutMode, onLayoutModeChange, selectedFormat, onFormatChange, gap = '8px',
}) {
  return (
    <div style={{ display: 'flex', gap, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Content</span>
        <select value={displayMode} onChange={(e) => onDisplayModeChange(e.target.value)} style={selectStyle}>
          {PDF_DISPLAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Layout</span>
        <select
          value={layoutMode}
          onChange={(e) => onLayoutModeChange(e.target.value)}
          disabled={displayMode !== 'both'}
          style={{ ...selectStyle, opacity: displayMode === 'both' ? 1 : 0.6 }}
        >
          {PDF_LAYOUT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Format</span>
        <select value={selectedFormat || DOWNLOAD_FORMATS[0]} onChange={(e) => onFormatChange(e.target.value)} style={selectStyle}>
          {DOWNLOAD_FORMATS.map((format) => (
            <option key={format} value={format}>{format.toUpperCase()}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
