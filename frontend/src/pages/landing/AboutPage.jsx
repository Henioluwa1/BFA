import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FloatingChatWidget from '../../components/public/FloatingChatWidget';
import Icons8Icon from '../../components/public/Icons8Icon';
import PublicTopNav from '../../components/public/PublicTopNav';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

// All 8 Curated Luxury Apartment Photography Assets
import heroArchitecture from '../../assets/hero-architecture.jpg';
import aptLivingLuxury from '../../assets/apt-living-luxury.jpg';
import aptPenthouseView from '../../assets/apt-penthouse-view.jpg';
import aptInteriorWarm from '../../assets/apt-interior-warm.jpg';
import aptTerraceWater from '../../assets/apt-terrace-water.jpg';
import aptKitchenChef from '../../assets/apt-kitchen-chef.jpg';
import aptBedroomMaster from '../../assets/apt-bedroom-master.jpg';
import aptBathroomSpa from '../../assets/apt-bathroom-spa.jpg';

import '../../styles/about.css';

const ALL_APARTMENT_SHOWCASE = [
  {
    id: 'architecture',
    category: 'exteriors',
    title: 'Grand Horizon Tower',
    property: 'Grand Horizon Tower',
    location: 'Plot 14, Alagbaka GRA Extension, Akure, Ondo State',
    type: 'Serviced High-Rise Facade',
    rate: '₦160,000/nt',
    specs: '14 Storeys • 24/7 Security • Subterranean Parking',
    image: heroArchitecture,
    description:
      'Engineered for executive corporate travelers and diplomatic delegations. Features floor-to-ceiling soundproof acoustic double-glazing, uninterrupted dual-grid power, and direct high-speed elevator access to private lobbies.',
    amenities: ['Dual 500kVA Generators', 'CCTV & Biometric Access', 'Fiber Internet (500 Mbps)', 'Basement Parking', 'Executive Boardroom'],
  },
  {
    id: 'living',
    category: 'living',
    title: 'Azure Bay Waterfront Executive Lounge',
    property: 'Azure Bay Residences',
    location: 'Block 7, Ijapo Central Estate, Akure, Ondo State',
    type: 'Waterfront Living Pavilion',
    rate: '₦140,000/nt',
    specs: '2,800 sq.ft • Panoramic Lagoon Views • High Ceilings',
    image: aptLivingLuxury,
    description:
      'Boasts uninterrupted vistas over the serene greenery of Ijapo Estate. Finished with imported Italian marble flooring, bespoke custom upholstery, integrated ambient Philips Hue lighting, and acoustic surround sound.',
    amenities: ['Panoramic Lagoon View', 'Italian Travertine Marble', 'Wine Chiller & Wet Bar', 'Bang & Olufsen Audio', 'Dedicated Butler'],
  },
  {
    id: 'penthouse',
    category: 'penthouse',
    title: 'The Royal Palms Skyline Penthouse',
    property: 'The Royal Palms Suites',
    location: 'Suite 24, Presidential Boulevard, Oba-Ile, Akure, Ondo State',
    type: 'Presidential Penthouse',
    rate: '₦200,000/nt',
    specs: '3,600 sq.ft • Private Sky Terrace • 3 En-Suite Bedrooms',
    image: aptPenthouseView,
    description:
      'A sanctuary in the sky perched atop the scenic hills of Oba-Ile, Akure. Features an expansive open-air terrace with sunset skyline views, private plunge jacuzzi, and oversized king suites tailored for high-profile stays.',
    amenities: ['Sky Terrace & Plunge Pool', 'Walk-in Dressing Lounges', 'Private Keyed Elevator', 'Designer Living Spaces', 'High-Speed Wi-Fi 6'],
  },
  {
    id: 'terrace',
    category: 'penthouse',
    title: 'Azure Bay Waterfront Villa & Infinity Pool',
    property: 'Azure Bay Residences',
    location: 'Block 7, Ijapo Central Estate, Akure, Ondo State',
    type: 'Waterfront Villa & Pool',
    rate: '₦280,000/nt',
    specs: '4,200 sq.ft • Waterfront Terrace • Heated Infinity Pool',
    image: aptTerraceWater,
    description:
      'The crown jewel of our Akure portfolio. Combines indoor-outdoor coastal living with an infinity swimming pool overlooking the marina, teakwood sunloungers, and alfresco dining terrace.',
    amenities: ['Heated Infinity Pool', 'Garden Cabana Access', 'Alfresco BBQ Pavilion', 'Smart Shading & Blinds', '24/7 Security Patrol'],
  },
  {
    id: 'kitchen',
    category: 'kitchen',
    title: 'Gourmet Chef Island & Culinary Pavilion',
    property: 'Grand Horizon Tower',
    location: 'Alagbaka GRA, Akure, Ondo State',
    type: 'Custom Culinary Suite',
    rate: '₦180,000/nt',
    specs: 'Quartz Waterfall Island • Sub-Zero Appliances • 8-Seat Dining',
    image: aptKitchenChef,
    description:
      'Fully equipped with induction cooktops, dual convection ovens, Sub-Zero refrigeration, custom Italian cabinetry, and an espresso bar. Ideal for private chef dinners or bespoke catering.',
    amenities: ['Induction Stovetops', 'Sub-Zero Refrigerator', 'Dual Convection Ovens', 'Dishwasher & Ice Maker', 'Nespresso Coffee Bar'],
  },
  {
    id: 'bedroom',
    category: 'living',
    title: 'Presidential Master Suite with Skyline Balcony',
    property: 'The Royal Palms Suites',
    location: 'Oba-Ile, Akure, Ondo State',
    type: 'Master Suite & Balcony',
    rate: '₦220,000/nt',
    specs: 'California King Bed • Egyptian Cotton Linens • Balcony Access',
    image: aptBedroomMaster,
    description:
      'Crafted for restorative rest. Features motorized blackout curtains, ergonomic study desk with multi-monitor docks, walk-in dressing wardrobe, and direct balcony egress with morning sun exposure.',
    amenities: ['800-Thread Count Linens', 'Motorized Blackout Blinds', 'Ergonomic Workstation', 'Walk-in Wardrobe', 'Silent Multi-Zone AC'],
  },
  {
    id: 'bathroom',
    category: 'spa',
    title: 'Italian Marble Spa Ensuite & Soaking Tub',
    property: 'Azure Bay Residences',
    location: 'Ijapo Central Estate, Akure, Ondo State',
    type: 'Spa & Wellness Ensuite',
    rate: 'Included in Villa Stays',
    specs: 'Freestanding Soaking Tub • Rainfall Shower • Double Vanity',
    image: aptBathroomSpa,
    description:
      'Modeled after five-star wellness retreats. Appointed with Calacatta marble, thermostatic rain showers, ambient under-cabinet glow, heated towel rails, and complimentary organic botanical bath amenities.',
    amenities: ['Calacatta Marble Slabs', 'Deep Freestanding Tub', 'Thermostatic Rain Shower', 'Heated Towel Warmers', 'Organic Amenities'],
  },
  {
    id: 'interior',
    category: 'living',
    title: 'Horizon Deluxe Suite 102 (Modern Minimalist)',
    property: 'Grand Horizon Tower',
    location: 'Alagbaka GRA, Akure, Ondo State',
    type: '1-Bedroom Executive Suite',
    rate: '₦160,000/nt',
    specs: '1,200 sq.ft • Open Concept • Smart Automation',
    image: aptInteriorWarm,
    description:
      'Minimalist warmth meets modern residential engineering. Designed with organic wooden furnishings, reading lounge, smart climate control, and ultra-quiet inverter air conditioning for seamless focus.',
    amenities: ['Smart Voice/App Controls', 'Reading Nook & Lounge', 'Ultra-Quiet Inverters', 'In-Unit Washer/Dryer', 'Daily Housekeeping'],
  },
];

export default function AboutPage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedSuite, setSelectedSuite] = useState(null);
  const [bgIndex, setBgIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Background images for rotating atmosphere
  const bgWallpapers = [heroArchitecture, aptLivingLuxury, aptPenthouseView, aptTerraceWater];

  // Auto-rotate background wallpaper smoothly
  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % bgWallpapers.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [bgWallpapers.length]);

  // Enable natural document scrolling
  useEffect(() => {
    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    return () => {
      document.documentElement.style.height = '';
      document.body.style.height = '';
    };
  }, []);

  const filteredSuites = ALL_APARTMENT_SHOWCASE.filter((item) => {
    const matchesCategory = activeFilter === 'all' || item.category === activeFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.property.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.specs.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="bfa-about-page">
      {/* 1. Multi-Image Fixed Background */}
      <div className="bfa-about-fixed-bg" aria-hidden="true">
        {bgWallpapers.map((bg, idx) => (
          <div
            key={idx}
            className={`bfa-about-bg-slide ${idx === bgIndex ? 'active' : ''}`}
            style={{ backgroundImage: `url(${bg})` }}
          />
        ))}
      </div>
      <div className="bfa-about-fixed-overlay" aria-hidden="true" />

      {/* 2. Dynamic Top Display Navigation Bar (Static with NO background) */}
      <PublicTopNav
        activePage="about"
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onNextWallpaper={() => setBgIndex((prev) => (prev + 1) % bgWallpapers.length)}
      />

      {/* 3. Hero Introduction */}
      <main className="bfa-about-main">
        <section className="bfa-about-hero-block">
          <div className="bfa-about-hero-tag">
            <span>✦</span> THE BFA RESIDENCES PORTFOLIO
          </div>
          <h1 className="bfa-about-title">
            Architectural Precision. <br />
            Uncompromising Akure Luxury.
          </h1>
          <p className="bfa-about-lead">
            Welcome to the flagship portfolio of <strong>BFA Serviced Apartments</strong>. From sunlit
            penthouses across Alagbaka GRA to tranquil garden residences in Ijapo Estate and premier suites in
            Oba-Ile, we redefine short-let and extended executive stays with 24/7 guaranteed power,
            enterprise fiber, and bespoke concierge.
          </p>

          {/* Key Metric Highlights */}
          <div className="bfa-about-metrics-row">
            <div className="bfa-about-metric-card">
              <span className="bfa-metric-value">3</span>
              <span className="bfa-metric-label">Prime Ondo State Enclaves</span>
              <span className="bfa-metric-sub">Alagbaka GRA • Ijapo Estate • Oba-Ile</span>
            </div>
            <div className="bfa-about-metric-card">
              <span className="bfa-metric-value">24/7</span>
              <span className="bfa-metric-label">Guaranteed Power</span>
              <span className="bfa-metric-sub">Dual Cummins + Solar Hybrid</span>
            </div>
            <div className="bfa-about-metric-card">
              <span className="bfa-metric-value">500 Mbps</span>
              <span className="bfa-metric-label">Dedicated Enterprise Fiber</span>
              <span className="bfa-metric-sub">Wi-Fi 6 in Every Suite</span>
            </div>
            <div className="bfa-about-metric-card">
              <span className="bfa-metric-value">100%</span>
              <span className="bfa-metric-label">Verified Authenticity</span>
              <span className="bfa-metric-sub">Cryptographic Stay Security</span>
            </div>
          </div>
        </section>

        {/* 4. Complete Apartment Showcase Feed */}
        <section className="bfa-about-showcase-section">
          <div className="bfa-showcase-header">
            <div>
              <span className="bfa-section-kicker">CURATED APARTMENT VIEWS</span>
              <h2 className="bfa-showcase-headline">Explore All Suites & Living Spaces</h2>
              <p className="bfa-showcase-sub">
                Click any suite image below to inspect high-definition details, verified floor specs, and private amenities.
              </p>
            </div>

            {/* Category Filter Pills */}
            <div className="bfa-showcase-filter-pills" role="tablist">
              <button
                type="button"
                className={`bfa-filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                All Views ({ALL_APARTMENT_SHOWCASE.length})
              </button>
              <button
                type="button"
                className={`bfa-filter-btn ${activeFilter === 'penthouse' ? 'active' : ''}`}
                onClick={() => setActiveFilter('penthouse')}
              >
                Penthouses & Pools
              </button>
              <button
                type="button"
                className={`bfa-filter-btn ${activeFilter === 'living' ? 'active' : ''}`}
                onClick={() => setActiveFilter('living')}
              >
                Lounges & Bedrooms
              </button>
              <button
                type="button"
                className={`bfa-filter-btn ${activeFilter === 'kitchen' ? 'active' : ''}`}
                onClick={() => setActiveFilter('kitchen')}
              >
                Chef Kitchens
              </button>
              <button
                type="button"
                className={`bfa-filter-btn ${activeFilter === 'spa' ? 'active' : ''}`}
                onClick={() => setActiveFilter('spa')}
              >
                Spa Ensuites
              </button>
            </div>
          </div>

          {/* Visual Grid of All Apartment Images */}
          <div className="bfa-showcase-grid">
            {filteredSuites.map((suite) => (
              <div
                key={suite.id}
                className="bfa-showcase-card"
                onClick={() => setSelectedSuite(suite)}
              >
                <div
                  className="bfa-showcase-image-wrap"
                  style={{ backgroundImage: `url(${suite.image})` }}
                >
                  <div className="bfa-showcase-badge">{suite.property}</div>
                  <div className="bfa-showcase-rate">{suite.rate}</div>
                  <div className="bfa-showcase-hover-overlay">
                    <span className="bfa-inspect-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Icons8Icon name="search" variant="white" size={14} /> Inspect Suite Details
                    </span>
                  </div>
                </div>

                <div className="bfa-showcase-card-body">
                  <span className="bfa-card-type">{suite.type}</span>
                  <h3 className="bfa-card-title">{suite.title}</h3>
                  <p className="bfa-card-location" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Icons8Icon name="location" variant="blue" size={14} /> {suite.location}
                  </p>
                  <p className="bfa-card-specs">✦ {suite.specs}</p>

                  <div className="bfa-card-action-bar">
                    <button
                      type="button"
                      className="bfa-card-inspect-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSuite(suite);
                      }}
                    >
                      View Specs & Amenities
                    </button>
                    <Link
                      to="/"
                      className="bfa-card-book-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Book →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. The BFA Operational Standards (Our Pillars) */}
        <section className="bfa-pillars-section">
          <div className="bfa-pillars-header">
            <span className="bfa-section-kicker">THE BFA PROMISE</span>
            <h2 className="bfa-showcase-headline">Hospitality Engineered for High Standards</h2>
          </div>

          <div className="bfa-pillars-grid">
            <div className="bfa-pillar-card">
              <div className="bfa-pillar-icon">
                <Icons8Icon name="lightning" variant="blue" size={32} />
              </div>
              <h4>Continuous Dual Power</h4>
              <p>
                Zero-interruption living with dedicated dual diesel generator redundancy and automatic
                synchronous ATS transfer under 50 milliseconds.
              </p>
            </div>

            <div className="bfa-pillar-card">
              <div className="bfa-pillar-icon">
                <Icons8Icon name="wifi" variant="blue" size={32} />
              </div>
              <h4>Enterprise Wi-Fi 6</h4>
              <p>
                Engineered for global executives, founders, and content creators. Ultra-low latency,
                dedicated bandwidth, and 24/7 tech support.
              </p>
            </div>

            <div className="bfa-pillar-card">
              <div className="bfa-pillar-icon">
                <Icons8Icon name="shield-check" variant="blue" size={32} />
              </div>
              <h4>Cryptographic Stay Verification</h4>
              <p>
                Every reservation issues an authentic tamper-proof cryptographic confirmation code to
                guarantee authenticity and prevent third-party booking scams.
              </p>
            </div>

            <div className="bfa-pillar-card">
              <div className="bfa-pillar-icon">
                <Icons8Icon name="phone" variant="blue" size={32} />
              </div>
              <h4>White-Glove Concierge</h4>
              <p>
                From airport transfers in executive Mercedes-Benz SUVs to private chef culinary dinners and
                bespoke dry cleaning, our concierge team is always on call.
              </p>
            </div>
          </div>
        </section>

        {/* 6. Prime Locations Showcase */}
        <section className="bfa-locations-block">
          <div className="bfa-showcase-header">
            <div>
              <span className="bfa-section-kicker">OUR POSTCODES</span>
              <h2 className="bfa-showcase-headline">Situated in Akure’s Most Desirable Enclaves</h2>
            </div>
          </div>

          <div className="bfa-locations-grid">
            <div className="bfa-location-card">
              <div className="bfa-location-photo" style={{ backgroundImage: `url(${heroArchitecture})` }} />
              <div className="bfa-location-details">
                <span className="bfa-loc-city">Alagbaka GRA, Akure</span>
                <h3>Grand Horizon Tower</h3>
                <p>Plot 14, Alagbaka GRA Extension, Akure</p>
                <div className="bfa-loc-features">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="building" variant="blue" size={14} /> 14 Storeys</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="kitchen" variant="blue" size={14} /> Chef Kitchen</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="shield-check" variant="blue" size={14} /> Diplomatic Security</span>
                </div>
              </div>
            </div>

            <div className="bfa-location-card">
              <div className="bfa-location-photo" style={{ backgroundImage: `url(${aptLivingLuxury})` }} />
              <div className="bfa-location-details">
                <span className="bfa-loc-city">Ijapo Central Estate, Akure</span>
                <h3>Azure Bay Residences</h3>
                <p>Block 7, Ijapo Central Estate, Akure</p>
                <div className="bfa-loc-features">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="water" variant="blue" size={14} /> Garden Views</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="swimming-pool" variant="blue" size={14} /> Infinity Pool</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="palm-tree" variant="blue" size={14} /> Private Grounds</span>
                </div>
              </div>
            </div>

            <div className="bfa-location-card">
              <div className="bfa-location-photo" style={{ backgroundImage: `url(${aptPenthouseView})` }} />
              <div className="bfa-location-details">
                <span className="bfa-loc-city">Presidential Corridor, Akure</span>
                <h3>The Royal Palms Suites</h3>
                <p>Suite 24, Presidential Boulevard, Oba-Ile, Akure</p>
                <div className="bfa-loc-features">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="palm-tree" variant="blue" size={14} /> Sky Terrace</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="swimming-pool" variant="blue" size={14} /> Plunge Pool</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><Icons8Icon name="gallery" variant="blue" size={14} /> Dining & Arts Hub</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Call To Action Footer Banner */}
        <section className="bfa-about-cta-banner">
          <div className="bfa-cta-content">
            <h2>Ready to Experience BFA Serviced Residences?</h2>
            <p>
              Book directly online for instant cryptographic confirmation, or connect with our VIP
              concierge desk for extended corporate stays.
            </p>
            <div className="bfa-cta-buttons">
              <Link to="/" className="bfa-cta-primary-btn">
                Browse Live Availability & Book →
              </Link>
              <Link to="/contact" className="bfa-cta-secondary-btn">
                Contact Desk
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* 8. Lightbox Modal for Full Suite Inspection */}
      {selectedSuite && (
        <Modal
          isOpen={Boolean(selectedSuite)}
          onClose={() => setSelectedSuite(null)}
          title={selectedSuite.title}
          size="lg"
        >
          <div className="bfa-suite-modal-body">
            <div
              className="bfa-modal-image-hero"
              style={{ backgroundImage: `url(${selectedSuite.image})` }}
            >
              <div className="bfa-modal-badge">{selectedSuite.property}</div>
              <div className="bfa-modal-rate">{selectedSuite.rate}</div>
            </div>

            <div className="bfa-modal-details-grid">
              <div>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem' }}>
                  {selectedSuite.title}
                </h4>
                <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 0 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Icons8Icon name="location" variant="blue" size={14} /> {selectedSuite.location}
                </p>
                <p style={{ fontSize: '0.94rem', color: '#334155', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
                  {selectedSuite.description}
                </p>

                <div style={{ marginBottom: '1.25rem' }}>
                  <strong style={{ display: 'block', fontSize: '0.82rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                    Specifications:
                  </strong>
                  <span style={{ fontSize: '0.9rem', color: '#2563eb', fontWeight: 700 }}>
                    ✦ {selectedSuite.specs}
                  </span>
                </div>
              </div>

              <div>
                <strong style={{ display: 'block', fontSize: '0.82rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.65rem' }}>
                  Verified In-Suite Amenities:
                </strong>
                <ul className="bfa-modal-amenities-list">
                  {selectedSuite.amenities.map((am, i) => (
                    <li key={i}>
                      <span className="bfa-amenity-check">✓</span>
                      <span>{am}</span>
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Button
                    variant="primary"
                    style={{ width: '100%', padding: '0.85rem' }}
                    onClick={() => {
                      setSelectedSuite(null);
                      navigate('/');
                    }}
                  >
                    Reserve This Suite Online →
                  </Button>
                  <Button
                    variant="secondary"
                    style={{ width: '100%' }}
                    onClick={() => {
                      setSelectedSuite(null);
                      navigate('/contact');
                    }}
                  >
                    Inquire with Contact Desk
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 9. Floating Static Chat Widget */}
      <FloatingChatWidget />

      {/* 10. Footer */}
      <footer className="bfa-about-footer">
        <div className="bfa-footer-container">
          <div className="bfa-footer-brand">
            <span className="bfa-footer-logo">⠿ BFA APARTMENTS</span>
            <p>Premier serviced residences and luxury executive suites across Akure, Ondo State.</p>
          </div>
          <div className="bfa-footer-links">
            <Link to="/">Home & Availability</Link>
            <Link to="/about">About Us & Showcase</Link>
            <Link to="/contact">Contact Desk</Link>
            <Link to="/login">Employee & Tenant Login</Link>
          </div>
          <div className="bfa-footer-bottom">
            <span>© {new Date().getFullYear()} BFA Apartments Management System. All rights reserved.</span>
            <span>Cryptographically Verified Stays</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

