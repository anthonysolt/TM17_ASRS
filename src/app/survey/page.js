'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { toSurveyTemplateViewModel } from '@/lib/adapters/survey-template-adapter';
import { validateFieldValue } from '@/lib/field-validation';

export default function SurveyPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isMounted, setIsMounted] = useState(false);
  const [isQrAccess] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(new URLSearchParams(window.location.search).get('qr'));
  });
  const userRole = user?.user_type || 'public';
  const [isPreviewMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(new URLSearchParams(window.location.search).get('template'));
  });
  const [hasDistributionAccess] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('qr') || params.get('dist') || params.get('token') || params.get('template'));
  });
  const isPublicView = isQrAccess || userRole === 'public' || isPreviewMode;

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [initiativeRating, setInitiativeRating] = useState('');
  const [initiativeComments, setInitiativeComments] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionInfo, setSubmissionInfo] = useState(null);
  const [error, setError] = useState(null);

  // Invalid fields tracking
  const [invalidFields, setInvalidFields] = useState({});

  // Distribution / auto-close state (public users only)
  const [surveyOpen, setSurveyOpen] = useState(null); // null = loading, true = open, false = closed
  const [activeDistribution, setActiveDistribution] = useState(null);
  const [activeDistributions, setActiveDistributions] = useState([]);
  const [showSurveyPicker, setShowSurveyPicker] = useState(false);

  // QR code tracking
  const [qrCodeKey, setQrCodeKey] = useState(null);
  const [scanId, setScanId] = useState(null);

  // Survey template loading
  const [surveyTemplate, setSurveyTemplate] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateResponses, setTemplateResponses] = useState({});

  useEffect(() => {
    setIsMounted(true);

    if (isQrAccess) {
      setSurveyOpen(true);
    }
  }, [isQrAccess]);

  // Check for an active distribution on mount (public users only)
  useEffect(() => {
    if (!isPublicView) return;

    const urlParams = new URLSearchParams(window.location.search);
    const hasQr = urlParams.get('qr');
    const hasDist = urlParams.get('dist');
    const hasToken = urlParams.get('token');
    const hasTemplate = urlParams.get('template');

    if (hasQr) {
      setSurveyOpen(true);
      return;
    }

    // Surveys must be accessed via a distribution link
    if (!hasQr && !hasDist && !hasToken && !hasTemplate) {
      setSurveyOpen(false);
      return;
    }

    // If accessed via template link (from distribution), load that specific template
    if (hasTemplate) {
      setSurveyOpen(true);
      return;
    }

    fetch('/api/surveys/active')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then((data) => {
        const surveys = data.surveys || [];

        const activeDists = surveys.map((s) => ({
          distribution_id: s.id,
          survey_template_id: s.templateId,
          title: s.title,
          end_date: s.endDate,
          initiative_name: s.initiativeName,
          status: 'active',
        }));

        setActiveDistributions(activeDists);

        if (activeDists.length > 0) {
          setSurveyOpen(true);
          setShowSurveyPicker(true);
        } else {
          setSurveyOpen(false);
        }
      })
      .catch(() => {
        setSurveyOpen(false);
      });
  }, [isPublicView]);

  // Load survey template if ?template= parameter is present,
  // or if there is an active distribution and no ?template= in the URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const templateParam = urlParams.get('template');

    // Helper to fetch template by id
    const fetchTemplate = (id) => {
      setTemplateLoading(true);
      fetch(`/api/surveys/templates/${id}`)
        .then((res) => {
          if (!res.ok) throw new Error('Template not found');
          return res.json();
        })
        .then((templateData) => {
          setSurveyTemplate(toSurveyTemplateViewModel(templateData));
        })
        .catch((err) => {
          console.error('Error loading survey template:', err);
          setError('Survey template not found. The link may be invalid or expired.');
        })
        .finally(() => {
          setTemplateLoading(false);
        });
    };

    if (templateParam) {
      fetchTemplate(templateParam);
    } else if (activeDistribution && activeDistribution.survey_template_id) {
      fetchTemplate(activeDistribution.survey_template_id);
    }
  }, [activeDistribution]);

  // Track QR code scan if ?qr= parameter is present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const qrParam = urlParams.get('qr');
    if (!qrParam) return;

    setQrCodeKey(qrParam);

    fetch('/api/qr-codes/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrCodeKey: qrParam, convertedToSubmission: false }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.scan) {
          setScanId(data.scan.scanId);
        }
        if (data.qrCode && !data.qrCode.isActive) {
          setError('This QR code has been deactivated. Please contact support.');
        } else if (data.qrCode && data.qrCode.isExpired) {
          setError('This QR code has expired. Please use a current link.');
        }
      })
      .catch((err) => {
        console.error('Error recording QR scan:', err);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSubmitting) return;
    setError(null);

    const newInvalidFields = {};

    // The default feedback form collects contact information. Published
    // templates display only their authored survey questions.
    if (!surveyTemplate) {
      if (!firstName.trim()) newInvalidFields.firstName = true;
      if (!lastName.trim()) newInvalidFields.lastName = true;
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) newInvalidFields.email = true;
    } else if (!firstName.trim()) {
      newInvalidFields.firstName = true;
    }

    if (surveyTemplate) {
      // Template survey: validate non-personal-info questions
      surveyQuestions.forEach((q) => {
        const isQuestionRequired = q.required ?? q.text?.required ?? true;
        if (!isQuestionRequired) return;
        const qId = q.id;
        const questionType = q.type || q.text?.type || 'text';
        const questionSubQuestions = q.subQuestions || q.text?.subQuestions || [];

        if (questionType === 'yesno') {
          const answers = templateResponses[qId] || {};
          if (Object.keys(answers).length < questionSubQuestions.length) {
            newInvalidFields[`question_${qId}`] = true;
          }
        } else if (questionType === 'multiselect' || questionType === 'checkbox') {
          if (!templateResponses[qId] || templateResponses[qId].length === 0) {
            newInvalidFields[`question_${qId}`] = true;
          }
        } else if (questionType === 'boolean') {
          if (templateResponses[qId] === undefined || templateResponses[qId] === null) {
            newInvalidFields[`question_${qId}`] = true;
          }
        } else {
          if (templateResponses[qId] === undefined || templateResponses[qId] === null || !String(templateResponses[qId]).trim()) {
            newInvalidFields[`question_${qId}`] = true;
          }
        }
      });
    } else {
      // Default survey: validate initiative rating
      if (!initiativeRating) newInvalidFields.initiativeRating = true;
    }

    if (Object.keys(newInvalidFields).length > 0) {
      setInvalidFields(newInvalidFields);
      setError('Please fill out all required fields.');
      // Scroll to first invalid field
      const firstKey = Object.keys(newInvalidFields)[0];
      setTimeout(() => {
        const el = document.getElementById(`field-${firstKey}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    // Validate against field rules
    if (surveyTemplate && surveyQuestions.length > 0) {
      const fieldErrors = {};
      for (const q of surveyQuestions) {
        const qId = q.id;
        const value = templateResponses[qId];
        const questionType = q.type || q.text?.type || 'text';
        const isRequired = q.required ?? q.text?.required ?? true;
        const rules = q.validation_rules || q.text?.validation_rules || null;

        const isEmpty = value === undefined || value === null || (typeof value === 'string' && value === '');
        if (isRequired && isEmpty) {
          fieldErrors[`question_${qId}`] = true;
          continue;
        }

        if (!isEmpty && rules) {
          const fieldMeta = { field_type: questionType };
          const qOptions = q.options || q.text?.options;
          if (Array.isArray(qOptions)) fieldMeta.options = qOptions;
          const error = validateFieldValue(value, fieldMeta, rules);
          if (error) {
            fieldErrors[`question_${qId}`] = true;
          }
        }
      }

      if (Object.keys(fieldErrors).length > 0) {
        setInvalidFields(prev => ({ ...prev, ...fieldErrors }));
        return; // Stop submission
      }
    }

    setInvalidFields({});
    setIsSubmitting(true);

    try {
      let payload;

      if (surveyTemplate) {
        const anonymousEmail = `anonymous+${surveyTemplate.id}-${Date.now()}@asrs.local`;
        // Map personal info fields back to their template question IDs
        const mergedAnswers = { ...templateResponses };
        personalInfoFields.forEach((pf) => {
          if (pf._piKey === 'name') mergedAnswers[pf.id] = firstName.trim();
          if (pf._piKey === 'email') mergedAnswers[pf.id] = anonymousEmail;
          if (['phone', 'school', 'grade'].includes(pf._piKey)) mergedAnswers[pf.id] = 'Not collected';
        });

        payload = {
          name: firstName.trim(),
          email: anonymousEmail,
          responses: {
            templateId: surveyTemplate.id,
            templateTitle: surveyTemplate.title,
            templateAnswers: mergedAnswers,
          },
        };
      } else {
        payload = {
          name: `${firstName.trim()} ${lastName.trim()}`,
          email: email.trim(),
          responses: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            initiativeRating,
            initiativeComments: initiativeComments.trim(),
          },
        };
      }

      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit survey.');
      }

      // Track QR code conversion
      if (qrCodeKey && scanId) {
        fetch('/api/qr-codes/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrCodeKey, convertedToSubmission: true }),
        }).catch(() => {});
      }

      setSubmissionInfo({
        surveyId: data.surveyId,
        submittedAt: data.submittedAt,
        survey: data.survey,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setSchool('');
    setGrade('');
    setInitiativeRating('');
    setInitiativeComments('');
    setTemplateResponses({});
    setSubmitted(false);
    setSubmissionInfo(null);
    setError(null);
    setInvalidFields({});
  };

  const formatEasternDateTime = (timestamp) => {
    if (!timestamp) return '—';
    try {
      return new Date(timestamp).toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
    } catch {
      return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    }
  };

  // Identify personal-info fields from template questions
  const PERSONAL_INFO_PATTERNS = [
    { pattern: /^(full\s*name|first\s*name|last\s*name|name)$/i, key: 'name' },
    { pattern: /^(email|e-mail|email address)$/i, key: 'email' },
    { pattern: /^(phone|phone number|telephone|mobile|cell)$/i, key: 'phone' },
    { pattern: /^(school|school name)$/i, key: 'school' },
    { pattern: /^(grade|grade level)$/i, key: 'grade' },
  ];

  const classifyTemplateQuestions = (questions) => {
    const personalInfoFields = [];
    const surveyQuestions = [];
    (questions || []).forEach((q) => {
      const label = (q.label || q.text?.question || '').toLowerCase();
      const match = PERSONAL_INFO_PATTERNS.find((p) => p.pattern.test(label));
      if (match) {
        personalInfoFields.push({ ...q, _piKey: match.key });
      } else {
        surveyQuestions.push(q);
      }
    });
    return { personalInfoFields, surveyQuestions };
  };

  const { personalInfoFields, surveyQuestions } = surveyTemplate
    ? classifyTemplateQuestions(surveyTemplate.questions)
    : { personalInfoFields: [], surveyQuestions: [] };

  // Shared input style
  const inputStyle = {
    width: '100%',
    padding: '0.65rem 0.85rem',
    borderRadius: '8px',
    border: '1px solid #E5E7EB',
    backgroundColor: '#fff',
    color: '#111827',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    boxSizing: 'border-box',
  };

  const invalidInputStyle = {
    ...inputStyle,
    border: '1.5px solid #ef4444',
    backgroundColor: '#fef2f2',
  };

  const labelStyle = {
    display: 'block',
    fontWeight: '600',
    fontSize: '0.9rem',
    color: '#111827',
    marginBottom: '0.35rem',
  };

  const fieldGroupStyle = {
    marginBottom: '1.25rem',
  };

  // Rating options
  const ratingOptions = [
    { value: 'very_satisfied', label: 'Very Satisfied', emoji: '😍' },
    { value: 'satisfied', label: 'Satisfied', emoji: '😊' },
    { value: 'neutral', label: 'Neutral', emoji: '😐' },
    { value: 'dissatisfied', label: 'Dissatisfied', emoji: '😕' },
    { value: 'very_dissatisfied', label: 'Very Dissatisfied', emoji: '😞' },
  ];

  if (!isMounted) {
    if (isPublicView) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
          {/* Simple public topbar */}
          <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #E5E7EB', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: '700', fontSize: '1.1rem', color: '#E67E22' }}>ASRS</span>
            <span style={{ color: '#6B7280', fontSize: '0.95rem' }}>Survey Portal</span>
          </div>
          <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem', textAlign: 'center' }}>
            <p style={{ color: '#6B7280', fontSize: '0.95rem' }}>Loading…</p>
          </main>
        </div>
      );
    }
    return null;
  }

  // Staff/Admin view — redirect to manage-surveys
  if (!isPublicView) {
    router.push('/manage-surveys');
    return null;
  }

  // Public view
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
      {/* Simple public topbar */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #E5E7EB', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontWeight: '700', fontSize: '1.1rem', color: '#E67E22' }}>ASRS</span>
        <span style={{ color: '#6B7280', fontSize: '0.95rem' }}>Survey Portal</span>
      </div>

      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Survey form card */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '32px' }}>

          {/* ---- Loading distribution check ---- */}
          {surveyOpen === null ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ color: '#6B7280', fontSize: '0.95rem' }}>
                Checking survey availability…
              </p>
            </div>
          ) : !surveyOpen ? (
            /* ---- Survey Unavailable State ---- */
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🔒</div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
                {hasDistributionAccess ? 'Survey Closed' : 'Survey Access Required'}
              </h2>
              <p style={{ color: '#6B7280', marginBottom: '0.5rem', lineHeight: 1.6 }}>
                {hasDistributionAccess
                  ? <>This survey is no longer accepting responses.<br />The submission deadline has passed.</>
                  : <>Surveys must be sent to you directly in order to participate.<br />Please use the link provided in your invitation email.</>
                }
              </p>
              <p style={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
                If you believe this is an error, please contact the survey administrator.
              </p>
            </div>
          ) : showSurveyPicker ? (
            /* ---- Survey Picker — multiple active surveys ---- */
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#111827', margin: '0 0 6px' }}>
                Available Surveys
              </h1>
              <p style={{ color: '#6B7280', margin: '0 0 24px' }}>
                Choose a survey to participate in.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeDistributions.map((dist) => (
                  <button
                    key={dist.distribution_id}
                    onClick={() => {
                      setActiveDistribution(dist);
                      setShowSurveyPicker(false);
                    }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '16px 20px', borderRadius: '10px', border: '1px solid #E5E7EB',
                      backgroundColor: '#fff', cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#E67E22'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(230,126,34,0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', marginBottom: '4px' }}>
                        {dist.title}
                      </div>
                      {dist.initiative_name && (
                        <div style={{ fontSize: '0.8rem', color: '#9CA3AF', marginBottom: '2px' }}>
                          {dist.initiative_name}
                        </div>
                      )}
                      <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                        Open until {dist.end_date}
                      </div>
                    </div>
                    <span style={{ color: '#E67E22', fontWeight: 600, fontSize: '0.9rem' }}>Take Survey &rarr;</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ---- Survey Open ---- */
            <>
              {/* Show loading state while template is being fetched */}
              {templateLoading ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <p style={{ color: '#6B7280', fontSize: '0.95rem' }}>
                    Loading survey...
                  </p>
                </div>
              ) : (
                <>
                  {isPreviewMode && userRole !== 'public' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <button
                        onClick={() => router.push('/manage-surveys')}
                        className="btn-outline"
                        style={{ marginBottom: '0.5rem' }}
                      >
                        &larr; Back to Manage Surveys
                      </button>
                      <div style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#FEF3C7',
                        border: '1px solid #FDE68A',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        color: '#92400E',
                        fontWeight: 500,
                      }}>
                        Preview Mode — This is how the survey appears to participants.
                      </div>
                    </div>
                  )}
                  {userRole !== 'public' && !isPreviewMode && (
                    <button
                      onClick={() => router.push('/manage-surveys')}
                      className="btn-outline"
                      style={{ marginBottom: '1rem' }}
                    >
                      Manage surveys
                    </button>
                  )}
                  {userRole === 'public' && activeDistributions.length > 1 && (
                    <button
                      onClick={() => {
                        setShowSurveyPicker(true);
                        setActiveDistribution(null);
                        setSurveyTemplate(null);
                        setTemplateResponses({});
                        setSubmitted(false);
                        setError(null);
                      }}
                      style={{ background: 'none', border: 'none', color: '#E67E22', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem', padding: 0 }}
                    >
                      &larr; Back to all surveys
                    </button>
                  )}

                  {/* Survey Title & Description */}
                  <div style={{ marginBottom: '24px' }}>
                    {surveyTemplate?.initiative_name && (
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E67E22', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        {surveyTemplate.initiative_name}
                      </div>
                    )}
                    <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#111827', margin: '0 0 6px' }}>
                      {surveyTemplate ? surveyTemplate.title : 'Take a Survey'}
                    </h1>
                    <p style={{ color: '#6B7280', margin: 0 }}>
                      {surveyTemplate
                        ? (surveyTemplate.description || 'Please complete the survey below.')
                        : <>Share your feedback on the initiative. All fields marked with <span style={{ color: '#E67E22' }}>*</span> are required.</>
                      }
                    </p>
                    {activeDistribution && (
                      <p style={{ color: '#9CA3AF', fontSize: '0.82rem', margin: '6px 0 0' }}>
                        Open until <strong>{activeDistribution.end_date}</strong>
                      </p>
                    )}
                  </div>

                  {/* ---- Success State ---- */}
                  {submitted ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
                      <h2 style={{ fontSize: '1.35rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
                        Thank You!
                      </h2>
                      <p style={{ color: '#6B7280', marginBottom: '1rem', lineHeight: 1.6 }}>
                        Your survey response has been submitted successfully.<br />
                        {submissionInfo?.submittedAt && (
                          <span>Submitted at: <strong>{formatEasternDateTime(submissionInfo.submittedAt)} (Eastern)</strong></span>
                        )}
                      </p>
                      {submissionInfo?.survey && (
                        <div style={{ margin: '1rem auto', maxWidth: '520px', textAlign: 'left', fontSize: '0.9rem' }}>
                          <h3 style={{ marginTop: 0, fontSize: '1rem', color: '#111827' }}>Submission Details</h3>
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            <li><strong>ID:</strong> {submissionInfo.surveyId || submissionInfo.survey.id}</li>
                            <li><strong>Name:</strong> {submissionInfo.survey.name}</li>
                            <li><strong>Email:</strong> {submissionInfo.survey.email}</li>
                            <li><strong>Template:</strong> {submissionInfo.survey.responses?.templateTitle || 'N/A'}</li>
                          </ul>
                        </div>
                      )}
                      <button
                        onClick={handleReset}
                        className="btn-primary"
                        style={{ padding: '0.7rem 2rem', fontSize: '0.95rem' }}
                      >
                        Submit Another Response
                      </button>
                    </div>
                  ) : (
                    /* ---- Survey Form ---- */
                    <form onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
                      {/* Error banner */}
                      {error && (
                        <div style={{
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '8px',
                          padding: '0.75rem 1rem',
                          marginBottom: '1.25rem',
                          color: '#b91c1c',
                          fontSize: '0.9rem',
                          fontWeight: '500',
                        }}>
                          {error}
                        </div>
                      )}

                      <fieldset disabled={isSubmitting} style={{ border: 'none', margin: 0, padding: 0, minInlineSize: 0 }}>

                        {/* ---- Section: Personal Information (default form only) ---- */}
                        {!surveyTemplate && (
                        <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: '1.25rem', marginBottom: '1.25rem' }}>
                          <h2 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
                            Personal Information
                          </h2>

                          {/* First Name & Last Name – side by side */}
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div id="field-firstName" style={{ ...fieldGroupStyle, flex: '1 1 45%', minWidth: '200px' }}>
                              <label style={labelStyle}>
                                First Name <span style={{ color: '#E67E22' }}>*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="John"
                                value={firstName}
                                onChange={(e) => {
                                  setFirstName(e.target.value);
                                  if (invalidFields.firstName) setInvalidFields((p) => ({ ...p, firstName: false }));
                                }}
                                style={invalidFields.firstName ? invalidInputStyle : inputStyle}
                              />
                              {invalidFields.firstName && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>First name is required.</span>}
                            </div>
                            <div id="field-lastName" style={{ ...fieldGroupStyle, flex: '1 1 45%', minWidth: '200px' }}>
                              <label style={labelStyle}>
                                Last Name <span style={{ color: '#E67E22' }}>*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="Doe"
                                value={lastName}
                                onChange={(e) => {
                                  setLastName(e.target.value);
                                  if (invalidFields.lastName) setInvalidFields((p) => ({ ...p, lastName: false }));
                                }}
                                style={invalidFields.lastName ? invalidInputStyle : inputStyle}
                              />
                              {invalidFields.lastName && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Last name is required.</span>}
                            </div>
                          </div>

                          {/* Email */}
                          <div id="field-email" style={fieldGroupStyle}>
                            <label style={labelStyle}>
                              Email Address <span style={{ color: '#E67E22' }}>*</span>
                            </label>
                            <input
                              type="email"
                              placeholder="john.doe@example.com"
                              value={email}
                              onChange={(e) => {
                                setEmail(e.target.value);
                                if (invalidFields.email) setInvalidFields((p) => ({ ...p, email: false }));
                              }}
                              style={invalidFields.email ? invalidInputStyle : inputStyle}
                            />
                            {invalidFields.email && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{!email.trim() ? 'Email address is required.' : 'Please enter a valid email address.'}</span>}
                          </div>

                        </div>
                        )}

                        {surveyTemplate && (
                          <div id="field-firstName" style={{ ...fieldGroupStyle, marginBottom: '1.25rem' }}>
                            <label style={labelStyle}>
                              Name <span style={{ color: '#E67E22' }}>*</span>
                            </label>
                            <input
                              type="text"
                              value={firstName}
                              onChange={(e) => {
                                setFirstName(e.target.value);
                                if (invalidFields.firstName) setInvalidFields((p) => ({ ...p, firstName: false }));
                              }}
                              placeholder="Enter your name"
                              style={invalidFields.firstName ? invalidInputStyle : inputStyle}
                            />
                            {invalidFields.firstName && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Name is required.</span>}
                          </div>
                        )}

                        {surveyTemplate ? (
                          /* ---- Section: Template Questions (personal info filtered out) ---- */
                          surveyQuestions.length > 0 ? (
                          <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
                              Survey Questions
                            </h2>

                            {surveyQuestions.map((q, index) => {
                              const questionText = q.label || q.text?.question || q.question || '';
                              const questionType = q.type || q.text?.type || 'text';
                              const questionOptions = q.options || q.text?.options || [];
                              const questionSubQuestions = q.subQuestions || q.text?.subQuestions || [];
                              const qId = q.id;
                              const isRequired = q.required ?? q.text?.required ?? true;
                              const isInvalid = !!invalidFields[`question_${qId}`];

                              return (
                                <div key={qId} id={`field-question_${qId}`} style={fieldGroupStyle}>
                                  <label style={labelStyle}>
                                    <span style={{ color: '#E67E22', fontWeight: '700' }}>{index + 1}.</span>{' '}
                                    {questionText} {isRequired && <span style={{ color: '#E67E22' }}>*</span>}
                                  </label>

                                  {['text', 'email', 'url'].includes(questionType) && (
                                    <>
                                      <input
                                        type={questionType === 'text' ? 'text' : questionType}
                                        value={templateResponses[qId] || ''}
                                        onChange={(e) => {
                                          setTemplateResponses({ ...templateResponses, [qId]: e.target.value });
                                          if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                        }}
                                        placeholder="Enter your response..."
                                        style={isInvalid ? invalidInputStyle : inputStyle}
                                      />
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>This field is required.</span>}
                                    </>
                                  )}

                                  {questionType === 'textarea' && (
                                    <>
                                      <textarea
                                        value={templateResponses[qId] || ''}
                                        onChange={(e) => {
                                          setTemplateResponses({ ...templateResponses, [qId]: e.target.value });
                                          if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                        }}
                                        rows={5}
                                        placeholder="Enter your detailed response..."
                                        style={{ ...(isInvalid ? invalidInputStyle : inputStyle), resize: 'vertical', fontFamily: 'inherit' }}
                                      />
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>This field is required.</span>}
                                    </>
                                  )}

                                  {(questionType === 'numeric' || questionType === 'number') && (
                                    <>
                                      <input
                                        type="number"
                                        value={templateResponses[qId] || ''}
                                        onChange={(e) => {
                                          setTemplateResponses({ ...templateResponses, [qId]: e.target.value });
                                          if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                        }}
                                        placeholder="Enter a number"
                                        style={isInvalid ? invalidInputStyle : inputStyle}
                                      />
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>This field is required.</span>}
                                    </>
                                  )}

                                  {questionType === 'date' && (
                                    <>
                                      <input
                                        type="date"
                                        value={templateResponses[qId] || ''}
                                        onChange={(e) => {
                                          setTemplateResponses({ ...templateResponses, [qId]: e.target.value });
                                          if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                        }}
                                        style={isInvalid ? invalidInputStyle : inputStyle}
                                      />
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>This field is required.</span>}
                                    </>
                                  )}

                                  {questionType === 'boolean' && (
                                    <>
                                      <div style={{ display: 'flex', gap: '1rem' }}>
                                        {['Yes', 'No'].map((opt) => (
                                          <label key={opt} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer',
                                            border: templateResponses[qId] === (opt === 'Yes')
                                              ? '2px solid #E67E22' : '1px solid #E5E7EB',
                                            backgroundColor: templateResponses[qId] === (opt === 'Yes')
                                              ? '#FFF7ED' : '#fff',
                                          }}>
                                            <input type="radio" name={`question_${qId}`} value={opt}
                                              checked={templateResponses[qId] === (opt === 'Yes')}
                                              onChange={() => {
                                                setTemplateResponses({ ...templateResponses, [qId]: opt === 'Yes' });
                                                if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                              }}
                                              style={{ accentColor: '#E67E22' }}
                                            />
                                            <span>{opt}</span>
                                          </label>
                                        ))}
                                      </div>
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>This field is required.</span>}
                                    </>
                                  )}

                                  {questionType === 'rating' && (
                                    <>
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        {[1, 2, 3, 4, 5].map((n) => (
                                          <button key={n} type="button" onClick={() => {
                                            setTemplateResponses({ ...templateResponses, [qId]: n });
                                            if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                          }} style={{
                                            width: '48px', height: '48px', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 600,
                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                            border: templateResponses[qId] === n ? '2px solid #E67E22' : '1px solid #E5E7EB',
                                            backgroundColor: templateResponses[qId] === n ? '#E67E22' : '#fff',
                                            color: templateResponses[qId] === n ? '#fff' : '#6B7280',
                                          }}>
                                            {n}
                                          </button>
                                        ))}
                                      </div>
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Please select a rating.</span>}
                                    </>
                                  )}

                                  {(['choice', 'radio', 'select'].includes(questionType)) && questionOptions.length > 0 && (
                                    <>
                                      <div style={{
                                        display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                        ...(isInvalid ? { border: '1.5px solid #ef4444', borderRadius: '8px', padding: '0.5rem', backgroundColor: '#fef2f2' } : {}),
                                      }}>
                                        {questionOptions.map((option) => (
                                          <label key={option} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.65rem',
                                            padding: '0.6rem 0.85rem', borderRadius: '8px',
                                            border: templateResponses[qId] === option ? '2px solid #E67E22' : '1px solid #E5E7EB',
                                            backgroundColor: templateResponses[qId] === option ? '#FFF7ED' : '#fff',
                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                          }}>
                                            <input
                                              type="radio"
                                              name={`question_${qId}`}
                                              value={option}
                                              checked={templateResponses[qId] === option}
                                              onChange={(e) => {
                                                setTemplateResponses({ ...templateResponses, [qId]: e.target.value });
                                                if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                              }}
                                              style={{ accentColor: '#E67E22' }}
                                            />
                                            <span style={{ fontSize: '0.92rem', color: '#111827' }}>{option}</span>
                                          </label>
                                        ))}
                                      </div>
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Please select an option.</span>}
                                    </>
                                  )}

                                  {(['multiselect', 'checkbox'].includes(questionType)) && questionOptions.length > 0 && (
                                    <>
                                      <div style={{
                                        display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                        ...(isInvalid ? { border: '1.5px solid #ef4444', borderRadius: '8px', padding: '0.5rem', backgroundColor: '#fef2f2' } : {}),
                                      }}>
                                        {questionOptions.map((option) => (
                                          <label key={option} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.65rem',
                                            padding: '0.6rem 0.85rem', borderRadius: '8px',
                                            border: (templateResponses[qId] || []).includes(option) ? '2px solid #E67E22' : '1px solid #E5E7EB',
                                            backgroundColor: (templateResponses[qId] || []).includes(option) ? '#FFF7ED' : '#fff',
                                            cursor: 'pointer', transition: 'all 0.15s ease',
                                          }}>
                                            <input
                                              type="checkbox"
                                              value={option}
                                              checked={(templateResponses[qId] || []).includes(option)}
                                              onChange={(e) => {
                                                const prev = templateResponses[qId] || [];
                                                const updated = e.target.checked
                                                  ? [...prev, option]
                                                  : prev.filter((v) => v !== option);
                                                setTemplateResponses({ ...templateResponses, [qId]: updated });
                                                if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                              }}
                                              style={{ accentColor: '#E67E22' }}
                                            />
                                            <span style={{ fontSize: '0.92rem', color: '#111827' }}>{option}</span>
                                          </label>
                                        ))}
                                      </div>
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Please select at least one option.</span>}
                                    </>
                                  )}

                                  {questionType === 'yesno' && questionSubQuestions.length > 0 && (
                                    <>
                                      <table style={{
                                        width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem',
                                        ...(isInvalid ? { border: '1.5px solid #ef4444', borderRadius: '8px' } : {}),
                                      }}>
                                        <thead>
                                          <tr>
                                            <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', borderBottom: '1px solid #E5E7EB', width: '60%' }}></th>
                                            <th style={{ textAlign: 'center', padding: '0.4rem 0.5rem', borderBottom: '1px solid #E5E7EB' }}>Yes</th>
                                            <th style={{ textAlign: 'center', padding: '0.4rem 0.5rem', borderBottom: '1px solid #E5E7EB' }}>No</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {questionSubQuestions.map((sub, sIdx) => (
                                            <tr key={sIdx} style={{ backgroundColor: sIdx % 2 === 0 ? '#F9FAFB' : 'transparent' }}>
                                              <td style={{ padding: '0.5rem', color: '#111827' }}>{sub}</td>
                                              <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                                                <input
                                                  type="radio"
                                                  name={`question_${qId}_${sIdx}`}
                                                  value="yes"
                                                  checked={(templateResponses[qId]?.[sIdx]) === 'yes'}
                                                  onChange={() => {
                                                    const prev = templateResponses[qId] || {};
                                                    setTemplateResponses({ ...templateResponses, [qId]: { ...prev, [sIdx]: 'yes' } });
                                                    if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                                  }}
                                                  style={{ accentColor: '#E67E22' }}
                                                />
                                              </td>
                                              <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                                                <input
                                                  type="radio"
                                                  name={`question_${qId}_${sIdx}`}
                                                  value="no"
                                                  checked={(templateResponses[qId]?.[sIdx]) === 'no'}
                                                  onChange={() => {
                                                    const prev = templateResponses[qId] || {};
                                                    setTemplateResponses({ ...templateResponses, [qId]: { ...prev, [sIdx]: 'no' } });
                                                    if (isInvalid) setInvalidFields((p) => ({ ...p, [`question_${qId}`]: false }));
                                                  }}
                                                  style={{ accentColor: '#E67E22' }}
                                                />
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                      {isInvalid && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Please answer all sub-questions.</span>}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          ) : null
                        ) : (
                          /* ---- Section: Default Initiative Feedback ---- */
                          <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
                              Initiative Feedback
                            </h2>

                            {/* Rating question */}
                            <div style={fieldGroupStyle}>
                              <label style={labelStyle}>
                                <span style={{ color: '#E67E22', fontWeight: '700' }}>1.</span>{' '}
                                How do you like your initiative? <span style={{ color: '#E67E22' }}>*</span>
                              </label>
                              <p style={{ fontSize: '0.82rem', color: '#9CA3AF', marginBottom: '0.65rem' }}>
                                Select the option that best describes your experience.
                              </p>
                              <div id="field-initiativeRating" style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                ...(invalidFields.initiativeRating ? { border: '1.5px solid #ef4444', borderRadius: '8px', padding: '0.5rem', backgroundColor: '#fef2f2' } : {}),
                              }}>
                                {ratingOptions.map((option) => (
                                  <label
                                    key={option.value}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '0.65rem',
                                      padding: '0.6rem 0.85rem', borderRadius: '8px',
                                      border: initiativeRating === option.value ? '2px solid #E67E22' : '1px solid #E5E7EB',
                                      backgroundColor: initiativeRating === option.value ? '#FFF7ED' : '#fff',
                                      cursor: 'pointer', transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <input
                                      type="radio"
                                      name="initiativeRating"
                                      value={option.value}
                                      checked={initiativeRating === option.value}
                                      onChange={(e) => {
                                        setInitiativeRating(e.target.value);
                                        if (invalidFields.initiativeRating) setInvalidFields((p) => ({ ...p, initiativeRating: false }));
                                      }}
                                      style={{ accentColor: '#E67E22' }}
                                    />
                                    <span style={{ fontSize: '1.15rem' }}>{option.emoji}</span>
                                    <span style={{ fontSize: '0.92rem', color: '#111827' }}>{option.label}</span>
                                  </label>
                                ))}
                              </div>
                              {invalidFields.initiativeRating && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Please select a rating.</span>}
                            </div>

                            {/* Additional comments */}
                            <div style={fieldGroupStyle}>
                              <label style={labelStyle}>
                                <span style={{ color: '#E67E22', fontWeight: '700' }}>2.</span>{' '}
                                Additional Comments
                              </label>
                              <textarea
                                placeholder="Share any additional thoughts or suggestions..."
                                value={initiativeComments}
                                onChange={(e) => setInitiativeComments(e.target.value)}
                                rows={4}
                                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                              />
                            </div>
                          </div>
                        )}
                      </fieldset>

                      {/* ---- Submit Button ---- */}
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleReset}
                          className="btn-outline"
                          disabled={isSubmitting}
                        >
                          Clear Form
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
                          {isSubmitting ? 'Submitting...' : 'Submit Survey'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
