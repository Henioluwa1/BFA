import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Phone, Mail, MapPin, ShieldCheck, ArrowRight } from 'lucide-react';
import './PublicFooter.css';

/**
 * PublicFooter — Complete, responsive luxury footer with verified information
 */
export default function PublicFooter({
  onOpenTracking,
}) {
  return (
    <footer className="bfa-public-footer" role="contentinfo">
      <div className="bfa-footer-container">
        {/* Top Footer Grid */}
        <div className="bfa-footer-main-grid">
          {/* Col 1: Brand & Identity */}
          <div className="bfa-footer-brand-col">
            <div className="bfa-footer-logo">
              <span className="bfa-footer-logo-glyph">⠿</span>
              <span className="bfa-footer-logo-text">BFA APARTMENTS</span>
            </div>
            <span className="bfa-footer-tagline">Serviced Residences • Akure</span>
            <p className="bfa-footer-about-text">
              Three autonomous, secure serviced properties engineered with verified 24/7 dual-grid solar power, dedicated fiber Wi-Fi 6, and discreet executive hospitality across Ondo State.
            </p>
            <div className="bfa-footer-security-pill">
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Cryptographically Verified Stays</span>
            </div>
          </div>

          {/* Col 2: Enclave Locations */}
          <div className="bfa-footer-col">
            <h4 className="bfa-footer-heading">Residential Enclaves</h4>
            <ul className="bfa-footer-list">
              <li>
                <Link to="/property/1" className="bfa-footer-link">
                  <strong>Grand Horizon Tower</strong>
                  <small>Plot 14, Alagbaka GRA Extension</small>
                </Link>
              </li>
              <li>
                <Link to="/property/2" className="bfa-footer-link">
                  <strong>Azure Bay Residences</strong>
                  <small>Block 7, Ijapo Central Estate</small>
                </Link>
              </li>
              <li>
                <Link to="/property/3" className="bfa-footer-link">
                  <strong>The Royal Palms Suites</strong>
                  <small>Presidential Boulevard, Oba-Ile</small>
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Navigation & Guest Services */}
          <div className="bfa-footer-col">
            <h4 className="bfa-footer-heading">Guest Discovery</h4>
            <ul className="bfa-footer-nav-list">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/properties">Curated Residences</Link></li>
              <li><Link to="/about">About Us</Link></li>
              <li><Link to="/contact">Contact Us</Link></li>
              <li><Link to="/design-system">Design System Specifications</Link></li>
              <li>
                <Link
                  to="/track"
                  className="bfa-footer-link"
                  style={{ color: 'var(--bfa-lux-champagne, #b99a70)', fontWeight: 600 }}
                  onClick={() => onOpenTracking && onOpenTracking()}
                >
                  Track Existing Reservation →
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Verified Contact */}
          <div className="bfa-footer-col">
            <h4 className="bfa-footer-heading">Front Desk &amp; Concierge</h4>
            <div className="bfa-footer-contact-items">
              <div className="bfa-footer-contact-line">
                <Phone size={14} aria-hidden="true" />
                <span>Concierge: +234 800 232 4000</span>
              </div>
              <div className="bfa-footer-contact-line">
                <Mail size={14} aria-hidden="true" />
                <span>concierge@bfa-apartments.com</span>
              </div>
              <div className="bfa-footer-contact-line">
                <MapPin size={14} aria-hidden="true" />
                <span>Akure Central Operations Desk</span>
              </div>
            </div>
            <div className="bfa-footer-policy-note">
              <strong>Stay Policy:</strong> Strictly 1-night stay per booking. Check-in 14:00, Check-out 11:00.
            </div>
          </div>
        </div>

        {/* Bottom Legal / Copyright Row */}
        <div className="bfa-footer-bottom-row">
          <div className="bfa-footer-copy">
            © {new Date().getFullYear()} BFA Serviced Luxury Apartments Ltd. All rights reserved. Registered hospitality provider in Ondo State, Nigeria.
          </div>
          <div className="bfa-footer-badges">
            <span>24/7 Dual-Grid Power</span>
            <span className="bfa-footer-dot">•</span>
            <span>Enterprise Fiber Wi-Fi</span>
            <span className="bfa-footer-dot">•</span>
            <span>Front-Desk Verified Stays</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

