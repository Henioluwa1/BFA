import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Clock,
  AlertTriangle,
  Sparkles,
  MapPin,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ArrowRight,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { formatNaira } from '../../utils/currency';
import { publicService, resolveMediaUrl } from '../../services/api';
import './BookingModal.css';

function normalizeAmenitiesList(unitOrProp) {
  const rich = unitOrProp?.apartment_amenities || unitOrProp?.property_amenities || [];
  const raw = Array.isArray(unitOrProp?.amenities) ? unitOrProp.amenities : [];
  const names = [
    ...rich.map((a) => a?.name).filter(Boolean),
    ...raw.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean),
  ];
  return Array.from(new Set(names));
}

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

  // Persistent Guest Form State (preserved across internal modal views)
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

  // Dynamic Property & Apartment Catalogue State
  const resolvedPropId = property?.id || unit?.property_id || unit?.propertyId || null;
  const [liveProperty, setLiveProperty] = useState(property || null);
  const [propertyUnits, setPropertyUnits] = useState(() => (unit?.id ? [unit] : []));
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [catalogueError, setCatalogueError] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState(unit?.id || null);

  // Internal Modal Navigation & Preview State
  const [propertyExpanded, setPropertyExpanded] = useState(false);
  const [detailUnit, setDetailUnit] = useState(null);
  const [activeGalleryUrl, setActiveGalleryUrl] = useState('');
  const [activeGalleryIdx, setActiveGalleryIdx] = useState(0);

  // Live Pricing & Availability
  const [quoteData, setQuoteData] = useState(null);
  const [checkingQuote, setCheckingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [priceUpdateAck, setPriceUpdateAck] = useState(true);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [paymentConfig, setPaymentConfig] = useState(null);

  // Submission & Polling State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedBooking, setSubmittedBooking] = useState(null);
  const [liveTracking, setLiveTracking] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  const modalRef = useRef(null);

  useEffect(() => {
    if (initialCheckInDate) {
      setCheckInDate(initialCheckInDate);
    }
  }, [initialCheckInDate]);

  useEffect(() => {
    if (unit?.id) {
      setSelectedUnitId(unit.id);
    }
  }, [unit?.id]);

  // Fetch Payment Configuration
  useEffect(() => {
    publicService
      .getPaymentConfig()
      .then((res) => {
        if (res.data?.data) setPaymentConfig(res.data.data);
        else if (res.data) setPaymentConfig(res.data);
      })
      .catch(() => {});
  }, []);

  // Load authoritative public property details & its approved/published apartments
  const loadPropertyCatalogue = useCallback(async () => {
    if (!isOpen || !resolvedPropId) return;
    setLoadingCatalogue(true);
    setCatalogueError('');
    try {
      const res = await publicService.getPropertyById(resolvedPropId);
      const payload = res.data?.data || res.data || {};
      const propObj = payload.property || payload || property || null;
      const unitsList = Array.isArray(payload.units) ? payload.units : [];
      setLiveProperty(propObj);
      setPropertyUnits(unitsList);

      setSelectedUnitId((prevId) => {
        if (prevId && unitsList.some((u) => Number(u.id) === Number(prevId))) {
          return prevId;
        }
        if (unit?.id && unitsList.some((u) => Number(u.id) === Number(unit.id))) {
          return unit.id;
        }
        const firstAvail = unitsList.find((u) => u.status === 'AVAILABLE') || unitsList[0];
        return firstAvail ? firstAvail.id : null;
      });
      setActiveGalleryIdx(0);
    } catch (err) {
      setCatalogueError(
        err?.response?.data?.error?.message ||
          err?.message ||
          'Unable to load property and apartment availability.'
      );
    } finally {
      setLoadingCatalogue(false);
    }
  }, [isOpen, resolvedPropId, property, unit?.id]);

  useEffect(() => {
    if (isOpen) {
      setDetailUnit(null);
      setPropertyExpanded(false);
      loadPropertyCatalogue();
    }
  }, [isOpen, loadPropertyCatalogue]);

  const selectedUnit = useMemo(() => {
    if (selectedUnitId && propertyUnits.length > 0) {
      const found = propertyUnits.find((u) => Number(u.id) === Number(selectedUnitId));
      if (found) return found;
    }
    if (unit && (!resolvedPropId || Number(unit.property_id) === Number(resolvedPropId))) {
      return unit;
    }
    return propertyUnits[0] || null;
  }, [selectedUnitId, propertyUnits, unit, resolvedPropId]);

  // Fetch Authoritative Server Quote & Availability for selected apartment + date
  const loadQuoteAndAvail = useCallback(async () => {
    if (!isOpen || !selectedUnit?.id || !checkInDate) return;
    setCheckingQuote(true);
    setQuoteError('');
    setSubmitError('');
    try {
      const [availRes, quoteRes] = await Promise.all([
        publicService
          .checkAvailability({
            apartmentId: selectedUnit.id,
            checkInDate,
          })
          .catch((err) => ({
            data: { isAvailable: false, reason: err?.response?.data?.error?.message || err?.message },
          })),
        publicService
          .getQuote({
            apartmentId: selectedUnit.id,
            checkInDate,
            propertyId: liveProperty?.id || resolvedPropId,
          })
          .catch((err) => {
            setQuoteError(
              err?.response?.data?.error?.message ||
                err?.message ||
                'Unable to verify current apartment rate.'
            );
            return null;
          }),
      ]);

      const availPayload = availRes?.data?.data || availRes?.data || null;
      if (availPayload) {
        setAvailabilityResult(availPayload);
      }

      const qPayload = quoteRes?.data?.data || quoteRes?.data || null;
      if (qPayload) {
        setQuoteData(qPayload);
        const serverRate = Number(qPayload?.breakdown?.ratePerNight ?? qPayload?.quote?.ratePerNight);
        const cardRate = Number(selectedUnit?.rate_per_night);
        if (Number.isFinite(serverRate) && Number.isFinite(cardRate) && serverRate !== cardRate) {
          setPriceUpdateAck(false);
        } else {
          setPriceUpdateAck(true);
        }
      } else {
        setQuoteData(null);
      }
    } finally {
      setCheckingQuote(false);
    }
  }, [isOpen, selectedUnit?.id, selectedUnit?.rate_per_night, checkInDate, liveProperty?.id, resolvedPropId]);

  useEffect(() => {
    loadQuoteAndAvail();
  }, [loadQuoteAndAvail]);

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
      } catch {
        // Polling retry
      }
    }, 4000);

    return () => {
      isPolling = false;
      clearInterval(pollInterval);
    };
  }, [submittedBooking, guestEmail, onBookingConfirmed]);

  const handleAttemptClose = useCallback(() => {
    if (submittedBooking) {
      onClose();
      return;
    }
    if (proofFile || guestName.trim() || guestEmail.trim()) {
      const confirmDiscard = window.confirm('Discard unsaved reservation details and close?');
      if (!confirmDiscard) return;
    }
    onClose();
  }, [submittedBooking, proofFile, guestName, guestEmail, onClose]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        if (detailUnit) {
          setDetailUnit(null);
        } else {
          handleAttemptClose();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, detailUnit, handleAttemptClose]);

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

    const MAX_SIZE = 5 * 1024 * 1024;
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

  const handleOpenApartmentDetail = (apt) => {
    setDetailUnit(apt);
    const firstPhoto =
      apt?.main_photo ||
      apt?.photos?.[0]?.file_url ||
      liveProperty?.main_photo ||
      liveProperty?.primary_photo_url ||
      '';
    setActiveGalleryUrl(resolveMediaUrl(firstPhoto));
  };

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!selectedUnit?.id) {
      setSubmitError('Please select an available apartment within this property before submitting.');
      return;
    }
    const cleanName = guestName.trim();
    const cleanEmail = guestEmail.trim();
    const cleanPhone = guestPhone.trim();

    if (!cleanName || !cleanEmail || !cleanPhone) {
      setSubmitError('Please provide your full name, email address, and phone number.');
      return;
    }
    if (cleanName.split(/\s+/).length < 2) {
      setSubmitError('Please enter your full first and last name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setSubmitError('Please enter a valid email address.');
      return;
    }
    if (cleanPhone.replace(/\D/g, '').length < 7) {
      setSubmitError('Please enter a valid contact phone number (at least 7 digits).');
      return;
    }
    if (!isAvailable) {
      setSubmitError('This apartment is currently unavailable for the selected date.');
      return;
    }
    if (!quoteData?.quoteToken) {
      setSubmitError('Authoritative price quote is unavailable. Please refresh the quote and try again.');
      return;
    }
    if (!priceUpdateAck) {
      setSubmitError('The approved nightly price was updated. Please review and confirm the refreshed quote.');
      return;
    }
    if (paymentOption === 'BANK_TRANSFER' && !proofBase64) {
      setSubmitError('Please attach your bank transfer payment proof receipt before submitting.');
      return;
    }

    setIsSubmitting(true);

    try {
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

      const res = await publicService.createBooking({
        apartmentId: selectedUnit.id,
        propertyId: liveProperty?.id || resolvedPropId,
        guestName: cleanName,
        guestEmail: cleanEmail,
        guestPhone: cleanPhone,
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
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err.message ||
        'Unable to submit reservation request. Please try again.';
      setSubmitError(msg);
      loadQuoteAndAvail();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || (!resolvedPropId && !selectedUnit)) return null;

  const activeProp = liveProperty || property || {};
  const propPhoto = resolveMediaUrl(
    activeProp.main_photo || activeProp.primary_photo_url || activeProp.photos?.[0]?.file_url
  );
  const unitPhoto = resolveMediaUrl(
    selectedUnit?.main_photo ||
      selectedUnit?.primary_photo_url ||
      selectedUnit?.photos?.[0]?.file_url ||
      propPhoto
  );

  const breakdown = quoteData?.breakdown || quoteData?.quote || {};
  const nightlyRate = breakdown.ratePerNight ?? selectedUnit?.rate_per_night ?? null;
  const cautionDeposit = Number(breakdown.cautionDeposit || 0);
  const totalAmount = breakdown.totalAmount ?? nightlyRate;
  const isAvailable =
    Boolean(selectedUnit?.id) &&
    selectedUnit?.status === 'AVAILABLE' &&
    availabilityResult?.isAvailable !== false &&
    !quoteError;

  const propLocationLabel = [activeProp.location, activeProp.district, activeProp.city, activeProp.state]
    .filter(Boolean)
    .join(' • ');
  const propAmenities = normalizeAmenitiesList(activeProp);

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
      <div className="bfa-booking-modal-shell bfa-booking-modal-shell--wide" ref={modalRef}>
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
          style={{ backgroundImage: `url(${detailUnit ? activeGalleryUrl || unitPhoto : unitPhoto || propPhoto})` }}
        >
          <div className="bfa-booking-modal-banner-overlay" />
          <div className="bfa-booking-modal-banner-content">
            <span className="bfa-booking-modal-building-tag">
              <Building2 size={12} /> {activeProp.name || 'BFA Serviced Residences'}
            </span>
            <h2 id="booking-modal-title" className="bfa-booking-modal-title">
              {detailUnit
                ? `${detailUnit.unit_name} (#${detailUnit.unit_number})`
                : selectedUnit
                ? `${selectedUnit.unit_name} (#${selectedUnit.unit_number})`
                : activeProp.name || 'Direct Suite Reservation'}
            </h2>
            <div className="bfa-booking-modal-specs">
              {selectedUnit ? (
                <>
                  <span><Bed size={13} style={{ verticalAlign: 'middle' }} /> {selectedUnit.unit_type || 'Serviced Suite'}</span>
                  <span>•</span>
                  <span><Users size={13} style={{ verticalAlign: 'middle' }} /> Max {selectedUnit.capacity || 2} Guests</span>
                  <span>•</span>
                  <span><Bath size={13} style={{ verticalAlign: 'middle' }} /> {selectedUnit.bathroom_count || 1} Bath</span>
                </>
              ) : (
                <span><MapPin size={13} style={{ verticalAlign: 'middle' }} /> {propLocationLabel || 'Akure, Nigeria'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="bfa-booking-modal-body">
          {submittedBooking ? (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              {liveTracking?.isApproved && liveTracking?.isVerified ? (
                <div>
                  <div className="bfa-celebration-checkmark">✓</div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.4rem' }}>
                    Reservation Verified & Confirmed!
                  </h3>
                  <p style={{ color: '#334155', fontSize: '0.88rem', margin: '0 0 1.25rem' }}>
                    Welcome to BFA Luxury Residences, <strong style={{ color: '#0f172a' }}>{liveTracking.guestName || guestName}</strong>! Your 1-night stay has been confirmed in our official registry.
                  </p>
                  <div className="bfa-passcode-reveal-box">
                    <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                      Official Check-In Passcode
                    </div>
                    <div className="bfa-passcode-val">{liveTracking.authCode || 'BFA-AUTH-GENERATED'}</div>
                    <button
                      type="button"
                      className="bfa-modal-copy-btn"
                      onClick={() => handleCopyText(liveTracking.authCode, 'authCode')}
                    >
                      {copiedField === 'authCode' ? <Check size={13} /> : <Copy size={13} />}
                      {copiedField === 'authCode' ? 'Passcode Copied!' : 'Copy Check-In Passcode'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#fef3c7', color: '#92400e', padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '1rem' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#d97706' }}></span>
                    {liveTracking?.assignedStaffName ? `Claimed by ${liveTracking.assignedStaffName}` : 'Pending Front Desk Verification'}
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.35rem' }}>
                    {paymentOption === 'PAY_AT_PROPERTY' ? 'Booking Request Registered — Pay on Arrival' : 'Payment Proof Dispatched to Front Desk'}
                  </h3>
                  <div className="bfa-modal-section-card" style={{ textAlign: 'left', margin: '1rem 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>Booking Reference:</span>
                      <strong style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>{submittedBooking.reservationCode}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.45rem', fontSize: '0.82rem' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>Residence & Suite:</span>
                      <strong style={{ color: '#0f172a' }}>{activeProp.name} — Unit {selectedUnit?.unit_number} ({selectedUnit?.unit_name})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>Stay Period:</span>
                      <strong style={{ color: '#0f172a' }}>{checkInDate} (1 Night Stay)</strong>
                    </div>
                  </div>
                  <a
                    href={`/track?ref=${encodeURIComponent(submittedBooking.reservationCode)}&email=${encodeURIComponent(guestEmail)}`}
                    className="bfa-modal-submit-btn"
                    style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box', marginBottom: '0.5rem' }}
                  >
                    <span>Open Full Stay Tracker &amp; Receipt</span>
                    <ArrowRight size={14} />
                  </a>
                  <button type="button" className="bfa-modal-cancel-btn" style={{ width: '100%' }} onClick={onClose}>
                    Keep Tracking in Background &amp; Close
                  </button>
                </div>
              )}
            </div>
          ) : detailUnit ? (
            /* NESTED APARTMENT DETAIL VIEW (Preserves booking form state) */
            <div className="bfa-modal-detail-panel">
              <div className="bfa-modal-detail-topbar">
                <button
                  type="button"
                  className="bfa-modal-back-btn"
                  onClick={() => setDetailUnit(null)}
                >
                  <ArrowLeft size={15} />
                  <span>Back to Booking Form</span>
                </button>
                <span className={`bfa-modal-avail-badge ${detailUnit.status === 'AVAILABLE' ? 'available' : 'unavailable'}`}>
                  {detailUnit.status === 'AVAILABLE' ? '✓ Available' : detailUnit.status}
                </span>
              </div>

              {/* Photo Gallery */}
              {(() => {
                const gallery = [
                  ...(detailUnit.photos || []).map((p) => resolveMediaUrl(p.file_url)),
                  ...(detailUnit.internal_spaces || []).flatMap((sp) => (sp.photos || []).map((p) => resolveMediaUrl(p.file_url))),
                ].filter(Boolean);
                const uniqueGallery = Array.from(new Set([activeGalleryUrl, ...gallery].filter(Boolean)));
                return (
                  <div className="bfa-modal-gallery-wrap">
                    {uniqueGallery[0] && (
                      <img src={activeGalleryUrl || uniqueGallery[0]} alt={detailUnit.unit_name} className="bfa-modal-gallery-main" />
                    )}
                    {uniqueGallery.length > 1 && (
                      <div className="bfa-modal-gallery-thumbs">
                        {uniqueGallery.map((url, i) => (
                          <button
                            key={url + i}
                            type="button"
                            className={`bfa-modal-gallery-thumb-btn ${url === activeGalleryUrl ? 'active' : ''}`}
                            onClick={() => setActiveGalleryUrl(url)}
                          >
                            <img src={url} alt={`${detailUnit.unit_name} view ${i + 1}`} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="bfa-modal-section-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      {detailUnit.unit_name} (#{detailUnit.unit_number})
                    </h3>
                    <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '2px' }}>
                      {detailUnit.unit_type || 'Serviced Suite'} {detailUnit.floor ? `• ${detailUnit.floor}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      {formatNaira(detailUnit.rate_per_night)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Approved Rate / Night</div>
                  </div>
                </div>

                <div className="bfa-modal-detail-specs-row">
                  <span><Bed size={14} /> {detailUnit.bedroom_count || 1} Bedroom(s)</span>
                  <span><Bath size={14} /> {detailUnit.bathroom_count || 1} Bathroom(s)</span>
                  <span><Users size={14} /> Max {detailUnit.capacity || 2} Guests</span>
                </div>

                {detailUnit.description && (
                  <p style={{ margin: '0.75rem 0', fontSize: '0.86rem', color: '#334155', lineHeight: 1.55 }}>
                    {detailUnit.description}
                  </p>
                )}

                {(() => {
                  const ams = normalizeAmenitiesList(detailUnit);
                  return ams.length > 0 ? (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                        Suite Amenities &amp; Facilities
                      </div>
                      <div className="bfa-modal-amenity-chips">
                        {ams.map((a) => (
                          <span key={a} className="bfa-modal-amenity-chip">{a}</span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="bfa-booking-modal-footer" style={{ padding: '0.5rem 0 0', background: 'transparent' }}>
                <button type="button" className="bfa-modal-cancel-btn" onClick={() => setDetailUnit(null)}>
                  Back to Form
                </button>
                <button
                  type="button"
                  className="bfa-modal-submit-btn"
                  disabled={detailUnit.status !== 'AVAILABLE'}
                  onClick={() => {
                    setSelectedUnitId(detailUnit.id);
                    setDetailUnit(null);
                  }}
                >
                  <Check size={16} />
                  <span>Select This Apartment &amp; Continue</span>
                </button>
              </div>
            </div>
          ) : (
            /* MAIN BOOKING FORM VIEW */
            <form onSubmit={handleSubmitBooking} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {/* 1. PROPERTY PREVIEW CARD */}
              <div className="bfa-modal-section-card bfa-prop-preview-card">
                <div className="bfa-prop-preview-header">
                  {propPhoto && (
                    <img src={propPhoto} alt={activeProp.name} className="bfa-prop-preview-thumb" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="bfa-prop-preview-eyebrow">Selected Residence</div>
                    <h3 className="bfa-prop-preview-name">{activeProp.name || 'BFA Residence'}</h3>
                    {propLocationLabel && (
                      <div className="bfa-prop-preview-loc">
                        <MapPin size={12} />
                        <span>{propLocationLabel}</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="bfa-prop-expand-btn"
                    onClick={() => setPropertyExpanded((v) => !v)}
                  >
                    <span>{propertyExpanded ? 'Hide Details' : 'Property Info'}</span>
                    {propertyExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {activeProp.description && !propertyExpanded && (
                  <p className="bfa-prop-preview-desc-short">{activeProp.description}</p>
                )}

                {propAmenities.length > 0 && !propertyExpanded && (
                  <div className="bfa-modal-amenity-chips" style={{ marginTop: '0.5rem' }}>
                    {propAmenities.slice(0, 5).map((a) => (
                      <span key={a} className="bfa-modal-amenity-chip">{a}</span>
                    ))}
                    {propAmenities.length > 5 && (
                      <span className="bfa-modal-amenity-chip">+{propAmenities.length - 5} more</span>
                    )}
                  </div>
                )}

                {propertyExpanded && (
                  <div className="bfa-prop-expanded-body">
                    {activeProp.description && (
                      <p style={{ margin: '0 0 0.6rem', fontSize: '0.84rem', color: '#334155', lineHeight: 1.55 }}>
                        {activeProp.description}
                      </p>
                    )}
                    {activeProp.environment_description && (
                      <p style={{ margin: '0 0 0.6rem', fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                        <strong>Neighborhood:</strong> {activeProp.environment_description}
                      </p>
                    )}
                    <div className="bfa-modal-detail-specs-row" style={{ marginBottom: '0.6rem' }}>
                      {activeProp.check_in_time && <span>Check-in: {activeProp.check_in_time}</span>}
                      {activeProp.check_out_time && <span>Check-out: {activeProp.check_out_time}</span>}
                      {activeProp.address && <span>{activeProp.address}</span>}
                    </div>
                    {propAmenities.length > 0 && (
                      <div className="bfa-modal-amenity-chips">
                        {propAmenities.map((a) => (
                          <span key={a} className="bfa-modal-amenity-chip">{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. APARTMENT SELECTION WITHIN THIS PROPERTY */}
              <div className="bfa-modal-section-card">
                <div className="bfa-modal-section-title" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Bed size={15} /> 1. Choose an Apartment at {activeProp.name || 'this Property'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                    {propertyUnits.length} {propertyUnits.length === 1 ? 'Suite' : 'Suites'}
                  </span>
                </div>

                {loadingCatalogue ? (
                  <div className="bfa-apt-skeleton-grid">
                    <div className="bfa-apt-skeleton-card" />
                    <div className="bfa-apt-skeleton-card" />
                  </div>
                ) : catalogueError ? (
                  <div className="bfa-modal-error-notice" style={{ justifyContent: 'space-between' }}>
                    <span>{catalogueError}</span>
                    <button type="button" className="bfa-prop-expand-btn" onClick={loadPropertyCatalogue}>
                      <RefreshCw size={12} /> Retry
                    </button>
                  </div>
                ) : propertyUnits.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                    No publicly bookable apartments are currently available at this property.
                  </div>
                ) : (
                  <>
                    {/* SELECT DROPDOWN */}
                    <div className="bfa-apt-select-dropdown-wrap">
                      <select
                        className="bfa-apt-select-dropdown"
                        value={selectedUnitId ?? ''}
                        onChange={(e) => {
                          setSelectedUnitId(Number(e.target.value));
                          setActiveGalleryIdx(0);
                        }}
                        aria-label="Choose an apartment"
                      >
                        {propertyUnits.map((apt) => (
                          <option key={apt.id} value={apt.id}>
                            {apt.unit_name} (#{apt.unit_number}) — {apt.unit_type || 'Suite'} •{' '}
                            {formatNaira(apt.rate_per_night)}/night •{' '}
                            {apt.status === 'AVAILABLE' ? '✓ Available' : apt.status}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="bfa-apt-dropdown-chevron" />
                    </div>

                    {/* SELECTED APARTMENT PREVIEW PANEL */}
                    {selectedUnit && (() => {
                      const gallery = [
                        resolveMediaUrl(selectedUnit.main_photo || selectedUnit.primary_photo_url),
                        ...(selectedUnit.photos || []).map((p) => resolveMediaUrl(p.file_url)),
                        ...(selectedUnit.internal_spaces || []).flatMap((sp) =>
                          (sp.photos || []).map((p) => resolveMediaUrl(p.file_url))
                        ),
                      ].filter(Boolean);
                      const uniqueGallery = Array.from(new Set(gallery));
                      const safeIdx = Math.min(activeGalleryIdx, uniqueGallery.length - 1);
                      const aptAmenities = normalizeAmenitiesList(selectedUnit);
                      const aptAvailable = selectedUnit.status === 'AVAILABLE';

                      return (
                        <div className="bfa-apt-selected-panel">
                          {/* Gallery */}
                          {uniqueGallery.length > 0 && (
                            <div className="bfa-apt-panel-gallery">
                              <img
                                src={uniqueGallery[safeIdx]}
                                alt={`${selectedUnit.unit_name} — view ${safeIdx + 1}`}
                                className="bfa-apt-panel-gallery-main"
                              />
                              {uniqueGallery.length > 1 && (
                                <div className="bfa-apt-panel-gallery-thumbs">
                                  {uniqueGallery.map((url, i) => (
                                    <button
                                      key={url + i}
                                      type="button"
                                      className={`bfa-apt-panel-thumb-btn${i === safeIdx ? ' active' : ''}`}
                                      onClick={() => setActiveGalleryIdx(i)}
                                      aria-label={`View image ${i + 1}`}
                                    >
                                      <img src={url} alt={`${selectedUnit.unit_name} thumb ${i + 1}`} />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Info row */}
                          <div className="bfa-apt-panel-info">
                            <div className="bfa-apt-panel-info-top">
                              <div>
                                <div className="bfa-apt-panel-name">
                                  {selectedUnit.unit_name}
                                  <span className={`bfa-apt-status-pill ${aptAvailable ? 'avail' : 'busy'}`}>
                                    {aptAvailable ? 'Available' : selectedUnit.status}
                                  </span>
                                </div>
                                <div className="bfa-apt-panel-sub">
                                  Unit #{selectedUnit.unit_number} • {selectedUnit.unit_type || 'Suite'}
                                  {selectedUnit.floor ? ` • ${selectedUnit.floor}` : ''}
                                </div>
                              </div>
                              <div className="bfa-apt-panel-price">
                                <span>{formatNaira(selectedUnit.rate_per_night)}</span>
                                <span className="bfa-apt-panel-price-label">/ night</span>
                              </div>
                            </div>

                            <div className="bfa-apt-select-specs" style={{ margin: '0.5rem 0' }}>
                              <span><Bed size={12} /> {selectedUnit.bedroom_count || 1} Bed</span>
                              <span><Bath size={12} /> {selectedUnit.bathroom_count || 1} Bath</span>
                              <span><Users size={12} /> {selectedUnit.capacity || 2} Guests</span>
                            </div>

                            {selectedUnit.description && (
                              <p className="bfa-apt-panel-desc">{selectedUnit.description}</p>
                            )}

                            {aptAmenities.length > 0 && (
                              <div className="bfa-modal-amenity-chips" style={{ marginTop: '0.4rem' }}>
                                {aptAmenities.map((a) => (
                                  <span key={a} className="bfa-modal-amenity-chip">{a}</span>
                                ))}
                              </div>
                            )}

                            <button
                              type="button"
                              className="bfa-apt-details-btn"
                              style={{ marginTop: '0.65rem', alignSelf: 'flex-start' }}
                              onClick={() => handleOpenApartmentDetail(selectedUnit)}
                            >
                              <Eye size={13} /> Full Details &amp; More Photos
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* 3. STAY DATE, BOOKING SUMMARY & SERVER PRICING */}
              <div className="bfa-modal-section-card primary-accent">
                <div className="bfa-modal-section-title">
                  <Calendar size={15} /> 2. Stay Date &amp; Booking Summary
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
                    {isAvailable ? '✓ Available for 1 Night' : '✕ Unavailable on Date'}
                  </div>
                </div>

                {!isAvailable && (
                  <div className="bfa-modal-error-notice" style={{ marginBottom: '0.75rem' }}>
                    <AlertTriangle size={14} />
                    <span>
                      {availabilityResult?.reason || quoteError || `This apartment is unavailable on ${checkInDate}. Please choose another suite or date.`}
                    </span>
                  </div>
                )}

                {!priceUpdateAck && (
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      background: '#fffbeb',
                      border: '1px solid #fcd34d',
                      borderRadius: '8px',
                      color: '#92400e',
                      fontSize: '0.82rem',
                      marginBottom: '0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <strong>Approved Price Updated:</strong> The nightly rate is now {formatNaira(nightlyRate)}.
                    </span>
                    <button
                      type="button"
                      className="bfa-prop-expand-btn"
                      onClick={() => setPriceUpdateAck(true)}
                    >
                      Confirm Updated Price
                    </button>
                  </div>
                )}

                <div className="bfa-modal-pricing-grid">
                  <div className="bfa-modal-pricing-row">
                    <span>Selected Property:</span>
                    <strong>{activeProp.name || '—'}</strong>
                  </div>
                  <div className="bfa-modal-pricing-row">
                    <span>Selected Apartment:</span>
                    <strong>{selectedUnit ? `${selectedUnit.unit_name} (#${selectedUnit.unit_number})` : 'Select an apartment above'}</strong>
                  </div>
                  <div className="bfa-modal-pricing-row">
                    <span>Approved Nightly Rate (1 Night Stay):</span>
                    <strong>{nightlyRate != null ? formatNaira(nightlyRate) : '—'}</strong>
                  </div>
                  {cautionDeposit > 0 && (
                    <div className="bfa-modal-pricing-row">
                      <span>Refundable Caution Deposit:</span>
                      <strong>{formatNaira(cautionDeposit)}</strong>
                    </div>
                  )}
                  <div className="bfa-modal-pricing-row total">
                    <span>Total Booking Amount (1 Night):</span>
                    <span className="total-val">
                      {checkingQuote ? 'Verifying Quote...' : totalAmount != null ? formatNaira(totalAmount) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. GUEST INFORMATION FORM */}
              <div className="bfa-modal-section-card">
                <div className="bfa-modal-section-title">
                  <User size={15} /> 3. Guest Information &amp; Concierge Notes
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

              {/* 5. PAYMENT METHOD & PROOF UPLOAD */}
              <div className="bfa-modal-section-card">
                <div className="bfa-modal-section-title">
                  <CreditCard size={15} /> 4. Payment Settlement Method
                </div>

                <div className="bfa-modal-payment-options">
                  <label className={`bfa-modal-payment-card ${paymentOption === 'BANK_TRANSFER' ? 'selected' : ''}`}>
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

                  <label className={`bfa-modal-payment-card ${paymentOption === 'PAY_AT_PROPERTY' ? 'selected' : ''}`}>
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

                {paymentOption === 'BANK_TRANSFER' && (
                  <div>
                    <div className="bfa-modal-bank-card">
                      <div className="bfa-modal-bank-header">
                        <span>Official BFA Settlement Account</span>
                        <ShieldCheck size={14} color="#d4af37" />
                      </div>
                      <div className="bfa-modal-bank-acct-row">
                        <div>
                          <div style={{ fontSize: '0.74rem', color: '#e2e8f0', fontWeight: 600 }}>
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
                        <span>Amount: <strong>{totalAmount != null ? formatNaira(totalAmount) : '—'}</strong></span>
                      </div>
                    </div>

                    {proofPreviewUrl ? (
                      <div className="bfa-modal-proof-preview">
                        <img src={proofPreviewUrl} alt="Receipt preview" className="bfa-modal-preview-thumb" />
                        <div className="bfa-modal-preview-meta">
                          <span className="bfa-modal-preview-name">{proofFile?.name || 'Payment Receipt Image'}</span>
                          <span className="bfa-modal-preview-size">
                            ✓ {proofFile ? `${(proofFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Receipt Attached'}
                          </span>
                        </div>
                        <button type="button" className="bfa-modal-remove-proof-btn" onClick={handleRemoveProof}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="bfa-modal-dropzone">
                        <UploadCloud size={24} className="bfa-modal-dropzone-icon" />
                        <div className="bfa-modal-dropzone-prompt">Click to Upload Transfer Proof / Receipt</div>
                        <div className="bfa-modal-dropzone-sub">Supports JPG, PNG, or WebP screenshots up to 5 MB</div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: 'none' }}
                          onChange={(e) => handleProofSelect(e.target.files?.[0])}
                        />
                      </label>
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

              <div className="bfa-booking-modal-footer" style={{ padding: '0.9rem 0 0 0', borderTop: '1px solid #cbd5e1', background: 'transparent' }}>
                <button type="button" className="bfa-modal-cancel-btn" onClick={handleAttemptClose} disabled={isSubmitting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bfa-modal-submit-btn"
                  disabled={isSubmitting || !isAvailable || checkingQuote || !quoteData?.quoteToken || !priceUpdateAck}
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
