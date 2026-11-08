'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageLayout from '@/components/PageLayout';
import SurveysPageHeader from '@/components/SurveysPageHeader';
import DistributionAccessGate from '@/components/DistributionAccessGate';
import { apiFetch } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import {
  DISTRIBUTION_LIST_PATH,
  fieldGroupStyle,
  inputStyle,
  labelStyle,
} from '@/lib/surveys/distribution-ui';

export default function CreateEmailDistributionPage() {
  return (
    <DistributionAccessGate>
      <CreateEmailDistributionForm />
    </DistributionAccessGate>
  );
}

function CreateEmailDistributionForm() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [recipientEmails, setRecipientEmails] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/surveys/templates')
      .then((res) => res.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
  }, []);

  // ── Email chip helpers ───────────────────────────────
  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

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
      if (!res.ok) throw new Error(data.error || 'Failed to create email distribution.');

      router.push(`${DISTRIBUTION_LIST_PATH}?created=email&name=${encodeURIComponent(title.trim())}`);
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <PageLayout title="Create Email Distribution">
      <SurveysPageHeader
        activeTab="distribution"
        showCreate={false}
        backHref={DISTRIBUTION_LIST_PATH}
        backLabel="&larr; Back to Survey Distribution"
      />

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h2 className="card-title">Create Email Distribution</h2>
        </div>

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
                <option key={t.id} value={t.id}>{t.title}</option>
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
              <button type="button" onClick={addEmail} className="btn-outline" style={{ whiteSpace: 'nowrap' }}>
                Add
              </button>
            </div>

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

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" className="btn-outline" onClick={() => router.push(DISTRIBUTION_LIST_PATH)} disabled={isSubmitting}>
              Cancel
            </button>
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
              {isSubmitting ? 'Creating…' : 'Create Email Distribution'}
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}
