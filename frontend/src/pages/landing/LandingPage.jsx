import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicService } from '../../services/api';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

// Modular Public Components
import PublicTopNav from '../../components/public/PublicTopNav';
import HeroSection from '../../components/public/home/HeroSection';
import FeaturedPropertiesSection from '../../components/public/home/FeaturedPropertiesSection';
import HospitalityIntroSection from '../../components/public/home/HospitalityIntroSection';
import SuiteTypesPreviewSection from '../../components/public/home/SuiteTypesPreviewSection';
import GuestConvenienceSection from '../../components/public/home/GuestConvenienceSection';
import PublicFooter from '../../components/public/home/PublicFooter';

// Modals & Interactive Overlays
import FloatingChatWidget from '../../components/public/FloatingChatWidget';
import BfaLuxuryLoader from '../../components/public/BfaLuxuryLoader';
import ApartmentDetailModal from '../../components/public/ApartmentDetailModal';
import BookingTrackingModal from '../../components/public/BookingTrackingModal';
import BookingModal from '../../components/public/BookingModal';

import '../../styles/landing.css';

/**
 * LandingPage — Luxury Editorial External Homepage
 * Fully responsive, accessible (WCAG 2.2 AA), authoritative data-driven.
 */
export default function LandingPage() {
  const navigate = useNavigate();

  // Core Data States
  const [properties, setProperties] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [loadingProps, setLoadingProps] = useState(true);
  const [dataError, setDataError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);

  // Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailPropertyId, setDetailPropertyId] = useState(1);
  const [selectedRoomTypeForModal, setSelectedRoomTypeForModal] = useState(null);
  const [modalInitialTab, setModalInitialTab] = useState('gallery');

  // Universal Luxury Booking Modal State
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingModalUnit, setBookingModalUnit] = useState(null);
  const [bookingModalProperty, setBookingModalProperty] = useState(null);
  const [bookingCheckInDate, setBookingCheckInDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  // Dedicated Tracking / Self-Service Modal State
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [trackingInitialRef, setTrackingInitialRef] = useState('');
  const [trackingInitialEmail, setTrackingInitialEmail] = useState('');

  // Cryptographic Verification Modal State (Direct Modal)
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyQuery, setVerifyQuery] = useState('');
  const [verifyContact, setVerifyContact] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationError, setVerificationError] = useState('');

  // Enable natural document scrolling while on public landing page
  useEffect(() => {
    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    document.body.classList.add('bfa-landing-body');
    return () => {
      document.documentElement.style.height = '';
      document.body.style.height = '';
      document.body.classList.remove('bfa-landing-body');
    };
  }, []);

  // Authoritative API Data Load
  const loadData = useCallback(async () => {
    setLoadingProps(true);
    setDataError('');
    try {
      const [propsRes, aptsRes, annRes] = await Promise.all([
        publicService.getProperties(),
        publicService.getApartments(),
        publicService.getAnnouncements({ location: 'PUBLIC_LANDING' }).catch(() => ({ data: [] })),
      ]);
      setProperties(propsRes.data || []);
      setApartments(aptsRes.data || []);
      setAnnouncements(annRes.data || []);
    } catch (err) {
      console.error('Failed to load public data:', err);
      setDataError(err.message || 'Unable to load residential properties. Please verify your connection.');
    } finally {
      setLoadingProps(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Apartment Detail Modal
  const handleOpenApartmentDetails = (propertyId, roomType = null, initialTab = 'gallery') => {
    setDetailPropertyId(Number(propertyId) || 1);
    setSelectedRoomTypeForModal(roomType);
    setModalInitialTab(initialTab);
    setDetailModalOpen(true);
  };

  // Open Universal Luxury Booking Modal
  const handleOpenBooking = (targetProp = null, targetUnit = null, chosenCheckInDate = null) => {
    const prop = targetProp || properties[0] || null;
    let unit = targetUnit;
    if (!unit && prop) {
      const propApts = apartments.filter((a) => String(a.property_id) === String(prop.id));
      unit = propApts.find((a) => a.status === 'AVAILABLE') || propApts[0] || null;
    }

    if (chosenCheckInDate) {
      setBookingCheckInDate(chosenCheckInDate);
    }

    setBookingModalProperty(prop);
    setBookingModalUnit(unit);
    setBookingModalOpen(true);
  };

  // Open Tracking Modal with optional parameters
  const handleOpenTracking = (ref = '', email = '') => {
    setTrackingInitialRef(ref || '');
    setTrackingInitialEmail(email || '');
    setTrackingModalOpen(true);
  };

  // Handle Hero Search Bar Submission
  const handleHeroSearch = ({ propertyId, checkInDate, checkOutDate, guests }) => {
    if (checkInDate) {
      setBookingCheckInDate(checkInDate);
    }

    if (propertyId) {
      const matchedProp = properties.find((p) => String(p.id) === String(propertyId));
      if (matchedProp) {
        handleOpenBooking(matchedProp, null, checkInDate);
        return;
      }
    }

    // If no specific property was selected, smooth scroll to residences
    const el = document.getElementById('residences');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Handle Cryptographic Reservation Verification
  const handleVerifySubmit = async (e) => {
    if (e) e.preventDefault();
    if (!verifyQuery.trim()) {
      setVerificationError('Please enter a reservation reference or authentication code.');
      return;
    }
    setVerifyLoading(true);
    setVerificationError('');
    setVerificationResult(null);

    try {
      const res = await publicService.verifyReservation({
        referenceCode: verifyQuery.trim(),
        contact: verifyContact.trim() || undefined,
      });
      setVerificationResult(res.data);
    } catch (err) {
      setVerificationError(err.message || 'Unable to cryptographically verify reservation. Please check your reference.');
    } finally {
      setVerifyLoading(false);
    }
  };

  return (
    <div className="bfa-editorial-page">
      {/* Skip to Main Content Link for A11y */}
      <a href="#main-content" className="bfa-skip-link">
        Skip to main content
      </a>

      {/* Luxury Loader Overlay (Dismisses immediately once ready, max 2s) */}
      {initialLoading && (
        <BfaLuxuryLoader
          onComplete={() => setInitialLoading(false)}
          isReady={!loadingProps}
        />
      )}

      {/* Discrete Editorial Announcement Banner */}
      {announcements.length > 0 && !announcementDismissed && (
        <aside className="bfa-editorial-announcement-banner" role="status" aria-live="polite">
          <div className="bfa-announcement-container">
            <span className="bfa-announcement-tag">Notice</span>
            <span className="bfa-announcement-text">{announcements[0].message || announcements[0].title}</span>
            <button
              type="button"
              className="bfa-announcement-dismiss"
              onClick={() => setAnnouncementDismissed(true)}
              aria-label="Dismiss notice"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {/* Sticky Editorial Navigation */}
      <PublicTopNav
        activePage="home"
        onOpenBooking={() => handleOpenBooking()}
        onOpenTracking={() => handleOpenTracking()}
        onVerifyClick={() => setVerifyModalOpen(true)}
      />

      {/* Main Landmark */}
      <main id="main-content" tabIndex="-1" className="bfa-main-flow">
        {/* Hero Section with Integrated Search */}
        <HeroSection
          properties={properties}
          apartments={apartments}
          onSearch={handleHeroSearch}
          onOpenBooking={handleOpenBooking}
          onViewDetails={(prop) => handleOpenApartmentDetails(prop.id)}
        />

        {/* Featured Residences Section */}
        <FeaturedPropertiesSection
          properties={properties}
          loading={loadingProps}
          onOpenBooking={handleOpenBooking}
          onViewDetails={(prop) => handleOpenApartmentDetails(prop.id)}
        />

        {/* Hospitality Standards & Uninterrupted Amenities */}
        <HospitalityIntroSection />

        {/* Suite Types & Accommodations Showcase */}
        <SuiteTypesPreviewSection />

        {/* Guest Convenience & Stay Self-Service Hub */}
        <GuestConvenienceSection
          onOpenTracking={handleOpenTracking}
        />
      </main>

      {/* Editorial Footer */}
      <PublicFooter
        onOpenTracking={() => handleOpenTracking()}
      />

      {/* Floating Concierge Chat Widget */}
      <FloatingChatWidget />

      {/* Interactive Apartment Detail & Gallery Modal */}
      <ApartmentDetailModal
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedRoomTypeForModal(null);
        }}
        apartmentId={detailPropertyId}
        propertyData={properties.find((p) => p.id === detailPropertyId) || null}
        roomTypeData={selectedRoomTypeForModal}
        initialTab={modalInitialTab}
        onSelectUnitAndBook={(propId, unitId) => {
          const prop = properties.find((p) => p.id === propId) || null;
          const unit = apartments.find((a) => a.id === unitId) || null;
          handleOpenBooking(prop, unit);
        }}
      />

      {/* Universal Luxury Booking Modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        unit={bookingModalUnit}
        property={bookingModalProperty}
        initialCheckInDate={bookingCheckInDate}
        onBookingConfirmed={(confirmedData) => {
          // When booking is confirmed, open tracking modal to display status
          setBookingModalOpen(false);
          handleOpenTracking(confirmedData.reservationCode, confirmedData.guestEmail);
        }}
      />

      {/* Dedicated Guest Tracking & Stay Self-Service Modal */}
      <BookingTrackingModal
        isOpen={trackingModalOpen}
        onClose={() => setTrackingModalOpen(false)}
        initialReference={trackingInitialRef}
        initialEmail={trackingInitialEmail}
      />

      {/* Cryptographic Verification Modal */}
      <Modal
        isOpen={verifyModalOpen}
        onClose={() => {
          setVerifyModalOpen(false);
          setVerificationResult(null);
          setVerificationError('');
        }}
        title="Verify Reservation Authenticity"
      >
        <div className="bfa-verify-modal-content">
          <p className="bfa-verify-modal-desc">
            BFA issues cryptographically verifiable reservations. Enter your reservation reference or door authentication code to confirm registration in the central system.
          </p>

          <form onSubmit={handleVerifySubmit} className="bfa-verify-form">
            <div className="bfa-verify-field">
              <label htmlFor="verify-ref-input" className="bfa-verify-label">
                Booking Reference or Auth Code *
              </label>
              <input
                id="verify-ref-input"
                type="text"
                placeholder="e.g. BFA-RES-1234 or BFA-AUTH-ABC12345"
                value={verifyQuery}
                onChange={(e) => setVerifyQuery(e.target.value)}
                required
                className="bfa-verify-input"
              />
            </div>

            <div className="bfa-verify-field">
              <label htmlFor="verify-contact-input" className="bfa-verify-label">
                Guest Email or Phone (Optional)
              </label>
              <input
                id="verify-contact-input"
                type="text"
                placeholder="e.g. guest@example.com or 08012345678"
                value={verifyContact}
                onChange={(e) => setVerifyContact(e.target.value)}
                className="bfa-verify-input"
              />
            </div>

            <Button type="submit" variant="primary" disabled={verifyLoading} style={{ width: '100%' }}>
              {verifyLoading ? 'Verifying Cryptographic Record...' : 'Verify Reservation Authenticity'}
            </Button>
          </form>

          {verificationError && (
            <div className="bfa-verify-alert bfa-verify-alert-error" role="alert">
              ✕ {verificationError}
            </div>
          )}

          {verificationResult && (
            <div className="bfa-verify-alert bfa-verify-alert-success" role="status">
              <div className="bfa-verify-badge-verified">
                ✓ AUTHENTICATED &amp; CRYPTOGRAPHICALLY VERIFIED
              </div>

              <div className="bfa-verify-detail-row">
                <span>Reservation Ref:</span>
                <strong>{verificationResult.reservationCode}</strong>
              </div>
              <div className="bfa-verify-detail-row">
                <span>Auth Code:</span>
                <code>{verificationResult.authenticationCode}</code>
              </div>
              <div className="bfa-verify-detail-row">
                <span>Guest:</span>
                <strong>{verificationResult.guestName}</strong>
              </div>
              <div className="bfa-verify-detail-row">
                <span>Residence / Unit:</span>
                <span>
                  {verificationResult.propertyName} (Unit {verificationResult.unitNumber})
                </span>
              </div>
              <div className="bfa-verify-detail-row">
                <span>Payment Status:</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: verificationResult.paymentStatus === 'PAID' ? '#16a34a' : '#d97706',
                  }}
                >
                  {verificationResult.paymentStatus}
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
