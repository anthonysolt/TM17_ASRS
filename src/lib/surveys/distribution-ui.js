// Shared styles and helpers for the Survey Distribution pages
// (list, Create Email Distribution, Generate QR Code).

export const DISTRIBUTION_LIST_PATH = '/survey-distribution';
export const CREATE_EMAIL_DISTRIBUTION_PATH = '/survey-distribution/email/new';
export const GENERATE_QR_CODE_PATH = '/survey-distribution/qr/new';

export const inputStyle = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  borderRadius: '8px',
  border: '1px solid #E5E7EB',
  backgroundColor: '#fff',
  color: '#111827',
  fontSize: '0.95rem',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  boxSizing: 'border-box',
};

export const labelStyle = {
  display: 'block',
  fontWeight: '600',
  fontSize: '0.9rem',
  color: '#111827',
  marginBottom: '0.35rem',
};

export const fieldGroupStyle = {
  marginBottom: '1.25rem',
};

/** Email distributions whose start date has passed and end date hasn't. */
export function isActiveEmailDistribution(distribution) {
  return distribution?.status === 'active';
}

/** QR codes that are switched on and not past their expiry. */
export function isActiveQrCode(qrCode) {
  return Boolean(qrCode?.isActive) && !qrCode?.isExpired;
}

export function downloadQrCode(qrCodeKey, format = 'png') {
  const url = `/api/qr-codes/download?qrCodeKey=${encodeURIComponent(qrCodeKey)}&format=${format}&download=true`;
  window.open(url, '_blank');
}
