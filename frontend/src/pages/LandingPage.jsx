import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { publicService } from '../services/api';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';

export default function LandingPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [loadingProps, setLoadingProps] = useState(true);

  // Booking Form State
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedApartmentId, setSelectedApartmentId] = useState('');
  const [checkInDate, setCheckInDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [availabilityError, setAvailabilityError] = useState('');

  // Guest Details State
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [propsRes, aptsRes] = await Promise.all([
          publicService.getProperties(),
          publicService.getApartments(),
        ]);
        setProperties(propsRes.data || []);
        setApartments(aptsRes.data || []);
        if (propsRes.data?.length > 0) {
          setSelectedPropertyId(String(propsRes.data[0].id));
        }
      } catch (err) {
        console.error('Failed to load public data:', err);
      } finally {
        setLoadingProps(false);
      }
    }
    loadData();
  }, []);

  // Filter apartments by selected property
  const filteredApartments = apartments.filter(
    (a) => !selectedPropertyId || String(a.property_id) === String(selectedPropertyId)
  );

  useEffect(() => {
    if (filteredApartments.length > 0 && !selectedApartmentId) {
      setSelectedApartmentId(String(filteredApartments[0].id));
    }
  }, [filteredApartments, selectedApartmentId]);

  const handleCheckAvailability = async (e) => {
    e.preventDefault();
    if (!selectedApartmentId) {
      setAvailabilityError('Please select an apartment unit.');
      return;
    }
    setCheckingAvailability(true);
    setAvailabilityError('');
    setAvailabilityResult(null);

    try {
      const res = await publicService.checkAvailability({
        apartmentId: parseInt(selectedApartmentId, 10),
        checkInDate,
      });
      setAvailabilityResult(res.data);
    } catch (err) {
      setAvailabilityError(err.message || 'Error checking availability.');
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!guestName || !guestEmail || !guestPhone) {
      alert('Please fill in your name, email, and phone number.');
      return;
    }
    setBookingLoading(true);

    try {
      const res = await publicService.createBooking({
        apartmentId: parseInt(selectedApartmentId, 10),
        guestName,
        guestEmail,
        guestPhone,
        checkInDate,
      });
      setConfirmedBooking(res.data);
      setAvailabilityResult(null);
    } catch (err) {
      alert(`Booking failed: ${err.message || 'Please try another unit or date.'}`);
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', color: '#0f172a', fontFamily: 'var(--font-body)', overflowX: 'hidden' }}>
      {/* 1. Public Top Navigation Bar (Section 21) */}
      <header
        style={{
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            padding: '0.85rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb, #1e3a8a)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.2rem',
                flexShrink: 0,
              }}
            >
              B
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.15rem', color: '#0f172a', lineHeight: 1.2 }}>
                BFA APARTMENTS
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Serviced Residences
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="landing-desktop-nav">
            <a href="#properties" style={{ textDecoration: 'none', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>
              Properties
            </a>
            <a href="#booking" style={{ textDecoration: 'none', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>
              Online Booking
            </a>
            <a href="#features" style={{ textDecoration: 'none', color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>
              Amenities
            </a>
            <Link
              to="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                background: '#0f172a',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.88rem',
                boxShadow: '0 2px 4px rgba(15, 23, 42, 0.1)',
              }}
            >
              Portal Login →
            </Link>
          </nav>

          {/* Mobile Navigation Toggle Button */}
          <button
            type="button"
            className="landing-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {mobileMenuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="landing-mobile-menu">
            <a href="#properties" onClick={() => setMobileMenuOpen(false)}>
              🏢 Properties
            </a>
            <a href="#booking" onClick={() => setMobileMenuOpen(false)}>
              📅 Online Booking
            </a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>
              ✨ Amenities
            </a>
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.95rem',
                marginTop: '0.5rem',
              }}
            >
              Portal Login →
            </Link>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <section
        style={{
          background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
          padding: 'clamp(2.5rem, 6vw, 4.5rem) 1.25rem 3rem',
          textAlign: 'center',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <div style={{ maxWidth: '840px', margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 0.85rem',
              borderRadius: '9999px',
              background: 'rgba(37, 99, 235, 0.08)',
              color: '#2563eb',
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '1.25rem',
            }}
          >
            ✦ Premium Multi-Property Serviced Residences
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(1.85rem, 5vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#0f172a',
              letterSpacing: '-0.03em',
              marginBottom: '1.25rem',
            }}
          >
            Refined Living Across Premier BFA Buildings
          </h1>
          <p style={{ fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)', color: '#475569', lineHeight: 1.6, marginBottom: '2rem' }}>
            BFA manages luxury apartments and serviced residences equipped with 24/7 guaranteed power,
            high-speed fiber optics, dedicated concierge, and exceptional comfort.
          </p>
          <div className="landing-hero-actions">
            <a
              href="#booking"
              style={{
                background: '#2563eb',
                color: '#ffffff',
                padding: '0.85rem 1.75rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.98rem',
                textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              }}
            >
              Book Online Now
            </a>
            <a
              href="#properties"
              style={{
                background: '#ffffff',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                padding: '0.85rem 1.75rem',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.98rem',
                textDecoration: 'none',
              }}
            >
              Explore Properties
            </a>
          </div>
        </div>
      </section>

      {/* 3. Interactive Online Booking Engine (Section 13) */}
      <section id="booking" style={{ padding: '3.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>
              Online Reservation Engine
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
              Select a property, choose your apartment, and reserve your 1-night stay with real-time confirmation.
            </p>
          </div>

          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.08)',
              padding: 'clamp(1.15rem, 4vw, 2rem)',
              boxSizing: 'border-box',
            }}
          >
            <form onSubmit={handleCheckAvailability}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                {/* Property Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>
                    🏢 SELECT PROPERTY
                  </label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => {
                      setSelectedPropertyId(e.target.value);
                      setSelectedApartmentId('');
                      setAvailabilityResult(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.city})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Apartment / Unit Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>
                    🛋️ APARTMENT / UNIT
                  </label>
                  <select
                    value={selectedApartmentId}
                    onChange={(e) => {
                      setSelectedApartmentId(e.target.value);
                      setAvailabilityResult(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    {filteredApartments.length === 0 ? (
                      <option value="">No available units</option>
                    ) : (
                      filteredApartments.map((a) => (
                        <option key={a.id} value={a.id}>
                          Unit {a.unit_number} — {a.unit_name} (${parseFloat(a.rate_per_night)}/nt)
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Check-In Date Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>
                    📅 CHECK-IN DATE (1-NIGHT STAY)
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={checkInDate}
                    onChange={(e) => {
                      setCheckInDate(e.target.value);
                      setAvailabilityResult(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}
                  />
                </div>

                {/* Submit Check Button */}
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={checkingAvailability || !selectedApartmentId}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      cursor: checkingAvailability ? 'wait' : 'pointer',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                    }}
                  >
                    {checkingAvailability ? 'Checking...' : 'Check Availability'}
                  </button>
                </div>
              </div>
            </form>

            {availabilityError && (
              <div style={{ padding: '0.85rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecdd3', color: '#9f1239', fontSize: '0.88rem', marginBottom: '1rem' }}>
                ✕ {availabilityError}
              </div>
            )}

            {/* Availability Result & Instant Booking Form */}
            {availabilityResult && (
              <div
                style={{
                  marginTop: '1.5rem',
                  padding: '1.5rem',
                  borderRadius: '12px',
                  background: availabilityResult.isAvailable ? '#f0fdf4' : '#fff1f2',
                  border: `1px solid ${availabilityResult.isAvailable ? '#bbf7d0' : '#fecdd3'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span
                      style={{
                        padding: '0.25rem 0.65rem',
                        borderRadius: '9999px',
                        background: availabilityResult.isAvailable ? '#15803d' : '#be123c',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {availabilityResult.isAvailable ? '✓ Unit Available for Booking' : '✕ Reserved / Unavailable'}
                    </span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.4rem', color: '#0f172a' }}>
                      {availabilityResult.unitName} (Unit {availabilityResult.unitNumber})
                    </h3>
                    <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                      {availabilityResult.propertyName} • Stay: {availabilityResult.checkInDate} to {availabilityResult.checkOutDate} (1 Night)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Rate</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>${availabilityResult.totalAmount}</div>
                  </div>
                </div>

                {availabilityResult.isAvailable && (
                  <form onSubmit={handleCreateBooking} style={{ borderTop: '1px solid #bbf7d0', paddingTop: '1.25rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#065f46', marginBottom: '0.75rem' }}>
                      Enter Guest Details to Confirm Reservation:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                      <input
                        type="text"
                        placeholder="Full Name"
                        required
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                      <input
                        type="email"
                        placeholder="Email Address"
                        required
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                      <input
                        type="tel"
                        placeholder="Phone Number"
                        required
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={bookingLoading}
                      style={{
                        background: '#15803d',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: bookingLoading ? 'wait' : 'pointer',
                        boxShadow: '0 2px 6px rgba(21, 128, 61, 0.3)',
                      }}
                    >
                      {bookingLoading ? 'Processing Booking...' : 'Complete Online Reservation →'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Properties Showcase Section (Section 1 & 12) */}
      <section id="properties" style={{ padding: 'clamp(2.5rem, 5vw, 4.5rem) 1.25rem', maxWidth: '1240px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Dynamic Portfolio
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.75rem, 4vw, 2.2rem)', fontWeight: 800, color: '#0f172a' }}>
            BFA Managed Properties
          </h2>
          <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: '600px', margin: '0.5rem auto 0' }}>
            Every property in our portfolio is engineered for optimal tenant comfort, security, and serviced luxury.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1.75rem' }}>
          {properties.map((prop) => (
            <div
              key={prop.id}
              style={{
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                background: '#ffffff',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
                transition: 'transform 200ms ease, box-shadow 200ms ease',
              }}
            >
              <div
                style={{
                  height: '180px',
                  background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  position: 'relative',
                }}
              >
                <div style={{ fontSize: '3rem' }}>🏢</div>
                <div
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: '#2563eb',
                    color: '#fff',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {prop.code}
                </div>
              </div>
              <div style={{ padding: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.35rem' }}>
                  {prop.name}
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  📍 {prop.address}, {prop.city}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Capacity</span>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{prop.total_units} Rentable Units</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Starting From</span>
                    <div style={{ fontWeight: 800, color: '#2563eb', fontSize: '1.15rem' }}>${prop.starting_rate || '150'}/nt</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Features & Services Section */}
      <section id="features" style={{ padding: 'clamp(2.5rem, 5vw, 4.5rem) 1.25rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.75rem, 4vw, 2.2rem)', fontWeight: 800, color: '#0f172a' }}>
              Standard Across Every BFA Residence
            </h2>
            <p style={{ color: '#64748b', fontSize: '1rem' }}>
              Uncompromising service standards delivering complete peace of mind.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1.5rem' }}>
            {[
              { icon: '⚡', title: '24/7 Guaranteed Power', desc: 'Dual-redundant generators and continuous uninterrupted solar-hybrid supply.' },
              { icon: '🌐', title: 'Enterprise Fiber Internet', desc: 'Ultra-low latency dedicated Wi-Fi 6 connectivity in every suite.' },
              { icon: '🛡️', title: 'Concierge & Security', desc: 'Round-the-clock trained security personnel, access control, and front-desk reception.' },
              { icon: '🧹', title: 'Executive Housekeeping', desc: 'Rigorous hygiene standards, fresh linens, and daily turnover workflows.' },
              { icon: '🔧', title: 'Rapid Maintenance', desc: 'Dedicated in-house technicians responding swiftly to any operational requests.' },
              { icon: '🚗', title: 'Secure On-site Parking', desc: 'Dedicated tenant parking spaces with CCTV surveillance.' },
            ].map((f, i) => (
              <div
                key={i}
                style={{
                  background: '#ffffff',
                  padding: '1.75rem',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{f.icon}</div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.35rem' }}>{f.title}</h4>
                <p style={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer style={{ background: '#0f172a', color: '#94a3b8', padding: '3.5rem 1.5rem 2rem' }}>
        <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2rem', marginBottom: '2.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#fff', fontWeight: 800, fontSize: '1.2rem', marginBottom: '0.75rem' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>B</div>
              BFA APARTMENTS
            </div>
            <p style={{ fontSize: '0.88rem', maxWidth: '320px', lineHeight: 1.6 }}>
              Multi-property enterprise property and serviced apartment management.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1.75rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>Navigation</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                <li><a href="#properties" style={{ color: '#94a3b8', textDecoration: 'none' }}>Properties</a></li>
                <li><a href="#booking" style={{ color: '#94a3b8', textDecoration: 'none' }}>Online Booking</a></li>
                <li><a href="#features" style={{ color: '#94a3b8', textDecoration: 'none' }}>Amenities</a></li>
              </ul>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>Staff & Partners</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                <li>
                  <Link to="/login" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 600 }}>
                    Portal Login →
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '1240px', margin: '0 auto', borderTop: '1px solid #1e293b', paddingTop: '1.5rem', fontSize: '0.8rem', textAlign: 'center' }}>
          © {new Date().getFullYear()} BFA Apartments Management System. All rights reserved.
        </div>
      </footer>

      {/* Confirmation Modal */}
      {confirmedBooking && (
        <Modal
          isOpen={!!confirmedBooking}
          onClose={() => setConfirmedBooking(null)}
          title="Reservation Confirmed! 🎉"
        >
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#15803d',
                fontSize: '1.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              ✓
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
              Thank You, {confirmedBooking.guestName}!
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Your 1-night stay has been confirmed in our authoritative reservation registry.
            </p>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1.25rem',
                textAlign: 'left',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Reservation Code:</span>
                <span style={{ fontWeight: 800, color: '#2563eb' }}>{confirmedBooking.reservationCode}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Property:</span>
                <span style={{ fontWeight: 600 }}>{confirmedBooking.propertyName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Unit:</span>
                <span style={{ fontWeight: 600 }}>{confirmedBooking.unitName} (#{confirmedBooking.unitNumber})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Stay Dates:</span>
                <span style={{ fontWeight: 600 }}>{confirmedBooking.checkInDate} to {confirmedBooking.checkOutDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>Total Amount:</span>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#059669' }}>${confirmedBooking.totalAmount}</span>
              </div>
            </div>

            <Button variant="primary" onClick={() => setConfirmedBooking(null)}>
              Done
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
