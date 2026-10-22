import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { frontOfficeService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function ReceptionistDashboard() {
  const navigate = useNavigate();
  const { activeProperty, isAllProperties } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [stats, setStats] = useState({
    todaysArrivals: 0,
    todaysDepartures: 0,
    inHouseGuests: 0,
    totalUnits: 0,
    availableUnits: 0,
    occupiedUnits: 0,
    dirtyUnits: 0,
    cleaningUnits: 0,
    maintenanceUnits: 0,
  });
  const [arrivals, setArrivals] = useState([]);
  const [departures, setDepartures] = useState([]);
  const [activeTab, setActiveTab] = useState('arrivals'); // 'arrivals' | 'departures'

  const propertyId = isAllProperties ? undefined : activeProperty?.id;

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, arrRes, depRes] = await Promise.all([
        frontOfficeService.getStats({ propertyId }).catch(() => ({ data: {} })),
        frontOfficeService.getArrivals({ propertyId }).catch(() => ({ data: [] })),
        frontOfficeService.getDepartures({ propertyId }).catch(() => ({ data: [] })),
      ]);

      if (statsRes.data) {
        setStats({
          todaysArrivals: statsRes.data.todaysArrivals || 0,
          todaysDepartures: statsRes.data.todaysDepartures || 0,
          inHouseGuests: statsRes.data.inHouseGuests || 0,
          totalUnits: statsRes.data.totalUnits || 0,
          availableUnits: statsRes.data.availableUnits || 0,
          occupiedUnits: statsRes.data.occupiedUnits || 0,
          dirtyUnits: statsRes.data.dirtyUnits || 0,
          cleaningUnits: statsRes.data.cleaningUnits || 0,
          maintenanceUnits: statsRes.data.maintenanceUnits || 0,
        });
      }
      setArrivals(arrRes.data || []);
      setDepartures(depRes.data || []);
    } catch (err) {
      addToast(`Failed to load front desk metrics: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [propertyId]);

  const handleQuickCheckIn = async (reservationId) => {
    setActionLoadingId(reservationId);
    try {
      await frontOfficeService.checkIn(reservationId);
      addToast('Guest checked in successfully! Unit status set to OCCUPIED.', 'success');
      loadData();
    } catch (err) {
      addToast(`Check-in failed: ${err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleQuickCheckOut = async (reservationId) => {
    setActionLoadingId(reservationId);
    try {
      await frontOfficeService.checkOut(reservationId);
      addToast('Guest checked out successfully! Unit flagged for housekeeping turnover.', 'success');
      loadData();
    } catch (err) {
      addToast(`Check-out failed: ${err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const turnoverQueueCount = stats.dirtyUnits + stats.cleaningUnits;

  return (
    <div>
      {/* 1. Header & Actions */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 className="page-title">Front Desk Operations Console</h1>
            <Badge status="available">RECEPTIONIST</Badge>
          </div>
          <p className="page-subtitle">
            Daily guest reception, arrivals velocity, departures turnover, and room readiness board
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={loadData} loading={loading}>
            ↻ Refresh Queue
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/app/reservations?openNew=true')}
          >
            + Quick Walk-In Booking
          </Button>
        </div>
      </div>

      {/* 2. Operational Status / Property Scope Banner */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-sm)',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              color: '#d97706',
            }}
          >
            🛎️
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--brand-accent)', fontWeight: 700 }}>
              Front Office Active Scope
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {isAllProperties ? 'All Assigned Front Desks' : activeProperty?.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {isAllProperties ? 'Portfolio check-in stream' : `Building Code: ${activeProperty?.code} • ${activeProperty?.unitCount || stats.totalUnits} Units`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" size="sm" onClick={() => navigate('/app/front-office')}>
            Open Daily Board →
          </Button>
        </div>
      </div>

      {/* 3. Receptionist Front Desk KPI Cards */}
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
            cursor: 'pointer',
          }}
          onClick={() => setActiveTab('arrivals')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Today's Arrivals
            </span>
            <span style={{ fontSize: '1.25rem' }}>🧳</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#10b981', marginBottom: '0.25rem' }}>
            {loading ? '—' : stats.todaysArrivals}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Scheduled check-ins today
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
            cursor: 'pointer',
          }}
          onClick={() => setActiveTab('departures')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Today's Departures
            </span>
            <span style={{ fontSize: '1.25rem' }}>🔑</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#f59e0b', marginBottom: '0.25rem' }}>
            {loading ? '—' : stats.todaysDepartures}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Check-outs & key turnover
          </div>
        </div>

        {/* In-House Guests */}
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
              In-House Stays
            </span>
            <span style={{ fontSize: '1.25rem' }}>👥</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--brand-accent)', marginBottom: '0.25rem' }}>
            {loading ? '—' : stats.inHouseGuests}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Currently occupied rooms
          </div>
        </div>

        {/* Available Ready Units */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/app/apartments?status=AVAILABLE')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Available & Clean
            </span>
            <span style={{ fontSize: '1.25rem' }}>🛋️</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#10b981', marginBottom: '0.25rem' }}>
            {loading ? '—' : stats.availableUnits} / {stats.totalUnits || '—'}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Inspected & ready for walk-in ↗
          </div>
        </div>

        {/* Housekeeping Turnover Queue */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/app/apartments?status=DIRTY')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Housekeeping Queue
            </span>
            <span style={{ fontSize: '1.25rem' }}>🧹</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: turnoverQueueCount > 0 ? '#ef4444' : '#10b981', marginBottom: '0.25rem' }}>
            {loading ? '—' : turnoverQueueCount}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {stats.dirtyUnits} Dirty • {stats.cleaningUnits} Cleaning
          </div>
        </div>
      </div>

      {/* 4. Tabbed Arrivals & Departures Worklist */}
      <Card
        title={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setActiveTab('arrivals')}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                color: activeTab === 'arrivals' ? 'var(--brand-accent)' : 'var(--text-muted)',
                borderBottom: activeTab === 'arrivals' ? '2px solid var(--brand-accent)' : '2px solid transparent',
                paddingBottom: '0.25rem',
              }}
            >
              🛎️ Expected Arrivals ({arrivals.length})
            </button>
            <span style={{ color: 'var(--border-default)' }}>|</span>
            <button
              type="button"
              onClick={() => setActiveTab('departures')}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                color: activeTab === 'departures' ? 'var(--brand-accent)' : 'var(--text-muted)',
                borderBottom: activeTab === 'departures' ? '2px solid var(--brand-accent)' : '2px solid transparent',
                paddingBottom: '0.25rem',
              }}
            >
              🔑 Today's Departures ({departures.length})
            </button>
          </div>
        }
        action={
          <Button variant="outline" size="sm" onClick={() => navigate('/app/front-office')}>
            Full Front Office Board →
          </Button>
        }
      >
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading front desk queue...
          </div>
        ) : activeTab === 'arrivals' ? (
          arrivals.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No check-ins scheduled for today under active scope.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Guest Details</th>
                    <th>Booking Code</th>
                    <th>Unit / Property</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {arrivals.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div
                          style={{ fontWeight: 700, color: 'var(--brand-accent)', cursor: 'pointer' }}
                          onClick={() => navigate(`/app/guests?search=${encodeURIComponent(r.tenant_name || '')}`)}
                        >
                          {r.tenant_name} ↗
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.tenant_phone || r.tenant_email}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.reservation_code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>Unit {r.unit_number || r.apartment_id}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.property_name}</div>
                      </td>
                      <td>
                        <Badge status="available">1 Night</Badge>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Out: {r.check_out_date}
                        </div>
                      </td>
                      <td>
                        <Badge status={r.status === 'CONFIRMED' ? 'available' : 'pending'}>
                          {r.status}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant="primary"
                          size="small"
                          loading={actionLoadingId === r.id}
                          onClick={() => handleQuickCheckIn(r.id)}
                        >
                          Check In
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          departures.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No check-outs scheduled for today under active scope.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Guest Details</th>
                    <th>Booking Code</th>
                    <th>Unit / Property</th>
                    <th>Departure Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {departures.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.tenant_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.tenant_phone}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.reservation_code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>Unit {r.unit_number || r.apartment_id}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.property_name}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f59e0b' }}>Today ({r.check_out_date})</div>
                      </td>
                      <td>
                        <Badge status="occupied">IN-HOUSE</Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant="secondary"
                          size="small"
                          loading={actionLoadingId === r.id}
                          onClick={() => handleQuickCheckOut(r.id)}
                        >
                          Complete Check-Out
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </div>
  );
}
