'use client';

import { useEffect, useState } from 'react';
import PageLayout from '@/components/PageLayout';
import SurveysPageHeader from '@/components/SurveysPageHeader';
import SurveyResponsesView from '@/components/SurveyResponsesView';
import { apiFetch } from '@/lib/api/client';

export default function SurveyResponsesPage() {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // For the table's Initiative picker.
  const [initiatives, setInitiatives] = useState([]);

  // The responses themselves are loaded a page at a time by SurveyResponsesView.
  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/surveys/templates');
      if (!res.ok) throw new Error('Failed to load surveys');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Unable to load surveys');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchInitiatives = () => {
    apiFetch('/api/initiatives')
      .then((res) => (res.ok ? res.json() : { initiatives: [] }))
      .then((data) => setInitiatives(data.initiatives || []))
      .catch(() => setInitiatives([]));
  };

  useEffect(() => {
    fetchTemplates();
    fetchInitiatives();
  }, []);

  // Messages from the responses table go to the page banners.
  function notify(message, type = 'success') {
    if (type === 'error') { setSuccessMessage(''); setError(message); }
    else { setError(null); setSuccessMessage(message); }
  }

  return (
    <PageLayout title="Survey Responses">
      <SurveysPageHeader activeTab="responses" />

      {successMessage && (
        <div style={{
          marginBottom: '20px', padding: '12px 16px', borderRadius: '8px',
          border: '1px solid #a7f3d0', backgroundColor: '#d1fae5', color: '#065f46',
          fontSize: '0.9rem', fontWeight: 500,
        }}>
          {successMessage}
        </div>
      )}

      {error && (
        <div style={{
          marginBottom: '20px', padding: '12px 16px', borderRadius: '8px',
          border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#b91c1c',
          fontSize: '0.9rem', fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {isLoading ? (
        <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem' }}>Loading surveys...</p>
      ) : (
        <SurveyResponsesView
          templates={templates}
          initiatives={initiatives}
          onNotify={notify}
          recentPageSize={25}
        />
      )}
    </PageLayout>
  );
}
