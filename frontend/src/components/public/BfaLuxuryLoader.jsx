import React, { useState, useEffect } from 'react';

export default function BfaLuxuryLoader({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Connecting to Verified Residence Portals...');
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const totalDuration = 5000; // Exact 5 seconds
    const intervalTime = 50;
    const increment = 100 / (totalDuration / intervalTime);

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          setStatusText('Welcome to BFA Apartments.');
          setTimeout(() => {
            setFadingOut(true);
            setTimeout(() => {
              if (onComplete) onComplete();
            }, 550);
          }, 200);
          return 100;
        }

        // Rotate status text over 5 seconds
        if (next < 30) {
          setStatusText('Connecting to Verified Residence Portals...');
        } else if (next < 60) {
          setStatusText('Curating Luxury Suites & Penthouses...');
        } else if (next < 85) {
          setStatusText('Securing 24/7 Cryptographic Stays...');
        } else {
          setStatusText('Welcome to BFA Serviced Residences.');
        }

        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div
      className={`bfa-luxury-loader-overlay ${fadingOut ? 'fade-out' : ''}`}
      role="alert"
      aria-live="polite"
      aria-label="Loading BFA Apartments"
    >
      <div className="bfa-loader-content">
        {/* Glowing Animated Monogram Logo */}
        <div className="bfa-loader-logo-wrap">
          <div className="bfa-loader-glow-ring" />
          <div className="bfa-loader-badge">
            <span className="bfa-loader-grid-icon">⠿</span>
          </div>
        </div>

        {/* Brand Typography */}
        <div className="bfa-loader-brand">
          <h2 className="bfa-loader-brand-title">BFA APARTMENTS</h2>
          <span className="bfa-loader-brand-sub">SERVICED RESIDENCES</span>
          <span className="bfa-loader-postcodes">ALAGBAKA • IJAPO ESTATE • OBA-ILE, AKURE</span>
        </div>

        {/* Shimmer Progress Track */}
        <div className="bfa-loader-progress-track">
          <div
            className="bfa-loader-progress-fill"
            style={{ width: `${Math.min(100, Math.round(progress))}%` }}
          />
        </div>

        {/* Status Text & Percentage */}
        <div className="bfa-loader-status-row">
          <span className="bfa-loader-status-msg">{statusText}</span>
          <span className="bfa-loader-percent">{Math.min(100, Math.round(progress))}%</span>
        </div>
      </div>
    </div>
  );
}

