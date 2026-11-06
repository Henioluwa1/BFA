import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  Phone,
  Clock,
  KeyRound,
  FileText,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { BfaButton, BfaBadge, BfaCard } from '../primitives';
import './GuestConvenienceSection.css';

/**
 * GuestConvenienceSection — Booking Tracking & Guest Services Hub
 */
export default function GuestConvenienceSection({
  onOpenTracking,
}) {
  const [referenceCode, setReferenceCode] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const handleTrackSubmit = (e) => {
    e.preventDefault();
    if (onOpenTracking) {
      onOpenTracking(referenceCode, guestEmail);
    }
  };

  return (
    <section className="bfa-guest-section" id="track" aria-label="Guest Services and Tracking">
      <div className="bfa-guest-container">
        <div className="bfa-guest-grid">
          {/* Column 1: Live Reservation Tracking Card */}
          <div className="bfa-guest-track-card">
            <div className="bfa-track-card-header">
              <h2 className="bfa-track-card-title">Track Your Reservation &amp; Access Key</h2>
              <p className="bfa-track-card-desc">
                Enter your booking reference and guest email to verify payment status, download booking receipts, or retrieve your electronic door passcode once confirmed by the front desk.
              </p>
            </div>

            <form onSubmit={handleTrackSubmit} className="bfa-track-form">
              <div className="bfa-track-form-fields">
                <div className="bfa-track-input-group">
                  <label htmlFor="bfa-track-code" className="bfa-track-label">
                    BOOKING REFERENCE *
                  </label>
                  <input
                    id="bfa-track-code"
                    type="text"
                    placeholder="e.g. BFA-GHT-ABC123"
                    value={referenceCode}
                    onChange={(e) => setReferenceCode(e.target.value)}
                    required
                    className="bfa-track-input bfa-track-input--mono"
                  />
                </div>

                <div className="bfa-track-input-group">
                  <label htmlFor="bfa-track-email" className="bfa-track-label">
                    GUEST EMAIL *
                  </label>
                  <input
                    id="bfa-track-email"
                    type="email"
                    placeholder="e.g. resident@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    required
                    className="bfa-track-input"
                  />
                </div>
              </div>

              <BfaButton
                type="submit"
                variant="primary"
                size="lg"
                iconRight={<Search size={16} />}
                className="bfa-track-submit-btn"
              >
                Lookup Reservation
              </BfaButton>
            </form>

            <div className="bfa-track-security-notice">
              <KeyRound size={14} aria-hidden="true" />
              <span>
                Security Guarantee: Key passcodes remain cryptographically concealed until front-desk payment verification.
              </span>
            </div>
          </div>

          {/* Column 2: Guest Guidelines & Assistance */}
          <div className="bfa-guest-info-column">
            {/* Assistance Card */}
            <BfaCard variant="default" elevation="sm" className="bfa-guest-service-card">
              <div className="bfa-service-card-icon">
                <Phone size={20} aria-hidden="true" />
              </div>
              <div className="bfa-service-card-body">
                <h3 className="bfa-service-card-title">Dedicated 24/7 Concierge Desk</h3>
                <p className="bfa-service-card-text">
                  Direct telephone and dispatch assistance for resident inquiries, corporate chauffeur transfers, or special arrival requests.
                </p>
                <div className="bfa-service-contact-info">
                  <span className="bfa-contact-item">Telephone: <strong>+234 800 232 4000</strong></span>
                  <span className="bfa-contact-item">Email: <strong>concierge@bfa-apartments.com</strong></span>
                </div>
                <Link to="/contact" className="bfa-service-card-link">
                  <span>Visit Concierge Desk</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </BfaCard>

            {/* Check-in Policies Card */}
            <BfaCard variant="default" elevation="sm" className="bfa-guest-service-card">
              <div className="bfa-service-card-icon">
                <Clock size={20} aria-hidden="true" />
              </div>
              <div className="bfa-service-card-body">
                <h3 className="bfa-service-card-title">Stay &amp; Check-In Guidelines</h3>
                <ul className="bfa-guidelines-list">
                  <li><strong>Check-in window:</strong> From 14:00 daily across all 3 enclaves.</li>
                  <li><strong>Check-out:</strong> By 11:00 on scheduled departure morning.</li>
                  <li><strong>Maximum Stay Rule:</strong> Strictly 1-night per reservation instance.</li>
                  <li><strong>Identification:</strong> Government-issued ID required for front-desk record.</li>
                </ul>
              </div>
            </BfaCard>
          </div>
        </div>
      </div>
    </section>
  );
}

