import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { frontOfficeService, maintenanceService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

// ---------------------------------------------------------------------------
// Colour palette — Emerald green theme
// ---------------------------------------------------------------------------
const EMERALD = {
  dark:    '#15803d',   // card accents, badge background
  base:    '#16a34a',   // primary action colour
  light:   '#f0fdf4',   // subtle background tint
  border:  '#bbf7d0',   // tinted border
  label:   '#166534',   // dark label text on light bg
};

// ---------------------------------------------------------------------------
// NoPropertyGuard — full-screen error shown when manager has no property
// ---------------------------------------------------------------------------
function NoPropertyGuard() {
  const [copied, setCopied] = useState(false);

  const handleContact = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          background: 'var(--bg-card)',
          border: '1.5px solid #fecaca',
          borderLeft: '5px solid #dc2626',
          borderRadius: '0.75rem',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(220,38,38,0.08)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
        <h2
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#b91c1c',
            marginBottom: '0.5rem',
          }}
        >
          No Property Assigned
        </h2>
        <p
          style={{
            fontSize: '0.9375rem',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}
        >
          Your account has not been assigned to a property. Please contact your
          administrator to assign you to a property before accessing operations manager
          functions.
        </p>

        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            padding: '0.85rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
            color: '#991b1b',
            textAlign: 'left',
          }}
        >
          <strong>What to do next:</strong>
          <ul style={{ marginTop: '0.4rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            <li>Reach out to a system Administrator</li>
            <li>Ask them to open <em>Users → Edit your profile → Assign Property</em></li>
            <li>Log out and back in once assigned</li>
          </ul>
        </div>

        <button
          onClick={handleContact}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: '#dc2626',
            color: '#ffffff',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.6rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          {copied ? '✔ Info Noted' : '📬 Contact Admin'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickActionCard — individual clickable action tile
// ---------------------------------------------------------------------------
function QuickActionCard({ icon, label, description, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '1rem 1.1rem',
        background: hovered ? EMERALD.light : 'var(--bg-card)',
        border: `1px solid ${hovered ? EMERALD.dark : 'var(--border)'}`,
        borderLeft: `4px solid ${EMERALD.dark}`,
        borderRadius: '0.5rem',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-main)' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
        {description}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KpiCard — single metric tile
// ---------------------------------------------------------------------------
function KpiCard({ label, value, sub, icon, valueColor, loading }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${EMERALD.dark}`,
        borderRadius: '0.5rem',
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '0.5rem',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      </div>
      <div
        style={{
          fontSize: '1.875rem',
          fontWeight: 800,
          color: valueColor || EMERALD.dark,
          marginBottom: '0.25rem',
          lineHeight: 1,
        }}
      >
        {loading ? <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>Loading…</span> : value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{sub}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnitStatusSummary — right-panel unit breakdown
// ---------------------------------------------------------------------------
function UnitStatusSummary({ stats, loading }) {
  const rows = [
    { label: 'Available & Ready', count: stats.availableUnits,   bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: '✨' },
    { label: 'Occupied',          count: stats.occupiedUnits,    bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', icon: '🛏️' },
    { label: 'Dirty (Turnover)',  count: stats.dirtyUnits,       bg: '#fef2f2', border: '#fecaca', color: '#b91c1c', icon: '🧹' },
    { label: 'Cleaning',          count: stats.cleaningUnits,    bg: '#fffbeb', border: '#fde68a', color: '#b45309', icon: '🧼' },
    { label: 'Under Maintenance', count: stats.maintenanceUnits, bg: '#f8fafc', border: '#e2e8f0', color: '#334155', icon: '🛠️' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.65rem 0.9rem',
            background: r.bg,
            border: `1px solid ${r.border}`,
            borderRadius: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span style={{ fontSize: '1.1rem' }}>{r.icon}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: r.color }}>{r.label}</span>
          </div>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: r.color }}>
            {loading ? '—' : r.count ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OpenMaintenancePanel — right-panel maintenance snapshot
// ---------------------------------------------------------------------------
function OpenMaintenancePanel({ maintenance, loading, onNavigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {/* Critical */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.7rem 0.9rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🚨</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#b91c1c' }}>Critical / Urgent</span>
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b91c1c' }}>
          {loading ? '—' : maintenance.criticalCount}
        </span>
      </div>

      {/* In-Progress */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.7rem 0.9rem',
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <span style={{ fontSize: '1.1rem' }}>⚙️</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#b45309' }}>In Progress</span>
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b45309' }}>
          {loading ? '—' : maintenance.inProgressCount}
        </span>
      </div>

      {/* Open Total */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.7rem 0.9rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🔧</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>All Open Tickets</span>
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#334155' }}>
          {loading ? '—' : maintenance.openCount}
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onNavigate}
        style={{ marginTop: '0.25rem', width: '100%' }}
      >
        View All Maintenance →
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ArrivalsDepTab — tabbed arrivals / departures worklist
// ---------------------------------------------------------------------------
function ArrivalsDepTab({ arrivals, departures, loading, actionLoadingId, onCheckIn, onCheckOut, onNavigate }) {
  const [activeTab, setActiveTab] = useState('arrivals');

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      style={{
        background: activeTab === id ? EMERALD.base : 'transparent',
        color: activeTab === id ? '#ffffff' : 'var(--text-muted)',
        border: 'none',
        padding: '0.35rem 0.9rem',
        borderRadius: '0.375rem',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: '0.875rem',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );

  const emptyState = (message) => (
    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗓️</div>
      {message}
    </div>
  );

  const arrivalColumns = [
    {
      header: 'Booking Code',
      key: 'booking_code',
      render: (val, row) => {
        const code = val || row?.booking_code;
        return (
          <span
            style={{ fontWeight: 600, color: EMERALD.base, cursor: 'pointer' }}
            onClick={() => onNavigate(`/app/reservations?search=${encodeURIComponent(code || '')}`)}
          >
            {code}
          </span>
        );
      },
    },
    {
      header: 'Guest',
      key: 'guest_name',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{val || row?.guest_name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {row?.guest_phone || row?.guest_email}
          </div>
        </div>
      ),
    },
    {
      header: 'Unit',
      key: 'unit_number',
      render: (val, row) => {
        const unit = val || row?.unit_number;
        return <Badge status="info">{unit ? `Unit ${unit}` : 'Unassigned'}</Badge>;
      },
    },
    {
      header: 'Payment',
      key: 'payment_status',
      render: (val, row) => {
        const isPaid =
          val === 'PAID' ||
          parseFloat(row?.paid_amount || 0) >= parseFloat(row?.total_amount || 1);
        return <Badge status={isPaid ? 'available' : 'maintenance'}>{isPaid ? 'PAID' : 'PENDING'}</Badge>;
      },
    },
    {
      header: 'Actions',
      key: 'id',
      render: (val, row) => {
        const resId = val || row?.id;
        return (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <Button
              variant="primary"
              size="xs"
              loading={actionLoadingId === resId}
              onClick={() => onCheckIn(resId)}
            >
              Check In
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => onNavigate(`/app/reservations?search=${encodeURIComponent(row?.booking_code || '')}`)}
            >
              View
            </Button>
          </div>
        );
      },
    },
  ];

  const departureColumns = [
    {
      header: 'Booking Code',
      key: 'booking_code',
      render: (val, row) => {
        const code = val || row?.booking_code;
        return (
          <span
            style={{ fontWeight: 600, color: EMERALD.base, cursor: 'pointer' }}
            onClick={() => onNavigate(`/app/reservations?search=${encodeURIComponent(code || '')}`)}
          >
            {code}
          </span>
        );
      },
    },
    {
      header: 'Guest',
      key: 'guest_name',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{val || row?.guest_name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {row?.guest_phone || row?.guest_email}
          </div>
        </div>
      ),
    },
    {
      header: 'Unit',
      key: 'unit_number',
      render: (val, row) => (
        <Badge status="info">Unit {val || row?.unit_number || 'N/A'}</Badge>
      ),
    },
    {
      header: 'Balance',
      key: 'balance',
      render: (_val, row) => {
        const balance = Math.max(
          0,
          parseFloat(row?.total_amount || 0) - parseFloat(row?.paid_amount || 0),
        );
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
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <Button
              variant="secondary"
              size="xs"
              loading={actionLoadingId === resId}
              onClick={() => onCheckOut(resId)}
            >
              Check Out
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={() => onNavigate(`/app/reservations?search=${encodeURIComponent(row?.booking_code || '')}`)}
            >
              View
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <Card
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            width: '100%',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {tabBtn('arrivals', `Today's Arrivals (${arrivals.length})`)}
            {tabBtn('departures', `Today's Departures (${departures.length})`)}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('/app/reservations')}>
            All Reservations →
          </Button>
        </div>
      }
    >
      <div style={{ padding: '0.5rem 1rem 1rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading movement data…
          </div>
        ) : activeTab === 'arrivals' ? (
          arrivals.length === 0 ? (
            emptyState('No pending arrivals for today.')
          ) : (
            <Table columns={arrivalColumns} data={arrivals} />
          )
        ) : departures.length === 0 ? (
          emptyState('No pending departures for today.')
        ) : (
          <Table columns={departureColumns} data={departures} />
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ManagerDashboard — main export
// ---------------------------------------------------------------------------
export default function ManagerDashboard() {
  const navigate  = useNavigate();
  const { activeProperty } = useProperty();
  const { user }           = useAuth();
  const { addToast }       = useToast();

  // Derive the property ID that scopes all API calls.
  // Managers are assigned to a single property via user.property_id.
  const propertyId = user?.property_id || activeProperty?.id;

  // ── Guard: no property assigned ──────────────────────────────────────────
  if (!propertyId) {
    return <NoPropertyGuard />;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading]               = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [stats, setStats] = useState({
    todaysArrivals:   0,
    todaysDepartures: 0,
    totalUnits:       0,
    availableUnits:   0,
    occupiedUnits:    0,
    dirtyUnits:       0,
    cleaningUnits:    0,
    maintenanceUnits: 0,
  });

  const [maintenance, setMaintenance] = useState({
    openCount:       0,
    inProgressCount: 0,
    criticalCount:   0,
  });

  const [arrivals,   setArrivals]   = useState([]);
  const [departures, setDepartures] = useState([]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, arrRes, depRes, maintRes] = await Promise.all([
        frontOfficeService.getStats({ propertyId }).catch(() => ({ data: {} })),
        frontOfficeService.getArrivals({ propertyId }).catch(() => ({ data: [] })),
        frontOfficeService.getDepartures({ propertyId }).catch(() => ({ data: [] })),
        maintenanceService.getStats({ propertyId }).catch(() => ({ data: {} })),
      ]);

      if (statsRes.data) {
        setStats({
          todaysArrivals:   statsRes.data.todaysArrivals   || 0,
          todaysDepartures: statsRes.data.todaysDepartures || 0,
          totalUnits:       statsRes.data.totalUnits       || 0,
          availableUnits:   statsRes.data.availableUnits   || 0,
          occupiedUnits:    statsRes.data.occupiedUnits    || 0,
          dirtyUnits:       statsRes.data.dirtyUnits       || 0,
          cleaningUnits:    statsRes.data.cleaningUnits    || 0,
          maintenanceUnits: statsRes.data.maintenanceUnits || 0,
        });
      }

      setArrivals(arrRes.data || []);
      setDepartures(depRes.data || []);

      const maintData = maintRes.data?.overview || maintRes.data || {};
      setMaintenance({
        openCount:       maintData.open             ?? maintData.open_count           ?? 0,
        inProgressCount: maintData.inProgress       ?? maintData.in_progress_count    ?? 0,
        criticalCount:   maintData.criticalOpen     ?? maintData.critical_open_count  ?? maintData.critical_count ?? 0,
      });
    } catch (err) {
      console.error('[ManagerDashboard] Failed to load data:', err);
      addToast('Unable to load property dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Re-fetch whenever the scoped property changes
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Front-office actions ──────────────────────────────────────────────────
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

  const occupancyRate =
    stats.totalUnits > 0 ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100) : 0;

  const propertyName = activeProperty?.name || user?.property_name || 'Your Property';

  // ── Quick actions definition ──────────────────────────────────────────────
  const quickActions = [
    { icon: '👥', label: 'Workforce & Attendance', description: 'Staff check-ins, leave, shifts & timesheets', path: '/app/workforce' },
    { icon: '🏠', label: 'Property Availability',  description: 'Browse & manage unit statuses',        path: '/app/apartments'    },
    { icon: '📋', label: 'Property Reservations',  description: 'View & process guest bookings',        path: '/app/reservations'  },
    { icon: '🛠️', label: 'Maintenance Orders',      description: 'Dispatch & track work orders',         path: '/app/maintenance'   },
    { icon: '🔍', label: 'Unit Inspections',         description: 'Log and review unit inspections',     path: '/app/inspection'    },
    { icon: '👥', label: 'My Team',                  description: 'View staff assigned to this property', path: '/app/employees'    },
    { icon: '📣', label: 'Announcements',            description: 'Property-level communications',        path: '/app/announcements' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.35rem',
              flexWrap: 'wrap',
            }}
          >
            <h1 className="page-title" style={{ margin: 0 }}>
              {propertyName} Management Center
            </h1>

            {/* MANAGER role badge */}
            <span
              style={{
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: EMERALD.dark,
                color: '#ffffff',
              }}
            >
              🏢 Operations Manager
            </span>

            <Badge status="info">📍 {propertyName}</Badge>
          </div>

          <p className="page-subtitle" style={{ margin: 0 }}>
            Property-scoped view — occupancy, movements, unit readiness and maintenance for your property.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="outline" size="sm" onClick={loadData} loading={loading}>
            ↻ Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            style={{ background: EMERALD.base, borderColor: EMERALD.base }}
            onClick={() => navigate('/app/reservations?openNew=true')}
          >
            + New Reservation
          </Button>
        </div>
      </div>

      {/* ── KPI Row ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
        }}
      >
        <KpiCard
          label="Occupied Units"
          value={`${stats.occupiedUnits} / ${stats.totalUnits}`}
          sub={`${occupancyRate}% occupancy rate`}
          icon="🛏️"
          valueColor={EMERALD.dark}
          loading={loading}
        />
        <KpiCard
          label="Today's Arrivals"
          value={stats.todaysArrivals}
          sub={`${arrivals.length} pending check-in`}
          icon="🧳"
          valueColor="#2563eb"
          loading={loading}
        />
        <KpiCard
          label="Today's Departures"
          value={stats.todaysDepartures}
          sub={`${departures.length} pending check-out`}
          icon="🚪"
          valueColor="#d97706"
          loading={loading}
        />
        <KpiCard
          label="Open Maintenance"
          value={maintenance.openCount}
          sub={
            maintenance.criticalCount > 0
              ? `${maintenance.criticalCount} critical`
              : `${maintenance.inProgressCount} in progress`
          }
          icon="🔧"
          valueColor={maintenance.openCount > 0 ? '#b45309' : EMERALD.dark}
          loading={loading}
        />
      </div>

      {/* ── Main content: Arrivals/Departures (60%) + Right panels (40%) ───── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '1rem',
        }}
      >
        {/* Wider layout on large screens via responsive grid */}
        <style>{`
          @media (min-width: 900px) {
            .mgr-main-grid { grid-template-columns: 3fr 2fr !important; }
          }
        `}</style>

        <div
          className="mgr-main-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '1rem',
          }}
        >
          {/* Left — Arrivals & Departures tabs */}
          <ArrivalsDepTab
            arrivals={arrivals}
            departures={departures}
            loading={loading}
            actionLoadingId={actionLoadingId}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onNavigate={navigate}
          />

          {/* Right — Unit Status + Open Maintenance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Card title="Unit Status Summary">
              <div style={{ padding: '0.75rem 1rem 1rem' }}>
                <UnitStatusSummary stats={stats} loading={loading} />
              </div>
            </Card>

            <Card title="Open Maintenance">
              <div style={{ padding: '0.75rem 1rem 1rem' }}>
                <OpenMaintenancePanel
                  maintenance={maintenance}
                  loading={loading}
                  onNavigate={() => navigate('/app/maintenance')}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────────────── */}
      <div>
        <h3
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
          }}
        >
          Property Quick Actions
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '0.85rem',
          }}
        >
          {quickActions.map((qa) => (
            <QuickActionCard
              key={qa.path}
              icon={qa.icon}
              label={qa.label}
              description={qa.description}
              onClick={() => navigate(qa.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
