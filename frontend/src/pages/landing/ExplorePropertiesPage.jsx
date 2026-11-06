import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  MapPin,
  ShieldCheck,
  Zap,
  Wifi,
  Waves,
  Calendar,
  Sparkles,
  ArrowRight,
  Eye,
  CheckCircle2,
  Clock,
  Phone,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { publicService } from '../../services/api';
import { formatNaira } from '../../utils/currency';
import PublicTopNav from '../../components/public/PublicTopNav';
import PublicFooter from '../../components/public/home/PublicFooter';
import FloatingChatWidget from '../../components/public/FloatingChatWidget';
import BookingModal from '../../components/public/BookingModal';
import BookingTrackingModal from '../../components/public/BookingTrackingModal';
import ApartmentDetailModal, {
  getPropertyPhoto,
  getRoomTypePhoto,
} from '../../components/public/ApartmentDetailModal';
import {
  BfaButton,
  BfaBadge,
  BfaCard,
} from '../../components/public/primitives';

import ghtExterior from '../../assets/ght-exterior.jpg';
import azureBayExterior from '../../assets/azure-bay-exterior.jpg';
import royalPalmsExterior from '../../assets/royal-palms-exterior.jpg';

import '../../styles/hospitalityTokens.css';
import '../../styles/exploreProperties.css';

export default function ExplorePropertiesPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFacilityFilter, setActiveFacilityFilter] = useState('ALL');

  // Booking Modal State
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedUnitForBooking, setSelectedUnitForBooking] = useState(null);
  const [selectedPropertyForBooking, setSelectedPropertyForBooking] = useState(null);

  // Reservation Tracking Modal State
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);

  // Apartment Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailPropertyId, setDetailPropertyId] = useState(1);
  const [selectedRoomTypeForModal, setSelectedRoomTypeForModal] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadProperties() {
      try {
        setLoading(true);
        setError('');
        const res = await publicService.getProperties();
        const propsData = res?.data || [];

        // Fetch detail for each active property to resolve room-level availability & currently bookable rates
        const detailedProps = await Promise.all(
          propsData.map(async (prop) => {
            try {
              const detailRes = await publicService.getProperty(prop.id);
              const units = detailRes?.data?.units || [];
              const availableUnits = units.filter((u) => u.status === 'AVAILABLE');
              const cheapestAvailable = availableUnits.length > 0
                ? Math.min(...availableUnits.map((u) => parseFloat(u.rate_per_night)).filter((n) => !isNaN(n) && n > 0))
                : null;
              return {
                ...prop,
                detailedUnits: units,
                cheapestAvailableRate: cheapestAvailable,
              };
            } catch {
              return {
                ...prop,
                detailedUnits: [],
                cheapestAvailableRate: null,
              };
            }
          })
        );

        if (isMounted) {
          setProperties(detailedProps);
        }
      } catch (err) {
        if (isMounted) {
          setError('Unable to load properties. Please check your connection.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadProperties();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenBooking = async (property, unit = null) => {
    setSelectedPropertyForBooking(property);
    if (unit) {
      setSelectedUnitForBooking(unit);
      setBookingModalOpen(true);
      return;
    }

    try {
      const detailRes = await publicService.getProperty(property.id);
      const units = detailRes?.data?.units || [];
      const firstAvailable = units.find((u) => u.status === 'AVAILABLE') || units[0];
      if (firstAvailable) {
        setSelectedUnitForBooking({
          id: firstAvailable.id,
          unit_name: firstAvailable.unit_name || `${property.name} Suite`,
          rate_per_night: firstAvailable.rate_per_night ? Number(firstAvailable.rate_per_night) : undefined,
        });
      } else {
        setSelectedUnitForBooking(null);
      }
    } catch {
      setSelectedUnitForBooking(null);
    }
    setBookingModalOpen(true);
  };

  const handleOpenApartmentModal = (propertyId, roomType = null) => {
    setDetailPropertyId(propertyId);
    setSelectedRoomTypeForModal(roomType);
    setDetailModalOpen(true);
  };

  // Location filter options
  const locations = [
    { id: 'ALL', label: 'All Enclaves' },
    { id: 'Alagbaka', label: 'Alagbaka GRA' },
    { id: 'Ijapo', label: 'Ijapo Estate' },
    { id: 'Oba-Ile', label: 'Oba-Ile / Airport Corridor' },
  ];

  const filteredProperties = properties.filter((p) => {
    if (selectedLocation !== 'ALL') {
      const addr = `${p.address || ''} ${p.city || ''} ${p.state || ''}`.toLowerCase();
      if (!addr.includes(selectedLocation.toLowerCase())) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (p.name || '').toLowerCase();
      const addr = `${p.address || ''} ${p.city || ''} ${p.state || ''}`.toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const amns = Array.isArray(p.amenities)
        ? p.amenities.join(' ').toLowerCase()
        : typeof p.amenities === 'string'
        ? p.amenities.toLowerCase()
        : '';
      const match = name.includes(q) || addr.includes(q) || desc.includes(q) || amns.includes(q);
      if (!match) return false;
    }
    return true;
  });

  const getPropertyFallbackPhoto = (id) => {
    if (id === 1) return ghtExterior;
    if (id === 2) return azureBayExterior;
    return royalPalmsExterior;
  };

  const getVerifiedAmenities = (amenities) => {
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

  const renderAmenityIcon = (label) => {
    const l = (label || '').toLowerCase();
    if (l.includes('power') || l.includes('solar') || l.includes('electricity')) {
      return <Zap size={12} aria-hidden="true" />;
    }
    if (l.includes('wifi') || l.includes('internet') || l.includes('fiber')) {
      return <Wifi size={12} aria-hidden="true" />;
    }
    if (l.includes('pool') || l.includes('water') || l.includes('lagoon') || l.includes('jetty')) {
      return <Waves size={12} aria-hidden="true" />;
    }
    if (l.includes('security') || l.includes('biometric') || l.includes('guard')) {
      return <ShieldCheck size={12} aria-hidden="true" />;
    }
    return <Sparkles size={12} aria-hidden="true" />;
  };

  return (
    <div className="bfa-hospitality-scope bfa-explore-page">
      {/* Top Navigation */}
      <PublicTopNav activeTab="residences" onOpenBooking={() => handleOpenBooking(properties[0] || { id: 1, name: 'Grand Horizon Tower' })} />

      {/* Main Exploration Header */}
      <header className="bfa-explore-hero">
        <div className="bfa-explore-hero-inner">
          <h1 className="bfa-explore-hero-title">
            Explore Serviced Residences &amp; Private Enclaves
          </h1>

          {/* Real-Time Search Bar */}
          <div className="bfa-explore-search-wrapper">
            <div className="bfa-explore-search-input-box">
              <Search className="bfa-search-icon" size={18} aria-hidden="true" />
              <input
                type="text"
                className="bfa-explore-search-input"
                placeholder="Search residences by enclave, address, or amenity (e.g. Alagbaka, fiber, pool)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search residences by enclave, address, or amenity"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="bfa-search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Quick Filter Bar */}
          <div className="bfa-explore-filter-bar" role="tablist" aria-label="Filter residences by location">
            {locations.map((loc) => (
              <button
                key={loc.id}
                role="tab"
                aria-selected={selectedLocation === loc.id}
                className={`bfa-explore-filter-btn ${selectedLocation === loc.id ? 'active' : ''}`}
                onClick={() => setSelectedLocation(loc.id)}
              >
                {loc.label}
              </button>
            ))}
          </div>

          {/* Active Filter Summary */}
          {(selectedLocation !== 'ALL' || searchQuery.trim()) && (
            <div className="bfa-filter-status-row">
              <span className="bfa-filter-status-text">
                Showing {filteredProperties.length} of {properties.length} residences
                {selectedLocation !== 'ALL' && ` in ${locations.find((l) => l.id === selectedLocation)?.label}`}
                {searchQuery.trim() && ` matching "${searchQuery}"`}
              </span>
              <button
                type="button"
                className="bfa-reset-filters-btn"
                onClick={() => {
                  setSelectedLocation('ALL');
                  setSearchQuery('');
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Residences Grid Section */}
      <main className="bfa-explore-container">
        {loading ? (
          <div className="bfa-explore-loading">
            <div className="bfa-explore-spinner" />
            <p>Loading curated properties...</p>
          </div>
        ) : error ? (
          <div className="bfa-explore-error">
            <p>{error}</p>
            <BfaButton variant="secondary" onClick={() => window.location.reload()}>
              Retry
            </BfaButton>
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="bfa-explore-empty-search">
            <Search size={36} color="var(--bfa-lux-text-muted, #8c948e)" />
            <h3>No matching residences found</h3>
            <p>We could not find any residences matching your current search criteria.</p>
            <BfaButton
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedLocation('ALL');
                setSearchQuery('');
              }}
            >
              Clear all filters
            </BfaButton>
          </div>
        ) : (
          <div className="bfa-explore-grid">
            {filteredProperties.map((prop) => {
              const photo = getPropertyFallbackPhoto(prop.id);
              const parsedRate = prop.starting_rate != null ? parseFloat(prop.starting_rate) : null;
              const hasAuthoritativeRate = parsedRate !== null && !isNaN(parsedRate) && parsedRate > 0;
              const verifiedAmenities = getVerifiedAmenities(prop.amenities);
              const rawAvail = prop.available_units;
              const availNum = rawAvail !== null && rawAvail !== undefined && rawAvail !== '' ? Number(rawAvail) : null;
              const hasAvailabilityData = availNum !== null && !isNaN(availNum);

              return (
                <article key={prop.id} className="bfa-property-card-wrapper">
                  <BfaCard variant="default" elevation="sm" interactive className="bfa-property-card">
                    {/* Media Header */}
                    <div className="bfa-property-card-media">
                      <img
                        src={photo}
                        alt={`${prop.name} exterior architecture`}
                        className="bfa-property-card-img"
                        loading="lazy"
                      />
                      <div className="bfa-property-card-overlay">
                        <BfaBadge variant="forest" size="sm" icon={<ShieldCheck size={12} />}>
                          {prop.code || 'BFA'} • Verified Enclave
                        </BfaBadge>
                        {hasAvailabilityData && (
                          availNum > 0 ? (
                            <BfaBadge variant="success" size="sm">
                              Units Available
                            </BfaBadge>
                          ) : (
                            <BfaBadge variant="error" size="sm">
                              Currently Unavailable
                            </BfaBadge>
                          )
                        )}
                      </div>
                      <span className="bfa-card-vis-pill">Architectural Visualization</span>
                    </div>

                    {/* Content Body */}
                    <div className="bfa-property-card-body">
                      <div className="bfa-property-card-topline">
                        <span className="bfa-property-card-location">
                          <MapPin size={13} aria-hidden="true" />
                          {prop.address || 'Akure, Ondo State'}
                        </span>
                        <div className="bfa-property-card-checkin">
                          <Clock size={12} aria-hidden="true" />
                          <span>Check-in: {prop.check_in_time || '14:00'}</span>
                        </div>
                      </div>

                      <h2 className="bfa-property-card-title">{prop.name}</h2>
                      <p className="bfa-property-card-desc">
                        {prop.description || 'Executive luxury serviced residence with 24/7 power, enterprise fiber internet, and bespoke hospitality.'}
                      </p>

                      {/* Verified Enclave Amenities */}
                      <div className={`bfa-property-card-amenities ${verifiedAmenities.length === 0 ? 'bfa-amenities-empty' : ''}`}>
                        {verifiedAmenities.length > 0 ? (
                          verifiedAmenities.map((amenity, idx) => (
                            <span key={`${prop.id}-amenity-${idx}`} className="bfa-amenity-chip">
                              {renderAmenityIcon(amenity)} {amenity}
                            </span>
                          ))
                        ) : (
                          <span
                            className="bfa-amenity-chip bfa-amenity-suite-verified"
                            title="24/7 dual-grid solar power, fiber Wi-Fi 6, and climate control provisioned within individual suites"
                          >
                            <Sparkles size={12} aria-hidden="true" /> Suite-specific facilities • Inquire at Front Desk
                          </span>
                        )}
                      </div>

                      {/* Card Bottom: Pricing & Actions */}
                      <div className="bfa-property-card-footer">
                        <div className="bfa-property-card-price">
                          {prop.cheapestAvailableRate != null ? (
                            <>
                              <span className="bfa-price-caption">AVAILABLE FROM</span>
                              <span className="bfa-price-figure">
                                {formatNaira(prop.cheapestAvailableRate)}
                                <small className="bfa-price-period"> /night</small>
                              </span>
                              {hasAuthoritativeRate && parsedRate < prop.cheapestAvailableRate && (
                                <span className="bfa-price-catalog-note">
                                  Base tiers from {formatNaira(parsedRate)} occupied
                                </span>
                              )}
                            </>
                          ) : hasAuthoritativeRate ? (
                            <>
                              <span className="bfa-price-caption">CATALOG STARTING RATE</span>
                              <span className="bfa-price-figure">
                                {formatNaira(parsedRate)}
                                <small className="bfa-price-period"> /night</small>
                              </span>
                              {hasAvailabilityData && availNum === 0 && (
                                <span className="bfa-price-catalog-note">
                                  Currently fully booked
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="bfa-price-caption">RATES &amp; SUITES</span>
                              <span className="bfa-price-notice">Select suite to view rates</span>
                            </>
                          )}
                        </div>

                        <div className="bfa-property-card-actions">
                          <Link
                            to={`/property/${prop.id}`}
                            className="bfa-explore-detail-link"
                          >
                            <BfaButton variant="outline" size="sm" iconRight={<ArrowRight size={14} />}>
                              View Property
                            </BfaButton>
                          </Link>
                          <BfaButton
                            variant="primary"
                            size="sm"
                            disabled={hasAvailabilityData && availNum === 0}
                            onClick={() => handleOpenBooking(prop)}
                          >
                            {hasAvailabilityData && availNum === 0 ? 'Fully Booked' : 'Book Stay'}
                          </BfaButton>
                        </div>
                      </div>
                    </div>
                  </BfaCard>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Guest Assurance Guarantee Section */}
      <section className="bfa-explore-assurance">
        <div className="bfa-assurance-inner">
          <div className="bfa-assurance-card">
            <Zap className="bfa-assurance-icon" size={24} />
            <h3>Uninterrupted Dual-Grid Power</h3>
            <p>Heavy-duty Cummins diesel generation coupled to high-capacity solar inverters guarantees zero downtime across all enclaves.</p>
          </div>
          <div className="bfa-assurance-card">
            <ShieldCheck className="bfa-assurance-icon" size={24} />
            <h3>Cryptographic Stay Verification</h3>
            <p>Front-desk verified payment reconciliation with electronic key codes revealed only upon authorized confirmation.</p>
          </div>
          <div className="bfa-assurance-card">
            <Phone className="bfa-assurance-icon" size={24} />
            <h3>Dedicated 24/7 Concierge</h3>
            <p>Every resident enjoys direct access to property managers, housekeeping dispatch, and corporate airport chauffeur transfers.</p>
          </div>
        </div>
      </section>

      {/* Unified Public Footer with Authoritative System Settings & Tracking */}
      <PublicFooter onOpenTracking={() => setTrackingModalOpen(true)} />

      {/* Booking Modal */}
      {bookingModalOpen && selectedPropertyForBooking && (
        <BookingModal
          isOpen={bookingModalOpen}
          onClose={() => setBookingModalOpen(false)}
          property={selectedPropertyForBooking}
          unit={selectedUnitForBooking}
          onBookingConfirmed={() => setBookingModalOpen(false)}
        />
      )}

      {/* Guest Stay Tracking Modal */}
      <BookingTrackingModal
        isOpen={trackingModalOpen}
        onClose={() => setTrackingModalOpen(false)}
      />

      {/* Apartment Detail Modal */}
      {detailModalOpen && (
        <ApartmentDetailModal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          propertyId={detailPropertyId}
          initialRoomType={selectedRoomTypeForModal}
          onBookNow={(roomType) => {
            const prop = properties.find((p) => p.id === detailPropertyId) || { id: detailPropertyId, name: 'BFA Residence' };
            setDetailModalOpen(false);
            const propRate = prop.starting_rate ? parseFloat(prop.starting_rate) : undefined;
            const matchingUnit =
              prop.detailedUnits?.find(
                (u) =>
                  u.unit_type === roomType?.unitType ||
                  (u.unit_name && roomType?.unitType && u.unit_name.toLowerCase().includes(roomType.unitType.toLowerCase()))
              ) ||
              prop.detailedUnits?.find((u) => u.status === 'AVAILABLE') ||
              prop.detailedUnits?.[0];

            handleOpenBooking(prop, matchingUnit ? {
              id: matchingUnit.id,
              unit_name: matchingUnit.unit_name || roomType?.unitType || `${prop.name} Suite`,
              rate_per_night: matchingUnit.rate_per_night ? Number(matchingUnit.rate_per_night) : roomType?.startingRate || propRate,
            } : null);
          }}
        />
      )}

      {/* Floating Concierge Chat */}
      <FloatingChatWidget onOpenBooking={() => handleOpenBooking(properties[0] || { id: 1, name: 'Grand Horizon Tower' })} />
    </div>
  );
}

