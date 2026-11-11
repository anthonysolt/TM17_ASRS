'use client';

import PageLayout from '@/components/PageLayout';
import ReasonModal from '@/components/ReasonModal';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import TabBar from '@/components/TabBar';
import SurveyList from '@/components/SurveyList';
import ReportList from '@/components/ReportList';
import SurveyResponsesView from '@/components/SurveyResponsesView';
import GoalsTable from '@/components/GoalsTable';
import { getScoreColor } from '@/lib/score-utils';
import Link from 'next/link';
import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';
import { INITIATIVE_STATUS_OPTIONS, getInitiativeStatusOption, normalizeInitiativeStatus } from '@/lib/initiative-status';

export default function InitiativeManagePage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, hydrated } = useAuthStore();

  const [initiative, setInitiative] = useState(null);
  const [members, setMembers] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [anonymousSubmissions, setAnonymousSubmissions] = useState(0);
  const [surveyTemplates, setSurveyTemplates] = useState([]);
  // Response counts for this initiative's surveys ({ counts: { [templateId]: n }, total });
  // the responses themselves load a page at a time in the Submissions tab.
  const [responseCounts, setResponseCounts] = useState({ counts: {}, total: 0 });
  const [goals, setGoals] = useState([]);
  const [overallScore, setOverallScore] = useState(0);
  const [goalQuestions, setGoalQuestions] = useState([]);
  const [goalsMessage, setGoalsMessage] = useState('');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Add member form
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('participant');
  const [addingMember, setAddingMember] = useState(false);

  // Selected tab; ?tab=<key> opens a specific one (?tab=edit is the old name for details).
  const TAB_KEYS = ['details', 'members', 'goals', 'surveys', 'reports', 'submissions'];
  const requestedTab = searchParams.get('tab') === 'edit' ? 'details' : searchParams.get('tab');
  const initialTab = TAB_KEYS.includes(requestedTab) ? requestedTab : 'details';
  const [activeTab, setActiveTab] = useState(initialTab);

  // ── Edit form state ──────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [deletingInitiative, setDeletingInitiative] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Runs only after ConfirmDeleteModal's warning and type-the-name check.
  async function handleDeleteInitiative() {
    if (!initiative || deletingInitiative) return;
    setDeletingInitiative(true);
    try {
      const response = await apiFetch(`/api/initiatives/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete initiative');
      }
      router.push(`/initiative-creation?deleted=${encodeURIComponent(initiative.name)}`);
    } catch (error) {
      alert(error.message || 'Connection error. Please try again.');
      setDeletingInitiative(false);
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'admin' && user.user_type !== 'staff') { router.push('/dashboard'); return; }
    loadData();
  }, [hydrated, user, id]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [initRes, membersRes] = await Promise.all([
        apiFetch(`/api/initiatives/${id}`),
        apiFetch(`/api/initiatives/${id}/members`),
        loadSurveysAndReports(),
      ]);
      const initData = await initRes.json();
      const membersData = await membersRes.json();

      if (initRes.ok && initData.initiative) {
        const init = initData.initiative;
        setInitiative(init);

        // Populate edit form
        setEditName(init.name || '');
        setEditDescription(init.description || '');
        setEditStatus(normalizeInitiativeStatus(init.settings?.status));
        setEditIsPublic(!!init.settings?.isPublic);
      } else {
        setError('Initiative not found');
      }

      if (membersRes.ok && membersData.success) {
        setMembers(membersData.members || []);
        setParticipants(membersData.participants || []);
        setTotalSubmissions(membersData.totalSubmissions || 0);
        setAnonymousSubmissions(membersData.anonymousSubmissions || 0);
      }

    } catch (err) {
      setError('Failed to load initiative data: ' + err.message);
    }
    setLoading(false);
  }

  // GET a JSON endpoint for one of the tabs. Resolves to { data } or { error }
  // (the server's message when it sent one) and never throws.
  async function fetchTabData(url, what) {
    try {
      const res = await apiFetch(url);
      const body = await res.json().catch(() => null);
      if (!res.ok) return { error: `Could not load ${what}: ${body?.error || `server responded ${res.status}`}` };
      return { data: body };
    } catch (err) {
      return { error: `Could not load ${what}: ${err.message || 'connection error'}` };
    }
  }

  // On a failed load the tab keeps what it showed before and the page banner
  // says what went wrong, instead of the tab silently going empty.

  // Goals tab data; resolves to the fresh goal list (GoalsTable uses it after a
  // save), or undefined when the reload failed.
  async function loadGoals() {
    const { data, error: loadError } = await fetchTabData(`/api/goals?initiativeId=${encodeURIComponent(id)}`, 'goals');
    if (loadError) { notify(loadError, 'error'); return undefined; }
    const list = Array.isArray(data?.goals) ? data.goals : [];
    setGoals(list);
    setOverallScore(data?.overallScore || 0);
    return list;
  }

  // Goals, surveys and reports tabs.
  async function loadSurveysAndReports() {
    const [templatesResult, surveysResult, questionsResult] = await Promise.all([
      fetchTabData('/api/surveys/templates', 'surveys'),
      fetchTabData(`/api/surveys/counts?initiativeId=${encodeURIComponent(id)}`, 'survey response counts'),
      fetchTabData(`/api/goals/questions?initiativeId=${encodeURIComponent(id)}`, 'goal questions'),
      loadGoals(),
      loadReports(),
    ]);
    const failures = [templatesResult, surveysResult, questionsResult].filter(r => r.error);
    if (failures.length) notify(failures.map(r => r.error).join(' '), 'error');
    if (!questionsResult.error) {
      setGoalQuestions(Array.isArray(questionsResult.data?.questions) ? questionsResult.data.questions : []);
    }
    if (!templatesResult.error) {
      const templates = Array.isArray(templatesResult.data) ? templatesResult.data : [];
      setSurveyTemplates(templates.filter(t => String(t.initiative_id) === String(id)));
    }
    if (!surveysResult.error) {
      setResponseCounts({ counts: surveysResult.data?.counts || {}, total: Number(surveysResult.data?.total) || 0 });
    }
  }

  // Reports tab: active reports are every report that has not been archived.
  async function loadReports() {
    const { data, error: loadError } = await fetchTabData(`/api/reports?initiativeId=${encodeURIComponent(id)}`, 'reports');
    if (loadError) { notify(loadError, 'error'); return; }
    const allReports = Array.isArray(data?.reports) ? data.reports : [];
    setReports(allReports.filter(r => (r.status || '').toLowerCase() !== 'archived'));
  }

  // Survey responses that belong to this initiative's surveys (Submissions tab).
  async function reloadResponseCounts() {
    const result = await fetchTabData(`/api/surveys/counts?initiativeId=${encodeURIComponent(id)}`, 'survey response counts');
    if (result.error) { notify(result.error, 'error'); return; }
    setResponseCounts({ counts: result.data?.counts || {}, total: Number(result.data?.total) || 0 });
  }

  // Messages from the report and survey lists go to the page banners.
  function notify(message, type = 'success') {
    if (type === 'error') { setSuccessMessage(''); setError(message); }
    else { setError(''); setSuccessMessage(message); }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAddingMember(true);
    setError('');
    setSuccessMessage('');

    try {
      const res = await apiFetch(`/api/initiatives/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), role: addRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add member');
      } else {
        setSuccessMessage(`Added ${data.member.first_name} ${data.member.last_name} as ${addRole}`);
        setAddEmail('');
        loadData();
      }
    } catch (err) {
      setError('Failed to add member: ' + err.message);
    }
    setAddingMember(false);
  }

  async function handleRemoveMember(memberId, name) {
    if (!confirm(`Remove ${name} from this initiative?`)) return;
    setError('');
    try {
      const res = await apiFetch(`/api/initiatives/${id}/members?memberId=${memberId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSuccessMessage(`${name} removed from initiative`);
        loadData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove member');
      }
    } catch (err) {
      setError('Failed to remove member: ' + err.message);
    }
  }

  // ── Edit form handlers ──────────────────────────────
  function handleEditSubmit(e) {
    e.preventDefault();
    setEditMessage('');
    setEditSubmitting(true);

    if (!editName.trim()) {
      setEditMessage('Please enter an initiative name.');
      setEditSubmitting(false);
      return;
    }
    // questions is omitted so the API keeps the initiative's existing questions.
    setPendingAction({
      payload: {
        name: editName.trim(),
        description: editDescription.trim(),
        settings: { status: editStatus, isPublic: editIsPublic },
      },
    });
    setShowReasonModal(true);
    setEditSubmitting(false);
  }

  async function handleReasonSubmit({ reasonType, reasonText }) {
    setShowReasonModal(false);
    if (!pendingAction) return;
    setEditSubmitting(true);
    try {
      const body = { ...pendingAction.payload, reasonType, reasonText };
      const response = await apiFetch(`/api/initiatives/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (response.ok) {
        setEditMessage('Initiative updated successfully!');
        setSuccessMessage('Initiative updated successfully!');
        loadData();
      } else {
        setEditMessage(data.error || 'Failed to update initiative');
      }
    } catch (error) {
      setEditMessage('Connection error. Please try again.');
      console.error('Error saving initiative:', error);
    } finally {
      setEditSubmitting(false);
      setPendingAction(null);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '\u2014';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function rolePill(role) {
    if (role === 'admin') return <span className="pill pill-red">Admin</span>;
    if (role === 'lead') return <span className="pill pill-yellow">Lead</span>;
    if (role === 'staff') return <span className="pill pill-green">Staff</span>;
    return <span className="pill pill-gray">Participant</span>;
  }

  if (!hydrated || loading) {
    return <PageLayout title="Initiative Management"><p style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>Loading...</p></PageLayout>;
  }

  if (!initiative) {
    return (
      <PageLayout title="Initiative Management">
        <p style={{ textAlign: 'center', padding: '3rem', color: '#DC2626' }}>{error || 'Initiative not found'}</p>
        <div style={{ textAlign: 'center' }}>
          <button className="btn-outline" onClick={() => router.push('/initiative-creation')}>Back to Initiatives</button>
        </div>
      </PageLayout>
    );
  }

  const inputSt = {
    padding: '0.55rem 0.75rem',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    fontSize: '0.9rem',
    outline: 'none',
    backgroundColor: 'white',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    color: '#111827',
    marginBottom: '0.4rem',
    fontWeight: '600',
    fontSize: '0.9rem',
  };

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
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
  };

  const focusHandlers = {
    onFocus: (e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; },
    onBlur: (e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; },
  };

  return (
    <PageLayout title="Initiative Management">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#111827', margin: 0 }}>{initiative.name}</h2>
          {initiative.description && (
            <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>{initiative.description}</p>
          )}
        </div>
        <button className="btn-outline" onClick={() => router.push('/initiative-creation')} style={{ alignSelf: 'flex-end', fontSize: '0.85rem' }}>
          &larr; Back to Initiatives
        </button>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Members</div>
          <div className="stat-value">{members.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Submissions</div>
          <div className="stat-value">{totalSubmissions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Known Participants</div>
          <div className="stat-value">{participants.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ fontSize: '1rem' }}>{getInitiativeStatusOption(initiative.settings?.status).label}</div>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {successMessage}
        </div>
      )}

      {/* Tabs */}
      <TabBar
        ariaLabel="Initiative sections"
        tabs={[
          { key: 'details', label: 'Details' },
          { key: 'members', label: `Members (${members.length})` },
          { key: 'goals', label: `Goals (${goals.length})` },
          { key: 'surveys', label: `Surveys (${surveyTemplates.length})` },
          { key: 'reports', label: `Reports (${reports.length})` },
          { key: 'submissions', label: `Submissions (${responseCounts.total})` },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Details Tab ── */}
      {activeTab === 'details' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Initiative Details</h3>
          </div>

          {editMessage && (
            <div style={{
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              backgroundColor: editMessage.includes('successfully') ? '#e8f5e9' : '#ffebee',
              border: `1px solid ${editMessage.includes('successfully') ? '#c8e6c9' : '#ffcdd2'}`,
              borderRadius: '8px',
              color: editMessage.includes('successfully') ? '#2e7d32' : '#c62828',
              fontSize: '0.9rem',
            }}>
              {editMessage}
            </div>
          )}

          <form onSubmit={handleEditSubmit}>
            {/* Name */}
            <div style={{ marginBottom: '1rem' }}>
              <div>
                <label style={labelStyle}>
                  Initiative Name <span style={{ color: '#c62828' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g., E-Gaming and Careers"
                  required
                  style={inputStyle}
                  {...focusHandlers}
                />
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Describe the initiative's purpose and goals..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                {...focusHandlers}
              />
            </div>

            {/* Settings row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  {...focusHandlers}
                >
                  {INITIATIVE_STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '8px',
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  width: '100%',
                  transition: 'background-color 0.15s ease',
                }}>
                  <input
                    type="checkbox"
                    checked={editIsPublic}
                    onChange={(e) => setEditIsPublic(e.target.checked)}
                    style={{ marginRight: '0.6rem', cursor: 'pointer', accentColor: '#E67E22' }}
                  />
                  <span style={{ fontSize: '0.9rem', color: '#111827' }}>Publicly visible</span>
                </label>
              </div>
            </div>

            {/* Form actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={deletingInitiative}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #FCA5A5',
                  backgroundColor: '#fff',
                  color: '#DC2626',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: deletingInitiative ? 'not-allowed' : 'pointer',
                }}
              >
                Delete
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="btn-primary"
                style={{ opacity: editSubmitting ? 0.6 : 1, cursor: editSubmitting ? 'not-allowed' : 'pointer' }}
              >
                {editSubmitting ? 'Saving...' : 'Update Initiative'}
              </button>
            </div>
          </form>

          <ConfirmDeleteModal
            open={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={handleDeleteInitiative}
            itemName={initiative.name}
            deleting={deletingInitiative}
            title="Delete this initiative?"
            warning="Deleting this initiative permanently removes it and all associated data, including its survey submissions and reports."
          />

          <ReasonModal
            open={showReasonModal}
            onClose={() => setShowReasonModal(false)}
            onSubmit={handleReasonSubmit}
            title="Why are you editing this initiative?"
          />
        </div>
      )}

      {/* ── Members Tab ── */}
      {activeTab === 'members' && (
        <>
          {/* Add Member */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">Add Member</h3>
            </div>
            <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 250px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Email</label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  style={{ ...inputSt, width: '100%' }}
                  required
                />
              </div>
              <div style={{ flex: '0 1 160px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Role</label>
                <select value={addRole} onChange={(e) => setAddRole(e.target.value)} style={{ ...inputSt, width: '100%', cursor: 'pointer' }}>
                  <option value="participant">Participant</option>
                  <option value="staff">Staff</option>
                  <option value="lead">Lead</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" className="btn-primary" disabled={addingMember} style={{ opacity: addingMember ? 0.6 : 1, height: 'fit-content' }}>
                {addingMember ? 'Adding...' : 'Add Member'}
              </button>
            </form>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Initiative Members</h3>
            </div>
            {members.length === 0 ? (
              <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>
                No members yet. Add members using the form above.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Role</th>
                      <th>User Type</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.member_id}>
                        <td style={{ fontWeight: 600, color: '#111827' }}>{m.first_name} {m.last_name}</td>
                        <td style={{ color: '#6B7280' }}>{m.email}</td>
                        <td style={{ color: '#6B7280' }}>{m.phone_number || '\u2014'}</td>
                        <td>{rolePill(m.role)}</td>
                        <td style={{ color: '#6B7280', textTransform: 'capitalize' }}>{m.user_type || '\u2014'}</td>
                        <td style={{ color: '#6B7280' }}>{formatDate(m.joined_at)}</td>
                        <td>
                          <button
                            onClick={() => handleRemoveMember(m.member_id, `${m.first_name} ${m.last_name}`)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#DC2626', padding: 0 }}
                          >
                            Remove
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

      {/* ── Surveys Tab (same survey entries as the Surveys page) ── */}
      {activeTab === 'surveys' && (
        <SurveyList
          templates={surveyTemplates.map(t => ({ ...t, initiative_name: initiative.name }))}
          responseCounts={responseCounts.counts}
          onChanged={loadSurveysAndReports}
          onNotify={notify}
          emptyState={(
            <div className="card">
              <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem', margin: 0 }}>
                No surveys for this initiative yet.{' '}
                <Link href="/form-creation" style={{ color: '#E67E22' }}>Create one</Link>
              </p>
            </div>
          )}
        />
      )}

      {/* ── Goals Tab (same goal list and Edit drop-downs as Goals & Scoring) ── */}
      {activeTab === 'goals' && (
        <>
          {goalsMessage && (
            <div style={{
              padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '8px', fontSize: '0.9rem',
              backgroundColor: /success|deleted/i.test(goalsMessage) ? '#d1fae5' : '#FEF2F2',
              border: `1px solid ${/success|deleted/i.test(goalsMessage) ? '#a7f3d0' : '#FECACA'}`,
              color: /success|deleted/i.test(goalsMessage) ? '#065f46' : '#DC2626',
            }}>
              {goalsMessage}
            </div>
          )}
          <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Overall Score</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: goals.length ? getScoreColor(overallScore) : '#9CA3AF' }}>
                {goals.length ? `${overallScore}%` : '\u2014'}
              </div>
            </div>
            <Link href={`/goals?initiative=${encodeURIComponent(id)}`} className="btn-primary">
              Manage Goals
            </Link>
          </div>
          {goals.length === 0 ? (
            <div className="card">
              <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem', margin: 0 }}>
                No goals for this initiative yet.{' '}
                <Link href={`/goals?initiative=${encodeURIComponent(id)}`} style={{ color: '#E67E22' }}>Add one</Link>
              </p>
            </div>
          ) : (
            <GoalsTable
              goals={goals}
              editable
              questions={goalQuestions}
              onGoalsChanged={loadGoals}
              onMessage={setGoalsMessage}
            />
          )}
        </>
      )}

      {/* ── Reports Tab (same report entries as the Reports page; active = not archived) ── */}
      {activeTab === 'reports' && (
        <ReportList
          reports={reports.map(r => ({ ...r, initiative_name: r.initiative_name || initiative.name }))}
          onChanged={loadReports}
          onNotify={notify}
          emptyState={(
            <div className="card">
              <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem', margin: 0 }}>
                No active reports for this initiative.{' '}
                <Link href="/report-creation" style={{ color: '#E67E22' }}>Create one</Link>
              </p>
            </div>
          )}
        />
      )}

      {/* ── Submissions Tab (same responses table as Surveys > Survey Responses) ── */}
      {activeTab === 'submissions' && (
        <SurveyResponsesView
          templates={surveyTemplates}
          initiativeId={id}
          recentPageSize={100}
          onDeleted={reloadResponseCounts}
          onNotify={notify}
        />
      )}
    </PageLayout>
  );
}
