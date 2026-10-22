import React, { useState } from 'react';

/**
 * ApartmentGrid — Renders a responsive grid of available apartment cards.
 * Used inside the Operations Assistant modal for availability responses.
 *
 * Security: receives only pre-sanitized, server-authorized data.
 * No guest PII, no internal tokens, no arbitrary rendering.
 */
export default function ApartmentGrid({
  apartments = [],
  checkInDate,
  checkOutDate,
  total,
  showPricing = false,
  empty = false,
  onSelectApartment,
  onViewDetails,
}) {
  const PAGE_SIZE = 6;
  const [page, setPage] = useState(0);

  if (empty || apartments.length === 0) {
    return (
      <div className="apt-grid-empty" role="status">
        <span className="apt-grid-empty-icon">🏠</span>
        <p>No apartments available{checkInDate ? ` for ${checkInDate}` : ''}.</p>
        <p className="apt-grid-empty-hint">Try a different date or property.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(apartments.length / PAGE_SIZE);
  const pageApts = apartments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="apt-grid-wrapper" aria-label={`${total} available apartments`}>
      {/* Grid header */}
      <div className="apt-grid-header">
        <span className="apt-grid-count">
          <strong>{total}</strong> apartment{total !== 1 ? 's' : ''} available
          {checkInDate && <span className="apt-grid-dates"> · {checkInDate}{checkOutDate ? ` → ${checkOutDate}` : ''} · 1 night</span>}
        </span>
        {totalPages > 1 && (
          <span className="apt-grid-pagination-info">
            Page {page + 1} of {totalPages}
          </span>
        )}
      </div>

      {/* Cards grid */}
      <div className="apt-grid" role="list">
        {pageApts.map((apt) => (
          <ApartmentCard
            key={apt.apartmentId}
            apartment={apt}
            showPricing={showPricing}
            checkInDate={checkInDate}
            onSelectApartment={onSelectApartment}
            onViewDetails={onViewDetails}
          />
        ))}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="apt-grid-pagination" role="navigation" aria-label="Apartment grid pagination">
          <button
            type="button"
            className="apt-grid-page-btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Previous page"
          >
            ← Previous
          </button>
          <span className="apt-grid-page-info">{page + 1} / {totalPages}</span>
          <button
            type="button"
            className="apt-grid-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            aria-label="Next page"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Individual apartment card within the grid.
 */
function ApartmentCard({ apartment, showPricing, checkInDate, onSelectApartment, onViewDetails }) {
  const {
    apartmentId,
    unitNumber,
    unitName,
    unitType,
    propertyName,
    bedrooms,
    bathrooms,
    floor,
    amenities,
    ratePerNight,
    totalAmount,
  } = apartment;

  const displayName = unitName || unitNumber || `Unit #${apartmentId}`;
  const typeLabel = unitType ? unitType.replace(/_/g, ' ') : null;

  const handleSelect = () => {
    if (onSelectApartment) {
      onSelectApartment(apartment, checkInDate);
    }
  };

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(apartment);
    }
  };

  return (
    <div className="apt-card" role="listitem" aria-label={`Apartment ${displayName}`}>
      {/* Card header */}
      <div className="apt-card-header">
        <div className="apt-card-unit">
          <span className="apt-card-number">{displayName}</span>
          {typeLabel && <span className="apt-card-type-badge">{typeLabel}</span>}
        </div>
        <span className="apt-card-availability-dot available" title="Available" aria-label="Available" />
      </div>

      {/* Property */}
      {propertyName && (
        <div className="apt-card-property">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          {propertyName}
        </div>
      )}

      {/* Attributes */}
      <div className="apt-card-attrs">
        {bedrooms != null && (
          <span className="apt-card-attr">
            🛏 {bedrooms} bed{bedrooms !== 1 ? 's' : ''}
          </span>
        )}
        {bathrooms != null && (
          <span className="apt-card-attr">
            🚿 {bathrooms} bath{bathrooms !== 1 ? 's' : ''}
          </span>
        )}
        {floor != null && (
          <span className="apt-card-attr">
            🏢 Floor {floor}
          </span>
        )}
      </div>

      {/* Amenities — first 3 only */}
      {Array.isArray(amenities) && amenities.length > 0 && (
        <div className="apt-card-amenities">
          {amenities.slice(0, 3).map((a) => (
            <span key={a} className="apt-card-amenity-tag">{a}</span>
          ))}
          {amenities.length > 3 && (
            <span className="apt-card-amenity-tag apt-card-amenity-more">+{amenities.length - 3} more</span>
          )}
        </div>
      )}

      {/* Pricing — only when authorized */}
      {showPricing && ratePerNight != null && (
        <div className="apt-card-pricing">
          <span className="apt-card-price">₦{ratePerNight.toLocaleString()}</span>
          <span className="apt-card-price-label">/ night</span>
          {totalAmount != null && totalAmount !== ratePerNight && (
            <span className="apt-card-total"> · ₦{totalAmount.toLocaleString()} total</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="apt-card-actions">
        {onViewDetails && (
          <button
            type="button"
            className="apt-card-btn apt-card-btn-secondary"
            onClick={handleViewDetails}
            aria-label={`View details for ${displayName}`}
          >
            View Details
          </button>
        )}
        {onSelectApartment && checkInDate && (
          <button
            type="button"
            className="apt-card-btn apt-card-btn-primary"
            onClick={handleSelect}
            aria-label={`Book ${displayName}`}
          >
            Book This Unit
          </button>
        )}
      </div>
    </div>
  );
}
