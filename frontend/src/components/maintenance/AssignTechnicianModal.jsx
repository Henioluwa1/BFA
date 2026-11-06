import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { maintenanceService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function AssignTechnicianModal({
  isOpen,
  onClose,
  workOrder,
  onSuccess,
}) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchingStaff, setFetchingStaff] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [threshold, setThreshold] = useState(5);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [filterEligibility, setFilterEligibility] = useState('ALL'); // ALL, ELIGIBLE_ONLY, ALL_CANDIDATES

  useEffect(() => {
    if (!workOrder || !isOpen) return;

    // Default to current assignee if any
    setSelectedUserId(workOrder.assigned_to_id ? String(workOrder.assigned_to_id) : '');
    setAssignmentNotes('');

    let isMounted = true;
    setFetchingStaff(true);

    maintenanceService
      .getEligibleTechnicians({ propertyId: workOrder.property_id })
      .then((res) => {
        if (!isMounted) return;
        const data = res.data || {};
        const list = Array.isArray(data.technicians) ? data.technicians : [];
        setTechnicians(list);
        if (data.threshold) {
          setThreshold(data.threshold);
        }
      })
      .catch((err) => {
        console.error('Failed to load eligible technicians for property dispatch:', err);
        addToast(`Failed to load technician eligibility: ${err.message}`, 'error');
      })
      .finally(() => {
        if (isMounted) setFetchingStaff(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workOrder, isOpen, addToast]);

  const selectedTechnician = useMemo(() => {
    return technicians.find((t) => String(t.userId) === String(selectedUserId)) || null;
  }, [technicians, selectedUserId]);

  const filteredTechnicians = useMemo(() => {
    if (filterEligibility === 'ELIGIBLE_ONLY') {
      return technicians.filter((t) => t.canDispatch);
    }
    return technicians;
  }, [technicians, filterEligibility]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      addToast('Please select a staff member to assign.', 'error');
      return;
    }

    if (selectedTechnician && !selectedTechnician.canDispatch) {
      addToast(
        `Cannot dispatch: ${selectedTechnician.notes || 'Technician is not eligible under BFA policy.'}`,
        'error'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await maintenanceService.assign(workOrder.id, {
        staffId: parseInt(selectedUserId, 10),
        assigned_to_id: parseInt(selectedUserId, 10),
        notes: assignmentNotes.trim() || undefined,
      });

      const updated = res.data || {};
      let successMsg = `Work order #${workOrder.issue_code} assigned to ${updated.assigned_to || selectedTechnician?.name || 'technician'}.`;

      if (updated.workloadWarning) {
        successMsg += ` (Advisory: ${updated.workloadWarning})`;
      }

      addToast(successMsg, 'success');
      if (onSuccess) onSuccess(updated);
      onClose();
    } catch (err) {
      addToast(`Failed to assign technician: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Eligibility Status Badge Renderer
  const renderEligibilityBadge = (tech) => {
    switch (tech.dispatchEligibility) {
      case 'VERIFIED_ON_DUTY':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#059669',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: '9999px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            🟢 Verified On Duty
          </span>
        );
      case 'CLOCKED_IN_UNVERIFIED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'rgba(14, 165, 233, 0.15)',
              color: '#0284c7',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: '9999px',
              border: '1px solid rgba(14, 165, 233, 0.3)',
            }}
          >
            🔵 Clocked In (Unverified)
          </span>
        );
      case 'ATTENDANCE_UNDER_REVIEW':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#d97706',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: '9999px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            ⚠️ Attendance Under Review
          </span>
        );
      case 'SCHEDULED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#6366f1',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.2rem 0.55rem',
              borderRadius: '9999px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}
          >
            📅 Scheduled Today
          </span>
        );
      case 'NOT_ELIGIBLE':
      default:
        let label = 'Ineligible';
        if (tech.eligibilityReason === 'NO_EMPLOYEE_RECORD') {
          label = 'Onboarding Required';
        } else if (tech.eligibilityReason === 'ON_APPROVED_LEAVE') {
          label = 'On Approved Leave';
        } else if (tech.eligibilityReason?.startsWith('EMPLOYEE_STATUS_')) {
          label = `Inactive (${tech.employee?.status || 'INACTIVE'})`;
        } else {
          label = 'Off Duty / Not Scheduled';
        }
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'rgba(107, 114, 128, 0.12)',
              color: '#6b7280',
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '0.2rem 0.55rem',
              borderRadius: '9999px',
              border: '1px solid rgba(107, 114, 128, 0.25)',
            }}
          >
            ⛔ {label}
          </span>
        );
    }
  };

  if (!workOrder) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Assign Work Order: ${workOrder.issue_code}`}
      maxWidth="620px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={loading || !selectedUserId || (selectedTechnician && !selectedTechnician.canDispatch)}
          >
            {loading ? 'Assigning...' : 'Confirm Assignment'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Work Order Summary */}
        <div
          style={{
            background: 'var(--bg-surface)',
            padding: '0.85rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{workOrder.issue_title}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Property: <strong>{workOrder.property_name}</strong> • Unit:{' '}
            <strong>{workOrder.unit_number ? `Unit ${workOrder.unit_number}` : 'Facility / Common Area'}</strong>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            Current Assignee: <strong>{workOrder.assigned_to || workOrder.assigned_to_name || 'Unassigned'}</strong>
          </div>
        </div>

        {/* Filter & Candidate Count Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Select Property Technician / Staff Member *
          </label>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              onClick={() => setFilterEligibility('ALL')}
              style={{
                fontSize: '0.7rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                border: '1px solid var(--border-default)',
                background: filterEligibility === 'ALL' ? 'var(--brand-accent)' : 'var(--bg-surface)',
                color: filterEligibility === 'ALL' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              All Candidates ({technicians.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterEligibility('ELIGIBLE_ONLY')}
              style={{
                fontSize: '0.7rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                border: '1px solid var(--border-default)',
                background: filterEligibility === 'ELIGIBLE_ONLY' ? 'var(--brand-accent)' : 'var(--bg-surface)',
                color: filterEligibility === 'ELIGIBLE_ONLY' ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Eligible Only ({technicians.filter((t) => t.canDispatch).length})
            </button>
          </div>
        </div>

        {/* Technician Selection Dropdown */}
        <div>
          <select
            required
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={fetchingStaff}
            style={{
              width: '100%',
              padding: '0.65rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              fontSize: '0.85rem',
            }}
          >
            <option value="">{fetchingStaff ? 'Loading property staff & eligibility...' : 'Choose a technician...'}</option>
            {filteredTechnicians.map((t) => {
              const workloadText = `${t.activeWorkload} active`;
              const overloadTag = t.isOverloaded ? ' [⚠️ HIGH WORKLOAD]' : '';
              const stateTag =
                t.dispatchEligibility === 'VERIFIED_ON_DUTY'
                  ? '✓ Verified On Duty'
                  : t.dispatchEligibility === 'CLOCKED_IN_UNVERIFIED'
                  ? 'Clocked In'
                  : t.dispatchEligibility === 'ATTENDANCE_UNDER_REVIEW'
                  ? '⚠️ Geofence Review'
                  : t.dispatchEligibility === 'SCHEDULED'
                  ? 'Scheduled Today'
                  : `⛔ ${t.eligibilityReason || 'Ineligible'}`;

              return (
                <option key={t.userId} value={t.userId}>
                  {t.name} ({t.employee?.employeeCode || t.role}) — {stateTag} — ({workloadText}{overloadTag})
                </option>
              );
            })}
          </select>
        </div>

        {/* Selected Candidate Detailed Inspection Card */}
        {selectedTechnician && (
          <div
            style={{
              background: 'var(--bg-surface)',
              padding: '0.85rem',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${
                selectedTechnician.canDispatch
                  ? selectedTechnician.attendanceWarning
                    ? 'rgba(245, 158, 11, 0.4)'
                    : 'var(--border-default)'
                  : 'rgba(239, 68, 68, 0.3)'
              }`,
              fontSize: '0.82rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{selectedTechnician.name}</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  User #{selectedTechnician.userId} • Role: {selectedTechnician.role} • {selectedTechnician.email}
                </div>
                {selectedTechnician.employee ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    Employee: <strong>{selectedTechnician.employee.fullName}</strong> ({selectedTechnician.employee.employeeCode}) •{' '}
                    {selectedTechnician.employee.department} • {selectedTechnician.employee.jobTitle || 'Technician'}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.15rem', fontWeight: 600 }}>
                    ⚠️ No linked employee record found for this user account (DEC-2.5B-01 Option A).
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                {renderEligibilityBadge(selectedTechnician)}
                {selectedTechnician.isOverloaded && (
                  <span
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#d97706',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '9999px',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    ⚠️ High Workload ({selectedTechnician.activeWorkload} tickets)
                  </span>
                )}
              </div>
            </div>

            {/* Attendance & Shift Details */}
            {selectedTechnician.attendanceDetails && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                ⏰ Clock-in: <strong>{selectedTechnician.attendanceDetails.clockInTime}</strong> ({selectedTechnician.attendanceDetails.clockInMethod || 'KIOSK'}) •{' '}
                {selectedTechnician.attendanceDetails.isVerified ? 'Verified Location' : 'Unverified Location'}
                {selectedTechnician.attendanceDetails.requiresReview ? ' (Review Pending)' : ''}
              </div>
            )}

            {selectedTechnician.shiftDetails && !selectedTechnician.attendanceDetails && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                📅 Scheduled Shift: <strong>{selectedTechnician.shiftDetails.startTime} - {selectedTechnician.shiftDetails.endTime}</strong> ({selectedTechnician.shiftDetails.department})
              </div>
            )}

            {/* Ineligibility Warning Callout */}
            {!selectedTechnician.canDispatch && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  color: '#ef4444',
                  lineHeight: 1.4,
                  fontSize: '0.78rem',
                }}
              >
                ⛔ <strong>Cannot Dispatch:</strong> {selectedTechnician.notes || 'This staff member is not currently eligible for dispatch.'}
                {selectedTechnician.eligibilityReason === 'NO_EMPLOYEE_RECORD' && (
                  <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    In accordance with DEC-2.5B-01 (Option A), formal HR onboarding and an authorized employee record link are mandatory before dispatch eligibility.
                  </div>
                )}
              </div>
            )}

            {/* DEC-2.5B-02: Geofence Review Warning Callout (Permissive Dispatch) */}
            {selectedTechnician.canDispatch && selectedTechnician.attendanceWarning === 'GEOFENCE_REVIEW_PENDING' && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  color: '#b45309',
                  lineHeight: 1.4,
                  fontSize: '0.78rem',
                }}
              >
                ⚠️ <strong>Attendance Geofence Review Pending:</strong> The technician clocked in outside the verified geofence perimeter and their punch is under administrative review.
                <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  In accordance with DEC-2.5B-02 (Option A), dispatch is permitted. An immutable audit record (<code>DISPATCH_WITH_ATTENDANCE_EXCEPTION</code>) will be recorded. Geofence failure is treated as a location exception and not classified as lateness.
                </div>
              </div>
            )}

            {/* DEC-2.5B-03: Advisory Workload Warning Callout */}
            {selectedTechnician.canDispatch && selectedTechnician.isOverloaded && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                  fontSize: '0.78rem',
                }}
              >
                ℹ️ <strong>Advisory Workload Notice (DEC-2.5B-03 Option B):</strong> Technician currently has{' '}
                <strong>{selectedTechnician.activeWorkload}</strong> active work orders (threshold: {threshold}). This warning is advisory and does not restrict dispatch.
              </div>
            )}
          </div>
        )}

        {/* Optional Assignment Notes */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Assignment Instructions or Dispatch Notes (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="Special instructions for the technician upon arrival..."
            value={assignmentNotes}
            onChange={(e) => setAssignmentNotes(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              resize: 'vertical',
              fontSize: '0.82rem',
              marginTop: '0.25rem',
            }}
          />
        </div>

        {/* Policy Register Compliance Notice */}
        <div
          style={{
            background: 'rgba(200, 169, 81, 0.08)',
            border: '1px solid rgba(200, 169, 81, 0.25)',
            padding: '0.65rem 0.8rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
          }}
        >
          ⚖️ <strong>BFA Stage 2.5B Dispatch Governance:</strong> Technician eligibility is strictly enforced by the backend against HR employee profiles (DEC-2.5B-01), verified attendance records, and active rosters. External contractors and vendors remain excluded until Stage 3 (DEC-2.5B-05).
        </div>
      </form>
    </Modal>
  );
}
