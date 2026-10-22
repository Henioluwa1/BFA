import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { maintenanceService, apartmentService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function StaffDashboard() {
  const navigate = useNavigate();
  const { activeProperty, isAllProperties } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [stats, setStats] = useState({
    total_requests: 0,
    open_count: 0,
    in_progress_count: 0,
    critical_open_count: 0,
    resolved_count: 0,
  });
  const [workOrders, setWorkOrders] = useState([]);
  const [turnoverUnits, setTurnoverUnits] = useState([]);

  const propertyId = isAllProperties ? undefined : activeProperty?.id;

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, ordersRes, unitsRes] = await Promise.all([
        maintenanceService.getStats({ propertyId }).catch(() => ({ data: {} })),
        maintenanceService.getAll({ propertyId }).catch(() => ({ data: [] })),
        apartmentService.getAll({ propertyId }).catch(() => ({ data: [] })),
      ]);

      if (statsRes.data) {
        const overview = statsRes.data.overview || statsRes.data;
        setStats({
          total_requests: overview.total ?? overview.total_requests ?? 0,
          open_count: overview.open ?? overview.open_count ?? 0,
          in_progress_count: overview.inProgress ?? overview.in_progress_count ?? 0,
          critical_open_count: overview.criticalOpen ?? overview.critical_open_count ?? 0,
          resolved_count: overview.resolved ?? overview.resolved_count ?? 0,
        });
      }

      const allOrders = ordersRes.data || [];
      const activeOrders = allOrders.filter(
        (o) => o.status === 'OPEN' || o.status === 'IN_PROGRESS'
      );
      setWorkOrders(activeOrders);

      const allUnits = unitsRes.data || [];
      const dirtyOrCleaning = allUnits.filter(
        (u) => u.status === 'DIRTY' || u.status === 'CLEANING' || u.status === 'MAINTENANCE'
      );
      setTurnoverUnits(dirtyOrCleaning);
    } catch (err) {
      addToast(`Error loading staff maintenance metrics: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [propertyId]);

  const handleStartWork = async (orderId) => {
    setActionLoadingId(orderId);
    try {
      await maintenanceService.start(orderId);
      addToast('Work order started. Status updated to IN_PROGRESS.', 'success');
      loadData();
    } catch (err) {
      addToast(`Failed to start ticket: ${err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTurnoverTransition = async (unit, targetStatus) => {
    setActionLoadingId(unit.id);
    try {
      await apartmentService.updateStatus(unit.id, { status: targetStatus });
      const msg = targetStatus === 'CLEANING'
        ? `Housekeeping started for Unit ${unit.unit_number}! Status updated to CLEANING.`
        : `Turnover complete for Unit ${unit.unit_number}! Apartment status updated to AVAILABLE.`;
      addToast(msg, 'success');
      loadData();
    } catch (err) {
      addToast(`Failed to update room status: ${err.message}`, 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const dirtyCount = turnoverUnits.filter((u) => u.status === 'DIRTY').length;
  const cleaningCount = turnoverUnits.filter((u) => u.status === 'CLEANING').length;
  const maintenanceCount = turnoverUnits.filter((u) => u.status === 'MAINTENANCE').length;

  return (
    <div>
      {/* 1. Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 className="page-title">Operations & Facilities Console</h1>
            <Badge status="pending">STAFF / MAINTENANCE</Badge>
          </div>
          <p className="page-subtitle">
            Facilities upkeep, repair tickets, housekeeping room turnover, and inspection tasks
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={loadData} loading={loading}>
            ↻ Refresh Worklist
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/app/maintenance?openNew=true')}
          >
            + Log Maintenance Issue
          </Button>
        </div>
      </div>

      {/* 2. Property Scope Info */}
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
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              color: '#2563eb',
            }}
          >
            🔧
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--brand-accent)', fontWeight: 700 }}>
              Facilities Active Scope
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {isAllProperties ? 'All Assigned Property Buildings' : activeProperty?.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {isAllProperties ? 'Multi-building maintenance stream' : `Property Code: ${activeProperty?.code}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" size="sm" onClick={() => navigate('/app/inspection?openNew=true')}>
            📋 Start Inspection
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/app/maintenance')}>
            All Work Orders →
          </Button>
        </div>
      </div>

      {/* 3. Maintenance KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        {/* Critical Issues */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: stats.critical_open_count > 0 ? '1px solid #ef4444' : '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/app/maintenance?priority=CRITICAL')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Critical Issues
            </span>
            <span style={{ fontSize: '1.25rem' }}>🚨</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: stats.critical_open_count > 0 ? '#ef4444' : '#10b981', marginBottom: '0.25rem' }}>
            {loading ? '—' : stats.critical_open_count}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Requires immediate response ↗
          </div>
        </div>

        {/* In-Progress Repairs */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/app/maintenance?status=IN_PROGRESS')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Active Repairs
            </span>
            <span style={{ fontSize: '1.25rem' }}>⚙️</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#f59e0b', marginBottom: '0.25rem' }}>
            {loading ? '—' : stats.in_progress_count}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Work currently in progress
          </div>
        </div>

        {/* Open Work Orders */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/app/maintenance?status=OPEN')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Open Tickets
            </span>
            <span style={{ fontSize: '1.25rem' }}>📋</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--brand-accent)', marginBottom: '0.25rem' }}>
            {loading ? '—' : stats.open_count}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Awaiting triage or assignment
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
              Turnover Queue
            </span>
            <span style={{ fontSize: '1.25rem' }}>🧹</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: (dirtyCount + cleaningCount) > 0 ? '#ef4444' : '#10b981', marginBottom: '0.25rem' }}>
            {loading ? '—' : dirtyCount + cleaningCount}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {dirtyCount} Dirty • {cleaningCount} Cleaning
          </div>
        </div>

        {/* Units in Maintenance */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/app/apartments?status=MAINTENANCE')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Blocked in Repair
            </span>
            <span style={{ fontSize: '1.25rem' }}>🚫</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: maintenanceCount > 0 ? '#8b5cf6' : '#10b981', marginBottom: '0.25rem' }}>
            {loading ? '—' : maintenanceCount}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Unavailable for guest bookings
          </div>
        </div>
      </div>

      {/* 4. Active Work Orders Queue */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <Card
          title={`Active Work Orders Queue (${workOrders.length})`}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate('/app/maintenance')}>
              View All Tickets →
            </Button>
          }
        >
          {loading ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading tickets...</div>
          ) : workOrders.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              🎉 Zero active work orders! All facilities operating smoothly.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticket / Unit</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.slice(0, 6).map((wo) => (
                    <tr key={wo.id}>
                      <td>
                        <div
                          style={{ fontWeight: 700, color: 'var(--brand-accent)', cursor: 'pointer' }}
                          onClick={() => navigate(`/app/maintenance?search=${encodeURIComponent(wo.issue_code || '')}`)}
                        >
                          {wo.issue_code} ↗
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Unit {wo.unit_number || wo.apartment_id} • {wo.issue_title}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{wo.category}</span>
                      </td>
                      <td>
                        <Badge status={wo.priority === 'CRITICAL' ? 'danger' : wo.priority === 'HIGH' ? 'pending' : 'available'}>
                          {wo.priority}
                        </Badge>
                      </td>
                      <td>
                        <Badge status={wo.status === 'IN_PROGRESS' ? 'pending' : 'available'}>
                          {wo.status}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {wo.status === 'OPEN' ? (
                          <Button
                            variant="primary"
                            size="small"
                            loading={actionLoadingId === wo.id}
                            onClick={() => handleStartWork(wo.id)}
                          >
                            Start Work
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => navigate(`/app/maintenance?search=${encodeURIComponent(wo.issue_code || '')}`)}
                          >
                            Resolve ↗
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Housekeeping Turnover Board */}
        <Card
          title={`Housekeeping Turnover Board (${turnoverUnits.length})`}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate('/app/apartments')}>
              All Units →
            </Button>
          }
        >
          {loading ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading rooms...</div>
          ) : turnoverUnits.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              ✨ All apartments cleaned and ready for guest arrivals!
            </div>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Apartment</th>
                    <th>Building</th>
                    <th>Current Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {turnoverUnits.slice(0, 6).map((unit) => (
                    <tr key={unit.id}>
                      <td>
                        <div
                          style={{ fontWeight: 700, color: 'var(--brand-accent)', cursor: 'pointer' }}
                          onClick={() => navigate(`/app/apartments?unitId=${unit.id}`)}
                        >
                          Unit {unit.unit_number} ↗
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{unit.unit_type}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{unit.property_name || activeProperty?.name}</td>
                      <td>
                        <Badge status={unit.status === 'MAINTENANCE' ? 'danger' : unit.status === 'DIRTY' ? 'danger' : 'pending'}>
                          {unit.status}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {unit.status === 'DIRTY' && (
                          <Button
                            variant="primary"
                            size="small"
                            loading={actionLoadingId === unit.id}
                            onClick={() => handleTurnoverTransition(unit, 'CLEANING')}
                          >
                            Start Cleaning
                          </Button>
                        )}
                        {unit.status === 'CLEANING' && (
                          <Button
                            variant="secondary"
                            size="small"
                            loading={actionLoadingId === unit.id}
                            onClick={() => handleTurnoverTransition(unit, 'AVAILABLE')}
                          >
                            Mark Available
                          </Button>
                        )}
                        {unit.status === 'MAINTENANCE' && (
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => navigate(`/app/maintenance?propertyId=${unit.property_id || ''}`)}
                          >
                            In Repairs ↗
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
