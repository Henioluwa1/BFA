import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { publicService } from '../../services/api';
import { formatNaira } from '../../utils/currency';
import PublicTopNav from '../../components/public/PublicTopNav';
import PublicFooter from '../../components/public/home/PublicFooter';
import ApartmentDetailModal, {
  getPropertyPhoto,
  getRoomTypePhoto,
  getRoomTypeGallery,
  APARTMENTS_CATALOG,
} from '../../components/public/ApartmentDetailModal';
import FloatingChatWidget from '../../components/public/FloatingChatWidget';
import Icons8Icon from '../../components/public/Icons8Icon';
import BookingTrackingModal from '../../components/public/BookingTrackingModal';
import BookingModal from '../../components/public/BookingModal';
import { isApartmentCategory, getApartmentInternalSpaces, UnitShowcaseCard, ApartmentFullScreenModal } from '../../components/public/PropertyPortfolioShowcase';
import {
  Bed,
  Layers,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Users,
  Bath,
  Wifi,
  Tv,
  Wind,
  ShieldCheck,
  Coffee,
  MapPin,
  Building2,
  Calendar,
  Eye,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react';
import '../../components/public/PropertyPortfolioShowcase.css';
import '../../styles/propertyDetail.css';

function getApartmentHierarchyMeta(unitType = '') {
  const t = (unitType || '').toLowerCase();
  if (t.includes('penthouse') || t.includes('presidential')) {
    return {
      typeCategory: '👑 Presidential Penthouse Apartment',
      partLabel: '🛋️ Grand Reception Salon',
      parts: ['🛋️ Palatial Salon', '🛏️ Emperor Suite', '🍳 Chef Kitchen', '🛁 Spa Bath', '🌄 Sky Terrace'],
    };
  }
  if (t.includes('2-bedroom') || t.includes('3-bedroom') || t.includes('waterfront') || t.includes('luxury') || t.includes('executive')) {
    return {
      typeCategory: '🏢 Multi-Room Serviced Apartment',
      partLabel: '🛋️ Living Salon & Dining Area',
      parts: ['🛋️ Living Salon', '🛏️ 2 Master Bedrooms', '🍳 Fitted Quartz Kitchen', '🛁 2 Luxury Baths', '🌿 Private Verandah'],
    };
  }
  if (t.includes('deluxe') || t.includes('1-bedroom')) {
    return {
      typeCategory: '🛋️ 1-Bedroom Executive Suite',
      partLabel: '🛏️ Master King Bedroom Suite',
      parts: ['🛋️ Living Area', '🛏️ King Bed', '🍳 Kitchenette', '🛁 Spa Rain Shower', '💼 Workstation'],
    };
  }
  return {
    typeCategory: '🔑 Serviced Studio Suite',
    partLabel: '🛋️ Integrated Studio Living',
    parts: ['🛋️ Studio Living', '🛏️ Queen/King Bed', '🍳 Kitchenette', '🛁 Rain Shower', '💼 High-Speed Wi-Fi'],
  };
}

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
  const [quoteData, setQuoteData] = useState(null);
  const [availabilityError, setAvailabilityError] = useState('');

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [paymentOption, setPaymentOption] = useState('BANK_TRANSFER');
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [proofBase64, setProofBase64] = useState('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState('');
  const [copiedAcctNum, setCopiedAcctNum] = useState(false);
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);
  const [trackerRef, setTrackerRef] = useState('');
  const [trackerEmail, setTrackerEmail] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [copiedAuthCode, setCopiedAuthCode] = useState(false);

  // Category selection (Rooms vs Apartments) and Universal Booking Modal
  const [categoryFilter, setCategoryFilter] = useState('rooms');
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingModalUnit, setBookingModalUnit] = useState(null);
  const [viewApartmentData, setViewApartmentData] = useState(null);
  const [activeSpaceByUnit, setActiveSpaceByUnit] = useState({});

  const handleSelectSpace = (unitId, space) => {
    setActiveSpaceByUnit((prev) => ({
      ...prev,
      [unitId]: space,
    }));
  };

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

  // Load payment configuration (Zenith Bank settlement details)
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
      .catch((err) => console.warn('Payment configuration load warning:', err));
  }, []);

  const handleProofChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setBookingError('Payment proof file exceeds 5MB limit. Please upload a smaller receipt image.');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setBookingError('Only JPG, PNG, and WebP receipts are accepted.');
      return;
    }
    setBookingError('');
    setProofFile(file);
    const reader = new FileReader();
    reader.onload = (uploadEvt) => {
      const dataUrl = uploadEvt.target.result;
      setProofBase64(dataUrl);
      setProofPreviewUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleCopyAccountNumber = () => {
    const acct = paymentConfig?.accountNumber || '1018273645';
    navigator.clipboard.writeText(acct);
    setCopiedAcctNum(true);
    setTimeout(() => setCopiedAcctNum(false), 3000);
  };

  // Catalog fallback data for galleries and extended specs
  const catalogData = property ? APARTMENTS_CATALOG[property.id] || APARTMENTS_CATALOG[1] : APARTMENTS_CATALOG[1];
  const galleryItems = catalogData?.gallery || [];

  const filteredGallery = galleryCategory === 'all'
    ? galleryItems
    : galleryItems.filter((item) => item.category === galleryCategory);

  const heroPhoto = property ? getPropertyPhoto(property.id, property.code) : '';

  // Calculate cheapest currently available rate
  const availableUnits = units.filter((u) => u.status === 'AVAILABLE');
  const cheapestAvailableRate = availableUnits.length > 0
    ? Math.min(...availableUnits.map((u) => parseFloat(u.rate_per_night)).filter((n) => !isNaN(n) && n > 0))
    : null;

  // Authoritative verified property amenities parser
  const getVerifiedPropertyAmenities = (amenities) => {
    if (!amenities) return [];
    if (Array.isArray(amenities)) {
      return amenities.filter((item) => typeof item === 'string' && item.trim().length > 0);
    }
    if (typeof amenities === 'string') {
      try {
        const parsed = JSON.parse(amenities);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
        }
      } catch {
        return amenities.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      }
    }
    return [];
  };
  const verifiedPropertyAmenities = property ? getVerifiedPropertyAmenities(property.amenities) : [];

  // Lightbox keyboard navigation & body scroll lock
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null ? (prev - 1 + filteredGallery.length) % filteredGallery.length : null));
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null ? (prev + 1) % filteredGallery.length : null));
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxIndex, filteredGallery.length]);

  // Handle availability check
  const handleCheckAvailability = async (e) => {
    if (e) e.preventDefault();
    if (!selectedUnitId) {
      setAvailabilityError('Please select a suite or room type to check availability.');
      return;
    }
    setCheckingAvailability(true);
    setAvailabilityError('');
    setBookingError('');
    setAvailabilityResult(null);
    setQuoteData(null);

    try {
      const res = await publicService.checkAvailability({
        apartmentId: parseInt(selectedUnitId, 10),
        checkInDate,
      });
      setAvailabilityResult(res.data);
      if (res.data?.isAvailable) {
        try {
          const qRes = await publicService.getQuote({
            apartmentId: parseInt(selectedUnitId, 10),
            checkInDate,
            propertyId: property?.id ? parseInt(property.id, 10) : undefined,
          });
          setQuoteData(qRes.data);
        } catch (quoteErr) {
          console.warn('Authoritative quote warning:', quoteErr);
        }
      }
    } catch (err) {
      setAvailabilityError(err.message || 'Error checking availability.');
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Handle direct reservation with manual bank transfer proof or pay at property
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    setBookingError('');
    if (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
      setBookingError('Please fill in your name, email, and phone number.');
      return;
    }

    if (paymentOption === 'BANK_TRANSFER' && !proofBase64) {
      setBookingError('Please upload your bank transfer payment receipt or debit confirmation slip before submitting.');
      return;
    }

    setBookingLoading(true);

    try {
      const res = await publicService.createBooking({
        apartmentId: parseInt(selectedUnitId, 10),
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestPhone: guestPhone.trim(),
        checkInDate,
        paymentOption,
        paymentMethod: paymentOption,
        quoteToken: quoteData?.quoteToken,
        proofBase64: proofBase64 || undefined,
        proofFileName: proofFile?.name || undefined,
      });

      const bData = res.data?.data || res.data;
      setConfirmedBooking(bData);
      setTrackerRef(bData?.reservationCode || '');
      setTrackerEmail(guestEmail.trim());
      setAvailabilityResult(null);
      setQuoteData(null);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error?.message || err.message;
      setBookingError(errMsg || 'Booking could not be submitted. Please try another unit or date.');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleOpenBookingModalForUnit = (unitObj) => {
    setBookingModalUnit(unitObj || units[0]);
    setBookingModalOpen(true);
  };

  const handleSelectRoomTypeForBooking = (rt) => {
    let unit = null;
    if (rt.units && rt.units.length > 0) {
      unit = rt.units.find((u) => u.status === 'AVAILABLE') || rt.units[0];
    } else if (rt.unitIds && rt.unitIds.length > 0) {
      unit = units.find((u) => u.id === rt.unitIds[0]);
    } else {
      unit = units.find((u) => u.unit_type === rt.unitType) || units[0];
    }
    handleOpenBookingModalForUnit(unit);
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

  const propBaseRate = quoteData?.breakdown?.baseRate ?? (availabilityResult?.rate_per_night || availabilityResult?.ratePerNight || selectedUnitObj?.rate_per_night || 0);
  const propCautionDeposit = quoteData?.breakdown?.cautionDeposit ?? 0;
  const propTotalAmount = quoteData?.breakdown?.totalAmount ?? (Number(propBaseRate) + Number(propCautionDeposit));

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
          setTrackerModalOpen(true);
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
                  <Link to="/">Home</Link>
                  <span className="bfa-breadcrumb-sep">/</span>
                  <Link to="/properties">Residences</Link>
                  <span className="bfa-breadcrumb-sep">/</span>
                  <span className="bfa-breadcrumb-current">{property.name}</span>
                </nav>

                <h1 className="bfa-property-hero-title">{property.name}</h1>
                <p className="bfa-property-hero-address">
                  <MapPin size={16} /> {property.address}, {property.city}, {property.state}
                </p>

                {/* Property Quick Metrics */}
                <div className="bfa-property-quick-metrics">
                  <div className="bfa-metric-box">
                    <span className="bfa-metric-box-val">
                      {formatNaira(
                        cheapestAvailableRate != null
                          ? cheapestAvailableRate
                          : property.starting_rate
                          ? parseFloat(property.starting_rate)
                          : roomTypes.length > 0
                          ? Math.min(...roomTypes.map((r) => r.startingRate))
                          : 160000
                      )}
                    </span>
                    <span className="bfa-metric-box-lbl">
                      {cheapestAvailableRate != null ? 'Available From / Night' : 'Starting Rate / Night'}
                    </span>
                  </div>
                  <div className="bfa-metric-box">
                    <span className="bfa-metric-box-val">{units.length} Units</span>
                    <span className="bfa-metric-box-lbl">Configured Residences</span>
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
                    <span>Explore Suites & Apartments ({units.length})</span>
                    <ChevronDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="bfa-hero-secondary-btn"
                    onClick={(e) => scrollToSection(e, 'gallery-section')}
                  >
                    <Eye size={16} />
                    <span>View Photo Gallery</span>
                  </button>
                  <button
                    type="button"
                    className="bfa-hero-secondary-btn"
                    onClick={() => {
                      const availUnit = units.find((u) => u.status === 'AVAILABLE') || units[0];
                      handleOpenBookingModalForUnit(availUnit);
                    }}
                  >
                    <Calendar size={16} />
                    <span>Book a Suite Directly</span>
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
                      <Building2 size={14} />
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
                  {verifiedPropertyAmenities.length > 0 ? (
                    verifiedPropertyAmenities.map((amn, idx) => (
                      <div key={idx} className="bfa-amenity-feature-card">
                        <div className="bfa-amenity-feature-icon">
                          <ShieldCheck size={18} />
                        </div>
                        <div>
                          <strong>{amn}</strong>
                          <span>Authoritative enclave facility with verified operational uptime.</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bfa-amenity-empty-notice">
                      <div className="bfa-amenity-notice-icon">
                        <Sparkles size={20} />
                      </div>
                      <div className="bfa-amenity-notice-text">
                        <h4>Suite-Specific Luxury Amenities</h4>
                        <p>
                          Shared property-level facilities are not separately listed for {property.name}. All verified luxury amenities—including 24/7 dual-grid solar power, dedicated fiber Wi-Fi 6, smart climate control, fully equipped kitchens, and en-suite spa baths—are provisioned directly inside each private suite below.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 5. Architectural Photo Gallery (Outdoor & Indoor High-Res Visuals) */}
            <section className="bfa-property-section-wrap" id="gallery-section">
              <div className="bfa-property-card-container">
                <div className="bfa-section-header-compact">
                  <div>
                    <h2 className="bfa-section-title">Explore Grounds, Lounges &amp; Suites</h2>
                  </div>
                  <div className="bfa-representative-disclaimer-banner" role="note">
                    <ShieldCheck size={14} />
                    <span>Architectural Concept Visualizations & Genuine Suite Photography</span>
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

            {/* 6. Suites & Apartments Showcase with Guided Internal Spaces Tour */}
            <section className="bfa-property-section-wrap" id="room-types-section">
              <div className="bfa-property-card-container">
                <div className="bfa-section-header-compact">
                  <div>
                    <span className="bfa-section-tag">Direct Bookable Residences</span>
                    <h2 className="bfa-section-title">Explore Available Suites & Apartments</h2>
                    <p className="bfa-section-sub">
                      Select your room or multi-room apartment below to inspect each internal space, review amenities, and book directly.
                    </p>
                  </div>
                </div>

                {/* Rooms vs Apartments Selection Toggle */}
                <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0 1.5rem' }}>
                  <div className="bfa-category-toggle-pills" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={categoryFilter === 'rooms'}
                      className={`bfa-category-pill-btn ${categoryFilter === 'rooms' ? 'active' : ''}`}
                      onClick={() => setCategoryFilter('rooms')}
                    >
                      <Bed size={16} />
                      <span>Single Rooms & Studios</span>
                      <span className="bfa-category-pill-count">
                        {units.filter((u) => !isApartmentCategory(u)).length}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={categoryFilter === 'apartments'}
                      className={`bfa-category-pill-btn ${categoryFilter === 'apartments' ? 'active' : ''}`}
                      onClick={() => setCategoryFilter('apartments')}
                    >
                      <Layers size={16} />
                      <span>Multi-Room Serviced Apartments</span>
                      <span className="bfa-category-pill-count">
                        {units.filter((u) => isApartmentCategory(u)).length}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Units Cards Grid */}
                {categoryFilter === 'rooms' ? (
                  <div>
                    {units.filter((u) => !isApartmentCategory(u)).length === 0 ? (
                      <div className="bfa-empty-roomtypes-state">
                        <Bed size={36} color="#64748b" style={{ margin: '0 auto 0.5rem' }} />
                        <h3 style={{ margin: '0.5rem 0', color: '#0f172a' }}>No Single Rooms Listed</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
                          This building exclusively features multi-room serviced apartments. Please switch to the Apartments tab above.
                        </p>
                      </div>
                    ) : (
                      <div className="bfa-units-cards-grid">
                        {units
                          .filter((u) => !isApartmentCategory(u))
                          .map((unit) => (
                            <UnitShowcaseCard
                              key={unit.id}
                              unit={unit}
                              building={property}
                              onOpenBookingModal={(u, b) => handleOpenBookingModalForUnit(u)}
                              onViewApartment={(u, b, photos, idx) => setViewApartmentData({ unit: u, building: b, photos, initialIdx: idx })}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {units.filter((u) => isApartmentCategory(u)).length === 0 ? (
                      <div className="bfa-empty-roomtypes-state">
                        <Layers size={36} color="#64748b" style={{ margin: '0 auto 0.5rem' }} />
                        <h3 style={{ margin: '0.5rem 0', color: '#0f172a' }}>No Multi-Room Apartments Listed</h3>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
                          All units in this building are single rooms or studio suites. Please switch to the Rooms tab above.
                        </p>
                      </div>
                    ) : (
                      <div className="bfa-units-cards-grid">
                        {units
                          .filter((u) => isApartmentCategory(u))
                          .map((unit) => (
                            <UnitShowcaseCard
                              key={unit.id}
                              unit={unit}
                              building={property}
                              onOpenBookingModal={(u, b) => handleOpenBookingModalForUnit(u)}
                              onViewApartment={(u, b, photos, idx) => setViewApartmentData({ unit: u, building: b, photos, initialIdx: idx })}
                            />
                          ))}
                      </div>
                    )}
                  </div>
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
          const unit = units.find((u) => String(u.id) === String(unitId)) || { id: unitId, property_id: propId };
          setDetailModalOpen(false);
          handleOpenBookingModalForUnit(unit);
        }}
      />

      {/* 9b. Universal Luxury Booking Modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        unit={bookingModalUnit || units[0]}
        property={property}
        initialCheckInDate={checkInDate}
        onBookingConfirmed={(confirmedData) => {
          setConfirmedBooking(confirmedData);
        }}
      />

      {/* 10. Guest Stay Tracker & Verification Modal */}
      <BookingTrackingModal
        isOpen={trackerModalOpen}
        onClose={() => setTrackerModalOpen(false)}
        initialReference={trackerRef}
        initialEmail={trackerEmail}
      />

      
      {/* Full-Screen Detailed Apartment & Room Modal */}
      <ApartmentFullScreenModal
        isOpen={Boolean(viewApartmentData)}
        onClose={() => setViewApartmentData(null)}
        data={viewApartmentData}
        onReserveNow={() => {
          const u = viewApartmentData?.unit;
          setViewApartmentData(null);
          if (u) handleOpenBookingModalForUnit(u);
        }}
      />

      {/* Unified Public Footer with System Settings & Reservation Tracking */}
      <PublicFooter onOpenTracking={() => setTrackerModalOpen(true)} />

      {/* 11. Static Floating Contact Desk Widget */}
      <FloatingChatWidget onOpenBooking={() => {
        const availUnit = units.find((u) => u.status === 'AVAILABLE') || units[0];
        handleOpenBookingModalForUnit(availUnit);
      }} />
    </div>
  );
}
