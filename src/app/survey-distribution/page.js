'use client';

import { InlineDeleteConfirm, entryButtonStyle } from '@/components/EntryCard';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PageLayout from '@/components/PageLayout';
import SurveysPageHeader from '@/components/SurveysPageHeader';
import DistributionAccessGate from '@/components/DistributionAccessGate';
import { apiFetch } from '@/lib/api/client';
import {
  CREATE_EMAIL_DISTRIBUTION_PATH,
  GENERATE_QR_CODE_PATH,
  downloadQrCode,
  isActiveEmailDistribution,
  isActiveQrCode,
} from '@/lib/surveys/distribution-ui';

export default function SurveyDistributionPage() {
  return (
    <DistributionAccessGate>
      <Suspense fallback={null}>
        <SurveyDistributionContent />
      </Suspense>
    </DistributionAccessGate>
  );
}

function SurveyDistributionContent() {
  const searchParams = useSearchParams();

  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  // Email distributions
  const [distributions, setDistributions] = useState([]);
  const [loadingDistributions, setLoadingDistributions] = useState(true);
  const [deletingDistributionId, setDeletingDistributionId] = useState(null);

  // QR codes
  const [qrCodes, setQrCodes] = useState([]);
  const [qrCodesLoading, setQrCodesLoading] = useState(true);
  const [deletingQrCodeKey, setDeletingQrCodeKey] = useState(null);
  // QR code whose Delete button is showing the inline "Delete? Yes / No" prompt.
  const [confirmingQrCodeKey, setConfirmingQrCodeKey] = useState(null);

  // The Create Email Distribution page sends people back here on success.
  const createdKind = searchParams.get('created');
  const createdName = searchParams.get('name');
  useEffect(() => {
    if (createdKind === 'email') {
      setSuccessMessage(createdName
        ? `Email distribution "${createdName}" created successfully.`
        : 'Email distribution created successfully.');
    }
  }, [createdKind, createdName]);

  useEffect(() => {
    apiFetch('/api/surveys/distributions')
      .then((res) => res.json())
      .then((data) => setDistributions(data.distributions || []))
      .catch(() => setDistributions([]))
      .finally(() => setLoadingDistributions(false));

    apiFetch('/api/qr-codes?scope=survey')
      .then((res) => res.json())
      .then((data) => setQrCodes(data.qrCodes || []))
      .catch(() => setQrCodes([]))
      .finally(() => setQrCodesLoading(false));
  }, []);

  const activeDistributions = distributions.filter(isActiveEmailDistribution);
  const activeQrCodes = qrCodes.filter(isActiveQrCode);

  const handleDeleteDistribution = async (distribution) => {
    if (!window.confirm(`Delete the email distribution “${distribution.title}”? This cannot be undone.`)) return;
    setDeletingDistributionId(distribution.distribution_id);
    setError('');
    try {
      const response = await apiFetch(
        `/api/surveys/distributions?distributionId=${distribution.distribution_id}`,
        { method: 'DELETE' }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to delete email distribution');
      setDistributions(current => current.filter(
        item => item.distribution_id !== distribution.distribution_id
      ));
      setSuccessMessage('Email distribution deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete email distribution');
    } finally {
      setDeletingDistributionId(null);
    }
  };

  // Runs after the row's inline "Delete? Yes / No" confirmation.
  const handleDeleteQrCode = async (qrCode) => {
    setDeletingQrCodeKey(qrCode.qrCodeKey);
    setError('');
    try {
      const response = await apiFetch(
        `/api/qr-codes?qrCodeKey=${encodeURIComponent(qrCode.qrCodeKey)}`,
        { method: 'DELETE' }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to delete QR code');
      setQrCodes(current => current.filter(item => item.qrCodeKey !== qrCode.qrCodeKey));
      setSuccessMessage('QR code deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete QR code');
    } finally {
      setDeletingQrCodeKey(null);
      setConfirmingQrCodeKey(null);
    }
  };

  // QR row actions use the report entries' buttons (icon-only ones like the report Download button).
  const iconButtonStyle = { ...entryButtonStyle, padding: '0.4rem 0.6rem' };

  const linkButtonStyle = (color, busy = false) => ({
    background: 'none', border: 'none', padding: 0,
    fontSize: '13px', fontWeight: 600, color,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.55 : 1,
  });

  return (
    <PageLayout title="Survey Distribution">
      <SurveysPageHeader activeTab="distribution" />

      {successMessage && (
        <div style={{
          backgroundColor: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '8px',
          padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#065f46',
          fontSize: '0.9rem', fontWeight: '500',
        }}>
          {successMessage}
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
          padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#b91c1c',
          fontSize: '0.9rem', fontWeight: '500',
        }}>
          {error}
        </div>
      )}

      {/* ── Active Email Distributions ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2 className="card-title">Active Email Distributions</h2>
          <Link href={CREATE_EMAIL_DISTRIBUTION_PATH} className="btn-primary btn-create">
            Create Email Distribution
          </Link>
        </div>

        {loadingDistributions ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem' }}>
            Loading email distributions…
          </p>
        ) : activeDistributions.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem' }}>
            No active email distributions.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Recipients</th>
                  <th>Responses</th>
                  <th>Response Rate</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeDistributions.map((d) => {
                  const recipients = d.recipient_emails?.length || 0;
                  const responses = d.response_count || 0;
                  const rate = recipients > 0 ? Math.round((responses / recipients) * 100) : 0;
                  const deleting = deletingDistributionId === d.distribution_id;
                  return (
                    <tr key={d.distribution_id}>
                      <td style={{ fontWeight: 500, color: '#111827' }}>{d.title}</td>
                      <td>{recipients}</td>
                      <td>{responses}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '80px', height: '6px', borderRadius: '3px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
                            <div style={{ width: `${rate}%`, height: '100%', backgroundColor: '#059669', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '12px', color: '#6B7280' }}>{rate}%</span>
                        </div>
                      </td>
                      <td style={{ color: '#6B7280' }}>{d.start_date}</td>
                      <td style={{ color: '#6B7280' }}>{d.end_date}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleDeleteDistribution(d)}
                          disabled={deleting}
                          style={linkButtonStyle('#DC2626', deleting)}
                        >
                          {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Active QR Codes ── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Active QR Codes</h2>
          <Link href={GENERATE_QR_CODE_PATH} className="btn-primary btn-create">
            Generate QR Code
          </Link>
        </div>

        {qrCodesLoading ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem' }}>Loading QR codes...</p>
        ) : activeQrCodes.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem' }}>
            No active QR codes.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Template</th>
                  <th>Scans</th>
                  <th>Conversions</th>
                  <th>Rate</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeQrCodes.map((qr) => {
                  const deleting = deletingQrCodeKey === qr.qrCodeKey;
                  return (
                    <tr key={qr.qrCodeId}>
                      <td style={{ fontWeight: 500, color: '#111827' }}>
                        {qr.description || qr.qrCodeKey}
                      </td>
                      <td style={{ color: '#6B7280' }}>{qr.templateTitle || '—'}</td>
                      <td>{qr.stats.totalScans}</td>
                      <td>{qr.stats.conversions}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '60px', height: '6px', borderRadius: '3px', backgroundColor: '#E5E7EB', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(qr.stats.conversionRate, 100)}%`,
                              height: '100%', backgroundColor: '#059669', borderRadius: '3px',
                            }} />
                          </div>
                          <span style={{ fontSize: '12px', color: '#6B7280' }}>{qr.stats.conversionRate}%</span>
                        </div>
                      </td>
                      <td style={{ color: '#6B7280', fontSize: '13px' }}>
                        {qr.createdAt ? new Date(qr.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            style={iconButtonStyle}
                            onClick={() => downloadQrCode(qr.qrCodeKey, 'png')}
                            title="Download QR code"
                            aria-label={`Download QR code ${qr.description || qr.qrCodeKey}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            style={iconButtonStyle}
                            onClick={() => {
                              navigator.clipboard.writeText(qr.targetUrl);
                              setSuccessMessage('QR link copied to clipboard!');
                              setTimeout(() => setSuccessMessage(''), 3000);
                            }}
                            title="Copy link"
                            aria-label={`Copy link for ${qr.description || qr.qrCodeKey}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                          </button>
                          <InlineDeleteConfirm
                            confirming={confirmingQrCodeKey === qr.qrCodeKey}
                            onStart={() => setConfirmingQrCodeKey(qr.qrCodeKey)}
                            onConfirm={() => handleDeleteQrCode(qr)}
                            onCancel={() => setConfirmingQrCodeKey(null)}
                            disabled={deleting}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
