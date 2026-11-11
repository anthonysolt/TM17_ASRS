'use client';

import PageLayout from '@/components/PageLayout';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';
import SurveyPreview from '@/components/SurveyPreview';
import QrFormatButtons from '@/components/QrFormatButtons';
import SurveyResponsesView from '@/components/SurveyResponsesView';
import TabBar from '@/components/TabBar';
import { getFormBuilderEditPath } from '@/lib/forms/form-editing-client';

function formatDate(d) {
  if (!d) return '\u2014';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

function statusPill(published) {
  if (published) return <span className="pill pill-green">Active</span>;
  return <span className="pill pill-gray">Draft</span>;
}

const QUESTION_TYPE_LABELS = {
  text: 'Short Text', textarea: 'Long Text', number: 'Number', numeric: 'Number',
  select: 'Dropdown', radio: 'Multiple Choice', choice: 'Multiple Choice',
  checkbox: 'Checkbox', multiselect: 'Checkbox', date: 'Date', rating: 'Rating',
  boolean: 'Yes / No', email: 'Email', url: 'URL / Link', yesno: 'Yes/No',
};

export default function SurveyDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, hydrated } = useAuthStore();

  const [template, setTemplate] = useState(null);
  // This survey's response count; the Responses tab loads the responses a page at a time.
  const [totalResponses, setTotalResponses] = useState(0);
  const [qrCodes, setQrCodes] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('questions');
  const [qrGenerating, setQrGenerating] = useState(false);
  const [selectedQrFormat, setSelectedQrFormat] = useState(null);
  const [newQrCode, setNewQrCode] = useState(null);
  // Questions removed in an edit; their answers are kept until deleted here.
  const [retiredQuestions, setRetiredQuestions] = useState([]);
  const [deletingRetiredId, setDeletingRetiredId] = useState(null);


  useEffect(() => {
    if (!hydrated) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'admin' && user.user_type !== 'staff') { router.push('/dashboard'); return; }
    loadAll();
  }, [hydrated, user, id]);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [tplRes, subRes, qrRes, distRes] = await Promise.all([
        fetch(`/api/surveys/templates/${id}`),
        apiFetch(`/api/surveys?templateId=${encodeURIComponent(id)}&limit=1`),
        apiFetch('/api/qr-codes?scope=survey'),
        apiFetch('/api/surveys/distributions'),
      ]);

      const tplData = await tplRes.json();
      if (tplRes.ok && tplData.id) {
        setTemplate(tplData);
      } else {
        setError('Survey not found');
        setLoading(false);
        return;
      }

      const subData = await subRes.json().catch(() => ({}));
      if (subRes.ok) setTotalResponses(Number(subData.total) || 0);
      else setError(`Could not load the response count: ${subData.error || `server responded ${subRes.status}`}`);

      const qrData = await qrRes.json();
      const allQr = Array.isArray(qrData) ? qrData : qrData.qrCodes || [];
      setQrCodes(allQr.filter(q => String(q.target_id || q.targetId) === String(id)));

      const distData = await distRes.json();
      const allDist = distData.distributions || [];
      setDistributions(allDist.filter(d => String(d.survey_template_id) === String(id)));

      await loadRetiredQuestions();
    } catch (err) {
      setError('Failed to load survey data: ' + err.message);
    }
    setLoading(false);
  }

  // Messages from the Responses table go to the page banners.
  function notify(message, type = 'success') {
    if (type === 'error') { setSuccess(''); setError(message); }
    else { setError(''); setSuccess(message); }
  }

  async function loadRetiredQuestions() {
    const res = await apiFetch(`/api/surveys/templates/${encodeURIComponent(id)}/retired-questions`);
    const data = await res.json().catch(() => ({}));
    setRetiredQuestions(res.ok && Array.isArray(data.questions) ? data.questions : []);
  }

  async function handleDeleteRetiredQuestion(question) {
    const answers = `${question.answerCount} response${question.answerCount === 1 ? '' : 's'}`;
    const goals = question.linkedGoalCount > 0
      ? `\n\n${question.linkedGoalCount} goal${question.linkedGoalCount === 1 ? ' uses' : 's use'} this question as a data source and will be unlinked.`
      : '';
    const confirmed = confirm(
      `Permanently delete "${question.label}"?\n\n` +
      `This deletes ${answers} to it. Reports will no longer include this question.${goals}\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingRetiredId(question.rootFieldId);
    try {
      const res = await apiFetch(
        `/api/surveys/templates/${encodeURIComponent(id)}/retired-questions?rootFieldId=${question.rootFieldId}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `server responded ${res.status}`);
      notify(`Deleted "${question.label}" and ${data.deletedAnswerCount} response${data.deletedAnswerCount === 1 ? '' : 's'}.`);
      await loadRetiredQuestions();
    } catch (err) {
      notify('Could not delete the question: ' + err.message, 'error');
    } finally {
      setDeletingRetiredId(null);
    }
  }

  async function handleDeleteDistribution(distributionId) {
    if (!confirm('Delete this distribution? This cannot be undone.')) return;
    setError('');
    try {
      const res = await apiFetch(`/api/surveys/distributions?distributionId=${distributionId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete distribution');
      setDistributions(current => current.filter(distribution => distribution.distribution_id !== distributionId));
      setSuccess('Distribution deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete distribution');
    }
  }

  // Generate a QR code for this survey using the same API as Survey Distribution.
  async function handleGenerateQrCode() {
    setQrGenerating(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/qr-codes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrType: 'survey_template',
          targetId: id,
          description: template?.title ? `${template.title} QR code` : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate QR code');
      setNewQrCode(data.qrCode);
      setSelectedQrFormat(null);
      setSuccess('QR code generated successfully.');

      const qrRes = await apiFetch('/api/qr-codes?scope=survey');
      const qrData = await qrRes.json();
      const allQr = Array.isArray(qrData) ? qrData : qrData.qrCodes || [];
      setQrCodes(allQr.filter(q => String(q.target_id || q.targetId) === String(id)));
    } catch (err) {
      setError(err.message || 'Failed to generate QR code');
    } finally {
      setQrGenerating(false);
    }
  }

  async function handleDeleteQrCode(qrCodeKey) {
    if (!confirm('Delete this QR code and its scan history? This cannot be undone.')) return;
    setError('');
    try {
      const res = await apiFetch(`/api/qr-codes?qrCodeKey=${encodeURIComponent(qrCodeKey)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete QR code');
      setQrCodes(current => current.filter(qr => (qr.qr_code_key || qr.qrCodeKey) !== qrCodeKey));
      setSuccess('QR code deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete QR code');
    }
  }

  function getSurveyQrUrl(qr, key) {
    const url = new URL('/survey', window.location.origin);
    url.searchParams.set('qr', key);
    url.searchParams.set('template', String(qr.target_id || qr.targetId || id));
    return url.toString();
  }

  if (!hydrated || loading) {
    return <PageLayout title="Survey Details"><p style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>Loading...</p></PageLayout>;
  }

  if (!template) {
    return (
      <PageLayout title="Survey Details">
        <p style={{ textAlign: 'center', padding: '3rem', color: '#DC2626' }}>{error || 'Survey not found'}</p>
        <div style={{ textAlign: 'center' }}>
          <button className="btn-outline" onClick={() => router.push('/manage-surveys')}>Back to Surveys</button>
        </div>
      </PageLayout>
    );
  }

  const totalDistributions = distributions.length;
  const totalQrScans = qrCodes.reduce((sum, q) => sum + (q.scan_count || q.scanCount || 0), 0);


  return (
    <PageLayout title="Survey Details">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#111827', margin: 0 }}>{template.title}</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.35rem' }}>
            {statusPill(template.published)}
            {template.initiative_name && <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>{template.initiative_name}</span>}
            <span style={{ fontSize: '0.82rem', color: '#9CA3AF' }}>Created {formatDate(template.createdAt)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-end' }}>
          <button className="btn-outline" onClick={() => router.push('/manage-surveys')} style={{ fontSize: '0.85rem' }}>
            &larr; Back to Surveys
          </button>
          <button className="btn-primary" onClick={() => router.push(getFormBuilderEditPath(id))} style={{ fontSize: '0.85rem' }}>
            Edit Survey
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Questions</div>
          <div className="stat-value">{template.questions?.length || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Responses</div>
          <div className="stat-value">{totalResponses}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Email Distributions</div>
          <div className="stat-value">{totalDistributions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">QR Scans</div>
          <div className="stat-value">{totalQrScans}</div>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {success}
        </div>
      )}

      {/* Tabs */}
      <TabBar
        ariaLabel="Survey sections"
        tabs={[
          { key: 'questions', label: `Questions (${template.questions?.length || 0})` },
          { key: 'responses', label: `Responses (${totalResponses})` },
          { key: 'distribution', label: `Distribution (${distributions.length + qrCodes.length})` },
          { key: 'preview', label: 'Preview' }

        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Questions Tab ── */}
      {activeTab === 'questions' && (
        <>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Questions ({template.questions?.length || 0})</h3>
            </div>
            {(template.questions || []).length === 0 ? (
              <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>No questions in this survey.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {template.questions.map((q, i) => {
                  const text = q.text || q;
                  const qType = text.type || 'text';
                  const isRequired = text.required !== false;
                  return (
                    <div key={q.id || i} style={{
                      display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                      padding: '0.65rem 0.85rem', border: '1px solid #F3F4F6', borderRadius: '8px',
                      backgroundColor: '#FAFAFA',
                    }}>
                      <span style={{ color: '#E67E22', fontWeight: 700, fontSize: '0.85rem', minWidth: '24px' }}>{i + 1}.</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>
                          {text.question || text.label || 'Untitled'}
                          {isRequired && <span style={{ color: '#DC2626', marginLeft: '0.25rem' }}>*</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.75rem', padding: '1px 6px', borderRadius: '9999px', backgroundColor: '#FFF7ED', color: '#E67E22', border: '1px solid #FED7AA', fontWeight: 600 }}>
                            {QUESTION_TYPE_LABELS[qType] || qType}
                          </span>
                          {isRequired && <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>required</span>}
                          {text.scope === 'initiative_specific' && <span style={{ fontSize: '0.75rem', padding: '1px 6px', borderRadius: '9999px', backgroundColor: '#EFF6FF', color: '#2563EB' }}>initiative</span>}
                        </div>
                        {text.options && text.options.length > 0 && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#6B7280' }}>
                            Options: {text.options.join(', ')}
                          </div>
                        )}
                        {text.help_text && (
                          <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: '#9CA3AF', fontStyle: 'italic' }}>{text.help_text}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {retiredQuestions.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Retired questions ({retiredQuestions.length})</h3>
              </div>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#6B7280' }}>
                These were removed from the survey. Their responses are kept and still appear in reports until you delete them.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {retiredQuestions.map(question => (
                  <div key={question.rootFieldId} style={{
                    display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap',
                    padding: '0.65rem 0.85rem', border: '1px solid #F3F4F6', borderRadius: '8px',
                    backgroundColor: '#FAFAFA',
                  }}>
                    <div style={{ flex: 1, minWidth: '12rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#6B7280' }}>{question.label}</div>
                      <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: '#9CA3AF' }}>
                        {QUESTION_TYPE_LABELS[question.type] || question.type}
                        {' · '}{question.answerCount} response{question.answerCount === 1 ? '' : 's'} kept
                        {question.sharedWithOtherForms && ' · also used on another survey'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ fontSize: '0.85rem', color: '#DC2626', borderColor: '#FECACA' }}
                      onClick={() => handleDeleteRetiredQuestion(question)}
                      disabled={deletingRetiredId === question.rootFieldId}
                    >
                      {deletingRetiredId === question.rootFieldId ? 'Deleting…' : 'Delete permanently'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Preview Tab: read-only view of the survey as respondents see it ── */}
      {activeTab === 'preview' && <SurveyPreview template={template} />}

      {/* ── Distribution Tab: email distributions and QR codes ── */}
      {activeTab === 'distribution' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">Email Distributions ({distributions.length})</h3>
            </div>
            {distributions.length === 0 ? (
              <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>
                No email distributions yet. <span style={{ color: '#E67E22', cursor: 'pointer' }} onClick={() => router.push('/survey-distribution/email/new')}>Create one</span>
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Dates</th>
                      <th>Responses</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributions.map(d => (
                      <tr key={d.distribution_id}>
                        <td style={{ fontWeight: 600, color: '#111827' }}>{d.title}</td>
                        <td>
                          {d.status === 'active' && <span className="pill pill-green">Active</span>}
                          {d.status === 'pending' && <span className="pill pill-yellow">Pending</span>}
                          {d.status === 'closed' && <span className="pill pill-gray">Closed</span>}
                        </td>
                        <td style={{ color: '#6B7280', fontSize: '0.85rem' }}>{d.start_date} to {d.end_date}</td>
                        <td style={{ fontWeight: 600 }}>{d.response_count || 0}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleDeleteDistribution(d.distribution_id)}
                            style={{ background: 'none', border: 'none', padding: 0, color: '#DC2626', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* QR codes */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">QR Codes ({qrCodes.length})</h3>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <button className="btn-outline" onClick={handleGenerateQrCode} disabled={qrGenerating}>
                {qrGenerating ? 'Generating...' : 'Generate New QR Code'}
              </button>
            </div>

            {newQrCode && (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', padding: '12px', marginBottom: '1rem', border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={newQrCode.dataUrl} alt="New QR code" style={{ width: 120, height: 120 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Survey Link:</div>
                  <div style={{ fontSize: '12px', color: '#6B7280', wordBreak: 'break-all', marginBottom: '8px' }}>{newQrCode.targetUrl}</div>
                  <QrFormatButtons
                    selectedFormat={selectedQrFormat}
                    onSelect={(format) => {
                      setSelectedQrFormat(format);
                      window.open(`/api/qr-codes/download?qrCodeKey=${newQrCode.qrCodeKey}&format=${format}&download=true`, '_blank');
                    }}
                  />
                </div>
              </div>
            )}

            {qrCodes.length === 0 ? (
              <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>
                No QR codes generated for this survey yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>QR Key</th>
                      <th>Scans</th>
                      <th>Conversions</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qrCodes.map(qr => {
                      const key = qr.qr_code_key || qr.qrCodeKey || '';
                      const scans = qr.stats?.totalScans ?? qr.scan_count ?? qr.scanCount ?? 0;
                      const conversions = qr.stats?.conversions ?? qr.conversion_count ?? qr.conversionCount ?? 0;
                      const isActive = qr.is_active !== 0 && qr.isActive !== false;
                      return (
                        <tr key={key}>
                          <td style={{ fontWeight: 600, color: '#111827' }}>{qr.description || 'QR Code'}</td>
                          <td style={{ color: '#6B7280', fontSize: '0.82rem', fontFamily: 'monospace' }}>{key.slice(0, 12)}...</td>
                          <td style={{ fontWeight: 600 }}>{scans}</td>
                          <td style={{ fontWeight: 600 }}>{conversions}</td>
                          <td>
                            {isActive
                              ? <span className="pill pill-green">Active</span>
                              : <span className="pill pill-gray">Inactive</span>}
                          </td>
                          <td style={{ color: '#6B7280', fontSize: '0.85rem' }}>{formatDate(qr.created_at || qr.createdAt)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="row-icon-btn"
                                aria-label="Copy URL"
                                title="Copy URL"
                                onClick={() => {
                                  const url = getSurveyQrUrl(qr, key);
                                  navigator.clipboard.writeText(url);
                                  setSuccess('QR URL copied to clipboard!');
                                  setTimeout(() => setSuccess(''), 2000);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="row-icon-btn"
                                aria-label="Download"
                                title="Download"
                                onClick={() => window.open(`/api/qr-codes/download?qrCodeKey=${key}&format=png&size=400&download=true`, '_blank')}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="row-icon-btn row-icon-btn-remove"
                                aria-label="Delete"
                                title="Delete"
                                onClick={() => handleDeleteQrCode(key)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                </svg>
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
        </>
      )}

      {/* ── Responses Tab: table of all submissions; tick rows to delete them ── */}
      {activeTab === 'responses' && (
        <SurveyResponsesView
          templates={[template]}
          onDeleted={(ids) => setTotalResponses(prev => Math.max(0, prev - ids.length))}
          onNotify={notify}
        />
      )}
    </PageLayout>
  );
}
