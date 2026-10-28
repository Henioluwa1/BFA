import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { publicService } from '../services/api';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { formatNaira } from '../utils/currency';

// Luxury Apartment Wallpapers for Rotating Background
import heroArchitecture from '../assets/hero-architecture.jpg';
import aptLivingLuxury from '../assets/apt-living-luxury.jpg';
import aptPenthouseView from '../assets/apt-penthouse-view.jpg';
import aptInteriorWarm from '../assets/apt-interior-warm.jpg';
import aptTerraceWater from '../assets/apt-terrace-water.jpg';

import FloatingChatWidget from '../components/public/FloatingChatWidget';
import BfaLuxuryLoader from '../components/public/BfaLuxuryLoader';
import ApartmentDetailModal, {
  getRoomTypePhoto,
  getPropertyPhoto,
  getRoomTypeGallery,
} from '../components/public/ApartmentDetailModal';
import PublicTopNav from '../components/public/PublicTopNav';
import Icons8Icon from '../components/public/Icons8Icon';
import '../styles/landing.css';

const APARTMENT_WALLPAPERS = [
  {
    id: 'architecture',
    title: 'Grand Horizon Tower',
    location: 'Alagbaka GRA, Akure, Ondo State',
    type: 'Serviced High-Rise',
    image: heroArchitecture,
  },
  {
    id: 'living',
    title: 'Azure Bay Residences',
    location: 'Ijapo Central Estate, Akure, Ondo State',
    type: 'Executive Waterfront Lounge',
    image: aptLivingLuxury,
  },
  {
    id: 'penthouse',
    title: 'The Royal Palms Suites',
    location: 'Oba-Ile Boulevard, Akure, Ondo State',
    type: 'Sunlit Premier Penthouse',
    image: aptPenthouseView,
  },
  {
    id: 'interior',
    title: 'Horizon Deluxe Suite 102',
    location: 'Alagbaka GRA, Akure, Ondo State',
    type: 'Modern Minimalist Suite',
    image: aptInteriorWarm,
  },
  {
    id: 'terrace',
    title: 'Azure Bay Waterfront Villa',
    location: 'Ijapo Central Estate, Akure, Ondo State',
    type: 'Terrace & Infinity Pool',
    image: aptTerraceWater,
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  const [loadingProps, setLoadingProps] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailPropertyId, setDetailPropertyId] = useState(1);
  const [selectedBuildingId, setSelectedBuildingId] = useState('1');
  const [buildingDetails, setBuildingDetails] = useState({});
  const [loadingBuildingDetails, setLoadingBuildingDetails] = useState(false);
  const [selectedRoomTypeForModal, setSelectedRoomTypeForModal] = useState(null);
  const [modalInitialTab, setModalInitialTab] = useState('gallery');

  const handleOpenApartmentDetails = (propertyId, roomType = null, initialTab = 'gallery') => {
    setDetailPropertyId(Number(propertyId) || 1);
    setSelectedRoomTypeForModal(roomType);
    setModalInitialTab(initialTab);
    setDetailModalOpen(true);
  };

  // Keep selectedBuildingId aligned with available properties
  useEffect(() => {
    if (properties.length > 0 && !properties.some((p) => String(p.id) === String(selectedBuildingId))) {
      setSelectedBuildingId(String(properties[0].id));
    }
  }, [properties, selectedBuildingId]);

  // Fetch detailed building information & room types when selected building changes
  useEffect(() => {
    if (!selectedBuildingId) return;
    if (buildingDetails[selectedBuildingId]) return;

    let isMounted = true;
    async function fetchBuildingDetail() {
      setLoadingBuildingDetails(true);
      try {
        const res = await publicService.getPropertyById(selectedBuildingId);
        if (isMounted && res.data) {
          setBuildingDetails((prev) => ({
            ...prev,
            [selectedBuildingId]: res.data,
          }));
        }
      } catch (err) {
        console.error('Failed to load building detail:', err);
      } finally {
        if (isMounted) setLoadingBuildingDetails(false);
      }
    }
    fetchBuildingDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedBuildingId, buildingDetails]);

  const activeBuilding = properties.find((p) => String(p.id) === String(selectedBuildingId)) || properties[0] || null;
  const activeBuildingDetail = activeBuilding ? buildingDetails[activeBuilding.id] : null;

  const activeRoomTypes = activeBuildingDetail?.roomTypes || (() => {
    if (!activeBuilding) return [];
    const bApts = apartments.filter((a) => String(a.property_id) === String(activeBuilding.id));
    const rtMap = new Map();
    for (const apt of bApts) {
      const typeKey = apt.unit_type || 'Standard Suite';
      if (!rtMap.has(typeKey)) {
        rtMap.set(typeKey, {
          unitType: typeKey,
          startingRate: parseFloat(apt.rate_per_night) || 0,
          capacity: apt.capacity || 2,
          bedroomCount: apt.bedroom_count || 1,
          bathroomCount: apt.bathroom_count || 1,
          amenities: Array.isArray(apt.amenities) && apt.amenities.length > 0 ? apt.amenities : (activeBuilding.amenities || []),
          totalUnits: 0,
          availableUnits: 0,
          unitIds: [],
          units: [],
        });
      }
      const rt = rtMap.get(typeKey);
      rt.totalUnits += 1;
      if (apt.status === 'AVAILABLE') rt.availableUnits += 1;
      rt.unitIds.push(apt.id);
      rt.units.push(apt);
    }
    return Array.from(rtMap.values());
  })();

  const handleSelectBuilding = (buildingId) => {
    setSelectedBuildingId(String(buildingId));
    setSelectedPropertyId(String(buildingId));
    setSelectedApartmentId('');
    setAvailabilityResult(null);
    scrollToSection(null, 'explore-building');
  };

  const handleBookRoomType = (roomType, buildingId) => {
    const targetUnit = roomType.units?.find((u) => u.status === 'AVAILABLE') || roomType.units?.[0];
    const unitId = targetUnit ? String(targetUnit.id) : (roomType.unitIds?.[0] ? String(roomType.unitIds[0]) : '');

    setSelectedPropertyId(String(buildingId));
    if (unitId) setSelectedApartmentId(unitId);
    setActiveTab('booking');
    setAvailabilityResult(null);
    scrollToSection(null, 'booking');

    if (unitId && checkInDate) {
      setCheckingAvailability(true);
      publicService
        .checkAvailability({
          apartmentId: parseInt(unitId, 10),
          checkInDate,
        })
        .then((res) => {
          setAvailabilityResult(res.data);
        })
        .catch((err) => {
          setAvailabilityError(err.message || 'Error checking availability.');
        })
        .finally(() => {
          setCheckingAvailability(false);
        });
    }
  };

  // Rotating Multi-Image Background State (Changes from time to time)
  const [activeWallpaperIdx, setActiveWallpaperIdx] = useState(0);

  // Search State & Dynamic Display Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchContainerRef = useRef(null);
  const heroSearchContainerRef = useRef(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [singleNavOpen, setSingleNavOpen] = useState(false);
  const singleNavMenuRef = useRef(null);

  // Active Tab inside the lower white feed
  const [activeTab, setActiveTab] = useState('discover'); // 'discover' | 'properties' | 'booking' | 'amenities' | 'verify'

  // Booking Form State
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedApartmentId, setSelectedApartmentId] = useState('');
  const [checkInDate, setCheckInDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [availabilityError, setAvailabilityError] = useState('');

  // Payment Control State
  const [paymentOption, setPaymentOption] = useState('PAY_ONLINE'); // 'PAY_ONLINE' | 'PAY_AT_PROPERTY'
  const [paymentChannel, setPaymentChannel] = useState('CARD'); // 'CARD' | 'BANK_TRANSFER' | 'USSD'

  // Guest Details State
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [copiedAuthCode, setCopiedAuthCode] = useState(false);

  // Guest Verification / Lookup State
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

  // Background Auto-Rotation Timer (Changes smoothly every 9 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveWallpaperIdx((prev) => (prev + 1) % APARTMENT_WALLPAPERS.length);
    }, 9000);
    return () => clearInterval(timer);
  }, []);

  // Dynamic Top Display Scroll Detection (Edge dynamic display behavior)
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close search dropdown and single navigation menu on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      const clickedNavSearch = searchContainerRef.current && searchContainerRef.current.contains(event.target);
      const clickedHeroSearch = heroSearchContainerRef.current && heroSearchContainerRef.current.contains(event.target);
      if (!clickedNavSearch && !clickedHeroSearch) {
        setSearchFocused(false);
      }
      if (singleNavMenuRef.current && !singleNavMenuRef.current.contains(event.target)) {
        setSingleNavOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [propsRes, aptsRes, annRes] = await Promise.all([
          publicService.getProperties(),
          publicService.getApartments(),
          publicService.getAnnouncements({ location: 'PUBLIC_LANDING' }).catch(() => ({ data: [] })),
        ]);
        setProperties(propsRes.data || []);
        setApartments(aptsRes.data || []);
        setAnnouncements(annRes.data || []);
        if (propsRes.data?.length > 0) {
          setSelectedPropertyId(String(propsRes.data[0].id));
        }
      } catch (err) {
        console.error('Failed to load public data:', err);
      } finally {
        setLoadingProps(false);
      }
    }
    loadData();
  }, []);

  // Filter apartments by selected property
  const filteredApartments = apartments.filter(
    (a) => !selectedPropertyId || String(a.property_id) === String(selectedPropertyId)
  );

  useEffect(() => {
    if (filteredApartments.length > 0 && !selectedApartmentId) {
      setSelectedApartmentId(String(filteredApartments[0].id));
    }
  }, [filteredApartments, selectedApartmentId]);

  // Live search filtering across properties and units
  const searchResults = searchQuery.trim()
    ? apartments.filter((apt) => {
        const query = searchQuery.toLowerCase();
        return (
          apt.unit_name?.toLowerCase().includes(query) ||
          apt.unit_number?.toLowerCase().includes(query) ||
          apt.property_name?.toLowerCase().includes(query) ||
          apt.city?.toLowerCase().includes(query) ||
          apt.unit_type?.toLowerCase().includes(query)
        );
      })
    : [];

  const scrollToSection = (e, sectionId) => {
    if (e) e.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectPropertyAndBook = (propertyId) => {
    setSelectedPropertyId(String(propertyId));
    setSelectedApartmentId('');
    setAvailabilityResult(null);
    setActiveTab('booking');
    const el = document.getElementById('booking');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectUnitAndBook = (propertyId, apartmentId) => {
    setSelectedPropertyId(String(propertyId));
    setSelectedApartmentId(String(apartmentId));
    setAvailabilityResult(null);
    setSearchQuery('');
    setSearchFocused(false);
    setActiveTab('booking');
    const el = document.getElementById('booking');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleNextWallpaper = (e) => {
    if (e) e.stopPropagation();
    setActiveWallpaperIdx((prev) => (prev + 1) % APARTMENT_WALLPAPERS.length);
  };

  const handlePrevWallpaper = (e) => {
    if (e) e.stopPropagation();
    setActiveWallpaperIdx((prev) => (prev - 1 + APARTMENT_WALLPAPERS.length) % APARTMENT_WALLPAPERS.length);
  };

  const handleCheckAvailability = async (e) => {
    if (e) e.preventDefault();
    if (!selectedApartmentId) {
      setAvailabilityError('Please select an apartment unit.');
      return;
    }
    setCheckingAvailability(true);
    setAvailabilityError('');
    setAvailabilityResult(null);

    try {
      const res = await publicService.checkAvailability({
        apartmentId: parseInt(selectedApartmentId, 10),
        checkInDate,
      });
      setAvailabilityResult(res.data);
    } catch (err) {
      setAvailabilityError(err.message || 'Error checking availability.');
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!guestName || !guestEmail || !guestPhone) {
      alert('Please fill in your name, email, and phone number.');
      return;
    }
    setBookingLoading(true);

    try {
      const res = await publicService.createBooking({
        apartmentId: parseInt(selectedApartmentId, 10),
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

  const handleLookupVerification = async (e) => {
    e.preventDefault();
    if (!verifyQuery.trim()) {
      setVerificationError('Please enter a booking reference or cryptographic authentication code.');
      return;
    }
    setVerifyLoading(true);
    setVerificationError('');
    setVerificationResult(null);

    try {
      const res = await publicService.verifyBooking({
        query: verifyQuery.trim(),
        contact: verifyContact.trim() || undefined,
      });
      setVerificationResult(res.data);
    } catch (err) {
      setVerificationError(err.message || 'No matching confirmed reservation was found.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const currentWallpaper = APARTMENT_WALLPAPERS[activeWallpaperIdx];

    return (
    <div className="bfa-edge-page">
      {/* 5-Second Luxury BFA Loader */}
      {initialLoading && (
        <BfaLuxuryLoader onComplete={() => setInitialLoading(false)} />
      )}

      {/* 1. Multi-Image Changing Stationary Fixed Background */}
      <div className="bfa-fixed-backdrop-container" aria-hidden="true">
        {APARTMENT_WALLPAPERS.map((wp, idx) => (
          <div
            key={wp.id}
            className={`bfa-fixed-slide ${idx === activeWallpaperIdx ? 'active' : ''}`}
            style={{ backgroundImage: `url(${wp.image})` }}
          />
        ))}
      </div>
      <div className="bfa-fixed-overlay" aria-hidden="true" />

      {/* 2. Dynamic Top Display Navigation Bar (Static with NO background, search transitions dynamically) */}
      <PublicTopNav
        activePage="home"
        isScrolled={isScrolled}
        searchVisible={isScrolled}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={() => scrollToSection(null, 'feed-root')}
        onNextWallpaper={handleNextWallpaper}
        onBrandClick={(e) => scrollToSection(e, 'hero')}
        onVerifyClick={() => {
          setVerificationError('');
          setVerificationResult(null);
          setVerifyModalOpen(true);
        }}
        searchContainerRef={searchContainerRef}
      >
        {/* Live Autocomplete Dropdown in Top Nav */}
        {searchFocused && isScrolled && (
          <div className="bfa-live-search-dropdown">
            {searchResults.length > 0 ? (
              searchResults.slice(0, 6).map((apt) => (
                <div
                  key={apt.id}
                  className="bfa-search-result-row"
                  onClick={() => handleSelectUnitAndBook(apt.property_id, apt.id)}
                >
                  <div className="bfa-result-info">
                    <strong>
                      Unit {apt.unit_number} — {apt.unit_name}
                    </strong>
                    <span>
                      {apt.property_name} • {apt.city} ({apt.unit_type})
                    </span>
                  </div>
                  <div className="bfa-result-rate">{formatNaira(apt.rate_per_night)}/nt</div>
                </div>
              ))
            ) : searchQuery.trim() ? (
              <div style={{ padding: '1rem', color: '#64748b', fontSize: '0.88rem', textAlign: 'center' }}>
                No suites match "{searchQuery}".
              </div>
            ) : (
              <div style={{ padding: '0.85rem 1rem' }}>
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '0.5rem',
                  }}
                >
                  Akure Premier Residences
                </div>
                {properties.map((p) => (
                  <div
                    key={p.id}
                    className="bfa-search-result-row"
                    style={{ padding: '0.5rem 0' }}
                    onClick={() => {
                      handleSelectPropertyAndBook(p.id);
                      setSearchFocused(false);
                    }}
                  >
                    <div className="bfa-result-info">
                      <strong>{p.name}</strong>
                      <span>
                        <Icons8Icon name="location" variant="white" size={13} /> {p.address}, {p.city}
                      </span>
                    </div>
                    <div className="bfa-result-rate">{formatNaira(p.starting_rate)}/nt</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PublicTopNav>

      {/* 3. Opening Screen Hero Viewport (Content gracefully clears dynamic top bar with no overlap) */}
      <section className="bfa-initial-viewport" id="hero">
        {/* Hero Center Group: Notification above search bar, search bar on purple line, 8 shortcuts below */}
        <div className="bfa-hero-center-container">
          {/* Notification banner on top of purple line (search bar) */}
          {announcements.length > 0 && !announcementDismissed && (
            <div className={`bfa-hero-announcement-card ${isScrolled ? 'hidden' : 'visible'}`}>
              <span className="bfa-hero-announcement-badge">
                <span className="bfa-announcement-dot pulse" />
                STAFF NOTIFICATION
              </span>
              <div className="bfa-hero-announcement-text">
                <strong>{announcements[0].title}:</strong>{' '}
                {announcements[0].message?.replace(/across Lagos/gi, 'across Akure, Ondo State').replace(/in Lagos/gi, 'in Akure, Ondo State').replace(/Lagos/gi, 'Akure')}
              </div>
              <button
                type="button"
                className="bfa-hero-announcement-close"
                onClick={() => setAnnouncementDismissed(true)}
                aria-label="Dismiss notification"
                title="Dismiss notification"
              >
                <Icons8Icon name="close" variant="white" size={12} alt="Dismiss" />
              </button>
            </div>
          )}

          {/* Center Search Bar on Purple Line (Visible at top, transitions to upper bar on scroll, reappears when scrolled back up) */}
          <div className={`bfa-hero-search-wrap ${isScrolled ? 'hidden' : 'visible'}`} ref={heroSearchContainerRef}>
            <div className="bfa-center-search-box hero-variant">
              <span className="bfa-search-icon">
                <Icons8Icon name="search" variant="white" size={19} alt="Search" />
              </span>
              <input
                type="text"
                className="bfa-center-search-input"
                placeholder="Search apartments, properties, or locations in Akure..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    scrollToSection(null, 'feed-root');
                  }
                }}
                aria-label="Search apartments and properties"
              />
              <button
                type="button"
                onClick={() => handleNextWallpaper()}
                className="bfa-nav-wallpaper-btn"
                title="Change apartment wallpaper"
                aria-label="Change wallpaper"
              >
                <Icons8Icon name="wallpaper" variant="white" size={19} alt="Wallpaper" />
              </button>
            </div>

            {/* Live Autocomplete Dropdown in Hero Center */}
            {searchFocused && !isScrolled && (
              <div className="bfa-live-search-dropdown hero-dropdown">
                {searchResults.length > 0 ? (
                  searchResults.slice(0, 6).map((apt) => (
                    <div
                      key={apt.id}
                      className="bfa-search-result-row"
                      onClick={() => handleSelectUnitAndBook(apt.property_id, apt.id)}
                    >
                      <div className="bfa-result-info">
                        <strong>
                          Unit {apt.unit_number} — {apt.unit_name}
                        </strong>
                        <span>
                          {apt.property_name} • {apt.city} ({apt.unit_type})
                        </span>
                      </div>
                      <div className="bfa-result-rate">{formatNaira(apt.rate_per_night)}/nt</div>
                    </div>
                  ))
                ) : searchQuery.trim() ? (
                  <div style={{ padding: '1rem', color: '#64748b', fontSize: '0.88rem', textAlign: 'center' }}>
                    No suites match "{searchQuery}".
                  </div>
                ) : (
                  <div style={{ padding: '0.85rem 1rem' }}>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Akure Premier Residences
                    </div>
                    {properties.map((p) => (
                      <div
                        key={p.id}
                        className="bfa-search-result-row"
                        style={{ padding: '0.5rem 0' }}
                        onClick={() => {
                          handleSelectPropertyAndBook(p.id);
                          setSearchFocused(false);
                        }}
                      >
                        <div className="bfa-result-info">
                          <strong>{p.name}</strong>
                          <span>
                            <Icons8Icon name="location" variant="white" size={13} /> {p.address}, {p.city}
                          </span>
                        </div>
                        <div className="bfa-result-rate">{formatNaira(p.starting_rate)}/nt</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 8 Shortcuts neatly centered under search bar */}
          <div className="bfa-shortcuts-grid">
            <div
              className="bfa-shortcut-tile"
              onClick={() => handleOpenApartmentDetails(1)}
              title="Grand Horizon Tower — View Details & Gallery (Alagbaka GRA, Akure)"
            >
              <div className="bfa-shortcut-tile-icon">
                <Icons8Icon name="building" variant="white" size={26} alt="Grand Horizon" />
              </div>
              <span className="bfa-shortcut-tile-label">G. Horizon</span>
            </div>

            <div
              className="bfa-shortcut-tile"
              onClick={() => handleOpenApartmentDetails(2)}
              title="Azure Bay Residences — View Details & Gallery (Ijapo Estate, Akure)"
            >
              <div className="bfa-shortcut-tile-icon">
                <Icons8Icon name="water" variant="white" size={26} alt="Azure Bay" />
              </div>
              <span className="bfa-shortcut-tile-label">Azure Bay</span>
            </div>

            <div
              className="bfa-shortcut-tile"
              onClick={() => handleOpenApartmentDetails(3)}
              title="The Royal Palms Suites — View Details & Gallery (Oba-Ile, Akure)"
            >
              <div className="bfa-shortcut-tile-icon">
                <Icons8Icon name="palm-tree" variant="white" size={26} alt="Royal Palms" />
              </div>
              <span className="bfa-shortcut-tile-label">Royal Palms</span>
            </div>

            <Link
              to="/about"
              className="bfa-shortcut-tile"
              title="Apartment Showcase & All Images"
            >
              <div className="bfa-shortcut-tile-icon">
                <Icons8Icon name="gallery" variant="white" size={26} alt="Showcase" />
              </div>
              <span className="bfa-shortcut-tile-label">Showcase</span>
            </Link>

            <div
              className="bfa-shortcut-tile"
              onClick={(e) => {
                setActiveTab('booking');
                scrollToSection(e, 'booking');
              }}
              title="Online Reservation Engine"
            >
              <div className="bfa-shortcut-tile-icon">
                <Icons8Icon name="calendar" variant="white" size={26} alt="Booking" />
              </div>
              <span className="bfa-shortcut-tile-label">Booking</span>
            </div>

            <div
              className="bfa-shortcut-tile"
              onClick={() => {
                setVerificationError('');
                setVerificationResult(null);
                setVerifyModalOpen(true);
              }}
              title="Cryptographic Stay Verification"
            >
              <div className="bfa-shortcut-tile-icon">
                <Icons8Icon name="shield-check" variant="white" size={26} alt="Verify" />
              </div>
              <span className="bfa-shortcut-tile-label">Verify</span>
            </div>

            <div
              className="bfa-shortcut-tile"
              onClick={(e) => {
                setActiveTab('amenities');
                scrollToSection(e, 'features');
              }}
              title="24/7 Power, Fiber, Contact Desk"
            >
              <div className="bfa-shortcut-tile-icon">
                <Icons8Icon name="lightning" variant="white" size={26} alt="Amenities" />
              </div>
              <span className="bfa-shortcut-tile-label">Amenities</span>
            </div>

            <Link
              to="/contact"
              className="bfa-shortcut-tile"
              title="24/7 Contact Desk & Inquiries"
            >
              <div className="bfa-shortcut-tile-icon">
                <Icons8Icon name="phone" variant="white" size={26} alt="Contact" />
              </div>
              <span className="bfa-shortcut-tile-label">Contact</span>
            </Link>
          </div>
        </div>

        {/* --- Bottom Floating Pill Dock (Matches MSN / Edge Bottom Bar in Reference) --- */}
        <div className="bfa-edge-bottom-dock">
          <div className="bfa-dock-left">
            <div className="bfa-dock-brand-tag">
              <span>✦</span> BFA
            </div>
            <button
              type="button"
              className={`bfa-dock-tab ${activeTab === 'discover' ? 'active' : ''}`}
              onClick={(e) => {
                setActiveTab('discover');
                scrollToSection(e, 'feed-root');
              }}
            >
              Discover
            </button>
            <button
              type="button"
              className={`bfa-dock-tab ${activeTab === 'properties' ? 'active' : ''}`}
              onClick={(e) => {
                setActiveTab('properties');
                scrollToSection(e, 'properties');
              }}
            >
              Properties
            </button>
            <button
              type="button"
              className={`bfa-dock-tab ${activeTab === 'booking' ? 'active' : ''}`}
              onClick={(e) => {
                setActiveTab('booking');
                scrollToSection(e, 'booking');
              }}
            >
              Online Booking
            </button>
            <button
              type="button"
              className={`bfa-dock-tab ${activeTab === 'amenities' ? 'active' : ''}`}
              onClick={(e) => {
                setActiveTab('amenities');
                scrollToSection(e, 'features');
              }}
            >
              Amenities
            </button>
            <button
              type="button"
              className={`bfa-dock-tab ${activeTab === 'verify' ? 'active' : ''}`}
              onClick={(e) => {
                setActiveTab('verify');
                scrollToSection(e, 'verify');
              }}
            >
              Verification
            </button>
            <Link to="/about" className="bfa-dock-tab">
              Showcase
            </Link>
            <Link to="/contact" className="bfa-dock-tab">
              Contact
            </Link>
          </div>

          <div className="bfa-dock-right">
            {/* Apartment Wallpaper Location Credit & Switcher (Edge Style) */}
            <div
              className="bfa-wallpaper-info-pill"
              onClick={handleNextWallpaper}
              title="Click to switch to next apartment wallpaper"
            >
              <button type="button" className="bfa-wallpaper-arrow" onClick={handlePrevWallpaper} aria-label="Previous image">
                <Icons8Icon name="chevron-left" variant="white" size={13} alt="‹" />
              </button>
              <span>
                <Icons8Icon name="location" variant="white" size={14} alt="Location" /> {currentWallpaper.title}
              </span>
              <button type="button" className="bfa-wallpaper-arrow" onClick={handleNextWallpaper} aria-label="Next image">
                <Icons8Icon name="chevron-right" variant="white" size={13} alt="›" />
              </button>
            </div>

            <button
              type="button"
              className="bfa-dock-feed-btn"
              onClick={(e) => scrollToSection(e, 'feed-root')}
            >
              <span>Feed layout</span>
              <Icons8Icon name="chevron-down" variant="white" size={13} alt="↓" />
            </button>
          </div>
        </div>
      </section>

      {/* 3. The Content Feed Panel (Smoothly comes up over the stationary background when scrolling) */}
      <div className="bfa-feed-wrapper" id="feed-root">
        <div className="bfa-feed-container">
          {/* Sticky Tab Header on Feed Container */}
          <div className="bfa-feed-sticky-header">
            <div className="bfa-feed-tabs-list" role="tablist">
              <button
                type="button"
                className={`bfa-feed-tab-item ${activeTab === 'discover' ? 'active' : ''}`}
                onClick={() => setActiveTab('discover')}
              >
                Discover
              </button>
              <button
                type="button"
                className={`bfa-feed-tab-item ${activeTab === 'properties' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('properties');
                  scrollToSection(null, 'properties');
                }}
              >
                Properties Portfolio
              </button>
              <button
                type="button"
                className={`bfa-feed-tab-item ${activeTab === 'booking' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('booking');
                  scrollToSection(null, 'booking');
                }}
              >
                Online Booking Engine
              </button>
              <button
                type="button"
                className={`bfa-feed-tab-item ${activeTab === 'amenities' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('amenities');
                  scrollToSection(null, 'features');
                }}
              >
                Amenities & Standards
              </button>
              <button
                type="button"
                className={`bfa-feed-tab-item ${activeTab === 'verify' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('verify');
                  scrollToSection(null, 'verify');
                }}
              >
                Stay Verification
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setVerificationError('');
                  setVerificationResult(null);
                  setVerifyModalOpen(true);
                }}
                style={{
                  padding: '0.42rem 0.85rem',
                  borderRadius: '9999px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🔍 Verify Code
              </button>
              <Link
                to="/login"
                style={{
                  padding: '0.42rem 0.95rem',
                  borderRadius: '9999px',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Portal Login →
              </Link>
            </div>
          </div>

          {/* Feed Content Body */}
          <div className="bfa-feed-content-body">
            {/* Section 1: Data-Driven Buildings & Properties Portfolio Showcase */}
            <div className="bfa-discovery-section-block" id="properties">
              <div className="bfa-feed-section-header">
                <span className="bfa-feed-section-tag">Akure Premier Portfolio</span>
                <h2 className="bfa-feed-section-title">Explore Apartments & Residences</h2>
                <p className="bfa-feed-section-desc">
                  Browse our portfolio of serviced luxury residential buildings across Akure, Ondo State. Select any building to explore its curated room types, high-resolution photography, and real-time rentable suites.
                </p>
                <div className="bfa-representative-disclaimer-banner" role="note">
                  <Icons8Icon name="info" variant="blue" size={14} />
                  <span>Representative images — actual room appearance may vary.</span>
                </div>
              </div>

              {/* Data-Driven Property Cards Grid (Dynamically renders ALL active buildings) */}
              <div className="bfa-properties-grid-dynamic">
                {properties.map((p) => {
                  const isSelected = String(p.id) === String(selectedBuildingId);
                  const photo = getPropertyPhoto(p.id, p.code);
                  const availableCount = p.available_units !== undefined ? p.available_units : p.total_units;

                  return (
                    <div
                      key={p.id}
                      className={`bfa-building-card ${isSelected ? 'active-selected' : ''}`}
                    >
                      <div
                        className="bfa-building-card-visual"
                        style={{ backgroundImage: `url(${photo})` }}
                      >
                        <div className="bfa-building-card-overlay" />
                        <div className="bfa-building-badge-code">✦ {p.code}</div>
                        <div className="bfa-building-badge-avail">
                          {availableCount > 0 ? `✓ ${availableCount} Units Available` : 'Fully Booked'}
                        </div>
                        <div className="bfa-photo-disclaimer-tag">
                          Representative image
                        </div>
                      </div>

                      <div className="bfa-building-card-body">
                        <h3 className="bfa-building-card-title">{p.name}</h3>
                        <div className="bfa-building-card-location">
                          <Icons8Icon name="location" variant="blue" size={14} alt="📍" />
                          <span>{p.address}, {p.city}</span>
                        </div>
                        <p className="bfa-building-card-desc">
                          {p.description || 'Engineered for executive corporate travelers, dignitaries, and families seeking refined luxury in Akure.'}
                        </p>

                        {/* Amenities Chips Preview */}
                        <div className="bfa-building-amenities-chips">
                          {(Array.isArray(p.amenities) && p.amenities.length > 0
                            ? p.amenities.slice(0, 4)
                            : ['24/7 Power', 'Fiber Wi-Fi', 'Security', 'Parking']
                          ).map((amn, aIdx) => (
                            <span key={aIdx} className="bfa-amenity-chip">
                              • {amn}
                            </span>
                          ))}
                        </div>

                        <div className="bfa-building-card-footer">
                          <div className="bfa-rate-box">
                            <span className="rate-label">Starting Rate</span>
                            <span className="rate-value">
                              {formatNaira(p.starting_rate || '140000')}
                              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>/nt</span>
                            </span>
                          </div>

                          <div className="bfa-building-actions-row">
                            <button
                              type="button"
                              className="bfa-view-apt-btn"
                              onClick={() => handleSelectBuilding(p.id)}
                              title="Explore room types and view detailed photographs"
                            >
                              Explore Room Types ↓
                            </button>
                            <Link
                              to={`/property/${p.id}`}
                              className="bfa-building-page-link"
                              title="Open full building page and photo gallery"
                            >
                              View Property Page →
                            </Link>
                            <button
                              type="button"
                              className="bfa-reserve-suite-btn"
                              onClick={() => handleSelectPropertyAndBook(p.id)}
                              title="Book a stay at this building"
                            >
                              Quick Book →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Real-Time Live Feed Bar */}
              <div className="bfa-card-widget" style={{ marginBottom: '1.5rem' }}>
                <div className="bfa-widget-header">
                  <div className="bfa-widget-title">
                    <span>⚡</span> Instant Rentable Units Feed across Akure
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: '#15803d',
                      background: '#dcfce7',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                    }}
                  >
                    LIVE INVENTORY
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                  {apartments.slice(0, 4).map((apt) => (
                    <div
                      key={apt.id}
                      className="bfa-widget-unit-row"
                      style={{ border: '1px solid #f1f5f9', background: '#f8fafc' }}
                      onClick={() => handleSelectUnitAndBook(apt.property_id, apt.id)}
                      title="Click to reserve this specific unit"
                    >
                      <div className="bfa-widget-unit-info">
                        <strong>Unit {apt.unit_number} — {apt.unit_name}</strong>
                        <span>{apt.property_name} • {apt.unit_type}</span>
                      </div>
                      <div className="bfa-widget-unit-price">
                        <div>{formatNaira(apt.rate_per_night)}</div>
                        <span style={{ fontSize: '0.68rem', color: '#64748b' }}>/nt</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Building Explorer & Room-Types Showcase Block */}
              {activeBuilding && (
                <div className="bfa-building-explorer-block" id="explore-building">
                  {/* Building Switcher Pills */}
                  <div className="bfa-building-selector-bar">
                    {properties.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`bfa-building-tab-pill ${String(b.id) === String(selectedBuildingId) ? 'active' : ''}`}
                        onClick={() => setSelectedBuildingId(String(b.id))}
                      >
                        <Icons8Icon name="building" variant={String(b.id) === String(selectedBuildingId) ? 'blue' : 'white'} size={15} />
                        <span>{b.name}</span>
                        <span style={{ opacity: 0.8, fontSize: '0.74rem' }}>({b.total_units} units)</span>
                      </button>
                    ))}
                  </div>

                  {/* Active Building Header & Amenities */}
                  <div className="bfa-selected-building-hero">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#2563eb', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                          <Icons8Icon name="location" variant="blue" size={14} /> {activeBuilding.address}, {activeBuilding.city}, Ondo State
                        </div>
                        <h3>{activeBuilding.name} — Room Types & Suites</h3>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="bfa-view-apt-btn"
                          onClick={() => handleOpenApartmentDetails(activeBuilding.id)}
                          style={{ padding: '0.55rem 1rem' }}
                        >
                          <Icons8Icon name="gallery" variant="blue" size={16} /> Full Building Gallery & Tour
                        </button>
                        <Link
                          to={`/property/${activeBuilding.id}`}
                          className="bfa-reserve-suite-btn"
                          style={{
                            padding: '0.55rem 1.1rem',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                          }}
                          title="Open dedicated building page with high-res photo gallery and room categories"
                        >
                          <span>Dedicated Enclave Page</span>
                          <Icons8Icon name="chevron-right" variant="white" size={13} />
                        </Link>
                      </div>
                    </div>

                    <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.6, margin: 0 }}>
                      {activeBuilding.description}
                    </p>

                    <div className="bfa-building-meta-row">
                      <span>🕒 <strong>Check-In:</strong> {activeBuilding.check_in_time || '14:00'}</span>
                      <span>🕚 <strong>Check-Out:</strong> {activeBuilding.check_out_time || '11:00'}</span>
                      <span>🛡️ <strong>Security:</strong> 24/7 Uniformed Patrol & Biometrics</span>
                      <span>⚡ <strong>Power:</strong> 100% Dual-Grid Solar Hybrid</span>
                    </div>
                  </div>

                  {/* Room Types Cards Grid */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', margin: '0 0 1rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      Configured Room Types ({activeRoomTypes.length})
                    </h4>
                    <div className="bfa-representative-disclaimer-banner" style={{ margin: 0 }} role="note">
                      <Icons8Icon name="info" variant="blue" size={14} />
                      <span>Representative images — actual room appearance may vary.</span>
                    </div>
                  </div>

                  {loadingBuildingDetails ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                      <div className="bfa-pulse-dot" style={{ margin: '0 auto 0.75rem' }} />
                      Loading building room types and availability...
                    </div>
                  ) : activeRoomTypes.length > 0 ? (
                    <div className="bfa-room-types-grid">
                      {activeRoomTypes.map((rt, idx) => {
                        const isAvailable = rt.availableUnits > 0;
                        const photo = getRoomTypePhoto(rt.unitType, activeBuilding.id);

                        return (
                          <div key={idx} className="bfa-room-type-card">
                            <div
                              className="bfa-room-type-visual"
                              style={{ backgroundImage: `url(${photo})` }}
                            >
                              <div
                                className={`bfa-room-type-badge-avail ${isAvailable ? 'available' : 'booked'}`}
                              >
                                {isAvailable ? `✓ Available (${rt.availableUnits} of ${rt.totalUnits})` : 'Fully Booked'}
                              </div>
                              <div className="bfa-photo-disclaimer-tag">
                                Representative image
                              </div>
                            </div>

                            <div className="bfa-room-type-body">
                              <h5 className="bfa-room-type-title">{rt.unitType}</h5>
                              <div className="bfa-room-type-specs">
                                <span>👥 {rt.capacity} Guests • 🛏️ {rt.bedroomCount} Bed • 🛁 {rt.bathroomCount} Bath</span>
                              </div>

                              {/* Amenities preview */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
                                {(Array.isArray(rt.amenities) && rt.amenities.length > 0
                                  ? rt.amenities.slice(0, 3)
                                  : ['Fiber Wi-Fi 6', '24/7 Power', 'Inverter AC']
                                ).map((aItem, aIdx) => (
                                  <span
                                    key={aIdx}
                                    style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 600,
                                      color: '#475569',
                                      background: '#f1f5f9',
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    ✓ {aItem}
                                  </span>
                                ))}
                              </div>

                              <div className="bfa-room-type-footer">
                                <div className="bfa-rate-box">
                                  <span className="rate-label">From</span>
                                  <span className="rate-value">
                                    {formatNaira(rt.startingRate)}
                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>/nt</span>
                                  </span>
                                </div>

                                <div style={{ display: 'flex', gap: '0.45rem' }}>
                                  <button
                                    type="button"
                                    className="bfa-room-details-btn"
                                    onClick={() => handleOpenApartmentDetails(activeBuilding.id, rt, 'gallery')}
                                    title="View high-resolution photo gallery and amenities"
                                  >
                                    <Icons8Icon name="view-eye" variant="blue" size={14} /> Specs
                                  </button>
                                  <button
                                    type="button"
                                    className="bfa-room-book-btn"
                                    onClick={() => handleBookRoomType(rt, activeBuilding.id)}
                                    title="Reserve a unit of this room type"
                                  >
                                    Book Now →
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bfa-empty-state-box">
                      <Icons8Icon name="door" variant="blue" size={32} />
                      <h4 style={{ margin: '0.75rem 0 0.35rem', color: '#0f172a' }}>No Room Types Listed</h4>
                      <p style={{ margin: 0, fontSize: '0.88rem' }}>
                        There are currently no active room types configured for this building.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 2: Online Reservation Engine (#booking) */}

            <div className="bfa-feed-section-block" id="booking">
              <div className="bfa-feed-section-header">
                <span className="bfa-feed-section-tag">Direct Reservations</span>
                <h2 className="bfa-feed-section-title">Online Reservation Engine</h2>
                <p className="bfa-feed-section-desc">
                  Select your preferred residence, choose a unit, and secure your 1-night stay with instant cryptographic confirmation.
                </p>
              </div>

              <form onSubmit={handleCheckAvailability}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
                    gap: '1.25rem',
                    marginBottom: '1.25rem',
                  }}
                >
                  {/* Property Selector */}
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#475569',
                        textTransform: 'uppercase',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <Icons8Icon name="building" variant="blue" size={15} alt="Residence" /> SELECT RESIDENCE
                    </label>
                    <select
                      value={selectedPropertyId}
                      onChange={(e) => {
                        setSelectedPropertyId(e.target.value);
                        setSelectedApartmentId('');
                        setAvailabilityResult(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 0.9rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                      }}
                    >
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.city})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Unit Selector */}
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#475569',
                        textTransform: 'uppercase',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <Icons8Icon name="building" variant="blue" size={15} alt="Suite" /> APARTMENT / SUITE
                    </label>
                    <select
                      value={selectedApartmentId}
                      onChange={(e) => {
                        setSelectedApartmentId(e.target.value);
                        setAvailabilityResult(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 0.9rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                      }}
                    >
                      {filteredApartments.length === 0 ? (
                        <option value="">No units available</option>
                      ) : (
                        filteredApartments.map((a) => (
                          <option key={a.id} value={a.id}>
                            Unit {a.unit_number} — {a.unit_name} ({formatNaira(a.rate_per_night)}/nt)
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Check-In Date */}
                  <div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#475569',
                        textTransform: 'uppercase',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <Icons8Icon name="calendar" variant="blue" size={15} alt="Calendar" /> CHECK-IN DATE (1 NIGHT)
                    </label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={checkInDate}
                      onChange={(e) => {
                        setCheckInDate(e.target.value);
                        setAvailabilityResult(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem 0.9rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Submit Check */}
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      type="submit"
                      disabled={checkingAvailability || !selectedApartmentId}
                      style={{
                        width: '100%',
                        padding: '0.8rem 1.25rem',
                        borderRadius: '8px',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        cursor: checkingAvailability ? 'wait' : 'pointer',
                        boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                        height: '46px',
                      }}
                    >
                      {checkingAvailability ? 'Checking Availability...' : 'Check Availability'}
                    </button>
                  </div>
                </div>
              </form>

              {availabilityError && (
                <div
                  style={{
                    padding: '0.85rem',
                    borderRadius: '8px',
                    background: '#fef2f2',
                    border: '1px solid #fecdd3',
                    color: '#9f1239',
                    fontSize: '0.88rem',
                    marginBottom: '1rem',
                  }}
                >
                  ✕ {availabilityError}
                </div>
              )}

              {/* Availability Result Display */}
              {availabilityResult && (
                <div
                  style={{
                    marginTop: '1.5rem',
                    padding: '1.5rem',
                    borderRadius: '12px',
                    background: availabilityResult.isAvailable ? '#f0fdf4' : '#fff1f2',
                    border: `1px solid ${availabilityResult.isAvailable ? '#bbf7d0' : '#fecdd3'}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          padding: '0.25rem 0.65rem',
                          borderRadius: '9999px',
                          background: availabilityResult.isAvailable ? '#15803d' : '#be123c',
                          color: '#ffffff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {availabilityResult.isAvailable ? '✓ Unit Available for Booking' : '✕ Reserved / Unavailable'}
                      </span>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.4rem', color: '#0f172a' }}>
                        {availabilityResult.unitName} (Unit {availabilityResult.unitNumber})
                      </h3>
                      <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                        {availabilityResult.propertyName} • Stay: {availabilityResult.checkInDate} to{' '}
                        {availabilityResult.checkOutDate} (1 Night)
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                        Total Rate
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
                        {formatNaira(availabilityResult.totalAmount)}
                      </div>
                    </div>
                  </div>

                  {availabilityResult.isAvailable && (
                    <form onSubmit={handleCreateBooking} style={{ borderTop: '1px solid #bbf7d0', paddingTop: '1.25rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#065f46', marginBottom: '0.75rem' }}>
                        Enter Guest Details to Confirm Reservation:
                      </h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                          gap: '1rem',
                          marginBottom: '1rem',
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Full Name"
                          required
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            boxSizing: 'border-box',
                          }}
                        />
                        <input
                          type="email"
                          placeholder="Email Address"
                          required
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            boxSizing: 'border-box',
                          }}
                        />
                        <input
                          type="tel"
                          placeholder="Phone Number"
                          required
                          value={guestPhone}
                          onChange={(e) => setGuestPhone(e.target.value)}
                          style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>

                      {/* Payment Control Selector */}
                      <div
                        style={{
                          margin: '1rem 0',
                          padding: '1rem',
                          background: '#ffffff',
                          borderRadius: '10px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <label
                          style={{
                            display: 'block',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            color: '#334155',
                            marginBottom: '0.5rem',
                            textTransform: 'uppercase',
                          }}
                        >
                          💳 Payment Authorization Option
                        </label>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '0.75rem',
                            marginBottom: '0.5rem',
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem',
                              padding: '0.75rem',
                              borderRadius: '8px',
                              border: `2px solid ${paymentOption === 'PAY_ONLINE' ? '#2563eb' : '#e2e8f0'}`,
                              background: paymentOption === 'PAY_ONLINE' ? '#eff6ff' : '#ffffff',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="radio"
                              name="paymentOption"
                              value="PAY_ONLINE"
                              checked={paymentOption === 'PAY_ONLINE'}
                              onChange={() => setPaymentOption('PAY_ONLINE')}
                            />
                            <div>
                              <strong style={{ fontSize: '0.875rem', color: '#0f172a', display: 'block' }}>
                                Pay Online Now
                              </strong>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Instant Card, Bank Transfer, or USSD
                              </span>
                            </div>
                          </label>

                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.6rem',
                              padding: '0.75rem',
                              borderRadius: '8px',
                              border: `2px solid ${paymentOption === 'PAY_AT_PROPERTY' ? '#2563eb' : '#e2e8f0'}`,
                              background: paymentOption === 'PAY_AT_PROPERTY' ? '#eff6ff' : '#ffffff',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="radio"
                              name="paymentOption"
                              value="PAY_AT_PROPERTY"
                              checked={paymentOption === 'PAY_AT_PROPERTY'}
                              onChange={() => setPaymentOption('PAY_AT_PROPERTY')}
                            />
                            <div>
                              <strong style={{ fontSize: '0.875rem', color: '#0f172a', display: 'block' }}>
                                Pay When You Arrive
                              </strong>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Front Desk Settlement (Policy Governed)
                              </span>
                            </div>
                          </label>
                        </div>

                        {paymentOption === 'PAY_ONLINE' && (
                          <div
                            style={{
                              display: 'flex',
                              gap: '1.25rem',
                              marginTop: '0.75rem',
                              paddingTop: '0.5rem',
                              borderTop: '1px dashed #cbd5e1',
                              flexWrap: 'wrap',
                            }}
                          >
                            <label style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="paymentChannel"
                                value="CARD"
                                checked={paymentChannel === 'CARD'}
                                onChange={() => setPaymentChannel('CARD')}
                              />
                              <Icons8Icon name="credit-card" variant="blue" size={16} alt="Card" /> Card (Mastercard / Visa / Verve)
                            </label>
                            <label style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="paymentChannel"
                                value="BANK_TRANSFER"
                                checked={paymentChannel === 'BANK_TRANSFER'}
                                onChange={() => setPaymentChannel('BANK_TRANSFER')}
                              />
                              <Icons8Icon name="bank" variant="blue" size={16} alt="Bank" /> Instant Bank Transfer
                            </label>
                            <label style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="paymentChannel"
                                value="USSD"
                                checked={paymentChannel === 'USSD'}
                                onChange={() => setPaymentChannel('USSD')}
                              />
                              <Icons8Icon name="mobile-phone" variant="blue" size={16} alt="Phone" /> USSD Banking
                            </label>
                          </div>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={bookingLoading}
                        style={{
                          background: '#15803d',
                          color: '#ffffff',
                          border: 'none',
                          padding: '0.85rem 1.75rem',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: bookingLoading ? 'wait' : 'pointer',
                          boxShadow: '0 2px 6px rgba(21, 128, 61, 0.3)',
                        }}
                      >
                        {bookingLoading ? 'Processing Booking...' : 'Complete Online Reservation →'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Section 3: Standard Amenities (#features) */}
            <div className="bfa-feed-section-block" id="features">
              <div className="bfa-feed-section-header">
                <span className="bfa-feed-section-tag">Standard Across Residences</span>
                <h2 className="bfa-feed-section-title">Verified Standard Amenities</h2>
                <p className="bfa-feed-section-desc">
                  Every residence in the BFA portfolio adheres to strict operational standards.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                  gap: '1.25rem',
                }}
              >
                {[
                  { iconName: 'lightning', title: '24/7 Guaranteed Power', desc: 'Dual-redundant generators and continuous solar-hybrid supply.' },
                  { iconName: 'wifi', title: 'Enterprise Fiber Internet', desc: 'Ultra-low latency dedicated Wi-Fi 6 connectivity in every suite.' },
                  { iconName: 'shield-check', title: 'Concierge & Security', desc: 'Round-the-clock trained security personnel, access control, and reception.' },
                  { iconName: 'cleaning', title: 'Executive Housekeeping', desc: 'Rigorous hygiene standards, fresh linens, and scheduled turnover workflows.' },
                  { iconName: 'maintenance', title: 'Rapid Maintenance', desc: 'Dedicated in-house technicians responding swiftly to any operational requests.' },
                  { iconName: 'parking', title: 'Secure On-site Parking', desc: 'Dedicated tenant parking spaces with CCTV surveillance.' },
                ].map((f, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#f8fafc',
                      padding: '1.5rem',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ marginBottom: '0.85rem' }}>
                      <Icons8Icon name={f.iconName} variant="blue" size={32} alt={f.title} />
                    </div>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem' }}>
                      {f.title}
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 4: Stay Verification (#verify) */}
            <div className="bfa-feed-section-block" id="verify">
              <div className="bfa-feed-section-header">
                <span className="bfa-feed-section-tag">Security & Authenticity</span>
                <h2 className="bfa-feed-section-title">Cryptographic Stay Verification</h2>
                <p className="bfa-feed-section-desc">
                  Verify reservation authenticity against BFA's authoritative ledger using your reference code or authentication token.
                </p>
              </div>

              <div
                style={{
                  maxWidth: '640px',
                  margin: '0 auto',
                  background: '#f8fafc',
                  padding: '1.75rem',
                  borderRadius: '14px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <form onSubmit={handleLookupVerification}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Reservation Reference or Auth Token *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. BFA-RES-1234 or BFA-AUTH-ABC12345"
                      value={verifyQuery}
                      onChange={(e) => setVerifyQuery(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem 0.9rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                      Guest Email or Phone (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. guest@example.com or 08012345678"
                      value={verifyContact}
                      onChange={(e) => setVerifyContact(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem 0.9rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <Button type="submit" variant="primary" disabled={verifyLoading} style={{ width: '100%' }}>
                    {verifyLoading ? 'Verifying Stay Record...' : 'Verify Reservation Authenticity'}
                  </Button>
                </form>

                {verificationError && (
                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: '#fef2f2',
                      border: '1px solid #fecdd3',
                      color: '#9f1239',
                      fontSize: '0.85rem',
                    }}
                  >
                    ✕ {verificationError}
                  </div>
                )}

                {verificationResult && (
                  <div
                    style={{
                      marginTop: '1rem',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '10px',
                      padding: '1rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: '#15803d',
                        color: '#ffffff',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        textTransform: 'uppercase',
                        marginBottom: '0.75rem',
                      }}
                    >
                      ✓ AUTHENTICATED RECORD
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#475569' }}>Reservation Ref:</span>
                      <strong style={{ color: '#2563eb' }}>{verificationResult.reservationCode}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#475569' }}>Guest:</span>
                      <strong>{verificationResult.guestName}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#475569' }}>Residence & Unit:</span>
                      <span>
                        {verificationResult.propertyName} (Unit {verificationResult.unitNumber})
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#475569' }}>Payment Status:</span>
                      <strong style={{ color: verificationResult.paymentStatus === 'PAID' ? '#16a34a' : '#d97706' }}>
                        {verificationResult.paymentStatus}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Minimalist Edge Footer */}
          <footer
            style={{
              borderTop: '1px solid #e2e8f0',
              padding: '1.5rem',
              background: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              fontSize: '0.82rem',
              color: '#64748b',
            }}
          >
            <div>© {new Date().getFullYear()} BFA Apartments Management System. All rights reserved.</div>
            <div style={{ display: 'flex', gap: '1.25rem' }}>
              <a href="#properties" onClick={(e) => scrollToSection(e, 'properties')} style={{ color: '#64748b', textDecoration: 'none' }}>
                Portfolio
              </a>
              <a href="#booking" onClick={(e) => scrollToSection(e, 'booking')} style={{ color: '#64748b', textDecoration: 'none' }}>
                Booking Engine
              </a>
              <a href="#verify" onClick={(e) => scrollToSection(e, 'verify')} style={{ color: '#64748b', textDecoration: 'none' }}>
                Verification
              </a>
              <Link to="/about" style={{ color: '#64748b', textDecoration: 'none' }}>
                About & Showcase
              </Link>
              <Link to="/contact" style={{ color: '#64748b', textDecoration: 'none' }}>
                Contact
              </Link>
              <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                Staff Portal →
              </Link>
            </div>
          </footer>
        </div>
      </div>

      {/* Confirmation Modal with Cryptographic Authentication Code */}
      {confirmedBooking && (
        <Modal
          isOpen={!!confirmedBooking}
          onClose={() => {
            setConfirmedBooking(null);
            setCopiedAuthCode(false);
          }}
          size="md"
          icon="🎉"
          title="Reservation Confirmed & Authenticated!"
          subtitle="Your booking is secured on the authoritative BFA ledger"
        >
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#15803d',
                fontSize: '1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
              }}
            >
              ✓
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.35rem' }}>
              Thank You, {confirmedBooking.guestName}!
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Your 1-night stay has been confirmed in the authoritative reservation registry.
            </p>

            {/* Cryptographic Auth Box */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '1.25rem',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
            >
              <div
                style={{
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#94a3b8',
                  marginBottom: '0.35rem',
                }}
              >
                Official Cryptographic Authentication Code
              </div>
              <div
                style={{
                  fontSize: '1.45rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  color: '#60a5fa',
                  fontFamily: 'monospace',
                }}
              >
                {confirmedBooking.authenticationCode || 'BFA-AUTH-GENERATED'}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirmedBooking.authenticationCode) {
                    navigator.clipboard.writeText(confirmedBooking.authenticationCode);
                    setCopiedAuthCode(true);
                    setTimeout(() => setCopiedAuthCode(false), 3000);
                  }
                }}
                style={{
                  marginTop: '0.5rem',
                  background: 'rgba(255,255,255,0.12)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {copiedAuthCode ? '✓ Copied to Clipboard!' : '📋 Copy Auth Code'}
              </button>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '1rem',
                textAlign: 'left',
                marginBottom: '1.25rem',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Reservation Reference:</span>
                <span style={{ fontWeight: 800, color: '#2563eb' }}>{confirmedBooking.reservationCode}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Residence & Unit:</span>
                <span style={{ fontWeight: 600 }}>
                  {confirmedBooking.propertyName} — {confirmedBooking.unitName} (#{confirmedBooking.unitNumber})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Stay Period (1 Night):</span>
                <span style={{ fontWeight: 600 }}>
                  {confirmedBooking.checkInDate} ➔ {confirmedBooking.checkOutDate}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: '#64748b' }}>Payment Status:</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: confirmedBooking.paymentStatus === 'PAID' ? '#16a34a' : '#d97706',
                  }}
                >
                  {confirmedBooking.paymentStatus === 'PAID' ? '✓ PAID ONLINE' : '⏳ PENDING (AT RESIDENCE)'}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: '0.5rem',
                  marginTop: '0.5rem',
                }}
              >
                <span style={{ color: '#0f172a', fontWeight: 700 }}>Total Authorized:</span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#059669' }}>
                  {formatNaira(confirmedBooking.totalAmount)}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={() => {
                setConfirmedBooking(null);
                setCopiedAuthCode(false);
              }}
            >
              Complete
            </Button>
          </div>
        </Modal>
      )}

      {/* Guest Cryptographic Booking Verification Modal */}
      <Modal
        isOpen={verifyModalOpen}
        onClose={() => {
          setVerifyModalOpen(false);
          setVerificationResult(null);
          setVerificationError('');
        }}
        size="md"
        icon="🔍"
        title="Stay Authentication & Verification"
        subtitle="Verify stay validity using reservation code or cryptographic auth token"
      >
        <div>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
            Verify your reservation authenticity using your BFA Reservation Code (e.g. <code>BFA-RES-XXXX</code>) or
            Cryptographic Authentication Code (<code>BFA-AUTH-XXXXXXXX</code>).
          </p>

          <form onSubmit={handleLookupVerification} style={{ marginBottom: '1.25rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '0.25rem',
                }}
              >
                Booking Reference or Auth Code *
              </label>
              <input
                type="text"
                placeholder="e.g. BFA-RES-1234 or BFA-AUTH-ABC12345"
                value={verifyQuery}
                onChange={(e) => setVerifyQuery(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '0.25rem',
                }}
              >
                Guest Email or Phone (Optional for identity verification)
              </label>
              <input
                type="text"
                placeholder="e.g. guest@example.com or 08012345678"
                value={verifyContact}
                onChange={(e) => setVerifyContact(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <Button type="submit" variant="primary" disabled={verifyLoading} style={{ width: '100%' }}>
              {verifyLoading ? 'Verifying Cryptographic Record...' : 'Verify Reservation Authenticity'}
            </Button>
          </form>

          {verificationError && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '6px',
                background: '#fef2f2',
                border: '1px solid #fecdd3',
                color: '#9f1239',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              ✕ {verificationError}
            </div>
          )}

          {verificationResult && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.85rem',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: '#15803d',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                  marginBottom: '0.75rem',
                }}
              >
                ✓ AUTHENTICATED & CRYPTOGRAPHICALLY VERIFIED
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#475569' }}>Reservation Ref:</span>
                <strong style={{ color: '#2563eb' }}>{verificationResult.reservationCode}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#475569' }}>Auth Code:</span>
                <code style={{ fontWeight: 800, color: '#0f172a' }}>{verificationResult.authenticationCode}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#475569' }}>Guest:</span>
                <strong>{verificationResult.guestName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#475569' }}>Residence / Unit:</span>
                <span>
                  {verificationResult.propertyName} (Unit {verificationResult.unitNumber})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#475569' }}>Payment Status:</span>
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
      {/* Static Floating Concierge Chat Widget */}
      <FloatingChatWidget />
      {/* Interactive Apartment Detail & Indoor/Outdoor Gallery Modal */}
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
          handleSelectUnitAndBook(propId, unitId);
        }}
      />
    </div>
  );
}