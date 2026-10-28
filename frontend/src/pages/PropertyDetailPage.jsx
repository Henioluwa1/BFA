import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { publicService } from '../services/api';
import { formatNaira } from '../utils/currency';
import PublicTopNav from '../components/public/PublicTopNav';
import ApartmentDetailModal, {
  getPropertyPhoto,
  getRoomTypePhoto,
  getRoomTypeGallery,
  APARTMENTS_CATALOG,
} from '../components/public/ApartmentDetailModal';
import FloatingChatWidget from '../components/public/FloatingChatWidget';
import Icons8Icon from '../components/public/Icons8Icon';
import '../styles/propertyDetail.css';

export default function PropertyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [property, setProperty] = useState(null);
  const [roomTypes, setRoomTypes] = useState([]);
  const [units, setUnits] = useState([]);
  const [allProperties, setAllProperties] = useState([]);

  // Gallery category filter
  const [galleryCategory, setGalleryCategory] = useState('all');
  // Lightbox modal state
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Selected room type for detailed specs modal
  const [selectedRoomType, setSelectedRoomType] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState('gallery');

  // Booking Engine State
  const [checkInDate, setCheckInDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [availabilityError, setAvailabilityError] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [paymentOption, setPaymentOption] = useState('PAY_AT_PROPERTY');
  const [paymentChannel, setPaymentChannel] = useState('CARD');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  // Search in Top Nav
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const searchContainerRef = useRef(null);

  // Verification modal state
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyQuery, setVerifyQuery] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verificationError, setVerificationError] = useState('');

  // Handle scroll detection for dynamic nav
  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 120);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to top on id change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  // Load property detail and all properties for switcher
  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const propId = parseInt(id, 10);
        if (!propId || isNaN(propId)) {
          throw new Error('Invalid property identifier.');
        }

        const [detailRes, allPropsRes] = await Promise.all([
          publicService.getPropertyById(propId),
          publicService.getProperties().catch(() => ({ data: [] })),
        ]);

        if (!isMounted) return;

        const payload = detailRes?.data || detailRes;
        const prop = payload?.property || (payload?.id ? payload : null);
        const rTypes = payload?.roomTypes || [];
        const uList = payload?.units || [];

        if (prop) {
          setProperty(prop);
          setRoomTypes(rTypes);
          setUnits(uList);

          // Pre-select first available unit if present
          const availUnits = uList.filter((u) => u.status === 'AVAILABLE');
          if (availUnits.length > 0) {
            setSelectedUnitId(String(availUnits[0].id));
          } else if (uList.length > 0) {
            setSelectedUnitId(String(uList[0].id));
          }
        } else {
          throw new Error('Property record not found.');
        }

        const allProps = allPropsRes?.data || allPropsRes || [];
        setAllProperties(Array.isArray(allProps) ? allProps : []);
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to load property details:', err);
        setError(err.message || 'Unable to load building details.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [id]);

  // Catalog fallback data for galleries and extended specs
  const catalogData = property ? APARTMENTS_CATALOG[property.id] || APARTMENTS_CATALOG[1] : APARTMENTS_CATALOG[1];
  const galleryItems = catalogData?.gallery || [];

  const filteredGallery = galleryCategory === 'all'
    ? galleryItems
    : galleryItems.filter((item) => item.category === galleryCategory);

  const heroPhoto = property ? getPropertyPhoto(property.id, property.code) : '';

  // Handle availability check
  const handleCheckAvailability = async (e) => {
    if (e) e.preventDefault();
    if (!selectedUnitId) {
      setAvailabilityError('Please select a suite or room type to check availability.');
      return;
    }
    setCheckingAvailability(true);
    setAvailabilityError('');
    setAvailabilityResult(null);

    try {
      const res = await publicService.checkAvailability({
        apartmentId: parseInt(selectedUnitId, 10),
        checkInDate,
      });
      setAvailabilityResult(res.data);
    } catch (err) {
      setAvailabilityError(err.message || 'Error checking availability.');
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Handle direct reservation
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!guestName || !guestEmail || !guestPhone) {
      alert('Please fill in your name, email, and phone number.');
      return;
    }
    setBookingLoading(true);

    try {
      const res = await publicService.createBooking({
        apartmentId: parseInt(selectedUnitId, 10),
        guestName,
        guestEmail,
        guestPhone,
        checkInDate,
        paymentMethod: paymentOption === 'PAY_AT_PROPERTY' ? 'PAY_AT_PROPERTY' : paymentChannel,
      });
      setConfirmedBooking(res.data);
      setAvailabilityResult(null);
    } catch (err) {
      alert(`Booking failed: ${err.message || 'Please try another unit or date.'}`);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleSelectRoomTypeForBooking = (rt) => {
    if (rt.units && rt.units.length > 0) {
      const avail = rt.units.find((u) => u.status === 'AVAILABLE') || rt.units[0];
      setSelectedUnitId(String(avail.id));
    } else if (rt.unitIds && rt.unitIds.length > 0) {
      setSelectedUnitId(String(rt.unitIds[0]));
    }
    setAvailabilityResult(null);
    const el = document.getElementById('property-booking-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenRoomSpecs = (rt) => {
    setSelectedRoomType(rt);
    setModalInitialTab('gallery');
    setDetailModalOpen(true);
  };

  const scrollToSection = (e, sectionId) => {
    if (e) e.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const selectedUnitObj = units.find((u) => String(u.id) === String(selectedUnitId));

  return (
    <div className="bfa-property-detail-page">
      {/* 1. Dynamic Top Display Navigation Bar (Static with ZERO background, shared across public platform) */}
      <PublicTopNav
        activePage="properties"
        isScrolled={isScrolled}
        searchVisible={true}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={() => navigate(`/?search=${encodeURIComponent(searchQuery)}#feed-root`)}
        onBrandClick={() => navigate('/')}
        onVerifyClick={() => {
          setVerificationError('');
          setVerificationResult(null);
          setVerifyModalOpen(true);
        }}
        searchContainerRef={searchContainerRef}
      />

      {/* Main Content Area */}
      <main className="bfa-property-main-content">
        {loading ? (
          <div className="bfa-property-loading-container">
            <div className="bfa-property-spinner" />
            <h3 style={{ margin: '1rem 0 0.5rem', color: '#ffffff' }}>Loading Building Enclave...</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              Retrieving real-time room types, architectural gallery, and availability across Akure.
            </p>
          </div>
        ) : error || !property ? (
          <div className="bfa-property-error-container">
            <Icons8Icon name="info" variant="blue" size={42} />
            <h3 style={{ color: '#ffffff', margin: '1rem 0 0.5rem' }}>Building Enclave Unavailable</h3>
            <p style={{ color: '#cbd5e1', maxWidth: '500px', margin: '0 auto 1.5rem' }}>
              {error || 'The requested property could not be found or is currently not active for public bookings.'}
            </p>
            <Link to="/" className="bfa-return-home-btn">
              ← Return to BFA Home Portfolio
            </Link>
          </div>
        ) : (
          <>
            {/* 2. Building Hero Showcase Header */}
            <section
              className="bfa-property-hero-banner"
              style={{ backgroundImage: `url(${heroPhoto})` }}
            >
              <div className="bfa-property-hero-overlay" />
              
              <div className="bfa-property-hero-content">
                {/* Breadcrumbs */}
                <nav className="bfa-property-breadcrumbs" aria-label="Breadcrumb">
                  <Link to="/">BFA Residences</Link>
                  <span className="bfa-breadcrumb-sep">/</span>
                  <Link to="/#properties">Properties</Link>
                  <span className="bfa-breadcrumb-sep">/</span>
                  <span className="bfa-breadcrumb-current">{property.name}</span>
                </nav>

                <div className="bfa-property-hero-badges-row">
                  <span className="bfa-hero-badge code">✦ {property.code || 'BFA'}</span>
                  <span className="bfa-hero-badge status">✓ Active Executive Residence</span>
                  <span className="bfa-hero-badge location">
                    <Icons8Icon name="location" variant="white" size={13} /> {property.city}, {property.state}
                  </span>
                </div>

                <h1 className="bfa-property-hero-title">{property.name}</h1>
                <p className="bfa-property-hero-address">
                  <Icons8Icon name="location" variant="blue" size={16} /> {property.address}, {property.city}, {property.state}
                </p>

                <p className="bfa-property-hero-desc">
                  {property.description}
                </p>

                {/* Property Quick Metrics */}
                <div className="bfa-property-quick-metrics">
                  <div className="bfa-metric-box">
                    <span className="bfa-metric-box-val">
                      {formatNaira(
                        roomTypes.length > 0
                          ? Math.min(...roomTypes.map((r) => r.startingRate))
                          : '160000'
                      )}
                    </span>
                    <span className="bfa-metric-box-lbl">Starting Rate / Night</span>
                  </div>
                  <div className="bfa-metric-box">
                    <span className="bfa-metric-box-val">{roomTypes.length} Categories</span>
                    <span className="bfa-metric-box-lbl">Configured Room Types</span>
                  </div>
                  <div className="bfa-metric-box">
                    <span className="bfa-metric-box-val">
                      {units.filter((u) => u.status === 'AVAILABLE').length} of {units.length}
                    </span>
                    <span className="bfa-metric-box-lbl">Suites Available Now</span>
                  </div>
                  <div className="bfa-metric-box">
                    <span className="bfa-metric-box-val">100% 24/7</span>
                    <span className="bfa-metric-box-lbl">Dual-Grid Solar Hybrid Power</span>
                  </div>
                </div>

                {/* Hero CTAs */}
                <div className="bfa-property-hero-actions">
                  <button
                    type="button"
                    className="bfa-hero-primary-btn"
                    onClick={(e) => scrollToSection(e, 'room-types-section')}
                  >
                    <span>Explore Room Types ({roomTypes.length})</span>
                    <Icons8Icon name="chevron-down" variant="white" size={14} />
                  </button>
                  <button
                    type="button"
                    className="bfa-hero-secondary-btn"
                    onClick={(e) => scrollToSection(e, 'gallery-section')}
                  >
                    <Icons8Icon name="gallery" variant="white" size={16} />
                    <span>View Photo Gallery</span>
                  </button>
                  <button
                    type="button"
                    className="bfa-hero-secondary-btn"
                    onClick={(e) => scrollToSection(e, 'property-booking-section')}
                  >
                    <Icons8Icon name="calendar" variant="white" size={16} />
                    <span>Check Availability</span>
                  </button>
                </div>
              </div>
            </section>

            {/* 3. Sticky Building Switcher Bar (Seamlessly hop between buildings) */}
            <div className="bfa-building-switcher-bar">
              <div className="bfa-switcher-label">
                <span>Switch Building:</span>
              </div>
              <div className="bfa-switcher-pills">
                {allProperties.map((p) => {
                  const isActive = String(p.id) === String(property.id);
                  return (
                    <Link
                      key={p.id}
                      to={`/property/${p.id}`}
                      className={`bfa-switcher-pill ${isActive ? 'active' : ''}`}
                    >
                      <Icons8Icon
                        name="building"
                        variant={isActive ? 'blue' : 'white'}
                        size={14}
                      />
                      <span>{p.name}</span>
                      <small>({p.city})</small>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* 4. Building Details Card: Standards, Amenities & House Rules */}
            <section className="bfa-property-section-wrap">
              <div className="bfa-property-card-container">
                <div className="bfa-section-header-compact">
                  <div>
                    <span className="bfa-section-tag">Building Facilities & Standards</span>
                    <h2 className="bfa-section-title">Enclave Amenities & Privileges</h2>
                  </div>
                  <div className="bfa-house-rules-pill">
                    <span>🕒 Check-In: <strong>{property.check_in_time || '14:00'}</strong></span>
                    <span>🕚 Check-Out: <strong>{property.check_out_time || '11:00'}</strong></span>
                  </div>
                </div>

                <div className="bfa-amenities-grid-columns">
                  {(Array.isArray(property.amenities) && property.amenities.length > 0
                    ? property.amenities
                    : [
                        '24/7 Solar-Hybrid Power',
                        'Dedicated Wi-Fi 6 Fiber',
                        'Infinity Swimming Pool',
                        'Subterranean Guarded Parking',
                        'Biometric Access Control',
                        'Executive Concierge Desk',
                      ]
                  ).map((amn, idx) => (
                    <div key={idx} className="bfa-amenity-feature-card">
                      <div className="bfa-amenity-feature-icon">
                        <Icons8Icon name="shield-check" variant="blue" size={18} />
                      </div>
                      <div>
                        <strong>{amn}</strong>
                        <span>Complimentary resident facility with 24/7 dedicated operational uptime.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 5. Architectural Photo Gallery (Outdoor & Indoor High-Res Visuals) */}
            <section className="bfa-property-section-wrap" id="gallery-section">
              <div className="bfa-property-card-container">
                <div className="bfa-section-header-compact">
                  <div>
                    <span className="bfa-section-tag">High-Resolution Photography</span>
                    <h2 className="bfa-section-title">Explore Grounds, Lounges & Suites</h2>
                    <p className="bfa-section-sub">
                      Inspect the exterior grounds, resident swimming pool, private terraces, living salons, and master suites.
                    </p>
                  </div>
                  <div className="bfa-representative-disclaimer-banner" role="note">
                    <Icons8Icon name="info" variant="blue" size={14} />
                    <span>Representative photography of genuine BFA enclaves</span>
                  </div>
                </div>

                {/* Category Filter Tabs */}
                <div className="bfa-gallery-filter-tabs">
                  <button
                    type="button"
                    className={`bfa-gallery-tab ${galleryCategory === 'all' ? 'active' : ''}`}
                    onClick={() => setGalleryCategory('all')}
                  >
                    All Photographs ({galleryItems.length})
                  </button>
                  <button
                    type="button"
                    className={`bfa-gallery-tab ${galleryCategory === 'outdoor' ? 'active' : ''}`}
                    onClick={() => setGalleryCategory('outdoor')}
                  >
                    Outdoor Architecture & Grounds
                  </button>
                  <button
                    type="button"
                    className={`bfa-gallery-tab ${galleryCategory === 'indoor' ? 'active' : ''}`}
                    onClick={() => setGalleryCategory('indoor')}
                  >
                    Indoor Lounges & Bedrooms
                  </button>
                </div>

                {/* Responsive Gallery Grid */}
                <div className="bfa-gallery-grid-responsive">
                  {filteredGallery.map((item, idx) => (
                    <div
                      key={item.id}
                      className="bfa-gallery-card-item"
                      onClick={() => setLightboxIndex(idx)}
                      title={`Click to expand high-resolution view of ${item.title}`}
                    >
                      <div
                        className="bfa-gallery-card-img"
                        style={{ backgroundImage: `url(${item.image})` }}
                      >
                        <span className="bfa-gallery-badge">{item.badge}</span>
                        <div className="bfa-gallery-zoom-pill">
                          <Icons8Icon name="view-eye" variant="white" size={13} /> Inspect
                        </div>
                      </div>
                      <div className="bfa-gallery-card-meta">
                        <h4>{item.title}</h4>
                        <p>{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 6. Room-Types Discovery Section (Heart of the Experience) */}
            <section className="bfa-property-section-wrap" id="room-types-section">
              <div className="bfa-property-card-container">
                <div className="bfa-section-header-compact">
                  <div>
                    <span className="bfa-section-tag">Configured Accommodation Categories</span>
                    <h2 className="bfa-section-title">Explore Available Room Types</h2>
                    <p className="bfa-section-sub">
                      Every room type is engineered for acoustic quiet, continuous power, and executive luxury. Choose your category below to view floor plans, amenities, and book directly.
                    </p>
                  </div>
                </div>

                {roomTypes.length === 0 ? (
                  <div className="bfa-empty-roomtypes-state">
                    <Icons8Icon name="door" variant="blue" size={36} />
                    <h3>No Room Types Configured</h3>
                    <p>There are currently no active room types listed for this building enclave.</p>
                  </div>
                ) : (
                  <div className="bfa-room-types-catalog-grid">
                    {roomTypes.map((rt, idx) => {
                      const photo = getRoomTypePhoto(rt.unitType, property.id);
                      const isAvailable = rt.availableUnits > 0;

                      return (
                        <div key={idx} className="bfa-room-type-feature-card">
                          <div
                            className="bfa-room-type-cover"
                            style={{ backgroundImage: `url(${photo})` }}
                          >
                            <div className="bfa-room-cover-overlay" />
                            <div
                              className={`bfa-room-avail-tag ${isAvailable ? 'available' : 'booked'}`}
                            >
                              {isAvailable
                                ? `✓ ${rt.availableUnits} of ${rt.totalUnits} Units Available`
                                : 'Fully Reserved'}
                            </div>
                            <div className="bfa-photo-disclaimer-tag">Representative image</div>
                          </div>

                          <div className="bfa-room-type-content">
                            <div className="bfa-room-type-header-row">
                              <div>
                                <h3 className="bfa-room-card-title">{rt.unitType}</h3>
                                <div className="bfa-room-spec-chips">
                                  <span>👥 {rt.capacity || 2} Guests</span>
                                  <span>🛏️ {rt.bedroomCount || 1} Bed</span>
                                  <span>🛁 {rt.bathroomCount || 1} Bath</span>
                                </div>
                              </div>
                              <div className="bfa-room-price-stack">
                                <span className="bfa-room-price-val">
                                  {formatNaira(rt.startingRate)}
                                </span>
                                <span className="bfa-room-price-unit">/ night</span>
                              </div>
                            </div>

                            <p className="bfa-room-card-description">
                              Engineered for executive privacy and restful sleep, finished with soundproof acoustic double-glazing, plush Egyptian cotton linens, and smart climate control.
                            </p>

                            {/* Amenity Pills */}
                            <div className="bfa-room-amenities-list">
                              {(Array.isArray(rt.amenities) && rt.amenities.length > 0
                                ? rt.amenities.slice(0, 4)
                                : ['Fiber Wi-Fi 6', '24/7 Power', 'Inverter AC', 'Smart 4K TV']
                              ).map((amn, aIdx) => (
                                <span key={aIdx} className="bfa-room-amenity-badge">
                                  ✓ {amn}
                                </span>
                              ))}
                            </div>

                            {/* Actions */}
                            <div className="bfa-room-card-actions">
                              <button
                                type="button"
                                className="bfa-room-specs-btn"
                                onClick={() => handleOpenRoomSpecs(rt)}
                                title="View full photo gallery, bedroom, bathroom, and specifications"
                              >
                                <Icons8Icon name="view-eye" variant="blue" size={15} />
                                <span>View Room Details & Specs</span>
                              </button>

                              <button
                                type="button"
                                className="bfa-room-book-cta"
                                onClick={() => handleSelectRoomTypeForBooking(rt)}
                                title="Select this category and proceed to booking"
                              >
                                <span>Book This Room Type</span>
                                <Icons8Icon name="chevron-right" variant="white" size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* 7. Integrated Online Reservation Engine */}
            <section className="bfa-property-section-wrap" id="property-booking-section">
              <div className="bfa-property-card-container">
                <div className="bfa-section-header-compact">
                  <div>
                    <span className="bfa-section-tag">Direct Instant Reservation</span>
                    <h2 className="bfa-section-title">Check Availability & Secure Your Stay</h2>
                    <p className="bfa-section-sub">
                      Reserve your suite at {property.name} with instant cryptographic reservation authentication. 1-night maximum stay per reservation applies.
                    </p>
                  </div>
                </div>

                {confirmedBooking ? (
                  <div className="bfa-booking-confirmed-card animate-scale-up">
                    <div className="bfa-confirm-icon-badge">✓</div>
                    <h3 className="bfa-confirm-heading">Reservation Confirmed!</h3>
                    <p className="bfa-confirm-sub">
                      Thank you, <strong>{confirmedBooking.guest_name}</strong>. Your stay at{' '}
                      <strong>{property.name}</strong> has been secured on the authoritative ledger.
                    </p>

                    <div className="bfa-confirm-details-box">
                      <div className="bfa-confirm-field">
                        <span>Reference Code:</span>
                        <strong>{confirmedBooking.reference_code || confirmedBooking.reference}</strong>
                      </div>
                      <div className="bfa-confirm-field">
                        <span>Suite:</span>
                        <strong>Unit {selectedUnitObj?.unit_number || selectedUnitId}</strong>
                      </div>
                      <div className="bfa-confirm-field">
                        <span>Check-In Date:</span>
                        <strong>{checkInDate} (From 14:00)</strong>
                      </div>
                      <div className="bfa-confirm-field">
                        <span>Rate:</span>
                        <strong>
                          {formatNaira(
                            confirmedBooking.total_amount || selectedUnitObj?.rate_per_night || '0'
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="bfa-confirm-actions">
                      <a
                        href={`https://wa.me/2348000000000?text=Hello%20BFA%20Concierge%2C%20I%20have%20confirmed%20reservation%20${encodeURIComponent(
                          confirmedBooking.reference_code || confirmedBooking.reference || ''
                        )}%20at%20${encodeURIComponent(property.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bfa-wa-confirm-btn"
                      >
                        💬 Receive Confirmation on WhatsApp
                      </a>
                      <button
                        type="button"
                        className="bfa-new-booking-btn"
                        onClick={() => {
                          setConfirmedBooking(null);
                          setAvailabilityResult(null);
                        }}
                      >
                        Book Another Suite
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleCheckAvailability} className="bfa-booking-flow-form">
                    <div className="bfa-booking-fields-grid">
                      {/* Check-In Date */}
                      <div className="bfa-form-input-group">
                        <label>
                          <Icons8Icon name="calendar" variant="blue" size={14} /> Check-In Date (1 Night Stay)
                        </label>
                        <input
                          type="date"
                          value={checkInDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            setCheckInDate(e.target.value);
                            setAvailabilityResult(null);
                          }}
                          required
                        />
                      </div>

                      {/* Suite Selection */}
                      <div className="bfa-form-input-group">
                        <label>
                          <Icons8Icon name="door" variant="blue" size={14} /> Select Suite or Category
                        </label>
                        <select
                          value={selectedUnitId}
                          onChange={(e) => {
                            setSelectedUnitId(e.target.value);
                            setAvailabilityResult(null);
                          }}
                          required
                        >
                          <option value="">-- Choose a Suite --</option>
                          {units.map((u) => (
                            <option key={u.id} value={u.id}>
                              Unit {u.unit_number} — {u.unit_name} ({u.unit_type}) • {formatNaira(u.rate_per_night)}/nt
                              {u.status !== 'AVAILABLE' ? ` [${u.status}]` : ' [Available]'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ margin: '1.25rem 0' }}>
                      <button
                        type="submit"
                        className="bfa-check-avail-action-btn"
                        disabled={checkingAvailability}
                      >
                        {checkingAvailability ? 'Verifying Inventory...' : 'Check Availability →'}
                      </button>
                    </div>

                    {availabilityError && (
                      <div className="bfa-avail-banner error">
                        <span>⚠️ {availabilityError}</span>
                      </div>
                    )}

                    {availabilityResult && (
                      <div className="bfa-avail-banner success animate-scale-up">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <strong>✓ Unit {selectedUnitObj?.unit_number} is Available for {checkInDate}!</strong>
                            <div style={{ fontSize: '0.82rem', opacity: 0.9 }}>
                              Rate: {formatNaira(availabilityResult.rate_per_night || selectedUnitObj?.rate_per_night)} / night
                            </div>
                          </div>
                          <span className="bfa-verified-status-tag">Cryptographically Verified</span>
                        </div>
                      </div>
                    )}

                    {/* Guest Information (Unlocks when availability is confirmed) */}
                    {availabilityResult && (
                      <div className="bfa-guest-details-section animate-scale-up">
                        <h4 className="bfa-guest-step-title">Guest Details & Direct Confirmation</h4>

                        <div className="bfa-guest-inputs-grid">
                          <div className="bfa-form-input-group">
                            <label>Full Guest Name *</label>
                            <input
                              type="text"
                              placeholder="e.g. Dr. Folake Alabi"
                              value={guestName}
                              onChange={(e) => setGuestName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="bfa-form-input-group">
                            <label>Email Address *</label>
                            <input
                              type="email"
                              placeholder="e.g. folake@example.com"
                              value={guestEmail}
                              onChange={(e) => setGuestEmail(e.target.value)}
                              required
                            />
                          </div>
                          <div className="bfa-form-input-group">
                            <label>Phone / WhatsApp *</label>
                            <input
                              type="tel"
                              placeholder="e.g. +234 803 123 4567"
                              value={guestPhone}
                              onChange={(e) => setGuestPhone(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        {/* Payment Selection */}
                        <div className="bfa-payment-selection-row">
                          <label className="bfa-payment-option-pill">
                            <input
                              type="radio"
                              name="paymentOption"
                              value="PAY_AT_PROPERTY"
                              checked={paymentOption === 'PAY_AT_PROPERTY'}
                              onChange={() => setPaymentOption('PAY_AT_PROPERTY')}
                            />
                            <span>Pay at Property (Front Desk Settlement)</span>
                          </label>

                          <label className="bfa-payment-option-pill">
                            <input
                              type="radio"
                              name="paymentOption"
                              value="PREPAY"
                              checked={paymentOption === 'PREPAY'}
                              onChange={() => setPaymentOption('PREPAY')}
                            />
                            <span>Instant Digital Prepayment (Card / Transfer)</span>
                          </label>
                        </div>

                        <button
                          type="button"
                          className="bfa-submit-reservation-btn"
                          onClick={handleCreateBooking}
                          disabled={bookingLoading}
                        >
                          {bookingLoading
                            ? 'Creating Cryptographic Reservation...'
                            : `Complete Reservation • ${formatNaira(
                                availabilityResult.rate_per_night || selectedUnitObj?.rate_per_night
                              )}`}
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* 8. Full-Screen Interactive Lightbox for High-Res Photos */}
      {lightboxIndex !== null && filteredGallery[lightboxIndex] && (
        <div
          className="bfa-lightbox-backdrop"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bfa-lightbox-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="bfa-lightbox-close"
              onClick={() => setLightboxIndex(null)}
              aria-label="Close photo view"
            >
              ✕
            </button>

            <button
              type="button"
              className="bfa-lightbox-arrow left"
              onClick={() =>
                setLightboxIndex(
                  (lightboxIndex - 1 + filteredGallery.length) % filteredGallery.length
                )
              }
              aria-label="Previous photograph"
            >
              ‹
            </button>

            <img
              src={filteredGallery[lightboxIndex].image}
              alt={filteredGallery[lightboxIndex].title}
              className="bfa-lightbox-img"
            />

            <button
              type="button"
              className="bfa-lightbox-arrow right"
              onClick={() =>
                setLightboxIndex((lightboxIndex + 1) % filteredGallery.length)
              }
              aria-label="Next photograph"
            >
              ›
            </button>

            <div className="bfa-lightbox-caption">
              <span className="bfa-lightbox-badge">
                {filteredGallery[lightboxIndex].badge}
              </span>
              <h3>{filteredGallery[lightboxIndex].title}</h3>
              <p>{filteredGallery[lightboxIndex].desc}</p>
              <div className="bfa-lightbox-counter">
                Photo {lightboxIndex + 1} of {filteredGallery.length}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. Interactive Room Detail & Specs Modal */}
      <ApartmentDetailModal
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedRoomType(null);
        }}
        apartmentId={property?.id || 1}
        propertyData={property}
        roomTypeData={selectedRoomType}
        initialTab={modalInitialTab}
        onSelectUnitAndBook={(propId, unitId) => {
          setSelectedUnitId(String(unitId));
          setDetailModalOpen(false);
          scrollToSection(null, 'property-booking-section');
        }}
      />

      {/* 10. Static Floating Contact Desk Widget */}
      <FloatingChatWidget />
    </div>
  );
}
