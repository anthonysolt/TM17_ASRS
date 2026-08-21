// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT: QR Code Manager
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: UI component for generating, viewing, and managing QR codes
// Used by: Staff and Admin users to create QR codes for surveys/reports
// Requirements: Implements requirements 9f, 11 (QR code generation)
// ═══════════════════════════════════════════════════════════════════════════

'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api/client';

/**
 * QRCodeManager Component
 *
 * This component provides a complete interface for managing QR codes:
 * - Generate new QR codes for surveys or reports
 * - View generated QR codes with preview
 * - Download QR codes as PNG or SVG images
 * - View scan statistics and analytics
 * - Copy QR code URLs to clipboard
 *
 * @param {Object} props - Component props
 * @param {string} props.qrType - Type of QR code: 'survey', 'report', 'survey_template'
 * @param {number} props.targetId - Optional ID of the target entity
 * @param {boolean} props.showStats - Whether to display scan statistics (default: true)
 * @param {function} props.onQRGenerated - Optional callback when QR is generated
 */
export default function QRCodeManager({
  qrType = 'survey',
  targetId = null,
  showStats = true,
  onQRGenerated = null
}) {
  // ═══════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  // Current QR code data (null if not generated yet)
  const [qrCode, setQrCode] = useState(null);

  // Form input for QR code description
  const [description, setDescription] = useState('');

  // Form input for expiration date (optional)
  const [expiresAt, setExpiresAt] = useState('');

  // Loading state while API request is in progress
  const [loading, setLoading] = useState(false);

  // Error message if generation fails
  const [error, setError] = useState(null);

  // Success message after successful generation
  const [success, setSuccess] = useState(null);

  // Statistics data for the current QR code
  const [stats, setStats] = useState(null);

  // Loading state for statistics
  const [statsLoading, setStatsLoading] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════
  // SURVEY TEMPLATE SELECTION (NEW FEATURE!)
  // ═══════════════════════════════════════════════════════════════════════
  // List of available survey templates
  const [surveyTemplates, setSurveyTemplates] = useState([]);

  // Selected survey template ID (null = general survey)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  // Loading state for templates
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════
  // EFFECT: Load Survey Templates
  // ═══════════════════════════════════════════════════════════════════════
  // Fetch available survey templates when component mounts
  useEffect(() => {
    loadSurveyTemplates();
  }, []);

  // Function to load survey templates from API
  const loadSurveyTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const response = await fetch('/api/surveys/templates');
      if (!response.ok) {
        console.error('Failed to load survey templates');
        return;
      }

      const data = await response.json();
      // data should be an array of templates with id and title
      setSurveyTemplates(data || []);
    } catch (err) {
      console.error('Error loading survey templates:', err);
      // Don't show error to user - templates are optional
    } finally {
      setTemplatesLoading(false);
    }
  };

  // ┌─────────────────────────────────────────────────────────────────────┐
  // │ 🔒 ACCESS CONTROL PLACEHOLDER - FOR FUTURE IMPLEMENTATION           │
  // ├─────────────────────────────────────────────────────────────────────┤
  // │ This component should only be accessible to Staff and Admin users   │
  // │ per requirements 9f and 11.                                         │
  // │                                                                      │
  // │ TO IMPLEMENT:                                                        │
  // │ 1. Get current user from authentication context/localStorage        │
  // │    const user = getCurrentUser(); // or useAuth() hook              │
  // │                                                                      │
  // │ 2. Check if user has sufficient access level                        │
  // │    if (!user || user.access_rank < 50) {                            │
  // │      return (                                                        │
  // │        <div className="asrs-card p-6">                              │
  // │          <p className="text-red-600">                               │
  // │            Staff or Admin access required to generate QR codes.     │
  // │          </p>                                                        │
  // │        </div>                                                        │
  // │      );                                                              │
  // │    }                                                                 │
  // │                                                                      │
  // │ 3. Pass user ID to API for tracking                                 │
  // │    Include userId in the API request body                           │
  // └─────────────────────────────────────────────────────────────────────┘

  // ═══════════════════════════════════════════════════════════════════════
  // FUNCTION: Generate QR Code
  // ═══════════════════════════════════════════════════════════════════════
  // Calls the API to generate a new QR code
  // Updates component state with the generated QR code data
  const handleGenerateQR = async () => {
    // Clear previous messages
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (qrType === 'survey' && !selectedTemplateId) {
        throw new Error('Please select a survey template before generating a survey QR code.');
      }

      // ─────────────────────────────────────────────────────────────────
      // STEP 1: Prepare Request Body
      // ─────────────────────────────────────────────────────────────────
      // Determine QR type and target ID based on template selection
      const effectiveQrType = selectedTemplateId ? 'survey_template' : qrType;
      const effectiveTargetId = selectedTemplateId || targetId;

      const requestBody = {
        qrType: effectiveQrType,           // Type: survey, report, or survey_template
        targetId: effectiveTargetId,       // ID of target entity (template ID if selected)
        description: description.trim() || null,  // Optional description
        expiresAt: expiresAt || null,  // Optional expiration date
        // TODO: Add userId when authentication is implemented
        // userId: getCurrentUser()?.user_id
      };

      // ─────────────────────────────────────────────────────────────────
      // STEP 2: Call API to Generate QR Code
      // ─────────────────────────────────────────────────────────────────
      const response = await apiFetch('/api/qr-codes/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      // ─────────────────────────────────────────────────────────────────
      // STEP 3: Handle Response
      // ─────────────────────────────────────────────────────────────────
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate QR code');
      }

      // Save the generated QR code data to state
      setQrCode(data.qrCode);
      setSuccess('QR code generated successfully!');

      // Call callback if provided
      if (onQRGenerated) {
        onQRGenerated(data.qrCode);
      }

      // Load statistics for the new QR code
      if (showStats) {
        loadStats(data.qrCode.qrCodeKey);
      }

    } catch (err) {
      console.error('Error generating QR code:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // FUNCTION: Load QR Code Statistics
  // ═══════════════════════════════════════════════════════════════════════
  // Fetches scan statistics for a QR code from the API
  const loadStats = async (qrCodeKey) => {
    setStatsLoading(true);
    try {
      const response = await apiFetch(
        `/api/qr-codes/scan?qrCodeKey=${encodeURIComponent(qrCodeKey)}`
      );

      if (!response.ok) {
        throw new Error('Failed to load statistics');
      }

      const data = await response.json();
      setStats(data.stats);

    } catch (err) {
      console.error('Error loading QR code stats:', err);
      // Don't show error to user, stats are optional
    } finally {
      setStatsLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // FUNCTION: Download QR Code
  // ═══════════════════════════════════════════════════════════════════════
  // Downloads the QR code image in the specified format
  //
  // @param {string} format - 'png' or 'svg'
  // @param {number} size - Width in pixels (for PNG)
  const handleDownload = (format = 'png', size = 400) => {
    if (!qrCode) return;

    // Build download URL
    const downloadUrl = `/api/qr-codes/download?qrCodeKey=${encodeURIComponent(qrCode.qrCodeKey)}&format=${format}&size=${size}&download=true`;

    // Create temporary link and trigger download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `qrcode_${qrCode.qrCodeKey}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // FUNCTION: Copy URL to Clipboard
  // ═══════════════════════════════════════════════════════════════════════
  // Copies the QR code target URL to the clipboard
  const handleCopyUrl = async () => {
    if (!qrCode) return;

    try {
      await navigator.clipboard.writeText(qrCode.targetUrl);
      setSuccess('URL copied to clipboard!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      setError('Failed to copy URL to clipboard');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="asrs-card p-6">
      {/* ─────────────────────────────────────────────────────────────── */}
      {/* HEADER */}
      {/* ─────────────────────────────────────────────────────────────── */}
      <h2 className="text-2xl font-bold text-asrs-dark mb-4">
        QR Code Generator
      </h2>

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* ERROR/SUCCESS MESSAGES */}
      {/* ─────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* GENERATION FORM */}
      {/* ─────────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        {/* Survey Template Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-asrs-dark mb-2">
            Survey Template
          </label>
          <select
            value={selectedTemplateId || ''}
            onChange={(e) => setSelectedTemplateId(e.target.value || null)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-asrs-red focus:border-transparent"
            disabled={loading || templatesLoading}
          >
            <option value="">Select a survey template</option>
            {surveyTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title || `Survey Template #${template.id}`}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {selectedTemplateId
              ? '✓ QR code will link to the selected survey template'
              : 'A template selection is required for survey QR codes.'}
          </p>
        </div>

        {/* Description Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-asrs-dark mb-2">
            Description (Optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Spring 2024 Student Survey"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-asrs-red focus:border-transparent"
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">
            Optional label to help you identify this QR code later
          </p>
        </div>

        {/* Expiration Date Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-asrs-dark mb-2">
            Expiration Date (Optional)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-asrs-red focus:border-transparent"
            disabled={loading}
            min={new Date().toISOString().split('T')[0]}
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave empty for QR codes that never expire
          </p>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerateQR}
          disabled={loading}
          className="asrs-btn-primary w-full"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating...
            </span>
          ) : (
            'Generate QR Code'
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* QR CODE DISPLAY (shown after generation) */}
      {/* ─────────────────────────────────────────────────────────────── */}
      {qrCode && (
        <div className="border-t pt-6">
          <h3 className="text-xl font-semibold text-asrs-dark mb-4">
            Your QR Code
          </h3>

          {/* QR Code Preview */}
          <div className="bg-white p-6 rounded-md border border-gray-200 mb-4 text-center">
            <img
              src={qrCode.dataUrl}
              alt="QR Code"
              className="mx-auto"
              style={{ maxWidth: '300px', height: 'auto' }}
            />
          </div>

          {/* QR Code Details */}
          <div className="mb-4 p-4 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700 mb-2">
              <strong>QR Code ID:</strong> {qrCode.qrCodeKey}
            </p>
            <p className="text-sm text-gray-700 mb-2">
              <strong>Type:</strong> {qrCode.qrType}
              {qrCode.qrType === 'survey_template' && qrCode.targetId && (
                <span className="ml-2 text-green-600">
                  (Linked to Template #{qrCode.targetId})
                </span>
              )}
            </p>
            {qrCode.description && (
              <p className="text-sm text-gray-700 mb-2">
                <strong>Description:</strong> {qrCode.description}
              </p>
            )}
            <p className="text-sm text-gray-700 mb-2">
              <strong>Target URL:</strong>{' '}
              <a
                href={qrCode.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-asrs-red hover:underline break-all"
              >
                {qrCode.targetUrl}
              </a>
            </p>
            {qrCode.expiresAt && (
              <p className="text-sm text-gray-700">
                <strong>Expires:</strong>{' '}
                {new Date(qrCode.expiresAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <button
              onClick={() => handleDownload('png', 400)}
              className="asrs-btn-primary"
            >
              Download PNG (400px)
            </button>
            <button
              onClick={() => handleDownload('png', 800)}
              className="asrs-btn-primary"
            >
              Download PNG (800px)
            </button>
            <button
              onClick={() => handleDownload('svg')}
              className="asrs-btn-primary"
            >
              Download SVG
            </button>
          </div>

          <button
            onClick={handleCopyUrl}
            className="asrs-btn-secondary w-full mb-4"
          >
            Copy URL to Clipboard
          </button>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* STATISTICS SECTION */}
          {/* ─────────────────────────────────────────────────────────── */}
          {showStats && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold text-asrs-dark">
                  Scan Statistics
                </h4>
                <button
                  onClick={() => loadStats(qrCode.qrCodeKey)}
                  className="text-sm text-asrs-red hover:underline"
                  disabled={statsLoading}
                >
                  {statsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {stats ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Total Scans */}
                  <div className="bg-white p-4 rounded-md border border-gray-200 text-center">
                    <p className="text-3xl font-bold text-asrs-red">
                      {stats.totalScans}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">Total Scans</p>
                  </div>

                  {/* Conversions */}
                  <div className="bg-white p-4 rounded-md border border-gray-200 text-center">
                    <p className="text-3xl font-bold text-asrs-yellow">
                      {stats.conversions}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">Submissions</p>
                  </div>

                  {/* Conversion Rate */}
                  <div className="bg-white p-4 rounded-md border border-gray-200 text-center">
                    <p className="text-3xl font-bold text-green-600">
                      {stats.conversionRate}%
                    </p>
                    <p className="text-sm text-gray-600 mt-1">Conversion Rate</p>
                  </div>
                </div>
              ) : statsLoading ? (
                <p className="text-gray-500 text-center py-4">
                  Loading statistics...
                </p>
              ) : (
                <p className="text-gray-500 text-center py-4">
                  No scans yet. Share this QR code to start tracking!
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
