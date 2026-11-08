'use client';

import PageLayout from '@/components/PageLayout';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';
import {
  DEFAULT_IMPORT_ORDER,
  getImportFileType,
  inferImportTable,
  sortBatchFilesForExecution,
  summarizeBatchResults,
} from '@/lib/import-batch';

const STEPS = ['upload', 'review', 'result'];

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result ?? '');
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`));
    reader.readAsText(file);
  });
}

function readDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function collectEntryFiles(entry) {
  if (!entry) return [];

  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file((file) => resolve([file]), reject);
    });
  }

  if (!entry.isDirectory) {
    return [];
  }

  const reader = entry.createReader();
  const collected = [];

  while (true) {
    const entries = await readDirectoryEntries(reader);
    if (!entries.length) break;

    for (const child of entries) {
      const nestedFiles = await collectEntryFiles(child);
      collected.push(...nestedFiles);
    }
  }

  return collected;
}

async function collectDroppedFiles(dataTransfer) {
  const items = Array.from(dataTransfer?.items ?? []);
  if (!items.length) {
    return Array.from(dataTransfer?.files ?? []);
  }

  const batches = await Promise.all(items.map(async (item) => {
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
    if (entry) {
      return collectEntryFiles(entry);
    }

    const file = item.getAsFile?.();
    return file ? [file] : [];
  }));

  return batches.flat();
}

function buildFileId(file, index) {
  return `${file.name}-${file.lastModified}-${index}`;
}

function FormatGuide({ tables }) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('instructions');

  const sectionBtn = (key, label) => ({
    padding: '0.4rem 0.85rem',
    fontSize: '0.8rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    borderRadius: '6px',
    backgroundColor: activeSection === key ? '#E67E22' : '#F3F4F6',
    color: activeSection === key ? '#fff' : '#6B7280',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{
      border: '1px solid #E5E7EB',
      borderRadius: '10px',
      backgroundColor: '#FAFBFC',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          border: 'none',
          cursor: 'pointer',
          backgroundColor: 'transparent',
          fontSize: '0.9rem',
          fontWeight: 700,
          color: '#111827',
        }}
      >
        <span>Import Format Guide</span>
        <span style={{ color: '#9CA3AF', fontSize: '0.85rem', fontWeight: 400 }}>
          {open ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 1rem 1rem' }}>
          {/* Section tabs */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button style={sectionBtn('instructions')} onClick={() => setActiveSection('instructions')}>Instructions</button>
            <button style={sectionBtn('examples')} onClick={() => setActiveSection('examples')}>Examples</button>
            <button style={sectionBtn('tables')} onClick={() => setActiveSection('tables')}>Table Schemas</button>
            <button style={sectionBtn('order')} onClick={() => setActiveSection('order')}>Import Order</button>
          </div>

          {/* Instructions */}
          {activeSection === 'instructions' && (
            <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.7 }}>
              <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li>Use <strong>one file per table</strong>.</li>
                <li>Name files after the target table when possible (e.g. <code style={{ backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 4 }}>initiative.csv</code>).</li>
                <li>CSV files must have the <strong>first row as column headers</strong>.</li>
                <li>JSON files must be an <strong>array of objects</strong> whose keys match column names.</li>
                <li>If a filename does not match a table, select the table manually before review.</li>
              </ol>
            </div>
          )}

          {/* Examples */}
          {activeSection === 'examples' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: '0.35rem' }}>CSV</div>
                <pre style={{
                  margin: 0,
                  padding: '0.85rem',
                  backgroundColor: '#1E293B',
                  color: '#E2E8F0',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  lineHeight: 1.5,
                  overflowX: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>
{`initiative_name,description
Community Wellness,"Tracks workshop participation."
STEM Family Night,"Measures event attendance."`}
                </pre>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', marginBottom: '0.35rem' }}>JSON</div>
                <pre style={{
                  margin: 0,
                  padding: '0.85rem',
                  backgroundColor: '#1E293B',
                  color: '#E2E8F0',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  lineHeight: 1.5,
                  overflowX: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>
{`[
  {
    "category_name": "community engagement",
    "description": "Programs focused on outreach."
  }
]`}
                </pre>
              </div>
            </div>
          )}

          {/* Table Schemas */}
          {activeSection === 'tables' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {tables.map((table) => {
                const requiredCols = table.columns.filter(c => c.required).map(c => c.name);
                return (
                  <div key={`schema-${table.name}`} style={{
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    padding: '0.65rem 0.85rem',
                    backgroundColor: '#fff',
                  }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>
                      {table.label} <code style={{ fontWeight: 400, color: '#6B7280', fontSize: '0.8rem' }}>({table.name})</code>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: '0.25rem' }}>
                      <span style={{ fontWeight: 600, color: '#374151' }}>Required:</span>{' '}
                      {requiredCols.length
                        ? requiredCols.map(n => <code key={`${table.name}-${n}`} style={{ backgroundColor: '#FEF3C7', padding: '1px 4px', borderRadius: 3, marginRight: 4, fontSize: '0.78rem' }}>{n}</code>)
                        : <span style={{ fontStyle: 'italic' }}>none</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#9CA3AF', marginTop: '0.2rem', lineHeight: 1.5 }}>
                      All: {table.columns.map(c => (
                        <code key={`${table.name}-all-${c.name}`} style={{ marginRight: 4 }}>{c.name}</code>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Import Order */}
          {activeSection === 'order' && (
            <div>
              <p style={{ fontSize: '0.82rem', color: '#6B7280', margin: '0 0 0.5rem' }}>
                Import tables in this order to satisfy foreign key constraints:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {DEFAULT_IMPORT_ORDER.map((tableName, index) => (
                  <span key={`order-${tableName}`} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.3rem 0.65rem',
                    backgroundColor: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    color: '#374151',
                  }}>
                    <span style={{ fontWeight: 700, color: '#E67E22', fontSize: '0.75rem' }}>{index + 1}</span>
                    <code>{tableName}</code>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminImportPage() {
  const router = useRouter();
  const { user, hydrated } = useAuthStore();
  const fileInputRef = useRef(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (!hydrated) return;
    if (!user) { router.push('/login'); return; }
    if (user.user_type !== 'admin') { router.push('/dashboard'); }
  }, [router, user, hydrated]);

  const [tables, setTables] = useState([]);
  const [step, setStep] = useState('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflictMode, setConflictMode] = useState('skip');
  const [stagedFiles, setStagedFiles] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);
  const [batchResult, setBatchResult] = useState(null);
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    if (!user || user.user_type !== 'admin') return;
    apiFetch('/api/admin/import')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setTables(data.tables);
        } else {
          setError(data.error || 'Failed to load available tables');
        }
      })
      .catch((err) => setError('Failed to connect to import API: ' + err.message));
  }, [user]);

  const tableOptions = tables.length ? tables.map((table) => table.name) : DEFAULT_IMPORT_ORDER;
  const tableMeta = new Map(tables.map((table) => [table.name, table]));

  async function stageFiles(fileList) {
    if (!fileList?.length) return;

    setLoading(true);
    setError('');

    try {
      const nextFiles = await Promise.all(fileList.map(async (file, index) => {
        const fileType = getImportFileType(file.name);
        const inferredTable = inferImportTable(file.name, tableOptions);
        const id = buildFileId(file, index);

        if (!fileType) {
          return {
            id,
            fileName: file.name,
            fileType: null,
            fileContent: '',
            inferredTable,
            targetTable: inferredTable ?? '',
            stagingError: 'Unsupported file type. Use .csv or .json.',
          };
        }

        try {
          const fileContent = await readFileAsText(file);
          return {
            id,
            fileName: file.name,
            fileType,
            fileContent,
            inferredTable,
            targetTable: inferredTable ?? '',
            stagingError: '',
          };
        } catch (readError) {
          return {
            id,
            fileName: file.name,
            fileType,
            fileContent: '',
            inferredTable,
            targetTable: inferredTable ?? '',
            stagingError: readError.message,
          };
        }
      }));

      setStagedFiles(nextFiles);
      setReviewItems([]);
      setBatchResult(null);
      setStep('upload');
    } catch (stageError) {
      setError(stageError.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleFileSelect(event) {
    const selectedFiles = Array.from(event.target.files ?? []);
    stageFiles(selectedFiles);
  }

  async function handleDrop(event) {
    event.preventDefault();
    setDropActive(false);
    const droppedFiles = await collectDroppedFiles(event.dataTransfer);
    stageFiles(droppedFiles);
  }

  function updateStagedFile(fileId, updates) {
    setStagedFiles((current) => current.map((file) => (
      file.id === fileId ? { ...file, ...updates } : file
    )));
  }

  function updateReviewItem(fileId, updater) {
    setReviewItems((current) => current.map((item) => (
      item.id === fileId ? updater(item) : item
    )));
  }

  async function handlePreviewBatch() {
    if (!stagedFiles.length) {
      setError('Please add at least one file.');
      return;
    }

    const blockingStagedFile = stagedFiles.find((file) => file.stagingError || !file.targetTable);
    if (blockingStagedFile) {
      setError(blockingStagedFile.stagingError || `Choose a target table for "${blockingStagedFile.fileName}".`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const previewPlan = sortBatchFilesForExecution(stagedFiles, DEFAULT_IMPORT_ORDER);
      const nextReviewItems = [];

      for (const file of previewPlan) {
        try {
          const response = await apiFetch('/api/admin/import?action=preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: file.targetTable,
              fileContent: file.fileContent,
              fileType: file.fileType,
              conflictMode,
            }),
          });
          const data = await response.json();

          if (!response.ok) {
            nextReviewItems.push({
              id: file.id,
              fileName: file.fileName,
              fileType: file.fileType,
              fileContent: file.fileContent,
              table: file.targetTable,
              status: 'error',
              error: data.error || 'Preview failed',
              previewRows: [],
              fileColumns: [],
              dbColumns: [],
              columnMapping: {},
              totalRows: 0,
            });
            continue;
          }

          nextReviewItems.push({
            id: file.id,
            fileName: file.fileName,
            fileType: file.fileType,
            fileContent: file.fileContent,
            table: file.targetTable,
            status: 'ready',
            error: '',
            previewRows: data.previewRows ?? [],
            fileColumns: data.fileColumns ?? [],
            dbColumns: data.dbColumns ?? [],
            columnMapping: data.autoMapping ?? {},
            totalRows: data.totalRows ?? 0,
            previewToken: data.previewToken,
          });
        } catch (requestError) {
          nextReviewItems.push({
            id: file.id,
            fileName: file.fileName,
            fileType: file.fileType,
            fileContent: file.fileContent,
            table: file.targetTable,
            status: 'error',
            error: requestError.message,
            previewRows: [],
            fileColumns: [],
            dbColumns: [],
            columnMapping: {},
            totalRows: 0,
          });
        }
      }

      setReviewItems(nextReviewItems);
      setStep('review');

      if (nextReviewItems.some((item) => item.status !== 'ready')) {
        setError('Some files could not be previewed. Fix them before running the batch import.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteBatch() {
    const executableItems = reviewItems.filter((item) => item.status === 'ready');
    if (!executableItems.length) {
      setError('No previewed files are ready to import.');
      return;
    }

    if (reviewItems.some((item) => item.status !== 'ready')) {
      setError('Resolve all preview errors before executing the batch import.');
      return;
    }

    setLoading(true);
    setError('');

    const orderedItems = sortBatchFilesForExecution(executableItems, DEFAULT_IMPORT_ORDER);
    const fileResults = [];
    let halted = false;

    for (const item of orderedItems) {
      if (halted) {
        fileResults.push({
          id: item.id,
          fileName: item.fileName,
          table: item.table,
          state: 'not_run',
          success: false,
          totalRows: item.totalRows ?? 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          validationErrors: ['Not run because a previous file failed.'],
        });
        continue;
      }

      try {
        const response = await apiFetch('/api/admin/import?action=execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: item.table,
            fileContent: item.fileContent,
            fileType: item.fileType,
            conflictMode,
            columnMapping: item.columnMapping,
            previewToken: item.previewToken,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          fileResults.push({
            id: item.id,
            fileName: item.fileName,
            table: item.table,
            state: 'failed',
            success: false,
            totalRows: data.totalRows ?? item.totalRows ?? 0,
            inserted: data.inserted ?? 0,
            updated: data.updated ?? 0,
            skipped: data.skipped ?? 0,
            validationErrors: data.validationErrors ?? (data.error ? [data.error] : ['Import failed']),
          });
          halted = true;
          continue;
        }

        fileResults.push({
          id: item.id,
          fileName: item.fileName,
          table: item.table,
          state: 'completed',
          success: true,
          totalRows: data.totalRows ?? item.totalRows ?? 0,
          inserted: data.inserted ?? 0,
          updated: data.updated ?? 0,
          skipped: data.skipped ?? 0,
          validationErrors: data.validationErrors ?? [],
        });
      } catch (requestError) {
        fileResults.push({
          id: item.id,
          fileName: item.fileName,
          table: item.table,
          state: 'failed',
          success: false,
          totalRows: item.totalRows ?? 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          validationErrors: [requestError.message],
        });
        halted = true;
      }
    }

    const summary = summarizeBatchResults(fileResults.filter((item) => item.state !== 'not_run'));
    setBatchResult({
      success: fileResults.every((item) => item.state === 'completed'),
      summary,
      files: fileResults,
    });
    setStep('result');
    setLoading(false);
  }

  function handleReset() {
    setStep('upload');
    setError('');
    setConflictMode('skip');
    setStagedFiles([]);
    setReviewItems([]);
    setBatchResult(null);
    setDropActive(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (!isMounted || !user || user.user_type !== 'admin') return null;

  const inputSt = {
    width: '100%',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '9px 14px',
    fontSize: '0.9rem',
    outline: 'none',
    backgroundColor: 'white',
    boxSizing: 'border-box',
  };

  const labelSt = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: '600',
    marginBottom: '0.35rem',
    color: '#374151',
  };

  const hasBlockingStagedFiles = stagedFiles.some((file) => file.stagingError || !file.targetTable);
  const readyReviewCount = reviewItems.filter((item) => item.status === 'ready').length;

  return (
    <PageLayout title="Data Import">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {STEPS.map((stepName, index) => (
          <div
            key={stepName}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: step === stepName ? 700 : 500,
              backgroundColor: step === stepName ? '#E67E22' : '#F3F4F6',
              color: step === stepName ? 'white' : '#6B7280',
            }}
          >
            {index + 1}. {stepName.charAt(0).toUpperCase() + stepName.slice(1)}
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          color: '#DC2626',
          marginBottom: '1rem',
          fontSize: '0.9rem',
        }}>
          {error}
        </div>
      )}

      {step === 'upload' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-header">
            <h2 className="card-title">Upload Configuration</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
            <div>
              <label style={labelSt}>Conflict Mode</label>
              <select
                value={conflictMode}
                onChange={(event) => setConflictMode(event.target.value)}
                style={inputSt}
              >
                <option value="skip">Skip duplicates</option>
                <option value="fail">Fail on any conflict</option>
                <option value="upsert">Upsert (update or insert)</option>
              </select>
              <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.3rem' }}>
                {conflictMode === 'skip' && 'Rows that conflict with existing data will be silently skipped.'}
                {conflictMode === 'fail' && 'The entire import will be rejected if any row conflicts.'}
                {conflictMode === 'upsert' && 'Existing rows will be updated; new rows will be inserted.'}
              </p>
            </div>

            <div>
              <label style={labelSt}>Files or Folder</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDropActive(false);
                }}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dropActive ? '#E67E22' : '#E5E7EB'}`,
                  borderRadius: '12px',
                  padding: '2.5rem 2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: dropActive ? '#FEF9F0' : '#F9FAFB',
                  transition: 'border-color 0.2s, background-color 0.2s',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem', color: stagedFiles.length ? '#E67E22' : '#9CA3AF' }}>
                  &#8679;
                </div>
                <p style={{ margin: 0, fontWeight: '600', color: '#374151' }}>
                  {stagedFiles.length
                    ? `${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''} staged`
                    : 'Click to select or drag & drop multiple import files'}
                </p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#9CA3AF' }}>
                  Supports .csv and .json. You can also drop a folder of import files.
                </p>
              </div>
            </div>

            <FormatGuide tables={tables} />

            {stagedFiles.length > 0 && (
              <div className="card" style={{ padding: '1rem' }}>
                <div className="card-header">
                  <h3 className="card-title" style={{ fontSize: '0.95rem' }}>Staged Files</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                  {stagedFiles.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        border: '1px solid #E5E7EB',
                        borderRadius: '10px',
                        padding: '0.85rem 1rem',
                        backgroundColor: file.stagingError ? '#FEF2F2' : 'white',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{file.fileName}</div>
                          <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                            {file.fileType ? file.fileType.toUpperCase() : 'Unsupported'} file
                            {file.inferredTable ? ` • inferred table: ${file.inferredTable}` : ' • table not inferred from filename'}
                          </div>
                        </div>
                        <div style={{ minWidth: '220px', flex: '1 1 220px' }}>
                          <select
                            value={file.targetTable}
                            onChange={(event) => updateStagedFile(file.id, { targetTable: event.target.value })}
                            style={inputSt}
                            disabled={!!file.stagingError}
                          >
                            <option value="">-- Select a table --</option>
                            {tables.map((table) => (
                              <option key={table.name} value={table.name}>
                                {table.label} ({table.name})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {file.stagingError && (
                        <div style={{ color: '#DC2626', fontSize: '0.8rem' }}>{file.stagingError}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={handlePreviewBatch}
                disabled={loading || !stagedFiles.length || hasBlockingStagedFiles}
                className="btn-primary"
                style={{ opacity: (loading || !stagedFiles.length || hasBlockingStagedFiles) ? 0.5 : 1 }}
              >
                {loading ? 'Preparing Review...' : `Review ${stagedFiles.length || ''} Import${stagedFiles.length === 1 ? '' : 's'}`}
              </button>

              {stagedFiles.length > 0 && (
                <button onClick={handleReset} className="btn-outline" disabled={loading}>
                  Clear Files
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <span style={{ fontWeight: 600, color: '#111827' }}>
                {reviewItems.length} file{reviewItems.length !== 1 ? 's' : ''} reviewed
              </span>
              <span style={{ color: '#6B7280', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                {readyReviewCount} ready for import
              </span>
            </div>
            <button onClick={() => setStep('upload')} className="btn-outline">
              Back
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {reviewItems.map((item) => (
              <div key={item.id} className="card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{item.fileName}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      {tableMeta.get(item.table)?.label || item.table} ({item.table}) • {item.totalRows} row{item.totalRows !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{
                    padding: '0.3rem 0.7rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: item.status === 'ready' ? '#DCFCE7' : '#FEE2E2',
                    color: item.status === 'ready' ? '#166534' : '#B91C1C',
                    alignSelf: 'flex-start',
                  }}>
                    {item.status === 'ready' ? 'Ready' : 'Needs attention'}
                  </div>
                </div>

                {item.status !== 'ready' && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '8px',
                    color: '#DC2626',
                    fontSize: '0.85rem',
                  }}>
                    {item.error}
                  </div>
                )}

                {item.status === 'ready' && (
                  <>
                    <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <div className="card-header">
                        <h3 className="card-title" style={{ fontSize: '0.95rem' }}>Column Mapping</h3>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.5rem', marginTop: '0.75rem' }}>
                        {item.fileColumns.map((fileColumn) => (
                          <div key={`${item.id}-${fileColumn}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>
                              {fileColumn}
                            </span>
                            <span style={{ color: '#9CA3AF', fontSize: '0.8rem' }}>&rarr;</span>
                            <select
                              value={item.columnMapping[fileColumn] || '__skip__'}
                              onChange={(event) => {
                                const value = event.target.value;
                                updateReviewItem(item.id, (current) => ({
                                  ...current,
                                  columnMapping: {
                                    ...current.columnMapping,
                                    [fileColumn]: value,
                                  },
                                }));
                              }}
                              style={{ border: '1px solid #E5E7EB', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.8rem', flex: 1, outline: 'none', backgroundColor: 'white' }}
                            >
                              <option value="__skip__">(skip this column)</option>
                              {item.dbColumns.map((dbColumn) => (
                                <option key={`${item.id}-${dbColumn.name}`} value={dbColumn.name}>
                                  {dbColumn.name}{dbColumn.required ? ' *' : ''} ({dbColumn.type})
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="data-table" style={{ fontSize: '0.8rem' }}>
                          <thead>
                            <tr>
                              <th>#</th>
                              {item.fileColumns.map((column) => (
                                <th key={`${item.id}-${column}`}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {item.previewRows.map((row, index) => (
                              <tr key={`${item.id}-row-${index}`}>
                                <td style={{ color: '#9CA3AF' }}>{index + 1}</td>
                                {item.fileColumns.map((column) => (
                                  <td key={`${item.id}-${column}-${index}`} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {row[column] !== null && row[column] !== undefined ? String(row[column]) : ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleExecuteBatch}
              disabled={loading || reviewItems.some((item) => item.status !== 'ready')}
              className="btn-primary"
              style={{ opacity: (loading || reviewItems.some((item) => item.status !== 'ready')) ? 0.5 : 1 }}
            >
              {loading ? 'Importing Batch...' : `Import ${readyReviewCount} File${readyReviewCount === 1 ? '' : 's'}`}
            </button>
            <button onClick={() => setStep('upload')} className="btn-outline" disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'result' && batchResult && (
        <div>
          <div style={{
            padding: '1.5rem',
            borderRadius: '12px',
            backgroundColor: batchResult.success ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${batchResult.success ? '#BBF7D0' : '#FECACA'}`,
            marginBottom: '1rem',
          }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', fontWeight: 700, color: batchResult.success ? '#166534' : '#DC2626' }}>
              {batchResult.success ? 'Batch Import Complete' : 'Batch Import Finished With Errors'}
            </h3>
            <div className="stats-row">
              <div className="stat-card" style={{ background: 'white' }}>
                <div className="stat-label">Files Run</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{batchResult.summary.totalFiles}</div>
              </div>
              <div className="stat-card" style={{ background: 'white' }}>
                <div className="stat-label">Rows Seen</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>{batchResult.summary.totalRows}</div>
              </div>
              <div className="stat-card" style={{ background: 'white' }}>
                <div className="stat-label">Inserted</div>
                <div className="stat-value" style={{ fontSize: '1.5rem', color: '#16A34A' }}>{batchResult.summary.inserted}</div>
              </div>
              <div className="stat-card" style={{ background: 'white' }}>
                <div className="stat-label">Skipped</div>
                <div className="stat-value" style={{ fontSize: '1.5rem', color: '#D97706' }}>{batchResult.summary.skipped}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1rem' }}>
            {batchResult.files.map((file) => (
              <div
                key={file.id}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '10px',
                  padding: '0.9rem 1rem',
                  backgroundColor: file.state === 'completed' ? '#F9FAFB' : '#FFF7ED',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{file.fileName}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      {tableMeta.get(file.table)?.label || file.table} ({file.table})
                    </div>
                  </div>
                  <div style={{
                    padding: '0.3rem 0.7rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: file.state === 'completed' ? '#DCFCE7' : file.state === 'not_run' ? '#E5E7EB' : '#FEE2E2',
                    color: file.state === 'completed' ? '#166534' : file.state === 'not_run' ? '#4B5563' : '#B91C1C',
                    alignSelf: 'flex-start',
                  }}>
                    {file.state === 'completed' ? 'Completed' : file.state === 'not_run' ? 'Not run' : 'Failed'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', color: '#374151' }}>
                  <span>Total rows: {file.totalRows ?? 0}</span>
                  <span>Inserted: {file.inserted ?? 0}</span>
                  <span>Updated: {file.updated ?? 0}</span>
                  <span>Skipped: {file.skipped ?? 0}</span>
                </div>

                {file.validationErrors?.length > 0 && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '8px',
                  }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#92400E', marginBottom: '0.35rem' }}>
                      Messages ({file.validationErrors.length})
                    </div>
                    {file.validationErrors.slice(0, 10).map((message, index) => (
                      <div key={`${file.id}-err-${index}`} style={{ fontSize: '0.78rem', color: '#92400E', padding: '0.1rem 0' }}>
                        {message}
                      </div>
                    ))}
                    {file.validationErrors.length > 10 && (
                      <div style={{ fontSize: '0.78rem', color: '#92400E', fontStyle: 'italic', marginTop: '0.2rem' }}>
                        ...and {file.validationErrors.length - 10} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={handleReset} className="btn-primary">
            Start Another Batch Import
          </button>
        </div>
      )}
    </PageLayout>
  );
}
