import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Zap,
  Wifi,
  Sparkles,
  Building2,
  MapPin,
  Clock,
  ArrowRight,
  Award,
  CheckCircle2,
  HeartHandshake,
  KeyRound,
  Users,
} from 'lucide-react';
import PublicTopNav from '../../components/public/PublicTopNav';
import PublicFooter from '../../components/public/home/PublicFooter';
import FloatingChatWidget from '../../components/public/FloatingChatWidget';
import BookingModal from '../../components/public/BookingModal';
import { BfaButton, BfaBadge, BfaCard } from '../../components/public/primitives';
import { publicService, resolveMediaUrl } from '../../services/api';

import '../../styles/about.css';

/**
 * AboutPage — The BFA Story & Hospitality Standards
 * Authentic editorial About Us experience celebrating architectural distinction,
 * complete infrastructural independence, and executive service.
 */
export default function AboutPage() {
  const navigate = useNavigate();
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingModalProperty, setBookingModalProperty] = useState(null);
  const [enclaves, setEnclaves] = useState([]);

  // Natural scrolling behavior & load portal-managed enclaves
  useEffect(() => {
    document.documentElement.style.height = 'auto';
    document.body.style.height = 'auto';
    let mounted = true;
    publicService.getProperties()
      .then((res) => {
        if (mounted && Array.isArray(res.data)) {
          setEnclaves(res.data);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
      document.documentElement.style.height = '';
      document.body.style.height = '';
    };
  }, []);

  const pillars = [
    {
      icon: <Building2 size={24} aria-hidden="true" />,
      title: 'Architectural Distinction',
      desc: 'Purpose-built gated residences with spacious suites, acoustic noise isolation, generous natural lighting, and curated interior appointments.',
    },
    {
      icon: <Zap size={24} aria-hidden="true" />,
      title: '100% Infrastructural Autonomy',
      desc: 'Dual industrial Cummins and Caterpillar diesel generation coupled with multi-kilowatt commercial solar-hybrid inverters guarantees uninterrupted power.',
    },
    {
      icon: <Wifi size={24} aria-hidden="true" />,
      title: 'Enterprise Fiber Connectivity',
      desc: 'Dedicated 500 Mbps Wi-Fi 6 fiber infrastructure in every suite, engineered for seamless video conferencing and corporate remote work.',
    },
    {
      icon: <ShieldCheck size={24} aria-hidden="true" />,
      title: 'Cryptographic Privacy & Key Safety',
      desc: 'Tamper-proof reservation verification, front-desk validated door key access, 24/7 CCTV surveillance, and discrete guard protocols.',
    },
    {
      icon: <HeartHandshake size={24} aria-hidden="true" />,
      title: 'Discreet Executive Hospitality',
      desc: 'Dedicated on-site property concierges, daily meticulous turndown housekeeping, laundry service, and airport chauffeur transfers.',
    },
    {
      icon: <Award size={24} aria-hidden="true" />,
      title: 'Strict Reservation Integrity',
      desc: 'Enforced 1-night booking policy, transparent real-time quotes, and zero hidden checkout fees for complete guest peace of mind.',
    },
  ];

  return (
    <div className="bfa-about-page">
      {/* Static Glass Navigation Bar */}
      <PublicTopNav activePage="about" />

      {/* Hero Narrative Block */}
      <header className="bfa-about-hero-section">
        <div className="bfa-about-hero-container">
          <BfaBadge variant="champagne" size="md" icon={<Sparkles size={13} />}>
            The BFA Apartments Story
          </BfaBadge>
          <h1 className="bfa-about-hero-heading">
            Redefining Serviced Living in Akure, Ondo State
          </h1>
          <p className="bfa-about-hero-lead">
            BFA Apartments was established to introduce international-caliber serviced residences to Ondo State’s capital — harmonizing architectural elegance, complete infrastructural independence, and genuine hospitality.
          </p>
        </div>
      </header>

      {/* Main Narrative & Story Flow */}
      <main className="bfa-about-main-flow">
        {/* Origin & Vision Section */}
        <section className="bfa-about-story-section">
          <div className="bfa-about-story-grid">
            <div className="bfa-about-story-text">
              <span className="bfa-about-section-tag">OUR MISSION &amp; ORIGIN</span>
              <h2 className="bfa-about-section-title">A Vision Born from Executive Need</h2>
              <p>
                As Akure continues its dynamic emergence as a strategic administrative, agricultural, and commercial center in South-Western Nigeria, visiting executives, corporate delegations, diplomats, and returning diaspora families historically faced an unwelcome choice: aging municipal hotels with intermittent utilities or unmanaged residential apartments lacking professional standards.
              </p>
              <p>
                BFA Apartments was conceived to fundamentally solve this challenge. We built independent, gated residential enclaves engineered from the foundation up for total operational autonomy, absolute discretion, and restful residential comfort.
              </p>
              <div className="bfa-about-metrics-strip">
                <div className="bfa-about-metric">
                  <span className="bfa-about-metric-val">3</span>
                  <span className="bfa-about-metric-lbl">Autonomous Enclaves</span>
                </div>
                <div className="bfa-about-metric">
                  <span className="bfa-about-metric-val">100%</span>
                  <span className="bfa-about-metric-lbl">Power Guarantee</span>
                </div>
                <div className="bfa-about-metric">
                  <span className="bfa-about-metric-val">500 Mbps</span>
                  <span className="bfa-about-metric-lbl">Dedicated Wi-Fi 6</span>
                </div>
              </div>
            </div>

            <div className="bfa-about-story-media">
              {enclaves[0] && resolveMediaUrl(enclaves[0].primary_photo_url || enclaves[0].main_photo) ? (
                <img
                  src={resolveMediaUrl(enclaves[0].primary_photo_url || enclaves[0].main_photo)}
                  alt={`${enclaves[0].name} exterior architecture`}
                  className="bfa-about-story-img"
                />
              ) : (
                <div
                  className="bfa-about-story-img"
                  style={{
                    minHeight: '320px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #0b1b15 0%, #163329 100%)',
                    color: '#d4af37',
                  }}
                >
                  <Building2 size={48} />
                </div>
              )}
              <div className="bfa-about-story-caption">
                <strong>Portal-Managed Luxury Residences</strong>
                <span>Purpose-built serviced properties</span>
              </div>
            </div>
          </div>
        </section>

        {/* The 6 Pillars of Excellence */}
        <section className="bfa-about-pillars-section">
          <div className="bfa-about-pillars-header">
            <span className="bfa-about-section-tag">THE BFA STANDARD</span>
            <h2 className="bfa-about-section-title">Engineered Around Six Pillars of Excellence</h2>
            <p className="bfa-about-section-subtitle">
              From continuous clean energy to cryptographic access key issuance, every detail of our operation is designed to exceed expectations.
            </p>
          </div>

          <div className="bfa-about-pillars-grid">
            {pillars.map((pillar, idx) => (
              <div key={idx} className="bfa-about-pillar-card">
                <div className="bfa-about-pillar-icon">{pillar.icon}</div>
                <h3 className="bfa-about-pillar-title">{pillar.title}</h3>
                <p className="bfa-about-pillar-desc">{pillar.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Portfolio Showcase Grid */}
        <section className="bfa-about-portfolio-section">
          <div className="bfa-about-portfolio-header">
            <div>
              <span className="bfa-about-section-tag">OUR THREE ENCLAVES</span>
              <h2 className="bfa-about-section-title">The Akure Residences Portfolio</h2>
            </div>
            <Link to="/properties" className="bfa-about-view-all">
              <BfaButton variant="outline" size="sm" iconRight={<ArrowRight size={14} />}>
                View Full Catalog
              </BfaButton>
            </Link>
          </div>

          <div className="bfa-about-enclave-grid">
            {enclaves.map((enc) => {
              const photo = resolveMediaUrl(enc.primary_photo_url || enc.main_photo);
              const locationText = [enc.address, enc.district, enc.city, enc.state].filter(Boolean).join(', ');
              const highlightsText = Array.isArray(enc.amenities)
                ? enc.amenities.slice(0, 3).join(' • ')
                : 'Verified Serviced Enclave • 24/7 Power • High-Speed Fiber';
              return (
                <article key={enc.id} className="bfa-about-enclave-card">
                  <div className="bfa-about-enclave-img-box">
                    {photo ? (
                      <img src={photo} alt={enc.name} className="bfa-about-enclave-img" loading="lazy" />
                    ) : (
                      <div
                        className="bfa-about-enclave-img"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'linear-gradient(135deg, #0b1b15 0%, #163329 100%)',
                          color: '#d4af37',
                        }}
                      >
                        <Building2 size={36} />
                      </div>
                    )}
                    <span className="bfa-about-enclave-tag">{enc.code || 'BFA Residence'}</span>
                  </div>
                  <div className="bfa-about-enclave-content">
                    <span className="bfa-about-enclave-loc">
                      <MapPin size={13} aria-hidden="true" /> {locationText || enc.city || 'Verified Location'}
                    </span>
                    <h3 className="bfa-about-enclave-name">{enc.name}</h3>
                    <span className="bfa-about-enclave-highlights">{highlightsText}</span>
                    <p className="bfa-about-enclave-desc">{enc.description || 'Managed serviced luxury residence.'}</p>
                    <Link to={`/property/${enc.id}`} className="bfa-about-enclave-link">
                      <span>Explore Suites &amp; Facilities</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Hospitality Philosophy & Governance */}
        <section className="bfa-about-philosophy-section">
          <div className="bfa-about-philosophy-card">
            <div className="bfa-about-philosophy-icon">
              <KeyRound size={28} aria-hidden="true" />
            </div>
            <h3 className="bfa-about-philosophy-title">Our Operational Guarantee</h3>
            <p className="bfa-about-philosophy-body">
              Every confirmed reservation at BFA Apartments is treated with utmost confidentiality. All electronic key passcodes remain cryptographically encrypted until verified by the assigned front-office receptionist. We believe true luxury is peaceful, reliable, and respectful of your time and privacy.
            </p>
            <div className="bfa-about-philosophy-actions">
              <Link to="/properties">
                <BfaButton variant="primary" size="md" iconRight={<ArrowRight size={14} />}>
                  Explore Our Residences
                </BfaButton>
              </Link>
              <Link to="/contact">
                <BfaButton variant="outline" size="md">
                  Contact Our Front Desk
                </BfaButton>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Editorial Footer */}
      <PublicFooter />

      {/* Floating Chat Widget */}
      <FloatingChatWidget />

      {/* Booking Modal Fallback */}
      {bookingModalOpen && (
        <BookingModal
          isOpen={bookingModalOpen}
          onClose={() => setBookingModalOpen(false)}
          property={bookingModalProperty}
        />
      )}
    </div>
  );
}
