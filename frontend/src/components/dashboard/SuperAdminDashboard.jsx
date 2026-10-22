import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { systemService, propertyService, financialService, frontOfficeService, maintenanceService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { properties, refreshProperties } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [runningDiag, setRunningDiag] = useState(false);
  const [health, setHealth] = useState({
    status: 'unknown',
    uptimeSeconds: 0,
    database: { status: 'unknown', latencyMs: null, appliedMigrations: 0 },
    system: { nodeVersion: '', platform: '', memoryUsageMb: { rss: 0, heapUsed: 0, heapTotal: 0 } },
  });

  const [financial, setFinancial] = useState({
    grossCollected: 0,
    netRevenue: 0,
    netProfit: 0,
    outstandingReceivables: 0,
  });

  const [operations, setOperations] = useState({
    totalUnits: 0,
    occupiedUnits: 0,
    availableUnits: 0,
    todaysArrivals: 0,
    todaysDepartures: 0,
  });

  const [maintenance, setMaintenance] = useState({
    openCount: 0,
    criticalCount: 0,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [healthRes, finRes, foRes, maintRes] = await Promise.all([
        systemService.checkHealth().catch((err) => {
          console.warn('Health check error:', err);
          return { data: { status: 'error', database: { status: 'error' } } };
        }),
        financialService.getOverview({ propertyId: 'all' }).catch(() => ({ data: { kpis: {} } })),
        frontOfficeService.getStats({ propertyId: 'all' }).catch(() => ({ data: {} })),
        maintenanceService.getStats({ propertyId: 'all' }).catch(() => ({ data: {} })),
      ]);

      if (healthRes.data) {
        setHealth(healthRes.data);
      }

      const kpis = finRes.data?.kpis || {};
      setFinancial({
        grossCollected: kpis.grossCollected || 0,
        netRevenue: kpis.netRevenue || 0,
        netProfit: kpis.netProfit || 0,
        outstandingReceivables: kpis.outstandingReceivables || 0,
      });

      const foData = foRes.data || {};
      setOperations({
        totalUnits: foData.totalUnits || 0,
        occupiedUnits: foData.occupiedUnits || 0,
        availableUnits: foData.availableUnits || 0,
        todaysArrivals: foData.todaysArrivals || 0,
        todaysDepartures: foData.todaysDepartures || 0,
      });

      const maintData = maintRes.data?.overview || maintRes.data || {};
      setMaintenance({
        openCount: maintData.open ?? maintData.open_count ?? 0,
        criticalCount: maintData.criticalOpen ?? maintData.critical_open_count ?? maintData.critical_count ?? 0,
      });
    } catch (err) {
      console.error('Super Admin dashboard load failure:', err);
      addToast('Failed to load system telemetry data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const runDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const res = await systemService.checkHealth();
      setHealth(res.data);
      addToast(`Diagnostics passed: DB latency is ${res.data?.database?.latencyMs}ms`, 'success');
    } catch (err) {
      addToast(`Diagnostics warning: ${err.message}`, 'error');
    } finally {
      setRunningDiag(false);
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  const totalPropertiesCount = properties?.length || 0;
  const globalOccupancyRate = operations.totalUnits > 0
    ? Math.round((operations.occupiedUnits / operations.totalUnits) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Super Admin Top Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Super Admin System Command & Telemetry</h1>
            <span
              style={{
                background: 'rgba(96, 165, 250, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(96, 165, 250, 0.4)',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              👑 Root System Authority
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.75rem',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                background: health.status === 'healthy' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: health.status === 'healthy' ? '#34d399' : '#f87171',
                border: `1px solid ${health.status === 'healthy' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: health.status === 'healthy' ? '#10b981' : '#ef4444',
                }}
              />
              {health.status === 'healthy' ? 'SYSTEM OPERATIONAL' : 'SYSTEM DEGRADED'}
            </span>
          </div>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Authoritative multi-tenant health, database connectivity, server runtime observability, and global portfolio metrics.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="outline" size="sm" onClick={runDiagnostics} loading={runningDiag}>
            ⚡ Run Diagnostics
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} loading={loading}>
            ↻ Refresh All
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/app/audit')}>
            🛡️ Security Audit
          </Button>
        </div>
      </div>

      {/* System Infrastructure Telemetry Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Database Status & Latency */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                DATABASE & LATENCY
              </span>
              <span style={{ fontSize: '1.25rem' }}>🗄️</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: health.database?.status === 'connected' ? '#10b981' : '#ef4444', marginBottom: '0.25rem' }}>
              {health.database?.latencyMs != null ? `${health.database.latencyMs} ms` : 'Disconnected'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              MariaDB Pool • {health.database?.appliedMigrations || 0} applied migrations
            </div>
          </div>
        </Card>

        {/* Server Process Uptime */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                SERVER UPTIME
              </span>
              <span style={{ fontSize: '1.25rem' }}>⏱️</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.25rem' }}>
              {formatUptime(health.uptimeSeconds)}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Node {health.system?.nodeVersion || 'v18+'} • {health.system?.platform || 'os'}
            </div>
          </div>
        </Card>

        {/* Memory Allocation */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                PROCESS MEMORY (RSS)
              </span>
              <span style={{ fontSize: '1.25rem' }}>🧠</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              {health.system?.memoryUsageMb?.rss || 0} MB
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Heap: {health.system?.memoryUsageMb?.heapUsed || 0} / {health.system?.memoryUsageMb?.heapTotal || 0} MB
            </div>
          </div>
        </Card>

        {/* Global Portfolio Scope */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                PORTFOLIO SCALE
              </span>
              <span style={{ fontSize: '1.25rem' }}>🌐</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#a78bfa', marginBottom: '0.25rem' }}>
              {totalPropertiesCount} Properties
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {operations.totalUnits} Units Total • {globalOccupancyRate}% Occupied
            </div>
          </div>
        </Card>
      </div>

      {/* Global Business & Operational Overview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Global Financial Collections */}
        <Card title="Global Financial Aggregation">
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Global Gross Collected:</span>
              <span style={{ fontWeight: 700, color: '#10b981', fontSize: '1.1rem' }}>
                {formatNaira(financial.grossCollected)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Global Net Profit (NOI):</span>
              <span style={{ fontWeight: 600 }}>{formatNaira(financial.netProfit)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Outstanding Receivables:</span>
              <span style={{ fontWeight: 600, color: financial.outstandingReceivables > 0 ? '#f59e0b' : '#10b981' }}>
                {formatNaira(financial.outstandingReceivables)}
              </span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => navigate('/app/financial')}>
                View Global Ledger →
              </Button>
            </div>
          </div>
        </Card>

        {/* Global Operations Overview */}
        <Card title="Live Multi-Tenant Operational State">
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Active Occupied Units:</span>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                {operations.occupiedUnits} / {operations.totalUnits} ({globalOccupancyRate}%)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Today's Arrivals / Departures:</span>
              <span style={{ fontWeight: 600 }}>
                {operations.todaysArrivals} in / {operations.todaysDepartures} out
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Open Maintenance Tickets:</span>
              <span style={{ fontWeight: 600, color: maintenance.openCount > 0 ? '#f59e0b' : '#10b981' }}>
                {maintenance.openCount} open {maintenance.criticalCount > 0 && `(${maintenance.criticalCount} critical)`}
              </span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => navigate('/app/front-office')}>
                Front Office Oversight →
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Multi-Property Portfolio Status Table */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>Portfolio Properties Registry ({properties?.length || 0})</span>
            <Button variant="outline" size="xs" onClick={() => navigate('/app/properties')}>
              Manage Properties →
            </Button>
          </div>
        }
      >
        <div style={{ padding: '0.5rem 1rem 1rem' }}>
          {properties?.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No properties registered in system.
            </div>
          ) : (
            <Table
              columns={[
                {
                  header: 'Property Name',
                  accessor: 'name',
                  render: (p) => (
                    <div>
                      <div
                        style={{ fontWeight: 600, color: '#60a5fa', cursor: 'pointer' }}
                        onClick={() => navigate(`/app/properties?search=${encodeURIComponent(p.name)}`)}
                      >
                        {p.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {p.address || p.city || 'Standard Portfolio Asset'}
                      </div>
                    </div>
                  ),
                },
                {
                  header: 'Total Units',
                  accessor: 'unitCount',
                  render: (p) => <strong>{p.unitCount || 0} units</strong>,
                },
                {
                  header: 'Status',
                  accessor: 'status',
                  render: (p) => (
                    <Badge status={p.status === 'ACTIVE' ? 'available' : 'maintenance'}>
                      {p.status || 'ACTIVE'}
                    </Badge>
                  ),
                },
                {
                  header: 'Quick Action',
                  accessor: 'id',
                  render: (p) => (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => navigate(`/app/apartments?propertyId=${p.id}`)}
                      >
                        Units ({p.unitCount || 0})
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => navigate(`/app/maintenance?propertyId=${p.id}`)}
                      >
                        Maintenance
                      </Button>
                    </div>
                  ),
                },
              ]}
              data={properties || []}
            />
          )}
        </div>
      </Card>

      {/* Super Admin Root Quick Actions Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          onClick={() => navigate('/app/audit')}
          style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#60a5fa')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🛡️</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Audit & Security Trail</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Immutable system change logs & access events</div>
        </div>

        <div
          onClick={() => navigate('/app/access')}
          style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#60a5fa')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🔐</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Access & RBAC Controls</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Capability overrides & permission policies</div>
        </div>

        <div
          onClick={() => navigate('/app/automation')}
          style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#60a5fa')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🤖</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Automation Engine</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Operations Assistant & automated jobs</div>
        </div>

        <div
          onClick={() => navigate('/app/system')}
          style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#60a5fa')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>⚙️</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>System Settings</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Global environment configurations & params</div>
        </div>
      </div>
    </div>
  );
}
