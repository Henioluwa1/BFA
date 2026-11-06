import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { AlertCircle, RefreshCw, CheckCircle, AlertTriangle, ShieldCheck, Copy, Key, Building } from '../ui/Icons';
import { workforceService } from '../../services/api';

export default function KioskManagementModal({
  isOpen,
  onClose,
  properties = [],
  currentUser,
  activePropertyId,
}) {
  const isOpsManager = ['OPERATIONS_MANAGER', 'MANAGER'].includes(currentUser?.role);
  const canRegister = ['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(currentUser?.role);

  const defaultPropId = isOpsManager
    ? (currentUser?.propertyId || currentUser?.property_id || activePropertyId || '1')
    : (activePropertyId !== 'all' ? activePropertyId : 'all');

  const [selectedPropertyId, setSelectedPropertyId] = useState(defaultPropId);
  const [kiosks, setKiosks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sub-modal for registration
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    property_id: defaultPropId !== 'all' ? defaultPropId : (properties[0]?.id || '1'),
    kiosk_name: '',
    kiosk_code: '',
    kiosk_secret: '',
  });

  // DEF-B07: One-Time Credential Modal State (Cleared on dismiss/close)
  const [credentialModalData, setCredentialModalData] = useState(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copyError, setCopyError] = useState(null);
  const [rotatingKioskId, setRotatingKioskId] = useState(null);

  const fetchKiosks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const propId = selectedPropertyId !== 'all' ? selectedPropertyId : undefined;
      const res = await workforceService.listKiosks({ propertyId: propId });
      setKiosks(res?.data || res || []);
    } catch (err) {
      console.error('Failed to load kiosks:', err);
      setError(err.message || 'Error loading property kiosks');
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    if (isOpen) {
      fetchKiosks();
    } else {
      // Sensitive state wiping on modal close
      setCredentialModalData(null);
      setCopiedSecret(false);
      setCopiedCode(false);
      setCopyError(null);
      setIsRegisterOpen(false);
      setRegisterForm({
        property_id: defaultPropId !== 'all' ? defaultPropId : (properties[0]?.id || '1'),
        kiosk_name: '',
        kiosk_code: '',
        kiosk_secret: '',
      });
    }
  }, [isOpen, fetchKiosks, defaultPropId, properties]);

  // Safe close handler that always wipes sensitive credentials
  const handleModalClose = () => {
    setCredentialModalData(null);
    setCopiedSecret(false);
    setCopiedCode(false);
    setCopyError(null);
    setIsRegisterOpen(false);
    setRegisterForm({
      property_id: defaultPropId !== 'all' ? defaultPropId : (properties[0]?.id || '1'),
      kiosk_name: '',
      kiosk_code: '',
      kiosk_secret: '',
    });
    onClose?.();
  };

  // Status toggle handler
  const handleToggleStatus = async (kiosk, newStatus) => {
    if (newStatus === 'REVOKED' && !window.confirm(`Permanently revoke access for kiosk "${kiosk.kiosk_name}" (${kiosk.kiosk_code})?\n\nThis device terminal will be permanently disabled.`)) {
      return;
    }
    try {
      await workforceService.updateKioskStatus(kiosk.id, { status: newStatus });
      fetchKiosks();
    } catch (err) {
      alert(`Failed to update kiosk status: ${err.message}`);
    }
  };

  // DEF-B07 & Backend Secret Rotation Integration
  const handleRotateSecret = async (kiosk) => {
    if (!window.confirm(`Rotate credentials for kiosk terminal "${kiosk.kiosk_name}" (${kiosk.kiosk_code})?\n\nThe current passkey will be immediately invalidated and the physical tablet must be re-authenticated.`)) {
      return;
    }
    setRotatingKioskId(kiosk.id);
    try {
      const res = await workforceService.rotateKioskSecret(kiosk.id);
      const data = res?.data || res;
      const newSecret = data?.kiosk_secret || '';

      setCredentialModalData({
        title: 'Kiosk Credentials Rotated Successfully',
        subtitle: 'The previous secret has been invalidated. Enter the new passkey into the hardware tablet.',
        kiosk_name: kiosk.kiosk_name,
        kiosk_code: kiosk.kiosk_code,
        kiosk_secret: newSecret,
        isRotation: true,
      });
      fetchKiosks();
    } catch (err) {
      alert(`Credential rotation failed: ${err.message}`);
    } finally {
      setRotatingKioskId(null);
    }
  };

  // DEF-B07 Clipboard Copy with Browser Fallback
  const handleCopyText = async (text, type = 'secret') => {
    if (!text) return;
    setCopyError(null);

    // 1. Modern Navigator Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        if (type === 'secret') {
          setCopiedSecret(true);
          setTimeout(() => setCopiedSecret(false), 2500);
        } else {
          setCopiedCode(true);
          setTimeout(() => setCopiedCode(false), 2500);
        }
        return;
      } catch (clipErr) {
        // Fall through to textarea execCommand fallback
      }
    }

    // 2. ExecCommand textarea fallback
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.top = '-9999px';
      el.style.left = '-9999px';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(el);

      if (successful) {
        if (type === 'secret') {
          setCopiedSecret(true);
          setTimeout(() => setCopiedSecret(false), 2500);
        } else {
          setCopiedCode(true);
          setTimeout(() => setCopiedCode(false), 2500);
        }
      } else {
        throw new Error('execCommand returned false');
      }
    } catch (fallbackErr) {
      setCopyError('Clipboard access restricted. Please select the text and copy manually.');
    }
  };

  // Generate random credentials for registration form
  const handleGenerateCredentials = () => {
    const prop = properties.find((p) => String(p.id) === String(registerForm.property_id));
    const prefix = prop?.code || 'GHT';
    const randNum = Math.floor(100 + Math.random() * 900);
    const randSecret = Math.random().toString(36).substring(2, 8) + '-' + Math.random().toString(36).substring(2, 8);

    setRegisterForm((prev) => ({
      ...prev,
      kiosk_code: `KIOSK-${prefix}-${randNum}`,
      kiosk_secret: `bfa-${randSecret}-2026`,
    }));
  };

  const handleOpenRegister = () => {
    const targetPropId = selectedPropertyId !== 'all' ? selectedPropertyId : (properties[0]?.id || '1');
    const prop = properties.find((p) => String(p.id) === String(targetPropId));
    const prefix = prop?.code || 'GHT';
    const randNum = Math.floor(10 + Math.random() * 90);
    const randSecret = Math.random().toString(36).substring(2, 8) + '-' + Math.random().toString(36).substring(2, 8);

    setRegisterForm({
      property_id: targetPropId,
      kiosk_name: `${prop?.name || 'Reception'} Terminal 1`,
      kiosk_code: `KIOSK-${prefix}-${randNum}`,
      kiosk_secret: `bfa-${randSecret}-2026`,
    });
    setCredentialModalData(null);
    setIsRegisterOpen(true);
  };

  const handleSubmitRegister = async (e) => {
    e.preventDefault();
    setRegisterLoading(true);
    try {
      const res = await workforceService.registerKiosk({
        property_id: Number(registerForm.property_id),
        kiosk_name: registerForm.kiosk_name,
        kiosk_code: registerForm.kiosk_code,
        kiosk_secret: registerForm.kiosk_secret,
      });

      const resData = res?.data || res;
      const returnedSecret = resData?.kiosk_secret || registerForm.kiosk_secret;

      // DEF-B07: Save one-time credentials for the success modal
      setCredentialModalData({
        title: 'Terminal Registered Successfully!',
        subtitle: 'Enter the provisioned credentials into the physical tablet terminal setup interface.',
        kiosk_name: registerForm.kiosk_name,
        kiosk_code: registerForm.kiosk_code,
        kiosk_secret: returnedSecret,
        isRotation: false,
      });

      // Clear the input form secret immediately
      setRegisterForm((prev) => ({ ...prev, kiosk_secret: '' }));
      setIsRegisterOpen(false);
      fetchKiosks();
    } catch (err) {
      alert(`Failed to register kiosk: ${err.message}`);
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleDismissCredentialModal = () => {
    // Clear all sensitive credentials from memory
    setCredentialModalData(null);
    setCopiedSecret(false);
    setCopiedCode(false);
    setCopyError(null);
    setRegisterForm({
      property_id: defaultPropId !== 'all' ? defaultPropId : (properties[0]?.id || '1'),
      kiosk_name: '',
      kiosk_code: '',
      kiosk_secret: '',
    });
  };

  const activeCount = kiosks.filter((k) => k.status === 'ACTIVE').length;

  return (
    <>
      <style>{`
        /* Responsive Kiosk Modal Layouts (DEF-B08) */
        .kiosk-desktop-table-container {
          display: block;
          max-height: 380px;
          overflow-y: auto;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          width: 100%;
          box-sizing: border-box;
        }

        .kiosk-mobile-cards-container {
          display: none;
          flex-direction: column;
          gap: 0.75rem;
          max-height: 480px;
          overflow-y: auto;
          width: 100%;
          box-sizing: border-box;
        }

        @media (max-width: 767px) {
          .kiosk-desktop-table-container {
            display: none !important;
          }
          .kiosk-mobile-cards-container {
            display: flex !important;
          }
          .kiosk-toolbar-wrap {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .kiosk-filter-select {
            width: 100% !important;
            min-height: 44px !important;
          }
          .kiosk-reg-btn {
            width: 100% !important;
            min-height: 44px !important;
            justify-content: center !important;
          }
        }
      `}</style>

      <Modal
        isOpen={isOpen}
        onClose={handleModalClose}
        title="Property Attendance Kiosk Terminals"
        subtitle="Manage hardware terminals authorized for on-site employee clock-in"
        size="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', boxSizing: 'border-box' }}>
          {error && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                color: '#ef4444',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Toolbar & Filter Bar (DEF-B08: Responsive wrapping) */}
          <div
            className="kiosk-toolbar-wrap"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: '1 1 auto' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Filter Property:
              </span>
              <select
                className="input-field kiosk-filter-select"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                disabled={isOpsManager}
                style={{ minWidth: '150px', height: '36px', fontSize: '0.82rem' }}
              >
                {!isOpsManager && <option value="all">🏢 All Properties</option>}
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || `Property #${p.id}`}</option>
                ))}
              </select>

              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Active: <strong>{activeCount}</strong> / {kiosks.length}
              </span>
            </div>

            {canRegister ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenRegister}
                className="kiosk-reg-btn"
                style={{ fontSize: '0.8rem', minHeight: '36px' }}
              >
                + Register New Terminal
              </Button>
            ) : (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Registration requires Admin privileges
              </span>
            )}
          </div>

          {/* Content Loading / Empty / Responsive Views */}
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin-animation" style={{ color: 'var(--primary-color, #10b981)', margin: '0 auto' }} />
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Loading property kiosks...</div>
            </div>
          ) : kiosks.length === 0 ? (
            <div
              style={{
                padding: '3rem 1.5rem',
                textAlign: 'center',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📱</div>
              <p style={{ margin: 0, fontWeight: 600 }}>No kiosk terminals registered for this scope.</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                Deploy physical reception tablets for on-site PIN or QR attendance punches.
              </p>
              {canRegister && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenRegister}
                  style={{ marginTop: '1rem', minHeight: '44px' }}
                >
                  + Register First Terminal
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW (>= 768px) with horizontal scroll container */}
              <div className="kiosk-desktop-table-container">
                <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Terminal Details</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Property</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Heartbeat</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Registered By</th>
                      {canRegister && <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {kiosks.map((k) => (
                      <tr key={k.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.kiosk_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            Code: {k.kiosk_code}
                          </div>
                        </td>

                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          {k.property_name || `Property #${k.property_id}`}
                        </td>

                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          <Badge status={k.status === 'ACTIVE' ? 'success' : k.status === 'REVOKED' ? 'error' : 'warning'}>
                            {k.status}
                          </Badge>
                        </td>

                        <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          {k.last_heartbeat_at ? new Date(k.last_heartbeat_at).toLocaleString() : 'Never connected'}
                        </td>

                        <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          <div>{k.registered_by_name || 'Admin'}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {k.created_at ? new Date(k.created_at).toLocaleDateString() : '-'}
                          </div>
                        </td>

                        {canRegister && (
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                              {k.status !== 'REVOKED' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRotateSecret(k)}
                                  loading={rotatingKioskId === k.id}
                                  title="Rotate Terminal Passkey"
                                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', borderColor: '#f59e0b', color: '#d97706' }}
                                >
                                  🔑 Rotate Secret
                                </Button>
                              )}

                              {k.status === 'ACTIVE' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleToggleStatus(k, 'INACTIVE')}
                                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                                >
                                  Deactivate
                                </Button>
                              ) : k.status === 'INACTIVE' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleToggleStatus(k, 'ACTIVE')}
                                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', borderColor: '#10b981', color: '#10b981' }}
                                >
                                  Activate
                                </Button>
                              ) : null}

                              {k.status !== 'REVOKED' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleToggleStatus(k, 'REVOKED')}
                                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem', color: '#ef4444' }}
                                >
                                  Revoke
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARDS VIEW (< 768px: 320px, 360px, 390px, 430px) */}
              <div className="kiosk-mobile-cards-container">
                {kiosks.map((k) => (
                  <div
                    key={k.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Header: Name and Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {k.kiosk_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                          Code: <strong>{k.kiosk_code}</strong>
                        </div>
                      </div>
                      <Badge status={k.status === 'ACTIVE' ? 'success' : k.status === 'REVOKED' ? 'error' : 'warning'}>
                        {k.status}
                      </Badge>
                    </div>

                    {/* Meta info grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Property: </span>
                        {k.property_name || `Property #${k.property_id}`}
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Heartbeat: </span>
                        {k.last_heartbeat_at ? new Date(k.last_heartbeat_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Registered by: </span>
                        {k.registered_by_name || 'Admin'} {k.created_at ? `(${new Date(k.created_at).toLocaleDateString()})` : ''}
                      </div>
                    </div>

                    {/* Mobile Action Buttons (Min 44px Touch Targets, DEF-B08) */}
                    {canRegister && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: k.status !== 'REVOKED' ? '1fr 1fr' : '1fr',
                          gap: '0.5rem',
                          marginTop: '0.25rem',
                          paddingTop: '0.5rem',
                          borderTop: '1px solid var(--border-color)',
                        }}
                      >
                        {k.status !== 'REVOKED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRotateSecret(k)}
                            loading={rotatingKioskId === k.id}
                            style={{
                              minHeight: '44px',
                              fontSize: '0.78rem',
                              borderColor: '#f59e0b',
                              color: '#d97706',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                            }}
                          >
                            <Key size={14} /> Rotate Secret
                          </Button>
                        )}

                        {k.status === 'ACTIVE' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(k, 'INACTIVE')}
                            style={{ minHeight: '44px', fontSize: '0.78rem' }}
                          >
                            Deactivate
                          </Button>
                        ) : k.status === 'INACTIVE' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleStatus(k, 'ACTIVE')}
                            style={{ minHeight: '44px', fontSize: '0.78rem', borderColor: '#10b981', color: '#10b981' }}
                          >
                            Activate
                          </Button>
                        ) : null}

                        {k.status !== 'REVOKED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleStatus(k, 'REVOKED')}
                            style={{
                              gridColumn: 'span 2',
                              minHeight: '44px',
                              fontSize: '0.78rem',
                              color: '#ef4444',
                              justifyContent: 'center',
                            }}
                          >
                            Revoke Device Permanently
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
            <Button variant="secondary" onClick={handleModalClose} style={{ minHeight: '40px', padding: '0.5rem 1.25rem' }}>
              Close
            </Button>
          </div>
        </div>

        {/* Sub-Modal: Registration Form */}
        {isRegisterOpen && (
          <Modal
            isOpen={isRegisterOpen}
            onClose={() => {
              setIsRegisterOpen(false);
              setRegisterForm((prev) => ({ ...prev, kiosk_secret: '' }));
            }}
            title="Register On-Site Kiosk Terminal"
            subtitle="Provision hardware tablet credentials for physical attendance terminal"
            size="md"
          >
            <form onSubmit={handleSubmitRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Assigned Property *</label>
                <select
                  className="input-field"
                  value={registerForm.property_id}
                  onChange={(e) => setRegisterForm({ ...registerForm, property_id: e.target.value })}
                  required
                  style={{ minHeight: '40px' }}
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name || `Property #${p.id}`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" style={{ fontSize: '0.78rem' }}>Terminal Friendly Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Reception Desk Tablet Terminal"
                  className="input-field"
                  value={registerForm.kiosk_name}
                  onChange={(e) => setRegisterForm({ ...registerForm, kiosk_name: e.target.value })}
                  required
                  style={{ minHeight: '40px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label className="input-label" style={{ fontSize: '0.78rem' }}>Terminal Device Code *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={registerForm.kiosk_code}
                    onChange={(e) => setRegisterForm({ ...registerForm, kiosk_code: e.target.value })}
                    required
                    style={{ minHeight: '40px' }}
                  />
                </div>

                <div>
                  <label className="input-label" style={{ fontSize: '0.78rem' }}>Initial Secret Passkey *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={registerForm.kiosk_secret}
                    onChange={(e) => setRegisterForm({ ...registerForm, kiosk_secret: e.target.value })}
                    required
                    style={{ minHeight: '40px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  onClick={handleGenerateCredentials}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-color, #10b981)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontWeight: 600,
                    padding: '0.25rem 0',
                    minHeight: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  ⚡ Re-generate Random Code & Secret
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsRegisterOpen(false);
                    setRegisterForm((prev) => ({ ...prev, kiosk_secret: '' }));
                  }}
                  style={{ minHeight: '44px' }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={registerLoading} style={{ minHeight: '44px' }}>
                  Authorize & Register Kiosk
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* DEF-B07: One-Time Credential Modal (with Copy Secret & Fallback) */}
        {credentialModalData && (
          <Modal
            isOpen={Boolean(credentialModalData)}
            onClose={handleDismissCredentialModal}
            title={credentialModalData.title}
            subtitle={credentialModalData.subtitle}
            size="md"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid #10b981',
                  color: '#065f46',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CheckCircle size={18} /> Credentials Provisioned Successfully!
                </div>
                <div style={{ marginTop: '0.35rem', lineHeight: '1.4' }}>
                  {credentialModalData.subtitle}
                </div>
              </div>

              <div
                style={{
                  padding: '1rem',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                {/* Device Code */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>DEVICE CODE</span>
                    {copiedCode && <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>✓ Copied</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={credentialModalData.kiosk_code}
                      className="input-field"
                      style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', background: 'var(--bg-card)' }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyText(credentialModalData.kiosk_code, 'code')}
                      style={{ minHeight: '38px', minWidth: '40px', padding: '0 0.6rem' }}
                      title="Copy Device Code"
                    >
                      <Copy size={16} />
                    </Button>
                  </div>
                </div>

                {/* Terminal Secret (DEF-B07) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>TERMINAL SECRET PASSKEY</span>
                    {copiedSecret && <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>✓ Secret copied to clipboard!</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={credentialModalData.kiosk_secret}
                      className="input-field"
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        color: '#d97706',
                        background: 'var(--bg-card)',
                        border: '1px solid rgba(217, 119, 6, 0.4)',
                      }}
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleCopyText(credentialModalData.kiosk_secret, 'secret')}
                      style={{ minHeight: '38px', minWidth: '110px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      title="Copy Secret to Clipboard"
                    >
                      <Copy size={16} />
                      <span>{copiedSecret ? 'Copied!' : 'Copy Secret'}</span>
                    </Button>
                  </div>
                </div>
              </div>

              {copyError && (
                <div style={{ fontSize: '0.75rem', color: '#ef4444', fontStyle: 'italic' }}>
                  {copyError}
                </div>
              )}

              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  fontSize: '0.74rem',
                  color: '#b45309',
                  lineHeight: '1.4',
                }}
              >
                🔒 <strong>Security Notice:</strong> The terminal secret is cryptographically hashed using bcrypt in the database. For security reasons, this passkey is displayed <strong>only once</strong> and will never be shown again after closing this window.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button
                  variant="primary"
                  onClick={handleDismissCredentialModal}
                  style={{ minHeight: '44px', padding: '0.5rem 1.5rem', fontWeight: 700 }}
                >
                  Done (Dismiss Credentials)
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </Modal>
    </>
  );
}
