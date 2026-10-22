import React, { useState, useEffect } from 'react';

/**
 * Confirmation Card Component for Consequential Operations
 * Strict Two-Phase Commit UI
 */
export default function ConfirmationCard({
  confirmation,
  onConfirm,
  onCancel,
  isExecuting,
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    if (confirmation?.expiresAt) {
      const diff = Math.floor((new Date(confirmation.expiresAt).getTime() - Date.now()) / 1000);
      return Math.max(0, diff);
    }
    return confirmation?.expiresInSeconds || 300;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const isExpired = secondsRemaining === 0;
  const params = confirmation?.parameters || {};

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="confirmation-card" role="region" aria-label="Action Confirmation Proposal">
      <div className="confirmation-header">
        <div className="confirmation-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>Confirmation Required: {confirmation?.actionId || 'Operation'}</span>
        </div>
        <div className="confirmation-expiry">
          {isExpired ? (
            <span style={{ color: '#ef4444' }}>⚠️ Expired</span>
          ) : (
            <span>⏱️ Expires in {formatSeconds(secondsRemaining)}</span>
          )}
        </div>
      </div>

      {/* Parameter Details */}
      <div className="confirmation-grid">
        {params.tenantName && (
          <div>
            <div className="confirmation-field-label">Guest Name</div>
            <div className="confirmation-field-value">{params.tenantName}</div>
          </div>
        )}
        {params.apartmentId && (
          <div>
            <div className="confirmation-field-label">Apartment ID</div>
            <div className="confirmation-field-value">Unit #{params.apartmentId}</div>
          </div>
        )}
        {params.checkInDate && (
          <div>
            <div className="confirmation-field-label">Check-in Date</div>
            <div className="confirmation-field-value">{params.checkInDate}</div>
          </div>
        )}
        {params.checkOutDate && (
          <div>
            <div className="confirmation-field-label">Check-out Date</div>
            <div className="confirmation-field-value">{params.checkOutDate} (1 Night)</div>
          </div>
        )}
        {params.tenantEmail && (
          <div>
            <div className="confirmation-field-label">Guest Email</div>
            <div className="confirmation-field-value">{params.tenantEmail}</div>
          </div>
        )}
        {params.tenantPhone && (
          <div>
            <div className="confirmation-field-label">Guest Phone</div>
            <div className="confirmation-field-value">{params.tenantPhone}</div>
          </div>
        )}
      </div>

      <div className="confirmation-impact-note">
        <strong>Impact:</strong> {confirmation?.summary || 'Executing this action will persist changes in the authoritative database.'}
      </div>

      {isExpired ? (
        <div style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>
          This proposal has expired. Please submit a new request.
        </div>
      ) : (
        <div className="confirmation-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onConfirm(confirmation.confirmationToken)}
            disabled={isExecuting || isExpired}
          >
            {isExecuting ? (
              <>
                <span className="spinner-border spinner-border-sm" style={{ width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                <span>Executing...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Confirm & Execute</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onCancel(confirmation.confirmationToken)}
            disabled={isExecuting}
          >
            Cancel Proposal
          </button>
        </div>
      )}
    </div>
  );
}
