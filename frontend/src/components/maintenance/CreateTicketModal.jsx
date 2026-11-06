import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { maintenanceService, apartmentService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const VALID_CATEGORIES = [
  { value: 'PLUMBING', label: '🚰 Plumbing' },
  { value: 'ELECTRICAL', label: '⚡ Electrical' },
  { value: 'HVAC', label: '❄️ HVAC / Air Conditioning' },
  { value: 'CARPENTRY', label: '🪚 Carpentry' },
  { value: 'APPLIANCE', label: '🔌 Appliance' },
  { value: 'PAINTING', label: '🎨 Painting & Finishing' },
  { value: 'CLEANING', label: '🧹 Deep Cleaning' },
  { value: 'GENERAL', label: '🔧 General Facility' },
];

const VALID_PRIORITIES = [
  { value: 'LOW', label: '🟢 Low Priority' },
  { value: 'MEDIUM', label: '🟡 Medium Priority' },
  { value: 'HIGH', label: '🟠 High Priority' },
  { value: 'CRITICAL', label: '🔴 Critical (Emergency - Auto-Blocks Unit)' },
];

export default function CreateTicketModal({
  isOpen,
  onClose,
  onSuccess,
  properties = [],
  initialPropertyId = '',
  initialApartmentId = '',
}) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [apartments, setApartments] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [threshold, setThreshold] = useState(5);
  const [loadingUnits, setLoadingUnits] = useState(false);

  const [form, setForm] = useState({
    property_id: initialPropertyId || (properties[0]?.id ? String(properties[0].id) : ''),
    apartment_id: initialApartmentId || '',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    issue_title: '',
    description: '',
    estimated_cost: '',
    blocking_unit: true,
    assigned_to_id: '',
  });

  // Keep property_id updated when initialPropertyId changes
  useEffect(() => {
    if (initialPropertyId) {
      setForm((prev) => ({
        ...prev,
        property_id: String(initialPropertyId),
        apartment_id: initialApartmentId ? String(initialApartmentId) : prev.apartment_id,
      }));
    } else if (!form.property_id && properties.length > 0) {
      setForm((prev) => ({ ...prev, property_id: String(properties[0].id) }));
    }
  }, [initialPropertyId, initialApartmentId, properties]);

  // Load apartments and eligible property technicians when selected property changes
  useEffect(() => {
    if (!form.property_id) {
      setApartments([]);
      setTechnicians([]);
      return;
    }

    let isMounted = true;
    setLoadingUnits(true);

    Promise.all([
      apartmentService.getAll({ propertyId: form.property_id }).catch(() => ({ data: [] })),
      maintenanceService.getEligibleTechnicians({ propertyId: form.property_id }).catch(() => ({ data: {} })),
    ])
      .then(([aptRes, techRes]) => {
        if (!isMounted) return;
        const apts = Array.isArray(aptRes.data) ? aptRes.data : [];
        setApartments(apts);

        const techData = techRes.data || {};
        const techList = Array.isArray(techData.technicians) ? techData.technicians : [];
        setTechnicians(techList);
        if (techData.threshold) {
          setThreshold(techData.threshold);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingUnits(false);
      });

    return () => {
      isMounted = false;
    };
  }, [form.property_id]);

  // Priority CRITICAL forces blocking_unit to true
  useEffect(() => {
    if (form.priority === 'CRITICAL') {
      setForm((prev) => ({ ...prev, blocking_unit: true }));
    }
  }, [form.priority]);

  // Selected apartment metadata for occupancy check
  const selectedApartment = apartments.find((a) => String(a.id) === String(form.apartment_id));
  const isUnitOccupied = selectedApartment && (selectedApartment.status === 'OCCUPIED' || selectedApartment.is_occupied === 1);

  // Selected technician metadata
  const selectedTechnician = useMemo(() => {
    return technicians.find((t) => String(t.userId) === String(form.assigned_to_id)) || null;
  }, [technicians, form.assigned_to_id]);

  const eligibleTechnicians = useMemo(() => technicians.filter((t) => t.canDispatch), [technicians]);
  const ineligibleTechnicians = useMemo(() => technicians.filter((t) => !t.canDispatch), [technicians]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.property_id || !form.issue_title.trim()) {
      addToast('Property and issue title are required.', 'error');
      return;
    }

    if (selectedTechnician && !selectedTechnician.canDispatch) {
      addToast(`Cannot assign technician: ${selectedTechnician.notes || 'Selected staff member is not eligible for dispatch.'}`, 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        property_id: parseInt(form.property_id, 10),
        apartment_id: form.apartment_id ? parseInt(form.apartment_id, 10) : null,
        category: form.category,
        priority: form.priority,
        issue_title: form.issue_title.trim(),
        description: form.description.trim() || null,
        estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : 0,
        blocking_unit: form.priority === 'CRITICAL' ? true : Boolean(form.blocking_unit),
        assigned_to_id: form.assigned_to_id ? parseInt(form.assigned_to_id, 10) : null,
      };

      const res = await maintenanceService.create(payload);
      let successMsg = `Work Order ${res.data?.issue_code || ''} created successfully!`;
      if (payload.blocking_unit && payload.apartment_id) {
        successMsg += ' Unit operational status transitioned to MAINTENANCE.';
      }
      if (selectedTechnician?.isOverloaded) {
        successMsg += ` (Advisory: Technician has ${selectedTechnician.activeWorkload} active tickets)`;
      }

      addToast(successMsg, 'success');
      if (onSuccess) onSuccess(res.data);
      onClose();
    } catch (err) {
      addToast(`Failed to create work order: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Property Maintenance Work Order"
      maxWidth="680px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={loading || (selectedTechnician && !selectedTechnician.canDispatch)}
          >
            {loading ? 'Creating Work Order...' : 'Log Work Order'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Property & Unit Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Property *
            </label>
            <select
              required
              value={form.property_id}
              onChange={(e) => setForm({ ...form, property_id: e.target.value, apartment_id: '', assigned_to_id: '' })}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Apartment Unit (Optional - leave blank for facility/common areas)
            </label>
            <select
              value={form.apartment_id}
              onChange={(e) => setForm({ ...form, apartment_id: e.target.value })}
              disabled={loadingUnits}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            >
              <option value="">{loadingUnits ? 'Loading property units...' : 'Common Area / Entire Facility'}</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  Unit {a.unit_number} ({a.apartment_type || 'Apartment'}) — {a.status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Occupied Unit Safety Alert */}
        {isUnitOccupied && (
          <div
            style={{
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <div>
              <strong>Active Guest In-House Warning:</strong> Unit {selectedApartment.unit_number} is currently marked as{' '}
              <strong>OCCUPIED</strong>. Ensure Front Desk notification and guest consent before scheduling technician entry.
            </div>
          </div>
        )}

        {/* Category & Priority Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Maintenance Category *
            </label>
            <select
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            >
              {VALID_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Priority Level *
            </label>
            <select
              required
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            >
              {VALID_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Issue Title */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Issue Title *
          </label>
          <input
            type="text"
            required
            placeholder="e.g., Master Bathroom Shower Head Valve Leaking"
            value={form.issue_title}
            onChange={(e) => setForm({ ...form, issue_title: e.target.value })}
            style={{
              width: '100%',
              padding: '0.55rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Detailed Description */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Detailed Description & Symptoms
          </label>
          <textarea
            rows={3}
            placeholder="Provide specific defect details, exact location within unit, and technician instructions..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{
              width: '100%',
              maxWidth: '100%',
              padding: '0.55rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Estimated Cost & Assign Staff */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Estimated Repair Cost (₦)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.estimated_cost}
              onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Initial Assignee (Eligible Property Technician)
            </label>
            <select
              value={form.assigned_to_id}
              onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value })}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            >
              <option value="">Unassigned (Queue for Dispatch)</option>
              {eligibleTechnicians.length > 0 && (
                <optgroup label="Eligible Technicians (On Duty / Scheduled)">
                  {eligibleTechnicians.map((t) => (
                    <option key={t.userId} value={t.userId}>
                      {t.name} ({t.employee?.employeeCode || t.role}) — {t.dispatchEligibility === 'VERIFIED_ON_DUTY' ? 'Verified On Duty' : t.dispatchEligibility === 'ATTENDANCE_UNDER_REVIEW' ? 'Geofence Review' : 'Scheduled'} ({t.activeWorkload} active{t.isOverloaded ? ' - High Workload' : ''})
                    </option>
                  ))}
                </optgroup>
              )}
              {ineligibleTechnicians.length > 0 && (
                <optgroup label="Ineligible Staff (Onboarding Required / On Leave / Off Duty)">
                  {ineligibleTechnicians.map((t) => (
                    <option key={t.userId} value={t.userId} disabled>
                      ⛔ {t.name} — {t.eligibilityReason === 'NO_EMPLOYEE_RECORD' ? 'No HR Profile Linked' : t.eligibilityReason === 'ON_APPROVED_LEAVE' ? 'On Leave' : 'Off Duty'}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* Selected Assignee Feedback Banners */}
        {selectedTechnician && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem' }}>
            {selectedTechnician.attendanceWarning === 'GEOFENCE_REVIEW_PENDING' && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  color: '#b45309',
                }}
              >
                ⚠️ <strong>Attendance Geofence Review Pending:</strong> Clock-in was outside geofence. Dispatch is permitted under DEC-2.5B-02 Option A with audit logging.
              </div>
            )}
            {selectedTechnician.isOverloaded && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                }}
              >
                ℹ️ <strong>Advisory Workload Notice:</strong> Technician currently has {selectedTechnician.activeWorkload} active work orders (threshold: {threshold}). Assignment is permitted.
              </div>
            )}
          </div>
        )}

        {/* Unit Blocking Control */}
        <div
          style={{
            padding: '0.75rem',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={form.blocking_unit}
              disabled={form.priority === 'CRITICAL'}
              onChange={(e) => setForm({ ...form, blocking_unit: e.target.checked })}
            />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              Block Unit Availability (Place in MAINTENANCE Status)
            </span>
          </label>
          <p style={{ margin: '0.35rem 0 0 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            When enabled, the backend automatically transitions the apartment to <code>MAINTENANCE</code>. The reservation
            engine enforces this block server-side to prevent new guest bookings until all blocking work orders are resolved.
          </p>
        </div>

        {/* Repair Evidence Readiness Notice */}
        <div
          style={{
            background: 'rgba(200, 169, 81, 0.08)',
            border: '1px solid rgba(200, 169, 81, 0.25)',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
          }}
        >
          📷 <strong>Private Repair Evidence Ready:</strong> Repair evidence photos (JPEG/PNG/WebP up to 10 MB) can be
          attached directly in the Work Order Details drawer after logging this ticket, or uploaded by the technician upon repair resolution.
        </div>
      </form>
    </Modal>
  );
}
