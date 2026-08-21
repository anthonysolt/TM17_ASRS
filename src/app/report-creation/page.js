'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import { getInitiatives, getReportData, getReportQuestions } from '@/lib/data-service';

import StepIndicator from '@/components/report-steps/StepIndicator';
import StepConfig from '@/components/report-steps/StepConfig';
import StepQuestions from '@/components/report-steps/StepQuestions';
import StepPreview from '@/components/report-steps/StepPreview';
import { getUiEventBus } from '@/lib/events/ui-event-bus';
import EVENTS from '@/lib/events/event-types';
import { apiFetch } from '@/lib/api/client';

const TOTAL_STEPS = 3;

export default function ReportCreationPage() {
  const [userRole, setUserRole] = useState('public');
  const [authChecked, setAuthChecked] = useState(false);

  // ---- DATA ----
  const [initiatives, setInitiatives] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // ---- REPORT CONFIG ----
  const [currentStep, setCurrentStep] = useState(0);
  const [reportConfig, setReportConfig] = useState({
    selectedInitiative: null,
    reportName: '',
    description: '',
    questionSelections: [],
    startDate: '',
    endDate: '',
  });

  // ---- UI STATE ----
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // ---- REPORT HISTORY ----
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Detect user role on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUserRole(parsed.user_type || 'public');
      } catch {
        setUserRole('public');
      }
    } else {
      setUserRole('public');
    }
    setAuthChecked(true);
  }, []);

  // Load initiatives on mount
  useEffect(() => {
    async function loadInitiatives() {
      try {
        const data = await getInitiatives();
        setInitiatives(data);
        if (data.length > 0) {
          setReportConfig(prev => ({ ...prev, selectedInitiative: data[0] }));
        } else {
          setErrorMessage('No initiatives are available. Please refresh or contact an administrator.');
        }
      } catch {
        setInitiatives([]);
        setErrorMessage('Unable to load initiatives. Please try again.');
      } finally {
        setDraftLoaded(true);
      }
    }
    loadInitiatives();
    fetchReports();
  }, []);

  // Load table data when initiative changes
  useEffect(() => {
    async function loadTableData() {
      if (!reportConfig.selectedInitiative) {
        setTableData([]);
        return;
      }
      const data = await getReportData(reportConfig.selectedInitiative.id);
      setTableData(data?.tableData || []);
    }
    loadTableData();
  }, [reportConfig.selectedInitiative]);

  useEffect(() => {
    async function loadQuestions() {
      const initiativeId = reportConfig.selectedInitiative?.id;
      if (!initiativeId) {
        setQuestions([]);
        return;
      }
      setLoadingQuestions(true);
      try {
        const nextQuestions = await getReportQuestions(initiativeId);
        setQuestions(nextQuestions);
        const availableIds = new Set(nextQuestions.map((question) => question.id));
        setReportConfig((previous) => ({
          ...previous,
          questionSelections: previous.questionSelections.filter((selection) => availableIds.has(selection.id)),
        }));
      } finally {
        setLoadingQuestions(false);
      }
    }
    loadQuestions();
  }, [reportConfig.selectedInitiative]);


  async function fetchReports() {
    setLoadingReports(true);
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      setReports(data.reports || []);
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }

  // ---- STEP NAVIGATION ----
  function updateConfig(partial) {
    setReportConfig(prev => ({ ...prev, ...partial }));
  }

  function canProceed() {
    if (currentStep === 0) {
      return reportConfig.selectedInitiative && reportConfig.reportName.trim().length > 0;
    }
    if (currentStep === 1) {
      return reportConfig.questionSelections.length > 0;
    }
    return true;
  }

  function handleNext() {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(prev => prev + 1);
      setErrorMessage('');
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setErrorMessage('');
    }
  }

  // ---- GENERATE REPORT ----
  async function handleGenerate() {
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiativeId: reportConfig.selectedInitiative.id,
          name: reportConfig.reportName,
          description: reportConfig.description,
          createdBy: userRole,
          filters: {},
          expressions: [],
          sorts: [],
          questionSelections: reportConfig.questionSelections,
          includeAiInsights: reportConfig.includeAiInsights || false,
        }),
      });

      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        throw new Error(failure.error || 'Failed to generate report');
      }

      const successPayload = await res.json().catch(() => ({}));

      // Reset form
      setCurrentStep(0);
      setReportConfig({
        selectedInitiative: initiatives.length > 0 ? initiatives[0] : null,
        reportName: '',
        description: '',
        questionSelections: [],
        startDate: '',
        endDate: '',
        includeAiInsights: false,
      });
      setSuccessMessage('Report generated and published to Reporting.');
      getUiEventBus().publish(EVENTS.REPORT_UPDATED, {
        reportId: successPayload.reportId,
        initiativeId: reportConfig.selectedInitiative?.id,
        updatedAt: new Date().toISOString(),
      });
      fetchReports();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to generate report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ---- HELPERS ----
  function formatDate(dateStr) {
    if (!dateStr) return '\u2014';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const statusBadge = (status) => {
    const colors = {
      completed: { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' },
      generating: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
      failed: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
    };
    const c = colors[status] || colors.completed;
    return {
      display: 'inline-block',
      padding: '0.2rem 0.65rem',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      backgroundColor: c.bg,
      color: c.text,
      border: `1px solid ${c.border}`,
    };
  };

  // ---- RENDER CURRENT STEP ----
  function renderStep() {
    switch (currentStep) {
      case 0:
        return (
          <StepConfig
            initiatives={initiatives}
            reportConfig={reportConfig}
            onChange={updateConfig}
          />
        );
      case 1:
        return (
          <StepQuestions
            reportConfig={reportConfig}
            onChange={updateConfig}
            questions={questions}
            loading={loadingQuestions}
          />
        );
      case 2:
        return (
          <StepPreview
            reportConfig={reportConfig}
            tableData={tableData}
            onGenerate={handleGenerate}
            isSubmitting={isSubmitting}
          />
        );
      default:
        return null;
    }
  }

  if (!authChecked) {
    return (
      <PageLayout title="Create Report">
        <p style={{ color: '#6B7280', textAlign: 'center', padding: '2rem' }}>
          Loading...
        </p>
      </PageLayout>
    );
  }

  if (authChecked && userRole !== 'staff' && userRole !== 'admin') {
    return (
      <PageLayout title="Create Report">
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: '#111827' }}>
            Access Denied
          </h1>
          <p style={{ color: '#6B7280', fontSize: '1rem' }}>
            You do not have permission to create reports. Please contact an administrator.
          </p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Create Report">
      {/* Step wizard card */}
      <div className="card" style={{ padding: '32px', marginBottom: '2rem' }}>
        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Active Step Content */}
        <div style={{ marginBottom: '1.5rem' }}>
          {renderStep()}
        </div>

        {/* Navigation Buttons (not shown on preview step — it has its own Generate button) */}
        {currentStep < TOTAL_STEPS - 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', paddingTop: '1rem',
            borderTop: '1px solid #E5E7EB',
          }}>
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className="btn-outline"
              style={{
                opacity: currentStep === 0 ? 0.4 : 1,
                cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Back
            </button>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="btn-primary"
                style={{
                  opacity: canProceed() ? 1 : 0.5,
                  cursor: canProceed() ? 'pointer' : 'not-allowed',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Back button on preview step */}
        {currentStep === TOTAL_STEPS - 1 && (
          <div style={{ paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
            <button onClick={handleBack} className="btn-outline">
              Back
            </button>
          </div>
        )}

        {/* Messages */}
        {errorMessage && (
          <p style={{ marginTop: '1rem', color: '#DC2626' }}>
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p style={{ marginTop: '1rem', color: '#059669' }}>
            {successMessage}
          </p>
        )}
      </div>

      {/* Report History */}
      <div className="card" style={{ padding: '32px' }}>
        <div className="card-header">
          <h2 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#111827' }}>
            Report History
          </h2>
        </div>

        {loadingReports ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>
            Loading reports...
          </p>
        ) : reports.length === 0 ? (
          <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1.5rem' }}>
            No reports yet. Generate your first one above.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {['Report Name', 'Initiative', 'Created By', 'Date', 'Status'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: '500' }}>
                      <Link
                        href={`/report-creation/${r.id}`}
                        style={{
                          color: '#E67E22',
                          textDecoration: 'none',
                          fontWeight: '600',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                      >
                        {r.name || '(Untitled)'}
                      </Link>
                    </td>
                    <td>{r.initiative_name || '\u2014'}</td>
                    <td>{r.created_by || '\u2014'}</td>
                    <td>{formatDate(r.created_at)}</td>
                    <td>
                      <span style={statusBadge(r.status)}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
