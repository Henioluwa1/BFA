import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

export default function SettingsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>System Settings</span>
            <Badge status="pending">SCHEDULED: PHASE 11</Badge>
          </h1>
          <p className="page-subtitle">
            Company profile, property configuration, financial parameters, and external integration channels.
          </p>
        </div>
      </div>

      <Card title="Company & System Settings Architecture (Section 22)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '1rem' }}>
          <div style={{ background: 'var(--bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>🏢 Company Profile</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Legal trading entity, brand logos, corporate contact info, and tax registration details.
            </p>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>🏨 Properties & Units</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Dynamic building creation, unit types, default check-in/out policies, and operational switches.
            </p>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>💳 Financial Rules</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Currency definitions, payment gateway settings, tax configurations, and agent commission defaults.
            </p>
          </div>
          <div style={{ background: 'var(--bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <h4 style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>🔌 Integrations Policy</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Strictly zero fake integrations. Channels (OTA, iCal, SMS, WhatsApp) must be fully built and verified before claiming completion.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
