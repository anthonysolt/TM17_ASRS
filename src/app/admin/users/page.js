'use client';

import PageLayout from '@/components/PageLayout';
import TabBar from '@/components/TabBar';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/use-auth-store';
import { apiFetch } from '@/lib/api/client';
import ReasonModal from '@/components/ReasonModal';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { entryDeleteButtonStyle } from '@/components/EntryCard';

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, hydrated } = useAuthStore();
  const [isMounted, setIsMounted] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Add user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
    email: '',
    user_type: 'staff',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Tab state
  const [activeTab, setActiveTab] = useState('users');

  // Roles state
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState('');

  // Create role modal
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePermissions, setNewRolePermissions] = useState([]);
  const [createRoleLoading, setCreateRoleLoading] = useState(false);

  // Editing role permissions (inline)
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState([]);
  const [savingRole, setSavingRole] = useState(false);

  // Auto-clear success messages
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Check auth
  useEffect(() => {
    setIsMounted(true);
    if (!hydrated) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.user_type !== 'admin' && !user.permissions?.includes('users.manage')) {
      router.push('/dashboard');
    }
  }, [router, user, hydrated]);

  // Fetch users
  const fetchUsers = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/admin/users');
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users);
      } else {
        setError(data.error || 'Failed to load users');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch roles
  const fetchRoles = async () => {
    setRolesLoading(true);
    setRolesError('');
    try {
      const response = await apiFetch('/api/admin/roles');
      const data = await response.json();
      if (response.ok) {
        setRoles(data.roles);
        setAllPermissions(data.allPermissions);
      } else {
        setRolesError(data.error || 'Failed to load roles');
      }
    } catch (err) {
      setRolesError('Connection error. Please try again.');
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); fetchRoles(); }, [user]);

  useEffect(() => {
    if (activeTab === 'roles') fetchRoles();
  }, [activeTab]);

  // ── Change user role ──────────────────────────────────────────────────────
  const handleRoleChange = async (userId, newRole) => {
    setPendingAction({ type: 'roleChange', userId, newRole });
    setShowReasonModal(true);
  };

  // ── Add new user ──────────────────────────────────────────────────────────
  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);

    if (addForm.phone_number && addForm.phone_number.replace(/\D/g, '').length !== 10) {
      setAddError('Phone number must be 10 digits');
      setAddLoading(false);
      return;
    }

    setPendingAction({ type: 'add', form: { ...addForm } });
    setShowReasonModal(true);
    setAddLoading(false);
  };

  // Called when ReasonModal confirms
  const handleReasonSubmit = async ({ reasonType, reasonText }) => {
    setShowReasonModal(false);
    if (!pendingAction) return;
    setError('');
    try {
      if (pendingAction.type === 'roleChange') {
        const resp = await apiFetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: pendingAction.userId,
            new_role: pendingAction.newRole,
            reasonType,
            reasonText,
          }),
        });
        const data = await resp.json();
        if (resp.ok) {
          setSuccessMsg(`Role updated to ${pendingAction.newRole}`);
          fetchUsers();
        } else {
          setError(data.error || 'Failed to update role');
        }
      } else if (pendingAction.type === 'delete') {
        const userId = pendingAction.user.user_id;
        const url = `/api/admin/users?user_id=${userId}&reasonType=${encodeURIComponent(reasonType)}&reasonText=${encodeURIComponent(reasonText)}`;
        const resp = await apiFetch(url, { method: 'DELETE' });
        const data = await resp.json();
        if (resp.ok) {
          setSuccessMsg(`${pendingAction.user.first_name} ${pendingAction.user.last_name} has been removed`);
          fetchUsers();
        } else {
          setError(data.error || 'Failed to delete user');
        }
      } else if (pendingAction.type === 'add') {
        setAddLoading(true);
        const resp = await apiFetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...pendingAction.form, reasonType, reasonText }),
        });
        const data = await resp.json();
        if (resp.ok) {
          const defaultMsg = `Invite sent to ${pendingAction.form.email} — they'll set their own password via email.`;
          const withLink = data.verificationUrl ? `${data.message}\n${data.verificationUrl}` : (data.message || defaultMsg);
          setSuccessMsg(withLink);
          setShowAddForm(false);
          setAddForm({ first_name: '', last_name: '', phone_number: '', email: '', user_type: 'staff' });
          fetchUsers();
        } else {
          setAddError(data.error || 'Failed to add user');
        }
        setAddLoading(false);
      }
    } catch (err) {
      setError('Connection error. Please try again.');
      setAddLoading(false);
    } finally {
      setPendingAction(null);
    }
  };

  // ── Role CRUD handlers ────────────────────────────────────────────────────
  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    setCreateRoleLoading(true);
    try {
      const resp = await apiFetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, permissions: newRolePermissions }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setSuccessMsg(`Role "${newRoleName}" created`);
        setShowCreateRole(false);
        setNewRoleName('');
        setNewRolePermissions([]);
        fetchRoles();
      } else {
        setRolesError(data.error || 'Failed to create role');
      }
    } catch (err) {
      setRolesError('Connection error');
    } finally {
      setCreateRoleLoading(false);
    }
  };

  const handleSaveRolePermissions = async (userTypeId) => {
    setSavingRole(true);
    try {
      const resp = await apiFetch('/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_type_id: userTypeId, permissions: editingPermissions }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setSuccessMsg('Role permissions updated');
        setEditingRoleId(null);
        fetchRoles();
      } else {
        setRolesError(data.error || 'Failed to update role');
      }
    } catch (err) {
      setRolesError('Connection error');
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (userTypeId, roleName) => {
    if (!confirm(`Delete role "${roleName}"? This cannot be undone.`)) return;
    try {
      const resp = await apiFetch(`/api/admin/roles?user_type_id=${userTypeId}`, { method: 'DELETE' });
      const data = await resp.json();
      if (resp.ok) {
        setSuccessMsg(`Role "${roleName}" deleted`);
        fetchRoles();
      } else {
        setRolesError(data.error || 'Failed to delete role');
      }
    } catch (err) {
      setRolesError('Connection error');
    }
  };

  const togglePermission = (key, permList, setPerm) => {
    if (permList.includes(key)) {
      setPerm(permList.filter(k => k !== key));
    } else {
      setPerm([...permList, key]);
    }
  };

  // Client-side filtering
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      searchTerm === '' ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || u.user_type === filterRole;
    return matchesSearch && matchesRole;
  });

  const formatRoleName = (type) => type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.verified).length;
  const adminCount = users.filter(u => u.user_type === 'admin').length;
  const staffCount = users.filter(u => u.user_type === 'staff').length;

  if (!isMounted || !user) return null;

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

  const selectSt = {
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '9px 14px',
    fontSize: '0.9rem',
    outline: 'none',
    backgroundColor: 'white',
    cursor: 'pointer',
  };

  const labelSt = {
    display: 'block',
    fontWeight: '600',
    fontSize: '0.85rem',
    marginBottom: '0.3rem',
    color: '#374151',
  };

  return (
    <PageLayout title="User Management">
      {/* ── Page header (same layout as the Reports / Surveys pages) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>User Management</h2>
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'users') { setShowAddForm(true); setAddError(''); }
            else { setShowCreateRole(true); setRolesError(''); }
          }}
          className="btn-primary btn-create"
        >
          {activeTab === 'users' ? 'Add User' : 'Create Role'}
        </button>
      </div>

      {/* ── Tab bar (shared with the Reports / initiative / survey pages) ── */}
      <TabBar
        ariaLabel="User management sections"
        tabs={[
          { key: 'users', label: 'Users' },
          { key: 'roles', label: 'Roles & Permissions' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Stats Row */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{totalUsers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Users</div>
          <div className="stat-value">{activeUsers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Admins</div>
          <div className="stat-value">{adminCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Staff</div>
          <div className="stat-value">{staffCount}</div>
        </div>
      </div>

      {/* Success Message */}
      {successMsg && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem',
          backgroundColor: '#D1FAE5', border: '1px solid #A7F3D0',
          borderRadius: '8px', color: '#065F46', fontSize: '0.9rem', whiteSpace: 'pre-line',
        }}>
          {successMsg}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem',
          backgroundColor: '#FEE2E2', border: '1px solid #FECACA',
          borderRadius: '8px', color: '#991B1B', fontSize: '0.9rem',
        }}>
          {error}
        </div>
      )}

      {/* ═══════════════════ USERS TAB ═══════════════════ */}
      {activeTab === 'users' && (
        <>
          {/* Filters Bar */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 250px' }}>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={inputSt}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#6B7280' }}>Role:</label>
              <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} style={selectSt}>
                <option value="all">All Roles</option>
                {roles.map((r) => (
                  <option key={r.user_type_id} value={r.type}>{formatRoleName(r.type)}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '500' }}>
              {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Users Table */}
          {loading ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>Loading users...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
              {searchTerm || filterRole !== 'all' ? 'No users match your filters.' : 'No users found.'}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const isSelf = u.email === user.email;
                      return (
                        <tr key={u.user_id}>
                          <td>
                            <span style={{ fontWeight: '600', color: '#111827' }}>
                              {u.first_name} {u.last_name}
                            </span>
                            {isSelf && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#6B7280', fontStyle: 'italic' }}>
                                (you)
                              </span>
                            )}
                          </td>
                          <td>{u.email}</td>
                          <td>{u.phone_number || '—'}</td>
                          <td>
                            <select
                              value={u.user_type}
                              onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                              disabled={isSelf}
                              title={isSelf ? 'You cannot change your own role' : 'Change role'}
                              aria-label={`Role for ${u.email}`}
                              style={{
                                ...selectSt,
                                fontSize: '0.8rem',
                                padding: '0.3rem 0.5rem',
                                opacity: isSelf ? 0.5 : 1,
                                cursor: isSelf ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {roles.map((r) => (
                                <option key={r.user_type_id} value={r.type}>{formatRoleName(r.type)}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {u.verified ? (
                              <span className="pill-green">Active</span>
                            ) : (
                              <span className="pill-yellow">Pending</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                              <button
                                onClick={() => setDeleteTarget(u)}
                                disabled={isSelf}
                                title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                                type="button"
                                style={{
                                  ...entryDeleteButtonStyle,
                                  ...(isSelf ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ ROLES TAB ═══════════════════ */}
      {activeTab === 'roles' && (
        <>
          {rolesError && (
            <div style={{
              padding: '0.75rem 1rem', marginBottom: '1rem',
              backgroundColor: '#FEE2E2', border: '1px solid #FECACA',
              borderRadius: '8px', color: '#991B1B', fontSize: '0.9rem',
            }}>
              {rolesError}
            </div>
          )}

          {rolesLoading ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>Loading roles...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {roles.map((role) => {
                const isEditing = editingRoleId === role.user_type_id;
                return (
                  <div key={role.user_type_id} className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditing ? '1rem' : '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', margin: 0 }}>
                          {formatRoleName(role.type)}
                        </h3>
                        {role.is_system && (
                          <span className="pill-blue" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>System</span>
                        )}
                        <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                          {role.user_count} user{role.user_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => setEditingRoleId(null)}
                              className="btn-outline"
                              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveRolePermissions(role.user_type_id)}
                              disabled={savingRole}
                              className="btn-primary"
                              style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem', opacity: savingRole ? 0.6 : 1 }}
                            >
                              {savingRole ? 'Saving...' : 'Save'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditingRoleId(role.user_type_id); setEditingPermissions([...role.permissions]); }}
                              style={{
                                padding: '0.35rem 0.85rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600',
                                border: '1px solid #BFDBFE', backgroundColor: '#EFF6FF',
                                color: '#1D4ED8', cursor: 'pointer',
                              }}
                            >
                              Edit Permissions
                            </button>
                            {!role.is_system && (
                              <button
                                onClick={() => handleDeleteRole(role.user_type_id, role.type)}
                                disabled={role.user_count > 0}
                                title={role.user_count > 0 ? 'Reassign users before deleting' : 'Delete role'}
                                style={{
                                  padding: '0.35rem 0.85rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600',
                                  border: `1px solid ${role.user_count > 0 ? '#E5E7EB' : '#FECACA'}`,
                                  backgroundColor: role.user_count > 0 ? '#F9FAFB' : '#FEE2E2',
                                  color: role.user_count > 0 ? '#D1D5DB' : '#991B1B',
                                  cursor: role.user_count > 0 ? 'not-allowed' : 'pointer',
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Permission grid */}
                    {isEditing ? (
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '0.5rem', padding: '1rem', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB',
                      }}>
                        {allPermissions.map((perm) => {
                          const checked = editingPermissions.includes(perm.key);
                          const disabled = role.type === 'admin' && perm.key === 'users.manage';
                          return (
                            <label
                              key={perm.key}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                fontSize: '0.85rem', color: disabled ? '#9CA3AF' : '#374151',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => togglePermission(perm.key, editingPermissions, setEditingPermissions)}
                                style={{ accentColor: '#E67E22' }}
                              />
                              {perm.label}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {role.permissions.length === 0 ? (
                          <span style={{ fontSize: '0.8rem', color: '#9CA3AF', fontStyle: 'italic' }}>No permissions assigned</span>
                        ) : (
                          role.permissions.map((key) => {
                            const perm = allPermissions.find(p => p.key === key);
                            return (
                              <span key={key} className="pill-green" style={{ fontSize: '0.75rem' }}>
                                {perm ? perm.label : key}
                              </span>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Delete Confirmation Modal: confirming hands the user to the reason prompt ── */}
      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          setPendingAction({ type: 'delete', user: deleteTarget });
          setDeleteTarget(null);
          setShowReasonModal(true);
        }}
        itemName={deleteTarget?.email}
        title={`Delete ${[deleteTarget?.first_name, deleteTarget?.last_name].filter(Boolean).join(' ') || 'user'}?`}
        warning="This permanently deletes the user account and removes their access."
      />

      <ReasonModal
        open={showReasonModal}
        onClose={() => { setShowReasonModal(false); setPendingAction(null); }}
        onSubmit={handleReasonSubmit}
        title={pendingAction?.type === 'add' ? 'Why are you adding this user?' : pendingAction?.type === 'delete' ? 'Why are you deleting this user?' : pendingAction?.type === 'roleChange' ? 'Why are you changing this role?' : undefined}
      />

      {/* ── Add User Modal ────────────────────────────────────────────────── */}
      {showAddForm && (
        <div style={overlayStyle} onClick={() => setShowAddForm(false)}>
          <div style={{ ...modalStyle, maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', margin: '0 0 0.25rem 0' }}>
              Add New User
            </h2>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              An invite email will be sent so they can set their own password.
            </p>

            {addError && (
              <div style={{
                padding: '0.6rem 0.75rem', marginBottom: '1rem',
                backgroundColor: '#FEE2E2', border: '1px solid #FECACA',
                borderRadius: '8px', color: '#991B1B', fontSize: '0.85rem',
              }}>
                {addError}
              </div>
            )}

            <form onSubmit={handleAddUser}>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelSt}>First Name</label>
                  <input type="text" value={addForm.first_name} onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })} required disabled={addLoading} style={inputSt} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelSt}>Last Name</label>
                  <input type="text" value={addForm.last_name} onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })} required disabled={addLoading} style={inputSt} />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelSt}>Phone Number</label>
                <input type="tel" value={addForm.phone_number} onChange={(e) => setAddForm({ ...addForm, phone_number: e.target.value })} disabled={addLoading} required maxLength={10} placeholder="10 digits" style={inputSt} />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelSt}>Email</label>
                <input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} required disabled={addLoading} style={inputSt} />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelSt}>Role</label>
                <select value={addForm.user_type} onChange={(e) => setAddForm({ ...addForm, user_type: e.target.value })} disabled={addLoading} style={{ ...selectSt, width: '100%' }}>
                  {roles.length > 0 ? (
                    roles.map((r) => (
                      <option key={r.user_type_id} value={r.type}>{formatRoleName(r.type)}</option>
                    ))
                  ) : (
                    <>
                      <option value="public">Public</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddForm(false)} className="btn-outline" style={{ padding: '0.5rem 1.25rem' }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={addLoading} style={{ padding: '0.5rem 1.25rem', opacity: addLoading ? 0.6 : 1, cursor: addLoading ? 'not-allowed' : 'pointer' }}>
                  {addLoading ? 'Sending invite...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Role Modal ──────────────────────────────────────────────── */}
      {showCreateRole && (
        <div style={overlayStyle} onClick={() => setShowCreateRole(false)}>
          <div style={{ ...modalStyle, maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', margin: '0 0 0.25rem 0' }}>
              Create New Role
            </h2>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Define a role name and select which features it can access.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelSt}>Role Name</label>
              <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="e.g. Budget Manager" style={inputSt} />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelSt}>Permissions</label>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '0.5rem', padding: '1rem', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB',
              }}>
                {allPermissions.map((perm) => (
                  <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newRolePermissions.includes(perm.key)}
                      onChange={() => togglePermission(perm.key, newRolePermissions, setNewRolePermissions)}
                      style={{ accentColor: '#E67E22' }}
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateRole(false)} className="btn-outline" style={{ padding: '0.5rem 1.25rem' }}>
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={createRoleLoading || !newRoleName.trim()}
                className="btn-primary"
                style={{ padding: '0.5rem 1.25rem', opacity: createRoleLoading || !newRoleName.trim() ? 0.6 : 1, cursor: createRoleLoading || !newRoleName.trim() ? 'not-allowed' : 'pointer' }}
              >
                {createRoleLoading ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

const overlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 200,
};

const modalStyle = {
  backgroundColor: 'white', borderRadius: '12px', padding: '1.75rem',
  maxWidth: '440px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};
