import React, { useEffect, useState } from 'react';
import { useProperty } from '../../context/PropertyContext';
import { systemService } from '../../services/api';
import Breadcrumbs from './Breadcrumbs';

export default function Topbar() {
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const [apiHealth, setApiHealth] = useState({ status: 'checking', dbStatus: 'checking' });

  const checkConnection = async () => {
    try {
      const res = await systemService.checkHealth();
      if (res.data?.status === 'healthy') {
        setApiHealth({ status: 'connected', dbStatus: res.data.database?.status || 'connected' });
      } else {
        setApiHealth({ status: 'degraded', dbStatus: res.data?.database?.status || 'degraded' });
      }
    } catch {
      setApiHealth({ status: 'offline', dbStatus: 'disconnected' });
    }
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Breadcrumbs />
      </div>

      <div className="topbar-right">
        {/* Global Multi-Property Selector (Section 1, 7, 24) */}
        <div className="property-switcher" title="Active Property Context">
          <span className="property-switcher-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h1M9 13h1M9 17h1M14 9h1M14 13h1M14 17h1" />
            </svg>
            Property:
          </span>
          <select
            className="property-select"
            value={activePropertyId}
            onChange={(e) => setActivePropertyId(e.target.value)}
            id="property-switcher-select"
          >
            <option value="all">✦ All Properties (Global View)</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                🏢 {prop.name} ({prop.unitCount} Units)
              </option>
            ))}
          </select>
        </div>

        {/* Backend & DB Health Indicator */}
        <div className="status-indicator" title={`API: ${apiHealth.status} | DB: ${apiHealth.dbStatus}`}>
          <div
            className={`status-dot ${
              apiHealth.status === 'connected' ? '' : apiHealth.status === 'degraded' ? 'degraded' : 'error'
            }`}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {apiHealth.status === 'connected' ? 'API / DB Connected' : 'API Connecting...'}
          </span>
        </div>

        {/* User Role Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e293b, #334155)',
              border: '1px solid var(--accent-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: 'var(--accent-gold)',
            }}
          >
            AD
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              System Admin
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-gold)', fontWeight: 700 }}>
              FULL CONTROL
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
