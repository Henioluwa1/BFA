import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icons8Icon from './Icons8Icon';
import './PublicTopNav.css';

export default function PublicTopNav({
  activePage = 'home',
  isScrolled = true,
  searchVisible = true,
  searchQuery = '',
  setSearchQuery,
  onSearchSubmit,
  onNextWallpaper,
  onBrandClick,
  onVerifyClick,
  searchContainerRef,
  children,
}) {
  const navigate = useNavigate();
  const [singleNavOpen, setSingleNavOpen] = useState(false);
  const singleNavMenuRef = useRef(null);

  // Close flyout menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        singleNavMenuRef.current &&
        !singleNavMenuRef.current.contains(event.target)
      ) {
        setSingleNavOpen(false);
      }
    }
    if (singleNavOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [singleNavOpen]);

  const handleBrandClickInternal = (e) => {
    if (onBrandClick) {
      onBrandClick(e);
    } else {
      navigate('/');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (onSearchSubmit) {
        onSearchSubmit(searchQuery);
      } else {
        navigate(`/?search=${encodeURIComponent(searchQuery)}`);
      }
    }
  };

  return (
    <header className="bfa-fixed-nav-bar">
      <div className="bfa-nav-main-row">
        {/* Left: ⠿ BFA APARTMENTS Serviced Residences */}
        <div
          className="bfa-edge-brand"
          onClick={handleBrandClickInternal}
          role="button"
          tabIndex={0}
        >
          <button
            type="button"
            className="bfa-grid-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              setSingleNavOpen((prev) => !prev);
            }}
            title="BFA Portals & Navigation"
            aria-label="Toggle Portal Services Menu"
          >
            ⠿
          </button>
          <div className="bfa-edge-brand-text">
            <span className="bfa-edge-brand-name">BFA APARTMENTS</span>
            <span className="bfa-edge-brand-sub">Serviced Residences</span>
          </div>
        </div>

        {/* Middle: Search Bar Input (Fixed at top, zero background) */}
        <div
          className={`bfa-nav-center-search ${searchVisible ? 'visible' : 'hidden'}`}
          ref={searchContainerRef}
        >
          <div className="bfa-center-search-box">
            <span className="bfa-search-icon">
              <Icons8Icon name="search" variant="white" size={17} alt="Search" />
            </span>
            <input
              type="text"
              className="bfa-center-search-input"
              placeholder="Search apartments, properties, or locations in Akure..."
              value={searchQuery}
              onChange={(e) => setSearchQuery && setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Search apartments and properties"
            />
            {onNextWallpaper && (
              <button
                type="button"
                onClick={onNextWallpaper}
                className="bfa-nav-wallpaper-btn"
                title="Change apartment wallpaper"
                aria-label="Change wallpaper"
              >
                <Icons8Icon name="wallpaper" variant="white" size={18} alt="Wallpaper" />
              </button>
            )}
          </div>

          {/* Autocomplete dropdown children if supplied */}
          {children}
        </div>

        {/* Right: Unified Single Navigation Element (Akure Weather + Portal Menu + Flyout) */}
        <div className="bfa-single-nav-control" ref={singleNavMenuRef}>
          <button
            type="button"
            className={`bfa-single-nav-pill ${singleNavOpen ? 'active' : ''}`}
            onClick={() => setSingleNavOpen((prev) => !prev)}
            aria-expanded={singleNavOpen}
            aria-label="Toggle Portal Services Menu"
            title="BFA Portals & Navigation"
          >
            <div className="bfa-nav-weather-badge">
              <span className="bfa-weather-city">Akure</span>
              <Icons8Icon name="weather" size={18} alt="Weather" />
              <span className="bfa-weather-temp">29°C</span>
            </div>
            <span className="bfa-nav-sep" aria-hidden="true">|</span>
            <span className="bfa-nav-menu-txt">Portal Menu</span>
            <span className="bfa-nav-menu-icon">
              {singleNavOpen ? (
                <Icons8Icon name="close" variant="white" size={14} alt="Close" />
              ) : (
                <Icons8Icon name="menu" variant="white" size={15} alt="Menu" />
              )}
            </span>
          </button>

          {/* Glassmorphism Dropdown Flyout */}
          {singleNavOpen && (
            <div className="bfa-single-nav-flyout" role="menu">
              <div className="bfa-flyout-header">
                <span className="bfa-flyout-tag">✦ BFA RESIDENCES & PORTAL</span>
                <span className="bfa-flyout-loc">Akure, Ondo State</span>
              </div>

              <div className="bfa-flyout-links">
                {activePage !== 'home' && (
                  <Link
                    to="/"
                    className="bfa-flyout-link"
                    onClick={() => setSingleNavOpen(false)}
                    role="menuitem"
                  >
                    <div className="bfa-flyout-icon-box">
                      <Icons8Icon name="building" variant="white" size={18} alt="Home" />
                    </div>
                    <div className="bfa-flyout-link-content">
                      <strong>Main Public Portal</strong>
                      <small>Apartment booking & live portfolio</small>
                    </div>
                  </Link>
                )}

                <Link
                  to="/login"
                  className="bfa-flyout-link highlighted"
                  onClick={() => setSingleNavOpen(false)}
                  role="menuitem"
                >
                  <div className="bfa-flyout-icon-box">
                    <Icons8Icon name="login" variant="white" size={18} alt="Login" />
                  </div>
                  <div className="bfa-flyout-link-content">
                    <strong>Staff Portal Login →</strong>
                    <small>Administrative, front desk & operations access</small>
                  </div>
                </Link>

                {onVerifyClick ? (
                  <button
                    type="button"
                    className="bfa-flyout-link"
                    onClick={() => {
                      setSingleNavOpen(false);
                      onVerifyClick();
                    }}
                    role="menuitem"
                  >
                    <div className="bfa-flyout-icon-box">
                      <Icons8Icon name="shield-check" variant="white" size={18} alt="Verify" />
                    </div>
                    <div className="bfa-flyout-link-content">
                      <strong>Verify Stay Authenticity</strong>
                      <small>Cryptographic ledger verification for reservations</small>
                    </div>
                  </button>
                ) : (
                  <Link
                    to="/#verify"
                    className="bfa-flyout-link"
                    onClick={() => setSingleNavOpen(false)}
                    role="menuitem"
                  >
                    <div className="bfa-flyout-icon-box">
                      <Icons8Icon name="shield-check" variant="white" size={18} alt="Verify" />
                    </div>
                    <div className="bfa-flyout-link-content">
                      <strong>Verify Stay Authenticity</strong>
                      <small>Cryptographic ledger verification for reservations</small>
                    </div>
                  </Link>
                )}

                <Link
                  to="/about"
                  className={`bfa-flyout-link ${activePage === 'about' ? 'primary' : ''}`}
                  onClick={() => setSingleNavOpen(false)}
                  role="menuitem"
                >
                  <div className="bfa-flyout-icon-box">
                    <Icons8Icon name="gallery" variant="white" size={18} alt="Showcase" />
                  </div>
                  <div className="bfa-flyout-link-content">
                    <strong>Apartment Showcase & Gallery</strong>
                    <small>Explore full photography of all suites & buildings</small>
                  </div>
                </Link>

                <Link
                  to="/contact"
                  className={`bfa-flyout-link ${activePage === 'contact' ? 'primary' : ''}`}
                  onClick={() => setSingleNavOpen(false)}
                  role="menuitem"
                >
                  <div className="bfa-flyout-icon-box">
                    <Icons8Icon name="phone" variant="white" size={18} alt="Contact" />
                  </div>
                  <div className="bfa-flyout-link-content">
                    <strong>Contact Desk</strong>
                    <small>Direct front desk, WhatsApp & phone support</small>
                  </div>
                </Link>
              </div>

              <div className="bfa-flyout-footer">
                <span>
                  <Icons8Icon name="location" variant="white" size={12} alt="Location" /> Alagbaka GRA & Ijapo Central, Akure
                </span>
                <span>
                  <Icons8Icon name="lightning" variant="white" size={12} alt="Power" /> 24/7 Redundant Power
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

