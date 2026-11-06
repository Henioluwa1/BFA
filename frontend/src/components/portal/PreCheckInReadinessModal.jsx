import React, { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { apartmentService, maintenanceService, frontOfficeService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import ApartmentReadinessModal from './ApartmentReadinessModal';

const ALLOWED_OCCUPANCY = ['AVAILABLE', 'READY'];
const ALLOWED_HOUSEKEEPING = 'INSPECTED_READY';
const ALLOWED_MAINTENANCE = 'OPERATIONAL';

export default function PreCheckInReadinessModal({
  isOpen,
  onClose,
  reservation,
  onSuccess,
}) {
  const { addToast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [apartmentData, setApartmentData] = useState(null);
  const [apartmentError, setApartmentError] = useState(null);
  const [activeTickets, setActiveTickets] = useState(null); // null = uninitialized/error, array = loaded
  const [maintenanceError, setMaintenanceError] = useState(null);
  const [showReadinessModal, setShowReadinessModal] = useState(false);

  // Request race-condition guard
  const activeRequestRef = useRef(0);

  // Fetch real-time apartment state and maintenance tickets
  useEffect(() => {
    if (isOpen && reservation?.apartment_id) {
      loadSafetyData(reservation.apartment_id);
    } else {
      setApartmentData(null);
      setApartmentError(null);
      setActiveTickets(null);
      setMaintenanceError(null);
      setErrorMessage(null);
    }
  }, [isOpen, reservation]);

  const loadSafetyData = async (apartmentId) => {
    const reqId = ++activeRequestRef.current;
    setLoading(true);
    setErrorMessage(null);
    setApartmentError(null);
    setMaintenanceError(null);

    try {
      const [aptResult, maintResult] = await Promise.allSettled([
        apartmentService.getById(apartmentId),
        maintenanceService.getAll({ apartmentId }),
      ]);

      if (reqId !== activeRequestRef.current) return;

      // 1. Process Apartment response
      if (aptResult.status === 'fulfilled') {
        const apt = aptResult.value.data?.data || aptResult.value.data || {};
        setApartmentData(apt);
        setApartmentError(null);
      } else {
        const err = aptResult.reason;
        const msg =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Failed to retrieve apartment record';
        setApartmentData(null);
        setApartmentError(msg);
      }

      // 2. Process Maintenance response (FAIL-CLOSED: no fallback empty list on failure)
      if (maintResult.status === 'fulfilled') {
        const mData = maintResult.value.data;
        const allTickets = Array.isArray(mData) ? mData : mData?.data || [];
        const openTickets = allTickets.filter(
          (t) => !['RESOLVED', 'CANCELLED'].includes(t.status)
        );
        setActiveTickets(openTickets);
        setMaintenanceError(null);
      } else {
        const err = maintResult.reason;
        const msg =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          err.message ||
          'Failed to query maintenance records';
        setActiveTickets(null);
        setMaintenanceError(msg);
      }
    } catch (err) {
      if (reqId !== activeRequestRef.current) return;
      const msg = err.message || 'Unexpected error loading room readiness';
      setErrorMessage(`Failed to verify apartment safety data: ${msg}`);
      addToast('Could not fetch real-time room readiness', 'error');
    } finally {
      if (reqId === activeRequestRef.current) {
        setLoading(false);
      }
    }
  };

  // Evaluate the Invariant Gates
  const evaluateInvariants = () => {
    const occStatus = (apartmentData?.status || '').toUpperCase();
    const hkStatus = (apartmentData?.housekeeping_status || '').toUpperCase();
    const maintStatus = (apartmentData?.maintenance_status || '').toUpperCase();

    // 1. Occupancy allowlist
    let gate1Passed = false;
    let gate1Detail = '';
    if (apartmentError || !apartmentData) {
      gate1Detail = `Apartment data unavailable (${apartmentError || 'Failed to load'}).`;
    } else {
      gate1Passed = ALLOWED_OCCUPANCY.includes(occStatus);
      gate1Detail = `Current: ${occStatus || 'UNKNOWN'} (Requires: AVAILABLE or READY)`;
      if (occStatus === 'OCCUPIED') {
        gate1Detail = 'Unit is currently OCCUPIED by another guest. Check-out must be completed first.';
      } else if (occStatus === 'MAINTENANCE') {
        gate1Detail = 'Unit is marked under MAINTENANCE hold.';
      } else if (['BLOCKED', 'OUT_OF_SERVICE'].includes(occStatus)) {
        gate1Detail = `Unit is marked ${occStatus}. Cannot be assigned to guests.`;
      }
    }

    // 2. Housekeeping allowlist
    let gate2Passed = false;
    let gate2Detail = '';
    if (apartmentError || !apartmentData) {
      gate2Detail = `Housekeeping data unavailable (${apartmentError || 'Failed to load'}).`;
    } else {
      gate2Passed = hkStatus === ALLOWED_HOUSEKEEPING;
      gate2Detail = `Current: ${hkStatus || 'UNKNOWN'} (Requires: INSPECTED_READY)`;
      if (hkStatus === 'CLEANED') {
        gate2Detail = 'Unit is CLEANED but pending supervisor inspection. Must be marked INSPECTED_READY before check-in.';
      } else if (['DIRTY', 'CLEANING_IN_PROGRESS'].includes(hkStatus)) {
        gate2Detail = `Unit turnover in progress (${hkStatus}). Cleaning staff required.`;
      }
    }

    // 3. Maintenance allowlist
    let gate3Passed = false;
    let gate3Detail = '';
    if (apartmentError || !apartmentData) {
      gate3Detail = `Maintenance state unavailable (${apartmentError || 'Failed to load'}).`;
    } else {
      gate3Passed = maintStatus === ALLOWED_MAINTENANCE;
      gate3Detail = `Current: ${maintStatus || 'UNKNOWN'} (Requires: OPERATIONAL)`;
      if (['UNDER_REPAIR', 'OUT_OF_ORDER'].includes(maintStatus)) {
        gate3Detail = `Unit maintenance state is ${maintStatus}. Facility repair required.`;
      }
    }

    // 4. Zero Active Blocking Tickets (FAIL-CLOSED)
    let gate4Passed = false;
    let gate4Detail = '';
    let blockingTickets = [];
    if (maintenanceError !== null || activeTickets === null) {
      gate4Detail = `Work order status unavailable: ${maintenanceError || 'Maintenance query failed'}. Check-in blocked.`;
    } else {
      blockingTickets = activeTickets.filter(
        (t) => (t.blocking_unit === 1 || t.blocking_unit === true) || (t.priority === 'CRITICAL')
      );
      gate4Passed = blockingTickets.length === 0;
      gate4Detail = gate4Passed
        ? '0 blocking maintenance work orders.'
        : `${blockingTickets.length} active ticket(s) block occupancy (CRITICAL priority or blocking_unit=1).`;
    }

    // 5. Reservation Confirmation Status (Renamed & corrected for C-2.6-F02)
    const resStatus = (reservation?.status || '').toUpperCase();
    const gate5Passed = resStatus === 'CONFIRMED';
    const gate5Detail = gate5Passed
      ? 'Booking is CONFIRMED and eligible for arrival. (Absence of overlapping in-house stays is authoritatively enforced by backend transaction upon check-in submission).'
      : `Reservation status is '${resStatus || 'UNKNOWN'}'. Only CONFIRMED reservations can be checked in.`;

    const gates = [
      {
        id: 'gate-1',
        name: '1. Occupancy Readiness',
        description: 'Unit occupancy status must be AVAILABLE or READY',
        current: apartmentData ? occStatus : 'UNAVAILABLE',
        required: 'AVAILABLE or READY',
        passed: gate1Passed,
        detail: gate1Detail,
      },
      {
        id: 'gate-2',
        name: '2. Housekeeping Verification',
        description: 'Housekeeping status must be INSPECTED_READY',
        current: apartmentData ? hkStatus : 'UNAVAILABLE',
        required: 'INSPECTED_READY',
        passed: gate2Passed,
        detail: gate2Detail,
        isWarning: hkStatus === 'CLEANED',
      },
      {
        id: 'gate-3',
        name: '3. Facility Maintenance',
        description: 'Maintenance status must be OPERATIONAL',
        current: apartmentData ? maintStatus : 'UNAVAILABLE',
        required: 'OPERATIONAL',
        passed: gate3Passed,
        detail: gate3Detail,
      },
      {
        id: 'gate-4',
        name: '4. Maintenance Work Orders',
        description: 'Zero active tickets with priority CRITICAL or blocking_unit = 1',
        current: maintenanceError ? 'UNAVAILABLE (ERROR)' : `${blockingTickets.length} blocking tickets`,
        required: '0 blocking tickets',
        passed: gate4Passed,
        detail: gate4Detail,
        isError: !!maintenanceError,
      },
      {
        id: 'gate-5',
        name: '5. Reservation Confirmation Status',
        description: 'Reservation must be in CONFIRMED state (active stay mutual exclusion enforced by backend check-in transaction)',
        current: resStatus || 'UNKNOWN',
        required: 'CONFIRMED',
        passed: gate5Passed,
        detail: gate5Detail,
      },
    ];

    const allPassed = gates.every((g) => g.passed);

    return {
      passed: allPassed,
      gates,
      blockingTickets,
    };
  };

  const { passed: allGatesPassed, gates, blockingTickets } = evaluateInvariants();

  const handleExecuteCheckIn = async () => {
    if (!allGatesPassed || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await frontOfficeService.checkIn(reservation.id);
      addToast(
        `Guest checked in successfully! Room ${apartmentData?.unit_number || ''} is now OCCUPIED.`,
        'success'
      );
      if (onSuccess) {
        onSuccess(res.data?.data || res.data || { ...reservation, status: 'CHECKED_IN' });
      }
      onClose();
    } catch (err) {
      const status = err.response?.status;
      const apiErr = err.response?.data?.error;
      const msg = apiErr?.message || err.response?.data?.message || err.message || 'Check-in failed';

      if (status === 409) {
        setErrorMessage(`[409 CONFLICT] ${msg} - Please refresh room readiness.`);
        addToast(`Concurrency Conflict: ${msg}`, 'error');
      } else if (status === 422) {
        setErrorMessage(`[422 INVARIANT VIOLATION] ${msg}`);
        addToast(`Safety Invariant Failed: ${msg}`, 'error');
      } else {
        setErrorMessage(`Error: ${msg}`);
        addToast(`Check-in failed: ${msg}`, 'error');
      }

      // Re-load latest data in case backend rejected due to recent change
      if (reservation?.apartment_id) {
        loadSafetyData(reservation.apartment_id);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !reservation) return null;

  return (
    <>
      <Modal
        isOpen={isOpen && !showReadinessModal}
        onClose={submitting ? undefined : onClose}
        title={`Safe Check-In Verification — ${reservation.reservation_code || `#${reservation.id}`}`}
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Reservation / Guest Snapshot Banner */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Guest Name</span>
              <p style={{ fontWeight: 600, color: '#0f172a', margin: '0.2rem 0 0 0' }}>
                {reservation.guest_name || reservation.guest?.name || 'Walk-In Guest'}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Assigned Unit</span>
              <p style={{ fontWeight: 600, color: '#0f172a', margin: '0.2rem 0 0 0' }}>
                {reservation.unit_name || apartmentData?.unit_name || `Apt #${reservation.apartment_id}`}
                {apartmentData?.unit_number ? ` (${apartmentData.unit_number})` : ''}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Stay Dates</span>
              <p style={{ fontWeight: 600, color: '#0f172a', margin: '0.2rem 0 0 0' }}>
                {reservation.check_in_date} → {reservation.check_out_date}
              </p>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Booking Status</span>
              <div style={{ marginTop: '0.2rem' }}>
                <Badge variant={reservation.status?.toLowerCase() === 'confirmed' ? 'confirmed' : 'pending'}>
                  {reservation.status}
                </Badge>
              </div>
            </div>
          </div>

          {/* Invariant Readiness Status Banner */}
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span> Loading room readiness and booking prerequisites...
            </div>
          ) : (
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: allGatesPassed ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)',
                border: `1px solid ${allGatesPassed ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`,
              }}
            >
              <div>
                <strong style={{ color: allGatesPassed ? '#16a34a' : '#dc2626', fontSize: '0.95rem' }}>
                  {allGatesPassed
                    ? '✓ PRE-CHECK-IN READINESS CLEARED'
                    : '⚠ CHECK-IN BLOCKED: READINESS REQUIREMENTS NOT MET'}
                </strong>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#475569' }}>
                  {allGatesPassed
                    ? 'Unit satisfies occupancy, hygiene, maintenance and confirmation prerequisites. Ready for transactional check-in submission.'
                    : 'This unit cannot be checked in until all readiness requirements and booking prerequisites are fulfilled.'}
                </p>
              </div>
              <Badge variant={allGatesPassed ? 'success' : 'danger'}>
                {allGatesPassed ? 'READY FOR CHECK-IN' : 'BLOCKED'}
              </Badge>
            </div>
          )}

          {/* Maintenance Service Failure Alert */}
          {maintenanceError && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid rgba(220, 38, 38, 0.25)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div style={{ fontSize: '0.825rem', color: '#991b1b' }}>
                <strong>Maintenance Service Notice:</strong> Could not retrieve work orders ({maintenanceError}). Room readiness cannot be guaranteed.
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadSafetyData(reservation.apartment_id)}
              >
                Retry Query
              </Button>
            </div>
          )}

          {/* General Error Message Alert */}
          {errorMessage && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '6px',
                color: '#b91c1c',
                fontSize: '0.875rem',
              }}
            >
              <strong>Error:</strong> {errorMessage}
            </div>
          )}

          {/* Invariant Gates Checklist */}
          {!loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: '0.875rem', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.05em' }}>
                  Pre-Check-In Safety Verification Checklist
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadSafetyData(reservation.apartment_id)}
                >
                  🔄 Re-verify
                </Button>
              </div>

              {gates.map((gate) => (
                <div
                  key={gate.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: gate.passed ? '#bbf7d0' : gate.isError ? '#fca5a5' : '#fecaca',
                    backgroundColor: gate.passed ? '#f0fdf4' : gate.isError ? '#fff1f2' : '#fef2f2',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.1rem', marginTop: '1px' }}>
                      {gate.passed ? '✅' : gate.isWarning ? '⚠️' : '❌'}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: gate.passed ? '#15803d' : '#b91c1c' }}>
                        {gate.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '2px' }}>
                        {gate.detail}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '1rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: gate.passed ? '#dcfce7' : '#fee2e2',
                        color: gate.passed ? '#15803d' : '#b91c1c',
                      }}
                    >
                      {gate.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                </div>
              ))}

              {/* Authoritative Server Enforcement Note */}
              <div
                style={{
                  fontSize: '0.74rem',
                  color: '#64748b',
                  lineHeight: 1.45,
                  padding: '0.35rem 0.5rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '4px',
                }}
              >
                ℹ️ <strong>Authoritative Safety Note:</strong> The preview above evaluates physical unit readiness and booking confirmation status. The backend check-in transaction authoritatively executes exclusive InnoDB row locks and verifies zero overlapping active in-house stays before committing check-in.
              </div>
            </div>
          )}

          {/* Active Blocking Work Orders Section */}
          {!loading && blockingTickets.length > 0 && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(234, 88, 12, 0.08)',
                border: '1px solid rgba(234, 88, 12, 0.3)',
                borderRadius: '6px',
              }}
            >
              <div style={{ fontWeight: 600, color: '#c2410c', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                ⚠ Blocking Maintenance Work Orders ({blockingTickets.length})
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#7c2d12' }}>
                {blockingTickets.map((t) => (
                  <li key={t.id} style={{ marginBottom: '0.25rem' }}>
                    <strong>{t.issue_code || `#${t.id}`}</strong>: {t.title || t.issue_title} (Priority: <strong>{t.priority}</strong>
                    {t.blocking_unit ? ' | Unit Blocked' : ''})
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: '0.75rem', color: '#9a3412', marginTop: '0.5rem' }}>
                Work order must be marked RESOLVED or CANCELLED in Property Operations before check-in can proceed.
              </div>
            </div>
          )}

          {/* Quick Transition to Room Readiness Turnover */}
          {!allGatesPassed && !loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                backgroundColor: '#f1f5f9',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                  Room turnover or inspection required?
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Update housekeeping inspection or clear maintenance holds via the Room Readiness desk.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReadinessModal(true)}
              >
                Inspect / Update Unit
              </Button>
            </div>
          )}

          {/* Modal Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!allGatesPassed || submitting || loading}
              onClick={handleExecuteCheckIn}
              style={{
                backgroundColor: allGatesPassed ? '#16a34a' : '#94a3b8',
                borderColor: allGatesPassed ? '#16a34a' : '#94a3b8',
                cursor: allGatesPassed && !submitting ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', marginRight: '6px' }}>
                    ⏳
                  </span>
                  Processing Check-In...
                </>
              ) : (
                'Confirm & Check-In Guest'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Embedded ApartmentReadinessModal for direct transitions */}
      {showReadinessModal && apartmentData && (
        <ApartmentReadinessModal
          isOpen={showReadinessModal}
          onClose={() => {
            setShowReadinessModal(false);
            if (reservation?.apartment_id) {
              loadSafetyData(reservation.apartment_id);
            }
          }}
          apartment={apartmentData}
          onUpdated={(updatedApt) => {
            setApartmentData(updatedApt);
            if (reservation?.apartment_id) {
              loadSafetyData(reservation.apartment_id);
            }
          }}
        />
      )}
    </>
  );
}
