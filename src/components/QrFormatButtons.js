'use client';

const QR_FORMATS = ['png', 'svg'];

/**
 * PNG / SVG download buttons for a QR code. The last format chosen stays
 * highlighted. The parent keeps selectedFormat and does the download in onSelect.
 */
export default function QrFormatButtons({ selectedFormat, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {QR_FORMATS.map((format) => (
        <button
          key={format}
          type="button"
          className={selectedFormat === format ? 'btn-primary' : 'btn-outline'}
          aria-pressed={selectedFormat === format}
          onClick={() => onSelect(format)}
          style={{ padding: '6px 14px', fontSize: '13px' }}
        >
          {format.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
