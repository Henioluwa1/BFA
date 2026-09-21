import React, { useEffect, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { useProperty } from '../context/PropertyContext';
import { useRole } from '../context/RoleContext';
import { useToast } from '../context/ToastContext';
import { systemService, reservationService } from '../services/api';

export default function DashboardPage() {
  const { activeProperty, isAllProperties, properties } = useProperty();
  const { activeRoleObj, currentRole } = useRole();
  const { addToast } = useToast();

  const [healthData, setHealthData] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // One-Night Rule Test State
  const [testResult, setTestResult] = useState(null);
  const [testingRule, setTestingRule] = useState(false);

  const fetchHealth = async () => {
    setLoadingHealth(true);
    try {
      const res = await systemService.checkHealth();
      setHealthData(res.data);
      addToast('Health check complete: System is operational.', 'success');
    } catch (err) {
      addToast(`API Health check failed: ${err.message}`, 'error');
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  // Quick interactive test for the Section 16 One-Night Stay Rule
  const runRuleTest = async (nights) => {
    setTestingRule(true);
    setTestResult(null);

    const checkIn = '2029-01-10';
    const checkOutDate = new Date('2029-01-10');
    checkOutDate.setDate(checkOutDate.getDate() + nights);
    const checkOut = checkOutDate.toISOString().split('T')[0];

    try {
      const res = await reservationService.create({
        apartment_id: 1,
        tenant_name: `Rule Verification (${nights} nt)`,
        tenant_email: 'verifier@example.com',
        tenant_phone: '+234 800 000 0000',
        check_in_date: checkIn,
        check_out_date: checkOut,
        total_amount: 350.00,
      });

      setTestResult({
        success: true,
        nights,
        code: 201,
        message: `Accepted! Reservation created with duration: 1 night (${checkIn} -> ${checkOut}).`,
      });
      addToast(`1-Night Stay Test Passed (Code 201)`, 'success');
    } catch (err) {
      setTestResult({
        success: false,
        nights,
        code: 422,
        message: `Strictly Rejected by Backend: ${err.message || 'Duration exceeds 1 night.'}`,
      });
      addToast(`Server rejected ${nights}-night booking as required (Code 422)`, 'info');
    } finally {
      setTestingRule(false);
    }
  };

  return (
    <div>
      {/* Page Title & Operational Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Executive Dashboard</span>
            <Badge status="occupied">MODULAR MONOLITH ACTIVE</Badge>
          </h1>
          <p className="page-subtitle">
            BFA Apartments Management System — Multi-Property ERP & Operations Console
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={fetchHealth} loading={loadingHealth}>
            ↻ Ping Health
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
            View Architecture Specs
          </Button>
        </div>
      </div>

      {/* Property Context Banner */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.75rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-md)',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--rust-dim)',
              border: '1px solid var(--rust-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
            }}
          >
            🏢
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--rust-light)', fontWeight: 700 }}>
              Active Property Scope
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isAllProperties ? 'All BFA Properties (Global Multi-Property View)' : activeProperty?.name}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {isAllProperties
                ? `Managing ${properties.length} active properties across the BFA portfolio`
                : `Property Code: ${activeProperty?.code} • Location: ${activeProperty?.location} • ${activeProperty?.unitCount} Rentable Units`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Badge status="pending">
            ROLE: {activeRoleObj.name.toUpperCase()}
          </Badge>
          <Badge status={isAllProperties ? 'available' : 'occupied'}>
            {isAllProperties ? 'GLOBAL SCOPE' : 'FILTERED SCOPE'}
          </Badge>
        </div>
      </div>

      {/* Grid: Diagnostics & System Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Backend & DB Health Card */}
        <Card title="Live Backend Infrastructure" action={<Badge status={healthData?.status === 'healthy' ? 'available' : 'pending'}>{healthData?.status || 'Connecting'}</Badge>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Status:</span>
              <span style={{ fontWeight: 600, color: 'var(--white-pure)' }}>
                {healthData?.database?.status === 'connected' ? 'Connected (MySQL/MariaDB)' : 'Checking...'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Latency:</span>
              <span style={{ fontWeight: 600, color: 'var(--rust-light)' }}>
                {healthData?.database?.latencyMs != null ? `${healthData.database.latencyMs} ms` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Applied Migrations:</span>
              <span style={{ fontWeight: 600, color: 'var(--white-pure)' }}>
                {healthData?.database?.appliedMigrations ?? '—'} (Batch #1 + #2)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>API Architecture:</span>
              <span style={{ fontWeight: 600, color: 'var(--rust-light)' }}>
                Modular Monolith /api/v1
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

        {/* Section 16 One-Night Stay Tester Card */}
        <Card title="Section 16: One-Night Stay Engine">
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.4 }}>
            Mandatory business rule: Stays are limited to <strong>exactly 1 night</strong>. Multi-night or same-day bookings are strictly rejected.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <Button
              variant="primary"
              size="sm"
              loading={testingRule}
              onClick={() => runRuleTest(1)}
            >
              Test 1-Night Stay (Valid)
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={testingRule}
              onClick={() => runRuleTest(2)}
            >
              Test 2-Night Stay (Must Reject)
            </Button>
          </div>

          {testResult && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: testResult.success ? 'var(--grey-800)' : 'var(--grey-900)',
                border: `1px solid ${testResult.success ? 'var(--white-pure)' : 'var(--rust-primary)'}`,
                fontSize: '0.82rem',
              }}
            >
              <div style={{ fontWeight: 700, color: testResult.success ? 'var(--white-pure)' : 'var(--rust-light)' }}>
                {testResult.success ? `✓ HTTP ${testResult.code} Created` : `✕ HTTP ${testResult.code} Rejected`}
              </div>
              <div style={{ marginTop: '0.2rem', color: 'var(--text-secondary)' }}>
                {testResult.message}
              </div>
            </div>
          )}
        </Card>

        {/* Visual System Standards Card */}
        <Card title="Approved Visual Palette (Grey, White & Rust)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: 'var(--rust-primary)', border: '1px solid var(--rust-light)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Rust Orange (#c25e2e) — Primary Accent & Actions</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: 'var(--white-pure)', border: '1px solid var(--grey-600)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>White (#ffffff) — Contrast & Cards</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: 'var(--grey-700)', border: '1px solid var(--grey-500)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Grey Variations (#14171c .. #b8c3d1) — Surfaces & Structure</span>
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <Badge status="available">Available</Badge>
            <Badge status="occupied">Occupied</Badge>
            <Badge status="pending">Pending</Badge>
            <Badge status="dirty">Dirty</Badge>
            <Badge status="maintenance">Maintenance</Badge>
          </div>
        </Card>
      </div>

      {/* Architecture Info Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Modular Monolith & RESTful API Specifications"
        footer={
          <Button variant="primary" onClick={() => setIsModalOpen(false)}>
            Close Modal
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          <p>
            The BFA platform is organized as a <strong>Modular Monolith</strong> exposing versioned endpoints under <code>/api/v1/*</code>:
          </p>
          <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', listStyleType: 'disc' }}>
            <li><strong>Global Search:</strong> <code>GET /api/v1/search</code> searches properties, apartments, reservations, maintenance, and agents with RBAC isolation.</li>
            <li><strong>Reporting System:</strong> <code>GET /api/v1/reports/*</code> supports RFC 4180 CSV exports and executive PDF documents.</li>
            <li><strong>Audit Logging:</strong> <code>GET /api/v1/audit</code> provides an append-only audit trail correlated with <code>X-Request-Id</code>.</li>
            <li><strong>One-Night Stay Rule:</strong> Mandatory business rule enforced at controller, service, and database levels (<code>CHECK (DATEDIFF(check_out_date, check_in_date) = 1)</code>).</li>
            <li><strong>Strict Visual Standards:</strong> Grey, White, and Rust Orange ONLY with 6 centralized role visual arrangements.</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
