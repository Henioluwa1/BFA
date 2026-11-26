import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  MapPin,
  Image as ImageIcon,
  Zap,
  Wifi,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { formatNaira } from '../../../utils/currency';
import ghtExterior from '../../../assets/ght-exterior.jpg';
import azureBayExterior from '../../../assets/azure-bay-exterior.jpg';
import royalPalmsExterior from '../../../assets/royal-palms-exterior.jpg';
import aptPenthouseView from '../../../assets/apt-penthouse-view.jpg';
import azureBayPool from '../../../assets/azure-bay-pool.jpg';
import royalPalmsCourtyard from '../../../assets/royal-palms-courtyard.jpg';
import './HeroSection.css';

/**
 * HeroSection — Full-Viewport Bottom-Anchored Editorial Stage
 * Inspired by MotionSites editorial architecture, built with BFA assets & CSS.
 */
export default function HeroSection({
  properties = [],
  apartments = [],
  onOpenBooking,
  onViewDetails,
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapRef = useRef(null);
  const heroRef = useRef(null);

  const heroSlides = [
    {
      id: 1,
      image: ghtExterior,
      insetImage: aptPenthouseView,
      insetLabel: 'Skyline Penthouse Salon',
      name: 'Grand Horizon Tower',
      location: 'Alagbaka GRA, Akure',
      tag: 'Executive High-Rise',
    },
    {
      id: 2,
      image: azureBayExterior,
      insetImage: azureBayPool,
      insetLabel: 'Private Lagoon & Poolside',
      name: 'Azure Bay Residences',
      location: 'Ijapo Estate, Akure',
      tag: 'Waterfront Enclave',
    },
    {
      id: 3,
      image: royalPalmsExterior,
      insetImage: royalPalmsCourtyard,
      insetLabel: 'Neoclassical Courtyard',
      name: 'The Royal Palms Suites',
      location: 'Oba-Ile Corridor, Akure',
      tag: 'Presidential Suites',
    },
  ];

  const currentSlide = heroSlides[activeSlide] || heroSlides[0];

  const handleNextWallpaper = () => {
    setActiveSlide((prev) => (prev + 1) % heroSlides.length);
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mediaQuery?.matches) return;

    let rafId = null;
    const updateScrollVar = () => {
      rafId = null;
      if (!heroRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height, 1)));
      heroRef.current.style.setProperty('--bfa-hero-scroll', progress.toFixed(4));
    };

    const onScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(updateScrollVar);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateScrollVar();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? apartments.filter((apt) => {
        return (
          apt.unit_name?.toLowerCase().includes(q) ||
          apt.unit_number?.toLowerCase().includes(q) ||
          apt.property_name?.toLowerCase().includes(q) ||
          apt.room_type?.toLowerCase().includes(q) ||
          apt.address?.toLowerCase().includes(q) ||
          apt.city?.toLowerCase().includes(q)
        );
      })
    : [];

  const handleSelectUnit = (apt) => {
    setSearchFocused(false);
    const matchedProp = properties.find((p) => String(p.id) === String(apt.property_id)) || null;
    if (onOpenBooking) onOpenBooking(matchedProp, apt);
  };

  const handleSelectPropertySuggestion = (prop) => {
    setSearchFocused(false);
    if (onViewDetails) {
      onViewDetails(prop);
    } else {
      const el = document.getElementById('residences');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleSelectUnit(searchResults[0]);
      return;
    }
    if (q) {
      const matchedProp = properties.find((p) =>
        p.name?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q)
      );
      if (matchedProp) {
        handleSelectPropertySuggestion(matchedProp);
        return;
      }
    }
    const el = document.getElementById('residences');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      ref={heroRef}
      className="bfa-hero-stage"
      aria-label="Welcome to BFA Apartments"
    >
      {/* Full-Bleed Architectural Media */}
      <div className="bfa-hero-media-wrapper">
        <img
          key={currentSlide.id}
          src={currentSlide.image}
          alt={`${currentSlide.name} architectural facade in Akure`}
          className="bfa-hero-bg-img"
          fetchPriority="high"
          decoding="async"
        />
        <div className="bfa-hero-scrim" />
      </div>

      {/* Bottom-Anchored Asymmetric Editorial Grid */}
      <div className="bfa-hero-editorial-container">
        <div className="bfa-hero-split">
          {/* Left Column: Editorial Headline, Search & Primary Actions */}
          <div className="bfa-hero-left">
            <div className="bfa-hero-eyebrow-row">
              <span className="bfa-hero-eyebrow">
                <MapPin size={12} aria-hidden="true" />
                Alagbaka GRA • Ijapo Estate • Oba-Ile, Akure
              </span>
            </div>

            <h1 className="bfa-hero-serif-title">
              Refined Serviced <br className="bfa-hero-br" />
              <em>Living in Akure</em>
            </h1>

            <p className="bfa-hero-editorial-lead">
              Autonomous luxury residences engineered with 24/7 dual-grid power, dedicated fiber Wi-Fi 6, and front-desk verified stays.
            </p>

            {/* Real-Time Search Bar */}
            <div className="bfa-hero-search-wrap" ref={searchWrapRef}>
              <form className="bfa-center-search-box hero-variant" onSubmit={handleSearchSubmit}>
                <span className="bfa-search-icon" aria-hidden="true">
                  <Search size={18} />
                </span>
                <input
                  type="text"
                  className="bfa-center-search-input"
                  placeholder="Search suites, enclaves, or amenities..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchFocused(true);
                  }}
                  onFocus={() => setSearchFocused(true)}
                  aria-label="Search apartments, properties, or locations"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="bfa-search-clear-btn"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNextWallpaper}
                  className="bfa-nav-wallpaper-btn"
                  title="Switch enclave photography"
                  aria-label="Switch enclave photography"
                >
                  <ImageIcon size={17} aria-hidden="true" />
                </button>
              </form>

              {searchFocused && (
                <div className="bfa-live-search-dropdown hero-dropdown" role="listbox">
                  {searchResults.length > 0 ? (
                    <>
                      <div className="bfa-search-dropdown-header">
                        <span>Available Suites Matching "{searchQuery}"</span>
                      </div>
                      {searchResults.slice(0, 6).map((apt) => (
                        <div
                          key={apt.id}
                          className="bfa-search-result-row"
                          onClick={() => handleSelectUnit(apt)}
                          role="option"
                          tabIndex={0}
                        >
                          <div className="bfa-result-info">
                            <strong>Unit {apt.unit_number} — {apt.unit_name}</strong>
                            <span>{apt.property_name} • {apt.city || 'Akure'}</span>
                          </div>
                          <div className="bfa-result-rate">
                            {formatNaira(apt.rate_per_night)}<small>/nt</small>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : searchQuery.trim() ? (
                    <div className="bfa-search-no-results">
                      No suites or residences match "{searchQuery}".
                    </div>
                  ) : (
                    <div className="bfa-search-suggestions">
                      <div className="bfa-search-dropdown-header">
                        <span>Curated Enclaves in Akure</span>
                      </div>
                      {properties.map((prop) => (
                        <div
                          key={prop.id}
                          className="bfa-search-result-row"
                          onClick={() => handleSelectPropertySuggestion(prop)}
                        >
                          <div className="bfa-result-info">
                            <strong>{prop.name}</strong>
                            <span>{prop.address || 'Akure, Ondo State'}</span>
                          </div>
                          <div className="bfa-result-action">
                            <span>Explore →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Immediate Action Row */}
            <div className="bfa-hero-cta-row">
              <button
                type="button"
                className="bfa-hero-primary-cta"
                onClick={() => onOpenBooking && onOpenBooking()}
              >
                <span>Reserve a Suite</span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
              <Link to="/properties" className="bfa-hero-secondary-cta">
                <span>Explore All Enclaves</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Layered Architectural Enclave Selector */}
          <div className="bfa-hero-right">
            <div className="bfa-hero-inset-card">
              <div className="bfa-hero-inset-media">
                <img
                  key={`inset-${currentSlide.id}`}
                  src={currentSlide.insetImage}
                  alt={currentSlide.insetLabel}
                  className="bfa-hero-inset-img"
                  decoding="async"
                />
                <span className="bfa-hero-inset-badge">{currentSlide.tag}</span>
              </div>
              <div className="bfa-hero-inset-body">
                <span className="bfa-hero-inset-loc">{currentSlide.location}</span>
                <strong className="bfa-hero-inset-name">{currentSlide.name}</strong>
                <span className="bfa-hero-inset-sub">{currentSlide.insetLabel}</span>
              </div>
            </div>

            <div className="bfa-hero-slide-nav" role="tablist" aria-label="Enclave photography slides">
              {heroSlides.map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSlide === idx}
                  className={`bfa-slide-tab ${activeSlide === idx ? 'active' : ''}`}
                  onClick={() => setActiveSlide(idx)}
                >
                  <span className="bfa-slide-num">0{idx + 1}</span>
                  <span className="bfa-slide-name">{slide.name.replace('The ', '')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Assurance Hairline */}
        <div className="bfa-hero-assurance-bar">
          <span><Zap size={13} aria-hidden="true" /> 24/7 Dual-Grid Power</span>
          <span><Wifi size={13} aria-hidden="true" /> 500 Mbps Fiber Wi-Fi 6</span>
          <span><ShieldCheck size={13} aria-hidden="true" /> Cryptographically Verified Stays</span>
        </div>
      </div>
    </section>
  );
}
