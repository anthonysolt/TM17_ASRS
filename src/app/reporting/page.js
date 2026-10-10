'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import PageLayout from '@/components/PageLayout';
import InitiativeSelector from '@/components/InitiativeSelector';
import ReportDashboard from '@/components/ReportDashboard';
import ReasonModal from '@/components/ReasonModal';
import { normalizeSnapshot, parseReportForDashboard } from '@/lib/report-snapshot';
import { apiFetch } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { buildReportFileName } from '@/lib/download-filename';

const PDF_DISPLAY_OPTIONS = [
  { value: 'charts', label: 'Charts only' },
  { value: 'table', label: 'Data table only' },
  { value: 'both', label: 'Both' },
];

const PDF_LAYOUT_OPTIONS = [
  { value: 'side-by-side', label: 'Side-by-side' },
  { value: 'sequential', label: 'Sequential' },
];

const SOCIAL_PLATFORMS = ['Website', 'Instagram', 'Facebook', 'LinkedIn'];
const DOWNLOAD_FORMATS = ['csv', 'xlsx', 'html'];
const LABEL_KEY_PRIORITY = ['label', 'name', 'category', 'platform', 'period', 'date', 'month', 'metric', 'type'];
const CHART_POINT_LIMIT = 12;
const STATUS_FILTERS = ['All', 'Published', 'Unpublished', 'Archived'];

export default function ReportingPage() {
  const { user: authUser, hydrated } = useAuthStore();
  const [userRole, setUserRole] = useState('public');
  const [activeTab, setActiveTab] = useState('published');

  const [selectedInitiative, setSelectedInitiative] = useState(null);
  const [initiatives, setInitiatives] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [reportDbId, setReportDbId] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [noReport, setNoReport] = useState(false);
  const [reportMap, setReportMap] = useState({});
  const [publishedReportMap, setPublishedReportMap] = useState({});
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showSocialMenu, setShowSocialMenu] = useState(false);
  const [pdfDisplayMode, setPdfDisplayMode] = useState('both');
  const [pdfLayoutMode, setPdfLayoutMode] = useState('side-by-side');
  const [selectedDownloadFormat, setSelectedDownloadFormat] = useState(null);

  const [allReports, setAllReports] = useState([]);
  const [expandedReportId, setExpandedReportId] = useState(null);
  const [publicSelectedInitiativeId, setPublicSelectedInitiativeId] = useState('');
  const [publicSelectedYear, setPublicSelectedYear] = useState('');
  const [publicSelectedReportId, setPublicSelectedReportId] = useState('');

  const [mgmtReports, setMgmtReports] = useState([]);
  const [mgmtLoading, setMgmtLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedInitiativeId, setSelectedInitiativeId] = useState('');

  const [editingReport, setEditingReport] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('completed');

  const [deletingId, setDeletingId] = useState(null);

  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (hydrated && authUser) {
      setUserRole(authUser.user_type || 'public');
    } else if (hydrated) {
      setUserRole('public');
    }
  }, [hydrated, authUser]);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setIsLoading(true);
    try {
      let role = 'public';
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          role = parsed.user_type || 'public';
        }
      } catch {}
      const isStaff = role === 'staff' || role === 'admin';

      let initiativesData, reportsData;
      if (isStaff) {
        const [initiativesRes, reportsRes] = await Promise.all([
          apiFetch('/api/initiatives'),
          apiFetch('/api/reports'),
        ]);
        initiativesData = await initiativesRes.json();
        reportsData = await reportsRes.json();
      } else {
        const [initiativesRes, reportsRes] = await Promise.all([
          fetch('/api/initiatives/public'),
          fetch('/api/reports/public'),
        ]);
        initiativesData = await initiativesRes.json();
        reportsData = await reportsRes.json();
      }

      const initiativesList = initiativesData.initiatives || [];
      setInitiatives(initiativesList);

      const reportsList = reportsData.reports || [];
      setAllReports(reportsList);
      setMgmtReports(reportsList);

      const map = {};
      const pubMap = {};
      for (const r of reportsList) {
        if (!map[r.initiative_id]) {
          map[r.initiative_id] = r;
        }
        if ((r.status || '').toLowerCase() === 'published' && !pubMap[r.initiative_id]) {
          pubMap[r.initiative_id] = r;
        }
      }
      setReportMap(map);
      setPublishedReportMap(pubMap);

      // The Report Viewer is limited to published reports for every role.
      const activeMap = pubMap;

      const visibleInitiatives = isStaff
        ? initiativesList
        : initiativesList.filter(i => pubMap[i.id]);
      if (!isStaff) {
        setInitiatives(visibleInitiatives);
      }

      if (visibleInitiatives.length > 0) {
        if (isStaff) {
          setSelectedInitiative(visibleInitiatives[0]);
          loadReportForInitiative(visibleInitiatives[0], activeMap);
        } else {
          const publishedOnly = reportsList
            .filter((r) => (r.status || '').toLowerCase() === 'published')
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          const first = publishedOnly[0] || null;
          if (first) {
            const firstYear = String(new Date(first.created_at || Date.now()).getFullYear());
            setPublicSelectedInitiativeId(String(first.initiative_id || ''));
            setPublicSelectedYear(firstYear);
            setPublicSelectedReportId(String(first.id));
            loadReportFromRecord(first);
          } else {
            setReportData(null);
          }
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const loadMgmtData = useCallback(async () => {
    setMgmtLoading(true);
    setShowComparison(false);
    setSelectedIds([]);
    try {
      const params = new URLSearchParams();
      if (selectedInitiativeId) params.set('initiativeId', selectedInitiativeId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params.toString();
      const res = await apiFetch(`/api/reports${qs ? '?' + qs : ''}`);
      const data = await res.json();
      const reportsList = data.reports || [];
      setMgmtReports(reportsList);
      setAllReports(reportsList);
    } catch {
      setMgmtReports([]);
    } finally {
      setMgmtLoading(false);
    }
  }, [selectedInitiativeId, startDate, endDate]);

  useEffect(() => {
    if (activeTab === 'management' && (selectedInitiativeId || startDate || endDate)) {
      loadMgmtData();
    }
  }, [activeTab, selectedInitiativeId, startDate, endDate, loadMgmtData]);

  function loadReportFromRecord(report) {
    if (!report) {
      setReportData(null);
      setTrendData([]);
      setReportDbId(null);
      setAiInsights(null);
      setNoReport(true);
      return;
    }

    if (reportDbId != null && String(reportDbId) === String(report.id)) {
      return;
    }

    setNoReport(false);
    setReportDbId(report.id ?? null);
    const parsed = parseReportForDashboard(report);
    if (parsed.reportData) {
      const matchedInitiative = initiatives.find(
        (initiative) => String(initiative.id) === String(parsed.initiative?.id)
      );
      setSelectedInitiative(matchedInitiative || parsed.initiative);
      setReportData(parsed.reportData);
      setTrendData(parsed.trendData || []);
      setAiInsights(null);
      return;
    }

    setReportData(null);
    setTrendData([]);
    setAiInsights(null);
    setNoReport(true);
  }

  function loadReportForInitiative(initiative, map) {
    const rMap = map || reportMap;
    const report = rMap[initiative.id];

    if (!report) {
      setReportData(null);
      setTrendData([]);
      setReportDbId(null);
      setAiInsights(null);
      setNoReport(true);
      return;
    }

    setNoReport(false);
    setReportDbId(report.id ?? null);

    let parsed = null;
    try {
      parsed = typeof report.report_data === 'string'
        ? JSON.parse(report.report_data)
        : report.report_data;
    } catch {
      parsed = null;
    }

    const normalized = normalizeSnapshot(parsed);
    if (normalized) {
      const results = normalized.results;
      setReportData({
        reportId: results.reportId,
        initiativeId: normalized.config.initiativeId,
        initiativeName: results.initiativeName,
        generatedDate: results.generatedDate,
        summary: results.summary,
        chartData: results.chartData,
        tableData: results.filteredTableData,
        explainability: results.explainability,
      });
      setTrendData(results.trendData || []);
      setAiInsights(results.aiInsights || null);
    } else {
      setReportData(null);
      setTrendData([]);
      setAiInsights(null);
      setNoReport(true);
    }
  }

  const publishedReports = useMemo(
    () => allReports.filter((r) => (r.status || '').toLowerCase() === 'published'),
    [allReports]
  );
  const viewerReports = useMemo(() => {
    if (!selectedInitiative?.id) return [];
    return publishedReports
      .filter((report) => String(report.initiative_id) === String(selectedInitiative.id))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [publishedReports, selectedInitiative]);
  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin';
  const publicPublishedReports = useMemo(
    () => (isStaffOrAdmin ? [] : publishedReports),
    [isStaffOrAdmin, publishedReports]
  );
  const publicReportsByInitiative = useMemo(() => {
    const grouped = {};
    for (const report of publicPublishedReports) {
      const initiativeId = String(report.initiative_id || '');
      if (!initiativeId) continue;
      const initiativeName = report.initiative_name || getInitiativeName(report.initiative_id) || 'Unnamed initiative';
      if (!grouped[initiativeId]) {
        grouped[initiativeId] = { initiativeId, initiativeName, years: {} };
      }
      const year = String(new Date(report.created_at || Date.now()).getFullYear());
      if (!grouped[initiativeId].years[year]) {
        grouped[initiativeId].years[year] = [];
      }
      grouped[initiativeId].years[year].push(report);
    }

    for (const initiative of Object.values(grouped)) {
      for (const year of Object.keys(initiative.years)) {
        initiative.years[year].sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
        );
      }
    }
    return grouped;
  }, [publicPublishedReports]);
  const publicInitiativeOptions = useMemo(
    () => Object.values(publicReportsByInitiative).sort((a, b) => a.initiativeName.localeCompare(b.initiativeName)),
    [publicReportsByInitiative]
  );
  const publicYearOptions = useMemo(() => {
    const initiative = publicReportsByInitiative[publicSelectedInitiativeId];
    if (!initiative) return [];
    return Object.keys(initiative.years).sort((a, b) => Number(b) - Number(a));
  }, [publicReportsByInitiative, publicSelectedInitiativeId]);
  const publicReportOptions = useMemo(() => {
    const initiative = publicReportsByInitiative[publicSelectedInitiativeId];
    if (!initiative) return [];
    return initiative.years[publicSelectedYear] || [];
  }, [publicReportsByInitiative, publicSelectedInitiativeId, publicSelectedYear]);

  function formatDate(dateStr) {
    if (!dateStr) return '\u2014';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getInitiativeName(initId) {
    const init = initiatives.find(i => i.initiative_id === initId || i.id === initId);
    return init ? (init.initiative_name || init.name) : '\u2014';
  }

  function getStatusPill(status) {
    const s = (status || 'draft').toLowerCase();
    if (s === 'published') return { bg: '#D1FAE5', color: '#065F46', label: 'Published' };
    if (s === 'archived') return { bg: '#F3F4F6', color: '#6B7280', label: 'Archived' };
    if (s === 'completed') return { bg: '#FEF3C7', color: '#92400E', label: 'Unpublished' };
    if (s === 'generating') return { bg: '#FEF3C7', color: '#92400E', label: 'Generating' };
    if (s === 'failed') return { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' };
    return { bg: '#FEF3C7', color: '#92400E', label: 'Draft' };
  }

  async function updateReportStatus(reportId, newStatus) {
    try {
      const res = await apiFetch('/api/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId, status: newStatus }),
      });
      const label = newStatus === 'completed' ? 'unpublished' : newStatus;
      if (res.ok) {
        showToast(`Report ${label} successfully`);
        await loadMgmtData();
      } else {
        const data = await res.json();
        showToast(data.error || `Failed to ${newStatus === 'completed' ? 'unpublish' : newStatus} report`, 'error');
      }
    } catch {
      showToast('Connection error. Please try again.', 'error');
    }
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
    try {
      if (pendingAction.type === 'editReport') {
        const res = await apiFetch('/api/reports', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pendingAction.id, name: pendingAction.name, description: pendingAction.description, status: pendingAction.status, reasonType, reasonText }),
        });
        if (!res.ok) throw new Error();
        showToast('Report updated successfully');
        closeEdit();
        await loadMgmtData();
      } else if (pendingAction.type === 'deleteReport') {
        const url = `/api/reports?id=${pendingAction.id}&reasonType=${encodeURIComponent(reasonType)}&reasonText=${encodeURIComponent(reasonText)}`;
        const res = await apiFetch(url, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        showToast('Report deleted');
        setDeletingId(null);
        await loadMgmtData();
      }
    } catch {
      showToast('Operation failed', 'error');
    } finally {
      setSaving(false);
      setPendingAction(null);
    }
  };

  function moveReport(index, direction) {
    const newReports = [...mgmtReports];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newReports.length) return;
    [newReports[index], newReports[targetIndex]] = [newReports[targetIndex], newReports[index]];
    setMgmtReports(newReports);
  }

  async function saveOrder() {
    setSaving(true);
    try {
      const order = mgmtReports.map((r, i) => ({ id: r.id, display_order: i }));
      const res = await apiFetch('/api/reports/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error();
      showToast('Display order saved');
      await loadMgmtData();
    } catch {
      showToast('Failed to save order', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCheckbox(reportId) {
    setSelectedIds((prev) => {
      if (prev.includes(reportId)) return prev.filter((id) => id !== reportId);
      if (prev.length >= 2) return prev;
      return [...prev, reportId];
    });
    setShowComparison(false);
  }

  function handleCompare() {
    if (selectedIds.length === 2) setShowComparison(true);
  }

  function handleClearFilters() {
    setStartDate('');
    setEndDate('');
    setSelectedInitiativeId('');
    setStatusFilter('All');
    setSearchQuery('');
  }

  function downloadCsv(report) {
    const { reportData: rd } = parseReportForDashboard(report);
    const rows = rd?.tableData || [];
    if (rows.length === 0) {
      alert('No table data available to export.');
      return;
    }
    const columns = Object.keys(rows[0]);
    const csvLines = [
      columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
      ...rows.map((row) =>
        columns.map((c) => {
          const val = row[c] == null ? '' : String(row[c]);
          return `"${val.replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${buildReportFileName(report.name)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const filteredMgmtReports = mgmtReports
    .filter((r) => {
      const matchesSearch = !searchQuery ||
        (r.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.initiative_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const selectedStatus = statusFilter === 'Unpublished' ? 'completed' : statusFilter.toLowerCase();
      const matchesStatus = statusFilter === 'All' ||
        (r.status || '').toLowerCase() === selectedStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

  const comparedReports = showComparison
    ? selectedIds.map((id) => mgmtReports.find((r) => r.id === id)).filter(Boolean)
    : [];

  useEffect(() => {
    if (isStaffOrAdmin) return;
    if (publicInitiativeOptions.length === 0) {
      setPublicSelectedInitiativeId('');
      setPublicSelectedYear('');
      setPublicSelectedReportId('');
      setReportData(null);
      return;
    }

    const hasInitiative = publicReportsByInitiative[publicSelectedInitiativeId];
    const initiativeId = hasInitiative ? publicSelectedInitiativeId : publicInitiativeOptions[0].initiativeId;
    if (initiativeId !== publicSelectedInitiativeId) {
      setPublicSelectedInitiativeId(initiativeId);
      return;
    }

    const years = Object.keys(publicReportsByInitiative[initiativeId].years).sort((a, b) => Number(b) - Number(a));
    if (!years.length) return;
    const year = years.includes(publicSelectedYear) ? publicSelectedYear : years[0];
    if (year !== publicSelectedYear) {
      setPublicSelectedYear(year);
      return;
    }

    const reports = publicReportsByInitiative[initiativeId].years[year] || [];
    if (!reports.length) return;
    const selectedExists = reports.some((r) => String(r.id) === publicSelectedReportId);
    const reportId = selectedExists ? publicSelectedReportId : String(reports[0].id);
    if (reportId !== publicSelectedReportId) {
      setPublicSelectedReportId(reportId);
      return;
    }

    const selectedReport = reports.find((r) => String(r.id) === reportId) || null;
    loadReportFromRecord(selectedReport);
  }, [
    isStaffOrAdmin,
    reportDbId,
    initiatives,
    publicInitiativeOptions,
    publicReportsByInitiative,
    publicSelectedInitiativeId,
    publicSelectedYear,
    publicSelectedReportId,
  ]);

  function togglePlatform(platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  async function handlePostToSocialMedia() {
    if (!reportData || selectedPlatforms.length === 0) {
      alert('Select at least one platform.');
      return;
    }
    setIsUploading(true);
    setUploadStatus(null);
    try {
      for (const platform of selectedPlatforms) {
        console.log(`Uploading report ${reportData.reportId} to ${platform}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setUploadStatus('Upload successful.');
      setSelectedPlatforms([]);
    } catch (error) {
      console.error(error);
      setUploadStatus('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  function handleCreateShareableLink() {
    if (!reportData || !selectedInitiative) return;
    const shareableUrl = `${window.location.origin}/reporting?reportId=${reportData.reportId}&initiativeId=${selectedInitiative.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareableUrl)
        .then(() => alert('Shareable link copied to clipboard!'))
        .catch(() => window.prompt('Copy this shareable report link:', shareableUrl));
    } else {
      window.prompt('Copy this shareable report link:', shareableUrl);
    }
  }

  function formatLabel(value) {
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

  function escapeHtml(value) {
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

  function getChartSections() {
    const sections = [
      ...getSectionsFromData(reportData?.chartData, 'Charts'),
      ...getSectionsFromData(trendData, 'Trends'),
    ];
    const seen = new Set();
    return sections.filter((section) => {
      const key = `${section.title}:${section.points.map((point) => `${point.label}-${point.value}`).join('|')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.title.localeCompare(b.title));
  }

  function buildChartsHtml() {
    const sections = getChartSections();
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

  function buildTableHtml() {
    const rows = Array.isArray(reportData?.tableData) ? reportData.tableData : [];
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

  function buildPdfHtml(fileName) {
    const showCharts = pdfDisplayMode === 'charts' || pdfDisplayMode === 'both';
    const showTable = pdfDisplayMode === 'table' || pdfDisplayMode === 'both';
    const contentClass = showCharts && showTable && pdfLayoutMode === 'side-by-side' ? 'split' : 'stack';

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

    return [
      '<!DOCTYPE html><html><head><meta charset="utf-8" />',
      `<title>${escapeHtml(fileName)}</title>`,
      `<style>${pdfStyles}</style>`,
      '</head><body><div class="page">',
      '<header class="page-header"><div><p class="eyebrow">Report Export</p>',
      `<h1>${escapeHtml(selectedInitiative?.name || 'Report')}</h1></div>`,
      '<div class="meta-grid">',
      `<div class="meta-item"><span>Generated</span><strong>${escapeHtml(reportData?.generatedDate || 'N/A')}</strong></div>`,
      `<div class="meta-item"><span>Display</span><strong>${escapeHtml(formatLabel(pdfDisplayMode))}</strong></div>`,
      `<div class="meta-item"><span>Layout</span><strong>${escapeHtml(showCharts && showTable ? formatLabel(pdfLayoutMode) : 'Single section')}</strong></div>`,
      `<div class="meta-item"><span>Initiative</span><strong>${escapeHtml(reportData?.initiativeName || selectedInitiative?.name || 'N/A')}</strong></div>`,
      '</div></header>',
      `<section class="card"><h2>Summary</h2>${summaryHtml}</section>`,
      explainabilityHtml,
      `<section class="content ${contentClass}">`,
      showCharts ? buildChartsHtml() : '',
      showTable ? buildTableHtml() : '',
      '</section></div>',
      '<script>window.onload=function(){window.focus();window.print();window.onafterprint=function(){window.close();};};</script>',
      '</body></html>',
    ].join('\n');
  }

  function openPdfPrintWindow(htmlContent) {
    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.writeln(htmlContent);
    printWindow.document.close();
  }

  function handleDownload(format) {
    if (!reportData || !selectedInitiative) return;
    setSelectedDownloadFormat(format);
    const currentReport = allReports.find((r) => String(r.id) === String(reportDbId));
    const fileName = buildReportFileName(currentReport?.name || `${selectedInitiative.name} Report`);
    if (format === 'csv') {
      const rows = reportData.tableData || [];
      if (rows.length === 0) return;
      const columns = Object.keys(rows[0]);
      const csvLines = [
        columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
        ...rows.map((row) =>
          columns.map((c) => {
            const val = row[c] == null ? '' : String(row[c]);
            return `"${val.replace(/"/g, '""')}"`;
          }).join(',')
        ),
      ];
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
        `</head><body><h1>${escapeHtml(selectedInitiative?.name || 'Report')}</h1>`,
        `<p class="meta">Generated: ${escapeHtml(reportData.generatedDate || 'N/A')} &middot; Report ID: ${escapeHtml(reportData.reportId || '')}</p>`,
        '<div class="summary">',
        `<div class="summary-card"><p class="label">Total Participants</p><p class="value">${escapeHtml(reportData.summary?.totalParticipants)}</p></div>`,
        `<div class="summary-card"><p class="label">Average Rating</p><p class="value">${escapeHtml(reportData.summary?.averageRating)}/5</p></div>`,
        `<div class="summary-card"><p class="label">Completion Rate</p><p class="value">${escapeHtml(reportData.summary?.completionRate)}%</p></div>`,
        '</div>',
      ].join('\n');
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName}.html`;
      link.click();
    }
    if (format === 'pdf') {
      openPdfPrintWindow(buildPdfHtml(fileName));
    }
    if (format === 'xlsx') {
      const worksheet = Object.entries(reportData)
        .map(([key, value]) => `${key}\t${value}`)
        .join('\n');
      const blob = new Blob([worksheet], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName}.xlsx`;
      link.click();
    }
  }

  const layoutTitle = hydrated && !authUser ? 'Published reports' : 'Reports';

  return (
    <PageLayout title={layoutTitle} requireAuth={false}>
      {isStaffOrAdmin && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'flex',
            gap: 0,
            borderBottom: '2px solid #E5E7EB',
            flex: 1,
          }}>
            <button
              onClick={() => setActiveTab('published')}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                border: 'none',
                borderBottom: activeTab === 'published' ? '3px solid #E67E22' : '3px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === 'published' ? '#E67E22' : '#6B7280',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginBottom: '-2px',
              }}
            >
              Published Reports
            </button>
            <button
              onClick={() => { setActiveTab('management'); loadMgmtData(); }}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                border: 'none',
                borderBottom: activeTab === 'management' ? '3px solid #E67E22' : '3px solid transparent',
                backgroundColor: 'transparent',
                color: activeTab === 'management' ? '#E67E22' : '#6B7280',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginBottom: '-2px',
              }}
            >
              Management
            </button>
          </div>
          <Link href="/report-creation" className="btn-primary" style={{ flexShrink: 0, marginLeft: '1rem' }}>
            + Create Report
          </Link>
        </div>
      )}

      {activeTab === 'published' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {isStaffOrAdmin && publishedReports.length > 0 && (
            <div style={{ marginBottom: '1.5rem', order: 2 }}>
              <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Showing all published reports. Click a report to view its full dashboard.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {publishedReports.map((r) => {
                  const isExpanded = expandedReportId === r.id;
                  const parsed = isExpanded ? parseReportForDashboard(r) : null;
                  return (
                    <div key={r.id}>
                      <div
                        onClick={() => setExpandedReportId(isExpanded ? null : r.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '16px 20px',
                          backgroundColor: isExpanded ? 'rgba(230, 126, 34, 0.05)' : '#fff',
                          borderRadius: isExpanded ? '10px 10px 0 0' : '10px',
                          border: `1px solid ${isExpanded ? '#E67E22' : '#E5E7EB'}`,
                          borderBottom: isExpanded ? 'none' : undefined,
                          cursor: 'pointer',
                          transition: 'box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#065F46" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: '#1F2937', fontSize: '0.95rem', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.name || '(Untitled)'}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                            {r.initiative_name || '\u2014'} &bull; {formatDate(r.created_at)}
                          </div>
                        </div>
                        <span style={{ padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.73rem', fontWeight: 700, backgroundColor: '#D1FAE5', color: '#065F46', flexShrink: 0 }}>
                          Published
                        </span>
                        <span style={{ fontSize: '0.85rem', color: '#6B7280', flexShrink: 0 }}>
                          {isExpanded ? '\u25B2' : '\u25BC'}
                        </span>
                      </div>
                      {isExpanded && parsed && (
                        <div style={{
                          border: '1px solid #E67E22',
                          borderTop: 'none',
                          borderRadius: '0 0 10px 10px',
                          padding: '1.5rem',
                          backgroundColor: '#fff',
                        }}>
                          {parsed.reportData ? (
                            <ReportDashboard
                              reportData={parsed.reportData}
                              trendData={parsed.trendData}
                              selectedInitiative={parsed.initiative}
                              userRole={userRole}
                              showDataTable={false}
                            />
                          ) : (
                            <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>No report data available.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isStaffOrAdmin && publishedReports.length === 0 && !isLoading && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF', marginBottom: '1.5rem', order: 2 }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No published reports yet.</p>
              <p style={{ fontSize: '0.9rem' }}>Switch to the Management tab to publish reports.</p>
            </div>
          )}

          {!isStaffOrAdmin && (
            <>
              <section className="card public-reporting-intro" aria-labelledby="public-reporting-heading">
                <p className="public-reporting-intro-eyebrow">Community access</p>
                <h1 id="public-reporting-heading" className="public-reporting-intro-title">
                  Published initiative reports
                </h1>
                <p className="public-reporting-intro-body">
                  These reports are published by ASRS staff. Select an initiative to view charts and tables in your browser. Downloads and staff tools are available after you log in.
                </p>
              </section>

              {isLoading ? (
                <div className="public-reporting-loading" role="status" aria-live="polite">
                  <div className="public-reporting-loading-spinner" aria-hidden />
                  <span>Loading published reports…</span>
                </div>
              ) : initiatives.length === 0 ? (
                <div className="asrs-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>
                    No published reports yet
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.55, maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto' }}>
                    When staff publish a report for an initiative, it will appear here. You can still use the home page or check back later.
                  </p>
                  <Link href="/" className="btn-outline" style={{ marginTop: '1.25rem', display: 'inline-flex' }}>
                    Back to home
                  </Link>
                </div>
              ) : (
                <>
                  <section className="asrs-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                    <h2 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '1rem' }}>Choose report</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '0.3rem' }}>
                          Initiative
                        </label>
                        <select
                          value={publicSelectedInitiativeId}
                          onChange={(e) => {
                            setPublicSelectedInitiativeId(e.target.value);
                            setPublicSelectedYear('');
                            setPublicSelectedReportId('');
                          }}
                          style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}
                        >
                          {publicInitiativeOptions.map((initiative) => (
                            <option key={initiative.initiativeId} value={initiative.initiativeId}>
                              {initiative.initiativeName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '0.3rem' }}>
                          Year
                        </label>
                        <select
                          value={publicSelectedYear}
                          onChange={(e) => {
                            setPublicSelectedYear(e.target.value);
                            setPublicSelectedReportId('');
                          }}
                          style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}
                        >
                          {publicYearOptions.map((year) => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '0.3rem' }}>
                          Report
                        </label>
                        <select
                          value={publicSelectedReportId}
                          onChange={(e) => setPublicSelectedReportId(e.target.value)}
                          style={{ width: '100%', padding: '0.55rem 0.65rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}
                        >
                          {publicReportOptions.map((report) => (
                            <option key={report.id} value={String(report.id)}>
                              {(report.name || '(Untitled)')} - {formatDate(report.created_at)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </section>

                  {reportData && (
                    <ReportDashboard
                      reportData={reportData}
                      trendData={trendData}
                      selectedInitiative={selectedInitiative}
                      userRole={userRole}
                      reportDbId={reportDbId}
                      preloadedInsights={aiInsights}
                    />
                  )}

                  {!reportData && (
                    <div className="asrs-card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                      <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.5rem' }}>
                        Report not available for this initiative
                      </p>
                      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.55 }}>
                        Try another initiative, or check back after staff have published a report.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {isStaffOrAdmin && (
            <div style={{ paddingBottom: '1.5rem', marginBottom: '0.5rem', order: 1 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '1rem' }}>Report Viewer</h3>
              <section style={{ marginBottom: '1.5rem' }}>
                <InitiativeSelector
                  initiatives={initiatives}
                  selectedInitiative={selectedInitiative}
                  onSelect={(initiative) => {
                    setSelectedInitiative(initiative);
                    const reportsForInitiative = publishedReports
                      .filter((report) => String(report.initiative_id) === String(initiative.id))
                      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                    loadReportFromRecord(reportsForInitiative[0] || null);
                  }}
                />
              </section>

              {viewerReports.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Published reports ({viewerReports.length})
                  </div>
                  {viewerReports.map((report) => {
                    const isSelected = String(reportDbId) === String(report.id);
                    return (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => loadReportFromRecord(report)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          padding: '1rem 1.25rem',
                          border: isSelected ? '2px solid #E67E22' : '1px solid #E5E7EB',
                          borderRadius: '10px',
                          backgroundColor: isSelected ? '#FFF7ED' : '#fff',
                          color: '#111827',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{report.name || 'Untitled Report'}</div>
                          <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#6B7280' }}>
                            {formatDate(report.created_at)}{report.created_by ? ` · by ${report.created_by}` : ''}
                          </div>
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isSelected ? '#C2410C' : '#047857', whiteSpace: 'nowrap' }}>
                          {isSelected ? 'Viewing' : 'View report'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {reportData ? (
                <>
                  <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600 }}>Download Report</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Content</span>
                          <select value={pdfDisplayMode} onChange={(e) => setPdfDisplayMode(e.target.value)} style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff', outline: 'none' }}>
                            {PDF_DISPLAY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Layout</span>
                          <select value={pdfLayoutMode} onChange={(e) => setPdfLayoutMode(e.target.value)} disabled={pdfDisplayMode !== 'both'} style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff', opacity: pdfDisplayMode === 'both' ? 1 : 0.6, outline: 'none' }}>
                            {PDF_LAYOUT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                        {['pdf', ...DOWNLOAD_FORMATS].map((format) => (
                          <button
                            key={format}
                            className={selectedDownloadFormat === format ? 'btn-primary' : 'btn-outline'}
                            aria-pressed={selectedDownloadFormat === format}
                            onClick={() => handleDownload(format)}
                          >
                            {format.toUpperCase()}
                          </button>
                        ))}
                        <button className="btn-outline" onClick={handleCreateShareableLink}>Share Link</button>
                        {userRole === 'admin' && (
                          <div style={{ position: 'relative' }}>
                            <button className="btn-outline" onClick={() => setShowSocialMenu(!showSocialMenu)}>Share &#9662;</button>
                            {showSocialMenu && (
                              <div style={{ position: 'absolute', top: '110%', right: 0, backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '0.75rem', width: '220px', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                                <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>Share to:</div>
                                {SOCIAL_PLATFORMS.map((platform) => (
                                  <div key={platform} style={{ marginBottom: '0.4rem' }}>
                                    <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={selectedPlatforms.includes(platform)} onChange={() => togglePlatform(platform)} style={{ marginRight: '0.4rem' }} />
                                      {platform}
                                    </label>
                                  </div>
                                ))}
                                <button className="btn-primary" onClick={handlePostToSocialMedia} disabled={isUploading || selectedPlatforms.length === 0} style={{ marginTop: '0.5rem', width: '100%', cursor: isUploading ? 'not-allowed' : 'pointer', opacity: (isUploading || selectedPlatforms.length === 0) ? 0.6 : 1 }}>
                                  {isUploading ? 'Posting...' : 'Post'}
                                </button>
                                {uploadStatus && (
                                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.8 }}>{uploadStatus}</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <ReportDashboard
                    reportData={reportData}
                    trendData={trendData}
                    selectedInitiative={selectedInitiative}
                    userRole={userRole}
                    reportDbId={reportDbId}
                    preloadedInsights={aiInsights}
                    // Survey responses data table hidden on the Reporting page.
                    showDataTable={false}
                  />
                </>
              ) : !isLoading ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
                  <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Report has not been published yet</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>No published report data is available for this initiative.</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {activeTab === 'management' && isStaffOrAdmin && (
        <div>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
            backgroundColor: '#fff',
            borderRadius: '10px',
            border: '1px solid #E5E7EB',
          }}>
            <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>Search</label>
              <input
                type="text"
                placeholder="Search reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.875rem', backgroundColor: '#F9FAFB', boxSizing: 'border-box', outline: 'none' }}
                onFocus={(e) => e.target.style.borderColor = '#E67E22'}
                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Initiative</label>
              <select value={selectedInitiativeId} onChange={(e) => setSelectedInitiativeId(e.target.value)} style={{ padding: '0.5rem 0.65rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB', minWidth: '180px' }}>
                <option value="">All Initiatives</option>
                {initiatives.map((init) => (
                  <option key={init.id} value={init.id}>{init.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status Filter</label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: '0.35rem 0.85rem',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      border: '1px solid',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      backgroundColor: statusFilter === s ? '#E67E22' : '#F9FAFB',
                      color: statusFilter === s ? '#fff' : '#374151',
                      borderColor: statusFilter === s ? '#E67E22' : '#E5E7EB',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.875rem', backgroundColor: '#F9FAFB', cursor: 'pointer' }}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name (A-Z)</option>
            </select>

            <button onClick={handleClearFilters} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 500, borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff', cursor: 'pointer' }}>
              Clear
            </button>

            <button onClick={saveOrder} disabled={saving || mgmtReports.length === 0} className="btn-primary" style={{ opacity: saving || mgmtReports.length === 0 ? 0.5 : 1, cursor: saving || mgmtReports.length === 0 ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving...' : 'Save Order'}
            </button>

            {selectedIds.length > 0 && (
              <button onClick={() => { setSelectedIds([]); setShowComparison(false); }} style={{ padding: '0.5rem 0.75rem', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#fff', cursor: 'pointer', color: '#6B7280' }}>
                Clear Selection
              </button>
            )}
            <button onClick={handleCompare} disabled={selectedIds.length !== 2} className="btn-primary" style={{ padding: '0.5rem 1.25rem', backgroundColor: selectedIds.length === 2 ? '#E67E22' : '#D1D5DB', color: '#fff', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: selectedIds.length === 2 ? 'pointer' : 'not-allowed', fontSize: '0.88rem' }}>
              Compare ({selectedIds.length}/2)
            </button>
          </div>

          {mgmtLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem', color: '#9CA3AF' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid #E5E7EB', borderTop: '3px solid #E67E22', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <span style={{ marginLeft: '1rem' }}>Loading reports...</span>
            </div>
          ) : filteredMgmtReports.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No reports found.</p>
              <p style={{ fontSize: '0.9rem' }}>
                {mgmtReports.length === 0 ? 'Create reports from the Report Creation page.' : 'Try adjusting your search or filters.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredMgmtReports.map((r) => {
                const realIdx = mgmtReports.findIndex((rep) => rep.id === r.id);
                const isChecked = selectedIds.includes(r.id);
                const isDisabled = !isChecked && selectedIds.length >= 2;
                const sp = getStatusPill(r.status);
                return (
                  <div
                    key={r.id}
                    className="card"
                    style={{
                      padding: '1.25rem 1.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      transition: 'box-shadow 0.15s',
                      backgroundColor: isChecked ? 'rgba(230, 126, 34, 0.05)' : '#fff',
                      borderColor: isChecked ? '#E67E22' : undefined,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.boxShadow = ''}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDisabled}
                      onChange={() => handleCheckbox(r.id)}
                      style={{ cursor: isDisabled ? 'not-allowed' : 'pointer', width: '16px', height: '16px', flexShrink: 0 }}
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flexShrink: 0 }}>
                      <button onClick={() => moveReport(realIdx, -1)} disabled={realIdx === 0} style={{ padding: '0.2rem 0.4rem', backgroundColor: 'transparent', border: '1px solid #E5E7EB', borderRadius: '4px', cursor: realIdx === 0 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', lineHeight: 1, color: '#6B7280', opacity: realIdx === 0 ? 0.3 : 1 }} title="Move up">&#9650;</button>
                      <button onClick={() => moveReport(realIdx, 1)} disabled={realIdx === mgmtReports.length - 1} style={{ padding: '0.2rem 0.4rem', backgroundColor: 'transparent', border: '1px solid #E5E7EB', borderRadius: '4px', cursor: realIdx === mgmtReports.length - 1 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', lineHeight: 1, color: '#6B7280', opacity: realIdx === mgmtReports.length - 1 ? 0.3 : 1 }} title="Move down">&#9660;</button>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: '0 0 0.2rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.name || '(Untitled)'}
                      </h3>
                      <div style={{ fontSize: '13px', color: '#6B7280', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span>{r.initiative_name || getInitiativeName(r.initiative_id)}</span>
                        <span>{formatDate(r.created_at)}</span>
                        {r.created_by && <span>by {r.created_by}</span>}
                      </div>
                      {r.description && (
                        <div style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.2rem' }}>
                          {r.description.length > 80 ? r.description.slice(0, 80) + '...' : r.description}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#6B7280', flexShrink: 0 }}>
                      {r.views != null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, color: '#374151', fontSize: '1rem' }}>{r.views}</div>
                          <div>Views</div>
                        </div>
                      )}
                      {r.downloads != null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, color: '#374151', fontSize: '1rem' }}>{r.downloads}</div>
                          <div>Downloads</div>
                        </div>
                      )}
                    </div>

                    <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', backgroundColor: sp.bg, color: sp.color, flexShrink: 0 }}>
                      {sp.label}
                    </span>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                      {(r.status || '').toLowerCase() !== 'published' && (
                        <button onClick={() => updateReportStatus(r.id, 'published')} style={{ fontSize: '0.83rem', fontWeight: 500, color: '#065F46', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}>
                          Publish
                        </button>
                      )}
                      {(r.status || '').toLowerCase() === 'published' && (
                        <button onClick={() => updateReportStatus(r.id, 'completed')} style={{ fontSize: '0.83rem', fontWeight: 500, color: '#92400E', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}>
                          Unpublish
                        </button>
                      )}
                      {(r.status || '').toLowerCase() !== 'archived' && (
                        <button onClick={() => { if (confirm('Archive this report?')) updateReportStatus(r.id, 'archived'); }} style={{ fontSize: '0.83rem', fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}>
                          Archive
                        </button>
                      )}
                      <button onClick={() => downloadCsv(r)} style={{ fontSize: '0.83rem', fontWeight: 500, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0' }}>
                        Download
                      </button>
                      <Link href={`/report-creation/${r.id}`} style={{ fontSize: '0.83rem', fontWeight: 500, color: '#374151', textDecoration: 'none', padding: '0.4rem 0.85rem', borderRadius: '7px', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}>
                        View
                      </Link>
                      <button onClick={() => openEdit(r)} style={{ padding: '0.4rem 0.85rem', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 500, border: '1px solid #E5E7EB', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}>
                        Edit
                      </button>
                      {deletingId === r.id ? (
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: '#991b1b' }}>Delete?</span>
                          <button onClick={() => handleDelete(r.id)} disabled={saving} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 500, border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#991b1b', cursor: 'pointer' }}>Yes</button>
                          <button onClick={() => setDeletingId(null)} style={{ padding: '0.3rem 0.55rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 500, border: '1px solid #E5E7EB', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}>No</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeletingId(r.id)} style={{ padding: '0.4rem 0.85rem', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 500, border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#991b1b', cursor: 'pointer' }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {mgmtReports.length > 1 && (
            <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem', color: '#9CA3AF' }}>
              Use the arrow buttons to reorder, then click <strong>Save Order</strong> to persist changes.
            </p>
          )}

          {showComparison && comparedReports.length === 2 && (
            <div className="card" style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1F2937', margin: 0 }}>Report Comparison</h2>
                <button onClick={() => setShowComparison(false)} style={{ fontSize: '0.83rem', color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {comparedReports.map((report) => {
                  const { reportData: rd, trendData: td, initiative: init } = parseReportForDashboard(report);
                  return (
                    <div key={report.id} style={{ border: '1px solid #E5E7EB', borderRadius: '10px', padding: '1rem', overflow: 'hidden' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1F2937', borderBottom: '2px solid #E67E22', paddingBottom: '0.5rem' }}>
                        {report.name || '(Untitled)'}
                        <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#6B7280', marginLeft: '0.5rem' }}>{formatDate(report.created_at)}</span>
                      </h3>
                      {rd ? (
                        <ReportDashboard reportData={rd} trendData={td} selectedInitiative={init} userRole={userRole} showDataTable={false} />
                      ) : (
                        <p style={{ color: '#9CA3AF', padding: '1rem', textAlign: 'center' }}>No report data available.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
                <option value="completed">Unpublished</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
                <option value="generating">Generating</option>
                <option value="failed">Failed</option>
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

      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 300,
          padding: '0.75rem 1.25rem', borderRadius: '8px',
          fontWeight: 600, fontSize: '0.9rem',
          color: toast.type === 'error' ? '#991b1b' : '#065f46',
          backgroundColor: toast.type === 'error' ? '#fee2e2' : '#d1fae5',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast.message}
        </div>
      )}

      <ReasonModal
        open={showReasonModal}
        onClose={() => { setShowReasonModal(false); setPendingAction(null); }}
        onSubmit={handleReasonSubmit}
        title={pendingAction?.type === 'deleteReport' ? 'Why are you deleting this report?' : pendingAction?.type === 'editReport' ? 'Why are you editing this report?' : undefined}
      />
    </PageLayout>
  );
}
