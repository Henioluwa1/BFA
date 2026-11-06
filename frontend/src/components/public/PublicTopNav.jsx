import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Building2,
  Calendar,
  ShieldCheck,
  Phone,
  Menu,
  X,
  MapPin,
  CloudSun,
  ArrowRight,
  Compass,
} from 'lucide-react';
import { BfaButton } from './primitives';
import BookingTrackingModal from './BookingTrackingModal';
import './PublicTopNav.css';

/**
 * PublicTopNav — Premium Editorial Hospitality Navigation Bar
 * Responsive, accessible, high-contrast, WCAG 2.2 AA compliant.
 */
export default function PublicTopNav({
  activePage,
  activeTab,
  onOpenBooking,
  onVerifyClick,
  onOpenTracking,
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  onBrandClick,
  className = '',
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [internalTrackingOpen, setInternalTrackingOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const menuRef = useRef(null);
  const mobileToggleRef = useRef(null);

  // Normalize current page identifier
  const current = activePage || activeTab || (
    location.pathname === '/' ? 'home' :
    location.pathname.startsWith('/properties') || location.pathname.startsWith('/property') || location.pathname.startsWith('/explore') ? 'properties' :
    location.pathname.startsWith('/about') ? 'about' :
    location.pathname.startsWith('/contact') ? 'contact' : ''
  );

  // Scroll listener for subtle background blur / elevation
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Click outside and Escape key to close mobile menu
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        mobileMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        !mobileToggleRef.current?.contains(e.target)
      ) {
        setMobileMenuOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
        mobileToggleRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleBrandClick = (e) => {
    if (onBrandClick) {
      onBrandClick(e);
    } else {
      navigate('/');
    }
  };

  const handleOpenTrack = () => {
    setMobileMenuOpen(false);
    if (onVerifyClick) {
      onVerifyClick();
    } else if (onOpenTracking) {
      onOpenTracking();
    } else {
      navigate('/track');
    }
  };

  const handleBookingClick = () => {
    setMobileMenuOpen(false);
    if (onOpenBooking) {
      onOpenBooking();
    } else {
      navigate('/properties');
    }
  };

  return (
    <>
      <header
        className={`bfa-public-nav ${isScrolled ? 'bfa-public-nav--scrolled' : ''} ${className}`}
        role="banner"
      >
        <div className="bfa-public-nav-container">
          {/* Brand Mark & Identity */}
          <div
            className="bfa-public-nav-brand"
            onClick={handleBrandClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleBrandClick(e);
              }
            }}
            aria-label="BFA Apartments — Return to Homepage"
          >
            <span className="bfa-brand-glyph" aria-hidden="true">⠿</span>
            <div className="bfa-brand-copy">
              <span className="bfa-brand-name">BFA APARTMENTS</span>
              <span className="bfa-brand-tagline">SERVICED RESIDENCES • AKURE</span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="bfa-public-nav-links" aria-label="Main Public Navigation">
            <Link
              to="/"
              className={`bfa-nav-link ${current === 'home' ? 'bfa-nav-link--active' : ''}`}
            >
              Home
            </Link>
            <Link
              to="/properties"
              className={`bfa-nav-link ${current === 'properties' || current === 'residences' ? 'bfa-nav-link--active' : ''}`}
            >
              Residences
            </Link>
            <Link
              to="/about"
              className={`bfa-nav-link ${current === 'about' ? 'bfa-nav-link--active' : ''}`}
            >
              About Us
            </Link>
            <Link
              to="/contact"
              className={`bfa-nav-link ${current === 'contact' ? 'bfa-nav-link--active' : ''}`}
            >
              Contact Us
            </Link>
          </nav>

          {/* Desktop Actions Group */}
          <div className="bfa-public-nav-actions">
            {/* Verified Location Indicator */}
            <div
              className="bfa-nav-location-badge"
              title="Verified Location: Akure, Ondo State"
              aria-label="Location Akure, Ondo State"
            >
              <MapPin size={13} aria-hidden="true" />
              <span>Akure, Ondo State</span>
            </div>

            {/* Track Reservation Button */}
            <button
              type="button"
              className="bfa-nav-track-btn"
              onClick={handleOpenTrack}
              title="Track existing reservation status & electronic key"
              aria-label="Track your reservation"
            >
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Track Stay</span>
            </button>

            {/* Primary Reserve / Book Action */}
            <BfaButton
              variant="primary"
              size="sm"
              onClick={handleBookingClick}
              iconRight={<ArrowRight size={13} />}
            >
              Book Stay
            </BfaButton>
          </div>

          {/* Mobile Right Controls: Compact Track + Burger Toggle */}
          <div className="bfa-public-nav-mobile-controls">
            <button
              type="button"
              className="bfa-nav-track-mobile-pill"
              onClick={handleOpenTrack}
              aria-label="Track your stay"
            >
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Track</span>
            </button>

            <button
              ref={mobileToggleRef}
              type="button"
              className="bfa-mobile-menu-toggle"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="bfa-mobile-drawer"
              aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Slide-down Drawer */}
        {mobileMenuOpen && (
          <div
            id="bfa-mobile-drawer"
            className="bfa-mobile-drawer"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
          >
            <div className="bfa-mobile-drawer-inner">
              <div className="bfa-mobile-drawer-header">
                <span className="bfa-drawer-brand">⠿ BFA APARTMENTS</span>
                <span className="bfa-drawer-sub">Akure Enclaves</span>
              </div>

              <nav className="bfa-mobile-drawer-nav" aria-label="Mobile Links">
                <Link
                  to="/"
                  className={`bfa-mobile-nav-link ${current === 'home' ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Compass size={17} aria-hidden="true" />
                  <span>Home</span>
                </Link>
                <Link
                  to="/properties"
                  className={`bfa-mobile-nav-link ${current === 'properties' || current === 'residences' ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Building2 size={17} aria-hidden="true" />
                  <span>Curated Residences</span>
                </Link>
                <Link
                  to="/about"
                  className={`bfa-mobile-nav-link ${current === 'about' ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <MapPin size={17} aria-hidden="true" />
                  <span>About Us</span>
                </Link>
                <Link
                  to="/contact"
                  className={`bfa-mobile-nav-link ${current === 'contact' ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Phone size={17} aria-hidden="true" />
                  <span>Contact Us</span>
                </Link>
                <button
                  type="button"
                  className="bfa-mobile-nav-link bfa-mobile-nav-link--track"
                  onClick={handleOpenTrack}
                >
                  <ShieldCheck size={17} aria-hidden="true" />
                  <span>Track Your Reservation</span>
                </button>
              </nav>

              <div className="bfa-mobile-drawer-cta">
                <BfaButton
                  variant="primary"
                  size="md"
                  onClick={handleBookingClick}
                  iconRight={<ArrowRight size={15} />}
                  className="bfa-mobile-book-btn"
                >
                  Book a Residence
                </BfaButton>

                <div className="bfa-drawer-footer-info">
                  <div className="bfa-drawer-contact-line">
                    <Phone size={13} aria-hidden="true" />
                    <span>Concierge: +234 800 232 4000</span>
                  </div>
                  <div className="bfa-drawer-contact-line">
                    <MapPin size={13} aria-hidden="true" />
                    <span>Alagbaka GRA • Ijapo • Oba-Ile</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Internal Tracking Modal Fallback if not passed from parent */}
      {internalTrackingOpen && (
        <BookingTrackingModal
          isOpen={internalTrackingOpen}
          onClose={() => setInternalTrackingOpen(false)}
        />
      )}
    </>
  );
}
