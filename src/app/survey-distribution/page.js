'use client';

import PageLayout from '@/components/PageLayout';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

export default function SurveyDistributionPage() {
  const router = useRouter();

  // Auth state
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Form state
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [recipientEmails, setRecipientEmails] = useState([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  // Distributions list
  const [distributions, setDistributions] = useState([]);
  const [loadingDistributions, setLoadingDistributions] = useState(true);
  const [deletingDistributionId, setDeletingDistributionId] = useState(null);

  // QR section state
  const [qrTemplateId, setQrTemplateId] = useState('');
  const [qrDescription, setQrDescription] = useState('');
  const [qrGenerating, setQrGenerating] = useState(false);
  const [qrResult, setQrResult] = useState(null);
  const [qrCodes, setQrCodes] = useState([]);
  const [qrCodesLoading, setQrCodesLoading] = useState(false);
  const [deletingQrCodeKey, setDeletingQrCodeKey] = useState(null);

  // ── Auth check ───────────────────────────────────────
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      if (parsed.permissions && parsed.permissions.includes('surveys.distribute')) {
        setUser(parsed);
      }
    }
    setAuthChecked(true);
  }, []);

  // ── Fetch survey templates + existing distributions ──
  useEffect(() => {
    if (!user) return;

    fetch('/api/surveys/templates')
      .then((res) => res.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));

    fetchDistributions();
    fetchQrCodes();
  }, [user]);

  const fetchDistributions = () => {
    setLoadingDistributions(true);
    apiFetch('/api/surveys/distributions')
      .then((res) => res.json())
      .then((data) => setDistributions(data.distributions || []))
      .catch(() => setDistributions([]))
      .finally(() => setLoadingDistributions(false));
  };

  // ── Fetch existing QR codes ──────────────────────────
  const fetchQrCodes = () => {
    setQrCodesLoading(true);
    apiFetch('/api/qr-codes?scope=survey')
      .then((res) => res.json())
      .then((data) => setQrCodes(data.qrCodes || []))
      .catch(() => setQrCodes([]))
      .finally(() => setQrCodesLoading(false));
  };

  // ── Generate QR code ───────────────────────────────
  const handleGenerateQR = async () => {
    if (!qrTemplateId) return;
    setQrGenerating(true);
    setQrResult(null);
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
      fetchQrCodes();
    } catch (err) {
      setError(err.message);
    } finally {
      setQrGenerating(false);
    }
  };

  // ── Download QR code ───────────────────────────────
  const handleDownloadQR = (qrCodeKey, format = 'png') => {
    const url = `/api/qr-codes/download?qrCodeKey=${qrCodeKey}&format=${format}&download=true`;
    window.open(url, '_blank');
  };

  const handleDeleteDistribution = async (distribution) => {
    if (!window.confirm(`Delete the distribution “${distribution.title}”? This cannot be undone.`)) return;
    setDeletingDistributionId(distribution.distribution_id);
    setError('');
    try {
      const response = await apiFetch(
        `/api/surveys/distributions?distributionId=${distribution.distribution_id}`,
        { method: 'DELETE' }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to delete distribution');
      setDistributions(current => current.filter(
        item => item.distribution_id !== distribution.distribution_id
      ));
      setSuccessMessage('Distribution deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete distribution');
    } finally {
      setDeletingDistributionId(null);
    }
  };

  const handleDeleteQrCode = async (qrCode) => {
    const name = qrCode.description || qrCode.qrCodeKey;
    if (!window.confirm(`Delete the QR code “${name}”? This cannot be undone.`)) return;
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
      if (qrResult?.qrCodeKey === qrCode.qrCodeKey) setQrResult(null);
      setSuccessMessage('QR code deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete QR code');
    } finally {
      setDeletingQrCodeKey(null);
    }
  };

  // ── Email chip helpers ───────────────────────────────
  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (recipientEmails.includes(trimmed)) {
      setError('This email has already been added.');
      return;
    }
    setRecipientEmails([...recipientEmails, trimmed]);
    setEmailInput('');
    setError('');
  };

  const removeEmail = (emailToRemove) => {
    setRecipientEmails(recipientEmails.filter((e) => e !== emailToRemove));
  };

  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail();
    }
  };

  // ── Submit distribution ──────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!selectedTemplateId || !title.trim() || !startDate || !endDate) {
      setError('Please fill out all required fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await apiFetch('/api/surveys/distributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survey_template_id: selectedTemplateId,
          title: title.trim(),
          start_date: startDate,
          end_date: endDate,
          recipient_emails: recipientEmails,
          created_by_user_id: user?.user_id || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create distribution.');
      }

      setSuccessMessage(data.message || 'Distribution created successfully!');
      // Reset form
      setSelectedTemplateId('');
      setTitle('');
      setStartDate('');
      setEndDate('');
      setEmailInput('');
      setRecipientEmails([]);
      // Refresh list
      fetchDistributions();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Today's date for min attribute ───────────────────
  const todayStr = new Date().toISOString().split('T')[0];

  // ── Style objects ────────────────────────────────────
  const inputStyle = {
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

  const labelStyle = {
    display: 'block',
    fontWeight: '600',
    fontSize: '0.9rem',
    color: '#111827',
    marginBottom: '0.35rem',
  };

  const fieldGroupStyle = {
    marginBottom: '1.25rem',
  };

  // ── Stats computed from distributions ────────────────
  const totalDistributed = distributions.reduce((sum, d) => sum + (d.recipient_emails?.length || 0), 0);
  const totalResponses = distributions.reduce((sum, d) => sum + (d.response_count || 0), 0);
  const responseRate = totalDistributed > 0 ? Math.round((totalResponses / totalDistributed) * 100) : 0;
  const pendingCount = distributions.filter((d) => d.status === 'pending' || d.status === 'active').length;

  // ── Status pill helper ───────────────────────────────
  const statusPill = (status) => {
    if (status === 'active') return <span className="pill pill-green">Active</span>;
    if (status === 'pending') return <span className="pill pill-yellow">Scheduled</span>;
    if (status === 'closed') return <span className="pill pill-gray">Completed</span>;
    return <span className="pill pill-gray">{status}</span>;
  };

  // ── Method pill helper ────────────────────────────────
  const methodPill = (method) => {
    if (!method || method === 'email') {
      return (
        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500, background: '#DBEAFE', color: '#1E40AF' }}>
          Email
        </span>
      );
    }
    if (method === 'qr') {
      return (
        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500, background: '#F3E8FF', color: '#7C3AED' }}>
          QR
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 500, background: '#FEF3C7', color: '#92400E' }}>
        Link
      </span>
    );
  };

  // ── Render ───────────────────────────────────────────

  // Not authorized
  if (authChecked && !user) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔒</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
            Access Restricted
          </h2>
          <p style={{ color: '#6B7280', marginBottom: '1.5rem' }}>
            Only admin and staff users can distribute surveys. Please log in with an authorized account.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="btn-primary"
            style={{ padding: '0.65rem 2rem', fontSize: '0.95rem' }}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Loading auth
  if (!authChecked) return null;

  return (
    <PageLayout title="Survey Distribution">
      <button
        className="btn-outline"
        style={{ padding: '6px 12px', fontSize: 12, marginBottom: '16px' }}
        onClick={() => router.push('/manage-surveys')}
      >
        &larr; Back
      </button>

      {/* ── Stats Row ── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Distributed</div>
          <div className="stat-value">{totalDistributed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Response Rate</div>
          <div className="stat-value">{responseRate}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value">{pendingCount}</div>
        </div>
      </div>

      {/* ── Active Distributions Table ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2 className="card-title">Active Distributions</h2>
          <button
            className="btn-primary"
            onClick={() => document.getElementById('new-distribution-form').scrollIntoView({ behavior: 'smooth' })}
          >
            + New Distribution
          </button>
        </div>

        {loadingDistributions ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem' }}>
            Loading distributions…
          </p>
        ) : distributions.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem' }}>
            No distributions yet. Create your first one below.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Initiative</th>
                  <th>Method</th>
                  <th>Recipients</th>
                  <th>Responses</th>
                  <th>Response Rate</th>
                  <th>Status</th>
                  <th>Date Sent</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {distributions.map((d) => {
                  const recipients = d.recipient_emails?.length || 0;
                  const responses = d.response_count || 0;
                  const rate = recipients > 0 ? Math.round((responses / recipients) * 100) : 0;
                  return (
                    <tr key={d.distribution_id}>
                      <td style={{ fontWeight: 500, color: '#111827' }}>{d.title}</td>
                      <td>{methodPill(d.method)}</td>
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
                      <td>{statusPill(d.status)}</td>
                      <td style={{ color: '#6B7280' }}>{d.start_date}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => handleDeleteDistribution(d)}
                          disabled={deletingDistributionId === d.distribution_id}
                          style={{
                            background: 'none', border: 'none', padding: 0,
                            color: '#DC2626', fontSize: '13px', fontWeight: 600,
                            cursor: deletingDistributionId === d.distribution_id ? 'wait' : 'pointer',
                            opacity: deletingDistributionId === d.distribution_id ? 0.55 : 1,
                          }}
                        >
                          {deletingDistributionId === d.distribution_id ? 'Deleting…' : 'Delete'}
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

      {/* ── New Distribution Form ── */}
      <div id="new-distribution-form" className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2 className="card-title">New Distribution</h2>
        </div>

        {/* Success banner */}
        {successMessage && (
          <div style={{
            backgroundColor: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '8px',
            padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#065f46',
            fontSize: '0.9rem', fontWeight: '500',
          }}>
            {successMessage}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{
            backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
            padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#b91c1c',
            fontSize: '0.9rem', fontWeight: '500',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Survey Template Dropdown */}
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              Survey Template <span style={{ color: '#E67E22' }}>*</span>
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
              required
            >
              <option value="">— Select a template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.35rem' }}>
                No templates found. Create one on the Survey page first.
              </p>
            )}
          </div>

          {/* Distribution Title */}
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              Distribution Title <span style={{ color: '#E67E22' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Spring 2026 Campus Feedback"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {/* Dates – side by side */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ ...fieldGroupStyle, flex: '1 1 45%', minWidth: '200px' }}>
              <label style={labelStyle}>
                Start Date <span style={{ color: '#E67E22' }}>*</span>
              </label>
              <input
                type="date"
                value={startDate}
                min={todayStr}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ ...fieldGroupStyle, flex: '1 1 45%', minWidth: '200px' }}>
              <label style={labelStyle}>
                End Date <span style={{ color: '#E67E22' }}>*</span>
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate || todayStr}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
          </div>

          {/* Distribution Emails */}
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Distribution Emails</label>
            <p style={{ fontSize: '0.82rem', color: '#9CA3AF', marginBottom: '0.5rem' }}>
              Type an email and press <strong>Enter</strong> or <strong>comma</strong> to add it.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email"
                placeholder="email@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={addEmail}
                className="btn-outline"
                style={{ whiteSpace: 'nowrap' }}
              >
                Add
              </button>
            </div>

            {/* Email chips */}
            {recipientEmails.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem' }}>
                {recipientEmails.map((em) => (
                  <span
                    key={em}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.3rem 0.7rem', borderRadius: '999px',
                      backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB',
                      fontSize: '0.82rem', color: '#374151',
                    }}
                  >
                    {em}
                    <button
                      type="button"
                      onClick={() => removeEmail(em)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#9CA3AF', padding: 0, lineHeight: 1 }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              style={{
                padding: '0.65rem 2rem',
                fontSize: '0.95rem',
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Creating…' : 'Create Distribution'}
            </button>
          </div>
        </form>
      </div>

      {/* ── QR Code Section ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2 className="card-title">Generate QR Code</h2>
        </div>
        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '20px', marginTop: 0 }}>
          Create scannable QR codes that link directly to your survey templates.
        </p>

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
            <button
              className="btn-primary"
              onClick={handleGenerateQR}
              disabled={!qrTemplateId || qrGenerating}
              style={{
                alignSelf: 'flex-start',
                padding: '0.65rem 1.5rem',
                opacity: (!qrTemplateId || qrGenerating) ? 0.6 : 1,
                cursor: (!qrTemplateId || qrGenerating) ? 'not-allowed' : 'pointer',
              }}
            >
              {qrGenerating ? 'Generating...' : 'Generate QR Code'}
            </button>
          </div>

          {/* Right: QR Preview */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            {qrResult ? (
              <>
                <div style={{
                  width: '200px', height: '200px', borderRadius: '12px',
                  border: '1px solid #E5E7EB', overflow: 'hidden', backgroundColor: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <img
                    src={qrResult.dataUrl}
                    alt="Generated QR Code"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280', textAlign: 'center', maxWidth: '200px', wordBreak: 'break-all' }}>
                  {qrResult.targetUrl}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn-primary"
                    onClick={() => handleDownloadQR(qrResult.qrCodeKey, 'png')}
                    style={{ padding: '6px 14px', fontSize: '13px' }}
                  >
                    Download PNG
                  </button>
                  <button
                    className="btn-outline"
                    onClick={() => handleDownloadQR(qrResult.qrCodeKey, 'svg')}
                    style={{ padding: '6px 14px', fontSize: '13px' }}
                  >
                    SVG
                  </button>
                </div>
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
      </div>

      {/* ── Existing QR Codes ── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">QR Codes</h2>
          <span style={{ fontSize: '13px', color: '#6B7280' }}>
            {qrCodes.length} code{qrCodes.length !== 1 ? 's' : ''}
          </span>
        </div>

        {qrCodesLoading ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem' }}>Loading QR codes...</p>
        ) : qrCodes.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem' }}>
            No QR codes generated yet.
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
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {qrCodes.map((qr) => (
                  <tr key={qr.qrCodeId}>
                    <td style={{ fontWeight: 500, color: '#111827' }}>
                      {qr.description || qr.qrCodeKey}
                    </td>
                    <td style={{ color: '#6B7280' }}>
                      {qr.templateTitle || '—'}
                    </td>
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
                    <td>
                      {qr.isExpired ? (
                        <span className="pill pill-red">Expired</span>
                      ) : qr.isActive ? (
                        <span className="pill pill-green">Active</span>
                      ) : (
                        <span className="pill pill-gray">Inactive</span>
                      )}
                    </td>
                    <td style={{ color: '#6B7280', fontSize: '13px' }}>
                      {qr.createdAt ? new Date(qr.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleDownloadQR(qr.qrCodeKey, 'png')}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '13px', fontWeight: '600', color: '#E67E22', padding: 0,
                          }}
                        >
                          Download
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(qr.targetUrl);
                            setSuccessMessage('QR link copied to clipboard!');
                            setTimeout(() => setSuccessMessage(''), 3000);
                          }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: '13px', fontWeight: '600', color: '#6B7280', padding: 0,
                          }}
                        >
                          Copy Link
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQrCode(qr)}
                          disabled={deletingQrCodeKey === qr.qrCodeKey}
                          style={{
                            background: 'none', border: 'none', padding: 0,
                            color: '#DC2626', fontSize: '13px', fontWeight: 600,
                            cursor: deletingQrCodeKey === qr.qrCodeKey ? 'wait' : 'pointer',
                            opacity: deletingQrCodeKey === qr.qrCodeKey ? 0.55 : 1,
                          }}
                        >
                          {deletingQrCodeKey === qr.qrCodeKey ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
