import React, { useState, useEffect, useCallback } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { receptionistMonitorService, propertyService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  LogIn,
  LogOut,
  Calendar,
  Activity,
  Shield,
  RefreshCw,
  Eye,
  Building,
} from 'lucide-react';

export default function ReceptionistLiveMonitorPage() {
  const { user } = useAuth();
  const { properties, activePropertyId } = useProperty();
  const { addToast } = useToast();

  const isManager = ['MANAGER', 'OPERATIONS_MANAGER'].includes(user?.role);
  const isAdminOrOwner = ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(user?.role);

  // Today in Lagos timezone YYYY-MM-DD
  const getTodayLagos = () => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  };

  const [selectedDate, setSelectedDate] = useState(getTodayLagos());
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    summary: {
      totalAlerts: 0,
      totalClaims: 0,
      avgResponseTimeSeconds: 0,
      activeOnDuty: 0,
      totalCheckIns: 0,
      totalCheckOuts: 0,
    },
    receptionists: [],
  });

  // Selected receptionist for activity log modal
  const [selectedReceptionist, setSelectedReceptionist] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);

  const isHistorical = selectedDate !== getTodayLagos();

  const loadMonitorData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (propertyFilter && propertyFilter !== 'all') {
        params.propertyId = propertyFilter;
      }

      let res;
      if (isHistorical) {
        res = await receptionistMonitorService.getHistoricalDashboard({
          date: selectedDate,
          ...params,
        });
      } else {
        res = await receptionistMonitorService.getLiveDashboard(params);
      }

      if (res?.success) {
        setData(res.data || { summary: {}, receptionists: [] });
      }
    } catch (err) {
      addToast(err.message || 'Failed to load receptionist monitor data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, propertyFilter, isHistorical, addToast]);

  useEffect(() => {
    loadMonitorData();
  }, [loadMonitorData]);

  // Live auto-refresh polling every 20 seconds when viewing today's live feed
  useEffect(() => {
    if (isHistorical) return;
    const timer = setInterval(() => {
      loadMonitorData();
    }, 20000);
    return () => clearInterval(timer);
  }, [isHistorical, loadMonitorData]);

  const openActivityLogs = async (receptionist) => {
    setSelectedReceptionist(receptionist);
    setIsLogsModalOpen(true);
    setLogsLoading(true);
    try {
      const res = await receptionistMonitorService.getReceptionistLogs(receptionist.id, {
        date: selectedDate,
      });
      if (res?.success) {
        setActivityLogs(res.data?.logs || []);
      }
    } catch (err) {
      addToast(err.message || 'Failed to load activity logs.', 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec) || sec <= 0) return '0s';
    const s = Math.round(sec);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  };

  const getResponseTimeBadgeStyle = (sec) => {
    if (!sec || sec === 0) return { background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' };
    if (sec <= 60) return { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid #10b981' };
    if (sec <= 180) return { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid #f59e0b' };
    return { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid #ef4444' };
  };

  const getAvailabilityBadge = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return <Badge variant="success">AVAILABLE</Badge>;
      case 'BUSY':
        return <Badge variant="warning">BUSY</Badge>;
      case 'AWAY':
        return <Badge variant="danger">AWAY</Badge>;
      default:
        return <Badge variant="secondary">OFFLINE</Badge>;
    }
  };

  const activeKpis = data.kpis || data.summary || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Live Receptionist Performance Monitor
            </h1>
            {!isHistorical && (
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10b981',
                  color: '#10b981',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                  }}
                />
                LIVE REAL-TIME
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Authoritative front-desk claim speed, shift tracking, and daily operational audit ({selectedDate})
          </p>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Property Selector for Admin */}
          {isAdminOrOwner && (
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All BFA Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Date Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            />
          </div>

          <Button variant="outline" size="sm" onClick={loadMonitorData} loading={loading}>
            <RefreshCw size={14} style={{ marginRight: '4px' }} /> Refresh
          </Button>
        </div>
      </div>

      {/* Historical Mode Notice */}
      {isHistorical && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid #3b82f6',
            color: '#60a5fa',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock size={16} />
          Viewing historical performance records for <strong>{selectedDate}</strong>. Metrics reset daily at midnight Africa/Lagos and are permanently archived for executive auditing.
        </div>
      )}

      {/* Overview KPIs Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <Card style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ALERTS RECEIVED</span>
            <Activity size={16} style={{ color: '#38bdf8' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
            {activeKpis.totalBookingsReceivedToday ?? activeKpis.totalAlerts ?? 0}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Incoming bookings today</span>
        </Card>

        <Card style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>BOOKINGS CLAIMED</span>
            <CheckCircle size={16} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.25rem', color: '#10b981' }}>
            {activeKpis.totalBookingsClaimedToday ?? activeKpis.totalClaims ?? 0}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Accepted by receptionists</span>
        </Card>

        <Card style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>AVG CLAIM SPEED</span>
            <Clock size={16} style={{ color: '#d4af37' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.25rem', color: '#d4af37' }}>
            {formatSeconds(activeKpis.averageClaimResponseSeconds ?? activeKpis.avgResponseTimeSeconds)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Time from alert to claim</span>
        </Card>

        <Card style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ON-DUTY RECEPTIONISTS</span>
            <Users size={16} style={{ color: '#a855f7' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
            {activeKpis.receptionistsOnShift ?? activeKpis.activeOnDuty ?? 0}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active shift logged in</span>
        </Card>

        <Card style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CHECK-INS TODAY</span>
            <LogIn size={16} style={{ color: '#38bdf8' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
            {activeKpis.todayCheckIns ?? activeKpis.totalCheckIns ?? 0}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Front desk check-ins</span>
        </Card>

        <Card style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CHECK-OUTS TODAY</span>
            <LogOut size={16} style={{ color: '#f59e0b' }} />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
            {activeKpis.todayCheckOuts ?? activeKpis.totalCheckOuts ?? 0}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Completed check-outs</span>
        </Card>
      </div>

      {/* Receptionists Roster & Performance Table */}
      <Card>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Front Desk Receptionist Activity & Responsiveness
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing {data.receptionists?.length || 0} front desk member(s)
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading live receptionist roster and metrics...
          </div>
        ) : !data.receptionists || data.receptionists.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No receptionist shift records found for this date.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Receptionist</th>
                  <th style={{ padding: '12px 16px' }}>Property Scope</th>
                  <th style={{ padding: '12px 16px' }}>Shift Status</th>
                  <th style={{ padding: '12px 16px' }}>Availability</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Claims</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Avg Speed</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Check-Ins</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Check-Outs</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.receptionists.map((r) => {
                  const isOnDuty = r.shift_status === 'ON_DUTY';
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Name & Email */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {r.name || r.full_name || `Staff #${r.id}`}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {r.email || 'receptionist@bfa.ng'}
                        </div>
                      </td>

                      {/* Property Scope */}
                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Building size={14} style={{ color: 'var(--text-muted)' }} />
                          {r.property_name || 'All Properties'}
                        </div>
                      </td>

                      {/* Shift Status */}
                      <td style={{ padding: '14px 16px' }}>
                        {isOnDuty ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                border: '1px solid #10b981',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                width: 'fit-content',
                              }}
                            >
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                              ON DUTY
                            </span>
                            {r.shift_started_at && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                Since {new Date(r.shift_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            OFF DUTY
                          </span>
                        )}
                      </td>

                      {/* Availability */}
                      <td style={{ padding: '14px 16px' }}>
                        {getAvailabilityBadge(r.availability_status || (isOnDuty ? 'AVAILABLE' : 'OFFLINE'))}
                      </td>

                      {/* Claims count */}
                      <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {r.total_claims || 0}
                      </td>

                      {/* Avg Response Time */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            ...getResponseTimeBadgeStyle(r.avg_response_time_seconds),
                          }}
                        >
                          {formatSeconds(r.avg_response_time_seconds)}
                        </span>
                      </td>

                      {/* Check-ins */}
                      <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {r.total_check_ins || 0}
                      </td>

                      {/* Check-outs */}
                      <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {r.total_check_outs || 0}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openActivityLogs(r)}
                        >
                          <Eye size={13} style={{ marginRight: '4px' }} /> Logs
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Activity Log Modal */}
      {isLogsModalOpen && (
        <Modal
          isOpen={isLogsModalOpen}
          onClose={() => setIsLogsModalOpen(false)}
          title={`Activity Audit Trail: ${selectedReceptionist?.name || 'Receptionist'} (${selectedDate})`}
          size="lg"
        >
          {logsLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading chronological activity events...
            </div>
          ) : !activityLogs || activityLogs.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No operational events recorded for this staff on {selectedDate}.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
              {activityLogs.map((log, idx) => (
                <div
                  key={log.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    fontSize: '0.85rem',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(212, 175, 55, 0.15)',
                      color: '#d4af37',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Activity size={14} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {log.activity_type}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px', fontSize: '0.82rem' }}>
                      {log.description}
                    </div>
                    {log.response_time_seconds && (
                      <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '2px' }}>
                        Response Time: {log.response_time_seconds} seconds
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
