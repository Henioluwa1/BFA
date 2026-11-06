import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { frontOfficeService, maintenanceService, employeeService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// ─── ADMIN color tokens ───────────────────────────────────────────────────────
const ADMIN_BLUE      = '#1e3a8a';
const ADMIN_BLUE_MID  = '#2563eb';
const ADMIN_BLUE_LIGHT = '#dbeafe';
const ADMIN_BLUE_PALE  = '#eff6ff';

// ─── Small helper: clickable quick-action tile ────────────────────────────────
function QuickActionTile({ icon, label, description, path, accentColor = ADMIN_BLUE, navigate }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(path)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(path)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '1rem 1.1rem',
        background: hovered ? ADMIN_BLUE_PALE : 'var(--bg-card)',
        border: `1.5px solid ${hovered ? accentColor : 'var(--border)'}`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: '0.5rem',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        outline: 'none',
      }}
    >
      <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: hovered ? ADMIN_BLUE : 'var(--text-main)', marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{description}</div>
    </div>
  );
}

// ─── KPI stat card ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color = ADMIN_BLUE, loading, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      style={{
        padding: '1.25rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${color}`,
        borderRadius: '0.5rem',
        cursor: onClick ? 'pointer' : 'default',
        flex: 1,
        minWidth: 0,
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1.1, marginBottom: '0.3rem' }}>
        {loading ? <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>—</span> : value}
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { activeProperty, isAllProperties } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading]         = useState(true);
  const [empLoading, setEmpLoading]   = useState(true);

  const [stats, setStats] = useState({
    todaysArrivals:   0,
    todaysDepartures: 0,
    inHouseGuests:    0,
    totalUnits:       0,
    availableUnits:   0,
    occupiedUnits:    0,
    activeReservations: 0,
  });

  const [maintenance, setMaintenance] = useState({
    openCount:     0,
    inProgressCount: 0,
    criticalCount: 0,
  });

  const [employees, setEmployees] = useState([]);

  const propertyId = isAllProperties ? undefined : activeProperty?.id;

  // ── Data loader ─────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, maintRes] = await Promise.all([
        frontOfficeService.getStats({ propertyId }).catch(() => ({ data: {} })),
        maintenanceService.getStats({ propertyId }).catch(() => ({ data: {} })),
      ]);

      const s = statsRes.data || {};
      setStats({
        todaysArrivals:     s.todaysArrivals    || 0,
        todaysDepartures:   s.todaysDepartures  || 0,
        inHouseGuests:      s.inHouseGuests     || 0,
        totalUnits:         s.totalUnits        || 0,
        availableUnits:     s.availableUnits    || 0,
        occupiedUnits:      s.occupiedUnits     || 0,
        activeReservations: s.inHouseGuests     || 0,
      });

      const m = maintRes.data?.overview || maintRes.data || {};
      setMaintenance({
        openCount:       m.open             ?? m.open_count          ?? 0,
        inProgressCount: m.inProgress       ?? m.in_progress_count   ?? 0,
        criticalCount:   m.criticalOpen     ?? m.critical_open_count ?? m.critical_count ?? 0,
      });
    } catch (err) {
      console.error('AdminDashboard: failed to load operational data', err);
      addToast('Could not load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Employee roster (top 5 for preview) ─────────────────────────────────────
  const loadEmployees = async () => {
    setEmpLoading(true);
    try {
      const res = await employeeService.getAll({ limit: 5, page: 1 }).catch(() => null);
      const list = res?.data ?? res ?? [];
      setEmployees(Array.isArray(list) ? list.slice(0, 5) : []);
    } catch {
      setEmployees([]);
    } finally {
      setEmpLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadEmployees();
  }, [propertyId]);

  const occupancyRate = stats.totalUnits > 0
    ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
    : 0;

  // ── Quick-action definitions ──────────────────────────────────────────────
  const quickActions = [
    { icon: '👥', label: 'Manage Employees',        description: 'View, add and update staff accounts',      path: '/app/employees'    },
    { icon: '🏢', label: 'Manage Properties',       description: 'Add and configure company properties',     path: '/app/properties'   },
    { icon: '📋', label: 'All Reservations',        description: 'Search and manage every reservation',      path: '/app/reservations' },
    { icon: '💰', label: 'Financial Administration',description: 'Journals, payments, refunds & ledger',     path: '/app/financial'    },
    { icon: '🛠️', label: 'Work Orders',             description: 'Dispatch and monitor maintenance tasks',   path: '/app/maintenance'  },
    { icon: '🗓️', label: 'Workforce & Attendance', description: 'Operations roster, check-ins, leave & timesheets', path: '/app/workforce' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Header Banner ──────────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              BFA Operations Command Center
            </h1>
            {/* ADMIN badge */}
            <span
              style={{
                padding: '0.2rem 0.7rem',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                background: ADMIN_BLUE,
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              🛡️ Administrator
            </span>
            <Badge status="info">
              {isAllProperties ? '🌐 All Properties' : `📍 ${activeProperty?.name || 'Selected Property'}`}
            </Badge>
          </div>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Company-wide operational command — staff, properties, reservations and financial administration.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="outline" size="sm" onClick={() => { loadData(); loadEmployees(); }} loading={loading}>
            ↻ Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/app/reservations?openNew=true')}
            style={{ background: ADMIN_BLUE, borderColor: ADMIN_BLUE }}
          >
            + New Reservation
          </Button>
        </div>
      </div>

      {/* ── KPI Row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <KpiCard
          label="Total Staff"
          value={empLoading ? '—' : employees.length > 0 ? '5+' : '0'}
          sub="View all employees →"
          icon="👤"
          color={ADMIN_BLUE}
          loading={false}
          onClick={() => navigate('/app/employees')}
        />
        <KpiCard
          label="Total Properties"
          value="—"
          sub="View property list →"
          icon="🏢"
          color={ADMIN_BLUE_MID}
          loading={false}
          onClick={() => navigate('/app/properties')}
        />
        <KpiCard
          label="Active Reservations"
          value={stats.activeReservations}
          sub={`${occupancyRate}% occupancy today`}
          icon="📋"
          color="#059669"
          loading={loading}
          onClick={() => navigate('/app/reservations')}
        />
        <KpiCard
          label="Pending Financial Actions"
          value="—"
          sub="Visit Financial page"
          icon="💰"
          color="#d97706"
          loading={false}
          onClick={() => navigate('/app/financial')}
        />
      </div>

      {/* ── Main 2-Column Content ───────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* LEFT: Staff Roster Management ──────────────────────────────────── */}
        <Card>
          <div style={{ padding: '1.25rem 1.25rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div>
                <div
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: ADMIN_BLUE,
                    marginBottom: '0.15rem',
                  }}
                >
                  Staff Roster Management
                </div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Property Roster Assignments
                </h3>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/app/roster')}
                style={{ background: ADMIN_BLUE, borderColor: ADMIN_BLUE, whiteSpace: 'nowrap' }}
              >
                Manage Roster →
              </Button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
              Assign staff to property maintenance duties and track active assignments.
            </p>
          </div>

          {/* Roster preview table */}
          <div style={{ padding: '0 1.25rem 1.25rem' }}>
            {empLoading ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Loading roster data…
              </div>
            ) : employees.length === 0 ? (
              <div
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: ADMIN_BLUE_PALE,
                  borderRadius: '0.5rem',
                  border: `1px dashed ${ADMIN_BLUE_LIGHT}`,
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>🗓️</div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: ADMIN_BLUE, marginBottom: '0.25rem' }}>
                  No roster assignments yet
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Use the Roster Manager to assign staff to properties.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/app/roster')}
                >
                  Open Roster Manager
                </Button>
              </div>
            ) : (
              <Table
                columns={[
                  {
                    header: 'Staff Name',
                    key: 'full_name',
                    render: (val, row) => (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          {val || `${row?.first_name || ''} ${row?.last_name || ''}`.trim() || 'Unknown'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {row?.employee_id || row?.staff_id || '—'}
                        </div>
                      </div>
                    ),
                  },
                  {
                    header: 'Assigned Property',
                    key: 'property_name',
                    render: (val, row) => (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                        {val || row?.property?.name || (
                          <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                        )}
                      </span>
                    ),
                  },
                  {
                    header: 'Role',
                    key: 'job_title',
                    render: (val, row) => (
                      <Badge status="info">
                        {val || row?.department || row?.role || 'Staff'}
                      </Badge>
                    ),
                  },
                ]}
                data={employees}
              />
            )}

            {/* View all link */}
            {employees.length > 0 && (
              <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
                <button
                  onClick={() => navigate('/app/employees')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: ADMIN_BLUE_MID,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  View all employees →
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* RIGHT column ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Today's Operations Summary */}
          <Card title="Today's Operations Summary">
            <div style={{ padding: '0.5rem 1rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {/* Arrivals */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '0.5rem',
                  background: ADMIN_BLUE_PALE,
                  border: `1px solid ${ADMIN_BLUE_LIGHT}`,
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: ADMIN_BLUE, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Today's Arrivals
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: ADMIN_BLUE }}>
                  {loading ? '—' : stats.todaysArrivals}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expected check-ins</div>
              </div>

              {/* Departures */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '0.5rem',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Today's Departures
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#b45309' }}>
                  {loading ? '—' : stats.todaysDepartures}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expected check-outs</div>
              </div>

              {/* In-house */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '0.5rem',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  In-House Guests
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#15803d' }}>
                  {loading ? '—' : stats.inHouseGuests}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Occupancy: {occupancyRate}%</div>
              </div>

              {/* Available */}
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '0.5rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Available Units
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#334155' }}>
                  {loading ? '—' : stats.availableUnits}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>of {stats.totalUnits} total</div>
              </div>
            </div>

            <div style={{ padding: '0 1rem 1rem', textAlign: 'right' }}>
              <Button variant="ghost" size="sm" onClick={() => navigate('/app/front-office')}>
                Open Front Office Hub →
              </Button>
            </div>
          </Card>

          {/* Open Maintenance */}
          <Card title="Open Maintenance">
            <div style={{ padding: '0.5rem 1rem 1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ textAlign: 'center', padding: '0.75rem', background: '#fef2f2', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626' }}>
                    {loading ? '—' : maintenance.openCount}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: 600 }}>Open</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.75rem', background: '#fffbeb', borderRadius: '0.5rem', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309' }}>
                    {loading ? '—' : maintenance.inProgressCount}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: 600 }}>In Progress</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.75rem', background: '#fff1f2', borderRadius: '0.5rem', border: '1px solid #ffe4e6' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#be123c' }}>
                    {loading ? '—' : maintenance.criticalCount}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#9f1239', fontWeight: 600 }}>Critical</div>
                </div>
              </div>

              {maintenance.criticalCount > 0 && (
                <div
                  style={{
                    padding: '0.6rem 0.85rem',
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    borderRadius: '0.375rem',
                    fontSize: '0.8rem',
                    color: '#be123c',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                  }}
                >
                  ⚠️ {maintenance.criticalCount} critical work order{maintenance.criticalCount !== 1 ? 's' : ''} require immediate attention
                </div>
              )}

              <Button variant="outline" size="sm" onClick={() => navigate('/app/maintenance')}>
                🛠️ View All Work Orders
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Quick Actions Grid ──────────────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
          }}
        >
          Quick Actions
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.85rem',
          }}
        >
          {quickActions.map((action) => (
            <QuickActionTile
              key={action.path}
              icon={action.icon}
              label={action.label}
              description={action.description}
              path={action.path}
              accentColor={ADMIN_BLUE}
              navigate={navigate}
            />
          ))}
        </div>
      </div>

    </div>
  );
}
