'use client';

import PageLayout from '@/components/PageLayout';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import ReasonModal from '@/components/ReasonModal';

const ATTRIBUTE_CATALOG = [
  'Grade',
  'School',
  'Interest Level',
  'Career Awareness',
  'Participation Count',
  'Session Rating',
  'Completion Status',
  'Safety Score',
  'Project Completion',
  'Team Size',
  'Robot Performance',
  'Attendance Rate',
  'Reading Level',
  'Award Type',
  'Improvement Score',
  'Semester',
  'Bags Collected',
  'Families Helped',
  'Volunteer Count',
  'Donation Value',
  'Event Date',
  'Event Type',
  'Personal Best',
  'Team Placement',
  'Practice Attendance',
  'Season',
  'Proposal Topic',
  'Score',
  'Award Level',
  'Reviewer Rating',
  'Submission Date',
  'Product Category',
  'Innovation Score',
  'Presentation Rating',
  'Feasibility Score',
];

function statusPill(status) {
  if (!status) return <span className="pill pill-gray">Draft</span>;
  const s = status.toLowerCase();
  if (s === 'active')    return <span className="pill pill-green">Active</span>;
  if (s === 'in review') return <span className="pill pill-yellow">In Review</span>;
  if (s === 'draft')     return <span className="pill pill-gray">Draft</span>;
  if (s === 'archived')  return <span className="pill pill-red">Archived</span>;
  return <span className="pill pill-gray">{status}</span>;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function InitiativeCreationPage() {
  return (
    <Suspense fallback={<PageLayout title="Initiatives"><div style={{ textAlign: 'center', padding: '3rem', color: '#6B7280' }}>Loading...</div></PageLayout>}>
      <InitiativeCreationContent />
    </Suspense>
  );
}

function InitiativeCreationContent() {

  const [userRole, setUserRole] = useState('public');

  // Check for logged-in user and set their role
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setUserRole(user.user_type || 'public');
    }
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  // ── Initiative list state ──────────────────────────────
  const [initiatives, setInitiatives] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const fetchInitiatives = async () => {
    try {
      setIsLoadingList(true);
      const [initResponse, catResponse] = await Promise.all([
        apiFetch('/api/initiatives'),
        apiFetch('/api/initiative-categories'),
      ]);
      const initData = await initResponse.json();
      const catData = await catResponse.json();
      if (initResponse.ok) {
        const catMap = {};
        if (catData.relationships) {
          for (const rel of catData.relationships) {
            catMap[rel.initiative_id] = rel.category_name;
          }
        }
        const enriched = (initData.initiatives || []).map(init => ({
          ...init,
          category: catMap[init.id] || init.settings?.category || null,
        }));
        setInitiatives(enriched);
      }
    } catch (error) {
      console.error('Error fetching initiatives:', error);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchInitiatives();
  }, []);

  // Load initiative for editing
  useEffect(() => {
    if (!editId) { setIsEditing(false); return; }
    setIsEditing(true);
    Promise.all([
      apiFetch(`/api/initiatives/${editId}`).then(r => r.json()),
      apiFetch(`/api/initiative-categories?initiative_id=${editId}`).then(r => r.json()),
    ])
      .then(([data, catData]) => {
        if (data.initiative) {
          const init = data.initiative;
          setName(init.name || '');
          setDescription(init.description || '');
          setSelectedAttributes(init.attributes || []);
          setStatus(init.settings?.status || 'Active');
          setIsPublic(!!init.settings?.isPublic);
          if (init.questions && init.questions.length > 0) {
            setAddQuestions(true);
            setQuestions(init.questions);
          }
          if (catData.relationships && catData.relationships.length > 0) {
            setCategoryId(String(catData.relationships[0].category_id));
          }
          setTimeout(() => document.getElementById('create-form')?.scrollIntoView({ behavior: 'smooth' }), 200);
        }
      })
      .catch(err => console.error('Error loading initiative:', err));
  }, [editId]);

  // ── Categories from database ───────────────────────────
  const [dbCategories, setDbCategories] = useState([]);

  useEffect(() => {
    apiFetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        if (data.categories) setDbCategories(data.categories);
      })
      .catch(err => console.error('Error fetching categories:', err));
  }, []);

  // ── Create-form state ──────────────────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedAttributes, setSelectedAttributes] = useState([]);
  const [customAttributes, setCustomAttributes] = useState([]);
  const [newAttribute, setNewAttribute] = useState('');
  const [addQuestions, setAddQuestions] = useState(false);
  const [questions, setQuestions] = useState(['']);
  const [status, setStatus] = useState('Active');
  const [isPublic, setIsPublic] = useState(false);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const allAttributes = [...ATTRIBUTE_CATALOG, ...customAttributes];

  const handleAttributeToggle = (attribute) => {
    setSelectedAttributes((prev) =>
      prev.includes(attribute)
        ? prev.filter((a) => a !== attribute)
        : [...prev, attribute]
    );
  };

  const handleAddCustomAttribute = () => {
    const trimmed = newAttribute.trim();
    if (!trimmed) return;

    const alreadyExists = allAttributes.some(
      (attribute) => attribute.toLowerCase() === trimmed.toLowerCase()
    );
    if (alreadyExists) {
      setMessage('This attribute already exists.');
      return;
    }

    setCustomAttributes((prev) => [...prev, trimmed]);
    setSelectedAttributes((prev) => [...prev, trimmed]);
    setNewAttribute('');
    setMessage('');
  };

  const handleQuestionChange = (index, value) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const addQuestionField = () => {
    setQuestions([...questions, '']);
  };

  const removeQuestionField = (index) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e, saveAsDraft = false) => {
    e.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    if (!name.trim()) {
      setMessage('Please enter an initiative name.');
      setIsSubmitting(false);
      return;
    }

    if (selectedAttributes.length === 0) {
      setMessage('Please select at least one attribute.');
      setIsSubmitting(false);
      return;
    }

    const cleanedQuestions = addQuestions
      ? questions.map((q) => q.trim()).filter(Boolean)
      : [];

    const effectiveStatus = saveAsDraft ? 'draft' : status;

    try {
      // collect reason before creating initiative
      setPendingAction({
        type: 'createInitiative',
        payload: {
          name: name.trim(),
          description: description.trim(),
          attributes: selectedAttributes,
          questions: cleanedQuestions,
          settings: { status: effectiveStatus, isPublic },
          categoryId: categoryId || null,
        },
      });
      setShowReasonModal(true);
    } catch (error) {
      setMessage('Connection error. Please try again.');
      console.error('Error creating initiative:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReasonSubmit = async ({ reasonType, reasonText }) => {
    setShowReasonModal(false);
    if (!pendingAction) return;
    setIsSubmitting(true);
    try {
      const { categoryId: selectedCategoryId, ...rest } = pendingAction.payload;
      const body = { ...rest, reasonType, reasonText };
      const url = isEditing ? `/api/initiatives/${editId}` : '/api/initiatives';
      const method = isEditing ? 'PUT' : 'POST';
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        const initiativeId = isEditing ? Number(editId) : data.initiative?.id;

        if (initiativeId && selectedCategoryId) {
          if (isEditing) {
            const existingCats = await apiFetch(`/api/initiative-categories?initiative_id=${initiativeId}`).then(r => r.json());
            if (existingCats.relationships) {
              for (const rel of existingCats.relationships) {
                await apiFetch('/api/initiative-categories', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ initiative_id: initiativeId, category_id: rel.category_id }),
                });
              }
            }
          }
          await apiFetch('/api/initiative-categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initiative_id: initiativeId, category_id: Number(selectedCategoryId) }),
          });
        } else if (initiativeId && !selectedCategoryId && isEditing) {
          const existingCats = await apiFetch(`/api/initiative-categories?initiative_id=${initiativeId}`).then(r => r.json());
          if (existingCats.relationships) {
            for (const rel of existingCats.relationships) {
              await apiFetch('/api/initiative-categories', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initiative_id: initiativeId, category_id: rel.category_id }),
              });
            }
          }
        }

        setMessage(isEditing ? 'Initiative updated successfully!' : 'Initiative created successfully!');
        if (!isEditing) {
          setName('');
          setDescription('');
          setCategoryId('');
          setSelectedAttributes([]);
          setCustomAttributes([]);
          setNewAttribute('');
          setAddQuestions(false);
          setQuestions(['']);
          setStatus('Active');
          setIsPublic(false);
        }
        fetchInitiatives();
        setTimeout(() => router.push('/initiative-creation'), 1500);
      } else {
        setMessage(`${data.error || 'Failed to save initiative'}`);
      }
    } catch (error) {
      setMessage('Connection error. Please try again.');
      console.error('Error saving initiative:', error);
    } finally {
      setIsSubmitting(false);
      setPendingAction(null);
    }
  };

  // ── Derived stats ──────────────────────────────────────
  const totalCount    = initiatives.length;
  const activeCount   = initiatives.filter(i => {
    const s = (i.settings?.status || '').toLowerCase();
    return s === 'active' || s === '';
  }).length;
  const draftCount    = initiatives.filter(i => {
    const s = (i.settings?.status || '').toLowerCase();
    return s === 'draft' || s === 'archived';
  }).length;

  const canCreate = userRole === 'admin' || userRole === 'staff';

  return (
    <PageLayout title="Initiatives">

      {/* ── Page header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Initiatives</h2>
        {canCreate && (
          <button
            className="btn-primary"
            onClick={() => document.getElementById('create-form')?.scrollIntoView({ behavior: 'smooth' })}
          >
            + New Initiative
          </button>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Initiatives</div>
          <div className="stat-value">{totalCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">{activeCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Draft / Archived</div>
          <div className="stat-value">{draftCount}</div>
        </div>
      </div>

      {/* ── Initiatives table card ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">All Initiatives</span>
        </div>

        {isLoadingList ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            Loading initiatives…
          </p>
        ) : initiatives.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            No initiatives yet. {canCreate && 'Use the form below to create one.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Initiative</th>
                  <th>Category</th>
                  <th>Created</th>
                  <th>Submissions</th>
                  <th>Participants</th>
                  <th>Status</th>
                  {canCreate && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {initiatives.map((initiative) => {
                  const s = initiative.settings?.status || 'active';
                  return (
                    <tr key={initiative.id}>
                      <td style={{ fontWeight: 600, color: '#111827' }}>{initiative.name}</td>
                      <td style={{ color: '#6B7280' }}>{initiative.category || '—'}</td>
                      <td style={{ color: '#6B7280' }}>{formatDate(initiative.created_at)}</td>
                      <td style={{ color: '#6B7280' }}>{initiative.submission_count ?? '—'}</td>
                      <td style={{ color: '#6B7280' }}>{initiative.participant_count ?? '—'}</td>
                      <td>{statusPill(s)}</td>
                      {canCreate && (
                        <td>
                          <span
                            style={{ color: '#E67E22', cursor: 'pointer', fontSize: 13, fontWeight: 500, marginRight: 12 }}
                            onClick={() => router.push(`/initiatives/${initiative.id}/manage?tab=edit`)}
                          >
                            Edit
                          </span>
                          <span
                            style={{ color: '#6B7280', cursor: 'pointer', fontSize: 13, fontWeight: 500, marginRight: 12 }}
                            onClick={async () => {
                              if (!confirm(`Archive "${initiative.name}"? This will mark it as archived.`)) return;
                              try {
                                const currentSettings = initiative.settings || {};
                                const resp = await apiFetch(`/api/initiatives/${initiative.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ settings: { ...currentSettings, status: 'archived' } }),
                                });
                                if (resp.ok) {
                                  fetchInitiatives();
                                } else {
                                  const data = await resp.json();
                                  alert(data.error || 'Failed to archive initiative');
                                }
                              } catch {
                                alert('Connection error. Please try again.');
                              }
                            }}
                          >
                            Archive
                          </span>
                          <span
                            style={{ color: '#DC2626', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                            onClick={async () => {
                              if (!confirm(`Delete "${initiative.name}"? This will permanently remove the initiative and all associated data.`)) return;
                              try {
                                const resp = await apiFetch(`/api/initiatives/${initiative.id}`, {
                                  method: 'DELETE',
                                });
                                if (resp.ok) {
                                  fetchInitiatives();
                                } else {
                                  const data = await resp.json();
                                  alert(data.error || 'Failed to delete initiative');
                                }
                              } catch {
                                alert('Connection error. Please try again.');
                              }
                            }}
                          >
                            Delete
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create form ── */}
      {canCreate ? (
        <div id="create-form" className="card">
          <div className="card-header">
            <span className="card-title">{isEditing ? 'Edit Initiative' : 'Create Initiative'}</span>
          </div>

          {/* Status message */}
          {message && (
            <div style={{
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              backgroundColor: message.includes('successfully') ? '#e8f5e9' : '#ffebee',
              border: `1px solid ${message.includes('successfully') ? '#c8e6c9' : '#ffcdd2'}`,
              borderRadius: '8px',
              color: message.includes('successfully') ? '#2e7d32' : '#c62828',
              fontSize: '0.9rem',
            }}>
              {message}
            </div>
          )}

          <form onSubmit={(e) => handleSubmit(e, false)}>

            {/* ── Row 1: Name + Category ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={labelStyle}>
                  Initiative Name <span style={{ color: '#c62828' }}>*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., E-Gaming and Careers"
                  required
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={(e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
                >
                  <option value="">Select category…</option>
                  {dbCategories.map((cat) => (
                    <option key={cat.category_id} value={cat.category_id}>
                      {cat.category_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Description ── */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the initiative's purpose and goals…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                onFocus={(e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            {/* ── Attributes ── */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  Attributes <span style={{ color: '#c62828' }}>*</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: '400', color: '#9CA3AF', marginLeft: '0.5rem' }}>
                    {selectedAttributes.length} selected
                  </span>
                </label>
                {userRole === 'admin' && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={newAttribute}
                      onChange={(e) => setNewAttribute(e.target.value)}
                      placeholder="Custom attribute…"
                      style={{ ...inputStyle, width: 180, marginBottom: 0, fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
                      onFocus={(e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; }}
                      onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomAttribute}
                      className="btn-outline"
                      style={{ whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '0.5rem',
                backgroundColor: '#F9FAFB',
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '0.25rem',
                }}>
                  {allAttributes.map((attribute) => {
                    const isSelected = selectedAttributes.includes(attribute);
                    return (
                      <label
                        key={attribute}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '6px',
                          backgroundColor: isSelected ? '#FFF7ED' : 'transparent',
                          border: isSelected ? '1px solid #FDBA74' : '1px solid transparent',
                          transition: 'all 0.15s ease',
                          fontSize: '0.85rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleAttributeToggle(attribute)}
                          style={{ marginRight: '0.5rem', cursor: 'pointer', accentColor: '#E67E22' }}
                        />
                        <span style={{ color: '#111827' }}>{attribute}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Settings row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={(e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
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
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    style={{ marginRight: '0.6rem', cursor: 'pointer', accentColor: '#E67E22' }}
                  />
                  <span style={{ fontSize: '0.9rem', color: '#111827' }}>Publicly visible</span>
                </label>
              </div>
            </div>

            {/* ── Questions ── */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: addQuestions ? '0.75rem' : 0 }}>
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
                    checked={addQuestions}
                    onChange={(e) => setAddQuestions(e.target.checked)}
                    style={{ marginRight: '0.4rem', cursor: 'pointer', accentColor: '#E67E22' }}
                  />
                  Add questions
                </label>
              </div>

              {addQuestions && (
                <div>
                  {questions.map((q, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        value={q}
                        onChange={(e) => handleQuestionChange(i, e.target.value)}
                        placeholder={`Question ${i + 1}`}
                        style={{ ...inputStyle, flex: 1 }}
                        onFocus={(e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; }}
                        onBlur={(e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; }}
                      />
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestionField(i)}
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
                    onClick={addQuestionField}
                    className="btn-outline"
                    style={{ marginTop: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  >
                    + Add another question
                  </button>
                </div>
              )}
            </div>

            {/* ── Form actions ── */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              {isEditing && (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => router.push('/initiative-creation')}
                >
                  Cancel
                </button>
              )}
              {!isEditing && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  className="btn-outline"
                  onClick={(e) => handleSubmit(e, true)}
                  style={{ opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
                >
                  Save as Draft
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
                style={{ opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
              >
                {isSubmitting ? 'Saving…' : isEditing ? 'Update Initiative' : 'Create Initiative'}
              </button>
            </div>

          </form>

          {/* Reason modal for creating initiatives */}
          <ReasonModal
            open={showReasonModal}
            onClose={() => setShowReasonModal(false)}
            onSubmit={handleReasonSubmit}
            title={isEditing ? "Why are you editing this initiative?" : "Why are you creating this initiative?"}
          />
        </div>
      ) : (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔒</div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
              Unauthorized Access
            </h2>
            <p style={{ color: '#6B7280', marginBottom: '0.5rem', lineHeight: 1.6 }}>
              Only staff and admin can create initiatives.
            </p>
            <p style={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
              If you believe this is an error, please contact the administrator.
            </p>
          </div>
        </div>
      )}

    </PageLayout>
  );
}

// ── Shared styles ────────────────────────────────────────

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
