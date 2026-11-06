import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  Copy,
  Check,
  Calendar,
  MapPin,
  Building2,
  Users,
  Bed,
  CreditCard,
  Clock,
  AlertTriangle,
  ArrowRight,
  X,
  RefreshCw,
  Printer,
  MessageSquare,
  Phone,
  ChevronRight,
  User,
  KeyRound,
} from 'lucide-react';
import PublicTopNav from '../../components/public/PublicTopNav';
import PublicFooter from '../../components/public/home/PublicFooter';
import { publicService } from '../../services/api';
import { formatNaira } from '../../utils/currency';
import '../../styles/hospitalityTokens.css';
import './TrackStayPage.css';

export default function TrackStayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL query params
  const refParam = searchParams.get('ref') || searchParams.get('code') || '';
  const emailParam = searchParams.get('email') || '';
  const modalParam = searchParams.get('modal') || '';

  // Form State
  const [reference, setReference] = useState(refParam);
  const [email, setEmail] = useState(emailParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  // Payment configuration (authoritative bank details)
  const [paymentConfig, setPaymentConfig] = useState(null);

  // Cancellation Modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('CHANGE_OF_PLANS');
  const [cancelNotes, setCancelNotes] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState('');

  // Room Change Modal
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [availableUnits, setAvailableUnits] = useState([]);
  const [targetApartmentId, setTargetApartmentId] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeUnitsLoading, setChangeUnitsLoading] = useState(false);
  const [changeUnitsError, setChangeUnitsError] = useState('');
  const [changeSuccessMsg, setChangeSuccessMsg] = useState('');

  // Fetch Payment Config on Mount
  useEffect(() => {
    publicService
      .getPaymentConfig()
      .then((res) => {
        const cfg = res.data?.data || res.data;
        setPaymentConfig(cfg);
      })
      .catch((err) => {
        console.warn('Could not load public payment config:', err);
      });
  }, []);

  // Main Lookup Handler
  const handleLookup = useCallback(
    async (codeToLookup, emailToLookup) => {
      const code = (codeToLookup !== undefined ? codeToLookup : reference).trim().toUpperCase();
      const mail = (emailToLookup !== undefined ? emailToLookup : email).trim().toLowerCase();

      if (!code || !mail) {
        setError('Please provide both your Booking Reference Code and Guest Email.');
        return;
      }

      setLoading(true);
      setError('');
      setCancelSuccessMsg('');
      setChangeSuccessMsg('');

      try {
        const res = await publicService.trackBooking({
          reservationCode: code,
          guestEmail: mail,
        });

        const bData = res.data?.data || res.data;

        // DEF-A41: If backend omits propertyId, resolve property association via authoritative properties list
        if (bData && !bData.propertyId && !bData.property_id) {
          try {
            const propRes = await publicService.getProperties();
            const properties = propRes.data?.data || propRes.data || [];
            const refCodePart = bData.reservationCode?.split('-')?.[1];
            const matched = properties.find((p) => {
              if (refCodePart && p.code && p.code.toUpperCase() === refCodePart.toUpperCase()) return true;
              if (bData.propertyName && p.name && p.name.trim().toLowerCase() === bData.propertyName.trim().toLowerCase()) return true;
              return false;
            });
            if (matched) {
              bData.propertyId = matched.id;
              bData.property_id = matched.id;
            }
          } catch (e) {
            console.warn('Property resolution fallback error:', e);
          }
        }

        setBooking(bData);

        // Update URL query params without reloading
        setSearchParams({ ref: code, email: mail });
      } catch (err) {
        const msg =
          err.message ||
          err.response?.data?.message ||
          err.response?.data?.error?.message ||
          'No reservation found matching this reference code and email. Please verify your details.';
        setError(msg);
        setBooking(null);
      } finally {
        setLoading(false);
      }
    },
    [reference, email, setSearchParams]
  );

  // Auto-lookup if params are present in URL on mount
  useEffect(() => {
    if (refParam && emailParam) {
      handleLookup(refParam, emailParam);
    }
  }, [refParam, emailParam, handleLookup]);

  // Deep-link modal opener (e.g. ?modal=room-change)
  useEffect(() => {
    if (booking && modalParam === 'room-change' && !showChangeModal) {
      handleOpenRoomChange();
    }
  }, [booking, modalParam]);

  // Polling for active pending reservations (refresh every 6 seconds)
  useEffect(() => {
    if (!booking) return;
    const isPending =
      booking.status === 'PENDING_REVIEW' ||
      booking.status === 'CLAIMED' ||
      booking.paymentStatus === 'PROOF_UPLOADED';

    if (!isPending) return;

    const interval = setInterval(() => {
      publicService
        .trackBooking({
          reservationCode: booking.reservationCode,
          guestEmail: booking.guestEmail,
        })
        .then((res) => {
          const freshData = res.data?.data || res.data;
          if (freshData) {
            setBooking(freshData);
          }
        })
        .catch(() => {});
    }, 6000);

    return () => clearInterval(interval);
  }, [booking]);

  // Copy to Clipboard Helper
  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(''), 2500);
  };

  // Handle Cancellation Submission
  const handleConfirmCancel = async (e) => {
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

      const message =
        res.data?.message ||
        res.message ||
        'Your cancellation request has been registered in the BFA official registry.';
      setCancelSuccessMsg(message);
      setShowCancelModal(false);

      // Refresh data
      await handleLookup(booking.reservationCode, booking.guestEmail);
    } catch (err) {
      const msg =
        err.message ||
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        'Unable to process cancellation request. Please contact the front desk directly.';
      setError(msg);
    } finally {
      setCancelLoading(false);
    }
  };

  // Open Room Change Modal and Fetch Active Alternative Units for the Booked Property
  const handleOpenRoomChange = async () => {
    setShowChangeModal(true);
    setTargetApartmentId('');
    setChangeNotes('');
    setChangeUnitsError('');
    setChangeUnitsLoading(true);
    setAvailableUnits([]);

    try {
      // 1. Resolve Property Identifier
      let propId = booking?.property_id || booking?.propertyId;
      let propName = booking?.propertyName;

      if (!propId) {
        const propRes = await publicService.getProperties();
        const properties = propRes.data?.data || propRes.data || [];
        const refCodePart = booking?.reservationCode?.split('-')?.[1];
        const matched = properties.find((p) => {
          if (refCodePart && p.code && p.code.toUpperCase() === refCodePart.toUpperCase()) {
            return true;
          }
          if (propName && p.name && p.name.trim().toLowerCase() === propName.trim().toLowerCase()) {
            return true;
          }
          return false;
        });

        if (matched) {
          propId = matched.id;
        }
      }

      if (!propId) {
        throw new Error(`Unable to determine property enclave for ${propName || 'this reservation'}.`);
      }

      // 2. Fetch all apartments for this specific property
      const res = await publicService.getApartments(propId);
      const allUnits = res.data?.data || res.data || [];

      // 3. Strict property-level filtering and exclusion of current unit
      const eligibleUnits = allUnits.filter((u) => {
        // Enforce strict property isolation
        const unitPropId = u.property_id || u.propertyId;
        if (unitPropId && parseInt(unitPropId, 10) !== parseInt(propId, 10)) {
          return false;
        }

        // Exclude currently occupied unit by unit ID if known
        if (booking.apartment_id && String(u.id) === String(booking.apartment_id)) {
          return false;
        }
        if (booking.apartmentId && String(u.id) === String(booking.apartmentId)) {
          return false;
        }

        // Exclude currently occupied unit by unit number
        if (booking.unitNumber && String(u.unit_number).trim() === String(booking.unitNumber).trim()) {
          return false;
        }

        return true;
      });

      setAvailableUnits(eligibleUnits);
    } catch (err) {
      console.error('Could not fetch alternative suites for room change:', err);
      setChangeUnitsError(
        err.message || 'Unable to retrieve alternative suites for this property. Please try again or contact the concierge.'
      );
    } finally {
      setChangeUnitsLoading(false);
    }
  };

  // Handle Room Change Submission
  const handleConfirmRoomChange = async (e) => {
    e.preventDefault();
    if (!booking || !targetApartmentId) return;

    setChangeLoading(true);
    setError('');

    try {
      const res = await publicService.requestRoomChange({
        reservationCode: booking.reservationCode,
        guestEmail: booking.guestEmail,
        targetApartmentId: parseInt(targetApartmentId, 10),
        notes: changeNotes || 'Guest requested room change via public portal',
      });

      const message =
        res.data?.message ||
        res.message ||
        'Room change request submitted. Front desk will review and update your reservation.';
      setChangeSuccessMsg(message);
      setShowChangeModal(false);

      // Refresh data
      await handleLookup(booking.reservationCode, booking.guestEmail);
    } catch (err) {
      const msg =
        err.message ||
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        'Unable to process room change request. Please verify suite availability with the front desk.';
      setError(msg);
    } finally {
      setChangeLoading(false);
    }
  };

  // Print Receipt Handler
  const handlePrint = () => {
    window.print();
  };

  // Reset Search View
  const handleNewSearch = () => {
    setBooking(null);
    setReference('');
    setEmail('');
    setError('');
    setCancelSuccessMsg('');
    setChangeSuccessMsg('');
    setSearchParams({});
  };

  return (
    <div className="bfa-track-page bfa-hospitality-scope">
      <PublicTopNav activePage="track" />

      <main className="bfa-track-main" role="main">
        <div className="bfa-track-container">
          {/* Breadcrumb Navigation */}
          <nav aria-label="Breadcrumb" className="bfa-track-breadcrumbs">
            <Link to="/">Home</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <Link to="/properties">Residences</Link>
            <ChevronRight size={12} aria-hidden="true" />
            <span className="current">Track Stay</span>
          </nav>

          {/* Page Editorial Header */}
          <header className="bfa-track-header">
            <div className="bfa-track-eyebrow">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Official Guest Stay Registry</span>
            </div>
            <h1 className="bfa-track-title">Reservation &amp; Stay Status</h1>
            <p className="bfa-track-subtitle">
              Verify your booking details, track real-time transfer verification by our concierge desk,
              and access your digital check-in passcode.
            </p>
          </header>

          {/* Feedback Alerts */}
          {error && (
            <div className="bfa-track-alert error" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>{error}</div>
            </div>
          )}

          {cancelSuccessMsg && (
            <div className="bfa-track-alert success" role="status">
              <Check size={18} aria-hidden="true" />
              <div>{cancelSuccessMsg}</div>
            </div>
          )}

          {changeSuccessMsg && (
            <div className="bfa-track-alert info" role="status">
              <RefreshCw size={18} aria-hidden="true" />
              <div>{changeSuccessMsg}</div>
            </div>
          )}

          {/* Initial Search Form (when no reservation is loaded) */}
          {!booking && (
            <div className="bfa-track-search-card">
              <form
                className="bfa-track-search-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLookup();
                }}
              >
                <div className="bfa-track-field-group">
                  <label htmlFor="track-ref" className="bfa-track-label">
                    <span>Reservation Reference Code *</span>
                    <span style={{ fontSize: '0.72rem', color: '#8c948e', textTransform: 'none' }}>
                      (e.g., BFA-GHT-XXXX-XXX)
                    </span>
                  </label>
                  <input
                    id="track-ref"
                    type="text"
                    className="bfa-track-input code-input"
                    placeholder="BFA-XXXX-XXXXXXXX-XXX"
                    value={reference}
                    onChange={(e) => setReference(e.target.value.toUpperCase())}
                    required
                    autoComplete="off"
                  />
                </div>

                <div className="bfa-track-field-group">
                  <label htmlFor="track-email" className="bfa-track-label">
                    <span>Guest Email Address *</span>
                    <span style={{ fontSize: '0.72rem', color: '#8c948e', textTransform: 'none' }}>
                      (Used during booking)
                    </span>
                  </label>
                  <input
                    id="track-email"
                    type="email"
                    className="bfa-track-input"
                    placeholder="guest@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="bfa-track-submit-btn"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <RefreshCw size={16} className="spin" aria-hidden="true" />
                      <span>Querying Authoritative Registry...</span>
                    </>
                  ) : (
                    <>
                      <Search size={16} aria-hidden="true" />
                      <span>Verify &amp; Track Reservation</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Loaded Booking Dashboard */}
          {booking && (
            <div className="bfa-track-result-grid">
              {/* Left Column: Lifecycle, Passcode, Timeline, Particulars */}
              <div className="bfa-track-main-col">
                {/* 1. Status Banner */}
                <div className="bfa-track-status-banner">
                  <div className="bfa-track-status-top">
                    <div>
                      <div className="bfa-track-ref-label">Reservation Reference</div>
                      <div className="bfa-track-ref-val">
                        <span>{booking.reservationCode}</span>
                        <button
                          type="button"
                          className="bfa-track-copy-icon-btn"
                          onClick={() => handleCopy(booking.reservationCode, 'ref')}
                          title="Copy Reservation Reference"
                          aria-label="Copy reference code"
                        >
                          {copiedField === 'ref' ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedField === 'ref' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <span
                        className={`bfa-track-status-badge ${
                          booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN'
                            ? 'confirmed'
                            : booking.status === 'DECLINED' || booking.status === 'CANCELLED'
                            ? 'declined'
                            : 'pending'
                        }`}
                      >
                        {booking.status === 'CONFIRMED'
                          ? '✓ Confirmed'
                          : booking.status === 'CHECKED_IN'
                          ? '✓ Checked In'
                          : booking.status === 'DECLINED'
                          ? '✕ Declined'
                          : booking.status === 'CANCELLED'
                          ? '✕ Cancelled'
                          : booking.status === 'CLAIMED'
                          ? '👤 Under Review'
                          : '⏳ Pending Review'}
                      </span>
                    </div>
                  </div>

                  <h2 className="bfa-track-status-headline">
                    {booking.status === 'CONFIRMED'
                      ? 'Reservation Confirmed & Ready for Arrival'
                      : booking.status === 'CHECKED_IN'
                      ? 'Guest Currently In Residence'
                      : booking.status === 'DECLINED'
                      ? 'Payment Proof Declined by Front Desk'
                      : booking.status === 'CANCELLED'
                      ? 'Reservation Cancelled'
                      : booking.status === 'CLAIMED'
                      ? `Front Desk Officer ${booking.assignedStaffName || ''} Verifying Funds`
                      : 'Booking Request Registered — Under Front Desk Review'}
                  </h2>

                  <p className="bfa-track-status-desc">
                    {booking.status === 'CONFIRMED'
                      ? 'Your payment transfer has been verified against our official bank statement. Your digital check-in passcode is active below. Present this passcode upon arrival at the concierge desk.'
                      : booking.status === 'DECLINED'
                      ? `Notice: ${
                          booking.declineReason ||
                          'Our front desk could not verify your transfer with our bank statement. Please verify the amount paid or contact the front desk.'
                        }`
                      : booking.status === 'CANCELLED'
                      ? `This stay was cancelled. Reason: ${
                          booking.cancellationReason || 'Cancelled at guest request.'
                        }`
                      : 'Thank you for choosing BFA Apartments. Your reservation request is in our official queue. A front desk officer claims and verifies bank transfers within 2 to 5 minutes during operating hours.'}
                  </p>
                </div>

                {/* 2. Official Passcode Card (Unlocked strictly when CONFIRMED) */}
                {booking.status === 'CONFIRMED' && booking.authCode && (
                  <div className="bfa-track-passcode-box">
                    <div className="bfa-track-passcode-tag">
                      <KeyRound size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Official Check-In Smart Passcode
                    </div>
                    <div className="bfa-track-passcode-val">{booking.authCode}</div>
                    <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '0 0 16px' }}>
                      Present this cryptographic passcode at the front desk upon arrival for instant key card issuance.
                    </p>
                    <button
                      type="button"
                      className="bfa-track-passcode-copy-btn"
                      onClick={() => handleCopy(booking.authCode, 'passcode')}
                    >
                      {copiedField === 'passcode' ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedField === 'passcode' ? 'Passcode Copied!' : 'Copy Check-In Passcode'}</span>
                    </button>
                  </div>
                )}

                {/* 3. Operational Lifecycle Timeline */}
                <div className="bfa-track-timeline-card">
                  <h3 className="bfa-track-card-title">
                    <span>Operational Verification Timeline</span>
                    <span style={{ fontSize: '0.78rem', color: '#8c948e', fontFamily: 'sans-serif', fontWeight: 500 }}>
                      Live Status Updates
                    </span>
                  </h3>

                  <div className="bfa-track-timeline-steps">
                    {(
                      booking.timeline || [
                        {
                          step: 1,
                          title: 'Booking Request Submitted',
                          status: 'COMPLETED',
                          detail: 'Stay dates and suite recorded.',
                        },
                        {
                          step: 2,
                          title: 'Front Desk Claim & Assignment',
                          status: booking.assignedStaffName ? 'COMPLETED' : 'IN_PROGRESS',
                          detail: booking.assignedStaffName
                            ? `Claimed by ${booking.assignedStaffName}`
                            : 'Awaiting front desk pickup (2–5 mins)',
                        },
                        {
                          step: 3,
                          title: 'Bank Transfer Verification',
                          status: booking.isVerified ? 'COMPLETED' : 'IN_PROGRESS',
                          detail: booking.isVerified
                            ? 'Funds verified on bank statement.'
                            : 'Matching receipt with bank statement.',
                        },
                        {
                          step: 4,
                          title: 'Approval & Key Card Passcode',
                          status: booking.isApproved ? 'COMPLETED' : 'PENDING',
                          detail: booking.isApproved
                            ? 'Smart key passcode unlocked.'
                            : 'Passcode unlocks upon verification.',
                        },
                      ]
                    ).map((item) => {
                      const isDone = item.status === 'COMPLETED';
                      const isInProgress = item.status === 'IN_PROGRESS';
                      const isFailed = item.status === 'FAILED';

                      return (
                        <div
                          key={item.step}
                          className={`bfa-track-timeline-item ${
                            isDone ? 'completed' : isInProgress ? 'in-progress' : isFailed ? 'failed' : ''
                          }`}
                        >
                          <div className="bfa-track-timeline-node">
                            {isDone ? <Check size={14} /> : isFailed ? <X size={14} /> : item.step}
                          </div>
                          <div className="bfa-track-timeline-content">
                            <div className="bfa-track-timeline-item-title">
                              <span>{item.title}</span>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.06em',
                                  color: isDone ? '#1b5e39' : isInProgress ? '#8c6014' : isFailed ? '#9e2323' : '#8c948e',
                                }}
                              >
                                {item.status}
                              </span>
                            </div>
                            <div className="bfa-track-timeline-item-detail">
                              {item.detail || item.description}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Booking Particulars Summary */}
                <div className="bfa-track-particulars-card">
                  <h3 className="bfa-track-card-title">Stay Particulars &amp; Accommodation Details</h3>
                  <div className="bfa-track-particulars-grid">
                    <div className="bfa-track-particular-item">
                      <span className="bfa-track-particular-label">Enclave &amp; Property</span>
                      <span className="bfa-track-particular-val">{booking.propertyName}</span>
                      <span style={{ fontSize: '0.8rem', color: '#737a75' }}>{booking.propertyAddress}</span>
                    </div>

                    <div className="bfa-track-particular-item">
                      <span className="bfa-track-particular-label">Selected Suite</span>
                      <span className="bfa-track-particular-val">
                        Unit {booking.unitNumber} — {booking.unitName}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#737a75' }}>{booking.unitType}</span>
                    </div>

                    <div className="bfa-track-particular-item">
                      <span className="bfa-track-particular-label">Stay Period</span>
                      <span className="bfa-track-particular-val">
                        {booking.checkInDate} ➔ {booking.checkOutDate}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#737a75' }}>
                        {booking.nights || 1} Night Stay (Standard Duration)
                      </span>
                    </div>

                    <div className="bfa-track-particular-item">
                      <span className="bfa-track-particular-label">Guest Identity</span>
                      <span className="bfa-track-particular-val">{booking.guestName}</span>
                      <span style={{ fontSize: '0.8rem', color: '#737a75' }}>{booking.guestEmail}</span>
                    </div>

                    <div className="bfa-track-particular-item">
                      <span className="bfa-track-particular-label">Payment Mode</span>
                      <span className="bfa-track-particular-val">
                        {booking.paymentMethod === 'BANK_TRANSFER' ? 'Direct Bank Transfer' : 'Pay at Property'}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#737a75' }}>
                        Status: <strong>{booking.paymentStatus}</strong>
                      </span>
                    </div>

                    <div className="bfa-track-particular-item">
                      <span className="bfa-track-particular-label">Total Stay Valuation</span>
                      <span className="bfa-track-particular-val" style={{ color: '#192a2a', fontSize: '1.2rem' }}>
                        {formatNaira(booking.totalAmount)}
                      </span>
                      {booking.outstandingBalance > 0 && (
                        <span style={{ fontSize: '0.8rem', color: '#9e2323' }}>
                          Outstanding: {formatNaira(booking.outstandingBalance)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Payment Instructions, Actions, Concierge */}
              <aside className="bfa-track-sidebar-col">
                {/* 1. Payment Instructions Card */}
                <div className="bfa-track-payment-card">
                  <h3 className="bfa-track-card-title">
                    <CreditCard size={18} aria-hidden="true" />
                    <span>Payment Information</span>
                  </h3>

                  {booking.paymentMethod === 'BANK_TRANSFER' ? (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: '#737a75', margin: '0 0 12px' }}>
                        Official BFA Corporate Account for transfer settlement:
                      </p>

                      <div className="bfa-track-bank-box">
                        <div className="bfa-track-bank-row">
                          <span className="bfa-track-bank-label">Bank:</span>
                          <span className="bfa-track-bank-value">{paymentConfig?.bankName || 'Zenith Bank PLC'}</span>
                        </div>
                        <div className="bfa-track-bank-row">
                          <span className="bfa-track-bank-label">Account No:</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="bfa-track-bank-value" style={{ fontFamily: 'monospace' }}>
                              {paymentConfig?.accountNumber || '1018273645'}
                            </span>
                            <button
                              type="button"
                              className="bfa-track-copy-icon-btn"
                              style={{ padding: '2px 6px' }}
                              onClick={() => handleCopy(paymentConfig?.accountNumber || '1018273645', 'acct')}
                              title="Copy Account Number"
                            >
                              {copiedField === 'acct' ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </div>
                        </div>
                        <div className="bfa-track-bank-row">
                          <span className="bfa-track-bank-label">Account Name:</span>
                          <span className="bfa-track-bank-value">
                            {paymentConfig?.accountName || 'BFA Serviced Luxury Apartments Ltd'}
                          </span>
                        </div>
                      </div>

                      <div className="bfa-track-disclaimer">
                        <strong>Important:</strong> Uploading or submitting a bank transfer slip does not equal
                        payment verification. Our front desk staff reconciles all payments against live bank records
                        prior to check-in passcode issuance.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: '#737a75', lineHeight: 1.5 }}>
                        You selected <strong>Pay at Property</strong>. Please present cash, bank card (POS), or direct
                        debit at the front desk upon arrival to finalize settlement and receive your smart key.
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Guest Self-Service Actions Card */}
                <div className="bfa-track-actions-card">
                  <h3 className="bfa-track-card-title">Guest Self-Service Actions</h3>

                  {/* Print / Save Receipt */}
                  <button type="button" className="bfa-track-action-btn secondary" onClick={handlePrint}>
                    <Printer size={16} aria-hidden="true" />
                    <span>Print Confirmation Receipt</span>
                  </button>

                  {/* Request Suite Change */}
                  {booking.status !== 'CANCELLED' && booking.status !== 'CHECKED_OUT' && (
                    <button type="button" className="bfa-track-action-btn secondary" onClick={handleOpenRoomChange}>
                      <RefreshCw size={16} aria-hidden="true" />
                      <span>Request Suite Change</span>
                    </button>
                  )}

                  {/* Request Cancellation */}
                  {booking.status !== 'CANCELLED' && booking.status !== 'CHECKED_IN' && booking.status !== 'CHECKED_OUT' && (
                    <button
                      type="button"
                      className="bfa-track-action-btn danger"
                      onClick={() => setShowCancelModal(true)}
                    >
                      <X size={16} aria-hidden="true" />
                      <span>Request Stay Cancellation</span>
                    </button>
                  )}

                  {/* Look up different reservation */}
                  <button type="button" className="bfa-track-action-btn secondary" onClick={handleNewSearch}>
                    <Search size={16} aria-hidden="true" />
                    <span>Track Different Stay</span>
                  </button>
                </div>

                {/* 3. Concierge & Support Card */}
                <div className="bfa-track-actions-card">
                  <h3 className="bfa-track-card-title">Dedicated Concierge Desk</h3>
                  <p style={{ fontSize: '0.85rem', color: '#737a75', margin: 0, lineHeight: 1.5 }}>
                    Need urgent assistance or special arrival accommodations? Our 24/7 concierge desk is on standby.
                  </p>

                  <a
                    href={`https://wa.me/2348000000000?text=Hello%20BFA%20Concierge%2C%20I%20am%20inquiring%20about%20reservation%20${encodeURIComponent(
                      booking.reservationCode
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bfa-track-action-btn whatsapp"
                  >
                    <MessageSquare size={16} aria-hidden="true" />
                    <span>Message WhatsApp Concierge</span>
                  </a>

                  <a href="tel:+2348000000000" className="bfa-track-action-btn secondary">
                    <Phone size={16} aria-hidden="true" />
                    <span>Call Front Desk (+234 800 BFA STAY)</span>
                  </a>
                </div>
              </aside>
            </div>
          )}

          {/* Cancellation Confirmation Dialog */}
          {showCancelModal && (
            <div className="bfa-track-dialog-overlay" role="dialog" aria-modal="true">
              <div className="bfa-track-dialog">
                <h3 className="bfa-track-dialog-title">Request Reservation Cancellation</h3>
                <p className="bfa-track-dialog-desc">
                  Are you sure you want to cancel reservation <strong>{booking.reservationCode}</strong>? Cancelling
                  releases the suite back into live inventory.
                </p>

                <form onSubmit={handleConfirmCancel}>
                  <div className="bfa-track-field-group" style={{ marginBottom: 16 }}>
                    <label className="bfa-track-label">Reason for Cancellation *</label>
                    <select
                      className="bfa-track-input"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    >
                      <option value="CHANGE_OF_PLANS">Change of Travel Plans</option>
                      <option value="DATE_RESCHEDULE">Need to Reschedule Dates</option>
                      <option value="BOOKED_BY_MISTAKE">Booked Wrong Unit / Property</option>
                      <option value="EMERGENCY">Personal Emergency</option>
                      <option value="OTHER">Other Reason</option>
                    </select>
                  </div>

                  <div className="bfa-track-field-group">
                    <label className="bfa-track-label">Additional Notes (Optional)</label>
                    <input
                      type="text"
                      className="bfa-track-input"
                      placeholder="e.g. Flight rescheduled to next week..."
                      value={cancelNotes}
                      onChange={(e) => setCancelNotes(e.target.value)}
                    />
                  </div>

                  <div className="bfa-track-dialog-actions">
                    <button
                      type="button"
                      className="bfa-track-action-btn secondary"
                      onClick={() => setShowCancelModal(false)}
                      disabled={cancelLoading}
                    >
                      Keep Reservation
                    </button>
                    <button
                      type="submit"
                      className="bfa-track-action-btn danger"
                      style={{ background: '#9e2323', color: '#ffffff' }}
                      disabled={cancelLoading}
                    >
                      {cancelLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Room Change Request Dialog */}
          {showChangeModal && (
            <div className="bfa-track-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="room-change-dialog-title">
              <div className="bfa-track-dialog">
                <h3 id="room-change-dialog-title" className="bfa-track-dialog-title">Request Suite Change</h3>
                <p className="bfa-track-dialog-desc">
                  Select an available alternative suite within <strong>{booking.propertyName}</strong>. Our front desk
                  officer will review availability and confirm your suite change.
                </p>

                {changeUnitsLoading ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: '#737a75' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px', color: '#b99a70', display: 'block' }} aria-hidden="true" />
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Retrieving available suites for {booking.propertyName}...</p>
                  </div>
                ) : changeUnitsError ? (
                  <div style={{ marginBottom: 16 }}>
                    <div className="bfa-track-alert error" role="alert" style={{ marginBottom: 12 }}>
                      <AlertTriangle size={18} aria-hidden="true" />
                      <div>{changeUnitsError}</div>
                    </div>
                    <div className="bfa-track-dialog-actions">
                      <button
                        type="button"
                        className="bfa-track-action-btn secondary"
                        onClick={() => setShowChangeModal(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="bfa-track-action-btn primary"
                        onClick={handleOpenRoomChange}
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                        <span>Retry Loading Suites</span>
                      </button>
                    </div>
                  </div>
                ) : availableUnits.length === 0 ? (
                  <div>
                    <div className="bfa-track-disclaimer" style={{ background: '#fdf8ee', borderLeft: '3px solid #b99a70', padding: '14px 16px', borderRadius: 6, marginBottom: 20 }}>
                      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#192a2a' }}>No Alternative Suites Available</p>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#737a75', lineHeight: 1.5 }}>
                        There are currently no alternative suites available for change within {booking.propertyName}. All other suites are occupied or undergoing turnover.
                      </p>
                    </div>
                    <div className="bfa-track-dialog-actions">
                      <button
                        type="button"
                        className="bfa-track-action-btn secondary"
                        onClick={() => setShowChangeModal(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleConfirmRoomChange}>
                    <div className="bfa-track-field-group" style={{ marginBottom: 16 }}>
                      <label htmlFor="target-suite-select" className="bfa-track-label">
                        <span>Select Alternative Suite *</span>
                        <span style={{ fontSize: '0.72rem', color: '#8c948e', textTransform: 'none' }}>
                          ({availableUnits.length} available in {booking.propertyName})
                        </span>
                      </label>
                      <select
                        id="target-suite-select"
                        className="bfa-track-input"
                        value={targetApartmentId}
                        onChange={(e) => setTargetApartmentId(e.target.value)}
                        required
                      >
                        <option value="">-- Choose Alternative Suite --</option>
                        {availableUnits.map((u) => {
                          const delta = parseFloat(u.rate_per_night) - parseFloat(booking.totalAmount);
                          const deltaStr =
                            delta > 0
                              ? `(+${formatNaira(delta)} upgrade)`
                              : delta < 0
                              ? `(-${formatNaira(Math.abs(delta))} lower rate)`
                              : '(Same rate)';
                          return (
                            <option key={u.id} value={u.id}>
                              Unit {u.unit_number} — {u.unit_name} ({u.unit_type}) • {formatNaira(u.rate_per_night)} {deltaStr}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="bfa-track-field-group">
                      <label htmlFor="change-reason-notes" className="bfa-track-label">
                        Special Requests or Change Reason (Optional)
                      </label>
                      <input
                        id="change-reason-notes"
                        type="text"
                        className="bfa-track-input"
                        placeholder="e.g. Prefer higher floor with courtyard view..."
                        value={changeNotes}
                        onChange={(e) => setChangeNotes(e.target.value)}
                      />
                    </div>

                    <div className="bfa-track-dialog-actions">
                      <button
                        type="button"
                        className="bfa-track-action-btn secondary"
                        onClick={() => setShowChangeModal(false)}
                        disabled={changeLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bfa-track-action-btn primary"
                        disabled={changeLoading || !targetApartmentId}
                      >
                        {changeLoading ? 'Submitting Request...' : 'Submit Suite Change Request'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

