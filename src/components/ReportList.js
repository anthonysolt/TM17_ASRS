'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ReasonModal from '@/components/ReasonModal';
import PillSelect from '@/components/PillSelect';
import EntryCard, { InlineDeleteConfirm, entryButtonStyle } from '@/components/EntryCard';
import ReportDownloadOptions from '@/components/ReportDownloadOptions';
import { apiFetch } from '@/lib/api/client';
import { parseReportForDashboard } from '@/lib/report-snapshot';
import { REPORT_STATUS_OPTIONS, getReportStatusOption } from '@/lib/report-status';
import { downloadReport, openPrintWindow } from '@/lib/reports/report-export';

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Report entries as shown on the Reports page and an initiative's Reports tab: status dropdown, View, Edit (pop-up), Download
 * (pop-up) and Delete. Edits and deletes ask for a reason (audit log).
 *
 * Props:
 * - reports: report records from /api/reports
 * - showInitiative: include the initiative name in each entry's meta line
 * - getInitiativeName(initiativeId): fallback when a report has no initiative_name
 * - onChanged(): reload the reports after a change
 * - onNotify(message, type): show a success / 'error' message
 * - emptyState: shown when there are no reports
 */
export default function ReportList({ reports, showInitiative = true, getInitiativeName, onChanged, onNotify, emptyState = null }) {
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Edit pop-up
  const [editingReport, setEditingReport] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('completed');

  // Reason prompt shared by edit and delete
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Download pop-up
  const [downloadingReport, setDownloadingReport] = useState(null);
  const [popupDownloadFormat, setPopupDownloadFormat] = useState('pdf');
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [pdfDisplayMode, setPdfDisplayMode] = useState('both');
  const [pdfLayoutMode, setPdfLayoutMode] = useState('side-by-side');

  // Escape closes the download pop-up.
  useEffect(() => {
    if (!downloadingReport) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setDownloadingReport(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [downloadingReport]);

  // Lists don't include report snapshots, so a download first loads the report
  // (summary, charts, goals) and every current response row, then builds the file.
  async function handleDownload(report) {
    const format = popupDownloadFormat;
    // Pop-ups are only allowed during the click, so open the print window now.
    const printWindow = format === 'pdf' ? openPrintWindow() : null;
    setPreparingDownload(true);
    try {
      const [detailRes, rowsRes] = await Promise.all([
        apiFetch(`/api/reports/${report.id}`),
        apiFetch(`/api/reports/${report.id}/rows`),
      ]);
      const detail = await detailRes.json().catch(() => ({}));
      if (!detailRes.ok) throw new Error(detail.error || 'Could not load the report');
      const rowsBody = await rowsRes.json().catch(() => ({}));
      if (!rowsRes.ok) throw new Error(rowsBody.error || 'Could not load the report rows');

      const target = getRecordTarget(detail.report || report);
      if (!target.reportData) throw new Error('This report has no saved data to download.');
      target.reportData = { ...target.reportData, tableData: rowsBody.rows || [] };
      downloadReport(format, target, { displayMode: pdfDisplayMode, layoutMode: pdfLayoutMode, printWindow });
    } catch (err) {
      if (printWindow && !printWindow.closed) printWindow.close();
      onNotify?.(err.message || 'Could not prepare the download', 'error');
    } finally {
      setPreparingDownload(false);
    }
  }

  // A saved report (with its snapshot) as a download target.
  function getRecordTarget(report) {
    const { reportData: rd, trendData: td, initiative } = parseReportForDashboard(report);
    return {
      reportData: rd,
      trendData: td,
      initiative: { ...initiative, name: initiative?.name || report.initiative_name || getInitiativeName?.(report.initiative_id) },
      name: report.name,
    };
  }

  // Sends a report request; throws with the server's message (or `fallback`) when it fails.
  async function sendReportRequest(url, init, fallback) {
    const res = await apiFetch(url, init);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || fallback);
    }
  }

  async function updateReportStatus(reportId, newStatus) {
    const label = newStatus === 'completed' ? 'unpublished' : newStatus;
    try {
      await sendReportRequest('/api/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, status: newStatus }),
      }, `Failed to ${newStatus === 'completed' ? 'unpublish' : newStatus} report`);
    } catch (err) {
      onNotify?.(err.message || 'Connection error. Please try again.', 'error');
      return;
    }
    onNotify?.(`Report ${label} successfully`);
    // Reload outside the try: a failed reload must not report the change as failed.
    await onChanged?.();
  }

  function openEdit(report) {
    setEditingReport(report);
    setEditName(report.name || '');
    setEditDescription(report.description || '');
    setEditStatus(report.status || 'completed');
  }

  function closeEdit() {
    setEditingReport(null);
    setEditName('');
    setEditDescription('');
    setEditStatus('completed');
  }

  async function handleSaveEdit() {
    if (!editingReport) return;
    setPendingAction({ type: 'editReport', id: editingReport.id, name: editName, description: editDescription, status: editStatus });
    setShowReasonModal(true);
  }

  async function handleDelete(id) {
    setPendingAction({ type: 'deleteReport', id });
    setShowReasonModal(true);
  }

  const handleReasonSubmit = async ({ reasonType, reasonText }) => {
    setShowReasonModal(false);
    if (!pendingAction) return;
    setSaving(true);
    let succeeded = false;
    try {
      if (pendingAction.type === 'editReport') {
        await sendReportRequest('/api/reports', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pendingAction.id, name: pendingAction.name, description: pendingAction.description, status: pendingAction.status, reasonType, reasonText }),
        }, 'Failed to update report');
        onNotify?.('Report updated successfully');
        closeEdit();
      } else if (pendingAction.type === 'deleteReport') {
        const url = `/api/reports?id=${pendingAction.id}&reasonType=${encodeURIComponent(reasonType)}&reasonText=${encodeURIComponent(reasonText)}`;
        await sendReportRequest(url, { method: 'DELETE' }, 'Failed to delete report');
        onNotify?.('Report deleted');
        setDeletingId(null);
      }
      succeeded = true;
    } catch (err) {
      onNotify?.(err.message || 'Connection error. Please try again.', 'error');
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
    // Reload outside the try: a failed reload must not report the change as failed.
    if (succeeded) await onChanged?.();
  };

  return (
    <>
      {reports.length === 0 ? emptyState : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {reports.map((r) => (
          <EntryCard
            key={r.id}
            title={r.name}
            meta={[
              showInitiative && (r.initiative_name || getInitiativeName?.(r.initiative_id)),
              formatDate(r.created_at),
              r.created_by && `by ${r.created_by}`,
            ]}
            description={r.description}
            stats={[
              { label: 'Views', value: r.views },
              { label: 'Downloads', value: r.downloads },
            ]}
            status={(
              <PillSelect
                value={getReportStatusOption(r.status).value}
                options={REPORT_STATUS_OPTIONS}
                fallback={getReportStatusOption(r.status)}
                editable
                onChange={(next) => {
                  if (next === 'archived' && !confirm('Archive this report?')) return;
                  return updateReportStatus(r.id, next);
                }}
                ariaLabel={`Status for ${r.name || 'report'}`}
                title="Change status"
              />
            )}
          >
            <Link href={`/report-creation/${r.id}`} style={entryButtonStyle}>View</Link>
            <button type="button" onClick={() => openEdit(r)} style={entryButtonStyle}>Edit</button>
            <button type="button" onClick={() => { setPopupDownloadFormat('pdf'); setDownloadingReport(r); }} title="Download report" aria-label={`Download ${r.name || 'report'}`} aria-haspopup="dialog" style={{ ...entryButtonStyle, padding: '0.4rem 0.6rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <InlineDeleteConfirm
              confirming={deletingId === r.id}
              onStart={() => setDeletingId(r.id)}
              onConfirm={() => handleDelete(r.id)}
              onCancel={() => setDeletingId(null)}
              disabled={saving}
            />
          </EntryCard>
        ))}
      </div>
      )}

      {downloadingReport && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setDownloadingReport(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-report-title"
            className="card"
            style={{ width: '100%', maxWidth: '640px', margin: '1rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '2rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <h2 id="download-report-title" style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111827' }}>Download Report</h2>
                <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#6B7280' }}>
                  {downloadingReport.name || '(Untitled)'}
                </div>
              </div>
              <button
                type="button"
                className="row-icon-btn"
                aria-label="Close"
                title="Close"
                onClick={() => setDownloadingReport(null)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
            <ReportDownloadOptions
              displayMode={pdfDisplayMode}
              onDisplayModeChange={setPdfDisplayMode}
              layoutMode={pdfLayoutMode}
              onLayoutModeChange={setPdfLayoutMode}
              selectedFormat={popupDownloadFormat}
              onFormatChange={setPopupDownloadFormat}
              gap="1.5rem"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn-primary"
                disabled={preparingDownload}
                onClick={() => handleDownload(downloadingReport)}
                style={{ opacity: preparingDownload ? 0.6 : 1, cursor: preparingDownload ? 'wait' : 'pointer' }}
              >
                {preparingDownload ? 'Preparing…' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingReport && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', margin: '1rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', color: '#111827' }}>Edit Report</h2>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: '#6B7280' }}>Report Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#F9FAFB', boxSizing: 'border-box', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#E67E22'} onBlur={(e) => e.target.style.borderColor = '#E5E7EB'} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: '#6B7280' }}>Description</label>
              <textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#F9FAFB', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#E67E22'} onBlur={(e) => e.target.style.borderColor = '#E5E7EB'} />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: '#6B7280' }}>Status</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '0.9rem', backgroundColor: '#F9FAFB' }}>
                {REPORT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={closeEdit} className="btn-outline" disabled={saving}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving || !editName.trim()} className="btn-primary" style={{ opacity: saving || !editName.trim() ? 0.5 : 1, cursor: saving || !editName.trim() ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReasonModal
        open={showReasonModal}
        onClose={() => { setShowReasonModal(false); setPendingAction(null); }}
        onSubmit={handleReasonSubmit}
        title={pendingAction?.type === 'deleteReport' ? 'Why are you deleting this report?' : pendingAction?.type === 'editReport' ? 'Why are you editing this report?' : undefined}
      />
    </>
  );
}
