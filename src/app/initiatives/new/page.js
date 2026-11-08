'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/PageLayout';
import ReasonModal from '@/components/ReasonModal';
import { apiFetch } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { INITIATIVE_STATUS_OPTIONS } from '@/lib/initiative-status';

const LIST_PATH = '/initiative-creation';

const focusHandlers = {
  onFocus: (e) => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,.1)'; },
  onBlur: (e) => { e.target.style.borderColor = '#E5E7EB'; e.target.style.boxShadow = 'none'; },
};

export default function CreateInitiativePage() {
  const router = useRouter();
  const { user, hydrated } = useAuthStore();
  const canCreate = user?.user_type === 'admin' || user?.user_type === 'staff';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [isPublic, setIsPublic] = useState(false);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  // Validates, then asks for an audit reason before creating.
  const handleSubmit = (e) => {
    e.preventDefault();
    setMessage('');
    if (!name.trim()) {
      setMessage('Please enter an initiative name.');
      return;
    }
    setPendingPayload({
      name: name.trim(),
      description: description.trim(),
      settings: { status, isPublic },
    });
    setShowReasonModal(true);
  };

  const handleReasonSubmit = async ({ reasonType, reasonText }) => {
    setShowReasonModal(false);
    if (!pendingPayload) return;
    setIsSubmitting(true);
    try {
      const rest = pendingPayload;
      const response = await apiFetch('/api/initiatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, reasonType, reasonText }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || 'Failed to save initiative');
        return;
      }

      router.push(`${LIST_PATH}?created=${encodeURIComponent(rest.name)}`);
    } catch (error) {
      setMessage('Connection error. Please try again.');
      console.error('Error creating initiative:', error);
    } finally {
      setIsSubmitting(false);
      setPendingPayload(null);
    }
  };

  const backButton = (
    <button className="btn-outline" onClick={() => router.push(LIST_PATH)} style={{ fontSize: '0.85rem' }}>
      &larr; Back to Initiatives
    </button>
  );

  return (
    <PageLayout title="Create Initiative">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Create Initiative</h2>
        {backButton}
      </div>

      {!hydrated ? null : !canCreate ? (
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
      ) : (
        <div className="card">
          {message && (
            <div style={{
              padding: '0.75rem 1rem', marginBottom: '1.25rem', borderRadius: '8px', fontSize: '0.9rem',
              backgroundColor: '#ffebee', border: '1px solid #ffcdd2', color: '#c62828',
            }}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* ── Name ── */}
            <div style={{ marginBottom: '1rem' }}>
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
                  {...focusHandlers}
                />
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
                {...focusHandlers}
              />
            </div>

            {/* ── Settings row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
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

            {/* ── Form actions ── */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-outline" onClick={() => router.push(LIST_PATH)} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
                style={{ opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
              >
                {isSubmitting ? 'Saving…' : 'Create Initiative'}
              </button>
            </div>
          </form>

          <ReasonModal
            open={showReasonModal}
            onClose={() => setShowReasonModal(false)}
            onSubmit={handleReasonSubmit}
            title="Why are you creating this initiative?"
          />
        </div>
      )}
    </PageLayout>
  );
}

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
