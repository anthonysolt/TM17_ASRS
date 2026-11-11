'use client';

import PageLayout from '@/components/PageLayout';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import SurveysPageHeader from '@/components/SurveysPageHeader';
import SurveyList from '@/components/SurveyList';
import SearchField, { FILTER_BAR_STYLE, InitiativeFilter, SortSelect, compareBySort } from '@/components/ListFilters';
import { fetchResponseCounts, responseCountFor } from '@/lib/surveys/survey-admin-client';

export default function ManageSurveysPage() {
  // Response counts per survey ({ [templateId]: n }); the responses themselves aren't loaded here.
  const [responseCounts, setResponseCounts] = useState({});
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Initiatives for the filter and the cards' meta line (templates only carry initiative_id).
  const [initiatives, setInitiatives] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInitiativeId, setSelectedInitiativeId] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const fetchCounts = async () => {
    setError(null);
    try {
      const { counts } = await fetchResponseCounts();
      setResponseCounts(counts);
    } catch (err) {
      setError(err.message || 'Unable to load response counts');
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/surveys/templates');
      if (!res.ok) throw new Error('Failed to load surveys');
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Unable to load surveys');
    }
  };

  const fetchInitiatives = () => {
    apiFetch('/api/initiatives')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load initiatives (${res.status})`);
        return res.json();
      })
      .then((data) => setInitiatives(data.initiatives || []))
      .catch((err) => {
        console.error('Failed to load initiatives:', err);
        setInitiatives([]);
        setError('Unable to load initiatives; the initiative filter may be incomplete.');
      });
  };

  useEffect(() => {
    fetchTemplates();
    fetchCounts();
    fetchInitiatives();
  }, []);

  // Messages from the survey list (e.g. after Delete) go to the page banners.
  const notify = (message, type = 'success') => {
    if (type === 'error') { setSuccessMessage(''); setError(message); }
    else { setError(null); setSuccessMessage(message); }
  };

  const responseCountByTemplate = (templateId) => responseCountFor(responseCounts, templateId);

  // Search matches the survey title, its initiative, or its description (same idea as the Reports search).
  const initiativeNames = Object.fromEntries(initiatives.map((i) => [String(i.id), i.name]));
  const query = searchQuery.trim().toLowerCase();
  const filteredTemplates = templates
    .map((template) => ({ ...template, initiative_name: initiativeNames[String(template.initiative_id)] }))
    .filter((template) => !selectedInitiativeId || String(template.initiative_id) === String(selectedInitiativeId))
    .filter((template) => !query || [template.title, template.initiative_name, template.description]
      .some((text) => (text || '').toLowerCase().includes(query)))
    .sort(compareBySort(sortBy, (t) => t.createdAt, (t) => t.title));

  return (
    <PageLayout title="Surveys">
      <SurveysPageHeader activeTab="surveys" />

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

      {/* Analytics Section: heading outside the box, laid out like Active Surveys */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Survey Analytics</h2>
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px' }}>
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
      </div>

      {/* Existing Surveys list */}
      {templates.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>Active Surveys</h2>
          <div style={FILTER_BAR_STYLE}>
            <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search surveys..." />
            <InitiativeFilter value={selectedInitiativeId} onChange={setSelectedInitiativeId} initiatives={initiatives} />
            <SortSelect value={sortBy} onChange={setSortBy} />
          </div>
          <SurveyList
            templates={filteredTemplates}
            responseCounts={responseCounts}
            onChanged={async () => { await fetchTemplates(); await fetchCounts(); }}
            onNotify={notify}
            emptyState={(
              <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No surveys found.</p>
                <p style={{ fontSize: '0.9rem' }}>Try adjusting your search or filters.</p>
              </div>
            )}
          />
        </div>
      )}


    </PageLayout>
  );
}
