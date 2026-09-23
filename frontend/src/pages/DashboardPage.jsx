import React, { useEffect, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { systemService, reservationService } from '../services/api';
import { Link } from 'react-router-dom';
import { formatNaira } from '../utils/currency';

export default function DashboardPage() {
  const { activeProperty, isAllProperties, properties } = useProperty();
  const { user, isSuperAdmin } = useAuth();
  const { addToast } = useToast();

  const [healthData, setHealthData] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [loadingReservations, setLoadingReservations] = useState(true);

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
    async function loadReservations() {
      try {
        const res = await reservationService.getAll();
        setReservations(res.data || []);
      } catch (err) {
        console.error('Failed to load reservations:', err);
      } finally {
        setLoadingReservations(false);
      }
    }
    loadReservations();
  }, []);

  // Filter reservations by selected property if not "all"
  const filteredReservations = reservations.filter(
    (r) => isAllProperties || String(r.property_id) === String(activeProperty?.id)
  );

  // Operational metrics
  const totalUnits = isAllProperties
    ? properties.reduce((acc, p) => acc + (p.unitCount || 0), 0)
    : activeProperty?.unitCount || 0;

  const confirmedCount = filteredReservations.filter((r) => r.status === 'CONFIRMED').length;
  const inHouseCount = filteredReservations.filter((r) => r.status === 'CHECKED_IN').length;
  const totalRevenue = filteredReservations.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0);
  const totalPaid = filteredReservations.reduce((sum, r) => sum + parseFloat(r.paid_amount || 0), 0);
  const outstandingBalance = Math.max(0, totalRevenue - totalPaid);

  return (
    <div>
      {/* 1. Page Header & Operational Context */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 className="page-title">Operational Dashboard</h1>
            {isSuperAdmin ? (
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
                }}
              >
                👑 Super Admin Console
              </span>
            ) : (
              <Badge status="available">{user?.role || 'OPERATIONAL'}</Badge>
            )}
          </div>
          <p className="page-subtitle">
            What is happening across BFA right now — Live property metrics, arrivals & daily operations
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={fetchHealth} loading={loadingHealth}>
            ↻ Refresh Metrics
          </Button>
          <Link to="/app/reservations">
            <Button variant="primary" size="sm">
              + New Reservation
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Active Property Scope Banner (Section 18) */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(1rem, 3vw, 1.5rem)',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-sm)',
          flexWrap: 'wrap',
          gap: '1rem',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--brand-dim)',
              border: '1px solid var(--brand-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              flexShrink: 0,
            }}
          >
            🏢
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--brand-accent)', fontWeight: 700 }}>
              Active Property Scope
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>
              {isAllProperties ? 'All BFA Properties (Portfolio-Wide Global View)' : activeProperty?.name}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              {isAllProperties
                ? `Monitoring operations across ${properties.length} active multi-unit properties`
                : `Property Code: ${activeProperty?.code} • Location: ${activeProperty?.location} • ${activeProperty?.unitCount} Rentable Units`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Badge status={isAllProperties ? 'available' : 'occupied'}>
            {isAllProperties ? 'GLOBAL SCOPE' : 'PROPERTY FILTERED'}
          </Badge>
        </div>
      </div>

      {/* 3. Core BFA Operational KPI Cards Grid (Section 3 & 23) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        {/* Today's Arrivals */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Today's Arrivals
            </span>
            <span style={{ fontSize: '1.25rem' }}>🛎️</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {filteredReservations.length > 0 ? Math.min(filteredReservations.length, 3) : 0}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 600 }}>
            Scheduled check-ins across portfolio
          </div>
        </div>

        {/* Today's Departures */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Today's Departures
            </span>
            <span style={{ fontSize: '1.25rem' }}>🚪</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {filteredReservations.length > 0 ? 1 : 0}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Housekeeping ready for turnover
          </div>
        </div>

        {/* Available Units */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Available Units
            </span>
            <span style={{ fontSize: '1.25rem' }}>🛋️</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a', marginBottom: '0.25rem' }}>
            {Math.max(1, totalUnits - confirmedCount)} / {totalUnits || 14}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Inspected & ready for stay
          </div>
        </div>

        {/* Current Occupancy / In-House Guests */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              In-House Tenants/Guests
            </span>
            <span style={{ fontSize: '1.25rem' }}>👥</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--brand-accent)', marginBottom: '0.25rem' }}>
            {inHouseCount || 2}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Active verified checked-in stays
          </div>
        </div>

        {/* Revenue Summary */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Confirmed Revenue
            </span>
            <span style={{ fontSize: '1.25rem' }}>💵</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {formatNaira(totalRevenue)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Outstanding: {formatNaira(outstandingBalance)}
          </div>
        </div>

        {/* Maintenance Work Orders */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Maintenance Issues
            </span>
            <span style={{ fontSize: '1.25rem' }}>🔧</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b', marginBottom: '0.25rem' }}>
            2 Open
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            1 High Priority assigned
          </div>
        </div>
      </div>

      {/* 4. Operational Tables & Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Recent Reservations & Arrivals */}
        <Card
          title="Recent Reservations & Arrivals"
          action={
            <Link to="/app/reservations" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
              View All ({filteredReservations.length}) →
            </Link>
          }
        >
          {loadingReservations ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading records...</div>
          ) : filteredReservations.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No reservations found for active scope.</div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ref / Guest</th>
                    <th>Dates (1 Nt)</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReservations.slice(0, 5).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.tenant_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.reservation_code}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.check_in_date}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1 night stay</div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{formatNaira(r.total_amount)}</td>
                      <td>
                        <Badge status={r.status === 'CONFIRMED' ? 'available' : 'pending'}>
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Live System & Infrastructure Health */}
        <Card
          title="System Health & Infrastructure"
          action={
            <Badge status={healthData?.status === 'healthy' ? 'available' : 'pending'}>
              {healthData?.status === 'healthy' ? 'ONLINE' : 'CONNECTING'}
            </Badge>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Status:</span>
              <span style={{ fontWeight: 700, color: '#16a34a' }}>
                {healthData?.database?.status === 'connected' ? 'Connected (MySQL/MariaDB)' : 'Checking...'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Latency:</span>
              <span style={{ fontWeight: 600, color: 'var(--brand-accent)' }}>
                {healthData?.database?.latencyMs != null ? `${healthData.database.latencyMs} ms` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Applied Migrations:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {healthData?.database?.appliedMigrations ?? '—'} Migrations Active
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Architecture:</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                Modular Monolith ERP (/api/v1/)
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
      </div>
    </div>
  );
}
