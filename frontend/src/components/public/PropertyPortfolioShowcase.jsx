import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  MapPin,
  Bed,
  Bath,
  Users,
  Wifi,
  Tv,
  Wind,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Maximize2,
  Coffee,
  Calendar,
  Layers,
  ArrowRight,
  Check,
  Eye,
} from 'lucide-react';
import { formatNaira } from '../../utils/currency';
import { resolveMediaUrl } from '../../services/api';
import './PropertyPortfolioShowcase.css';

// Helper to determine if unit is a multi-room apartment or a single room / studio suite
export function isApartmentCategory(unit) {
  const type = (unit.unit_type || '').toLowerCase();
  const name = (unit.unit_name || '').toLowerCase();
  const bedrooms = parseInt(unit.bedroom_count || 1, 10);
  return (
    bedrooms > 1 ||
    type.includes('2-bedroom') ||
    type.includes('3-bedroom') ||
    type.includes('penthouse') ||
    type.includes('apartment') ||
    type.includes('waterfront') ||
    type.includes('luxury') ||
    name.includes('penthouse') ||
    name.includes('two-bedroom') ||
    name.includes('breeze')
  );
}

// Multi-image sequence and descriptive internal spaces for any room or apartment
export function getUnitShowcasePhotos(unit) {
  const items = [];
  const seen = new Set();
  if (unit?.main_photo || unit?.primary_photo_url) {
    const mainUrl = resolveMediaUrl(unit.main_photo || unit.primary_photo_url);
    if (mainUrl) {
      seen.add(mainUrl);
      items.push({
        id: `unit-${unit.id || "main"}-cover`,
        label: unit.unit_name || "Primary Interior",
        badge: "📸 Cover Photo",
        photo: mainUrl,
        desc: unit.description || "Primary interior.",
      });
    }
  }
  if (Array.isArray(unit?.photos)) {
    unit.photos.forEach((ph, idx) => {
      const url = resolveMediaUrl(ph.file_url);
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({
        id: `unit-${unit.id || "u"}-photo-${ph.id || idx}`,
        label: ph.caption || `View ${idx + 1}`,
        badge: ph.is_cover ? "★ Cover Photo" : "🛋️ Suite Photo",
        photo: url,
        desc: ph.caption || unit.description || "Suite interior view.",
      });
    });
  }
  if (items.length === 0) {
    items.push({
      id: `unit-${unit?.id || "empty"}`,
      label: unit?.unit_name || "Serviced Suite",
      badge: "🏢 Portal-Managed Suite",
      photo: "",
      desc: unit?.description || "Verified serviced suite managed via the BFA portal.",
    });
  }
  return items;
}

export function getApartmentInternalSpaces(unit, propertyId) {
  return getUnitShowcasePhotos(unit, propertyId);
}

// Interactive Unit Showcase Card with Auto-Slideshow, Navigation Arrows & Space Details
export function UnitShowcaseCard({ unit, building, onOpenBookingModal, onViewApartment }) {
  const photos = getUnitShowcasePhotos(unit, building.id);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-rotation every 4.5 seconds (pauses on hover)
  useEffect(() => {
    if (isPaused || photos.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused, photos.length]);

  const currentPhoto = photos[currentIndex] || photos[0];
  const isAvail = unit.status === 'AVAILABLE';

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  };

  const handleDotClick = (e, idx) => {
    e.stopPropagation();
    setCurrentIndex(idx);
  };

  return (
    <div
      className="bfa-unit-showcase-card"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 1. Main Background Image Showcase with Navigation & Space Details */}
      <div
        className="bfa-unit-main-visual"
        style={{
          backgroundImage: currentPhoto.photo
            ? `url(${currentPhoto.photo})`
            : 'linear-gradient(135deg, #0b1b15 0%, #163329 100%)',
        }}
        onClick={() => onViewApartment(unit, building, photos, currentIndex)}
        title="Click to view full apartment specifications and photos"
      >
        <div className="bfa-unit-visual-overlay" />

        {/* Top Badges */}
        <div className="bfa-visual-top-bar">
          <span className="bfa-unit-visual-badge-type">
            {isApartmentCategory(unit) ? '🏢' : '🔑'} {unit.unit_type}
          </span>
          <span className={`bfa-unit-visual-avail-badge ${isAvail ? 'available' : 'unavailable'}`}>
            {isAvail ? '✓ Available' : '✕ Reserved'}
          </span>
          <span className="bfa-unit-vis-pill">Architectural Visualization</span>
        </div>

        {/* Navigation Arrows */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="bfa-slide-nav-btn prev"
              onClick={handlePrev}
              aria-label="Previous space photo"
              title="Previous photo"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="bfa-slide-nav-btn next"
              onClick={handleNext}
              aria-label="Next space photo"
              title="Next photo"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}

        {/* Space Description Overlay on the Image */}
        <div className="bfa-unit-visual-caption">
          <div className="bfa-caption-pill">
            <Sparkles size={12} color="#fef08a" />
            <span>{currentPhoto.label}</span>
            {photos.length > 1 && (
              <span className="bfa-caption-counter">
                {currentIndex + 1} / {photos.length}
              </span>
            )}
          </div>
          <p className="bfa-caption-desc">{currentPhoto.desc}</p>
        </div>

        {/* Slide Indicator Dots */}
        {photos.length > 1 && (
          <div className="bfa-slide-dots-strip" onClick={(e) => e.stopPropagation()}>
            {photos.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                className={`bfa-slide-dot ${idx === currentIndex ? 'active' : ''}`}
                onClick={(e) => handleDotClick(e, idx)}
                aria-label={`Go to slide ${idx + 1}`}
                title={p.label}
              />
            ))}
          </div>
        )}
      </div>

      {/* 2. Card Details Section */}
      <div className="bfa-unit-card-body">
        <div className="bfa-unit-title-row">
          <div>
            <span className="bfa-unit-property-kicker">{building.name}</span>
            <h4 className="bfa-unit-title">{unit.unit_name}</h4>
            <div className="bfa-unit-specs-chips">
              <span><Users size={13} style={{ verticalAlign: 'middle' }} /> Max {unit.capacity || 2} Guests</span>
              <span>•</span>
              <span><Bed size={13} style={{ verticalAlign: 'middle' }} /> {isApartmentCategory(unit) ? 'Multi-Room Suite' : '1 King/Queen Bed'}</span>
              <span>•</span>
              <span><Bath size={13} style={{ verticalAlign: 'middle' }} /> {unit.bathroom_count || 1} Spa Bath</span>
            </div>
          </div>
        </div>

        {/* Space Selector Quick Tabs */}
        {photos.length > 1 && (
          <div className="bfa-card-spaces-pills-row">
            <span className="bfa-spaces-label">Included Spaces:</span>
            <div className="bfa-spaces-pills-list">
              {photos.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  className={`bfa-card-space-pill ${idx === currentIndex ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Card Footer: Rate + "View Apartment" Button + "Reserve Now" Button */}
        <div className="bfa-unit-card-footer">
          <div className="bfa-unit-rate-stack">
            <span className="bfa-unit-rate-label">Per Night Rate</span>
            <div>
              <span className="bfa-unit-rate-val">{formatNaira(unit.rate_per_night)}</span>
              <span className="bfa-unit-rate-unit"> /nt</span>
            </div>
          </div>

          <div className="bfa-unit-actions-row">
            <button
              type="button"
              className="bfa-unit-view-btn"
              onClick={() => onViewApartment(unit, building, photos, currentIndex)}
              title="View full apartment specifications, gallery and amenities in full-screen"
            >
              <Eye size={15} />
              <span>View Apartment</span>
            </button>

            <button
              type="button"
              className={`bfa-unit-book-now-btn ${isAvail ? '' : 'bfa-btn-alt-date'}`}
              onClick={() => onOpenBookingModal(unit, building)}
            >
              <span>{isAvail ? 'Reserve Now' : 'Book Another Date'}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Full-Screen Detailed Apartment & Room Modal
export function ApartmentFullScreenModal({
  isOpen,
  onClose,
  data,
  onReserveNow,
}) {
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  useEffect(() => {
    if (data?.initialIdx !== undefined) {
      setActivePhotoIdx(data.initialIdx);
    }
  }, [data]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  const { unit, building, photos } = data;
  const currentPhoto = photos[activePhotoIdx] || photos[0];
  const isAvail = unit.status === 'AVAILABLE';

  const handlePrev = (e) => {
    e.stopPropagation();
    setActivePhotoIdx((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setActivePhotoIdx((prev) => (prev + 1) % photos.length);
  };

  return createPortal(
    <div className="bfa-fullscreen-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bfa-fullscreen-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Header */}
        <div className="bfa-fullscreen-header">
          <div className="bfa-fullscreen-header-title">
            <span className="bfa-fullscreen-prop-kicker">
              {building.name} • {building.city || 'Akure'}
            </span>
            <div className="bfa-fullscreen-title-row">
              <h2>{unit.unit_name}</h2>
              {unit.apartment_code && (
                <span className="bfa-fullscreen-code-pill" style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: '700', border: '1px solid #bae6fd' }}>
                  ID: {unit.apartment_code}
                </span>
              )}
              <span className="bfa-fullscreen-type-pill">
                {isApartmentCategory(unit) ? '🏢' : '🔑'} {unit.unit_type}
              </span>
              <span className={`bfa-fullscreen-avail-pill ${isAvail ? 'avail' : 'res'}`}>
                {isAvail ? '✓ Available for Stays' : '✕ Reserved / Inquire for Alternate Dates'}
              </span>
            </div>
          </div>

          <div className="bfa-fullscreen-header-actions">
            <div className="bfa-fullscreen-header-rate">
              <span className="bfa-rate-label">Authoritative Rate</span>
              <span className="bfa-rate-val">{formatNaira(unit.rate_per_night)}</span>
              <span className="bfa-rate-sub">/night (All-inclusive)</span>
            </div>
            <button
              type="button"
              className="bfa-fullscreen-close-btn"
              onClick={onClose}
              aria-label="Close modal"
              title="Close (Esc)"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="bfa-fullscreen-scroll-content">
          {/* 1. Large High-Resolution Visual Gallery Showcase */}
          <div className="bfa-fullscreen-gallery-section">
            <div
              className="bfa-fullscreen-main-photo"
              style={{ backgroundImage: `url(${currentPhoto.photo})` }}
            >
              <div className="bfa-fullscreen-photo-overlay" />

              {/* Prev / Next Arrows */}
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    className="bfa-fullscreen-arrow prev"
                    onClick={handlePrev}
                    aria-label="Previous photograph"
                    title="Previous Space"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    className="bfa-fullscreen-arrow next"
                    onClick={handleNext}
                    aria-label="Next photograph"
                    title="Next Space"
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}

              {/* Space Caption Banner */}
              <div className="bfa-fullscreen-photo-caption">
                <div className="bfa-fs-caption-badge">
                  <Sparkles size={14} color="#fef08a" />
                  <span>{currentPhoto.label}</span>
                  <span className="bfa-fs-counter">
                    {activePhotoIdx + 1} of {photos.length} Spaces
                  </span>
                  <span className="bfa-fs-vis-label">Architectural Visualization</span>
                </div>
                <p className="bfa-fs-caption-text">{currentPhoto.desc}</p>
              </div>
            </div>

            {/* Thumbnail Strip */}
            {photos.length > 1 && (
              <div className="bfa-fullscreen-thumbnails-strip">
                {photos.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`bfa-fullscreen-thumb ${idx === activePhotoIdx ? 'active' : ''}`}
                    onClick={() => setActivePhotoIdx(idx)}
                    style={{ backgroundImage: `url(${p.photo})` }}
                    title={p.label}
                  >
                    <span className="bfa-fs-thumb-label">{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Key Specifications Cards Strip */}
          <div className="bfa-fullscreen-specs-grid">
            <div className="bfa-fs-spec-card">
              <Users size={22} color="#2563eb" />
              <div>
                <span className="bfa-fs-spec-title">Guest Capacity</span>
                <strong>Max {unit.capacity || (isApartmentCategory(unit) ? 4 : 2)} Guests</strong>
                <span>Executive Travelers & Families</span>
              </div>
            </div>

            <div className="bfa-fs-spec-card">
              <Bed size={22} color="#2563eb" />
              <div>
                <span className="bfa-fs-spec-title">Bedding Layout</span>
                <strong>{isApartmentCategory(unit) ? 'Multi-Room Master Suites' : '1 King / Queen Orthopaedic'}</strong>
                <span>600-Thread Egyptian Cotton</span>
              </div>
            </div>

            <div className="bfa-fs-spec-card">
              <Bath size={22} color="#2563eb" />
              <div>
                <span className="bfa-fs-spec-title">Bath & Spa</span>
                <strong>{unit.bathroom_count || (isApartmentCategory(unit) ? 2 : 1)} Spa Bathrooms</strong>
                <span>Rain Shower & Soaking Tub</span>
              </div>
            </div>

            <div className="bfa-fs-spec-card">
              <Maximize2 size={22} color="#2563eb" />
              <div>
                <span className="bfa-fs-spec-title">Living Footprint</span>
                <strong>{isApartmentCategory(unit) ? '120m² - 240m²' : '45m² - 65m²'}</strong>
                <span>Soundproof Double-Glazed</span>
              </div>
            </div>
          </div>

          {/* 3. Detailed Description & Spaces Walkthrough */}
          <div className="bfa-fullscreen-section-block">
            <h3 className="bfa-fs-section-heading">Detailed Suite Architecture & Features</h3>
            <p className="bfa-fs-desc-lead">
              {unit.description ||
                `Engineered to the highest residential hospitality standard in Akure, ${unit.unit_name} at ${building.name} provides absolute acoustic calm, continuous dual-grid power, and bespoke concierge services tailored for discerning executives and families.`}
            </p>

            <h4 style={{ margin: '1.5rem 0 0.85rem', color: '#0f172a', fontSize: '1.05rem', fontWeight: 800 }}>
              Included Spaces in this Accommodation:
            </h4>
            <div className="bfa-fs-spaces-detailed-list">
              {photos.map((p, idx) => (
                <div
                  key={p.id}
                  className={`bfa-fs-space-item ${idx === activePhotoIdx ? 'highlighted' : ''}`}
                  onClick={() => setActivePhotoIdx(idx)}
                >
                  <div className="bfa-fs-space-thumb" style={{ backgroundImage: `url(${p.photo})` }} />
                  <div className="bfa-fs-space-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="bfa-fs-space-badge">{p.badge}</span>
                      <strong>{p.label}</strong>
                    </div>
                    <p>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Verified In-Suite Amenities Checklist */}
          <div className="bfa-fullscreen-section-block">
            <h3 className="bfa-fs-section-heading">Verified In-Suite Amenities & Facilities</h3>
            {unit.apartment_amenities && unit.apartment_amenities.length > 0 ? (
              <div
                className="bfa-fs-dynamic-amenities-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '16px',
                  marginTop: '16px',
                }}
              >
                {unit.apartment_amenities.map((am, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: '14px',
                      background: '#f8fafc',
                      padding: '14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      alignItems: 'flex-start',
                    }}
                  >
                    {am.photo_url ? (
                      <img
                        src={am.photo_url}
                        alt={am.name}
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          flexShrink: 0,
                          border: '1px solid #cbd5e1',
                        }}
                      />
                    ) : (
                      <div className="bfa-check-bubble" style={{ flexShrink: 0, marginTop: '2px' }}>
                        <Check size={14} />
                      </div>
                    )}
                    <div>
                      <strong style={{ display: 'block', fontSize: '15px', color: '#0f172a', marginBottom: '4px' }}>
                        {am.name}
                      </strong>
                      <span style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.4' }}>
                        {am.description || 'Verified in-suite apartment amenity.'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bfa-fs-amenities-checklist">
                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>24/7 Guaranteed Dual Power</strong>
                    <span>Dual Cummins 500kVA silent generators + solar hybrid battery bank with sub-50ms ATS.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Ultra-Low Latency Wi-Fi 6</strong>
                    <span>Dedicated enterprise 500 Mbps fiber line with private in-suite access points.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>4K Ultra HD Smart TV Entertainment</strong>
                    <span>55" or 65" displays with Netflix, Prime Video, YouTube & full DStv Premium package.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Silent Inverter Climate Control</strong>
                    <span>Multi-zone whisper-quiet inverter air conditioning for personalized temperature comfort.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Fully Fitted Kitchen / Kitchenette</strong>
                    <span>Induction cooktop, microwave, double-door refrigerator, cookware, and porcelain dining sets.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Espresso Bar & Electric Kettle</strong>
                    <span>Complimentary premium coffee pods, artisan teas, and daily spring bottled water.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Luxury Spa Rain Shower & Bath</strong>
                    <span>Pressurized instant thermostatic hot water, organic botanical shampoo, and plush towels.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Executive Study Workstation</strong>
                    <span>Ergonomic desk, leather swivel chair, multi-socket universal power surge strip, and USB-C ports.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Electronic Digital Laptop Safe</strong>
                    <span>Secure passcode-protected safe fitted inside walk-in wardrobe for valuables.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Acoustic Soundproofing & Blackout</strong>
                    <span>Soundproof double-glazed windows and automated motorized blackout drapes for uninterrupted rest.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Daily Professional Housekeeping</strong>
                    <span>Impeccable sanitization, daily bed turnover, fresh towels, and dry-cleaning laundry concierge.</span>
                  </div>
                </div>

                <div className="bfa-fs-amenity-item">
                  <div className="bfa-check-bubble"><Check size={14} /></div>
                  <div>
                    <strong>Biometric Security & Guarded Parking</strong>
                    <span>24/7 CCTV surveillance, biometric access gates, and complimentary subterranean parking.</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Stay Guidelines & House Rules */}
          <div className="bfa-fullscreen-section-block bfa-fs-rules-block">
            <h3 className="bfa-fs-section-heading">Stay Policies & Guidelines</h3>
            <div className="bfa-fs-rules-row">
              <div>
                <strong>🕒 Check-In Schedule:</strong>
                <span>From 14:00 (2:00 PM) with mobile cryptographic keycode or front desk dispatch.</span>
              </div>
              <div>
                <strong>🕚 Check-Out Schedule:</strong>
                <span>Up to 11:00 (11:00 AM). Late check-out subject to availability upon request.</span>
              </div>
              <div>
                <strong>🛡️ Verified Authenticity:</strong>
                <span>Cryptographic verification token issued instantly with receipt upon confirmation.</span>
              </div>
              <div>
                <strong>🚭 Clean Air Policy:</strong>
                <span>Strictly non-smoking in-suite. Designated outdoor relaxation balconies provided.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Sticky Bottom Action Footer */}
        <div className="bfa-fullscreen-sticky-footer">
          <div className="bfa-fs-footer-rate">
            <span className="bfa-fs-footer-label">Stay Rate</span>
            <div>
              <span className="bfa-fs-footer-val">{formatNaira(unit.rate_per_night)}</span>
              <span className="bfa-fs-footer-unit"> /night</span>
            </div>
          </div>

          <div className="bfa-fs-footer-actions">
            <button
              type="button"
              className="bfa-fs-secondary-btn"
              onClick={onClose}
            >
              Back to Browse
            </button>

            <button
              type="button"
              className="bfa-fs-primary-btn"
              onClick={onReserveNow}
            >
              <span>{isAvail ? 'Reserve This Apartment Now' : 'Check Availability for Another Date'}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
export default function PropertyPortfolioShowcase({
  properties = [],
  apartments = [],
  selectedBuildingId = '1',
  onSelectBuilding,
  onOpenBookingModal,
  onViewPropertyPage,
}) {
  const [activeBuildingId, setActiveBuildingId] = useState(String(selectedBuildingId || '1'));
  // Category selection: 'rooms' or 'apartments'
  const [categorySelection, setCategorySelection] = useState('rooms');
  // Full-screen apartment details modal state
  const [viewApartmentData, setViewApartmentData] = useState(null);
  // Lightbox modal state for grounds/facilities
  const [lightboxItem, setLightboxItem] = useState(null);
  const [lightboxGallery, setLightboxGallery] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Sync prop changes
  useEffect(() => {
    if (selectedBuildingId) {
      setActiveBuildingId(String(selectedBuildingId));
    }
  }, [selectedBuildingId]);

  const effectiveProperties = properties || [];

  const activeBuilding =
    effectiveProperties.find((p) => String(p.id) === String(activeBuildingId)) ||
    effectiveProperties[0] ||
    null;

  const activeBuildingGallery = React.useMemo(() => {
    if (!activeBuilding || !Array.isArray(activeBuilding.photos)) return [];
    return activeBuilding.photos.map((p, idx) => ({
      id: p.id || idx,
      image: resolveMediaUrl(p.file_url),
      badge: p.is_cover ? '★ Cover Photo' : 'Property Photo',
      title: p.caption || activeBuilding.name,
      desc: p.caption || activeBuilding.description || '',
    }));
  }, [activeBuilding]);

  const effectiveApartments = apartments || [];

  // Filter apartments belonging to the active building
  const buildingUnits = effectiveApartments.filter(
    (u) => String(u.property_id) === String(activeBuilding?.id)
  );

  const roomsList = buildingUnits.filter((u) => !isApartmentCategory(u));
  const apartmentsList = buildingUnits.filter((u) => isApartmentCategory(u));

  const handleSelectBuildingInternal = (bId) => {
    const sId = String(bId);
    setActiveBuildingId(sId);
    if (onSelectBuilding) onSelectBuilding(sId);

    // Smoothly scroll to the focused building section with sticky nav offset
    const el = document.getElementById('bfa-focused-building-view');
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleOpenViewApartment = (unit, building, photos, initialIdx = 0) => {
    setViewApartmentData({
      unit,
      building,
      photos,
      initialIdx,
    });
  };

  const openLightbox = (gallery, index = 0) => {
    setLightboxGallery(gallery);
    setLightboxIndex(index);
    setLightboxItem(gallery[index] || null);
  };

  const closeLightbox = () => {
    setLightboxItem(null);
  };

  const nextLightboxPhoto = () => {
    const nextIdx = (lightboxIndex + 1) % lightboxGallery.length;
    setLightboxIndex(nextIdx);
    setLightboxItem(lightboxGallery[nextIdx]);
  };

  const prevLightboxPhoto = () => {
    const prevIdx = (lightboxIndex - 1 + lightboxGallery.length) % lightboxGallery.length;
    setLightboxIndex(prevIdx);
    setLightboxItem(lightboxGallery[prevIdx]);
  };

  if (!activeBuilding) return null;

  return (
    <div className="bfa-portfolio-showcase">
      {/* 1. Portfolio Header */}
      <div className="bfa-portfolio-header">
        <h2 className="bfa-portfolio-title">
          Three Distinct Buildings. Uncompromising Luxury.
        </h2>
      </div>

      {/* 2. Three-Building Overview Cards */}
      <div className="bfa-buildings-overview-grid">
        {effectiveProperties.map((p) => {
          const isSelected = String(p.id) === String(activeBuildingId);
          const photo = resolveMediaUrl(p.primary_photo_url || p.main_photo);
          const availCount = p.available_units !== undefined ? p.available_units : p.total_units;

          return (
            <div
              key={p.id}
              className={`bfa-building-overview-card ${isSelected ? 'active-selected' : ''}`}
              onClick={() => handleSelectBuildingInternal(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectBuildingInternal(p.id);
                }
              }}
            >
              <div
                className="bfa-building-overview-visual"
                style={{ backgroundImage: `url(${photo})` }}
              >
                <div className="bfa-building-overview-overlay" />
                <span className="bfa-building-code-badge">✦ {p.code}</span>
                <span className="bfa-building-avail-badge">
                  {availCount > 0 ? `✓ ${availCount} Units` : 'Fully Reserved'}
                </span>
                <span className="bfa-representative-badge">Representative Photo</span>

                <div className="bfa-building-visual-footer">
                  <h3 className="bfa-building-visual-title">{p.name}</h3>
                  <div className="bfa-building-visual-location">
                    <MapPin size={12} /> {p.city}, Ondo State
                  </div>
                </div>
              </div>

              <div className="bfa-building-overview-body">
                <p className="bfa-building-desc-short">
                  {p.description || 'Modern serviced building engineered for acoustic privacy and executive comfort in Akure.'}
                </p>

                <div className="bfa-building-feature-chips">
                  <span className="bfa-building-feature-chip">⚡ 100% 24/7 Power</span>
                  <span className="bfa-building-feature-chip">🛡️ Biometric Security</span>
                  <span className="bfa-building-feature-chip">🏊 Pool / Grounds</span>
                </div>

                <div className="bfa-building-overview-footer">
                  <div className="bfa-building-price-info">
                    <span className="bfa-building-price-label">Starting from</span>
                    <div className="bfa-building-price-val-row">
                      <span className="bfa-building-price-val">{formatNaira(p.startingRate || p.starting_rate || '160000')}</span>
                      <span className="bfa-building-price-unit">/nt</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`bfa-building-explore-btn ${isSelected ? 'active-viewing' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectBuildingInternal(p.id);
                    }}
                  >
                    <span>{isSelected ? '✓ Currently Viewing' : 'Explore Building'}</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Deep-Dive View of Selected Building */}
      {activeBuilding && (
      <div className="bfa-focused-building-panel" id="bfa-focused-building-view">
        <div
          className="bfa-focused-building-hero"
          style={{
            backgroundImage: resolveMediaUrl(activeBuilding.primary_photo_url || activeBuilding.main_photo)
              ? `url(${resolveMediaUrl(activeBuilding.primary_photo_url || activeBuilding.main_photo)})`
              : 'linear-gradient(135deg, #0b1b15 0%, #163329 100%)',
          }}
        >
          <div className="bfa-focused-hero-overlay" />
          <div className="bfa-focused-hero-content">
            <span className="bfa-focused-hero-tagline">
              <Sparkles size={12} color="#fef08a" />
              <span>Active Property Exploration</span>
            </span>
            <h3 className="bfa-focused-hero-title">{activeBuilding.name}</h3>
            <p className="bfa-focused-hero-address">
              <MapPin size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              {activeBuilding.address || activeBuilding.location || 'Akure, Ondo State'}
            </p>
            <p className="bfa-focused-hero-desc">{activeBuilding.description}</p>

            <div className="bfa-focused-hero-metrics">
              <div className="bfa-hero-metric">
                <span className="bfa-hero-metric-val">14:00 / 11:00</span>
                <span className="bfa-hero-metric-lbl">Check-In / Out</span>
              </div>
              <div className="bfa-hero-metric">
                <span className="bfa-hero-metric-val">100% 24/7</span>
                <span className="bfa-hero-metric-lbl">Continuous Dual Power</span>
              </div>
              <div className="bfa-hero-metric">
                <span className="bfa-hero-metric-val">500 Mbps</span>
                <span className="bfa-hero-metric-lbl">Dedicated Wi-Fi 6</span>
              </div>
              <div className="bfa-hero-metric">
                <span className="bfa-hero-metric-val">Guarded</span>
                <span className="bfa-hero-metric-lbl">Biometric Security</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Grounds, Exterior & Shared Facilities Interactive Exploration */}
        <div className="bfa-environment-gallery-section">
          <div className="bfa-environment-header-row">
            <div className="bfa-environment-title-wrap">
              <h4>🌿 Building Environment, Grounds & Shared Facilities</h4>
              <p>Inspect the architectural exterior, manicured grounds, resident pool, and private communal areas.</p>
            </div>
            <button
              type="button"
              className="bfa-expand-gallery-link"
              onClick={() => openLightbox(activeBuildingGallery, 0)}
            >
              <span>Click any photograph to enlarge</span>
              <Maximize2 size={13} />
            </button>
          </div>

          <div className="bfa-environment-strip">
            {activeBuildingGallery.map((item, idx) => (
              <div
                key={item.id}
                className="bfa-env-photo-card"
                onClick={() => openLightbox(activeBuildingGallery, idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openLightbox(activeBuildingGallery, idx);
                }}
                title={`Enlarge ${item.title}`}
              >
                <div
                  className="bfa-env-photo-bg"
                  style={{ backgroundImage: `url(${item.image})` }}
                >
                  <span className="bfa-env-photo-badge">{item.badge}</span>
                  <div className="bfa-env-zoom-pill">
                    <Maximize2 size={12} color="#ffffff" />
                    <span>Enlarge</span>
                  </div>
                </div>
                <div className="bfa-env-card-details">
                  <strong className="bfa-env-photo-title">{item.title}</strong>
                  <p className="bfa-env-photo-desc">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

          {/* 5. Clear Rooms vs Apartments Selection Toggle */}
          <div className="bfa-category-toggle-container">
            <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: '#64748b' }}>
              Choose Accommodation Category
            </span>
            <div className="bfa-category-toggle-pills" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={categorySelection === 'rooms'}
                className={`bfa-category-pill-btn ${categorySelection === 'rooms' ? 'active' : ''}`}
                onClick={() => setCategorySelection('rooms')}
              >
                <Bed size={15} />
                <span className="bfa-pill-label-desktop">Single Rooms & Studios</span>
                <span className="bfa-pill-label-mobile">Rooms & Studios</span>
                <span className="bfa-category-pill-count">{roomsList.length}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={categorySelection === 'apartments'}
                className={`bfa-category-pill-btn ${categorySelection === 'apartments' ? 'active' : ''}`}
                onClick={() => setCategorySelection('apartments')}
              >
                <Layers size={15} />
                <span className="bfa-pill-label-desktop">Multi-Room Serviced Apartments</span>
                <span className="bfa-pill-label-mobile">Apartments</span>
                <span className="bfa-category-pill-count">{apartmentsList.length}</span>
              </button>
            </div>
          </div>

          {/* 6. Units Grid Display: High-End Interactive Carousel Cards */}
          <div className="bfa-units-grid-section">
            {/* When ROOMS Selected */}
            {categorySelection === 'rooms' && (
              <div>
                {roomsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <Bed size={36} color="#64748b" style={{ margin: '0 auto 0.5rem' }} />
                    <h4 style={{ margin: '0.5rem 0', color: '#0f172a' }}>No Single Rooms Listed</h4>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
                      This building exclusively features multi-room serviced apartments. Please switch to the Apartments tab above.
                    </p>
                  </div>
                ) : (
                  <div className="bfa-units-cards-grid">
                    {roomsList.map((unit) => (
                      <UnitShowcaseCard
                        key={unit.id}
                        unit={unit}
                        building={activeBuilding}
                        onOpenBookingModal={(u, b) => {
                          if (onOpenBookingModal) onOpenBookingModal(u, b);
                        }}
                        onViewApartment={handleOpenViewApartment}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* When APARTMENTS Selected (Multi-Room Visual Tour) */}
            {categorySelection === 'apartments' && (
              <div>
                {apartmentsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <Layers size={36} color="#64748b" style={{ margin: '0 auto 0.5rem' }} />
                    <h4 style={{ margin: '0.5rem 0', color: '#0f172a' }}>No Multi-Room Apartments Listed</h4>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
                      All units in this building are single rooms or studio suites. Please switch to the Rooms tab above.
                    </p>
                  </div>
                ) : (
                  <div className="bfa-units-cards-grid">
                    {apartmentsList.map((unit) => (
                      <UnitShowcaseCard
                        key={unit.id}
                        unit={unit}
                        building={activeBuilding}
                        onOpenBookingModal={(u, b) => {
                          if (onOpenBookingModal) onOpenBookingModal(u, b);
                        }}
                        onViewApartment={handleOpenViewApartment}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Lightbox Modal for Grounds & Shared Facilities */}
      {lightboxItem && (
        <div className="bfa-lightbox-backdrop" onClick={closeLightbox}>
          <div className="bfa-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="bfa-lightbox-close-btn"
              onClick={closeLightbox}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>

            <div
              className="bfa-lightbox-image"
              style={{ backgroundImage: `url(${lightboxItem.image || lightboxItem.photo})` }}
            >
              {lightboxGallery.length > 1 && (
                <>
                  <button
                    type="button"
                    className="bfa-lightbox-nav-btn prev"
                    onClick={prevLightboxPhoto}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button
                    type="button"
                    className="bfa-lightbox-nav-btn next"
                    onClick={nextLightboxPhoto}
                    aria-label="Next photo"
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
            </div>

            <div className="bfa-lightbox-caption">
              <h4>{lightboxItem.title || lightboxItem.label}</h4>
              <p>{lightboxItem.desc}</p>
              {lightboxGallery.length > 1 && (
                <span className="bfa-lightbox-counter">
                  Photo {lightboxIndex + 1} of {lightboxGallery.length}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 8. Full-Screen Detailed Apartment & Room Modal */}
      <ApartmentFullScreenModal
        isOpen={Boolean(viewApartmentData)}
        onClose={() => setViewApartmentData(null)}
        data={viewApartmentData}
        onReserveNow={() => {
          const u = viewApartmentData?.unit;
          const b = viewApartmentData?.building;
          setViewApartmentData(null);
          if (onOpenBookingModal && u && b) {
            onOpenBookingModal(u, b);
          }
        }}
      />
    </div>
  );
}
