import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { publicService } from '../../services/api';
import { formatNaira } from '../../utils/currency';
import Icons8Icon from './Icons8Icon';

export default function BookingTrackingModal({
  isOpen,
  onClose,
  initialReference = '',
  initialEmail = '',
}) {
  const [reference, setReference] = useState(initialReference || '');
  const [email, setEmail] = useState(initialEmail || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Cancellation sub-flow
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('CHANGE_OF_PLANS');
  const [cancelNotes, setCancelNotes] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState('');

  // Room change sub-flow
  const [showChangePrompt, setShowChangePrompt] = useState(false);
  const [targetApartmentId, setTargetApartmentId] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeSuccessMsg, setChangeSuccessMsg] = useState('');
  const [availableUnits, setAvailableUnits] = useState([]);

  // Sync initial props
  useEffect(() => {
    if (initialReference) setReference(initialReference);
    if (initialEmail) setEmail(initialEmail);
    if (initialReference && initialEmail && isOpen) {
      handleLookup(initialReference, initialEmail);
    }
  }, [initialReference, initialEmail, isOpen]);

  const handleLookup = async (codeToLookup, emailToLookup) => {
    const c = (codeToLookup !== undefined ? codeToLookup : reference).trim();
    const e = (emailToLookup !== undefined ? emailToLookup : email).trim();

    if (!c || !e) {
      setError('Please provide both your Booking Reference Code and Guest Email.');
      return;
    }

    setLoading(true);
    setError('');
    setCancelSuccessMsg('');
    setChangeSuccessMsg('');

    try {
      const res = await publicService.trackBooking({
        reservationCode: c,
        guestEmail: e,
      });
      setBooking(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || err.message;
      setError(msg || 'No reservation found matching this reference code and email.');
      setBooking(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPasscode = () => {
    if (booking?.authCode) {
      navigator.clipboard.writeText(booking.authCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    }
  };

  const handleCancelBooking = async (e) => {
    e.preventDefault();
    if (!booking) return;
    setCancelLoading(true);
    setError('');
    try {
      const res = await publicService.cancelBooking({
        reservationCode: booking.reservationCode,
        guestEmail: booking.guestEmail,
        reason: cancelReason,
        notes: cancelNotes,
      });
      setCancelSuccessMsg(res.data?.message || 'Cancellation request submitted.');
      setShowCancelPrompt(false);
      // Refresh status
      await handleLookup(booking.reservationCode, booking.guestEmail);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to submit cancellation request.');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleLoadAlternativeUnits = async () => {
    setShowChangePrompt(true);
    if (booking?.property_id || booking?.propertyId) {
      try {
        const res = await publicService.getApartments(booking.property_id || booking.propertyId);
        setAvailableUnits(res.data || []);
      } catch (err) {
        console.warn('Failed loading units for room change:', err);
      }
    }
  };

  const handleRequestRoomChange = async (e) => {
    e.preventDefault();
    if (!booking || !targetApartmentId) return;
    setChangeLoading(true);
    setError('');
    try {
      const res = await publicService.requestRoomChange({
        reservationCode: booking.reservationCode,
        guestEmail: booking.guestEmail,
        targetApartmentId: parseInt(targetApartmentId, 10),
        reason: changeNotes || 'Guest requested room change',
      });
      setChangeSuccessMsg(res.data?.message || 'Room change request submitted for front desk review.');
      setShowChangePrompt(false);
      await handleLookup(booking.reservationCode, booking.guestEmail);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to request room change.');
    } finally {
      setChangeLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon="🛡️"
      title="BFA Stay Tracker & Verification"
      subtitle="Track your reservation status, transfer verification, and check-in credentials in real time"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-0.5rem' }}>
          <a
            href={booking ? `/track?ref=${encodeURIComponent(booking.reservationCode)}&email=${encodeURIComponent(booking.guestEmail)}` : '/track'}
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#b99a70',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>Open Dedicated Tracking Page ↗</span>
          </a>
        </div>
        {/* Search Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup();
          }}
          style={{
            background: 'var(--bg-surface, #f8fafc)',
            padding: '1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-default, #e2e8f0)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#475569',
                  marginBottom: '0.25rem',
                }}
              >
                Reservation Reference Code *
              </label>
              <input
                type="text"
                placeholder="e.g. BFA-20261029-XXXX"
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                required
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#475569',
                  marginBottom: '0.25rem',
                }}
              >
                Guest Email Address *
              </label>
              <input
                type="email"
                placeholder="e.g. guest@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Querying Authoritative Registry...' : '🔍 Track My Reservation'}
          </Button>
        </form>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: '#fef2f2',
              border: '1px solid #fecdd3',
              color: '#9f1239',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {cancelSuccessMsg && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#15803d',
              fontSize: '0.85rem',
            }}
          >
            ✓ {cancelSuccessMsg}
          </div>
        )}

        {changeSuccessMsg && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              fontSize: '0.85rem',
            }}
          >
            ✓ {changeSuccessMsg}
          </div>
        )}

        {/* Live Tracking Result */}
        {booking && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Status Header Box */}
            <div
              style={{
                padding: '1rem',
                borderRadius: '8px',
                background:
                  booking.status === 'CONFIRMED'
                    ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
                    : booking.status === 'DECLINED'
                    ? 'linear-gradient(135deg, #fef2f2, #fee2e2)'
                    : 'linear-gradient(135deg, #fefce8, #fef9c3)',
                border:
                  booking.status === 'CONFIRMED'
                    ? '1px solid #86efac'
                    : booking.status === 'DECLINED'
                    ? '1px solid #fca5a5'
                    : '1px solid #fde047',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.06em', color: '#475569' }}>
                    Current Operational Status
                  </span>
                  <h3 style={{ margin: '0.2rem 0', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    {booking.status === 'CONFIRMED'
                      ? '✓ Reservation Confirmed'
                      : booking.status === 'DECLINED'
                      ? '✕ Verification Declined'
                      : booking.status === 'CLAIMED'
                      ? '👤 Claimed by Front Desk Officer'
                      : booking.status === 'CANCELLED'
                      ? '⚠️ Reservation Cancelled'
                      : '⏳ Pending Front Desk Review'}
                  </h3>
                </div>
                <Badge status={booking.status}>{booking.status}</Badge>
              </div>

              {/* Status context messages */}
              <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: '#334155', lineHeight: 1.4 }}>
                {booking.status === 'CONFIRMED' && (
                  <span>
                    Your payment has been matched and verified by the front desk. Your check-in passcode is active below.
                  </span>
                )}
                {booking.status === 'DECLINED' && (
                  <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                    Notice: {booking.declineReason || 'Discrepancy detected during transfer verification.'}
                  </span>
                )}
                {booking.status === 'CLAIMED' && (
                  <span>
                    Officer <strong>{booking.assignedStaffName || 'Front Desk'}</strong> has claimed your booking and is currently validating your transfer proof against bank statements.
                  </span>
                )}
                {booking.status === 'PENDING_REVIEW' && (
                  <span>
                    Your booking request and payment proof have been registered. A front desk officer picks up and verifies transfers within <strong>2–5 minutes</strong>.
                  </span>
                )}
              </p>
            </div>

            {/* Check-In Passcode Box (Unlocks strictly when confirmed!) */}
            {booking.status === 'CONFIRMED' && booking.authCode && (
              <div
                style={{
                  background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  textAlign: 'center',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>
                  🔑 Official Guest Check-In Passcode
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: '#60a5fa',
                    fontFamily: 'monospace',
                    margin: '0.4rem 0',
                  }}
                >
                  {booking.authCode}
                </div>
                <p style={{ fontSize: '0.8rem', color: '#cbd5e1', margin: '0 0 0.75rem 0' }}>
                  Present this code at the BFA front desk upon arrival to receive your smart access key card.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPasscode}
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', borderColor: '#475569' }}
                >
                  {copiedCode ? '✓ Copied to Clipboard!' : '📋 Copy Check-In Passcode'}
                </Button>
              </div>
            )}

            {/* 4-Step Live Timeline */}
            <div
              style={{
                background: 'var(--bg-surface, #ffffff)',
                border: '1px solid var(--border-default, #e2e8f0)',
                borderRadius: '8px',
                padding: '1rem',
              }}
            >
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                Operational Lifecycle Timeline
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {booking.timeline?.map((step) => {
                  const isDone = step.status === 'COMPLETED';
                  const isFail = step.status === 'FAILED';
                  return (
                    <div
                      key={step.step}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        opacity: step.status === 'PENDING' ? 0.6 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: isDone ? '#16a34a' : isFail ? '#ef4444' : '#2563eb',
                          color: '#ffffff',
                          flexShrink: 0,
                        }}
                      >
                        {isDone ? '✓' : isFail ? '✕' : step.step}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>{step.title}</strong>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: isDone ? '#16a34a' : isFail ? '#ef4444' : '#2563eb',
                            }}
                          >
                            {step.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                          {step.detail || step.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Booking Particulars */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
                fontSize: '0.85rem',
                background: 'var(--bg-surface, #f8fafc)',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid var(--border-default, #e2e8f0)',
              }}
            >
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Residence & Suite:</span>
                <strong>{booking.propertyName}</strong> • Unit {booking.unitNumber} ({booking.unitType})
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Stay Date (1 Night):</span>
                <strong>{booking.checkInDate}</strong> ➔ <strong>{booking.checkOutDate}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Payment Method:</span>
                <strong>{booking.paymentMethod === 'BANK_TRANSFER' ? '🏦 Bank Transfer' : '🛎️ Pay at Property'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Total Valuation:</span>
                <strong style={{ color: '#16a34a' }}>{formatNaira(booking.totalAmount)}</strong>
              </div>
            </div>

            {/* Guest Actions Bar */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {booking.status !== 'CANCELLED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCancelPrompt((prev) => !prev)}
                  >
                    Request Cancellation
                  </Button>
                )}

                {booking.status !== 'CANCELLED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadAlternativeUnits}
                  >
                    Request Suite Change
                  </Button>
                )}
              </div>

              <a
                href={`https://wa.me/2348000000000?text=Hello%20BFA%20Concierge%2C%20I%20am%20inquiring%20about%20booking%20${encodeURIComponent(
                  booking.reservationCode
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#15803d',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  textDecoration: 'none',
                }}
              >
                💬 WhatsApp Concierge
              </a>
            </div>

            {/* Inline Cancellation Drawer */}
            {showCancelPrompt && (
              <form
                onSubmit={handleCancelBooking}
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecdd3',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <h5 style={{ margin: '0 0 0.5rem 0', color: '#9f1239', fontSize: '0.88rem' }}>
                  Confirm Stay Cancellation Request
                </h5>
                <p style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.75rem' }}>
                  Please indicate your reason for cancellation. Stays cancelled in advance release the suite for other guests.
                </p>
                <div style={{ marginBottom: '0.5rem' }}>
                  <select
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <option value="CHANGE_OF_PLANS">Change of Travel Plans</option>
                    <option value="DATE_RESCHEDULE">Need to Reschedule Dates</option>
                    <option value="BOOKED_BY_MISTAKE">Booked Wrong Unit / Property</option>
                    <option value="EMERGENCY">Personal Emergency</option>
                    <option value="OTHER">Other Reason</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Optional details..."
                    value={cancelNotes}
                    onChange={(e) => setCancelNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button variant="outline" size="sm" onClick={() => setShowCancelPrompt(false)}>
                    Keep Reservation
                  </Button>
                  <Button variant="danger" size="sm" type="submit" disabled={cancelLoading}>
                    {cancelLoading ? 'Submitting...' : 'Confirm Cancellation Request'}
                  </Button>
                </div>
              </form>
            )}

            {/* Inline Room Change Drawer */}
            {showChangePrompt && (
              <form
                onSubmit={handleRequestRoomChange}
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '8px',
                  padding: '1rem',
                }}
              >
                <h5 style={{ margin: '0 0 0.5rem 0', color: '#1e3a8a', fontSize: '0.88rem' }}>
                  Request Suite Change
                </h5>
                <p style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.75rem' }}>
                  Select an available alternative suite within the building. Front desk staff will adjust your booking.
                </p>
                <div style={{ marginBottom: '0.5rem' }}>
                  <select
                    value={targetApartmentId}
                    onChange={(e) => setTargetApartmentId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <option value="">-- Choose Desired Suite --</option>
                    {availableUnits
                      .filter((u) => String(u.id) !== String(booking.apartment_id || booking.apartmentId))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          Unit {u.unit_number} — {u.unit_name} ({u.unit_type}) • {formatNaira(u.rate_per_night)}/nt
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Notes or special requests regarding the change..."
                    value={changeNotes}
                    onChange={(e) => setChangeNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button variant="outline" size="sm" onClick={() => setShowChangePrompt(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" disabled={changeLoading}>
                    {changeLoading ? 'Submitting...' : 'Submit Room Change Request'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

