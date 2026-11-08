// Report downloads shared by the Reports page and the report lists on other
// pages: PDF (browser print window), CSV, HTML, and "XLSX" (tab-separated text
// saved with an .xlsx name, not a real spreadsheet file). A "target" is
// { reportData, trendData, initiative, name } (see parseReportForDashboard).

import { buildReportFileName } from '@/lib/download-filename';
import { buildGoalsCsvLines, buildGoalsHtmlTable, buildGoalsTsvLines } from '@/lib/goals/goal-display';

const LABEL_KEY_PRIORITY = ['label', 'name', 'category', 'platform', 'period', 'date', 'month', 'metric', 'type'];
const CHART_POINT_LIMIT = 12;

// CSV of the data table, followed by a "Goals" section when the report has goals.
export function buildCsvLines(rows, goals) {
  const lines = [];
  if (rows.length > 0) {
    const columns = Object.keys(rows[0]);
    lines.push(
      columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) =>
        columns.map((c) => {
          const val = row[c] == null ? '' : String(row[c]);
          return `"${val.replace(/"/g, '""')}"`;
        }).join(',')
      ),
    );
  }
  if (goals.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(...buildGoalsCsvLines(goals));
  }
  return lines;
}

export function formatLabel(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function escapeHtml(value) {
  return displayValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNumberOrNull(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function sortByPriority(values, priority) {
  return [...values].sort((a, b) => {
    const aIndex = priority.indexOf(a);
    const bIndex = priority.indexOf(b);
    const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    if (aRank !== bRank) return aRank - bRank;
    return String(a).localeCompare(String(b));
  });
}

function sortPoints(points) {
  return [...points].sort((a, b) => {
    const aValue = Math.abs(a.value);
    const bValue = Math.abs(b.value);
    if (aValue !== bValue) return bValue - aValue;
    return String(a.label).localeCompare(String(b.label));
  });
}

function getLabelKey(rows) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const orderedKeys = sortByPriority(keys, LABEL_KEY_PRIORITY);
  return orderedKeys.find((key) => rows.some((row) => typeof row[key] === 'string')) || orderedKeys[0];
}

function getSectionsFromArray(data, fallbackTitle) {
  const rows = data.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (!rows.length) return [];
  const labelKey = getLabelKey(rows);
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const numericKeys = keys.filter((key) => key !== labelKey && rows.some((row) => toNumberOrNull(row[key]) !== null));
  return sortByPriority(numericKeys, []).map((key) => {
    const title = numericKeys.length === 1
      ? (formatLabel(key) === 'Value' ? formatLabel(fallbackTitle) : formatLabel(key))
      : `${formatLabel(fallbackTitle)} \u2014 ${formatLabel(key)}`;
    return {
      title,
      points: sortPoints(
        rows.map((row, index) => ({
          label: row[labelKey] ?? `Item ${index + 1}`,
          value: toNumberOrNull(row[key]),
        })).filter((point) => point.value !== null)
      ),
    };
  }).filter((section) => section.points.length > 0);
}

function getSectionsFromObject(data, fallbackTitle) {
  const entries = Object.entries(data || {}).filter(([, value]) => value != null);
  if (!entries.length) return [];
  if (entries.every(([, value]) => toNumberOrNull(value) !== null)) {
    return [{
      title: formatLabel(fallbackTitle),
      points: sortPoints(
        entries.map(([label, value]) => ({ label, value: toNumberOrNull(value) })).filter((point) => point.value !== null)
      ),
    }];
  }
  if (entries.every(([, value]) => Array.isArray(value))) {
    return entries.flatMap(([key, value]) => getSectionsFromData(value, key));
  }
  if (entries.every(([, value]) => value && typeof value === 'object' && !Array.isArray(value))) {
    const numericKeys = [
      ...new Set(entries.flatMap(([, value]) => Object.keys(value).filter((key) => toNumberOrNull(value[key]) !== null))),
    ];
    return sortByPriority(numericKeys, []).map((key) => ({
      title: `${formatLabel(fallbackTitle)} \u2014 ${formatLabel(key)}`,
      points: sortPoints(
        entries.map(([label, value]) => ({ label, value: toNumberOrNull(value[key]) })).filter((point) => point.value !== null)
      ),
    })).filter((section) => section.points.length > 0);
  }
  return [];
}

function getSectionsFromData(data, fallbackTitle) {
  if (!data) return [];
  if (Array.isArray(data)) return getSectionsFromArray(data, fallbackTitle);
  if (typeof data === 'object') return getSectionsFromObject(data, fallbackTitle);
  return [];
}

function getChartSections(target) {
  const sections = [
    ...getSectionsFromData(target.reportData?.chartData, 'Charts'),
    ...getSectionsFromData(target.trendData, 'Trends'),
  ];
  const seen = new Set();
  return sections.filter((section) => {
    const key = `${section.title}:${section.points.map((point) => `${point.label}-${point.value}`).join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.title.localeCompare(b.title));
}

function buildChartsHtml(target) {
  const sections = getChartSections(target);
  if (!sections.length) {
    return '<div class="card"><h2>Charts</h2><p class="muted">No chart data available.</p></div>';
  }
  return `
    <div class="card">
      <h2>Charts</h2>
      ${sections.map((section) => {
        const visiblePoints = section.points.slice(0, CHART_POINT_LIMIT);
        const maxValue = Math.max(...visiblePoints.map((point) => Math.abs(point.value)), 0);
        const hiddenCount = section.points.length - visiblePoints.length;
        return `
          <section class="chart-block">
            <h3>${escapeHtml(section.title)}</h3>
            ${visiblePoints.map((point) => {
              const width = maxValue === 0 ? 0 : Math.max((Math.abs(point.value) / maxValue) * 100, 2);
              return `
                <div class="bar-row">
                  <div class="bar-label">${escapeHtml(point.label)}</div>
                  <div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div>
                  <div class="bar-value">${escapeHtml(point.value)}</div>
                </div>
              `;
            }).join('')}
            ${hiddenCount > 0 ? `<p class="muted">Showing first ${visiblePoints.length} of ${section.points.length} values.</p>` : ''}
          </section>
        `;
      }).join('')}
    </div>
  `;
}

function buildTableHtml(target) {
  const rows = Array.isArray(target.reportData?.tableData) ? target.reportData.tableData : [];
  if (!rows.length) {
    return '<div class="card"><h2>Data Table</h2><p class="muted">No table data available.</p></div>';
  }
  const normalizedRows = rows.map((row) =>
    row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row }
  );
  const columns = sortByPriority(
    [...new Set(normalizedRows.flatMap((row) => Object.keys(row)))],
    LABEL_KEY_PRIORITY
  );
  return `
    <div class="card">
      <h2>Data Table</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>${columns.map((column) => `<th>${escapeHtml(formatLabel(column))}</th>`).join('')}</tr></thead>
          <tbody>${normalizedRows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('\n')}</tbody>
        </table>
      </div>
    </div>
  `;
}

export function buildPdfHtml(fileName, target, { displayMode = 'both', layoutMode = 'side-by-side' } = {}) {
  const { reportData, initiative } = target;
  const showCharts = displayMode === 'charts' || displayMode === 'both';
  const showTable = displayMode === 'table' || displayMode === 'both';
  const contentClass = showCharts && showTable && layoutMode === 'side-by-side' ? 'split' : 'stack';

  const pdfStyles = [
    '@page{margin:0.55in}',
    '*{box-sizing:border-box}',
    'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff}',
    '.page{width:100%}',
    '.page-header{display:flex;justify-content:space-between;gap:1.5rem;align-items:flex-start;padding-bottom:1rem;margin-bottom:1rem;border-bottom:2px solid #111827}',
    '.eyebrow{margin:0 0 0.35rem;font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;color:#4b5563}',
    '.page-header h1{margin:0;font-size:1.7rem;line-height:1.2}',
    '.meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0.75rem;min-width:320px}',
    '.meta-item{border:1px solid #d1d5db;border-radius:10px;padding:0.75rem}',
    '.meta-item span{display:block;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;margin-bottom:0.25rem}',
    '.meta-item strong{font-size:0.95rem}',
    '.card{border:1px solid #d1d5db;border-radius:12px;padding:1rem;margin-bottom:1rem;break-inside:avoid}',
    '.card h2{margin:0 0 0.85rem;font-size:1.1rem}',
    '.card h3{margin:0 0 0.75rem;font-size:0.95rem}',
    '.card p{margin:0;line-height:1.5;font-size:0.92rem}',
    '.muted{color:#6b7280;font-size:0.82rem;margin-top:0.75rem}',
    '.content.split{display:block}',
    '.content.stack{display:block}',
    '.chart-block{padding:0.9rem 0;border-top:1px solid #e5e7eb}',
    '.chart-block:first-of-type{border-top:none;padding-top:0}',
    '.bar-row{display:grid;grid-template-columns:minmax(110px,180px) minmax(0,1fr) 72px;gap:0.75rem;align-items:center;margin-bottom:0.55rem}',
    '.bar-label,.bar-value{font-size:0.84rem}',
    '.bar-value{text-align:right;font-weight:600}',
    '.bar-track{width:100%;height:10px;border-radius:999px;background:#e5e7eb;overflow:hidden}',
    '.bar-fill{height:100%;border-radius:999px;background:#111827}',
    '.table-wrap{width:100%;overflow-x:auto}',
    'table{width:100%;border-collapse:collapse;font-size:0.75rem;table-layout:auto}',
    'th,td{border:1px solid #d1d5db;padding:0.4rem 0.5rem;text-align:left;vertical-align:top;white-space:nowrap}',
    'th{background:#f3f4f6;font-weight:700;white-space:nowrap}',
    'tr{break-inside:avoid}',
    '.goals-table td{white-space:normal}',
    '@media print{.page-header{break-inside:avoid}}',
  ].join('\n');

  const summaryHtml = reportData?.summary && typeof reportData.summary === 'object'
    ? `<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
        <div><strong>Total Participants:</strong> ${escapeHtml(reportData.summary.totalParticipants)}</div>
        <div><strong>Average Rating:</strong> ${escapeHtml(reportData.summary.averageRating)}/5</div>
        <div><strong>Completion Rate:</strong> ${escapeHtml(reportData.summary.completionRate)}%</div>
      </div>`
    : `<p>${escapeHtml(reportData?.summary || 'No summary available.')}</p>`;

  const explainabilityHtml = reportData?.explainability
    ? `<section class="card"><h2>Explainability</h2><p>${escapeHtml(reportData.explainability)}</p></section>`
    : '';

  const goalsHtml = reportData?.goals?.length
    ? `<section class="card"><h2>Goals</h2><div class="table-wrap">${buildGoalsHtmlTable(reportData.goals)}</div></section>`
    : '';

  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8" />',
    `<title>${escapeHtml(fileName)}</title>`,
    `<style>${pdfStyles}</style>`,
    '</head><body><div class="page">',
    '<header class="page-header"><div><p class="eyebrow">Report Export</p>',
    `<h1>${escapeHtml(initiative?.name || 'Report')}</h1></div>`,
    '<div class="meta-grid">',
    `<div class="meta-item"><span>Generated</span><strong>${escapeHtml(reportData?.generatedDate || 'N/A')}</strong></div>`,
    `<div class="meta-item"><span>Display</span><strong>${escapeHtml(formatLabel(displayMode))}</strong></div>`,
    `<div class="meta-item"><span>Layout</span><strong>${escapeHtml(showCharts && showTable ? formatLabel(layoutMode) : 'Single section')}</strong></div>`,
    `<div class="meta-item"><span>Initiative</span><strong>${escapeHtml(reportData?.initiativeName || initiative?.name || 'N/A')}</strong></div>`,
    '</div></header>',
    `<section class="card"><h2>Summary</h2>${summaryHtml}</section>`,
    goalsHtml,
    explainabilityHtml,
    `<section class="content ${contentClass}">`,
    showCharts ? buildChartsHtml(target) : '',
    showTable ? buildTableHtml(target) : '',
    '</section></div>',
    '<script>window.onload=function(){window.focus();window.print();window.onafterprint=function(){window.close();};};</script>',
    '</body></html>',
  ].join('\n');
}

/**
 * Opens the PDF print window. Browsers only allow pop-ups opened directly in a
 * click, so callers that fetch data first should call this in the click
 * handler and pass the window to downloadReport as pdfOptions.printWindow.
 */
export function openPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1200,height=900');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.writeln('<!DOCTYPE html><html><head><title>Preparing report…</title></head><body style="font-family:Arial,sans-serif;padding:2rem;color:#6b7280">Preparing the report…</body></html>');
    printWindow.document.close();
  }
  return printWindow;
}

function openPdfPrintWindow(htmlContent, existingWindow) {
  const printWindow = existingWindow && !existingWindow.closed
    ? existingWindow
    : window.open('', '_blank', 'width=1200,height=900');
  if (!printWindow) {
    // A pop-up blocker stopped the print window; say so instead of doing nothing.
    alert('Your browser blocked the PDF window. Allow pop-ups for this site, then try again.');
    return;
  }
  printWindow.document.open();
  printWindow.document.writeln(htmlContent);
  printWindow.document.close();
}

/**
 * Download `target` in `format` ('pdf' opens the print dialog). pdfOptions:
 * { displayMode: 'charts' | 'table' | 'both', layoutMode: 'side-by-side' | 'sequential',
 *   printWindow } — printWindow: a window from openPrintWindow() to print into.
 */
export function downloadReport(format, target, pdfOptions = {}) {
  const { reportData, initiative } = target;
  if (!reportData) {
    alert('This report has no saved data to download.');
    return;
  }
  const fileName = buildReportFileName(target.name || `${initiative?.name || 'Initiative'} Report`);
  const goals = reportData.goals || [];
  if (format === 'csv') {
    const csvLines = buildCsvLines(reportData.tableData || [], goals);
    if (csvLines.length === 0) {
      alert('No table data available to export.');
      return;
    }
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  if (format === 'html') {
    const rows = Array.isArray(reportData.tableData) ? reportData.tableData : [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const tableHtml = rows.length > 0
      ? `<table><thead><tr>${columns.map((c) => `<th>${escapeHtml(formatLabel(c))}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(row[c])}</td>`).join('')}</tr>`).join('\n')}</tbody></table>`
      : '<p>No table data available.</p>';
    const htmlContent = [
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />',
      `<title>${escapeHtml(fileName)}</title>`,
      '<style>body{font-family:Arial,Helvetica,sans-serif;margin:2rem;color:#111827}h1{font-size:1.6rem;margin-bottom:0.25rem}.meta{font-size:0.85rem;color:#6b7280;margin-bottom:1.5rem}.summary{display:flex;gap:1.5rem;margin-bottom:2rem;flex-wrap:wrap}.summary-card{border:1px solid #d1d5db;border-radius:10px;padding:1rem 1.5rem;text-align:center;min-width:150px}.summary-card .label{font-size:0.75rem;text-transform:uppercase;color:#6b7280;margin:0 0 0.25rem}.summary-card .value{font-size:1.6rem;font-weight:700;margin:0}table{width:100%;border-collapse:collapse;font-size:0.88rem;margin-top:1rem}th,td{border:1px solid #d1d5db;padding:0.5rem 0.65rem;text-align:left}th{background:#f3f4f6;font-weight:600}h2{font-size:1.15rem;margin-top:2rem;margin-bottom:0.5rem}</style>',
      `</head><body><h1>${escapeHtml(initiative?.name || 'Report')}</h1>`,
      `<p class="meta">Generated: ${escapeHtml(reportData.generatedDate || 'N/A')} &middot; Report ID: ${escapeHtml(reportData.reportId || '')}</p>`,
      '<div class="summary">',
      `<div class="summary-card"><p class="label">Total Participants</p><p class="value">${escapeHtml(reportData.summary?.totalParticipants)}</p></div>`,
      `<div class="summary-card"><p class="label">Average Rating</p><p class="value">${escapeHtml(reportData.summary?.averageRating)}/5</p></div>`,
      `<div class="summary-card"><p class="label">Completion Rate</p><p class="value">${escapeHtml(reportData.summary?.completionRate)}%</p></div>`,
      '</div>',
      `<h2>Data Table</h2>${tableHtml}`,
      goals.length > 0 ? `<h2>Goals</h2>${buildGoalsHtmlTable(goals)}` : '',
      '</body></html>',
    ].join('\n');
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.html`;
    link.click();
  }
  if (format === 'pdf') {
    openPdfPrintWindow(buildPdfHtml(fileName, target, pdfOptions), pdfOptions.printWindow);
  }
  if (format === 'xlsx') {
    const worksheet = [
      ...Object.entries(reportData)
        .filter(([key]) => key !== 'goals')
        .map(([key, value]) => `${key}\t${value}`),
      ...(goals.length > 0 ? ['', ...buildGoalsTsvLines(goals)] : []),
    ].join('\n');
    const blob = new Blob([worksheet], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xlsx`;
    link.click();
  }
}
