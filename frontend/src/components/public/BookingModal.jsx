import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Copy,
  Calendar,
  User,
  Mail,
  Phone,
  ShieldCheck,
  Building2,
  Bed,
  Bath,
  Users,
  CreditCard,
  UploadCloud,
  FileText,
  Clock,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { formatNaira } from '../../utils/currency';
import { publicService } from '../../services/api';
import { getRoomTypePhoto, getPropertyPhoto } from './ApartmentDetailModal';
import './BookingModal.css';

export default function BookingModal({
  isOpen,
  onClose,
  unit,
  property,
  initialCheckInDate,
  onBookingConfirmed,
}) {
  const [checkInDate, setCheckInDate] = useState(() => {
    if (initialCheckInDate) return initialCheckInDate;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [paymentOption, setPaymentOption] = useState('BANK_TRANSFER');

  // Proof Upload State
  const [proofFile, setProofFile] = useState(null);
  const [proofBase64, setProofBase64] = useState('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState('');
  const [proofError, setProofError] = useState('');

  // Live Pricing & Availability
  const [quoteData, setQuoteData] = useState(null);
  const [checkingQuote, setCheckingQuote] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [paymentConfig, setPaymentConfig] = useState(null);

  // Submission & Polling State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedBooking, setSubmittedBooking] = useState(null);
  const [liveTracking, setLiveTracking] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  const modalRef = useRef(null);

  // Sync initial check-in date
  useEffect(() => {
    if (initialCheckInDate) {
      setCheckInDate(initialCheckInDate);
    }
  }, [initialCheckInDate]);

  // Fetch Payment Configuration
  useEffect(() => {
    publicService
      .getPaymentConfig()
      .then((res) => {
        if (res.data?.data) {
          setPaymentConfig(res.data.data);
        } else if (res.data) {
          setPaymentConfig(res.data);
        }
      })
      .catch((err) => console.warn('Payment configuration load notice:', err));
  }, []);

  // Fetch Authoritative Server Quote & Availability
  useEffect(() => {
    if (!isOpen || !unit?.id || !checkInDate) return;

    let isMounted = true;
    setCheckingQuote(true);
    setSubmitError('');

    async function loadQuoteAndAvail() {
      try {
        const [availRes, quoteRes] = await Promise.all([
          publicService.checkAvailability({
            apartmentId: unit.id,
            checkInDate,
          }).catch(() => ({ data: { isAvailable: true } })),
          publicService.getQuote({
            apartmentId: unit.id,
            checkInDate,
            propertyId: property?.id,
          }).catch(() => null),
        ]);

        if (!isMounted) return;

        if (availRes?.data) {
          setAvailabilityResult(availRes.data);
        }
        if (quoteRes?.data) {
          setQuoteData(quoteRes.data);
        }
      } catch (err) {
        if (isMounted) {
          console.warn('Quote load notice:', err);
        }
      } finally {
        if (isMounted) setCheckingQuote(false);
      }
    }

    loadQuoteAndAvail();
    return () => { isMounted = false; };
  }, [isOpen, unit?.id, checkInDate, property?.id]);

  // Live Polling when booking request is submitted
  useEffect(() => {
    if (!submittedBooking?.reservationCode) return;

    let isPolling = true;
    const pollInterval = setInterval(async () => {
      if (!isPolling) return;
      try {
        const res = await publicService.trackBooking({
          reservationCode: submittedBooking.reservationCode,
          guestEmail: submittedBooking.guestEmail || guestEmail.trim(),
        });
        if (isPolling && res.data) {
          setLiveTracking(res.data);
          if (res.data.isApproved && res.data.isVerified) {
            clearInterval(pollInterval);
            if (onBookingConfirmed) {
              onBookingConfirmed(res.data);
            }
          }
          if (res.data.status === 'DECLINED') {
            clearInterval(pollInterval);
          }
        }
      } catch (pollErr) {
        // Polling retry
      }
    }, 4000);

    return () => {
      isPolling = false;
      clearInterval(pollInterval);
    };
  }, [submittedBooking, guestEmail, onBookingConfirmed]);

  // Keyboard accessibility: Escape to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        handleAttemptClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, proofFile, guestName, submittedBooking]);

  const handleAttemptClose = () => {
    // If request already submitted, safe to close
    if (submittedBooking) {
      onClose();
      return;
    }
    // If unsaved data present, confirm before discarding
    if (proofFile || guestName.trim() || guestEmail.trim()) {
      const confirmDiscard = window.confirm('Discard unsaved reservation details and close?');
      if (!confirmDiscard) return;
    }
    onClose();
  };

  const handleCopyText = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(''), 2500);
  };

  const handleProofSelect = (file) => {
    setProofError('');
    if (!file) return;

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setProofError('Please upload a valid JPEG, PNG, or WebP image receipt.');
      return;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      setProofError(`File exceeds 5MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a smaller receipt.`);
      return;
    }

    setProofFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target.result;
      setProofBase64(b64);
      setProofPreviewUrl(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProof = () => {
    setProofFile(null);
    setProofBase64('');
    setProofPreviewUrl('');
    setProofError('');
  };

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
      setSubmitError('Please provide your full name, email address, and phone number.');
      return;
    }

    if (paymentOption === 'BANK_TRANSFER' && !proofBase64) {
      setSubmitError('Please attach your bank transfer payment proof receipt before submitting.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Upload proof file via backend upload endpoint if bank transfer
      let serverProofUrl = null;
      let serverFilePath = null;

      if (paymentOption === 'BANK_TRANSFER' && proofBase64) {
        const uploadRes = await publicService.uploadPaymentProof({
          fileData: proofBase64,
          fileName: proofFile?.name,
          fileType: proofFile?.type,
        });
        serverProofUrl = uploadRes.data?.proofUrl || uploadRes?.proofUrl;
        serverFilePath = uploadRes.data?.filePath || uploadRes?.filePath;
      }

      // 2. Submit reservation request
      const res = await publicService.createBooking({
        apartmentId: unit.id,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestPhone: guestPhone.trim(),
        checkInDate,
        paymentOption,
        paymentMethod: paymentOption,
        quoteToken: quoteData?.quoteToken,
        proofUrl: serverProofUrl,
        proofFilePath: serverFilePath,
        proofFileName: proofFile?.name,
        proofFileSizeBytes: proofFile?.size,
        proofMimeType: proofFile?.type,
        specialRequests: specialRequests.trim() || undefined,
      });

      setSubmittedBooking(res.data);
      setLiveTracking(res.data);
    } catch (err) {
      setSubmitError(err.message || err.response?.data?.message || err.response?.data?.error?.message || 'Unable to submit reservation request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !unit) return null;

  const unitPhoto = getRoomTypePhoto(unit.unit_type, property?.id || unit.property_id);
  const nightlyRate = quoteData?.quote?.ratePerNight || unit.rate_per_night || '160000';
  const cautionDeposit = quoteData?.quote?.cautionDeposit || 0;
  const totalAmount = quoteData?.quote?.totalAmount || nightlyRate;
  const isAvailable = availabilityResult?.isAvailable !== false;

  return (
    <div
      className="bfa-booking-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleAttemptClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="bfa-booking-modal-shell" ref={modalRef}>
        {/* Accessible Close Button (Top-Right, Always Visible) */}
        <button
          type="button"
          className="bfa-booking-modal-close-btn"
          onClick={handleAttemptClose}
          aria-label="Close reservation dialog"
          title="Close dialog (Esc)"
        >
          <X size={18} />
        </button>

        {/* Header Visual Banner */}
        <div
          className="bfa-booking-modal-banner"
          style={{ backgroundImage: `url(${unitPhoto})` }}
        >
          <div className="bfa-booking-modal-banner-overlay" />
          <div className="bfa-booking-modal-banner-content">
            <span className="bfa-booking-modal-building-tag">
              <Building2 size={12} /> {property?.name || 'BFA Serviced Residences'}
            </span>
            <h2 id="booking-modal-title" className="bfa-booking-modal-title">
              {unit.unit_name} (#{unit.unit_number})
            </h2>
            <div className="bfa-booking-modal-specs">
              <span><Bed size={13} style={{ verticalAlign: 'middle' }} /> {unit.unit_type || 'Executive Suite'}</span>
              <span>•</span>
              <span><Users size={13} style={{ verticalAlign: 'middle' }} /> Max {unit.capacity || 2} Guests</span>
              <span>•</span>
              <span><Bath size={13} style={{ verticalAlign: 'middle' }} /> {unit.bathroom_count || 1} Spa Bath</span>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="bfa-booking-modal-body">
          {/* Post-Submission Live Verification State */}
          {submittedBooking ? (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              {liveTracking?.isApproved && liveTracking?.isVerified ? (
                /* Celebration State */
                <div>
                  <div className="bfa-celebration-checkmark">✓</div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.4rem' }}>
                    Reservation Verified & Confirmed!
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '0 0 1.25rem' }}>
                    Welcome to BFA Luxury Residences, <strong>{liveTracking.guestName || guestName}</strong>! Your 1-night stay has been confirmed in our official registry.
                  </p>

                  {/* Check-In Passcode Box */}
                  <div className="bfa-passcode-reveal-box">
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                      Official Check-In Passcode
                    </div>
                    <div className="bfa-passcode-val">
                      {liveTracking.authCode || 'BFA-AUTH-GENERATED'}
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: '0.35rem 0 0.75rem' }}>
                      Present this passcode upon arrival at the concierge desk for instant smart key collection.
                    </p>
                    <button
                      type="button"
                      className="bfa-modal-copy-btn"
                      onClick={() => handleCopyText(liveTracking.authCode, 'authCode')}
                    >
                      {copiedField === 'authCode' ? <Check size={13} /> : <Copy size={13} />}
                      {copiedField === 'authCode' ? 'Passcode Copied!' : 'Copy Check-In Passcode'}
                    </button>
                  </div>

                  <div className="bfa-modal-section-card" style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#64748b' }}>Reference Code:</span>
                      <strong style={{ fontFamily: 'monospace', color: '#2563eb' }}>{liveTracking.reservationCode}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#64748b' }}>Residence & Suite:</span>
                      <strong>{liveTracking.propertyName} — Unit {liveTracking.unitNumber}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#64748b' }}>Stay Period:</span>
                      <strong>{liveTracking.checkInDate} ➔ {liveTracking.checkOutDate}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.45rem', marginTop: '0.45rem' }}>
                      <span style={{ color: '#0f172a', fontWeight: 700 }}>Total Stay Valuation:</span>
                      <strong style={{ color: '#059669', fontSize: '1.05rem' }}>{formatNaira(liveTracking.totalAmount)}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="bfa-modal-submit-btn"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={onClose}
                  >
                    Done / Return to Experience
                  </button>
                </div>
              ) : liveTracking?.status === 'DECLINED' ? (
                /* Declined State */
                <div style={{ background: '#fef2f2', border: '1px solid #fecdd3', borderRadius: '12px', padding: '1.5rem', textAlign: 'center' }}>
                  <AlertTriangle size={36} color="#dc2626" style={{ margin: '0 auto 0.75rem' }} />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#991b1b', margin: '0 0 0.5rem' }}>
                    Payment Verification Declined
                  </h3>
                  <p style={{ color: '#7f1d1d', fontSize: '0.88rem', margin: '0 0 1.25rem' }}>
                    {liveTracking.declineReason || 'Our front desk could not verify your transfer with the bank statement. Please verify the amount or re-submit proof.'}
                  </p>
                  <button
                    type="button"
                    className="bfa-modal-submit-btn"
                    style={{ background: '#dc2626', width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      setSubmittedBooking(null);
                      setLiveTracking(null);
                    }}
                  >
                    Re-Submit Payment Proof
                  </button>
                </div>
              ) : (
                /* In-Progress Review State (2–5 Minutes Window) */
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#fef3c7', color: '#92400e', padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#d97706', animation: 'bfaPulseRing 2s infinite' }}></span>
                    {liveTracking?.assignedStaffName ? `Claimed by ${liveTracking.assignedStaffName}` : 'Pending Front Desk Verification'}
                  </div>

                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.35rem' }}>
                    {paymentOption === 'PAY_AT_PROPERTY'
                      ? 'Booking Request Registered — Pay on Arrival'
                      : 'Payment Proof Dispatched to Front Desk'}
                  </h3>
                  <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
                    {paymentOption === 'PAY_AT_PROPERTY' ? (
                      <span>
                        Thank you, <strong>{guestName}</strong>. Your reservation request is in our official queue.
                        Please settle payment at the concierge desk upon check-in.
                      </span>
                    ) : (
                      <span>
                        Thank you, <strong>{guestName}</strong>. Our front desk team is matching your transfer with our
                        bank statement.
                      </span>
                    )}
                  </p>

                  <div className="bfa-modal-section-card" style={{ textAlign: 'left', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Booking Reference:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563eb', fontSize: '0.95rem' }}>
                          {submittedBooking.reservationCode}
                        </span>
                        <button
                          type="button"
                          className="bfa-modal-copy-btn"
                          style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem', color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe' }}
                          onClick={() => handleCopyText(submittedBooking.reservationCode, 'refCode')}
                        >
                          {copiedField === 'refCode' ? <Check size={11} /> : <Copy size={11} />}
                          {copiedField === 'refCode' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
                      <span style={{ color: '#64748b' }}>Assigned Officer:</span>
                      <strong style={{ color: liveTracking?.assignedStaffName ? '#0f172a' : '#d97706' }}>
                        {liveTracking?.assignedStaffName ? `👤 ${liveTracking.assignedStaffName}` : '⏳ Awaiting receptionist pickup...'}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
                      <span style={{ color: '#64748b' }}>Estimated Review Window:</span>
                      <strong style={{ color: '#2563eb' }}>2 – 5 Minutes</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
                      <span style={{ color: '#64748b' }}>Residence & Suite:</span>
                      <strong>{property?.name || 'BFA Residences'} — Unit {unit.unit_number} ({unit.unit_name})</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
                      <span style={{ color: '#64748b' }}>Stay Period:</span>
                      <strong>{checkInDate} (1 Night Stay)</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.45rem', marginTop: '0.45rem', fontSize: '0.82rem' }}>
                      <span style={{ color: '#0f172a', fontWeight: 700 }}>Total Quoted Stay Amount:</span>
                      <strong style={{ color: '#059669', fontSize: '0.95rem' }}>{formatNaira(totalAmount)}</strong>
                    </div>

                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.76rem', color: '#64748b', background: '#f1f5f9', padding: '0.45rem 0.65rem', borderRadius: '6px' }}>
                      ℹ️ Live verification status refreshes automatically every 4 seconds. Your check-in passcode will unlock upon front desk confirmation.
                    </p>
                  </div>

                  {/* 4-Step Timeline */}
                  <div className="bfa-tracking-timeline" style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
                    {(liveTracking?.timeline || [
                      { step: 1, title: 'Booking Request Submitted', status: 'COMPLETED', detail: 'Receipt proof recorded.' },
                      { step: 2, title: 'Front Desk Claim & Assignment', status: liveTracking?.assignedStaffName ? 'COMPLETED' : 'IN_PROGRESS', detail: liveTracking?.assignedStaffName ? `Assigned to ${liveTracking.assignedStaffName}` : 'Awaiting front desk pickup (2–5 mins)' },
                      { step: 3, title: 'Bank Transfer Verification', status: 'IN_PROGRESS', detail: 'Matching payment proof with bank statement.' },
                      { step: 4, title: 'Approval & Key Card Passcode', status: 'PENDING', detail: 'Passcode unlocks upon verification.' },
                    ]).map((s) => (
                      <div key={s.step} className="bfa-timeline-step">
                        <div className={`bfa-timeline-dot ${s.status === 'COMPLETED' ? 'completed' : s.status === 'IN_PROGRESS' ? 'in-progress' : 'pending'}`}>
                          {s.status === 'COMPLETED' ? '✓' : s.step}
                        </div>
                        <div className="bfa-timeline-content">
                          <div className="bfa-timeline-title">{s.title}</div>
                          <div className="bfa-timeline-desc">{s.detail || s.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <a
                      href={`/track?ref=${encodeURIComponent(submittedBooking.reservationCode)}&email=${encodeURIComponent(guestEmail)}`}
                      className="bfa-modal-submit-btn"
                      style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
                    >
                      <span>Open Full Stay Tracker &amp; Receipt</span>
                      <ArrowRight size={14} />
                    </a>

                    <button
                      type="button"
                      className="bfa-modal-cancel-btn"
                      style={{ width: '100%' }}
                      onClick={onClose}
                    >
                      Keep Tracking in Background &amp; Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Active Booking Form Wizard */
            <form onSubmit={handleSubmitBooking} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* 1. Stay Date & Server Pricing Breakdown */}
              <div className="bfa-modal-section-card primary-accent">
                <div className="bfa-modal-section-title">
                  <Calendar size={15} /> 1. Stay Date & Authoritative Pricing
                </div>

                <div className="bfa-modal-date-row" style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="date"
                    className="bfa-modal-date-input"
                    value={checkInDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    required
                  />
                  <div className={`bfa-modal-avail-badge ${isAvailable ? 'available' : 'unavailable'}`}>
                    {isAvailable ? '✓ Available for 1 Night' : '✕ Reserved / In Maintenance'}
                  </div>
                </div>

                {!isAvailable && (
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '8px',
                      color: '#be123c',
                      fontSize: '0.82rem',
                      marginBottom: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontWeight: 600,
                    }}
                  >
                    <span>✕</span>
                    <span>This room is currently reserved on {checkInDate}. Please select another check-in date above.</span>
                  </div>
                )}

                <div className="bfa-modal-pricing-grid">
                  <div className="bfa-modal-pricing-row">
                    <span>Nightly Rate (1 Night):</span>
                    <strong>{formatNaira(nightlyRate)}</strong>
                  </div>
                  {cautionDeposit > 0 && (
                    <div className="bfa-modal-pricing-row">
                      <span>Refundable Caution Deposit:</span>
                      <strong>{formatNaira(cautionDeposit)}</strong>
                    </div>
                  )}
                  <div className="bfa-modal-pricing-row total">
                    <span>Total Stay Valuation:</span>
                    <span className="total-val">
                      {checkingQuote ? 'Calculating...' : formatNaira(totalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Guest Information Form */}
              <div className="bfa-modal-section-card">
                <div className="bfa-modal-section-title">
                  <User size={15} /> 2. Guest Information & Concierge Notes
                </div>

                <div className="bfa-modal-form-grid">
                  <div className="bfa-modal-field">
                    <label className="bfa-modal-label">
                      <User size={13} /> Full Guest Name *
                    </label>
                    <input
                      type="text"
                      className="bfa-modal-input"
                      placeholder="e.g. Chief Adebayo Adeleke"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="bfa-modal-field">
                    <label className="bfa-modal-label">
                      <Mail size={13} /> Guest Email Address *
                    </label>
                    <input
                      type="email"
                      className="bfa-modal-input"
                      placeholder="e.g. guest@example.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="bfa-modal-field">
                    <label className="bfa-modal-label">
                      <Phone size={13} /> Phone / WhatsApp Number *
                    </label>
                    <input
                      type="tel"
                      className="bfa-modal-input"
                      placeholder="e.g. 0803 123 4567"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      required
                    />
                  </div>

                  <div className="bfa-modal-field">
                    <label className="bfa-modal-label">
                      <Clock size={13} /> Estimated Arrival Time
                    </label>
                    <input
                      type="text"
                      className="bfa-modal-input"
                      placeholder="e.g. 2:00 PM - 5:00 PM"
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Payment Method & Instructions */}
              <div className="bfa-modal-section-card">
                <div className="bfa-modal-section-title">
                  <CreditCard size={15} /> 3. Payment Settlement Method
                </div>

                <div className="bfa-modal-payment-options">
                  <label
                    className={`bfa-modal-payment-card ${paymentOption === 'BANK_TRANSFER' ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="paymentOption"
                      value="BANK_TRANSFER"
                      checked={paymentOption === 'BANK_TRANSFER'}
                      onChange={() => setPaymentOption('BANK_TRANSFER')}
                      className="bfa-modal-payment-radio"
                    />
                    <div className="bfa-modal-payment-text">
                      <strong>🏦 Pay Now by Bank Transfer</strong>
                      <span>Upload transfer proof for fast 2–5 min priority dispatch</span>
                    </div>
                  </label>

                  <label
                    className={`bfa-modal-payment-card ${paymentOption === 'PAY_AT_PROPERTY' ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="paymentOption"
                      value="PAY_AT_PROPERTY"
                      checked={paymentOption === 'PAY_AT_PROPERTY'}
                      onChange={() => setPaymentOption('PAY_AT_PROPERTY')}
                      className="bfa-modal-payment-radio"
                    />
                    <div className="bfa-modal-payment-text">
                      <strong>🛎️ Pay on Arrival</strong>
                      <span>Settle balance at concierge desk prior to key card issuance</span>
                    </div>
                  </label>
                </div>

                {/* Bank Account Details Card (When Bank Transfer Selected) */}
                {paymentOption === 'BANK_TRANSFER' && (
                  <div>
                    <div className="bfa-modal-bank-card">
                      <div className="bfa-modal-bank-header">
                        <span>Official BFA Settlement Account</span>
                        <ShieldCheck size={14} color="#d4af37" />
                      </div>

                      <div className="bfa-modal-bank-acct-row">
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            {paymentConfig?.bankName || 'ZENITH BANK PLC'}
                          </div>
                          <div className="bfa-modal-bank-acct-num">
                            {paymentConfig?.accountNumber || '1018273645'}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="bfa-modal-copy-btn"
                          onClick={() => handleCopyText(paymentConfig?.accountNumber || '1018273645', 'acct')}
                        >
                          {copiedField === 'acct' ? <Check size={13} /> : <Copy size={13} />}
                          {copiedField === 'acct' ? 'Copied' : 'Copy'}
                        </button>
                      </div>

                      <div className="bfa-modal-bank-details">
                        <span>Beneficiary: <strong>{paymentConfig?.accountName || 'BFA APARTMENTS LIMITED'}</strong></span>
                        <span>Amount: <strong>{formatNaira(totalAmount)}</strong></span>
                      </div>
                    </div>

                    {/* Receipt Upload Dropzone */}
                    {proofPreviewUrl ? (
                      <div className="bfa-modal-proof-preview">
                        <img src={proofPreviewUrl} alt="Receipt preview" className="bfa-modal-preview-thumb" />
                        <div className="bfa-modal-preview-meta">
                          <span className="bfa-modal-preview-name">{proofFile?.name || 'Payment Receipt Image'}</span>
                          <span className="bfa-modal-preview-size">
                            ✓ {proofFile ? `${(proofFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Receipt Attached'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="bfa-modal-remove-proof-btn"
                          onClick={handleRemoveProof}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label className="bfa-modal-dropzone">
                          <UploadCloud size={24} className="bfa-modal-dropzone-icon" />
                          <div className="bfa-modal-dropzone-prompt">
                            Click to Upload Transfer Proof / Receipt
                          </div>
                          <div className="bfa-modal-dropzone-sub">
                            Supports JPG, PNG, or WebP screenshots up to 5 MB
                          </div>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: 'none' }}
                            onChange={(e) => handleProofSelect(e.target.files?.[0])}
                          />
                        </label>
                      </div>
                    )}

                    {proofError && (
                      <div className="bfa-modal-error-notice" style={{ marginTop: '0.5rem' }}>
                        <AlertTriangle size={14} /> {proofError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {submitError && (
                <div className="bfa-modal-error-notice">
                  <AlertTriangle size={15} /> {submitError}
                </div>
              )}

              {/* Footer Actions */}
              <div className="bfa-booking-modal-footer" style={{ padding: '0.75rem 0 0 0', border: 'none' }}>
                <button
                  type="button"
                  className="bfa-modal-cancel-btn"
                  onClick={handleAttemptClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bfa-modal-submit-btn"
                  disabled={isSubmitting || !isAvailable || checkingQuote}
                >
                  {isSubmitting ? (
                    'Dispatching Request...'
                  ) : (
                    <>
                      <span>Submit Reservation Request</span>
                      <Sparkles size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

