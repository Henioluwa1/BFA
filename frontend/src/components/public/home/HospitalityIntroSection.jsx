import React from 'react';
import {
  Zap,
  Wifi,
  ShieldCheck,
  Headphones,
  Sparkles,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { BfaBadge } from '../primitives';
import './HospitalityIntroSection.css';

/**
 * HospitalityIntroSection — Factual, polished explanation of BFA standards
 */
export default function HospitalityIntroSection() {
  const pillars = [
    {
      icon: <Zap size={22} aria-hidden="true" />,
      title: 'Dual-Grid Uninterrupted Power',
      description:
        'Industrial Cummins diesel generation coupled to high-capacity solar inverter systems guarantees constant power across all residences.',
    },
    {
      icon: <Wifi size={22} aria-hidden="true" />,
      title: 'Enterprise Dedicated Fiber Wi-Fi 6',
      description:
        'Dedicated high-bandwidth fiber connectivity in every suite, engineered for remote corporate executive workflows and HD streaming.',
    },
    {
      icon: <ShieldCheck size={22} aria-hidden="true" />,
      title: 'Cryptographic Stay Verification',
      description:
        'Front-desk verified payment reconciliation with electronic key codes revealed only upon authorized confirmation.',
    },
    {
      icon: <Headphones size={22} aria-hidden="true" />,
      title: '24/7 Resident Concierge Dispatch',
      description:
        'Direct round-the-clock access to on-site property management, prompt maintenance technicians, and airport chauffeur transfers.',
    },
  ];

  return (
    <section className="bfa-intro-section" aria-label="BFA Hospitality Standards">
      <div className="bfa-intro-container">
        {/* Intro Topline Header */}
        <div className="bfa-intro-header">
          <h2 className="bfa-intro-title">
            Engineered for Reliability, Privacy, and Restful Living
          </h2>
        </div>

        {/* 4 Infrastructure Pillars Grid */}
        <div className="bfa-intro-pillars-grid">
          {pillars.map((pillar, idx) => (
            <div key={idx} className="bfa-intro-pillar-card">
              <div className="bfa-pillar-icon-box">{pillar.icon}</div>
              <h3 className="bfa-pillar-title">{pillar.title}</h3>
              <p className="bfa-pillar-desc">{pillar.description}</p>
            </div>
          ))}
        </div>

        {/* Protocol Strip */}
        <div className="bfa-intro-protocol-banner">
          <div className="bfa-protocol-left">
            <KeyRound className="bfa-protocol-icon" size={24} aria-hidden="true" />
            <div>
              <h4 className="bfa-protocol-heading">Discreet Front-Desk Check-In Protocol</h4>
              <p className="bfa-protocol-text">
                Every reservation undergoes payment verification by an assigned front-office receptionist before electronic key passcodes are activated.
              </p>
            </div>
          </div>
          <div className="bfa-protocol-tag">
            <span>Verified Stays Only</span>
          </div>
        </div>
      </div>
    </section>
  );
}

