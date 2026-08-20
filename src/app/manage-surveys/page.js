'use client';

import PageLayout from '@/components/PageLayout';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

export default function ManageSurveysPage() {
  const router = useRouter();
  const [surveys, setSurveys] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // QR code state
  const [qrCodes, setQrCodes] = useState([]);
  const [qrCodesLoading, setQrCodesLoading] = useState(false);
  const [copiedQrKey, setCopiedQrKey] = useState('');

  const formatEasternDateTime = (timestamp) => {
    if (!timestamp) return '—';
    try {
      return new Date(timestamp).toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
    } catch {
      return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    }
  };

  const getCsrfToken = () => {
    const match = document.cookie.match(/(^|;)\s*asrs_csrf\s*=\s*([^;]+)/);
    return match ? decodeURIComponent(match[2]) : '';
  };

  const fetchSurveys = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/surveys');
      if (!res.ok) throw new Error('Failed to load surveys');
      const data = await res.json();
      setSurveys(Array.isArray(data.surveys) ? data.surveys : []);
    } catch (err) {
      setError(err.message || 'Unable to load surveys');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/surveys/templates');
      if (!res.ok) throw new Error('Failed to load survey templates');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Unable to load survey templates');
    }
  };

  const fetchQrCodes = () => {
    setQrCodesLoading(true);
    apiFetch('/api/qr-codes?scope=survey')
      .then((res) => res.json())
      .then((data) => setQrCodes(data.qrCodes || []))
      .catch(() => setQrCodes([]))
      .finally(() => setQrCodesLoading(false));
  };

  const handleCopyQrUrl = async (qr) => {
    try {
      await navigator.clipboard.writeText(qr.targetUrl);
      setCopiedQrKey(qr.qrCodeKey);
      setTimeout(() => setCopiedQrKey(''), 1500);
    } catch {
      setError('Copy failed. Please copy the URL manually.');
    }
  };

  const handleDownloadQR = (qrCodeKey, format = 'png') => {
    window.open(`/api/qr-codes/download?qrCodeKey=${encodeURIComponent(qrCodeKey)}&format=${format}&size=400&download=true`, '_blank');
  };

  useEffect(() => {
    fetchTemplates();
    fetchSurveys();
    fetchQrCodes();
  }, []);

  const selectedSurvey = surveys.find((s) => String(s.id) === String(selectedSurveyId));
  const selectedTemplate = templates.find((t) => String(t.id) === String(selectedTemplateId));

  const filteredSurveys = selectedTemplateId
    ? surveys.filter((s) => {
        const tid = s.responses?.templateId;
        return tid != null && String(tid) === String(selectedTemplateId);
      })
    : surveys;

  const deleteSurvey = async (surveyId) => {
    if (!confirm('Delete this survey submission (not template) permanently?')) return;

    try {
      const res = await fetch(`/api/surveys?surveyId=${surveyId}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': getCsrfToken(),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete survey submission');

      setSuccessMessage(`Survey submission #${surveyId} deleted successfully.`);
      setSelectedSurveyId('');
      await fetchSurveys();
    } catch (err) {
      setError(err.message || 'Unable to delete survey submission');
    }
  };

  const deleteTemplate = async (templateId) => {
    if (!templateId || !confirm('Delete this survey template and all its submissions?')) return;

    try {
      const res = await fetch(`/api/surveys/templates?templateId=${templateId}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': getCsrfToken(),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete survey template');

      setSuccessMessage(`Survey template #${templateId} and related submissions deleted successfully.`);
      setSelectedTemplateId('');
      setSelectedSurveyId('');
      await fetchTemplates();
      await fetchSurveys();
    } catch (err) {
      setError(err.message || 'Unable to delete survey template');
    }
  };

  // Helper to derive a status label for a template
  const templateStatus = (template) => {
    // If the template has a status field, use it; otherwise default to 'active'
    return template.status || 'active';
  };

  const statusPill = (status) => {
    if (status === 'active') return <span className="pill pill-green">Active</span>;
    if (status === 'draft') return <span className="pill pill-yellow">Draft</span>;
    if (status === 'archived') return <span className="pill pill-gray">Archived</span>;
    return <span className="pill pill-green">Active</span>;
  };

  // Compute per-template response counts
  const responseCountByTemplate = (templateId) =>
    surveys.filter((s) => {
      const tid = s.responses?.templateId;
      return tid != null && String(tid) === String(templateId);
    }).length;

  return (
    <PageLayout title="Manage Surveys">
      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button
          className="btn-primary"
          onClick={() => router.push('/form-creation')}
        >
          + Create Survey
        </button>
        <button
          className="btn-outline"
          onClick={() => router.push('/survey-distribution')}
        >
          Distribution
        </button>
      </div>

      {/* Success banner */}
      {successMessage && (
        <div style={{
          marginBottom: '20px', padding: '12px 16px', borderRadius: '8px',
          border: '1px solid #a7f3d0', backgroundColor: '#d1fae5', color: '#065f46',
          fontSize: '0.9rem', fontWeight: 500,
        }}>
          {successMessage}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          marginBottom: '20px', padding: '12px 16px', borderRadius: '8px',
          border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#b91c1c',
          fontSize: '0.9rem', fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {/* Analytics Section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h2 className="card-title">Survey Analytics</h2>
        </div>
        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginTop: 0, marginBottom: '16px' }}>
          Submission distribution across templates
        </p>
        {templates.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>No templates to analyze.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {templates.map((template) => {
              const count = responseCountByTemplate(template.id);
              const maxCount = Math.max(...templates.map((t) => responseCountByTemplate(t.id)), 1);
              const barWidth = Math.round((count / maxCount) * 100);
              return (
                <div key={template.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px' }}>
                    <span style={{ color: '#374151', fontWeight: 500 }}>{template.title}</span>
                    <span style={{ color: '#6B7280' }}>{count} response{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${barWidth}%`, height: '100%',
                      backgroundColor: '#E67E22', borderRadius: '4px',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Survey Templates Grid */}
      {templates.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Survey Templates</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {templates.map((template) => {
              const status = templateStatus(template);
              const responseCount = responseCountByTemplate(template.id);
              const questionCount = template.questions?.length || 0;
              const lastModified = template.updatedAt || template.createdAt;

              return (
                <div
                  key={template.id}
                  style={{
                    backgroundColor: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: '12px',
                    padding: '20px',
                    transition: 'transform 150ms ease, box-shadow 150ms ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = '';
                    e.currentTarget.style.boxShadow = '';
                  }}
                >
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h3
                      style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#E67E22', cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); router.push(`/manage-surveys/${template.id}`); }}
                    >
                      {template.title}
                    </h3>
                    {statusPill(status)}
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '12px', color: '#6B7280' }}>
                      {questionCount} question{questionCount !== 1 ? 's' : ''}
                    </span>
                    {lastModified && (
                      <span style={{ fontSize: '12px', color: '#6B7280' }}>
                        Modified {new Date(lastModified).toLocaleDateString()}
                      </span>
                    )}
                    <span style={{ fontSize: '12px', color: '#6B7280' }}>
                      {responseCount} response{responseCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Action links */}
                  <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid #F3F4F6', paddingTop: '12px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/manage-surveys/${template.id}`); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#E67E22', padding: 0 }}
                    >
                      Manage
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTemplate(template.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#DC2626', padding: 0, marginLeft: 'auto' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submissions Table */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2 className="card-title">Survey Submissions</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#6B7280' }}>
              {filteredSurveys.length} submission{filteredSurveys.length !== 1 ? 's' : ''}
            </span>
            <button
              className="btn-outline"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setShowFilterPanel(!showFilterPanel)}
            >
              {showFilterPanel ? 'Hide Filter' : 'Filter'}
            </button>
          </div>
        </div>

        {showFilterPanel && (
          <div style={{ padding: '16px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB', borderRadius: '8px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px' }}>
                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', color: '#374151', marginBottom: '6px' }}>
                  Filter by template
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    setSelectedTemplateId(e.target.value);
                    setSelectedSurveyId('');
                  }}
                  style={{
                    width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px',
                    border: '1px solid #E5E7EB', fontSize: '0.9rem', outline: 'none',
                  }}
                >
                  <option value="">-- All templates and submissions --</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      #{template.id} - {template.title}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '1 1 280px' }}>
                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.85rem', color: '#374151', marginBottom: '6px' }}>
                  Select specific submission (optional)
                </label>
                <select
                  value={selectedSurveyId}
                  onChange={(e) => setSelectedSurveyId(e.target.value)}
                  style={{
                    width: '100%', padding: '0.6rem 0.85rem', borderRadius: '8px',
                    border: '1px solid #E5E7EB', fontSize: '0.9rem', outline: 'none',
                  }}
                >
                  <option value="">-- Select a submission --</option>
                  {filteredSurveys.map((survey) => (
                    <option key={survey.id} value={survey.id}>
                      #{survey.id} - {survey.name} ({survey.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedTemplate && (
              <div style={{ marginTop: '12px', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#374151' }}>Selected template:</span>
                <span style={{ fontSize: '0.9rem', color: '#111827' }}>{selectedTemplate.title}</span>
                <button
                  className="btn-outline"
                  style={{ padding: '5px 12px', fontSize: '12px', color: '#DC2626', borderColor: '#fca5a5' }}
                  onClick={() => deleteTemplate(selectedTemplate.id)}
                >
                  Delete template + submissions
                </button>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem' }}>Loading surveys...</p>
        ) : !filteredSurveys.length ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem' }}>No survey submissions found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Submitted At</th>
                  <th>Template</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSurveys.map((survey) => {
                  const parsedResponses = survey.responses || {};
                  return (
                    <tr key={survey.id}>
                      <td style={{ fontWeight: 500 }}>#{survey.id}</td>
                      <td>{survey.name}</td>
                      <td>{survey.email}</td>
                      <td>{survey.submittedAt ? `${formatEasternDateTime(survey.submittedAt)} (Eastern)` : '—'}</td>
                      <td>{parsedResponses.templateTitle || 'N/A'}</td>
                      <td>
                        <button
                          style={{
                            background: 'none', border: '1px solid #fca5a5', borderRadius: '6px',
                            cursor: 'pointer', fontSize: '12px', padding: '4px 10px',
                            color: '#DC2626', fontWeight: 500,
                          }}
                          onClick={() => deleteSurvey(survey.id)}
                        >
                          Delete
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

      {/* Selected Survey Details */}
      {selectedSurvey && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Selected Submission Details</h2>
          </div>
          <pre style={{
            whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '300px',
            padding: '12px', border: '1px solid #E5E7EB', borderRadius: '8px',
            backgroundColor: '#F9FAFB', fontSize: '12px', margin: 0,
          }}>
            {JSON.stringify(selectedSurvey, null, 2)}
          </pre>
        </div>
      )}

      {/* QR Code Inventory */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2 className="card-title">Survey QR Codes</h2>
          <span style={{ fontSize: '13px', color: '#6B7280' }}>
            {qrCodes.length} code{qrCodes.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginTop: 0, marginBottom: '16px' }}>
          Manage survey QR distributors in one place.
        </p>
        {qrCodesLoading ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem' }}>Loading QR codes...</p>
        ) : qrCodes.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>
            No survey QR codes yet. Generate one below.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {['Survey', 'QR Key', 'Status', 'Scans', 'Submissions', 'Created', 'Actions'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qrCodes.map((qr) => {
                  const isExpired = Boolean(qr.isExpired);
                  const isActive = Boolean(qr.isActive) && !isExpired;
                  return (
                    <tr key={qr.qrCodeKey}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{qr.templateTitle || 'General Survey'}</div>
                        <div style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>{qr.description || 'No description'}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{qr.qrCodeKey}</td>
                      <td>
                        <span className={`pill ${isActive ? 'pill-green' : 'pill-red'}`}>
                          {isActive ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td>{qr.stats.totalScans}</td>
                      <td>{qr.stats.conversions}</td>
                      <td>{new Date(qr.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <a href={qr.targetUrl} target="_blank" rel="noreferrer" className="btn-outline" style={{ textDecoration: 'none', padding: '4px 10px', fontSize: '12px' }}>
                            Open
                          </a>
                          <button type="button" className="btn-outline" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleCopyQrUrl(qr)}>
                            {copiedQrKey === qr.qrCodeKey ? 'Copied' : 'Copy URL'}
                          </button>
                          <button type="button" className="btn-outline" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleDownloadQR(qr.qrCodeKey, 'png')}>
                            PNG
                          </button>
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
