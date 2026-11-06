import React, { useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  Zap,
  Wifi,
  Search,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Eye,
  Lock,
} from 'lucide-react';
import {
  BfaButton,
  BfaInput,
  BfaBadge,
  BfaCard,
} from './primitives';
import '../../styles/hospitalityTokens.css';
import './DesignSystemShowcase.css';

/**
 * DesignSystemShowcase
 * Live visual verification component for Phase 1 Hospitality Design System
 */
export default function DesignSystemShowcase() {
  const [inputText, setInputText] = useState('Executive Suite 101');
  const [selectedEnclave, setSelectedEnclave] = useState('ght');
  const [btnLoading, setBtnLoading] = useState(false);

  const colors = [
    { name: 'Deep Forest', hex: '#192A2A', role: 'Architectural brand dark, hero backgrounds, primary buttons' },
    { name: 'Warm Ivory', hex: '#F2EEE5', role: 'Secondary surfaces, subtle cards, luxury warmth' },
    { name: 'Muted Champagne', hex: '#B99A70', role: 'Primary CTA, accents, active states, focus rings' },
    { name: 'Pure White', hex: '#FFFFFF', role: 'Card surface, inputs, clean elevation' },
    { name: 'Soft Sage', hex: '#777D75', role: 'Secondary accents, supporting indicators, icons' },
    { name: 'Primary Text', hex: '#202625', role: 'Editorial body copy, card headings' },
    { name: 'Secondary Text', hex: '#737A75', role: 'Supporting text, captions, metadata' },
    { name: 'Subtle Borders', hex: '#E7E4DC', role: 'Card outlines, dividing rules, dividers' },
  ];

  return (
    <section className="bfa-hospitality-scope bfa-ds-showcase" id="design-system">
      <div className="bfa-ds-inner">
        {/* Header */}
        <header className="bfa-ds-header">
          <BfaBadge variant="champagne" size="md" icon={<Sparkles size={12} />}>
            Phase 1 • Hospitality Design System
          </BfaBadge>
          <h2 className="bfa-ds-title">Refined Architectural Design Tokens & Primitives</h2>
          <p className="bfa-ds-subtitle">
            Warm editorial hospitality aesthetics combining boutique luxury, accessible 44px touch targets, and isolated CSS tokens.
          </p>
        </header>

        {/* 1. PALETTE */}
        <div className="bfa-ds-section">
          <h3 className="bfa-ds-section-heading">1. Approved Hospitality Palette</h3>
          <div className="bfa-ds-palette-grid">
            {colors.map((c) => (
              <div key={c.name} className="bfa-ds-color-card">
                <div
                  className="bfa-ds-color-swatch"
                  style={{
                    backgroundColor: c.hex,
                    border: c.hex === '#FFFFFF' || c.hex === '#F2EEE5' ? '1px solid #E7E4DC' : 'none',
                  }}
                />
                <div className="bfa-ds-color-info">
                  <strong>{c.name}</strong>
                  <code>{c.hex}</code>
                  <small>{c.role}</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. BUTTONS & TOUCH TARGETS */}
        <div className="bfa-ds-section">
          <h3 className="bfa-ds-section-heading">2. Accessible Buttons (Min 44×44px Touch Targets)</h3>
          <div className="bfa-ds-button-matrix">
            <div className="bfa-ds-btn-group">
              <span className="bfa-ds-label">Primary (Champagne)</span>
              <div className="bfa-ds-row">
                <BfaButton variant="primary" size="sm">Small (44px)</BfaButton>
                <BfaButton variant="primary" size="md">Medium (48px)</BfaButton>
                <BfaButton variant="primary" size="lg" iconRight={<ArrowRight size={16} />}>
                  Large (54px)
                </BfaButton>
              </div>
            </div>

            <div className="bfa-ds-btn-group">
              <span className="bfa-ds-label">Forest (Architectural Dark)</span>
              <div className="bfa-ds-row">
                <BfaButton variant="forest" size="md" iconLeft={<ShieldCheck size={16} />}>
                  Verified Reservation
                </BfaButton>
                <BfaButton variant="forest" size="md" disabled>
                  Disabled State
                </BfaButton>
              </div>
            </div>

            <div className="bfa-ds-btn-group">
              <span className="bfa-ds-label">Secondary (Warm Ivory) & Outline</span>
              <div className="bfa-ds-row">
                <BfaButton variant="secondary" size="md">Secondary Ivory</BfaButton>
                <BfaButton variant="outline" size="md">Outline Border</BfaButton>
                <BfaButton variant="ghost" size="md">Ghost Text</BfaButton>
                <BfaButton
                  variant="primary"
                  size="md"
                  isLoading={btnLoading}
                  onClick={() => {
                    setBtnLoading(true);
                    setTimeout(() => setBtnLoading(false), 2000);
                  }}
                >
                  {btnLoading ? 'Processing...' : 'Click for Loading State'}
                </BfaButton>
              </div>
            </div>
          </div>
        </div>

        {/* 3. FORM CONTROLS & INPUTS */}
        <div className="bfa-ds-section">
          <h3 className="bfa-ds-section-heading">3. Form Controls & Validation States</h3>
          <div className="bfa-ds-inputs-grid">
            <BfaInput
              label="Apartment / Suite Name"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              iconLeft={<Search size={16} />}
              helperText="Enter property or suite designation"
            />

            <BfaInput
              as="select"
              label="Residential Enclave"
              value={selectedEnclave}
              onChange={(e) => setSelectedEnclave(e.target.value)}
              options={[
                { value: 'ght', label: 'Grand Horizon Tower — Alagbaka GRA' },
                { value: 'abr', label: 'Azure Bay Residences — Ijapo Estate' },
                { value: 'rps', label: 'The Royal Palms Suites — Oba-Ile' },
              ]}
              helperText="Select one of three independent Akure enclaves"
            />

            <BfaInput
              label="Required Email (With Error State)"
              type="email"
              value="invalid-email-address"
              error="Please provide a valid corporate or guest email address"
              required
            />

            <BfaInput
              label="Disabled Control"
              value="Cryptographic Security Active"
              disabled
              iconLeft={<Lock size={15} />}
              helperText="Auto-generated cryptographic security state"
            />
          </div>
        </div>

        {/* 4. STATUS BADGES */}
        <div className="bfa-ds-section">
          <h3 className="bfa-ds-section-heading">4. Luxury Status & Amenity Badges</h3>
          <div className="bfa-ds-badges-row">
            <BfaBadge variant="champagne" icon={<Sparkles size={12} />}>
              BFA Signature
            </BfaBadge>
            <BfaBadge variant="forest" icon={<ShieldCheck size={12} />}>
              Verified Enclave
            </BfaBadge>
            <BfaBadge variant="success" icon={<CheckCircle2 size={12} />}>
              Available Now
            </BfaBadge>
            <BfaBadge variant="pending" icon={<AlertTriangle size={12} />}>
              Pending Review
            </BfaBadge>
            <BfaBadge variant="confirmed">
              Payment Verified
            </BfaBadge>
            <BfaBadge variant="ivory" icon={<Zap size={12} />}>
              24/7 Dual-Grid Power
            </BfaBadge>
            <BfaBadge variant="sage" icon={<Wifi size={12} />}>
              500 Mbps Fiber
            </BfaBadge>
          </div>
        </div>

        {/* 5. CARDS & ELEVATION */}
        <div className="bfa-ds-section">
          <h3 className="bfa-ds-section-heading">5. Hospitality Cards & Elevation</h3>
          <div className="bfa-ds-cards-grid">
            <BfaCard variant="default" elevation="sm" interactive className="bfa-ds-sample-card">
              <div className="bfa-ds-card-content">
                <BfaBadge variant="champagne" size="sm">Elevated Card</BfaBadge>
                <h4>Default Surface (Pure White)</h4>
                <p>Clean border with restrained elevation shadow and smooth hover translateY effect.</p>
                <div className="bfa-ds-card-footer">
                  <code>elevation: sm</code>
                  <span className="bfa-ds-tag">Interactive</span>
                </div>
              </div>
            </BfaCard>

            <BfaCard variant="ivory" elevation="none" className="bfa-ds-sample-card">
              <div className="bfa-ds-card-content">
                <BfaBadge variant="forest" size="sm">Ivory Contrast</BfaBadge>
                <h4>Warm Ivory Canvas (#F2EEE5)</h4>
                <p>Designed for supporting summaries, stay breakdowns, and quote reviews.</p>
                <div className="bfa-ds-card-footer">
                  <code>background: #F2EEE5</code>
                  <span className="bfa-ds-tag">Static</span>
                </div>
              </div>
            </BfaCard>

            <BfaCard variant="forest" elevation="md" className="bfa-ds-sample-card">
              <div className="bfa-ds-card-content">
                <BfaBadge variant="champagne" size="sm">Architectural Dark</BfaBadge>
                <h4>Deep Forest Canvas (#192A2A)</h4>
                <p>Atmospheric dark luxury treatment for executive hero cards and key highlights.</p>
                <div className="bfa-ds-card-footer">
                  <code>color: #F2EEE5</code>
                  <span className="bfa-ds-tag">Forest</span>
                </div>
              </div>
            </BfaCard>
          </div>
        </div>
      </div>
    </section>
  );
}

