import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Calendar, Clock, Building2, UserCheck, CreditCard, ArrowRight, AlertCircle } from 'lucide-react';
import { frontOfficeService } from '../../services/api';
import './ClientSearchModal.css';

function formatLagos(val) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WAT';
  } catch {
    return String(val);
  }
}

export default function ClientSearchModal({ isOpen, onClose, onSelectBooking, activePropertyId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setQuery('');
      setResults([]);
      setError('');
      setSearched(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const runSearch = async (term) => {
    const clean = term.trim();
    if (!clean) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await frontOfficeService.searchBookings({
        q: clean,
        propertyId: activePropertyId && activePropertyId !== 'all' ? activePropertyId : undefined,
      });
      setResults(res.data || []);
      setSearched(true);
    } catch (err) {
      setError(err.message || 'Unable to search bookings.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 350);
  };

  if (!isOpen) return null;

  return (
    <div
      className="bfa-search-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bfa-client-search-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bfa-search-modal-shell">
        <div className="bfa-search-modal-header">
          <div>
            <span className="bfa-search-modal-eyebrow">Front Office Check-In Desk</span>
            <h2 id="bfa-client-search-title" className="bfa-search-modal-title">
              Client & Booking Lookup
            </h2>
          </div>
          <button
            type="button"
            className="bfa-search-modal-close"
            onClick={onClose}
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </div>

        <form
          className="bfa-search-modal-input-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
        >
          <Search size={18} className="bfa-search-modal-icon" />
          <input
            ref={inputRef}
            type="text"
            className="bfa-search-modal-input"
            placeholder="Enter guest full name or booking number (e.g. BFA-2026...)"
            value={query}
            onChange={handleChange}
          />
          {query && (
            <button
              type="button"
              className="bfa-search-modal-clear"
              onClick={() => {
                setQuery('');
                setResults([]);
                setSearched(false);
              }}
            >
              Clear
            </button>
          )}
        </form>

        <div className="bfa-search-modal-body">
          {loading && (
            <div className="bfa-search-modal-state">
              <div className="bfa-search-spinner" />
              <span>Searching authorized property records...</span>
            </div>
          )}

          {!loading && error && (
            <div className="bfa-search-modal-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && searched && results.length === 0 && (
            <div className="bfa-search-modal-state">
              <span>No authorized bookings matched "{query}".</span>
            </div>
          )}

          {!loading && !error && !searched && (
            <div className="bfa-search-modal-state">
              <span>Search by client full name or booking reference to inspect check-in readiness.</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="bfa-search-results-list">
              {results.map((b) => (
                <div key={b.id} className="bfa-search-result-card">
                  <div className="bfa-search-result-top">
                    <div>
                      <div className="bfa-search-guest-name">{b.tenant_name}</div>
                      <div className="bfa-search-booking-ref">#{b.reservation_code}</div>
                    </div>
                    <div className="bfa-search-badges">
                      <span className={`bfa-search-badge status-${(b.status || '').toLowerCase()}`}>
                        {b.status}
                      </span>
                      <span className={`bfa-search-badge pay-${(b.payment_status || '').toLowerCase()}`}>
                        {b.payment_status || 'UNPAID'}
                      </span>
                    </div>
                  </div>

                  <div className="bfa-search-meta-grid">
                    <div className="bfa-search-meta-item">
                      <Clock size={13} className="meta-muted-icon" />
                      <span className="meta-label-muted">Booked On:</span>
                      <strong>{formatLagos(b.created_at)}</strong>
                    </div>
                    <div className="bfa-search-meta-item">
                      <Calendar size={13} className="meta-gold-icon" />
                      <span className="meta-label-gold">Scheduled Check-In:</span>
                      <strong>{b.check_in_date} (14:00 WAT)</strong>
                    </div>
                    <div className="bfa-search-meta-item">
                      <Building2 size={13} className="meta-muted-icon" />
                      <span className="meta-label-muted">Suite:</span>
                      <span>{b.property_name} • {b.unit_name || `#${b.unit_number}`}</span>
                    </div>
                    <div className="bfa-search-meta-item">
                      <UserCheck size={13} className="meta-muted-icon" />
                      <span className="meta-label-muted">Assigned To:</span>
                      <span>{b.assigned_staff_name || 'Unclaimed Queue'}</span>
                    </div>
                    <div className="bfa-search-meta-item">
                      <CreditCard size={13} className="meta-muted-icon" />
                      <span className="meta-label-muted">Guests / Nights:</span>
                      <span>{b.guests_count || 1} Guest(s) • {b.nights || 1} Night</span>
                    </div>
                  </div>

                  <div className="bfa-search-result-actions">
                    <button
                      type="button"
                      className="bfa-search-view-btn"
                      onClick={() => {
                        onSelectBooking(b);
                        onClose();
                      }}
                    >
                      View Booking <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
