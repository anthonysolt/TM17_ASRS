'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import PageLayout from '@/components/PageLayout';
import { getInitiatives, getReportData, getReportGoals, getReportQuestions } from '@/lib/data-service';

import StepIndicator from '@/components/report-steps/StepIndicator';
import StepConfig from '@/components/report-steps/StepConfig';
import StepQuestions, { hasMissingTargetAnswer } from '@/components/report-steps/StepQuestions';
import StepFilters, { hasInvalidDateRange, hasInvalidQuestionFilter } from '@/components/report-steps/StepFilters';
import StepGoals from '@/components/report-steps/StepGoals';
import { getReportStatusLabel } from '@/lib/report-status';
import { getUiEventBus } from '@/lib/events/ui-event-bus';
import EVENTS from '@/lib/events/event-types';
import { apiFetch } from '@/lib/api/client';

// The Preview step (last step) pulls in the charting library; load it only when
// it is reached so the builder's first render stays small and fast. ssr: false keeps
// it out of the server render too (the step is never shown on first load).
const StepPreview = dynamic(() => import('@/components/report-steps/StepPreview'), {
  ssr: false,
  loading: () => <p style={{ color: '#6B7280', padding: '1rem 0' }}>Loading preview…</p>,
});

const TOTAL_STEPS = 5;

export default function ReportCreationPage() {
  const [userRole, setUserRole] = useState('public');
  const [authChecked, setAuthChecked] = useState(false);

  // ---- DATA ----
  const [initiatives, setInitiatives] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [goals, setGoals] = useState([]);
  const [loadingGoals, setLoadingGoals] = useState(false);

  // ---- REPORT CONFIG ----
  const [currentStep, setCurrentStep] = useState(0);
  const [reportConfig, setReportConfig] = useState({
    selectedInitiative: null,
    reportName: '',
    description: '',
    questionSelections: [],
    goalIds: [],
    status: 'completed',
    startDate: '',
    endDate: '',
  });

  // ---- UI STATE ----
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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
      }
    }
    loadInitiatives();
  }, []);

  // Load table data when initiative changes
  useEffect(() => {
    async function loadTableData() {
      if (!reportConfig.selectedInitiative) {
        setTableData([]);
        return;
      }
      // An invalid range (From after To) keeps the last rows until it is fixed.
      if (hasInvalidDateRange(reportConfig)) return;
      const data = await getReportData(reportConfig.selectedInitiative.id, {
        startDate: reportConfig.startDate,
        endDate: reportConfig.endDate,
      });
      setTableData(data?.tableData || []);
    }
    loadTableData();
    // Reload when the initiative or the response date range changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportConfig.selectedInitiative, reportConfig.startDate, reportConfig.endDate]);

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

  // Only goals of the selected initiative can be included on its report.
  useEffect(() => {
    async function loadGoals() {
      const initiativeId = reportConfig.selectedInitiative?.id;
      if (!initiativeId) {
        setGoals([]);
        return;
      }
      setLoadingGoals(true);
      try {
        const nextGoals = await getReportGoals(initiativeId);
        setGoals(nextGoals);
        const availableIds = new Set(nextGoals.map((goal) => goal.goal_id));
        setReportConfig((previous) => ({
          ...previous,
          goalIds: previous.goalIds.filter((id) => availableIds.has(id)),
        }));
      } finally {
        setLoadingGoals(false);
      }
    }
    loadGoals();
  }, [reportConfig.selectedInitiative]);

  // ---- STEP NAVIGATION ----
  function updateConfig(partial) {
    setReportConfig(prev => ({ ...prev, ...partial }));
  }

  function canProceed() {
    if (currentStep === 0) {
      return reportConfig.selectedInitiative && reportConfig.reportName.trim().length > 0;
    }
    if (currentStep === 1) {
      return !hasMissingTargetAnswer(reportConfig.questionSelections);
    }
    if (currentStep === 2) {
      return !hasInvalidQuestionFilter(reportConfig.questionSelections) && !hasInvalidDateRange(reportConfig);
    }
    // Questions and goals are each optional, but a report needs at least one of them.
    if (currentStep === 3) {
      return reportConfig.questionSelections.length > 0 || reportConfig.goalIds.length > 0;
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
          expressions: [],
          sorts: [],
          questionSelections: reportConfig.questionSelections,
          goalIds: reportConfig.goalIds,
          status: reportConfig.status,
          startDate: reportConfig.startDate || null,
          endDate: reportConfig.endDate || null,
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
        goalIds: [],
        status: 'completed',
        startDate: '',
        endDate: '',
        includeAiInsights: false,
      });
      setSuccessMessage(`Report generated with status: ${getReportStatusLabel(reportConfig.status)}.`);
      getUiEventBus().publish(EVENTS.REPORT_UPDATED, {
        reportId: successPayload.reportId,
        initiativeId: reportConfig.selectedInitiative?.id,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setErrorMessage(err.message || 'Failed to generate report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

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
          <StepFilters
            reportConfig={reportConfig}
            onChange={updateConfig}
            questions={questions}
            tableData={tableData}
          />
        );
      case 3:
        return (
          <StepGoals
            reportConfig={reportConfig}
            onChange={updateConfig}
            goals={goals}
            loading={loadingGoals}
          />
        );
      case 4:
        return (
          <StepPreview
            reportConfig={reportConfig}
            tableData={tableData}
            questions={questions}
            selectedGoals={goals.filter((goal) => reportConfig.goalIds.includes(goal.goal_id))}
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <Link href="/reporting" className="btn-outline">← Back to Reporting</Link>
      </div>

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
    </PageLayout>
  );
}
