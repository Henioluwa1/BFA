import React, { useState, useEffect, useMemo } from 'react';
import { formatNaira } from '../../utils/currency';
import { publicService, resolveMediaUrl } from '../../services/api';
import Icons8Icon from './Icons8Icon';
import { getUnitReadinessMeta } from './PropertyPortfolioShowcase';
import './ApartmentDetailModal.css';

export default function ApartmentDetailModal({
  isOpen,
  onClose,
  apartmentId = 1,
  propertyData = null,
  roomTypeData = null,
  initialTab = 'gallery',
  onSelectUnitAndBook,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'gallery');
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [galleryFilter, setGalleryFilter] = useState('all');
  const [fetchedDetail, setFetchedDetail] = useState(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Fetch full property detail (photos, units, building_amenities, technical_specs) when opened
  useEffect(() => {
    if (!isOpen || !apartmentId) return;
    let mounted = true;
    publicService.getPropertyById(apartmentId)
      .then((res) => {
        if (mounted && res?.data) {
          setFetchedDetail(res.data);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [isOpen, apartmentId]);

  const property = useMemo(() => {
    const base = fetchedDetail || propertyData || {};
    return {
      id: base.id || apartmentId,
      name: base.name || propertyData?.name || 'BFA Residence',
      location: [base.address, base.district, base.city, base.state].filter(Boolean).join(', '),
      description: base.description || 'Portal-managed luxury serviced residence.',
      startingRate: base.starting_rate || propertyData?.starting_rate || '0',
      totalUnits: base.total_units || (Array.isArray(base.units) ? base.units.length : 0),
      photos: Array.isArray(base.photos) ? base.photos : [],
      units: Array.isArray(base.units) ? base.units : [],
      amenities: Array.isArray(base.amenities) ? base.amenities : [],
      building_amenities: Array.isArray(base.building_amenities) ? base.building_amenities : [],
      technical_specs: base.technical_specs || {},
    };
  }, [fetchedDetail, propertyData, apartmentId]);

  const rawGallery = useMemo(() => {
    const items = [];
    const seen = new Set();
    property.photos.forEach((p, idx) => {
      const url = resolveMediaUrl(p.file_url);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const cap = p.caption || `${property.name} View ${idx + 1}`;
      const isOutdoor = /exterior|facade|pool|courtyard|ground|garden|terrace/i.test(cap);
      items.push({
        id: `prop-${p.id || idx}`,
        category: isOutdoor ? 'outdoor' : 'indoor',
        badge: p.is_cover ? '★ Cover Photo' : (isOutdoor ? '🏛️ Grounds & Exterior' : '🛋️ Interior'),
        title: cap,
        desc: property.description,
        image: url,
      });
    });
    property.units.forEach((u) => {
      const uPhotos = Array.isArray(u.photos) ? u.photos : [];
      uPhotos.forEach((p, idx) => {
        const url = resolveMediaUrl(p.file_url);
        if (!url || seen.has(url)) return;
        seen.add(url);
        items.push({
          id: `unit-${u.id}-${p.id || idx}`,
          category: 'indoor',
          badge: `🛏️ ${u.unit_name || u.unit_type || 'Suite'}`,
          title: p.caption || u.unit_name || 'Suite Interior',
          desc: u.description || `${u.unit_type || 'Serviced Suite'}`,
          image: url,
        });
      });
    });
    return items;
  }, [property]);

  const activeUnits = useMemo(() => {
    const sourceUnits = (roomTypeData && Array.isArray(roomTypeData.units) && roomTypeData.units.length > 0)
      ? roomTypeData.units
      : property.units;
    return sourceUnits.map((u) => ({
      id: u.id,
      unitNumber: u.unit_number,
      unitName: u.unit_name || `Suite ${u.unit_number || u.id}`,
      unitType: u.unit_type || 'Serviced Suite',
      rate: u.rate_per_night,
      specs: `${u.capacity || 2} Guests • ${u.bedroom_count || 1} Bed • ${u.bathroom_count || 1} Bath`,
      image: resolveMediaUrl(u.main_photo || u.primary_photo_url),
      status: u.status,
    }));
  }, [roomTypeData, property.units]);

  const filteredGallery = rawGallery.filter((item) => {
    if (galleryFilter === 'all') return true;
    return item.category === galleryFilter;
  });

  const activePhoto = filteredGallery[activeGalleryIndex] || filteredGallery[0] || rawGallery[0] || null;

  useEffect(() => {
    setActiveGalleryIndex(0);
  }, [galleryFilter, apartmentId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayTitle = roomTypeData
    ? `${property.name} — ${roomTypeData.unitType}`
    : property.name;
  const displayRate = roomTypeData ? roomTypeData.startingRate : property.startingRate;

  const techSpecsList = (() => {
    const ts = property.technical_specs;
    if (!ts || typeof ts !== 'object') return [];
    const base = [
      { title: 'Power Backup', desc: ts.power_backup },
      { title: 'Water Supply', desc: ts.water_supply },
      { title: 'Security Systems', desc: ts.security_systems },
      { title: 'Internet & Connectivity', desc: ts.internet_connectivity },
      { title: 'Parking Capacity', desc: ts.parking_capacity },
      { title: 'Building Features', desc: ts.building_features },
    ].filter((s) => s.desc && String(s.desc).trim());
    const custom = Array.isArray(ts.custom)
      ? ts.custom.filter((c) => c && c.label && c.value).map((c) => ({ title: c.label, desc: c.value }))
      : [];
    return [...base, ...custom];
  })();

  const handlePrevPhoto = () => {
    if (filteredGallery.length === 0) return;
    setActiveGalleryIndex((prev) => (prev === 0 ? filteredGallery.length - 1 : prev - 1));
  };

  const handleNextPhoto = () => {
    if (filteredGallery.length === 0) return;
    setActiveGalleryIndex((prev) => (prev === filteredGallery.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="bfa-apt-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bfa-apt-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="bfa-apt-modal-header">
          <div className="bfa-apt-modal-title-group">
            <span className="bfa-apt-modal-tag">✦ {property.name}</span>
            <h2 className="bfa-apt-modal-title">{displayTitle}</h2>
            {property.location && (
              <p className="bfa-apt-modal-location" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Icons8Icon name="location" variant="blue" size={14} /> {property.location}
              </p>
            )}
          </div>

          <div className="bfa-apt-modal-header-right">
            {Number(displayRate) > 0 && (
              <div className="bfa-apt-modal-rate">
                <span className="rate-label">From</span>
                <span className="rate-val">{formatNaira(displayRate)}<span className="rate-unit">/nt</span></span>
              </div>
            )}
            <button
              type="button"
              className="bfa-apt-modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
              title="Close (Esc)"
            >
              <Icons8Icon name="close" variant="white" size={14} />
            </button>
          </div>
        </div>

        {/* Navigation Category Tabs */}
        <div className="bfa-apt-modal-tabs">
          <button
            type="button"
            className={`bfa-apt-tab-btn ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            <Icons8Icon name="gallery" variant={activeTab === 'gallery' ? 'blue' : 'white'} size={18} />
            <span>Photo Gallery ({rawGallery.length})</span>
          </button>
          <button
            type="button"
            className={`bfa-apt-tab-btn ${activeTab === 'indoor' ? 'active' : ''}`}
            onClick={() => setActiveTab('indoor')}
          >
            <Icons8Icon name="lightning" variant={activeTab === 'indoor' ? 'blue' : 'white'} size={18} />
            <span>Amenities &amp; Specs</span>
          </button>
          <button
            type="button"
            className={`bfa-apt-tab-btn ${activeTab === 'units' ? 'active' : ''}`}
            onClick={() => setActiveTab('units')}
          >
            <Icons8Icon name="door" variant={activeTab === 'units' ? 'blue' : 'white'} size={18} />
            <span>Suites ({activeUnits.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="bfa-apt-modal-body">
          {activeTab === 'gallery' && (
            <div className="bfa-apt-tab-pane gallery-pane">
              <div className="bfa-gallery-filter-bar">
                <button
                  type="button"
                  className={`bfa-gallery-filter-pill ${galleryFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setGalleryFilter('all')}
                >
                  All Views ({rawGallery.length})
                </button>
                <button
                  type="button"
                  className={`bfa-gallery-filter-pill ${galleryFilter === 'outdoor' ? 'active' : ''}`}
                  onClick={() => setGalleryFilter('outdoor')}
                >
                  Outdoor ({rawGallery.filter((i) => i.category === 'outdoor').length})
                </button>
                <button
                  type="button"
                  className={`bfa-gallery-filter-pill ${galleryFilter === 'indoor' ? 'active' : ''}`}
                  onClick={() => setGalleryFilter('indoor')}
                >
                  Indoor ({rawGallery.filter((i) => i.category === 'indoor').length})
                </button>
              </div>

              {activePhoto ? (
                <>
                  <div className="bfa-apt-main-viewer">
                    <div
                      className="bfa-apt-viewer-image"
                      style={{ backgroundImage: `url(${activePhoto.image})` }}
                    >
                      <div className="bfa-viewer-gradient" />
                      <div className="bfa-viewer-category-tag">{activePhoto.badge}</div>
                      <div className="bfa-viewer-counter-badge">
                        {activeGalleryIndex + 1} / {filteredGallery.length}
                      </div>
                      {filteredGallery.length > 1 && (
                        <>
                          <button type="button" className="bfa-viewer-nav-btn prev" onClick={handlePrevPhoto} aria-label="Previous image">
                            <Icons8Icon name="chevron-left" variant="white" size={20} />
                          </button>
                          <button type="button" className="bfa-viewer-nav-btn next" onClick={handleNextPhoto} aria-label="Next image">
                            <Icons8Icon name="chevron-right" variant="white" size={20} />
                          </button>
                        </>
                      )}
                      <div className="bfa-viewer-caption">
                        <h3 className="bfa-viewer-title">{activePhoto.title}</h3>
                        <p className="bfa-viewer-desc">{activePhoto.desc}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bfa-apt-thumb-strip">
                    {filteredGallery.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`bfa-apt-thumb-item ${idx === activeGalleryIndex ? 'active' : ''}`}
                        onClick={() => setActiveGalleryIndex(idx)}
                        title={item.title}
                      >
                        <div className="bfa-apt-thumb-img" style={{ backgroundImage: `url(${item.image})` }} />
                        <span className="bfa-thumb-label">{item.title}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="bfa-apt-overview-card">
                  <p>No photographs uploaded yet for this residence in the portal.</p>
                </div>
              )}

              <div className="bfa-apt-overview-card">
                <div className="bfa-overview-header">
                  <span className="bfa-pulse-dot" />
                  <h4>{property.name}</h4>
                </div>
                <p>{property.description}</p>
              </div>
            </div>
          )}

          {activeTab === 'indoor' && (
            <div className="bfa-apt-tab-pane indoor-pane">
              <div className="bfa-features-matrix-grid">
                {property.building_amenities.map((amn, idx) => (
                  <div key={`ba-${idx}`} className="bfa-matrix-feature-card">
                    <div className="bfa-feature-icon-badge">
                      <Icons8Icon name="shield-check" variant="blue" size={22} />
                    </div>
                    <div className="bfa-feature-info">
                      <h4>{amn.name}</h4>
                      <p>{amn.description || 'Verified enclave facility.'}</p>
                    </div>
                  </div>
                ))}
                {property.amenities.map((amn, idx) => (
                  <div key={`am-${idx}`} className="bfa-matrix-feature-card">
                    <div className="bfa-feature-icon-badge">
                      <Icons8Icon name="lightning" variant="blue" size={22} />
                    </div>
                    <div className="bfa-feature-info">
                      <h4>{amn}</h4>
                      <p>Portal-verified property amenity.</p>
                    </div>
                  </div>
                ))}
                {techSpecsList.map((spec, idx) => (
                  <div key={`ts-${idx}`} className="bfa-matrix-feature-card">
                    <div className="bfa-feature-icon-badge">
                      <Icons8Icon name="info" variant="blue" size={22} />
                    </div>
                    <div className="bfa-feature-info">
                      <h4>{spec.title}</h4>
                      <p>{spec.desc}</p>
                    </div>
                  </div>
                ))}
                {property.building_amenities.length === 0 && property.amenities.length === 0 && techSpecsList.length === 0 && (
                  <div className="bfa-apt-overview-card">
                    <p>No amenities or technical specifications configured yet for this property.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'units' && (
            <div className="bfa-apt-tab-pane units-pane">
              <div className="bfa-units-list-grid">
                {activeUnits.map((unit) => (
                  <div key={unit.id} className="bfa-unit-detail-card">
                    <div
                      className="bfa-unit-card-img"
                      style={{
                        backgroundImage: unit.image
                          ? `url(${unit.image})`
                          : 'linear-gradient(135deg, #0b1b15 0%, #163329 100%)',
                      }}
                    >
                      {(() => {
                        const readiness = getUnitReadinessMeta(unit);
                        return (
                          <span className={`bfa-unit-status-pill ${readiness.isReady ? 'avail' : 'busy'}`}>
                            {readiness.shortLabel}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="bfa-unit-card-content">
                      <h4>{unit.unitName}</h4>
                      <p className="bfa-unit-type-sub">{unit.unitType}</p>
                      <div className="bfa-unit-specs-row">
                        <Icons8Icon name="view-eye" variant="blue" size={14} />
                        <span>{unit.specs}</span>
                      </div>
                      <div className="bfa-unit-card-footer">
                        <div className="bfa-unit-rate-wrap">
                          <span className="rate-label">Per Night</span>
                          <span className="rate-num">{formatNaira(unit.rate)}</span>
                        </div>
                        <button
                          type="button"
                          className="bfa-unit-book-btn"
                          onClick={() => {
                            if (onSelectUnitAndBook) {
                              onSelectUnitAndBook(property.id, unit.id);
                            }
                            onClose();
                          }}
                        >
                          Book Unit →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bfa-apt-modal-footer">
          <div className="bfa-footer-left-info">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Icons8Icon name="location" variant="white" size={14} /> {property.name}
            </span>
          </div>
          <div className="bfa-footer-right-actions">
            <button type="button" className="bfa-modal-action-secondary" onClick={onClose}>
              Close Details
            </button>
            <button
              type="button"
              className="bfa-modal-action-primary"
              onClick={() => {
                if (onSelectUnitAndBook) {
                  onSelectUnitAndBook(property.id, activeUnits[0]?.id || 1);
                }
                onClose();
              }}
            >
              Reserve an Apartment Here →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
