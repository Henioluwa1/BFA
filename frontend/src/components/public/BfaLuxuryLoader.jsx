import React, { useState, useEffect, useRef } from 'react';

export default function BfaLuxuryLoader({ onComplete, isReady = false }) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Connecting to Verified Residences in Akure...');
  const [fadingOut, setFadingOut] = useState(false);
  const completedRef = useRef(false);

  const finishLoading = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setProgress(100);
    setStatusText('Welcome to BFA Apartments.');
    setTimeout(() => {
      setFadingOut(true);
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 250);
    }, 150);
  };

  // If essential data is ready early, dismiss immediately
  useEffect(() => {
    if (isReady && !completedRef.current) {
      finishLoading();
    }
  }, [isReady]);

  useEffect(() => {
    const totalDuration = 2000; // Capped to maximum 2 seconds
    const intervalTime = 40;
    const increment = 100 / (totalDuration / intervalTime);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (completedRef.current) {
          clearInterval(timer);
          return 100;
        }

        const next = prev + increment;
        if (next >= 100) {
          clearInterval(timer);
          finishLoading();
          return 100;
        }

        // Rotate status text over max 2 seconds
        if (next < 35) {
          setStatusText('Connecting to Verified Residences in Akure...');
        } else if (next < 70) {
          setStatusText('Curating Serviced Suites & Enclaves...');
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

