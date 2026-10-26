import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { frontOfficeService, financialService, maintenanceService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function AdminManagerDashboard({ role = 'MANAGER' }) {
  const navigate = useNavigate();
  const { activeProperty, isAllProperties } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [activeTab, setActiveTab] = useState('arrivals'); // 'arrivals' | 'departures'

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

  const [financial, setFinancial] = useState({
    grossCollected: 0,
    netRevenue: 0,
    outstandingReceivables: 0,
  });

  const [maintenance, setMaintenance] = useState({
    openCount: 0,
    inProgressCount: 0,
    criticalCount: 0,
  });

  const [arrivals, setArrivals] = useState([]);
  const [departures, setDepartures] = useState([]);

  const propertyId = isAllProperties ? undefined : activeProperty?.id;

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, arrRes, depRes, finRes, maintRes] = await Promise.all([
        frontOfficeService.getStats({ propertyId }).catch(() => ({ data: {} })),
        frontOfficeService.getArrivals({ propertyId }).catch(() => ({ data: [] })),
        frontOfficeService.getDepartures({ propertyId }).catch(() => ({ data: [] })),
        financialService.getOverview({ propertyId }).catch(() => ({ data: { kpis: {} } })),
        maintenanceService.getStats({ propertyId }).catch(() => ({ data: {} })),
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

      const kpis = finRes.data?.kpis || {};
      setFinancial({
        grossCollected: kpis.grossCollected || 0,
        netRevenue: kpis.netRevenue || 0,
        outstandingReceivables: kpis.outstandingReceivables || 0,
      });

      const maintData = maintRes.data?.overview || maintRes.data || {};
      setMaintenance({
        openCount: maintData.open ?? maintData.open_count ?? 0,
        inProgressCount: maintData.inProgress ?? maintData.in_progress_count ?? 0,
        criticalCount: maintData.criticalOpen ?? maintData.critical_open_count ?? maintData.critical_count ?? 0,
      });
    } catch (err) {
      console.error('Failed to load operations dashboard data:', err);
      addToast('Unable to load operational dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [propertyId]);

  const handleCheckIn = async (reservationId) => {
    setActionLoadingId(reservationId);
    try {
      await frontOfficeService.checkIn(reservationId);
      addToast('Guest checked in successfully', 'success');
      loadData();
    } catch (err) {
      addToast(err?.message || 'Check-in failed', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCheckOut = async (reservationId) => {
    setActionLoadingId(reservationId);
    try {
      await frontOfficeService.checkOut(reservationId);
      addToast('Guest checked out successfully', 'success');
      loadData();
    } catch (err) {
      addToast(err?.message || 'Check-out failed', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const occupancyRate = stats.totalUnits > 0 ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              {role === 'ADMIN' ? 'Property Administrator Command Console' : 'General Operations Dashboard'}
            </h1>
            <Badge status="available">{role}</Badge>
            <Badge status="info">
              {isAllProperties ? '🌐 All Properties' : `📍 ${activeProperty?.name || 'Selected Property'}`}
            </Badge>
          </div>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Authoritative operational indicators, live front desk movements, unit readiness, and financial status.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="outline" size="sm" onClick={loadData} loading={loading}>
            ↻ Refresh Operations
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/app/reservations?openNew=true')}>
            + New Reservation
          </Button>
        </div>
      </div>

      {/* Primary Operational Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Today's Arrivals */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>TODAY'S ARRIVALS</span>
              <span style={{ fontSize: '1.25rem' }}>🧳</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2563eb', marginBottom: '0.25rem' }}>
              {loading ? '...' : stats.todaysArrivals}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {arrivals.length} pending check-in
            </div>
          </div>
        </Card>

        {/* Today's Departures */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>TODAY'S DEPARTURES</span>
              <span style={{ fontSize: '1.25rem' }}>🚪</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#d97706', marginBottom: '0.25rem' }}>
              {loading ? '...' : stats.todaysDepartures}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {departures.length} pending check-out
            </div>
          </div>
        </Card>

        {/* In-House Guests */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>IN-HOUSE GUESTS</span>
              <span style={{ fontSize: '1.25rem' }}>👥</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#059669', marginBottom: '0.25rem' }}>
              {loading ? '...' : stats.inHouseGuests}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Occupancy: {occupancyRate}%
            </div>
          </div>
        </Card>

        {/* Available Units */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>AVAILABLE UNITS</span>
              <span style={{ fontSize: '1.25rem' }}>🔑</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              {loading ? '...' : stats.availableUnits}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {stats.totalUnits} total units
            </div>
          </div>
        </Card>

        {/* Gross Revenue */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>GROSS COLLECTED</span>
              <span style={{ fontSize: '1.25rem' }}>💳</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669', marginBottom: '0.25rem' }}>
              {loading ? '...' : formatNaira(financial.grossCollected)}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Receivables: {loading ? '...' : formatNaira(financial.outstandingReceivables)}
            </div>
          </div>
        </Card>

        {/* Open Work Orders */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>MAINTENANCE ORDERS</span>
              <span style={{ fontSize: '1.25rem' }}>🔧</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: maintenance.openCount > 0 ? '#b45309' : '#059669', marginBottom: '0.25rem' }}>
              {loading ? '...' : maintenance.openCount}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {maintenance.criticalCount > 0 ? `${maintenance.criticalCount} critical` : `${maintenance.inProgressCount} in progress`}
            </div>
          </div>
        </Card>
      </div>

      {/* Housekeeping Turnover Board */}
      <Card title="Housekeeping & Unit Readiness Velocity">
        <div style={{ padding: '1rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '0.5rem',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>AVAILABLE & READY</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#15803d' }}>{stats.availableUnits}</div>
              </div>
              <span style={{ fontSize: '1.5rem' }}>✨</span>
            </div>

            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '0.5rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>DIRTY (TURNOVER REQ)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b91c1c' }}>{stats.dirtyUnits}</div>
              </div>
              <span style={{ fontSize: '1.5rem' }}>🧹</span>
            </div>

            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '0.5rem',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600 }}>CLEANING IN PROGRESS</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b45309' }}>{stats.cleaningUnits}</div>
              </div>
              <span style={{ fontSize: '1.5rem' }}>🧼</span>
            </div>

            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '0.5rem',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>UNDER MAINTENANCE</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#334155' }}>{stats.maintenanceUnits}</div>
              </div>
              <span style={{ fontSize: '1.5rem' }}>🛠️</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Arrivals & Departures Worklist */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setActiveTab('arrivals')}
                style={{
                  background: activeTab === 'arrivals' ? 'var(--primary)' : 'transparent',
                  color: activeTab === 'arrivals' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '0.35rem 0.85rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                Today's Arrivals ({arrivals.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('departures')}
                style={{
                  background: activeTab === 'departures' ? 'var(--primary)' : 'transparent',
                  color: activeTab === 'departures' ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '0.35rem 0.85rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                Today's Departures ({departures.length})
              </button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/app/front-office')}>
              Open Front Office Hub →
            </Button>
          </div>
        }
      >
        <div style={{ padding: '0.5rem 1rem 1rem' }}>
          {activeTab === 'arrivals' ? (
            arrivals.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No pending arrivals remaining today.
              </div>
            ) : (
              <Table
                columns={[
                  {
                    header: 'Booking Code',
                    key: 'booking_code',
                    render: (val, row) => {
                      const code = val || row?.booking_code;
                      return (
                        <span
                          style={{ fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}
                          onClick={() => navigate(`/app/reservations?search=${encodeURIComponent(code || '')}`)}
                        >
                          {code}
                        </span>
                      );
                    },
                  },
                  {
                    header: 'Guest Name',
                    key: 'guest_name',
                    render: (val, row) => (
                      <div>
                        <div style={{ fontWeight: 600 }}>{val || row?.guest_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row?.guest_phone || row?.guest_email}</div>
                      </div>
                    ),
                  },
                  {
                    header: 'Unit / Apartment',
                    key: 'unit_number',
                    render: (val, row) => {
                      const unit = val || row?.unit_number;
                      return (
                        <Badge status="info">
                          {unit ? `Unit ${unit}` : 'Unassigned'}
                        </Badge>
                      );
                    },
                  },
                  {
                    header: 'Payment Status',
                    key: 'payment_status',
                    render: (val, row) => {
                      const status = val || row?.payment_status;
                      const isPaid = status === 'PAID' || parseFloat(row?.paid_amount || 0) >= parseFloat(row?.total_amount || 1);
                      return <Badge status={isPaid ? 'available' : 'maintenance'}>{isPaid ? 'PAID' : 'PENDING'}</Badge>;
                    },
                  },
                  {
                    header: 'Actions',
                    key: 'id',
                    render: (val, row) => {
                      const resId = val || row?.id;
                      return (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button
                            variant="primary"
                            size="xs"
                            loading={actionLoadingId === resId}
                            onClick={() => handleCheckIn(resId)}
                          >
                            Check In
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => navigate(`/app/reservations?search=${encodeURIComponent(row?.booking_code || '')}`)}
                          >
                            View
                          </Button>
                        </div>
                      );
                    },
                  },
                ]}
                data={arrivals}
              />
            )
          ) : departures.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No pending departures remaining today.
            </div>
          ) : (
            <Table
              columns={[
                {
                  header: 'Booking Code',
                  key: 'booking_code',
                  render: (val, row) => {
                    const code = val || row?.booking_code;
                    return (
                      <span
                        style={{ fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}
                        onClick={() => navigate(`/app/reservations?search=${encodeURIComponent(code || '')}`)}
                      >
                        {code}
                      </span>
                    );
                  },
                },
                {
                  header: 'Guest Name',
                  key: 'guest_name',
                  render: (val, row) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{val || row?.guest_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row?.guest_phone || row?.guest_email}</div>
                    </div>
                  ),
                },
                {
                  header: 'Unit',
                  key: 'unit_number',
                  render: (val, row) => <Badge status="info">Unit {val || row?.unit_number || 'N/A'}</Badge>,
                },
                {
                  header: 'Balance',
                  key: 'balance',
                  render: (val, row) => {
                    const balance = Math.max(0, parseFloat(row?.total_amount || 0) - parseFloat(row?.paid_amount || 0));
                    return balance > 0 ? (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>{formatNaira(balance)} Due</span>
                    ) : (
                      <Badge status="available">Cleared</Badge>
                    );
                  },
                },
                {
                  header: 'Actions',
                  key: 'id',
                  render: (val, row) => {
                    const resId = val || row?.id;
                    return (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button
                          variant="secondary"
                          size="xs"
                          loading={actionLoadingId === resId}
                          onClick={() => handleCheckOut(resId)}
                        >
                          Check Out
                        </Button>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => navigate(`/app/reservations?search=${encodeURIComponent(row?.booking_code || '')}`)}
                        >
                          View
                        </Button>
                      </div>
                    );
                  },
                },
              ]}
              data={departures}
            />
          )}
        </div>
      </Card>

      {/* Operational Quick Actions Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          onClick={() => navigate('/app/front-office')}
          style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🛎️</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Front Office Hub</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Manage arrivals, departures & in-house guests</div>
        </div>

        <div
          onClick={() => navigate('/app/apartments')}
          style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🏢</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Apartments & Units</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Inspect unit statuses, turnover & rates</div>
        </div>

        <div
          onClick={() => navigate('/app/maintenance')}
          style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🛠️</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Maintenance Orders</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Dispatch work orders & monitor repairs</div>
        </div>

        <div
          onClick={() => navigate('/app/financial')}
          style={{
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>💳</div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Financial Ledger</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Audit payments, transactions & balances</div>
        </div>
      </div>
    </div>
  );
}
