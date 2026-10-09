'use client';

import PageLayout from '@/components/PageLayout';
import ReasonModal from '@/components/ReasonModal';
import { useState, useEffect, use, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';

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
  const [submissions, setSubmissions] = useState([]);
  const [expandedSubmission, setExpandedSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Add member form
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('participant');
  const [addingMember, setAddingMember] = useState(false);

  // View toggle — default to 'edit' tab if ?tab=edit in URL
  const initialTab = searchParams.get('tab') === 'edit' ? 'edit' : 'members';
  const [activeTab, setActiveTab] = useState(initialTab);

  // ── Edit form state ──────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('Active');
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [editAddQuestions, setEditAddQuestions] = useState(false);
  const [editQuestions, setEditQuestions] = useState(['']);
  const [editMessage, setEditMessage] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'admin' && user.user_type !== 'staff') { router.push('/'); return; }
    loadData();
  }, [hydrated, user, id]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [initRes, membersRes] = await Promise.all([
        apiFetch(`/api/initiatives/${id}`),
        apiFetch(`/api/initiatives/${id}/members`),
      ]);
      const initData = await initRes.json();
      const membersData = await membersRes.json();

      if (initRes.ok && initData.initiative) {
        const init = initData.initiative;
        setInitiative(init);

        // Populate edit form
        setEditName(init.name || '');
        setEditDescription(init.description || '');
        setEditStatus(init.settings?.status || 'Active');
        setEditIsPublic(!!init.settings?.isPublic);
        if (init.questions && init.questions.length > 0) {
          setEditAddQuestions(true);
          setEditQuestions(init.questions);
        }
      } else {
        setError('Initiative not found');
      }

      if (membersRes.ok && membersData.success) {
        setMembers(membersData.members || []);
        setParticipants(membersData.participants || []);
        setSubmissions(membersData.submissions || []);
        setTotalSubmissions(membersData.totalSubmissions || 0);
        setAnonymousSubmissions(membersData.anonymousSubmissions || 0);
      }

    } catch (err) {
      setError('Failed to load initiative data: ' + err.message);
    }
    setLoading(false);
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
  function handleQuestionChange(index, value) {
    const updated = [...editQuestions];
    updated[index] = value;
    setEditQuestions(updated);
  }

  function handleEditSubmit(e) {
    e.preventDefault();
    setEditMessage('');
    setEditSubmitting(true);

    if (!editName.trim()) {
      setEditMessage('Please enter an initiative name.');
      setEditSubmitting(false);
      return;
    }
    const cleanedQuestions = editAddQuestions
      ? editQuestions.map(q => q.trim()).filter(Boolean)
      : [];

    setPendingAction({
      payload: {
        name: editName.trim(),
        description: editDescription.trim(),
        questions: cleanedQuestions,
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
          <button className="btn-outline" onClick={() => router.push('/initiative-creation')} style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>
            &larr; Back to Initiatives
          </button>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#111827', margin: 0 }}>{initiative.name}</h2>
          {initiative.description && (
            <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>{initiative.description}</p>
          )}
        </div>
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
          <div className="stat-value" style={{ fontSize: '1rem' }}>{initiative.settings?.status || 'Active'}</div>
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

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setActiveTab('edit')} style={tabStyle(activeTab === 'edit')}>
          Edit Details
        </button>
        <button onClick={() => setActiveTab('members')} style={tabStyle(activeTab === 'members')}>
          Members ({members.length})
        </button>
        <button onClick={() => setActiveTab('participants')} style={tabStyle(activeTab === 'participants')}>
          Submissions ({totalSubmissions})
        </button>
      </div>

      {/* ── Edit Details Tab ── */}
      {activeTab === 'edit' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Edit Initiative Details</h3>
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
                  <option value="Active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
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

            {/* Questions */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editAddQuestions ? '0.75rem' : 0 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Questions</label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  color: '#6B7280',
                }}>
                  <input
                    type="checkbox"
                    checked={editAddQuestions}
                    onChange={(e) => setEditAddQuestions(e.target.checked)}
                    style={{ marginRight: '0.4rem', cursor: 'pointer', accentColor: '#E67E22' }}
                  />
                  Add questions
                </label>
              </div>

              {editAddQuestions && (
                <div>
                  {editQuestions.map((q, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        value={q}
                        onChange={(e) => handleQuestionChange(i, e.target.value)}
                        placeholder={`Question ${i + 1}`}
                        style={{ ...inputStyle, flex: 1 }}
                        {...focusHandlers}
                      />
                      {editQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEditQuestions(editQuestions.filter((_, idx) => idx !== i))}
                          className="btn-outline"
                          style={{ color: '#c62828', borderColor: '#FECACA' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditQuestions([...editQuestions, ''])}
                    className="btn-outline"
                    style={{ marginTop: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  >
                    + Add another question
                  </button>
                </div>
              )}
            </div>

            {/* Form actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
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

      {/* ── Submissions Tab ── */}
      {activeTab === 'participants' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Survey Submissions</h3>
            <span style={{ fontSize: '0.85rem', color: '#6B7280' }}>{totalSubmissions} total</span>
          </div>

          {submissions.length === 0 ? (
            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>
              No survey submissions yet for this initiative.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th>Submitted By</th>
                    <th>Date</th>
                    <th>Fields</th>
                    <th style={{ width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s, idx) => {
                    const isExpanded = expandedSubmission === s.submission_id;
                    const submitter = s.first_name
                      ? `${s.first_name} ${s.last_name}`
                      : 'Anonymous';
                    return (
                      <Fragment key={s.submission_id}>
                        <tr
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedSubmission(isExpanded ? null : s.submission_id)}
                        >
                          <td style={{ fontWeight: 500, color: '#9CA3AF' }}>{idx + 1}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{submitter}</div>
                            {s.email && <div style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>{s.email}</div>}
                          </td>
                          <td style={{ color: '#6B7280' }}>{formatDate(s.submitted_at)}</td>
                          <td style={{ color: '#6B7280' }}>{s.values.length} field{s.values.length !== 1 ? 's' : ''}</td>
                          <td style={{ textAlign: 'center', color: '#E67E22', fontWeight: 600, fontSize: '0.85rem' }}>
                            {isExpanded ? '\u25B2' : '\u25BC'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} style={{ padding: 0, border: 'none' }}>
                              <div style={{ padding: '0.75rem 1rem 1rem 2.5rem', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                {s.values.length === 0 ? (
                                  <p style={{ color: '#9CA3AF', fontSize: '0.85rem', margin: 0 }}>No field data recorded.</p>
                                ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
                                    {s.values.map((v, vIdx) => (
                                      <div key={vIdx} style={{ fontSize: '0.85rem' }}>
                                        <span style={{ color: '#6B7280', fontWeight: 600 }}>{v.field_label}:</span>{' '}
                                        <span style={{ color: '#111827' }}>{v.value || '\u2014'}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
