import React, { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Clock, User, AlertTriangle, AlertCircle, ShieldCheck } from '../ui/Icons';
import { workforceService } from '../../services/api';

const STANDARD_REASONS = [
  'Device malfunction / unresponsive hardware',
  'Employee forgot mobile device',
  'Mobile battery depleted on-site',
  'Field assignment / Off-site property duty',
  'Network connectivity interruption',
  'Kiosk terminal offline',
  'Supervisor authorized exception',
  'Other administrative adjustment',
];

export default function ManualPunchModal({
  isOpen,
  onClose,
  properties = [],
  employees = [],
  currentUser,
  activePropertyId,
  onSuccess,
}) {
  const isOpsManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(currentUser?.role);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const defaultPropId = isOpsManager
    ? (currentUser?.propertyId || currentUser?.property_id || activePropertyId || '1')
    : (activePropertyId !== 'all' ? activePropertyId : (properties[0]?.id || '1'));

  const [form, setForm] = useState({
    employeeId: '',
    propertyId: defaultPropId,
    workDate: todayStr,
    clockInTime: '08:00',
    clockOutTime: '',
    breakMinutes: 0,
    reasonCategory: STANDARD_REASONS[0],
    customReason: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Selected employee object
  const selectedEmployee = useMemo(() => {
    return employees.find((e) => String(e.id) === String(form.employeeId)) || null;
  }, [employees, form.employeeId]);

  // Maker-checker violation check: Cannot log manual punch for self
  const isSelfPunch = useMemo(() => {
    if (!selectedEmployee || !currentUser) return false;
    return selectedEmployee.user_id === currentUser.id || selectedEmployee.email === currentUser.email;
  }, [selectedEmployee, currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employeeId) {
      setError('Please select an employee.');
      return;
    }
    if (isSelfPunch) {
      setError('Maker-checker violation: Operations Managers cannot record their own attendance.');
      return;
    }

    const fullReason = form.customReason.trim()
      ? `${form.reasonCategory}: ${form.customReason.trim()}`
      : form.reasonCategory;

    setLoading(true);
    setError(null);

    try {
      // Build ISO timestamps from date and times
      const clockInISO = `${form.workDate}T${form.clockInTime}:00`;
      const clockOutISO = form.clockOutTime ? `${form.workDate}T${form.clockOutTime}:00` : null;

      await workforceService.recordManualAttendance({
        employeeId: Number(form.employeeId),
        propertyId: Number(form.propertyId),
        workDate: form.workDate,
        clockInTime: clockInISO,
        clockOutTime: clockOutISO,
        breakMinutes: Number(form.breakMinutes || 0),
        reason: fullReason,
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Manual punch error:', err);
      setError(err.message || 'Failed to record manual attendance punch.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Manager-Assisted Attendance"
      subtitle="Authorized managerial punch entry for on-site staff exceptions"
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              color: '#ef4444',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.4rem',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{error}</div>
          </div>
        )}

        {/* Audit Attribution Notice */}
        <div
          style={{
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
          }}
        >
          <ShieldCheck size={16} style={{ color: 'var(--primary-color, #10b981)', flexShrink: 0 }} />
          <div>
            Logged under managerial audit by <strong>{currentUser?.name || currentUser?.email}</strong>.
            This record will be permanently flagged as <strong>MANUAL</strong> with verification notes.
          </div>
        </div>

        {/* Property & Employee Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label className="input-label" style={{ fontSize: '0.78rem' }}>Property</label>
            <select
              className="input-field"
              value={form.propertyId}
              onChange={(e) => setForm({ ...form, propertyId: e.target.value })}
              disabled={isOpsManager}
              required
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name || `Property #${p.id}`}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label" style={{ fontSize: '0.78rem' }}>Employee *</label>
            <select
              className="input-field"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              required
            >
              <option value="">Select Staff Member...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.employee_code || `EMP-${emp.id}`})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Self-Punch Warning */}
        {isSelfPunch && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              color: '#ef4444',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>Maker-Checker Policy: Operations Managers cannot record their own attendance.</span>
          </div>
        )}

        {/* Date and Timing Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label className="input-label" style={{ fontSize: '0.78rem' }}>Attendance Date *</label>
            <input
              type="date"
              className="input-field"
              value={form.workDate}
              onChange={(e) => setForm({ ...form, workDate: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="input-label" style={{ fontSize: '0.78rem' }}>Clock-In Time *</label>
            <input
              type="time"
              className="input-field"
              value={form.clockInTime}
              onChange={(e) => setForm({ ...form, clockInTime: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="input-label" style={{ fontSize: '0.78rem' }}>Clock-Out Time (Optional)</label>
            <input
              type="time"
              className="input-field"
              value={form.clockOutTime}
              onChange={(e) => setForm({ ...form, clockOutTime: e.target.value })}
            />
          </div>
        </div>

        {/* Break Duration */}
        <div>
          <label className="input-label" style={{ fontSize: '0.78rem' }}>Total Break Duration (Minutes)</label>
          <input
            type="number"
            min="0"
            max="240"
            step="15"
            className="input-field"
            value={form.breakMinutes}
            onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })}
          />
        </div>

        {/* Reason for Managerial Intervention */}
        <div>
          <label className="input-label" style={{ fontSize: '0.78rem' }}>Reason for Intervention *</label>
          <select
            className="input-field"
            value={form.reasonCategory}
            onChange={(e) => setForm({ ...form, reasonCategory: e.target.value })}
            required
          >
            {STANDARD_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="input-label" style={{ fontSize: '0.78rem' }}>Additional Managerial Notes</label>
          <input
            type="text"
            placeholder="e.g. Employee verified on-site at Front Desk by Chief Security"
            className="input-field"
            value={form.customReason}
            onChange={(e) => setForm({ ...form, customReason: e.target.value })}
          />
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={isSelfPunch || !form.employeeId}
          >
            Record Manual Punch
          </Button>
        </div>
      </form>
    </Modal>
  );
}

