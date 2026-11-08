'use client';

import PageLayout from '@/components/PageLayout';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';

const blankForm = {
  initiativeId: '',
  department: '',
  fiscalYear: '',
  personnel: '',
  equipment: '',
  operations: '',
  travel: '',
};

export default function AdminBudgetsPage() {
  const router = useRouter();
  const { user, hydrated } = useAuthStore();

  const [budgets, setBudgets] = useState([]);
  const [initiatives, setInitiatives] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLabel, setHistoryLabel] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedBudgetId, setSelectedBudgetId] = useState(null);
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.user_type !== 'admin') {
      router.push('/dashboard');
      return;
    }
  }, [router, user, hydrated]);

  useEffect(() => {
    if (!user) return;
    fetchInitiatives();
    fetchBudgets();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => setSuccess(''), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const filteredBudgets = useMemo(() => {
    return budgets.filter((budget) => {
      const budgetDepartment = budget.department || 'General';
      const matchesDepartment = filterDepartment === '' || budgetDepartment === filterDepartment;
      const matchesYear = filterYear === '' || String(budget.fiscal_year) === filterYear.trim();
      return matchesDepartment && matchesYear;
    });
  }, [budgets, filterDepartment, filterYear]);

  const departments = useMemo(() => {
    const values = new Set();
    budgets.forEach((budget) => values.add(budget.department || 'General'));
    return Array.from(values).sort();
  }, [budgets]);

  // Stats
  const totalBudget = useMemo(() => budgets.reduce((sum, b) => sum + Number(b.personnel || 0) + Number(b.equipment || 0) + Number(b.operations || 0) + Number(b.travel || 0), 0), [budgets]);

  async function fetchInitiatives() {
    try {
      const response = await apiFetch('/api/initiatives');
      const data = await response.json();
      if (response.ok) {
        setInitiatives(data.initiatives || []);
      } else {
        setError(data.error || 'Failed to load initiatives');
      }
    } catch (err) {
      setError('Unable to load initiatives.');
    }
  }

  async function fetchBudgets() {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch('/api/admin/budgets');
      const data = await response.json();
      if (response.ok) {
        setBudgets(data.budgets || []);
      } else {
        setError(data.error || 'Failed to load budgets');
      }
    } catch (err) {
      setError('Unable to load budgets.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistory(budget) {
    setError('');
    setHistoryRows([]);
    setHistoryLabel('');
    setHistoryOpen(true);

    try {
      const response = await apiFetch(`/api/admin/budgets?history_for=${budget.budget_id}`);
      const data = await response.json();
      if (response.ok) {
        setHistoryRows(data.history || []);
        setHistoryLabel(`${budget.initiative_name} — ${budget.fiscal_year}`);
      } else {
        setError(data.error || 'Failed to load allocation history');
        setHistoryOpen(false);
      }
    } catch (err) {
      setError('Unable to load allocation history.');
      setHistoryOpen(false);
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function clearForm() {
    setSelectedBudgetId(null);
    setForm(blankForm);
    setError('');
  }

  function validateBudgetForm() {
    const initiativeId = Number(form.initiativeId);
    const fiscalYear = Number(form.fiscalYear);
    const personnel = Number(form.personnel);
    const equipment = Number(form.equipment);
    const operations = Number(form.operations);
    const travel = Number(form.travel);

    if (!initiativeId || !Number.isFinite(initiativeId)) return 'Choose an initiative.';
    if (!fiscalYear || !Number.isFinite(fiscalYear) || fiscalYear <= 0) return 'Enter a valid fiscal year.';
    if ([form.personnel, form.equipment, form.operations, form.travel].some((v) => v === '')) {
      return 'All budget category fields are required.';
    }
    if ([personnel, equipment, operations, travel].some((value) => Number.isNaN(value))) return 'Budget values must be valid numbers.';
    if (personnel < 0 || equipment < 0 || operations < 0 || travel < 0) {
      return 'Budget values cannot be negative.';
    }
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validateBudgetForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    const payload = {
      initiativeId: Number(form.initiativeId),
      department: form.department.trim() || 'General',
      fiscalYear: Number(form.fiscalYear),
      personnel: Number(form.personnel),
      equipment: Number(form.equipment),
      operations: Number(form.operations),
      travel: Number(form.travel),
    };

    try {
      const method = selectedBudgetId ? 'PUT' : 'POST';
      const body = selectedBudgetId ? { budgetId: selectedBudgetId, ...payload } : payload;
      const response = await apiFetch('/api/admin/budgets', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to save budget');
      } else {
        const action = selectedBudgetId ? 'updated' : 'created';
        setSuccess(`Budget ${action} successfully.`);
        clearForm();
        fetchBudgets();
      }
    } catch (err) {
      setError('Saved failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(budgetId) {
    if (!window.confirm('Delete this budget? This cannot be undone.')) {
      return;
    }

    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const response = await apiFetch(`/api/admin/budgets?budget_id=${budgetId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to delete budget');
      } else {
        if (selectedBudgetId === budgetId) {
          clearForm();
        }
        setSuccess('Budget deleted successfully.');
        fetchBudgets();
      }
    } catch (err) {
      setError('Unable to delete budget. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(budget) {
    setSelectedBudgetId(budget.budget_id);
    setForm({
      initiativeId: String(budget.initiative_id),
      department: budget.department || 'General',
      fiscalYear: String(budget.fiscal_year),
      personnel: String(budget.personnel),
      equipment: String(budget.equipment),
      operations: String(budget.operations),
      travel: String(budget.travel),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const inputSt = {
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '9px 14px',
    fontSize: '0.9rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: 'white',
  };

  const labelSt = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    fontWeight: '600',
    fontSize: '0.85rem',
    color: '#374151',
  };

  const fmt = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <PageLayout title="Budget Management">
      {/* ── Page header (same layout as the Reports / Surveys pages) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Budget Management</h2>
      </div>

      {/* Stats Row */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total Budgets</div>
          <div className="stat-value">{budgets.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Allocated</div>
          <div className="stat-value">${fmt(totalBudget)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Departments</div>
          <div className="stat-value">{departments.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fiscal Years</div>
          <div className="stat-value">{new Set(budgets.map(b => b.fiscal_year)).size}</div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '8px', backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '8px', backgroundColor: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' }}>
          {success}
        </div>
      )}

      {/* Add / Edit Budget Form */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2 className="card-title">{selectedBudgetId ? 'Edit Budget' : 'Add Budget'}</h2>
        </div>
        <div style={{ padding: '1.25rem' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={labelSt}>
                Initiative
                <select
                  value={form.initiativeId}
                  onChange={(e) => updateForm('initiativeId', e.target.value)}
                  style={inputSt}
                >
                  <option value="">Select initiative</option>
                  {initiatives.map((initiative) => (
                    <option key={initiative.id} value={initiative.id}>{initiative.name}</option>
                  ))}
                </select>
              </label>

              <label style={labelSt}>
                Department
                <input
                  value={form.department}
                  onChange={(e) => updateForm('department', e.target.value)}
                  placeholder="e.g. Academic, IT, Facilities"
                  style={inputSt}
                />
              </label>

              <label style={labelSt}>
                Fiscal Year
                <input
                  type="number"
                  value={form.fiscalYear}
                  onChange={(e) => updateForm('fiscalYear', e.target.value)}
                  min="2020"
                  step="1"
                  placeholder="2025"
                  style={inputSt}
                />
              </label>
            </div>

            <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={labelSt}>
                Personnel $
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.personnel}
                  onChange={(e) => updateForm('personnel', e.target.value.startsWith('-') ? e.target.value.slice(1) : e.target.value)}
                  style={inputSt}
                />
              </label>
              <label style={labelSt}>
                Equipment $
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.equipment}
                  onChange={(e) => updateForm('equipment', e.target.value.startsWith('-') ? e.target.value.slice(1) : e.target.value)}
                  style={inputSt}
                />
              </label>
              <label style={labelSt}>
                Operations $
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.operations}
                  onChange={(e) => updateForm('operations', e.target.value.startsWith('-') ? e.target.value.slice(1) : e.target.value)}
                  style={inputSt}
                />
              </label>
              <label style={labelSt}>
                Travel $
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.travel}
                  onChange={(e) => updateForm('travel', e.target.value.startsWith('-') ? e.target.value.slice(1) : e.target.value)}
                  style={inputSt}
                />
              </label>
            </div>

            {/* Form actions sit in the card's bottom-right corner. */}
            <div style={{ marginTop: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={clearForm}
                className="btn-outline"
              >
                Clear Form
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
                style={{ opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : selectedBudgetId ? 'Update Budget' : 'Create Budget'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Budgets Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 className="card-title">Existing Budgets</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '9px 14px', fontSize: '0.875rem', backgroundColor: 'white', outline: 'none' }}
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            <input
              type="number"
              min="2020"
              step="1"
              placeholder="Filter by year"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value.startsWith('-') ? e.target.value.slice(1) : e.target.value)}
              style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '9px 14px', fontSize: '0.875rem', outline: 'none', width: '140px' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>Loading budgets...</div>
          ) : filteredBudgets.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>No budgets found.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Initiative</th>
                  <th>Year</th>
                  <th>Personnel</th>
                  <th>Equipment</th>
                  <th>Operations</th>
                  <th>Travel</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBudgets.map((budget) => (
                  <tr key={budget.budget_id}>
                    <td>{budget.department || 'General'}</td>
                    <td>{budget.initiative_name}</td>
                    <td>{budget.fiscal_year}</td>
                    <td>${fmt(budget.personnel)}</td>
                    <td>${fmt(budget.equipment)}</td>
                    <td>${fmt(budget.operations)}</td>
                    <td>${fmt(budget.travel)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleEdit(budget)}
                          className="btn-outline"
                          style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => fetchHistory(budget)}
                          className="btn-outline"
                          style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                        >
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(budget.budget_id)}
                          style={{
                            padding: '0.4rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600',
                            border: '1px solid #FECACA', background: '#FEE2E2', color: '#991B1B', cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* History Modal */}
      {historyOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', background: 'white', borderRadius: '14px', padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#111827' }}>Allocation History</h2>
                <p style={{ margin: '0.25rem 0 0', color: '#6B7280', fontSize: '0.875rem' }}>{historyLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="btn-outline"
                style={{ padding: '0.5rem 0.9rem' }}
              >
                Close
              </button>
            </div>

            {historyRows.length === 0 ? (
              <div style={{ padding: '1rem', color: '#6B7280' }}>No allocation history available for this budget.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Changed By</th>
                      <th>Department</th>
                      <th>Personnel</th>
                      <th>Equipment</th>
                      <th>Operations</th>
                      <th>Travel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row.history_id}>
                        <td>{new Date(row.created_at).toLocaleString()}</td>
                        <td>{row.changed_by_email || 'System'}</td>
                        <td>{row.department || 'General'}</td>
                        <td>${fmt(row.personnel)}</td>
                        <td>${fmt(row.equipment)}</td>
                        <td>${fmt(row.operations)}</td>
                        <td>${fmt(row.travel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
}
