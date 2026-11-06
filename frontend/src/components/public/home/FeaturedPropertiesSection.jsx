import React from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Clock,
  ArrowRight,
  ShieldCheck,
  Zap,
  Wifi,
  Waves,
  Sparkles,
} from 'lucide-react';
import { BfaButton, BfaBadge, BfaCard } from '../primitives';
import { formatNaira } from '../../../utils/currency';
import ghtExterior from '../../../assets/ght-exterior.jpg';
import azureBayExterior from '../../../assets/azure-bay-exterior.jpg';
import royalPalmsExterior from '../../../assets/royal-palms-exterior.jpg';
import './FeaturedPropertiesSection.css';

/**
 * FeaturedPropertiesSection — Editorial presentation of the 3 BFA enclaves
 * Uses authoritative database records, dynamic starting rates, and verified amenities.
 */
export default function FeaturedPropertiesSection({
  properties = [],
  onOpenBooking,
}) {
  const getPropertyPhoto = (id) => {
    if (id === 1) return ghtExterior;
    if (id === 2) return azureBayExterior;
    return royalPalmsExterior;
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
    <section className="bfa-featured-section" id="residences" aria-label="Curated Serviced Enclaves">
      <div className="bfa-featured-container">
        {/* Editorial Section Header */}
        <div className="bfa-featured-header">
          <div className="bfa-featured-header-left">
            <h2 className="bfa-featured-title">The BFA Collection</h2>
          </div>

          <div className="bfa-featured-header-right">
            <Link to="/properties" className="bfa-view-all-link">
              <BfaButton variant="primary" size="md" iconRight={<ArrowRight size={14} />}>
                View All Enclaves &amp; Suites
              </BfaButton>
            </Link>
          </div>
        </div>

        {/* Editorial Properties Grid */}
        <div className="bfa-featured-grid">
          {properties.map((prop, idx) => {
            const photo = getPropertyPhoto(prop.id);
            const parsedRate = prop.starting_rate != null ? parseFloat(prop.starting_rate) : null;
            const hasAuthoritativeRate = parsedRate !== null && !isNaN(parsedRate) && parsedRate > 0;
            const rawAvail = prop.available_units;
            const availNum = rawAvail !== null && rawAvail !== undefined && rawAvail !== '' ? Number(rawAvail) : null;
            const hasAvailabilityData = availNum !== null && !isNaN(availNum);
            const verifiedAmenities = Array.isArray(prop.amenities) ? prop.amenities : [];

            return (
              <article key={prop.id} className={`bfa-featured-card-wrapper ${idx === 0 ? 'bfa-featured-card--lead' : ''}`}>
                <BfaCard variant="default" elevation="sm" interactive className="bfa-featured-card">
                  {/* Card Media Header */}
                  <div className="bfa-card-media-box">
                    <img
                      src={photo}
                      alt={`${prop.name} architectural exterior`}
                      className="bfa-card-media-img"
                      loading="lazy"
                    />
                    <div className="bfa-card-media-overlay">
                      <BfaBadge variant="forest" size="sm" icon={<ShieldCheck size={12} />}>
                        {prop.code || 'BFA'} • Verified Enclave
                      </BfaBadge>

                      {hasAvailabilityData && (
                        availNum > 0 ? (
                          <BfaBadge variant="success" size="sm">
                            {availNum} {availNum === 1 ? 'Unit' : 'Units'} Available
                          </BfaBadge>
                        ) : (
                          <BfaBadge variant="neutral" size="sm">
                            Fully Booked
                          </BfaBadge>
                        )
                      )}
                    </div>
                    <span className="bfa-card-vis-pill" title="Concept illustration representing property architecture">
                      Architectural Visualization
                    </span>
                  </div>

                  {/* Card Body Content */}
                  <div className="bfa-card-body-box">
                    <div className="bfa-card-top-meta">
                      <span className="bfa-card-loc">
                        <MapPin size={13} aria-hidden="true" />
                        {prop.address || 'Akure, Ondo State'}
                      </span>
                      <span className="bfa-card-checkin-time">
                        <Clock size={12} aria-hidden="true" />
                        Check-in: {prop.check_in_time || '14:00'}
                      </span>
                    </div>

                    <h3 className="bfa-card-name">{prop.name}</h3>
                    <p className="bfa-card-description">
                      {prop.description || 'Executive luxury serviced residence engineered with 24/7 dual-grid solar power and enterprise fiber internet.'}
                    </p>

                    {/* Authoritative Amenities */}
                    <div className="bfa-card-amenity-strip">
                      {verifiedAmenities.length > 0 ? (
                        verifiedAmenities.slice(0, 4).map((amenity, aIdx) => (
                          <span key={aIdx} className="bfa-amenity-pill">
                            {renderAmenityIcon(amenity)} {amenity}
                          </span>
                        ))
                      ) : (
                        <span className="bfa-amenity-neutral-pill" title="Facilities verified and configured on the individual suite record">
                          Suite-specific facilities • Inquire at Front Desk
                        </span>
                      )}
                    </div>

                    {/* Pricing and Actions Row */}
                    <div className="bfa-card-footer-row">
                      <div className="bfa-card-price-group">
                        {prop.cheapestAvailableRate != null ? (
                          <>
                            <span className="bfa-card-price-label">AVAILABLE FROM</span>
                            <span className="bfa-card-price-number">
                              {formatNaira(prop.cheapestAvailableRate)}
                              <small className="bfa-card-price-unit"> /night</small>
                            </span>
                            {hasAuthoritativeRate && parsedRate < prop.cheapestAvailableRate && (
                              <span className="bfa-card-price-note">
                                Base tiers from {formatNaira(parsedRate)} occupied
                              </span>
                            )}
                          </>
                        ) : hasAuthoritativeRate ? (
                          <>
                            <span className="bfa-card-price-label">CATALOG STARTING RATE</span>
                            <span className="bfa-card-price-number">
                              {formatNaira(parsedRate)}
                              <small className="bfa-card-price-unit"> /night</small>
                            </span>
                            {hasAvailabilityData && availNum === 0 && (
                              <span className="bfa-card-price-note">
                                Currently fully booked
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="bfa-card-price-label">RATES &amp; SUITES</span>
                            <span className="bfa-card-price-inquire">Select suite to view rates</span>
                          </>
                        )}
                      </div>

                      <div className="bfa-card-buttons-group">
                        <Link to={`/property/${prop.id}`} className="bfa-card-explore-btn">
                          <BfaButton variant="primary" size="sm">
                            View Enclave
                          </BfaButton>
                        </Link>
                      </div>
                    </div>
                  </div>
                </BfaCard>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

