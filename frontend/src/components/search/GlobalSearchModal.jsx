import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import { formatNaira } from '../../utils/currency';

export default function GlobalSearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { activePropertyId } = useProperty();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults(null);
      setError(null);
    }
  }, [isOpen]);

  // Debounced search query
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await searchService.search(query, activePropertyId);
        setResults(res.data);
      } catch (err) {
        setError(err.message || 'Search query failed.');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, activePropertyId]);

  if (!isOpen) return null;

  const handleSelect = (path) => {
    onClose();
    navigate(path);
  };

  const hasResults =
    results &&
    results.totalResults > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      ariaLabel="Global Search"
      bodyClassName="search-modal-body"
      footer={
        <div
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>Tip: Press <kbd style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-primary)' }}>Ctrl + K</kbd> anywhere</span>
          <span style={{ color: 'var(--brand-accent)' }}>Role Isolation Active</span>
        </div>
      }
    >
      <div>
        {/* Search Input Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.85rem 1.15rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-accent)" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-modal-input"
            placeholder="Search records, units, guests... (Esc)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none',
              minWidth: 0,
            }}
          />
          {loading && <span style={{ color: 'var(--brand-accent)', fontSize: '0.82rem', flexShrink: 0 }}>Searching...</span>}
          <button
            type="button"
            className="collapse-toggle"
            onClick={onClose}
            title="Close Search"
            aria-label="Close Search"
            style={{ width: '36px', height: '36px', minWidth: '36px', flexShrink: 0, fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>

        {/* Results Container */}
        <div style={{ maxHeight: '450px', overflowY: 'auto', padding: '1rem' }}>
          {error && (
            <div style={{ padding: '1rem', color: 'var(--rust-light)', textAlign: 'center' }}>
              ✕ {error}
            </div>
          )}

          {!query.trim() && (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⌨</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>System-Wide Global Search</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
                Type to search authorized properties, units, 1-night reservations, work orders, or agents.
              </div>
            </div>
          )}

          {query.trim() && !loading && !hasResults && !error && (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No matching records found</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>
                No records matching "{query}" within your current access scope.
              </div>
            </div>
          )}

          {/* Categorized Result Groups */}
          {results && hasResults && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Properties */}
              {results.categories.properties.length > 0 && (
                <div>
                  <div className="search-category-heading">🏢 Properties ({results.categories.properties.length})</div>
                  <div className="search-category-list">
                    {results.categories.properties.map((p) => (
                      <div
                        key={p.id}
                        className="search-item"
                        onClick={() => handleSelect(`/apartments?propertyId=${p.id}`)}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Code: {p.code} • {p.address}, {p.city}
                          </div>
                        </div>
                        <Badge status="available">{p.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Apartments / Units */}
              {results.categories.apartments.length > 0 && (
                <div>
                  <div className="search-category-heading">🚪 Apartments / Units ({results.categories.apartments.length})</div>
                  <div className="search-category-list">
                    {results.categories.apartments.map((a) => (
                      <div
                        key={a.id}
                        className="search-item"
                        onClick={() => handleSelect(`/apartments?unitId=${a.id}`)}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            Unit {a.unit_number} — {a.unit_name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {a.property_name} • {a.unit_type} • {formatNaira(a.rate_per_night)}/night
                          </div>
                        </div>
                        <Badge status={a.status}>{a.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reservations */}
              {results.categories.reservations.length > 0 && (
                <div>
                  <div className="search-category-heading">📋 Reservations ({results.categories.reservations.length})</div>
                  <div className="search-category-list">
                    {results.categories.reservations.map((r) => (
                      <div
                        key={r.id}
                        className="search-item"
                        onClick={() => handleSelect(`/reservations?code=${r.reservation_code}`)}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {r.reservation_code} — {r.tenant_name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {r.property_name} (Unit {r.unit_number}) • {r.check_in_date} (1 Night) • {formatNaira(r.total_amount)}
                          </div>
                        </div>
                        <Badge status="occupied">{r.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Maintenance */}
              {results.categories.maintenance.length > 0 && (
                <div>
                  <div className="search-category-heading">🔧 Maintenance ({results.categories.maintenance.length})</div>
                  <div className="search-category-list">
                    {results.categories.maintenance.map((m) => (
                      <div
                        key={m.id}
                        className="search-item"
                        onClick={() => handleSelect(`/maintenance?id=${m.id}`)}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {m.issue_code}: {m.issue_title}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {m.property_name} (Unit {m.unit_number}) • Priority: {m.priority}
                          </div>
                        </div>
                        <Badge status="maintenance">{m.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agents */}
              {results.categories.agents.length > 0 && (
                <div>
                  <div className="search-category-heading">🤝 Booking Agents ({results.categories.agents.length})</div>
                  <div className="search-category-list">
                    {results.categories.agents.map((ag) => (
                      <div
                        key={ag.id}
                        className="search-item"
                        onClick={() => handleSelect(`/agents?id=${ag.id}`)}
                      >
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ag.name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {ag.email} • {ag.phone} • {ag.commission_rate}% commission
                          </div>
                        </div>
                        <Badge status="available">{ag.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
