import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { frontOfficeService, reservationService, apartmentService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function FrontOfficePage() {
  const navigate = useNavigate();
  const { properties, activePropertyId } = useProperty();
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const isOwner = user?.role === 'OWNER';
  const isManagerOrAdmin = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user?.role);

  const [activeTab, setActiveTab] = useState('PENDING_APPROVAL'); // 'PENDING_APPROVAL' | 'ARRIVALS' | 'IN_HOUSE' | 'DEPARTURES' | 'HOUSEKEEPING'
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const [stats, setStats] = useState({
    todaysArrivals: 0,
    todaysDepartures: 0,
    inHouseGuests: 0,
    dirtyUnits: 0,
    pendingUnassigned: 0,
  });

  const [dataList, setDataList] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [dirtyApartments, setDirtyApartments] = useState([]);
  const [liveFeed, setLiveFeed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());

  // Reservation detail modal
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Prompt modal for No-Show reason
  const [noShowId, setNoShowId] = useState(null);
  const [noShowReason, setNoShowReason] = useState('');

  // Sync with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Load live front office operational data
  const loadFrontOfficeData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const propIdParam = propertyFilter !== 'all' ? propertyFilter : undefined;

      // 1. Fetch stats
      const statsRes = await frontOfficeService.getStats({
        propertyId: propIdParam,
        date: selectedDate,
      });
      setStats(statsRes.data || {});

      // 2. Fetch pending bookings (always keep fresh for alert badge and pending tab)
      const pendingRes = await frontOfficeService.getPendingBookings({
        propertyId: propIdParam,
      });
      setPendingBookings(pendingRes.data || []);

      // 3. If Manager or Admin, load live operational feed
      if (isManagerOrAdmin) {
        try {
          const feedRes = await frontOfficeService.getLiveOperationalFeed({
            propertyId: propIdParam,
            limit: 15,
          });
          setLiveFeed(feedRes.data || []);
        } catch {
          // Non-blocking feed load
        }
      }

      // 4. Fetch active tab specific data
      if (activeTab === 'PENDING_APPROVAL') {
        setDataList(pendingRes.data || []);
      } else if (activeTab === 'ARRIVALS') {
        const res = await frontOfficeService.getArrivals({
          propertyId: propIdParam,
          date: selectedDate,
        });
        setDataList(res.data || []);
      } else if (activeTab === 'IN_HOUSE') {
        const res = await frontOfficeService.getCurrentGuests({
          propertyId: propIdParam,
        });
        setDataList(res.data || []);
      } else if (activeTab === 'DEPARTURES') {
        const res = await frontOfficeService.getDepartures({
          propertyId: propIdParam,
          date: selectedDate,
        });
        setDataList(res.data || []);
      } else if (activeTab === 'HOUSEKEEPING') {
        const res = await apartmentService.getAll({
          propertyId: propIdParam,
          status: 'DIRTY',
        });
        setDirtyApartments(res.data || []);
      }

      setLastRefreshedAt(new Date());
    } catch (err) {
      if (!isSilent) {
        addToast(`Error loading front office: ${err.message}`, 'error');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [propertyFilter, selectedDate, activeTab, isManagerOrAdmin, addToast]);

  // Initial and reactive fetch
  useEffect(() => {
    loadFrontOfficeData(false);
  }, [loadFrontOfficeData]);

  // Live polling interval (every 4 seconds) for real-time reflection
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadFrontOfficeData(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadFrontOfficeData]);

  // Accept client & approve booking
  const handleAcceptClient = async (reservationId) => {
    setActionLoadingId(reservationId);
    try {
      const res = await frontOfficeService.acceptReservation(reservationId);
      addToast(
        res.data?.message || 'Client accepted and booking approved! Recorded in your employee performance evaluation.',
        'success'
      );
      await loadFrontOfficeData(false);
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      addToast(`Acceptance failed: ${errMsg}`, 'error');
      await loadFrontOfficeData(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Check-In
  const handleCheckIn = async (reservationId) => {
    setActionLoadingId(reservationId);
    try {
      await frontOfficeService.checkIn(reservationId);
      addToast('Guest successfully checked in! Unit operational status set to OCCUPIED.', 'success');
      loadFrontOfficeData(false);
    } catch (err) {
      addToast(`Check-in failed: ${err.response?.data?.error?.message || err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Check-Out
  const handleCheckOut = async (reservationId) => {
    setActionLoadingId(reservationId);
    try {
      await frontOfficeService.checkOut(reservationId);
      addToast('Guest checked out successfully! Unit operational status set to DIRTY for housekeeping.', 'success');
      loadFrontOfficeData(false);
    } catch (err) {
      addToast(`Check-out failed: ${err.response?.data?.error?.message || err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // No-Show
  const handleNoShow = async () => {
    if (!noShowId) return;
    setActionLoadingId(noShowId);
    try {
      await frontOfficeService.noShow(noShowId, { reason: noShowReason || 'Guest did not arrive' });
      addToast('Reservation marked as NO_SHOW. Unit released.', 'success');
      setNoShowId(null);
      setNoShowReason('');
      loadFrontOfficeData(false);
    } catch (err) {
      addToast(`Failed: ${err.response?.data?.error?.message || err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Mark unit Ready
  const handleMarkClean = async (apartmentId) => {
    setActionLoadingId(apartmentId);
    try {
      await apartmentService.updateStatus(apartmentId, { status: 'READY' });
      addToast('Unit inspected and marked READY for incoming guests!', 'success');
      loadFrontOfficeData(false);
    } catch (err) {
      addToast(`Error: ${err.response?.data?.error?.message || err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open full reservation details
  const handleViewDetails = async (row) => {
    try {
      const res = await reservationService.getById(row.id);
      setSelectedReservation(res.data);
      setIsDetailOpen(true);
    } catch {
      setSelectedReservation(row);
      setIsDetailOpen(true);
    }
  };

  // OWNER VIEW: Owner does not manage micro desk acceptances; needs overall employee performance
  if (isOwner) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 className="page-title" style={{ margin: 0 }}>
                Executive Front Desk & Operational Overview
              </h1>
              <Badge status="info">EXECUTIVE VIEW</Badge>
            </div>
            <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
              High-level operational overview. Day-to-day client acceptance and desk assignments are delegated to Front Desk Staff & Management.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="primary" onClick={() => navigate('/app/performance')}>
              📊 View Employee Performance
            </Button>
            <Button variant="outline" onClick={() => navigate('/app/evaluations')}>
              📋 View Staff Evaluations
            </Button>
          </div>
        </div>

        {/* Operational Overview Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <Card>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Units
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {stats.totalUnits || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Managed across properties
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Current In-House Guests
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
              {stats.inHouseGuests || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Active occupied units
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Today's Arrivals
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>
              {stats.todaysArrivals || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Bookings scheduled for today
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Available Units
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0ea5e9', marginTop: '0.25rem' }}>
              {stats.availableUnits || 0}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Ready for immediate booking
            </div>
          </Card>
        </div>

        {/* Executive Delegation Notice Card */}
        <Card>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🛡️</span>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                Delegated Staff Operations & Performance Tracking
              </h3>
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Front desk client acceptance is locked to individual front desk staff members to ensure accountability (one client cannot be accepted by two employees). All client bookings and front-desk actions automatically increment that employee's live performance score.
            </p>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => navigate('/app/performance')}>
                Open Employee Performance Hub →
              </Button>
              <Button variant="outline" onClick={() => navigate('/app/reports/financial')}>
                View Financial & Occupancy Reports →
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // FRONT DESK / MANAGEMENT VIEW
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Front Office Operations
            </h1>
            <Badge status="available">LIVE DESK</Badge>
            {autoRefresh && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  color: '#16a34a',
                  fontWeight: 600,
                  background: 'rgba(22, 163, 74, 0.1)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#16a34a',
                    display: 'inline-block',
                    boxShadow: '0 0 6px #16a34a',
                  }}
                />
                Live Reflection Active
              </span>
            )}
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
            Immediate booking reflection, unit availability verification, concurrency-locked staff acceptance, and live guest turnover.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '0.45rem 0.75rem',
              background: autoRefresh ? 'rgba(22, 163, 74, 0.15)' : 'var(--bg-surface)',
              border: `1px solid ${autoRefresh ? '#16a34a' : 'var(--border-default)'}`,
              color: autoRefresh ? '#16a34a' : 'var(--text-secondary)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="Toggle live background sync (every 4 seconds)"
          >
            {autoRefresh ? '⚡ Live Sync: ON' : '⏸ Sync: Paused'}
          </button>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: '0.45rem 0.65rem',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
            }}
          />
          <Button variant="outline" size="sm" onClick={() => loadFrontOfficeData(false)} loading={loading}>
            ↻ Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '1rem' }}>
        {/* Pending & Incoming Bookings */}
        <div
          onClick={() => setActiveTab('PENDING_APPROVAL')}
          style={{
            background: activeTab === 'PENDING_APPROVAL' ? 'rgba(234, 88, 12, 0.12)' : 'var(--bg-card)',
            border: activeTab === 'PENDING_APPROVAL' ? '2px solid #ea580c' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Incoming Bookings
            </span>
            {pendingBookings.filter(b => !b.assigned_staff_id).length > 0 && (
              <span
                style={{
                  background: '#ea580c',
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '10px',
                }}
              >
                NEW
              </span>
            )}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#ea580c' }}>
            {pendingBookings.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {pendingBookings.filter(b => !b.assigned_staff_id).length} unassigned
          </div>
        </div>

        {/* Arrivals */}
        <div
          onClick={() => setActiveTab('ARRIVALS')}
          style={{
            background: activeTab === 'ARRIVALS' ? 'var(--brand-dim)' : 'var(--bg-card)',
            border: activeTab === 'ARRIVALS' ? '2px solid var(--brand-accent)' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Today's Arrivals
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#1e5c99' }}>
            {stats.todaysArrivals}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Expected arrivals today
          </div>
        </div>

        {/* In House */}
        <div
          onClick={() => setActiveTab('IN_HOUSE')}
          style={{
            background: activeTab === 'IN_HOUSE' ? 'rgba(34, 139, 34, 0.1)' : 'var(--bg-card)',
            border: activeTab === 'IN_HOUSE' ? '2px solid #196f19' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            In-House Guests
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#196f19' }}>
            {stats.inHouseGuests}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Currently staying in units
          </div>
        </div>

        {/* Departures */}
        <div
          onClick={() => setActiveTab('DEPARTURES')}
          style={{
            background: activeTab === 'DEPARTURES' ? 'rgba(217, 119, 6, 0.1)' : 'var(--bg-card)',
            border: activeTab === 'DEPARTURES' ? '2px solid #b45309' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Today's Departures
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#b45309' }}>
            {stats.todaysDepartures}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Check-outs due today
          </div>
        </div>

        {/* Housekeeping */}
        <div
          onClick={() => setActiveTab('HOUSEKEEPING')}
          style={{
            background: activeTab === 'HOUSEKEEPING' ? 'rgba(220, 38, 38, 0.08)' : 'var(--bg-card)',
            border: activeTab === 'HOUSEKEEPING' ? '2px solid var(--rust-light)' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
            Housekeeping Queue
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--rust-light)' }}>
            {stats.dirtyUnits}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Units currently DIRTY
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
        {[
          { key: 'PENDING_APPROVAL', label: 'Incoming Bookings & Approvals', count: pendingBookings.length, highlight: pendingBookings.filter(b => !b.assigned_staff_id).length > 0 },
          { key: 'ARRIVALS', label: "Today's Arrivals", count: stats.todaysArrivals },
          { key: 'IN_HOUSE', label: 'Current In-House Guests', count: stats.inHouseGuests },
          { key: 'DEPARTURES', label: "Today's Departures", count: stats.todaysDepartures },
          { key: 'HOUSEKEEPING', label: 'Housekeeping Queue (DIRTY)', count: stats.dirtyUnits },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === tab.key ? 'var(--brand-accent)' : 'transparent',
              color: activeTab === tab.key ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{tab.label}</span>
            <span
              style={{
                fontSize: '0.72rem',
                background: tab.highlight && activeTab !== tab.key ? '#ea580c' : activeTab === tab.key ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-card-hover)',
                color: tab.highlight && activeTab !== tab.key ? '#ffffff' : activeTab === tab.key ? '#ffffff' : 'var(--text-muted)',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: tab.highlight ? 700 : 500,
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Operational Content Layout: Grid with Live Feed on the side for Managers/Admins */}
      <div style={{ display: 'grid', gridTemplateColumns: isManagerOrAdmin ? '1fr 320px' : '1fr', gap: '1.25rem', alignItems: 'flex-start' }}>
        {/* Main Work Area */}
        <Card>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading authoritative front-office records...
            </div>
          ) : activeTab === 'PENDING_APPROVAL' ? (
            /* Incoming & Pending Bookings List */
            pendingBookings.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✨</div>
                <strong>No pending bookings in queue!</strong>
                <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0 0', color: 'var(--text-secondary)' }}>
                  When someone books an apartment online or walk-in, it reflects here immediately for front desk acceptance.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ padding: '0.5rem 0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Incoming Queue: {pendingBookings.length} booking(s) awaiting front-desk acceptance
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Auto-refreshed: {lastRefreshedAt.toLocaleTimeString()}
                  </span>
                </div>

                {pendingBookings.map((row) => {
                  const isUnitAvailable = ['AVAILABLE', 'READY'].includes(row.unit_status);
                  const isAssigned = !!row.assigned_staff_id;
                  const isAssignedToMe = row.assigned_staff_id === user?.id;
                  const isUnitMaintenance = ['MAINTENANCE', 'BLOCKED', 'OUT_OF_SERVICE'].includes(row.unit_status);

                  return (
                    <div
                      key={row.id}
                      style={{
                        padding: '1rem',
                        background: isAssignedToMe ? 'rgba(34, 197, 94, 0.04)' : isAssigned ? 'var(--bg-card)' : 'rgba(234, 88, 12, 0.03)',
                        border: isAssignedToMe ? '1px solid rgba(34, 197, 94, 0.3)' : isAssigned ? '1px solid var(--border-default)' : '1px solid rgba(234, 88, 12, 0.4)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      {/* Guest and Booking Info */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span
                            style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--brand-accent)', cursor: 'pointer' }}
                            onClick={() => navigate(`/app/guests?search=${encodeURIComponent(row.tenant_name)}`)}
                            title="View Guest Profile"
                          >
                            👤 {row.tenant_name}
                          </span>
                          <Badge status={row.status}>{row.status}</Badge>

                          {/* Unit status indicator */}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              backgroundColor: isUnitAvailable ? 'rgba(34, 197, 94, 0.15)' : isUnitMaintenance ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 88, 12, 0.15)',
                              color: isUnitAvailable ? '#15803d' : isUnitMaintenance ? '#b91c1c' : '#c2410c',
                            }}
                          >
                            Unit {row.unit_number}: {row.unit_status || 'UNKNOWN'}
                          </span>

                          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Code: {row.confirmation_code || row.reservation_code || row.id}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                          <strong>{row.property_name}</strong> • Unit {row.unit_number} ({row.unit_type})
                          {' • '}Stay: <strong>{row.check_in_date}</strong> → <strong>{row.check_out_date}</strong>
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span>📞 {row.tenant_phone}</span>
                          <span>Total: <strong>{formatNaira(row.total_amount)}</strong></span>
                          <span>Paid: {formatNaira(row.paid_amount)}</span>

                          {/* Staff Assignment Status */}
                          {isAssigned ? (
                            <span style={{ color: isAssignedToMe ? '#16a34a' : '#2563eb', fontWeight: 600 }}>
                              {isAssignedToMe ? '✓ Assigned to You' : `🔒 Assigned to: ${row.assigned_staff_name || 'Staff #' + row.assigned_staff_id}`}
                            </span>
                          ) : (
                            <span style={{ color: '#ea580c', fontWeight: 600 }}>
                              ⚠️ Unassigned (Pending Front-Desk Acceptance)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Button variant="outline" size="sm" onClick={() => handleViewDetails(row)}>
                          View Details
                        </Button>

                        {/* Front Desk Acceptance Button */}
                        {!isAssigned ? (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isUnitMaintenance || actionLoadingId === row.id}
                            loading={actionLoadingId === row.id}
                            onClick={() => handleAcceptClient(row.id)}
                            style={{
                              backgroundColor: isUnitMaintenance ? 'var(--text-muted)' : '#ea580c',
                              borderColor: isUnitMaintenance ? 'var(--border-default)' : '#ea580c',
                            }}
                            title={
                              isUnitMaintenance
                                ? `Unit is in ${row.unit_status} and cannot be booked until cleared.`
                                : 'Accept client into system, approve booking, and attribute to your performance scorecard.'
                            }
                          >
                            {isUnitMaintenance ? `Unit ${row.unit_status}` : '✓ Accept & Approve Booking'}
                          </Button>
                        ) : isAssignedToMe ? (
                          <span
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: '#16a34a',
                              background: 'rgba(22, 163, 74, 0.1)',
                              padding: '0.4rem 0.75rem',
                              borderRadius: 'var(--radius-md)',
                            }}
                          >
                            ✓ Accepted by You
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: 'var(--text-muted)',
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-default)',
                              padding: '0.4rem 0.75rem',
                              borderRadius: 'var(--radius-md)',
                            }}
                            title="One client cannot be assigned to two front desk staffs"
                          >
                            🔒 Locked to {row.assigned_staff_name || 'Another Staff'}
                          </span>
                        )}

                        {/* Check-In if approved and today is check-in */}
                        {row.status === 'CONFIRMED' && hasPermission('reservations.checkin') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCheckIn(row.id)}
                            loading={actionLoadingId === row.id}
                          >
                            🛎 Check-In
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'HOUSEKEEPING' ? (
            /* Housekeeping Queue Table */
            dirtyApartments.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No dirty units in housekeeping queue! All units are ready or occupied.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {dirtyApartments.map((apt) => (
                  <div
                    key={apt.id}
                    style={{
                      padding: '0.85rem',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div
                        style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--brand-accent)', cursor: 'pointer' }}
                        onClick={() => navigate(`/app/apartments?unitId=${apt.id}&propertyId=${apt.property_id}`)}
                        title="View unit details and status"
                      >
                        Unit {apt.unit_number} — {apt.unit_name} ↗
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        <span
                          style={{ cursor: 'pointer', color: 'var(--brand-accent)' }}
                          onClick={() => navigate(`/app/properties?search=${encodeURIComponent(apt.property_name || '')}`)}
                        >
                          🏢 {apt.property_name} ↗
                        </span>
                        {' • '}Floor: {apt.floor || 1} • Type: {apt.unit_type}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="badge badge-dirty">DIRTY</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/app/inspections?openNew=true&apartmentId=${apt.id}&propertyId=${apt.property_id}`)}
                      >
                        📋 Inspect
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/app/maintenance?openNew=true&apartmentId=${apt.id}&propertyId=${apt.property_id}`)}
                      >
                        🔧 Defect
                      </Button>
                      {hasPermission('apartments.edit') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleMarkClean(apt.id)}
                          loading={actionLoadingId === apt.id}
                        >
                          ✓ Mark Ready
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : dataList.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No records found for {activeTab.replace('_', ' ')} on {selectedDate}.
            </div>
          ) : (
            /* Stays & Reservations List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {dataList.map((row) => (
                <div
                  key={row.id}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span
                        style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--brand-accent)', cursor: 'pointer' }}
                        onClick={() => navigate(`/app/guests?search=${encodeURIComponent(row.tenant_name)}`)}
                        title="View Guest Profile"
                      >
                        👤 {row.tenant_name} ↗
                      </span>
                      <Badge status={row.status}>{row.status}</Badge>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--brand-accent)' }}>
                        🔒 {row.auth_code}
                      </span>
                      {row.assigned_staff_name && (
                        <span style={{ fontSize: '0.72rem', color: '#2563eb', background: 'rgba(37, 99, 235, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                          Staff: {row.assigned_staff_name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      <span
                        style={{ cursor: 'pointer', color: 'var(--brand-accent)', fontWeight: 600 }}
                        onClick={() => navigate(`/app/apartments?unitId=${row.apartment_id}&propertyId=${row.property_id}`)}
                        title="View Unit"
                      >
                        Unit {row.unit_number} ↗
                      </span>
                      {' ('}
                      <span
                        style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}
                        onClick={() => navigate(`/app/properties?search=${encodeURIComponent(row.property_name || '')}`)}
                        title="View Property"
                      >
                        {row.property_name} ↗
                      </span>
                      {`) • Stay: ${row.check_in_date} → ${row.check_out_date}`}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      📞 {row.tenant_phone} • Balance: {formatNaira(row.outstanding_balance)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button variant="outline" size="sm" onClick={() => handleViewDetails(row)}>
                      View Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/app/reservations?search=${encodeURIComponent(row.confirmation_code || row.reservation_code)}`)}
                      title="Open in authoritative Reservations Engine"
                    >
                      Booking ↗
                    </Button>

                    {activeTab === 'ARRIVALS' && row.status === 'CONFIRMED' && hasPermission('reservations.checkin') && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleCheckIn(row.id)}
                          loading={actionLoadingId === row.id}
                        >
                          🛎 Check-In Guest
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setNoShowId(row.id);
                            setNoShowReason('');
                          }}
                        >
                          ⚠️ No-Show
                        </Button>
                      </>
                    )}

                    {(activeTab === 'IN_HOUSE' || activeTab === 'DEPARTURES') &&
                      row.status === 'CHECKED_IN' &&
                      hasPermission('reservations.checkout') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleCheckOut(row.id)}
                          loading={actionLoadingId === row.id}
                        >
                          🚪 Check-Out (Release to DIRTY)
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Live Operational Feed (for Managers and Admins) */}
        {isManagerOrAdmin && (
          <Card>
            <div style={{ padding: '0.5rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>🔴</span>
                  <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Live Operations Feed
                  </strong>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Manager/Admin
                </span>
              </div>

              {liveFeed.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No operational events logged yet today.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '480px', overflowY: 'auto' }}>
                  {liveFeed.map((event) => {
                    let badgeColor = '#2563eb';
                    let label = 'ACTION';
                    if (event.activity_type === 'CLIENT_ACCEPTED') {
                      badgeColor = '#ea580c';
                      label = 'ACCEPTED';
                    } else if (event.activity_type === 'GUEST_CHECKED_IN') {
                      badgeColor = '#16a34a';
                      label = 'CHECK-IN';
                    } else if (event.activity_type === 'GUEST_CHECKED_OUT') {
                      badgeColor = '#b45309';
                      label = 'CHECK-OUT';
                    }

                    return (
                      <div
                        key={event.id}
                        style={{
                          padding: '0.6rem',
                          background: 'var(--bg-surface)',
                          borderRadius: 'var(--radius-sm)',
                          borderLeft: `3px solid ${badgeColor}`,
                          fontSize: '0.78rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                          <strong style={{ color: badgeColor }}>{event.staff_name || 'Staff'}</strong>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                          {event.description}
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.3rem', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: `${badgeColor}20`,
                              color: badgeColor,
                              fontWeight: 700,
                            }}
                          >
                            {label}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {event.staff_role}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* No-Show Modal */}
      {noShowId && (
        <Modal
          isOpen={!!noShowId}
          onClose={() => setNoShowId(null)}
          size="sm"
          icon="⚠️"
          title="Confirm Guest No-Show"
          subtitle="Release unit availability and log the operational reason in the audit trail"
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setNoShowId(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleNoShow} loading={actionLoadingId === noShowId}>Confirm No-Show</Button>
            </div>
          }
        >
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Marking this reservation as NO_SHOW will release the unit for other guests and document the operational reason in the audit trail.
            </p>
            <input
              type="text"
              className="form-control"
              placeholder="Reason for no-show..."
              value={noShowReason}
              onChange={(e) => setNoShowReason(e.target.value)}
              style={{ width: '100%', marginTop: '0.5rem' }}
            />
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {selectedReservation && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          size="md"
          icon="📋"
          title={`Booking: ${selectedReservation.reservation_code}`}
          subtitle="Front-office reservation verification and guest particulars"
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsDetailOpen(false);
                  navigate(`/app/reservations?search=${encodeURIComponent(selectedReservation.reservation_code)}`);
                }}
              >
                Open in Booking Engine ↗
              </Button>
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-card-hover)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</div>
                <Badge status={selectedReservation.status}>{selectedReservation.status}</Badge>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Booking Code</div>
                <strong style={{ fontFamily: 'monospace', color: 'var(--brand-accent)' }}>
                  🔒 {selectedReservation.auth_code}
                </strong>
              </div>
            </div>
            <div><strong>Guest:</strong> {selectedReservation.tenant_name} ({selectedReservation.tenant_phone})</div>
            <div><strong>Property & Unit:</strong> {selectedReservation.property_name} — Unit {selectedReservation.unit_number}</div>
            <div><strong>Stay:</strong> {selectedReservation.check_in_date} → {selectedReservation.check_out_date}</div>
            <div><strong>Total Rate:</strong> {formatNaira(selectedReservation.total_amount)}</div>
            <div><strong>Paid to Date:</strong> {formatNaira(selectedReservation.paid_amount)}</div>
            <div><strong>Outstanding:</strong> {formatNaira(selectedReservation.outstanding_balance)}</div>
            {selectedReservation.assigned_staff_name && (
              <div><strong>Assigned Front Desk Staff:</strong> {selectedReservation.assigned_staff_name}</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
