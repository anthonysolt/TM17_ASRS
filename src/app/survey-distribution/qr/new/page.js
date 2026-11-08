'use client';

import { useEffect, useState } from 'react';
import PageLayout from '@/components/PageLayout';
import SurveysPageHeader from '@/components/SurveysPageHeader';
import DistributionAccessGate from '@/components/DistributionAccessGate';
import QrFormatButtons from '@/components/QrFormatButtons';
import { apiFetch } from '@/lib/api/client';
import {
  DISTRIBUTION_LIST_PATH,
  downloadQrCode,
  inputStyle,
  labelStyle,
} from '@/lib/surveys/distribution-ui';

export default function GenerateQrCodePage() {
  return (
    <DistributionAccessGate>
      <GenerateQrCodeForm />
    </DistributionAccessGate>
  );
}

function GenerateQrCodeForm() {
  const [templates, setTemplates] = useState([]);
  const [qrTemplateId, setQrTemplateId] = useState('');
  const [qrDescription, setQrDescription] = useState('');
  const [qrGenerating, setQrGenerating] = useState(false);
  const [qrResult, setQrResult] = useState(null);
  const [selectedQrFormat, setSelectedQrFormat] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/surveys/templates')
      .then((res) => res.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
  }, []);

  const handleGenerateQR = async () => {
    if (!qrTemplateId) return;
    setQrGenerating(true);
    setQrResult(null);
    setError('');
    try {
      const res = await apiFetch('/api/qr-codes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrType: 'survey_template',
          targetId: qrTemplateId,
          description: qrDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate QR code');
      setQrResult(data.qrCode);
      setSelectedQrFormat(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setQrGenerating(false);
    }
  };

  return (
    <PageLayout title="Generate QR Code">
      <SurveysPageHeader
        showCreate={false}
        activeTab="distribution"
        showTabs={false}
        backHref={DISTRIBUTION_LIST_PATH}
        backLabel="&larr; Back to Survey Distribution"
      />

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2 className="card-title">Generate QR Code</h2>
        </div>
        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '20px', marginTop: 0 }}>
          Create scannable QR codes that link directly to your survey templates.
        </p>

        {error && (
          <div style={{
            backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
            padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#b91c1c',
            fontSize: '0.9rem', fontWeight: '500',
          }}>
            {error}
          </div>
        )}

        {qrResult && (
          <div style={{
            backgroundColor: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '8px',
            padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#065f46',
            fontSize: '0.9rem', fontWeight: '500',
          }}>
            QR code generated. Download it below; it now appears under Active QR Codes.
          </div>
        )}

        <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Left: Form */}
          <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Survey Template <span style={{ color: '#E67E22' }}>*</span></label>
              <select
                value={qrTemplateId}
                onChange={(e) => setQrTemplateId(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">— Choose a template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Description (optional)</label>
              <input
                type="text"
                placeholder="e.g. Lobby poster, Event handout"
                value={qrDescription}
                onChange={(e) => setQrDescription(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Right: QR Preview */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            {qrResult ? (
              <>
                <div style={{ textAlign: 'center', maxWidth: '200px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Survey Link:</div>
                  <div style={{ fontSize: '12px', color: '#6B7280', wordBreak: 'break-all' }}>
                    {qrResult.targetUrl}
                  </div>
                </div>

                <div style={{
                  width: '200px', height: '200px', borderRadius: '12px',
                  border: '1px solid #E5E7EB', overflow: 'hidden', backgroundColor: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
                  <img
                    src={qrResult.dataUrl}
                    alt="Generated QR Code"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>

                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>QR Code Downloads</div>
                <QrFormatButtons
                  selectedFormat={selectedQrFormat}
                  onSelect={(format) => { setSelectedQrFormat(format); downloadQrCode(qrResult.qrCodeKey, format); }}
                />
              </>
            ) : (
              <div style={{
                width: '200px', height: '200px', border: '2px dashed #D1D5DB', borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#9CA3AF', fontSize: '13px', textAlign: 'center', padding: '16px',
              }}>
                Select a template and click Generate to create a QR code
              </div>
            )}
          </div>
        </div>

        {/* Generate sits in the card's bottom-right corner. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button
            className="btn-primary"
            onClick={handleGenerateQR}
            disabled={!qrTemplateId || qrGenerating}
            style={{
              padding: '0.65rem 1.5rem',
              opacity: (!qrTemplateId || qrGenerating) ? 0.6 : 1,
              cursor: (!qrTemplateId || qrGenerating) ? 'not-allowed' : 'pointer',
            }}
          >
            {qrGenerating ? 'Generating...' : 'Generate QR Code'}
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
