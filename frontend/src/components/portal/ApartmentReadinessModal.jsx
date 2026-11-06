import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { apartmentService, maintenanceService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const HOUSEKEEPING_CONFIG = {
  DIRTY: {
    label: 'Dirty (Awaiting Cleaning)',
    badge: 'dirty',
    icon: '🧹',
    color: '#ea580c',
    bg: 'rgba(234, 88, 12, 0.1)',
    border: 'rgba(234, 88, 12, 0.3)',
    desc: 'Room vacated or soiled. Cleaning staff required before any guest assignment.',
    isReady: false,
  },
  CLEANING_IN_PROGRESS: {
    label: 'Cleaning In Progress',
    badge: 'cleaning',
    icon: '⏳',
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.1)',
    border: 'rgba(217, 119, 6, 0.3)',
    desc: 'Housekeeper is currently attending to unit linens, sanitation, and replenishment.',
    isReady: false,
  },
  CLEANED: {
    label: 'Cleaned (Inspection Required)',
    badge: 'pending',
    icon: '🧽',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.1)',
    border: 'rgba(2, 132, 199, 0.3)',
    desc: 'Cleaning finished, but NOT authorized for check-in until supervisor inspects quality.',
    isReady: false,
    warning: 'CLEANED is not INSPECTED_READY. Check-in remains blocked until formal inspection.',
  },
  INSPECTED_READY: {
    label: 'Inspected & Ready',
    badge: 'ready',
    icon: '✨',
    color: '#16a34a',
    bg: 'rgba(22, 163, 74, 0.12)',
    border: 'rgba(22, 163, 74, 0.35)',
    desc: 'Housekeeping supervisor has verified room readiness. Safe for immediate check-in.',
    isReady: true,
  },
};

const MAINTENANCE_CONFIG = {
  OPERATIONAL: {
    label: 'Operational',
    badge: 'available',
    icon: '✓',
    color: '#16a34a',
    desc: 'All electrical, plumbing, HVAC, and fixtures functioning normally.',
  },
  UNDER_REPAIR: {
    label: 'Under Repair',
    badge: 'maintenance',
    icon: '🔧',
    color: '#dc2626',
    desc: 'Active maintenance work in progress. Guest occupancy blocked.',
  },
  INSPECTION_REQUIRED: {
    label: 'Inspection Required',
    badge: 'pending',
    icon: '🔍',
    color: '#d97706',
    desc: 'Facility check required following reported defect or repair completion.',
  },
  OUT_OF_ORDER: {
    label: 'Out of Order',
    badge: 'blocked',
    icon: '⛔',
    color: '#6b7280',
    desc: 'Major equipment fault or overhaul underway. Decommissioned from rotation.',
  },
};

const OCCUPANCY_CONFIG = {
  AVAILABLE: { label: 'Available', badge: 'available', icon: '🟢' },
  READY: { label: 'Ready', badge: 'ready', icon: '✨' },
  RESERVED: { label: 'Reserved', badge: 'reserved', icon: '📅' },
  OCCUPIED: { label: 'Occupied', badge: 'occupied', icon: '👤' },
  MAINTENANCE: { label: 'Maintenance Hold', badge: 'maintenance', icon: '🔧' },
  BLOCKED: { label: 'Blocked Period', badge: 'blocked', icon: '🔒' },
  OUT_OF_SERVICE: { label: 'Out of Service', badge: 'out-of-service', icon: '⛔' },
  DIRTY: { label: 'Dirty Turnover', badge: 'dirty', icon: '🧹' },
  CLEANING: { label: 'Cleaning Turnover', badge: 'cleaning', icon: '⏳' },
};

const CAN_MANAGE_OCCUPANCY_ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'OWNER'];

export default function ApartmentReadinessModal({
  isOpen,
  onClose,
  apartment,
  onUpdated,
}) {
  const { addToast } = useToast();
  const { user } = useAuth();

  const [activeUnit, setActiveUnit] = useState(apartment);
  const [loading, setLoading] = useState(false);
  const [activeTickets, setActiveTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // Dimension Form States
  const [hkSelection, setHkSelection] = useState(apartment?.housekeeping_status || 'DIRTY');
  const [hkNotes, setHkNotes] = useState('');
  const [hkSubmitting, setHkSubmitting] = useState(false);

  const [maintSelection, setMaintSelection] = useState(apartment?.maintenance_status || 'OPERATIONAL');
  const [maintNotes, setMaintNotes] = useState('');
  const [maintSubmitting, setMaintSubmitting] = useState(false);

  const [occSelection, setOccSelection] = useState(apartment?.status || 'AVAILABLE');
  const [occNotes, setOccNotes] = useState('');
  const [occSubmitting, setOccSubmitting] = useState(false);

  useEffect(() => {
    if (apartment) {
      setActiveUnit(apartment);
      setHkSelection(apartment.housekeeping_status || 'DIRTY');
      setMaintSelection(apartment.maintenance_status || 'OPERATIONAL');
      setOccSelection(apartment.status || 'AVAILABLE');
      loadMaintenanceTickets(apartment.id);
    }
  }, [apartment]);

  const loadMaintenanceTickets = async (apartmentId) => {
    if (!apartmentId) return;
    setTicketsLoading(true);
    try {
      const res = await maintenanceService.getAll({ apartmentId });
      const tickets = res.data || [];
      // Filter for active tickets
      const openTickets = tickets.filter(
        (t) => !['RESOLVED', 'CANCELLED'].includes(t.status)
      );
      setActiveTickets(openTickets);
    } catch {
      setActiveTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleUpdateHousekeeping = async () => {
    setHkSubmitting(true);
    try {
      const res = await apartmentService.updateReadiness(activeUnit.id, {
        housekeepingStatus: hkSelection,
        notes: hkNotes || `Housekeeping updated to ${hkSelection} by ${user?.name || user?.role}`,
      });
      const updated = res.data?.data || res.data || {};
      setActiveUnit((prev) => ({ ...prev, ...updated }));
      addToast(`Housekeeping status updated to ${hkSelection}`, 'success');
      setHkNotes('');
      if (onUpdated) onUpdated(updated);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      addToast(`Failed to update housekeeping: ${msg}`, 'error');
    } finally {
      setHkSubmitting(false);
    }
  };

  const handleUpdateMaintenance = async () => {
    setMaintSubmitting(true);
    try {
      const res = await apartmentService.updateReadiness(activeUnit.id, {
        maintenanceStatus: maintSelection,
        notes: maintNotes || `Maintenance updated to ${maintSelection} by ${user?.name || user?.role}`,
      });
      const updated = res.data?.data || res.data || {};
      setActiveUnit((prev) => ({ ...prev, ...updated }));
      addToast(`Maintenance condition updated to ${maintSelection}`, 'success');
      setMaintNotes('');
      loadMaintenanceTickets(activeUnit.id);
      if (onUpdated) onUpdated(updated);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      addToast(`Failed to update maintenance: ${msg}`, 'error');
    } finally {
      setMaintSubmitting(false);
    }
  };

  const userRole = (user?.role || '').toUpperCase();
  const canEditOccupancy = CAN_MANAGE_OCCUPANCY_ROLES.includes(userRole);

  const handleUpdateOccupancy = async () => {
    if (!canEditOccupancy) {
      addToast('Unauthorized: Only management roles (Admin / Operations Manager / Owner) can manually adjust unit occupancy.', 'error');
      return;
    }
    setOccSubmitting(true);
    try {
      const res = await apartmentService.updateStatus(activeUnit.id, {
        status: occSelection,
        notes: occNotes || `Occupancy state transitioned to ${occSelection} by ${user?.name || user?.role}`,
      });
      const updated = res.data?.data || res.data || {};
      setActiveUnit((prev) => ({ ...prev, ...updated }));
      addToast(`Occupancy operational state updated to ${occSelection}`, 'success');
      setOccNotes('');
      if (onUpdated) onUpdated(updated);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      addToast(`Failed to update occupancy: ${msg}`, 'error');
    } finally {
      setOccSubmitting(false);
    }
  };

  if (!isOpen || !activeUnit) return null;

  const currentHk = HOUSEKEEPING_CONFIG[activeUnit.housekeeping_status] || HOUSEKEEPING_CONFIG.DIRTY;
  const currentMaint = MAINTENANCE_CONFIG[activeUnit.maintenance_status] || MAINTENANCE_CONFIG.OPERATIONAL;
  const currentOcc = OCCUPANCY_CONFIG[activeUnit.status] || { label: activeUnit.status, badge: 'neutral', icon: '🏷️' };

  // Calculate blocking tickets
  const blockingTickets = activeTickets.filter(
    (t) => t.blocking_unit === 1 || t.blocking_unit === true || t.priority === 'CRITICAL'
  );

  // Overall Readiness Evaluation (All 3 independent dimensions must align)
  const isCheckInPermitted =
    ['AVAILABLE', 'READY'].includes(activeUnit.status) &&
    activeUnit.housekeeping_status === 'INSPECTED_READY' &&
    activeUnit.maintenance_status === 'OPERATIONAL' &&
    blockingTickets.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon="🏢"
      title={`Decoupled Room Readiness — Unit ${activeUnit.unit_number}`}
      subtitle={`${activeUnit.property_name || 'Property'} • ${activeUnit.unit_name || activeUnit.unit_type} (ID #${activeUnit.id})`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* 1. Global Decoupled Readiness Summary Banner */}
        <div
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            background: isCheckInPermitted ? 'rgba(22, 163, 74, 0.08)' : 'rgba(234, 88, 12, 0.08)',
            border: `1px solid ${isCheckInPermitted ? 'rgba(22, 163, 74, 0.3)' : 'rgba(234, 88, 12, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>{isCheckInPermitted ? '✅' : '⚠️'}</span>
              <strong style={{ fontSize: '0.95rem', color: isCheckInPermitted ? '#15803d' : '#c2410c' }}>
                {isCheckInPermitted
                  ? 'All 3 Dimensions Satisfied — Safe for Guest Check-In'
                  : 'Room Readiness Restricted — Check-In Guarded'}
              </strong>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {isCheckInPermitted
                ? 'Unit is inspected, operational, and unoccupied. The backend 5-part invariant will authorize check-in.'
                : 'One or more operational dimensions are unsatisfied. Never mark a unit ready based on single status conflation.'}
            </p>
          </div>

          {/* Tri-Dimensional Badges Row */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                background: currentOcc.icon ? 'rgba(30, 92, 153, 0.1)' : 'var(--bg-card)',
                color: 'var(--brand-accent)',
                border: '1px solid rgba(30, 92, 153, 0.25)',
              }}
              title="Guest Occupancy Dimension"
            >
              Occupancy: {currentOcc.label}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                background: currentHk.bg,
                color: currentHk.color,
                border: `1px solid ${currentHk.border}`,
              }}
              title="Housekeeping Readiness Dimension"
            >
              HK: {currentHk.label}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                background: currentMaint.color === '#16a34a' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                color: currentMaint.color,
                border: `1px solid ${currentMaint.color === '#16a34a' ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`,
              }}
              title="Maintenance Condition Dimension"
            >
              Mnt: {currentMaint.label}
            </span>
          </div>
        </div>

        {/* 2. Active Blocking Maintenance Alert Banner (If Any) */}
        {blockingTickets.length > 0 && (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: '#fef2f2',
              border: '1px solid #f87171',
              color: '#991b1b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.85rem' }}>
              <span>🛑</span>
              <span>CRITICAL / BLOCKING MAINTENANCE IN EFFECT ({blockingTickets.length} Active Work Order)</span>
            </div>
            <ul style={{ margin: '0.4rem 0 0 1.25rem', padding: 0, fontSize: '0.8rem', lineHeight: 1.5 }}>
              {blockingTickets.map((t) => (
                <li key={t.id}>
                  <strong>{t.issue_code || `#${t.id}`}</strong>: {t.issue_title} ({t.priority} priority, blocking_unit: {t.blocking_unit ? '1' : '0'}) — <em>Backend check-in invariant will reject arrival with 409 Conflict</em>.
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 3. Three Decoupled Dimension Panels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Dimension 1: Housekeeping Lifecycle */}
          <div
            style={{
              padding: '1rem',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '1.1rem' }}>🧹</span>
                <strong style={{ fontSize: '0.9rem' }}>Housekeeping Status</strong>
              </div>
              <Badge status={currentHk.badge}>{currentHk.label}</Badge>
            </div>

            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                padding: '0.5rem',
                background: currentHk.bg,
                borderRadius: '4px',
                border: `1px solid ${currentHk.border}`,
              }}
            >
              {currentHk.desc}
              {currentHk.warning && (
                <div style={{ marginTop: '0.25rem', color: '#c2410c', fontWeight: 700 }}>
                  ⚠️ {currentHk.warning}
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Select Housekeeping Phase:
              </label>
              <select
                className="form-control"
                value={hkSelection}
                onChange={(e) => setHkSelection(e.target.value)}
                style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
              >
                <option value="DIRTY">DIRTY — Vacated, cleaning required</option>
                <option value="CLEANING_IN_PROGRESS">CLEANING_IN_PROGRESS — Maid on-site</option>
                <option value="CLEANED">CLEANED — Cleaning done, AWAITING INSPECTION</option>
                <option value="INSPECTED_READY">INSPECTED_READY — Verified & approved for arrival</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Housekeeping Log Note (Optional):
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Master bed turned over, fresh linens."
                value={hkNotes}
                onChange={(e) => setHkNotes(e.target.value)}
                style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
              />
            </div>

            <Button
              variant="primary"
              size="sm"
              loading={hkSubmitting}
              disabled={hkSubmitting || hkSelection === activeUnit.housekeeping_status}
              onClick={handleUpdateHousekeeping}
              style={{ marginTop: 'auto' }}
            >
              {hkSelection === 'INSPECTED_READY' ? '✨ Approve Inspection & Ready' : 'Update Housekeeping Only'}
            </Button>
          </div>

          {/* Dimension 2: Maintenance Condition */}
          <div
            style={{
              padding: '1rem',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '1.1rem' }}>🔧</span>
                <strong style={{ fontSize: '0.9rem' }}>Maintenance Condition</strong>
              </div>
              <Badge status={currentMaint.badge}>{currentMaint.label}</Badge>
            </div>

            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                padding: '0.5rem',
                background: currentMaint.color === '#16a34a' ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)',
                borderRadius: '4px',
                border: `1px solid ${currentMaint.color === '#16a34a' ? 'rgba(22, 163, 74, 0.25)' : 'rgba(220, 38, 38, 0.25)'}`,
              }}
            >
              {currentMaint.desc}
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Select Maintenance Condition:
              </label>
              <select
                className="form-control"
                value={maintSelection}
                onChange={(e) => setMaintSelection(e.target.value)}
                style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
              >
                <option value="OPERATIONAL">OPERATIONAL — All equipment functional</option>
                <option value="INSPECTION_REQUIRED">INSPECTION_REQUIRED — Preventive/follow-up check</option>
                <option value="UNDER_REPAIR">UNDER_REPAIR — Active work order repairs</option>
                <option value="OUT_OF_ORDER">OUT_OF_ORDER — Major outage / decommissioned</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Maintenance Note (Optional):
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. AC cooling pressure tested 100% OK."
                value={maintNotes}
                onChange={(e) => setMaintNotes(e.target.value)}
                style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              loading={maintSubmitting}
              disabled={maintSubmitting || maintSelection === activeUnit.maintenance_status}
              onClick={handleUpdateMaintenance}
              style={{ marginTop: 'auto' }}
            >
              Update Maintenance Only
            </Button>
          </div>

          {/* Dimension 3: Guest Occupancy Status */}
          <div
            style={{
              padding: '1rem',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '1.1rem' }}>👤</span>
                <strong style={{ fontSize: '0.9rem' }}>Occupancy State</strong>
              </div>
              <Badge status={currentOcc.badge}>{currentOcc.label}</Badge>
            </div>

            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                padding: '0.5rem',
                background: 'var(--bg-surface)',
                borderRadius: '4px',
                border: '1px solid var(--border-default)',
              }}
            >
              Physical guest occupancy state. Automatically switches to <strong>OCCUPIED</strong> during Check-In, and to <strong>DIRTY</strong> during Check-Out.
            </div>

            {canEditOccupancy ? (
              <>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Operational State:
                  </label>
                  <select
                    className="form-control"
                    value={occSelection}
                    onChange={(e) => setOccSelection(e.target.value)}
                    style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
                  >
                    <option value="AVAILABLE">AVAILABLE — Vacant & ready for assignment</option>
                    <option value="READY">READY — Housekeeping verified</option>
                    <option value="OCCUPIED">OCCUPIED — In-house resident</option>
                    <option value="MAINTENANCE">MAINTENANCE — Off-market for overhaul</option>
                    <option value="BLOCKED">BLOCKED — Operational management hold</option>
                    <option value="OUT_OF_SERVICE">OUT_OF_SERVICE — Decommissioned</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Occupancy Reason (Optional):
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Cleared for incoming arrival."
                    value={occNotes}
                    onChange={(e) => setOccNotes(e.target.value)}
                    style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  loading={occSubmitting}
                  disabled={occSubmitting || occSelection === activeUnit.status}
                  onClick={handleUpdateOccupancy}
                  style={{ marginTop: 'auto' }}
                >
                  Update Occupancy Only
                </Button>
              </>
            ) : (
              <div
                style={{
                  marginTop: 'auto',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '4px',
                  background: 'rgba(100, 116, 139, 0.08)',
                  border: '1px solid rgba(100, 116, 139, 0.25)',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>🔒</span> Read-Only Operational State (Management Only)
                </div>
                <span>
                  Front office receptionists and cleaning staff cannot manually override occupancy states. Physical occupancy is transitioned automatically upon guest Check-In/Check-Out or by Operations Management.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4. Footer & Close */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--border-default)', paddingTop: '0.75rem' }}>
          <Button variant="outline" onClick={onClose}>
            Close Readiness Console
          </Button>
        </div>
      </div>
    </Modal>
  );
}
