import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal, { ConfirmationModal } from '../components/ui/Modal';
import { employeeService, propertyService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const DEPARTMENTS = [
  'FRONT_DESK',
  'HOUSEKEEPING',
  'MAINTENANCE',
  'FINANCE',
  'SECURITY',
  'MANAGEMENT',
  'OPERATIONS',
  'EXECUTIVE',
  'OTHER',
];

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

export default function EmployeesPage() {
  const navigate = useNavigate();
  const { properties, activePropertyId } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Data
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    onLeaveEmployees: 0,
    suspendedEmployees: 0,
    terminatedEmployees: 0,
    byDepartment: {},
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('ACTIVE');

  // Form state
  const initialForm = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    property_id: '',
    manager_id: '',
    department: 'OPERATIONS',
    job_title: '',
    employment_type: 'FULL_TIME',
    employment_status: 'ACTIVE',
    hire_date: new Date().toISOString().slice(0, 10),
    date_of_birth: '',
    gender: '',
    address: '',
    city: 'Lagos',
    state: 'Lagos State',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    qualifications: '',
    skills: '',
    bio_notes: '',
  };
  const [form, setForm] = useState(initialForm);

  // Sync propertyFilter with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Fetch employees and stats
  const fetchData = async () => {
    setLoading(true);
    try {
      const propParam = propertyFilter !== 'all' ? propertyFilter : undefined;
      const [empRes, statsRes] = await Promise.all([
        employeeService.getAll({
          propertyId: propParam,
          department: deptFilter !== 'ALL' ? deptFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          search: searchQuery || undefined,
          limit: 100,
        }),
        employeeService.getStats({ propertyId: propParam }),
      ]);

      setEmployees(empRes.data?.data || empRes.data || []);
      if (statsRes.data?.data || statsRes.data) {
        setStats(statsRes.data?.data || statsRes.data);
      }
    } catch (err) {
      addToast(`Failed to load employee records: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [propertyFilter, deptFilter, statusFilter]);

  // Open Create
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setSelectedEmployee(null);
    setForm({
      ...initialForm,
      property_id: propertyFilter !== 'all' ? propertyFilter : '',
    });
    setIsEmployeeModalOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (emp) => {
    setIsEditMode(true);
    setSelectedEmployee(emp);
    setForm({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      property_id: emp.property_id || '',
      manager_id: emp.manager_id || '',
      department: emp.department || 'OPERATIONS',
      job_title: emp.job_title || '',
      employment_type: emp.employment_type || 'FULL_TIME',
      employment_status: emp.employment_status || 'ACTIVE',
      hire_date: emp.hire_date ? emp.hire_date.slice(0, 10) : '',
      date_of_birth: emp.date_of_birth ? emp.date_of_birth.slice(0, 10) : '',
      gender: emp.gender || '',
      address: emp.address || '',
      city: emp.city || 'Lagos',
      state: emp.state || 'Lagos State',
      emergency_contact_name: emp.emergency_contact_name || '',
      emergency_contact_phone: emp.emergency_contact_phone || '',
      emergency_contact_relation: emp.emergency_contact_relation || '',
      qualifications: emp.qualifications || '',
      skills: emp.skills || '',
      bio_notes: emp.bio_notes || '',
    });
    setIsEmployeeModalOpen(true);
  };

  // Save Employee
  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        ...form,
        property_id: form.property_id ? parseInt(form.property_id, 10) : null,
        manager_id: form.manager_id ? parseInt(form.manager_id, 10) : null,
      };

      if (isEditMode && selectedEmployee) {
        await employeeService.update(selectedEmployee.id, payload);
        addToast(`Employee '${form.first_name} ${form.last_name}' updated successfully.`, 'success');
      } else {
        await employeeService.create(payload);
        addToast(`Employee '${form.first_name} ${form.last_name}' registered successfully.`, 'success');
      }

      setIsEmployeeModalOpen(false);
      fetchData();
    } catch (err) {
      addToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Status Change
  const handleOpenStatusModal = (emp) => {
    setSelectedEmployee(emp);
    setNewStatus(emp.employment_status);
    setIsStatusModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedEmployee) return;
    setActionLoading(true);
    try {
      await employeeService.updateStatus(selectedEmployee.id, newStatus);
      addToast(`Status of '${selectedEmployee.full_name}' changed to ${newStatus}.`, 'success');
      setIsStatusModalOpen(false);
      fetchData();
    } catch (err) {
      addToast(`Status update failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge status="success">ACTIVE</Badge>;
      case 'ON_LEAVE':
        return <Badge status="info">ON LEAVE</Badge>;
      case 'SUSPENDED':
        return <Badge status="pending">SUSPENDED</Badge>;
      case 'TERMINATED':
        return <Badge status="danger">TERMINATED</Badge>;
      default:
        return <Badge status="neutral">{status}</Badge>;
    }
  };

  // Filtered by Search
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase();
    return employees.filter(
      (e) =>
        e.full_name?.toLowerCase().includes(q) ||
        e.employee_code?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.phone?.toLowerCase().includes(q) ||
        e.job_title?.toLowerCase().includes(q)
    );
  }, [employees, searchQuery]);

  return (
    <div>
      {/* Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>Employee & Staff Management</span>
            <Badge status="info">PHASE 11 OPERATIONAL</Badge>
          </h1>
          <p className="page-subtitle">
            Personnel registry, performance evaluations, operational activity ledger, digital ID cards, and self-service.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/app/id-cards')}>
            🪪 ID Cards Center
          </Button>
          <Button variant="secondary" onClick={() => navigate('/app/evaluations')}>
            📋 Manager Evaluations
          </Button>
          <Button variant="primary" onClick={handleOpenCreate}>
            + Register Employee
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Employees
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {stats.totalEmployees || employees.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Across all properties
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Personnel
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {stats.activeEmployees || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            On duty & assigned
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            On Leave
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8', marginTop: '0.25rem' }}>
            {stats.onLeaveEmployees || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Approved leave requests
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Suspended / Terminated
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
            {(stats.suspendedEmployees || 0) + (stats.terminatedEmployees || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Access restricted / offboarded
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Departments
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--brand-accent, #ca8a04)', marginTop: '0.25rem' }}>
            {Object.keys(stats.byDepartment || {}).length || 5}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Active operational units
          </div>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Search Input */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              placeholder="Search by name, staff ID, title, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                maxWidth: '360px',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            />
          </div>

          {/* Scoping Selectors */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d.replace('_', ' ')}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TERMINATED">Terminated</option>
            </select>

            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              🔄 Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Employees Table */}
      <Card title={`Personnel Directory (${filteredEmployees.length})`}>
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading employee directory records...
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No employees found matching the active criteria.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Employee / Staff Code</th>
                <th>Department & Position</th>
                <th>Property Scope</th>
                <th>Contact Details</th>
                <th>Active ID Card</th>
                <th>Evaluation</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: 'var(--bg-card)',
                          border: '2px solid var(--border-default)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          color: 'var(--brand-accent)',
                          overflow: 'hidden',
                        }}
                      >
                        {emp.photo_url ? (
                          <img
                            src={`/api/v1/employees/${emp.id}/photo`}
                            alt={emp.full_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{emp.full_name}</div>
                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          {emp.employee_code}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{emp.job_title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {emp.department?.replace('_', ' ')} • {emp.employment_type?.replace('_', ' ')}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.5rem',
                        background: 'var(--bg-surface)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      {emp.property_name || 'All Properties (Global)'}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.82rem' }}>{emp.email}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.phone}</div>
                  </td>
                  <td>
                    {emp.active_id_card_number ? (
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                          ✓ {emp.active_id_card_number}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not Issued</span>
                    )}
                  </td>
                  <td>
                    {emp.latest_evaluation_score !== null && emp.latest_evaluation_score !== undefined ? (
                      <span style={{ fontWeight: 700, color: parseFloat(emp.latest_evaluation_score) >= 80 ? '#10b981' : '#f59e0b' }}>
                        {emp.latest_evaluation_score}%
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending</span>
                    )}
                  </td>
                  <td>{getStatusBadge(emp.employment_status)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Button variant="secondary" size="small" onClick={() => navigate(`/app/employees/${emp.id}`)}>
                        Profile
                      </Button>
                      <Button variant="outline" size="small" onClick={() => navigate(`/app/employees/${emp.id}/id-card`)}>
                        ID Card
                      </Button>
                      <Button variant="outline" size="small" onClick={() => handleOpenEdit(emp)}>
                        Edit
                      </Button>
                      <Button variant="outline" size="small" onClick={() => handleOpenStatusModal(emp)}>
                        Status
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* MODAL: REGISTER / EDIT EMPLOYEE */}
      <Modal
        isOpen={isEmployeeModalOpen}
        onClose={() => setIsEmployeeModalOpen(false)}
        title={isEditMode ? `Edit Employee: ${selectedEmployee?.full_name}` : 'Register New Employee'}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsEmployeeModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveEmployee} disabled={actionLoading}>
              {actionLoading ? 'Saving...' : isEditMode ? 'Update Employee' : 'Register Employee'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Section 1: Core Identity */}
          <div className="form-section">
            <span className="form-section-title">
              <span>👤</span> Core Identity & Contact Details
            </span>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input
                type="text"
                required
                className="form-control"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="e.g. Samuel"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input
                type="text"
                required
                className="form-control"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="e.g. Adeyemi"
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Official Work Email *</label>
              <input
                type="email"
                required
                className="form-control"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="employee@bfa-apartments.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Primary Phone Number *</label>
              <input
                type="tel"
                required
                className="form-control"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+234 800 000 0000"
              />
            </div>
          </div>

          {/* Section 2: Employment & Hierarchy */}
          <div className="form-section">
            <span className="form-section-title">
              <span>🏢</span> Employment Scope & Position
            </span>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Department *</label>
              <select
                required
                className="form-select"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Job Title / Designation *</label>
              <input
                type="text"
                required
                className="form-control"
                value={form.job_title}
                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                placeholder="e.g. Front Desk Lead / Maintenance Officer"
              />
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Assigned Property</label>
              <select
                className="form-select"
                value={form.property_id}
                onChange={(e) => setForm({ ...form, property_id: e.target.value })}
              >
                <option value="">All Properties (Global Scope)</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Employment Type</label>
              <select
                className="form-select"
                value={form.employment_type}
                onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Date of Hire *</label>
              <input
                type="date"
                required
                className="form-control"
                value={form.hire_date}
                onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
              />
            </div>
          </div>

          {/* Section 3: Personal & Emergency Contact */}
          <div className="form-section">
            <span className="form-section-title">
              <span>🏠</span> Personal & Emergency Contact
            </span>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input
                type="date"
                className="form-control"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Gender</label>
              <select
                className="form-select"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option value="">Select Gender...</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Residential Address</label>
            <input
              type="text"
              className="form-control"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="e.g. 14 Victoria Island Road, Lagos"
            />
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Emergency Contact Name</label>
              <input
                type="text"
                className="form-control"
                value={form.emergency_contact_name}
                onChange={(e) => setForm({ ...form, emergency_contact_name: e.target.value })}
                placeholder="Full legal name"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Emergency Contact Phone</label>
              <input
                type="tel"
                className="form-control"
                value={form.emergency_contact_phone}
                onChange={(e) => setForm({ ...form, emergency_contact_phone: e.target.value })}
                placeholder="+234 800..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Relationship</label>
              <input
                type="text"
                className="form-control"
                value={form.emergency_contact_relation}
                onChange={(e) => setForm({ ...form, emergency_contact_relation: e.target.value })}
                placeholder="Spouse / Parent / Sibling"
              />
            </div>
          </div>

          {/* Section 4: Professional Qualifications & Notes */}
          <div className="form-section">
            <span className="form-section-title">
              <span>🎓</span> Professional Skills & Administrative Notes
            </span>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Qualifications & Certifications</label>
              <textarea
                rows="2"
                className="form-textarea"
                value={form.qualifications}
                onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
                placeholder="e.g. B.Sc Hospitality, First Aid Certified, OSHA Safety"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Core Skills & Competencies</label>
              <textarea
                rows="2"
                className="form-textarea"
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                placeholder="e.g. Guest relations, HVAC repair, PMS administration"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Staff Biography / Internal Notes</label>
            <textarea
              rows="2"
              className="form-textarea"
              value={form.bio_notes}
              onChange={(e) => setForm({ ...form, bio_notes: e.target.value })}
              placeholder="Operational notes, shift preferences, onboarding history..."
            />
          </div>
        </form>
      </Modal>

      {/* MODAL: UPDATE EMPLOYMENT STATUS */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={selectedEmployee ? `Employment Status: ${selectedEmployee.full_name}` : 'Update Status'}
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsStatusModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmStatusChange} disabled={actionLoading}>
              {actionLoading ? 'Updating...' : 'Confirm Status Change'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--text-primary)',
              fontSize: '0.84rem',
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>⚠️</span> Security & Access Notice
            </div>
            Setting status to <strong>SUSPENDED</strong> or <strong>TERMINATED</strong> automatically revokes any active staff ID badge and suspends operational system access.
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">New Employment Status *</label>
            <select
              className="form-select"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <option value="ACTIVE">ACTIVE — Normal operational status</option>
              <option value="ON_LEAVE">ON LEAVE — Temporarily away</option>
              <option value="SUSPENDED">SUSPENDED — Access restricted</option>
              <option value="TERMINATED">TERMINATED — Employment ended</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
