import React, { useEffect, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useProperty } from '../context/PropertyContext';
import { useToast } from '../context/ToastContext';
import { systemService } from '../services/api';

export default function DashboardPage() {
  const { activeProperty, isAllProperties, properties } = useProperty();
  const { addToast } = useToast();

  const [healthData, setHealthData] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchHealth = async () => {
    setLoadingHealth(true);
    try {
      const res = await systemService.checkHealth();
      setHealthData(res.data);
      addToast('Health check completed. System is operational.', 'success');
    } catch (err) {
      addToast(`API Health check failed: ${err.message}`, 'error');
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div>
      {/* Page Title & Operational Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Executive Dashboard</span>
            <Badge status="available">PHASE 1 LIVE</Badge>
          </h1>
          <p className="page-subtitle">
            BFA Apartments Management System — Foundation & Architecture Control Console
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={fetchHealth} loading={loadingHealth}>
            ↻ Refresh Health
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
            View Architecture Info
          </Button>
        </div>
      </div>

      {/* Property Context Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(21, 31, 50, 0.9) 0%, rgba(17, 24, 39, 0.9) 100%)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.75rem',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-gold-dim)',
              border: '1px solid var(--accent-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
            }}
          >
            🏢
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--accent-gold)', fontWeight: 700 }}>
              Active Property Scope
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isAllProperties ? 'All BFA Properties (Global Multi-Property View)' : activeProperty?.name}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {isAllProperties
                ? `Managing ${properties.length} active properties across the BFA portfolio`
                : `Property Code: ${activeProperty?.code} • Location: ${activeProperty?.location} • ${activeProperty?.unitCount} Rentable Units`}
            </div>
          </div>
        </div>
        <div>
          <Badge status={isAllProperties ? 'available' : 'ready'}>
            {isAllProperties ? 'MULTI-PROPERTY VIEW' : 'FILTERED SCOPE'}
          </Badge>
        </div>
      </div>

      {/* Grid: Diagnostics & System Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Backend & DB Health Card */}
        <Card title="Live Backend Infrastructure" action={<Badge status={healthData?.status === 'healthy' ? 'available' : 'pending'}>{healthData?.status || 'Connecting'}</Badge>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Status:</span>
              <span style={{ fontWeight: 600, color: 'var(--status-available)' }}>
                {healthData?.database?.status === 'connected' ? 'Connected (MySQL)' : 'Checking...'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Latency:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {healthData?.database?.latencyMs != null ? `${healthData.database.latencyMs} ms` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Applied Migrations:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-gold)' }}>
                {healthData?.database?.appliedMigrations ?? '—'} Batch #1
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>API Environment:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {healthData?.environment || 'development'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Server Uptime:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {healthData?.uptimeSeconds ? `${healthData.uptimeSeconds}s` : '—'}
              </span>
            </div>
          </div>
        </Card>

        {/* Runtime & Memory Card */}
        <Card title="Node.js Engine Metrics" action={<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{healthData?.system?.nodeVersion}</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Platform & Arch:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {healthData?.system?.platform} ({healthData?.system?.arch})
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>CPU Cores:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {healthData?.system?.cpus ?? '—'} cores
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>RSS Memory:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {healthData?.system?.memoryUsageMb?.rss ? `${healthData.system.memoryUsageMb.rss} MB` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Heap Used / Total:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {healthData?.system?.memoryUsageMb
                  ? `${healthData.system.memoryUsageMb.heapUsed} / ${healthData.system.memoryUsageMb.heapTotal} MB`
                  : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Security Headers:</span>
              <span style={{ fontWeight: 600, color: 'var(--status-available)' }}>
                Helmet + CORS Active
              </span>
            </div>
          </div>
        </Card>

        {/* Domain Entity Status Palette Card */}
        <Card title="Operational Status Standards" action={<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sec 9 & 10</span>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Badge status="available">Available</Badge>
            <Badge status="occupied">Occupied</Badge>
            <Badge status="reserved">Reserved</Badge>
            <Badge status="pending">Pending</Badge>
            <Badge status="dirty">Dirty</Badge>
            <Badge status="ready">Ready</Badge>
            <Badge status="maintenance">Maintenance</Badge>
            <Badge status="cancelled">Cancelled</Badge>
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            * Strict separation of Apartment Status (e.g. <code>DIRTY</code>) and Reservation Status (e.g. <code>COMPLETED</code>) enforced.
          </p>
        </Card>
      </div>

      {/* 12-Phase Implementation Roadmap Card */}
      <Card title="System Development Roadmap (Phase Execution Standards)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {[
            { phase: 1, title: 'Foundation & Architecture', status: 'COMPLETE', desc: 'Architecture, DB pool, migrations, UI layout, multi-property scope.' },
            { phase: 2, title: 'Auth, RBAC & User Access', status: 'NEXT UP', desc: '6 roles, single-owner rule, granular permissions, audit logging.' },
            { phase: 3, title: 'Properties & Apartments', status: 'PLANNED', desc: 'Dynamic properties, units, unit types, statuses, availability.' },
            { phase: 4, title: 'Reservation Engine', status: 'PLANNED', desc: 'Availability, double-booking prevention, pricing, lifecycle.' },
            { phase: 5, title: 'Calendar & Front Office', status: 'PLANNED', desc: 'Month/week/day/timeline calendar, check-in, check-out.' },
            { phase: 6, title: 'Tenants & Inspection', status: 'PLANNED', desc: 'Guest profiles, condition assessment, damage evidence.' },
            { phase: 7, title: 'Maintenance Operations', status: 'PLANNED', desc: 'Issue tracker, staff assignment, unit status integration.' },
            { phase: 8, title: 'Financial Management', status: 'PLANNED', desc: 'Payments, collections, expenses, net profit calculations.' },
            { phase: 9, title: 'Agents & Commissions', status: 'PLANNED', desc: 'Agent data isolation, client tracking, commission settlements.' },
            { phase: 10, title: 'Analytics & Reporting', status: 'PLANNED', desc: 'Revenue trends, property performance, occupancy metrics.' },
            { phase: 11, title: 'Team, Settings & Channels', status: 'PLANNED', desc: 'User governance, notifications, integration contracts.' },
            { phase: 12, title: 'Production Hardening', status: 'PLANNED', desc: 'Security audit, E2E tests, disaster recovery, release.' },
          ].map((item) => (
            <div
              key={item.phase}
              style={{
                background: item.status === 'COMPLETE' ? 'rgba(16, 185, 129, 0.05)' : item.status === 'NEXT UP' ? 'rgba(212, 175, 55, 0.05)' : 'var(--bg-card)',
                border: item.status === 'COMPLETE' ? '1px solid rgba(16, 185, 129, 0.3)' : item.status === 'NEXT UP' ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  Phase {item.phase}
                </span>
                <Badge status={item.status === 'COMPLETE' ? 'available' : item.status === 'NEXT UP' ? 'pending' : 'neutral'}>
                  {item.status}
                </Badge>
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: item.status === 'COMPLETE' ? 'var(--status-available)' : 'var(--text-primary)' }}>
                {item.title}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Architecture Info Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="BFA Architecture & Non-Negotiable Standards"
        footer={
          <Button variant="primary" onClick={() => setIsModalOpen(false)}>
            Close Modal
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          <p>
            The BFA Apartments Management System is architected to scale dynamically from a single building with two apartments to dozens of properties with variable units.
          </p>
          <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
            <li><strong>Dynamic Hierarchy:</strong> BFA Company → Properties/Buildings → Apartments/Units → Reservations → Tenants/Guests</li>
            <li><strong>Backend Authority:</strong> All business logic and RBAC constraints are enforced on the API layer.</li>
            <li><strong>Database Integrity:</strong> Foreign key constraints, indexed queries, transaction wrappers, and versioned migrations.</li>
            <li><strong>Audit Logging:</strong> Immutable audit trail records for compliance and traceability.</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
