import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2 } from 'lucide-react';
import { BfaButton } from '../primitives';
import { resolveMediaUrl } from '../../../services/api';
import './SuiteTypesPreviewSection.css';

/**
 * SuiteTypesPreviewSection — Editorial Alternating Lookbook
 * Dynamically populated from portal-managed apartments when available.
 */
export default function SuiteTypesPreviewSection({ apartments = [] }) {
  const findPhotoForTier = (matcher, fallbackIdx) => {
    const match = apartments.find(matcher);
    const candidate = match || apartments[fallbackIdx] || apartments[0];
    return candidate ? resolveMediaUrl(candidate.primary_photo_url || candidate.main_photo) : '';
  };

  const suiteTiers = [
    {
      num: '01',
      title: 'Presidential Penthouses & Grand Salons',
      category: 'Top-Tier Residences',
      image: findPhotoForTier((a) => /penthouse|presidential/i.test(`${a.unit_type || ''} ${a.unit_name || ''}`), 0),
      enclave: 'Flagship Residences',
      specs: '1–2 Master Bedrooms • Private Verandahs • Bespoke Finishes',
      description:
        'Expansive reception salons, panoramic terrace vistas, and bespoke furnishing designed for heads of mission and corporate executives.',
    },
    {
      num: '02',
      title: 'Multi-Bedroom Serviced Apartments',
      category: 'Spacious Group Stays',
      image: findPhotoForTier((a) => /2-bedroom|3-bedroom|waterfront|luxury/i.test(`${a.unit_type || ''} ${a.unit_name || ''}`), 1),
      enclave: 'Family & Delegation Suites',
      specs: '2–3 Bedrooms • All Ensuite • Fully Fitted Quartz Kitchen',
      description:
        'Ideal for diplomatic delegations, visiting executive teams, and families desiring privacy, separate living quarters, and dedicated dining salons.',
    },
    {
      num: '03',
      title: 'Deluxe Executive Suites & Studios',
      category: 'Executive Stays',
      image: findPhotoForTier((a) => /studio|deluxe|executive/i.test(`${a.unit_type || ''} ${a.unit_name || ''}`), 2),
      enclave: 'Available Across Our Properties',
      specs: '1 King Bed • Dedicated Workspace • Spa Rain Shower',
      description:
        'Engineered for focused business travel, offering enterprise Wi-Fi 6, ergonomic work lounges, and restful king-size bedding.',
    },
  ];

  return (
    <section className="bfa-suite-preview-section" aria-label="Accommodation Tiers">
      <div className="bfa-suite-preview-container">
        <div className="bfa-suite-preview-header">
          <div>
            <span className="bfa-suite-eyebrow">ACCOMMODATION LOOKBOOK</span>
            <h2 className="bfa-suite-preview-title">Tailored for Every Executive Need</h2>
          </div>
          <Link to="/properties" className="bfa-suite-header-link">
            <BfaButton variant="outline" size="md" iconRight={<ArrowRight size={14} />}>
              Explore Full Property Catalog
            </BfaButton>
          </Link>
        </div>

        <div className="bfa-suite-lookbook">
          {suiteTiers.map((tier, idx) => (
            <article
              key={tier.num}
              className={`bfa-lookbook-row ${idx % 2 === 1 ? 'bfa-lookbook-row--reversed' : ''}`}
            >
              <div className="bfa-lookbook-media">
                {tier.image ? (
                  <img
                    src={tier.image}
                    alt={tier.title}
                    className="bfa-suite-img"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div
                    className="bfa-suite-img"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #0b1b15 0%, #163329 100%)',
                      color: '#d4af37',
                    }}
                  >
                    <Building2 size={44} />
                  </div>
                )}
                <span className="bfa-suite-tag">{tier.category}</span>
              </div>

              <div className="bfa-lookbook-body">
                <span className="bfa-lookbook-num">{tier.num} • {tier.enclave}</span>
                <h3 className="bfa-suite-name">{tier.title}</h3>
                <span className="bfa-suite-specs">{tier.specs}</span>
                <p className="bfa-suite-desc">{tier.description}</p>
                <Link to="/properties" className="bfa-suite-cta-link">
                  <span>View Suites in this Category</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
