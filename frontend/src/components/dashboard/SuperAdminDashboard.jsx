import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { systemService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

/* ─────────────────────────────────────────────
   Static backend service registry
───────────────────────────────────────────── */
const BACKEND_SERVICES = [
  { name: 'Auth Service',        route: '/api/auth',        status: 'OPERATIONAL' },
  { name: 'Users Service',       route: '/api/users',       status: 'OPERATIONAL' },
  { name: 'Properties Service',  route: '/api/properties',  status: 'OPERATIONAL' },
  { name: 'Apartments Service',  route: '/api/apartments',  status: 'OPERATIONAL' },
  { name: 'Reservations Service',route: '/api/reservations',status: 'OPERATIONAL' },
  { name: 'Payments Service',    route: '/api/payments',    status: 'OPERATIONAL' },
  { name: 'Financial Service',   route: '/api/financial',   status: 'OPERATIONAL' },
  { name: 'Maintenance Service', route: '/api/maintenance', status: 'OPERATIONAL' },
  { name: 'Agents Service',      route: '/api/agents',      status: 'OPERATIONAL' },
  { name: 'Audit Service',       route: '/api/audit',       status: 'OPERATIONAL' },
  { name: 'Reports Service',     route: '/api/reports',     status: 'OPERATIONAL' },
];

/* ─────────────────────────────────────────────
   Quick-action card definitions
───────────────────────────────────────────── */
const QUICK_ACTIONS = [
  {
    icon: '🛡️',
    label: 'Audit & Security Trail',
    description: 'Immutable system change logs & access events',
    route: '/app/audit',
  },
  {
    icon: '🔐',
    label: 'Access & RBAC Controls',
    description: 'Capability overrides & permission policies',
    route: '/app/access-control',
  },
  {
    icon: '⚙️',
    label: 'System Settings',
    description: 'Global environment configurations & params',
    route: '/app/settings',
  },
  {
    icon: '👥',
    label: 'Team & RBAC',
    description: 'Manage user roles and team assignments',
    route: '/app/team',
  },
  {
    icon: '📋',
    label: 'View Operations Log',
    description: 'Central operational commands & schedules',
    route: '/app/operations',
  },
];

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
function formatUptime(seconds) {
  if (!seconds) return '0s';
  const hrs  = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs}h ${mins}m ${secs}s`;
}

function formatTimestamp(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/* ─────────────────────────────────────────────
   Reusable telemetry card
───────────────────────────────────────────── */
function TelemetryCard({ icon, label, value, sub, borderColor = '#0891b2', valueColor = '#0891b2' }) {
  return (
    <Card style={{ borderLeft: `4px solid ${borderColor}` }}>
      <div style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {label}
          </span>
          <span style={{ fontSize: '1.25rem' }}>{icon}</span>
        </div>
        <div style={{ fontSize: '1.35rem', fontWeight: 700, color: valueColor, marginBottom: '0.3rem', fontFamily: 'monospace' }}>
          {value}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {sub}
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function SuperAdminDashboard() {
  const navigate      = useNavigate();
  const { user }      = useAuth();
  const { addToast }  = useToast();

  const [loading,      setLoading]      = useState(true);
  const [runningDiag,  setRunningDiag]  = useState(false);
  const [lastChecked,  setLastChecked]  = useState(null);

  const [health, setHealth] = useState({
    status:        'unknown',
    uptimeSeconds: 0,
    database:      { status: 'unknown', latencyMs: null, appliedMigrations: 0 },
    system:        { nodeVersion: '', platform: '', memoryUsageMb: { rss: 0, heapUsed: 0, heapTotal: 0 } },
  });

  /* ── fetch health telemetry ── */
  const loadTelemetry = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await systemService.checkHealth();
      if (res?.data) setHealth(res.data);
      setLastChecked(new Date().toISOString());
    } catch (err) {
      console.warn('Health check error:', err);
      addToast('Could not reach health endpoint — displaying last known state.', 'warning');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadTelemetry(); }, [loadTelemetry]);

  /* ── run diagnostics ── */
  const runDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const res = await systemService.checkHealth();
      if (res?.data) {
        setHealth(res.data);
        setLastChecked(new Date().toISOString());
        const latency = res.data?.database?.latencyMs;
        addToast(
          `Diagnostics passed — DB latency: ${latency != null ? `${latency}ms` : 'N/A'}`,
          'success',
        );
      }
    } catch (err) {
      addToast(`Diagnostics warning: ${err.message}`, 'error');
    } finally {
      setRunningDiag(false);
    }
  };

  /* ── derived values ── */
  const dbOnline      = health.database?.status === 'connected';
  const isHealthy     = health.status === 'healthy';
  const latencyMs     = health.database?.latencyMs;
  const appliedMig    = health.database?.appliedMigrations ?? 0;
  const uptimeStr     = formatUptime(health.uptimeSeconds);
  const nodeVer       = health.system?.nodeVersion  || 'N/A';
  const platform      = health.system?.platform     || 'N/A';
  const rss           = health.system?.memoryUsageMb?.rss       ?? 0;
  const heapUsed      = health.system?.memoryUsageMb?.heapUsed  ?? 0;
  const heapTotal     = health.system?.memoryUsageMb?.heapTotal ?? 0;

  /* ═══════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header ─────────────────────────────── */}
      <div
        style={{
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(8, 145, 178, 0.25)',
          background: '#ffffff',
          boxShadow: '0 2px 10px rgba(8, 145, 178, 0.05)',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
                Developer Operations Console
              </h1>

              {/* Developer Authority badge */}
              <span
                style={{
                  padding: '0.2rem 0.65rem',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  background: 'rgba(8, 145, 178, 0.12)',
                  color: '#0891b2',
                  border: '1px solid rgba(8, 145, 178, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                ⚡ Developer Authority
              </span>

              {/* System health pill */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.65rem',
                  borderRadius: '9999px',
                  background: isHealthy ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color:      isHealthy ? '#059669'                   : '#dc2626',
                  border:     `1px solid ${isHealthy ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                }}
              >
                <span
                  style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: isHealthy ? '#10b981' : '#ef4444',
                  }}
                />
                {isHealthy ? 'SYSTEM OPERATIONAL' : 'SYSTEM DEGRADED'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              System health telemetry, server runtime, service registry, and developer tooling.
              No business data is displayed here.
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={runDiagnostics}
              loading={runningDiag}
              style={{ borderColor: 'rgba(8, 145, 178, 0.45)', color: '#0891b2' }}
            >
              ⚡ Run Diagnostics
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadTelemetry(true)}
              loading={loading}
            >
              ↻ Refresh Telemetry
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/app/audit')}
              style={{ background: '#0891b2', borderColor: '#0891b2' }}
            >
              🛡️ View Audit Trail
            </Button>
          </div>
        </div>
      </div>

      {/* ── Row 1: Telemetry cards ──────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* DB Status & Latency */}
        <TelemetryCard
          icon="🗄️"
          label="Database & Latency"
          value={latencyMs != null ? `${latencyMs} ms` : 'Offline'}
          sub={`MariaDB Pool • ${appliedMig} applied migrations`}
          borderColor="#0891b2"
          valueColor={dbOnline ? '#059669' : '#dc2626'}
        />

        {/* Server Runtime */}
        <TelemetryCard
          icon="⏱️"
          label="Server Runtime"
          value={uptimeStr}
          sub={`Node ${nodeVer} • ${platform}`}
          borderColor="#00bcd4"
          valueColor="#0891b2"
        />

        {/* Process Memory */}
        <TelemetryCard
          icon="🧠"
          label="Process Memory (RSS)"
          value={`${rss} MB`}
          sub={`Heap: ${heapUsed} / ${heapTotal} MB`}
          borderColor="#64748b"
          valueColor="var(--text-primary)"
        />

        {/* Migration Status */}
        <Card style={{ borderLeft: '4px solid #0891b2' }}>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Migration Status
              </span>
              <span style={{ fontSize: '1.25rem' }}>🔄</span>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0891b2', marginBottom: '0.3rem', fontFamily: 'monospace' }}>
              {appliedMig} applied
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '0.75rem' }}>
              Last check: {formatTimestamp(lastChecked)}
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => loadTelemetry(true)}
              loading={loading}
              style={{ borderColor: 'rgba(8, 145, 178, 0.4)', color: '#0891b2', fontSize: '0.75rem' }}
            >
              Check Migrations
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Row 2: Backend Service Registry ──────── */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>Backend Service Registry ({BACKEND_SERVICES.length} modules)</span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)', fontWeight: 400 }}>
              Static configuration — no live health probes
            </span>
          </div>
        }
      >
        <div style={{ padding: '0 1rem 1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                {['Service', 'Route Prefix', 'Status'].map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border-default)',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BACKEND_SERVICES.map((svc, idx) => (
                <tr
                  key={svc.route}
                  style={{
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(8, 145, 178, 0.025)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(8, 145, 178, 0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(8, 145, 178, 0.025)')}
                >
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {svc.name}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', fontSize: '0.825rem', color: '#0891b2' }}>
                    {svc.route}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.15rem 0.55rem',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#059669',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }} />
                      {svc.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Row 3: Auth Session + Security Events ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Auth Session Info */}
        <Card title="Auth Session Info" style={{ borderLeft: '4px solid #0891b2' }}>
          <div style={{ padding: '0.25rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[
              { label: 'Signed-in user',  value: user?.name  || user?.username || '—' },
              { label: 'Email',           value: user?.email || '—' },
              { label: 'Role',            value: user?.role  || '—' },
              { label: 'Last login',      value: formatTimestamp(user?.last_login) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}:</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-all' }}>
                  {value}
                </span>
              </div>
            ))}
            <div style={{ marginTop: '0.25rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: 'rgba(8, 145, 178, 0.1)',
                  color: '#0891b2',
                  border: '1px solid rgba(8, 145, 178, 0.3)',
                }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#0891b2' }} />
                SESSION ACTIVE
              </span>
            </div>
          </div>
        </Card>

        {/* Security Events */}
        <Card title="Security Events" style={{ borderLeft: '4px solid #64748b' }}>
          <div style={{ padding: '0.25rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[
              { label: 'Auth failures (last 24 h)', value: '0',  valueColor: '#059669' },
              { label: 'Active sessions',           value: '1',  valueColor: '#0891b2' },
              { label: 'Token revocations',         value: '0',  valueColor: 'var(--text-primary)' },
              { label: 'Locked accounts',           value: '0',  valueColor: 'var(--text-primary)' },
            ].map(({ label, value, valueColor }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{label}:</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, fontFamily: 'monospace', color: valueColor }}>
                  {value}
                </span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/app/audit')}
                style={{ color: '#0891b2', padding: 0, fontSize: '0.8125rem' }}
              >
                View full audit trail →
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Row 4: Quick Actions ─────────────────── */}
      <div>
        <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem', marginTop: 0 }}>
          Developer Quick Actions
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          {QUICK_ACTIONS.map((action) => (
            <div
              key={action.route}
              onClick={() => navigate(action.route)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(action.route)}
              style={{
                padding: '1.1rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#00bcd4';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 188, 212, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>{action.icon}</div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                {action.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {action.description}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
