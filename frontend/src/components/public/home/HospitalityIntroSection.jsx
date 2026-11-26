import React from 'react';
import {
  Zap,
  Wifi,
  ShieldCheck,
  Headphones,
  KeyRound,
} from 'lucide-react';
import heroArchitecture from '../../../assets/hero-architecture.jpg';
import './HospitalityIntroSection.css';

/**
 * HospitalityIntroSection — 2-Column Editorial Architectural Specification Split
 */
export default function HospitalityIntroSection() {
  const pillars = [
    {
      num: '01',
      icon: <Zap size={18} aria-hidden="true" />,
      title: 'Dual-Grid Uninterrupted Power',
      description:
        'Industrial Cummins diesel generation coupled to high-capacity solar inverter systems guarantees constant power across all residences.',
    },
    {
      num: '02',
      icon: <Wifi size={18} aria-hidden="true" />,
      title: 'Enterprise Dedicated Fiber Wi-Fi 6',
      description:
        'Dedicated high-bandwidth fiber connectivity in every suite, engineered for remote corporate executive workflows and HD streaming.',
    },
    {
      num: '03',
      icon: <ShieldCheck size={18} aria-hidden="true" />,
      title: 'Cryptographic Stay Verification',
      description:
        'Front-desk verified payment reconciliation with electronic key codes revealed only upon authorized confirmation.',
    },
    {
      num: '04',
      icon: <Headphones size={18} aria-hidden="true" />,
      title: '24/7 Resident Concierge Dispatch',
      description:
        'Direct round-the-clock access to on-site property management, prompt maintenance technicians, and airport chauffeur transfers.',
    },
  ];

  return (
    <section className="bfa-intro-section" aria-label="BFA Hospitality Standards">
      <div className="bfa-intro-container">
        <div className="bfa-intro-editorial-split">
          {/* Left Column: Editorial Headline + Architectural Photo + Protocol */}
          <div className="bfa-intro-left-col">
            <span className="bfa-intro-eyebrow">THE BFA STANDARD</span>
            <h2 className="bfa-intro-serif-title">
              Engineered for Reliability, <em>Privacy</em>, and Restful Living
            </h2>
            <p className="bfa-intro-lead">
              Every BFA residence is purpose-built for total infrastructural autonomy and discreet executive hospitality in Akure.
            </p>

            <div className="bfa-intro-photo-frame">
              <img
                src={heroArchitecture}
                alt="BFA Apartments architectural exterior in Akure"
                className="bfa-intro-photo"
                loading="lazy"
                decoding="async"
              />
            </div>

            <div className="bfa-intro-protocol-banner">
              <div className="bfa-protocol-left">
                <KeyRound className="bfa-protocol-icon" size={20} aria-hidden="true" />
                <div>
                  <h4 className="bfa-protocol-heading">Discreet Front-Desk Check-In Protocol</h4>
                  <p className="bfa-protocol-text">
                    Every reservation undergoes payment verification by an assigned front-office receptionist before electronic key passcodes are activated.
                  </p>
                </div>
              </div>
              <span className="bfa-protocol-tag">Verified Stays Only</span>
            </div>
          </div>

          {/* Right Column: Numbered 01–04 Architectural Specification Ledger */}
          <div className="bfa-intro-specs-ledger">
            {pillars.map((pillar) => (
              <div key={pillar.num} className="bfa-intro-spec-row">
                <div className="bfa-spec-num-col">
                  <span className="bfa-spec-num">{pillar.num}</span>
                  <div className="bfa-spec-icon">{pillar.icon}</div>
                </div>
                <div className="bfa-spec-body">
                  <h3 className="bfa-pillar-title">{pillar.title}</h3>
                  <p className="bfa-pillar-desc">{pillar.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
