import React, { useState, useEffect, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { userService, propertyService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function TeamPage() {
  const { user: currentUser } = useAuth();
  const { properties, activePropertyId } = useProperty();
  const { addToast } = useToast();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role);

  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'roles'
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'STAFF',
    property_id: '',
    status: 'ACTIVE',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        userService.getUsers({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
          role: roleFilter !== 'ALL' ? roleFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          search: searchQuery || undefined,
        }),
        userService.getRoles().catch(() => ({ data: [] })),
      ]);

      setUsers(usersRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load team and role records.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [propertyFilter, roleFilter, statusFilter]);

  const filteredUsers = useMemo(() => {
    const list = Array.isArray(users) ? users : [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const handleOpenCreate = () => {
    setSelectedUser(null);
    setForm({
      name: '',
      email: '',
      password: '',
      role: 'STAFF',
      property_id: propertyFilter !== 'all' ? propertyFilter : '',
      status: 'ACTIVE',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setSelectedUser(user);
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '', // Blank unless changing
      role: user.role || 'STAFF',
      property_id: user.property_id || '',
      status: user.status || 'ACTIVE',
    });
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      addToast('Name and email are required.', 'warning');
      return;
    }
    if (!selectedUser && (!form.password || form.password.length < 6)) {
      addToast('Password must be at least 6 characters.', 'warning');
      return;
    }

    setActionLoading(true);
    try {
      if (selectedUser) {
        await userService.update(selectedUser.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          property_id: form.property_id ? parseInt(form.property_id, 10) : null,
          status: form.status,
          ...(form.password ? { password: form.password } : {}),
        });
        addToast(`User ${form.name} updated successfully.`, 'success');
      } else {
        await userService.create({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          property_id: form.property_id ? parseInt(form.property_id, 10) : null,
          status: form.status,
        });
        addToast(`User ${form.name} created successfully.`, 'success');
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Operation failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleBadgeVariant = (role) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'danger';
      case 'OWNER': return 'success';
      case 'ADMIN': return 'primary';
      case 'MANAGER': return 'info';
      case 'RECEPTIONIST': return 'neutral';
      case 'STAFF': return 'warning';
      case 'AGENT': return 'neutral';
      default: return 'neutral';
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>👥</span> Team, Roles & RBAC Governance
            <Badge status="success">PHASE 2 RESTORED</Badge>
          </h1>
          <p className="page-subtitle">
            User administration, authoritative enterprise roles, single-owner rule, property isolation, and granular capability matrices.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </Button>
          {isAdmin && (
            <Button variant="primary" onClick={handleOpenCreate}>
              + Register New User
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-nav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('users')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          👤 Active User Accounts ({users.length})
        </button>
        <button
          className={`btn ${activeTab === 'roles' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('roles')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          🛡️ Role & Capability Hierarchy
        </button>
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users' && (
        <>
          {/* Filters Bar */}
          <Card style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <div style={{ flex: '1 1 240px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="🔍 Search users by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div>
                <select
                  className="form-control"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="ALL">All Roles</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="RECEPTIONIST">Receptionist</option>
                  <option value="STAFF">Staff</option>
                  <option value="AGENT">Agent</option>
                  <option value="OWNER">Owner</option>
                </select>
              </div>

              <div>
                <select
                  className="form-control"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </div>

              <div>
                <select
                  className="form-control"
                  value={propertyFilter}
                  onChange={(e) => setPropertyFilter(e.target.value)}
                >
                  <option value="all">All Properties (Global)</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* Users Table */}
          <Card title={`System Users (${filteredUsers.length})`}>
            <Table>
              <thead>
                <tr>
                  <th>User Identity</th>
                  <th>System Role</th>
                  <th>Property Scope</th>
                  <th>Account Status</th>
                  <th>Last Authentication</th>
                  {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const initials = u.name
                    ? u.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)
                    : 'U';
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '50%',
                              background: u.role === 'SUPER_ADMIN' ? '#3b82f6' : 'var(--brand-primary)',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                            }}
                          >
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {u.name}
                              {u.id === currentUser?.id && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--accent-gold)' }}>
                                  (You)
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge status={getRoleBadgeVariant(u.role)}>
                          {u.role === 'SUPER_ADMIN' ? '👑 SUPER ADMIN' : u.role}
                        </Badge>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem', color: u.property_name ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {u.property_name ? `🏢 ${u.property_name}` : '🌐 Global / Multi-Property'}
                        </span>
                      </td>
                      <td>
                        <Badge status={u.status === 'ACTIVE' ? 'success' : u.status === 'SUSPENDED' ? 'danger' : 'neutral'}>
                          {u.status}
                        </Badge>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                      </td>
                      {isAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(u)}>
                            ✏️ Edit
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No user accounts match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {/* TAB 2: ROLES & CAPABILITIES HIERARCHY */}
      {activeTab === 'roles' && (
        <Card title="Authoritative Enterprise Role Hierarchy & Capabilities">
          <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--border-subtle)' }}>
            <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
              NON-NEGOTIABLE GOVERNANCE RULES
            </div>
            <ul style={{ margin: '0.5rem 0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <li><strong>Single-Owner Rule:</strong> Exactly ONE Owner may exist in the system at any time.</li>
              <li><strong>Admin Immunity:</strong> Admin account cannot be deactivated or downgraded by Manager or Owner.</li>
              <li><strong>Backend Enforcement:</strong> All permissions are verified authoritatively on the server via cryptographic tokens.</li>
            </ul>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.25rem' }}>
            {roles.map((r) => (
              <div
                key={r.role}
                style={{
                  background: 'var(--bg-card)',
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{r.name || r.role}</h4>
                  <Badge status={r.color || 'primary'}>{r.role}</Badge>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  {r.desc}
                </p>

                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '0.4rem' }}>
                    Assigned Capabilities:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {r.capabilities?.map((cap) => (
                      <span
                        key={cap}
                        style={{
                          fontSize: '0.72rem',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* CREATE / EDIT USER MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedUser ? `Edit User: ${selectedUser.name}` : 'Register New System User'}
      >
        <form onSubmit={handleSaveUser}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                Full Name *
              </label>
              <input
                type="text"
                className="form-control"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                Email Address *
              </label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                {selectedUser ? 'New Password (leave blank to retain current)' : 'Account Password *'}
              </label>
              <input
                type="password"
                className="form-control"
                placeholder={selectedUser ? '••••••••' : 'Minimum 6 characters'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!selectedUser}
                minLength={selectedUser && !form.password ? 0 : 6}
              />
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                System Role *
              </label>
              <select
                className="form-control"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                disabled={selectedUser?.id === 1 && isSuperAdmin} // Keep root super admin
              >
                {isSuperAdmin && <option value="SUPER_ADMIN">👑 Super Admin (Full Technical Authority)</option>}
                <option value="ADMIN">System Admin (Full Operational Authority)</option>
                <option value="MANAGER">Property Manager</option>
                <option value="RECEPTIONIST">Receptionist / Front Desk</option>
                <option value="STAFF">Staff (Housekeeping / Maintenance / Inspections)</option>
                <option value="AGENT">Third-Party Booking Agent</option>
                <option value="OWNER">Property Owner (Single Owner Sovereign)</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                Assigned Property Scope
              </label>
              <select
                className="form-control"
                value={form.property_id}
                onChange={(e) => setForm({ ...form, property_id: e.target.value })}
              >
                <option value="">🌐 Global / Multi-Property Access</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    🏢 {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                Account Status
              </label>
              <select
                className="form-control"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                disabled={selectedUser?.id === 1} // Cannot deactivate root super admin
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionLoading}>
                {actionLoading ? 'Saving...' : selectedUser ? 'Update User' : 'Register User'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
