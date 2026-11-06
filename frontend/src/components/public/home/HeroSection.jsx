import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Building2,
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
import './HeroSection.css';

/**
 * HeroSection — Refined Serviced Living Hero with Formal Real-Time Search Bar
 */
export default function HeroSection({
  properties = [],
  apartments = [],
  onSearch,
  onOpenBooking,
  onViewDetails,
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchWrapRef = useRef(null);

  const heroSlides = [
    {
      id: 1,
      image: ghtExterior,
      name: 'Grand Horizon Tower',
      location: 'Plot 14, Alagbaka GRA Extension, Akure',
      tag: 'Executive Corporate Enclave',
    },
    {
      id: 2,
      image: azureBayExterior,
      name: 'Azure Bay Residences',
      location: 'Block 7, Ijapo Central Estate, Akure',
      tag: 'Waterfront Lagoon & Villa Suites',
    },
    {
      id: 3,
      image: royalPalmsExterior,
      name: 'The Royal Palms Suites',
      location: 'Presidential Boulevard, Oba-Ile Corridor',
      tag: 'Neoclassical Serviced Suites',
    },
  ];

  const currentSlide = heroSlides[activeSlide] || heroSlides[0];

  const handleNextWallpaper = () => {
    setActiveSlide((prev) => (prev + 1) % heroSlides.length);
  };

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter apartments in real-time
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
    if (onOpenBooking) {
      onOpenBooking(matchedProp, apt);
    }
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
    } else {
      const el = document.getElementById('residences');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="bfa-hero-section" aria-label="Welcome to BFA Apartments">
      {/* Background Media with Subtle Parallax & Overlay */}
      <div className="bfa-hero-media-wrapper">
        <img
          src={currentSlide.image}
          alt={`${currentSlide.name} architectural facade in Akure`}
          className="bfa-hero-bg-img"
          fetchPriority="high"
        />
        <div className="bfa-hero-overlay" />
      </div>

      <div className="bfa-hero-content-container">
        {/* Clean, authoritative title - permanent removal of red-marked subline & paragraph */}
        <h1 className="bfa-hero-title">Refined Serviced Living</h1>

        {/* Formal Luxury Search Bar (Replacing previous check availability section) */}
        <div className="bfa-hero-search-wrap" ref={searchWrapRef}>
          <form className="bfa-center-search-box hero-variant" onSubmit={handleSearchSubmit}>
            <span className="bfa-search-icon" aria-hidden="true">
              <Search size={20} />
            </span>
            <input
              type="text"
              className="bfa-center-search-input"
              placeholder="Search apartments, properties, or locations in Akure..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
              title="Switch architecture wallpaper"
              aria-label="Switch architecture wallpaper"
            >
              <ImageIcon size={19} aria-hidden="true" />
            </button>
          </form>

          {/* Autocomplete Dropdown */}
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
                        <span>{apt.property_name} • {apt.city || 'Akure'} ({apt.unit_type || 'Executive Suite'})</span>
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
                        <span>Explore Enclave →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contextual Hospitality Assurance Strip */}
          <div className="bfa-hero-search-guarantee">
            <span className="bfa-guarantee-pill">
              <Zap size={12} aria-hidden="true" /> Guaranteed 24/7 Power
            </span>
            <span className="bfa-guarantee-pill">
              <Wifi size={12} aria-hidden="true" /> Enterprise Fiber Wi-Fi
            </span>
            <span className="bfa-guarantee-pill">
              <ShieldCheck size={12} aria-hidden="true" /> Cryptographically Verified Key Access
            </span>
          </div>
        </div>

        {/* Carousel Slide Indicators & Enclave Switcher */}
        <div className="bfa-hero-slide-nav">
          <span className="bfa-slide-caption">CURRENT ENCLAVE:</span>
          <div className="bfa-slide-buttons" role="tablist" aria-label="Enclave photography slides">
            {heroSlides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={activeSlide === idx}
                className={`bfa-slide-btn ${activeSlide === idx ? 'active' : ''}`}
                onClick={() => setActiveSlide(idx)}
              >
                <span className="bfa-slide-num">0{idx + 1}</span>
                <span className="bfa-slide-name">{slide.name.replace('The ', '')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
