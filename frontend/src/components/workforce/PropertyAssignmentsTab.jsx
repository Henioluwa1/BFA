import React, { useState, useEffect, useCallback } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import Modal from '../ui/Modal';
import { operationsService, employeeService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import {
  Calendar,
  Building,
  Plus,
  Download,
  AlertTriangle,
  RefreshCw,
  Clock,
  ShieldCheck,
  User,
  CheckCircle,
} from 'lucide-react';

const DUTY_CLASSIFICATIONS = [
  { value: 'RECEPTIONIST', label: 'Receptionist / Front Desk Desk' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping & Turn-over' },
  { value: 'MAINTENANCE', label: 'Facility Maintenance & Repairs' },
  { value: 'SECURITY', label: 'Security & Access Oversight' },
  { value: 'FRONT_OFFICE', label: 'Front Office Operations' },
  { value: 'GENERAL_OPERATIONS', label: 'General Operations Execution' },
];

export default function PropertyAssignmentsTab({ activePropertyId }) {
  const { user } = useAuth();
  const { properties } = useProperty();
  const { addToast } = useToast();

  const userRole = (user?.role || '').toUpperCase();
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(userRole);
  const isManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(userRole);
  const canAssign = isAdmin || isManager;

  const [assignments, setAssignments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  // Create Assignment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    user_id: '',
    property_id: activePropertyId !== 'all' ? activePropertyId : '',
    duty_classification: 'RECEPTIONIST',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    shift_hours: '08:00 - 17:00',
    priority: 'IMPORTANT',
    special_instructions: '',
    is_admin_override: false,
    override_reason: '',
  });

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        propertyId: activePropertyId !== 'all' ? activePropertyId : undefined,
      };
      const res = await operationsService.listAssignments(params);
      setAssignments(res.data?.data?.assignments || res.data?.assignments || []);
    } catch (err) {
      addToast(err.message || 'Failed to load property assignments', 'error');
    } finally {
      setLoading(false);
    }
  }, [activePropertyId, addToast]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await employeeService.getEmployees();
      setEmployees(res.data?.employees || res.data?.data || res.data || []);
    } catch (err) {
      console.warn('Failed to load employees for assignment:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
    fetchEmployees();
  }, [fetchAssignments, fetchEmployees]);

  const handleDownloadPdf = async (assignmentId) => {
    setDownloadingId(assignmentId);
    try {
      addToast('Generating official assignment notice PDF...', 'info');
      await operationsService.downloadAssignmentPdf(assignmentId);
      addToast('Assignment notice PDF downloaded successfully', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to download assignment PDF', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!form.user_id || !form.property_id || !form.start_date || !form.end_date) {
      addToast('Please fill all mandatory assignment fields', 'error');
      return;
    }
    setSaving(true);
    try {
      await operationsService.createAssignment(form);
      addToast('Staff property assignment created and notice dispatched via chat!', 'success');
      setIsModalOpen(false);
      setForm({
        user_id: '',
        property_id: activePropertyId !== 'all' ? activePropertyId : '',
        duty_classification: 'RECEPTIONIST',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        shift_hours: '08:00 - 17:00',
        priority: 'IMPORTANT',
        special_instructions: '',
        is_admin_override: false,
        override_reason: '',
      });
      fetchAssignments();
    } catch (err) {
      addToast(err.message || 'Failed to create assignment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderStatus = (val) => {
    if (!val) return '—';
    const s = String(val).toUpperCase();
    if (['ACCEPTED', 'ACTIVE', 'COMPLETED'].includes(s)) {
      return <Badge status="success">{val}</Badge>;
    }
    if (['SENT', 'DELIVERED', 'VIEWED', 'PENDING'].includes(s)) {
      return <Badge status="pending">{val}</Badge>;
    }
    if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(s)) {
      return <Badge status="danger">{val}</Badge>;
    }
    if (['CLARIFICATION_REQUESTED'].includes(s)) {
      return <Badge status="warning">CLARIFICATION REQ.</Badge>;
    }
    return <Badge status="neutral">{val}</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building size={20} style={{ color: 'var(--brand-accent, #ca8a04)' }} />
            <span>Property Staff Assignments & Active Rosters</span>
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Assign personnel to properties, manage receptionists and general staff duties, prevent scheduling conflicts, and generate signed assignment notices.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={fetchAssignments} icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}>
            Refresh
          </Button>
          {canAssign && (
            <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)} icon={<Plus size={16} />}>
              Assign Staff to Property
            </Button>
          )}
        </div>
      </div>

      <Card>
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading active property assignments...
          </div>
        ) : assignments.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No property assignments recorded for the active filter.
          </div>
        ) : (
          <Table
            columns={[
              {
                header: 'Staff Member',
                key: 'staff_name',
                render: (val, row) => (
                  <div>
                    <strong>{val || row.email}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {row.staff_email || row.employee_code || ''}
                    </div>
                  </div>
                ),
              },
              { header: 'Property', key: 'property_name', render: (val) => <strong>{val}</strong> },
              {
                header: 'Duty Classification',
                key: 'duty_classification',
                render: (val) => <span style={{ fontWeight: 600, color: 'var(--brand-accent, #ca8a04)' }}>{val}</span>,
              },
              {
                header: 'Schedule Window',
                key: 'start_date',
                render: (val, row) => (
                  <div>
                    <div>{val} → {row.end_date}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{row.shift_hours || 'Standard'}</div>
                  </div>
                ),
              },
              {
                header: 'Priority',
                key: 'priority',
                render: (val) => (
                  <Badge status={val === 'URGENT' ? 'danger' : val === 'IMPORTANT' ? 'warning' : 'neutral'}>
                    {val}
                  </Badge>
                ),
              },
              { header: 'Status', key: 'status', render: renderStatus },
              {
                header: 'Official Notice',
                key: 'id',
                render: (id) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadPdf(id)}
                    disabled={downloadingId === id}
                    icon={<Download size={14} />}
                  >
                    {downloadingId === id ? 'Exporting...' : 'PDF'}
                  </Button>
                ),
              },
            ]}
            data={assignments}
          />
        )}
      </Card>

      {/* ─── CREATE ASSIGNMENT GLASS MODAL ─────────────────────────────────── */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Assign Staff Member to Property"
        >
          <form onSubmit={handleCreateAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Staff Member *
                </label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.user_id || emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.role || emp.designation || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Assigned Property *
                </label>
                <select
                  value={form.property_id}
                  onChange={(e) => setForm({ ...form, property_id: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Select Property...</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Duty Classification *
                </label>
                <select
                  value={form.duty_classification}
                  onChange={(e) => setForm({ ...form, duty_classification: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {DUTY_CLASSIFICATIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Priority Level
                </label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="NORMAL">Normal</option>
                  <option value="IMPORTANT">Important (Notice Dispatched)</option>
                  <option value="URGENT">Urgent (Immediate Mobilization)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Start Date *
                </label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  End Date *
                </label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Shift Hours
                </label>
                <input
                  type="text"
                  value={form.shift_hours}
                  onChange={(e) => setForm({ ...form, shift_hours: e.target.value })}
                  placeholder="08:00 - 17:00"
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Special Operational Instructions
              </label>
              <textarea
                rows={3}
                value={form.special_instructions}
                onChange={(e) => setForm({ ...form, special_instructions: e.target.value })}
                placeholder="e.g. Ensure strict monitoring of 3 VIP check-ins and audit ground floor amenities readiness..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Admin Emergency Override */}
            {isAdmin && (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: '#ef4444' }}>
                  <input
                    type="checkbox"
                    checked={form.is_admin_override}
                    onChange={(e) => setForm({ ...form, is_admin_override: e.target.checked })}
                  />
                  <span>Admin Emergency Override (Bypass Overlap Validation)</span>
                </label>
                {form.is_admin_override && (
                  <input
                    type="text"
                    value={form.override_reason}
                    onChange={(e) => setForm({ ...form, override_reason: e.target.value })}
                    placeholder="Provide mandatory reason for emergency administrative override..."
                    required
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      padding: '0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid #ef4444',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                    }}
                  />
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? 'Assigning & Notifying...' : 'Create Assignment & Dispatch Notice'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
