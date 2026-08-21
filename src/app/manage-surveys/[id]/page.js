'use client';

import PageLayout from '@/components/PageLayout';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';

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
  boolean: 'Yes / No', email: 'Email', url: 'URL / Link', yesno: 'Yes / No Grid',
};

export default function SurveyDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, hydrated } = useAuthStore();

  const [template, setTemplate] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editQuestions, setEditQuestions] = useState([]);
  const [saving, setSaving] = useState(false);

  // Expanded submission
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'admin' && user.user_type !== 'staff') { router.push('/'); return; }
    loadAll();
  }, [hydrated, user, id]);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [tplRes, subRes, qrRes, distRes] = await Promise.all([
        fetch(`/api/surveys/templates/${id}`),
        apiFetch('/api/surveys'),
        apiFetch('/api/qr-codes?scope=survey'),
        apiFetch('/api/surveys/distributions'),
      ]);

      const tplData = await tplRes.json();
      if (tplRes.ok && tplData.id) {
        setTemplate(tplData);
        setEditTitle(tplData.title || '');
        setEditDescription(tplData.description || '');
        setEditStatus(tplData.published ? 'active' : 'draft');
        setEditQuestions((tplData.questions || []).map(question => {
          const text = question.text || question;
          return {
            id: question.id,
            question: text.question || text.label || '',
            type: text.type || 'text',
            required: text.required !== false,
            options: [...(text.options || [])],
          };
        }));
      } else {
        setError('Survey template not found');
        setLoading(false);
        return;
      }

      const subData = await subRes.json();
      const allSurveys = subData.surveys || [];
      const filtered = allSurveys.filter(s => {
        const resp = s.responses || {};
        return String(resp.templateId) === String(id);
      });
      setSubmissions(filtered);

      const qrData = await qrRes.json();
      const allQr = Array.isArray(qrData) ? qrData : qrData.qrCodes || [];
      setQrCodes(allQr.filter(q => String(q.target_id || q.targetId) === String(id)));

      const distData = await distRes.json();
      const allDist = distData.distributions || [];
      setDistributions(allDist.filter(d => String(d.survey_template_id) === String(id)));
    } catch (err) {
      setError('Failed to load survey data: ' + err.message);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(`/api/surveys/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
          status: editStatus,
          questions: editQuestions,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Survey updated successfully!');
        loadAll();
      } else {
        setError(data.error || 'Failed to update survey');
      }
    } catch (err) {
      setError('Connection error: ' + err.message);
    }
    setSaving(false);
  }

  function updateEditQuestion(questionId, changes) {
    setEditQuestions(current => current.map(question =>
      question.id === questionId ? { ...question, ...changes } : question
    ));
  }

  function updateEditOption(questionId, optionIndex, value) {
    setEditQuestions(current => current.map(question => {
      if (question.id !== questionId) return question;
      const options = [...question.options];
      options[optionIndex] = value;
      return { ...question, options };
    }));
  }

  async function handleDeleteSubmission(surveyId) {
    if (!confirm('Delete this submission? This cannot be undone.')) return;
    try {
      const res = await apiFetch(`/api/surveys?surveyId=${surveyId}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccess('Submission deleted');
        setSubmissions(prev => prev.filter(s => s.id !== surveyId));
      }
    } catch { setError('Failed to delete submission'); }
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

  const tabStyle = (active) => ({
    padding: '0.5rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    borderRadius: '6px',
    backgroundColor: active ? 'var(--color-asrs-orange, #E67E22)' : '#F3F4F6',
    color: active ? '#fff' : '#6B7280',
  });

  const inputStyle = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: '#111827',
    backgroundColor: 'white',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    color: '#111827',
    marginBottom: '0.4rem',
    fontWeight: '600',
    fontSize: '0.9rem',
  };

  const totalResponses = submissions.length;
  const totalDistributions = distributions.length;
  const totalQrScans = qrCodes.reduce((sum, q) => sum + (q.scan_count || q.scanCount || 0), 0);

  return (
    <PageLayout title="Survey Details">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <button className="btn-outline" onClick={() => router.push('/manage-surveys')} style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            &larr; Back to Surveys
          </button>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#111827', margin: 0 }}>{template.title}</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.35rem' }}>
            {statusPill(template.published)}
            {template.initiative_name && <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>{template.initiative_name}</span>}
            <span style={{ fontSize: '0.82rem', color: '#9CA3AF' }}>Created {formatDate(template.createdAt)}</span>
          </div>
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
          <div className="stat-label">Distributions</div>
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
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTab('overview')} style={tabStyle(activeTab === 'overview')}>Overview</button>
        <button onClick={() => setActiveTab('edit')} style={tabStyle(activeTab === 'edit')}>Edit Survey</button>
        <button onClick={() => setActiveTab('submissions')} style={tabStyle(activeTab === 'submissions')}>Submissions ({totalResponses})</button>
        <button onClick={() => setActiveTab('qr')} style={tabStyle(activeTab === 'qr')}>QR Codes ({qrCodes.length})</button>
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <>
          {/* Questions list */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
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

          {/* Distributions */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Active Distributions ({distributions.length})</h3>
            </div>
            {distributions.length === 0 ? (
              <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>
                No distributions yet. <span style={{ color: '#E67E22', cursor: 'pointer' }} onClick={() => router.push('/survey-distribution')}>Create one</span>
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
        </>
      )}

      {/* ── Edit Tab ── */}
      {activeTab === 'edit' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Edit Survey Details</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Survey Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={inputStyle}
                placeholder="Survey title..."
              />
            </div>

            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '1rem' }}>
              <label style={labelStyle}>Questions and Answers</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {editQuestions.map((question, questionIndex) => {
                  const hasOptions = ['select', 'radio', 'choice', 'checkbox', 'multiselect'].includes(question.type);
                  return (
                    <div key={question.id} style={{ padding: '1rem', border: '1px solid #E5E7EB', borderRadius: '10px', backgroundColor: '#FAFAFA' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.6rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>
                          Question {questionIndex + 1} · {QUESTION_TYPE_LABELS[question.type] || question.type}
                        </span>
                        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.8rem', color: '#374151' }}>
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={event => updateEditQuestion(question.id, { required: event.target.checked })}
                            style={{ accentColor: '#E67E22' }}
                          />
                          Required
                        </label>
                      </div>
                      <input
                        type="text"
                        value={question.question}
                        onChange={event => updateEditQuestion(question.id, { question: event.target.value })}
                        style={inputStyle}
                        placeholder="Question text"
                      />
                      {hasOptions && (
                        <div style={{ marginTop: '0.75rem' }}>
                          <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600, marginBottom: '0.4rem' }}>Answer Options</div>
                          {question.options.map((option, optionIndex) => (
                            <div key={optionIndex} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                              <input
                                type="text"
                                value={option}
                                onChange={event => updateEditOption(question.id, optionIndex, event.target.value)}
                                style={inputStyle}
                                placeholder={`Option ${optionIndex + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => updateEditQuestion(question.id, { options: question.options.filter((_, index) => index !== optionIndex) })}
                                className="btn-outline"
                                style={{ color: '#DC2626', borderColor: '#FCA5A5', padding: '0.4rem 0.7rem' }}
                                aria-label={`Remove option ${optionIndex + 1}`}
                              >×</button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => updateEditQuestion(question.id, { options: [...question.options, `Option ${question.options.length + 1}`] })}
                            className="btn-outline"
                            style={{ fontSize: '0.8rem', padding: '0.35rem 0.7rem' }}
                          >+ Add Answer</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                rows={3}
                placeholder="Describe this survey..."
              />
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="active">Active (Published)</option>
                <option value="draft">Draft (Unpublished)</option>
              </select>
              <p style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.3rem' }}>
                {editStatus === 'active'
                  ? 'Survey is visible and accepting responses.'
                  : 'Survey is hidden and not accepting responses.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submissions Tab ── */}
      {activeTab === 'submissions' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Submissions ({totalResponses})</h3>
          </div>
          {submissions.length === 0 ? (
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>No submissions yet for this survey.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(s => {
                    const isExpanded = expandedId === s.id;
                    const answers = s.responses?.templateAnswers || {};
                    return (
                      <>
                        <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                          <td style={{ color: '#6B7280', fontSize: '0.85rem' }}>#{s.id}</td>
                          <td style={{ fontWeight: 600, color: '#111827' }}>{s.name}</td>
                          <td style={{ color: '#6B7280' }}>{s.email}</td>
                          <td style={{ color: '#6B7280', fontSize: '0.85rem' }}>{formatDate(s.submittedAt)}</td>
                          <td>
                            <span style={{ color: '#E67E22', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, marginRight: '0.75rem' }}>
                              {isExpanded ? 'Collapse' : 'View'}
                            </span>
                            <span
                              style={{ color: '#DC2626', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
                              onClick={(e) => { e.stopPropagation(); handleDeleteSubmission(s.id); }}
                            >
                              Delete
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${s.id}-detail`}>
                            <td colSpan={5} style={{ padding: '1rem', backgroundColor: '#FAFAFA' }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>Response Details</div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
                                {(template.questions || []).map((q, qi) => {
                                  const text = q.text || q;
                                  const val = answers[q.id];
                                  let displayVal = '\u2014';
                                  if (val !== undefined && val !== null && val !== '') {
                                    if (typeof val === 'object' && !Array.isArray(val)) {
                                      displayVal = Object.entries(val).map(([k, v]) => `${text.subQuestions?.[k] || `Item ${Number(k) + 1}`}: ${v}`).join(', ');
                                    } else if (Array.isArray(val)) {
                                      displayVal = val.join(', ');
                                    } else {
                                      displayVal = String(val);
                                    }
                                  }
                                  return (
                                    <div key={q.id || qi} style={{ padding: '0.5rem 0.65rem', border: '1px solid #E5E7EB', borderRadius: '6px', backgroundColor: '#fff' }}>
                                      <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.15rem' }}>Q{qi + 1}: {text.question || text.label || 'Question'}</div>
                                      <div style={{ fontSize: '0.88rem', color: '#111827', fontWeight: 500 }}>{displayVal}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── QR Codes Tab ── */}
      {activeTab === 'qr' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">QR Codes ({qrCodes.length})</h3>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <button className="btn-outline" onClick={() => router.push('/survey-distribution')}>
              Generate New QR Code
            </button>
          </div>

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
                          <span
                            style={{ color: '#E67E22', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, marginRight: '0.75rem' }}
                            onClick={() => {
                              const url = getSurveyQrUrl(qr, key);
                              navigator.clipboard.writeText(url);
                              setSuccess('QR URL copied to clipboard!');
                              setTimeout(() => setSuccess(''), 2000);
                            }}
                          >
                            Copy URL
                          </span>
                          <span
                            style={{ color: '#E67E22', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, marginRight: '0.75rem' }}
                            onClick={() => window.open(`/api/qr-codes/download?qrCodeKey=${key}&format=png&size=400&download=true`, '_blank')}
                          >
                            Download
                          </span>
                          <span
                            style={{ color: '#DC2626', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                            onClick={() => handleDeleteQrCode(key)}
                          >
                            Delete
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
