import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bed, Bath, Users, Sparkles } from 'lucide-react';
import { BfaButton, BfaBadge } from '../primitives';
import aptLivingLuxury from '../../../assets/apt-living-luxury.jpg';
import aptBedroomMaster from '../../../assets/apt-bedroom-master.jpg';
import aptPenthouseView from '../../../assets/apt-penthouse-view.jpg';
import './SuiteTypesPreviewSection.css';

/**
 * SuiteTypesPreviewSection — Curated accommodation tiers across enclaves
 */
export default function SuiteTypesPreviewSection() {
  const suiteTiers = [
    {
      title: 'Presidential Penthouses & Grand Salons',
      category: 'Top-Tier Residences',
      image: aptPenthouseView,
      enclave: 'Grand Horizon & Royal Palms',
      specs: '1–2 Master Bedrooms • Private Verandahs • Italian Finishes',
      description:
        'Expansive reception salons, panoramic terrace vistas across Akure, and bespoke furnishing designed for heads of mission and corporate executives.',
    },
    {
      title: 'Multi-Bedroom Serviced Apartments',
      category: 'Spacious Group Stays',
      image: aptLivingLuxury,
      enclave: 'Azure Bay & Grand Horizon',
      specs: '2–3 Bedrooms • All Ensuite • Fully Fitted Quartz Kitchen',
      description:
        'Ideal for diplomatic delegations, visiting executive teams, and families desiring privacy, separate living quarters, and dedicated dining salons.',
    },
    {
      title: 'Deluxe Executive Suites & Studios',
      category: 'Executive Stays',
      image: aptBedroomMaster,
      enclave: 'Available Across All 3 Enclaves',
      specs: '1 King Bed • Dedicated Workspace • Spa Rain Shower',
      description:
        'Engineered for focused business travel, offering enterprise Wi-Fi 6, ergonomic work lounges, and restful king-size bedding.',
    },
  ];

  return (
    <section className="bfa-suite-preview-section" aria-label="Accommodation Tiers">
      <div className="bfa-suite-preview-container">
        {/* Section Header */}
        <div className="bfa-suite-preview-header">
          <div>
            <h2 className="bfa-suite-preview-title">Tailored for Every Executive Need</h2>
          </div>
          <Link to="/properties" className="bfa-suite-header-link">
            <BfaButton variant="primary" size="md" iconRight={<ArrowRight size={14} />}>
              Explore Full Property Catalog
            </BfaButton>
          </Link>
        </div>

        {/* 3 Suite Tier Cards */}
        <div className="bfa-suite-grid">
          {suiteTiers.map((tier, idx) => (
            <article key={idx} className="bfa-suite-card">
              <div className="bfa-suite-img-wrapper">
                <img
                  src={tier.image}
                  alt={tier.title}
                  className="bfa-suite-img"
                  loading="lazy"
                />
                <span className="bfa-suite-tag">{tier.category}</span>
              </div>

              <div className="bfa-suite-content">
                <span className="bfa-suite-enclave">{tier.enclave}</span>
                <h3 className="bfa-suite-name">{tier.title}</h3>
                <span className="bfa-suite-specs">{tier.specs}</span>
                <p className="bfa-suite-desc">{tier.description}</p>

                <div className="bfa-suite-footer">
                  <Link to="/properties" className="bfa-suite-cta-link">
                    <span>View Suites in this Category</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

