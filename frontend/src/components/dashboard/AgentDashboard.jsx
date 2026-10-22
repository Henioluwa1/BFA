import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { agentService, reservationService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function AgentDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [agentData, setAgentData] = useState({
    name: user?.name || 'Agent Partner',
    agency_name: '',
    commission_rate: 10,
    total_reservations: 0,
    active_reservations: 0,
    total_booking_volume: 0,
    total_commission_earned: 0,
    pending_commission: 0,
    paid_commission: 0,
  });
  const [clientReservations, setClientReservations] = useState([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentRes, resRes] = await Promise.all([
        agentService.getAll().catch(() => ({ data: [] })),
        reservationService.getAll().catch(() => ({ data: [] })),
      ]);

      const myAgentRecord = Array.isArray(agentRes.data)
        ? agentRes.data[0] || {}
        : agentRes.data || {};

      setAgentData((prev) => ({
        ...prev,
        ...myAgentRecord,
      }));

      // Agent is automatically scoped on backend, or filter by user.agentId
      const allReservations = Array.isArray(resRes.data) ? resRes.data : [];
      setClientReservations(allReservations);
    } catch (err) {
      addToast(`Error loading agent portal metrics: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div>
      {/* 1. Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 className="page-title">Agent & Partner Portal</h1>
            <Badge status="available">BROKER / AGENT</Badge>
          </div>
          <p className="page-subtitle">
            Track client reservations, booking volumes, earned commissions, and pending payout settlements
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={loadData} loading={loading}>
            ↻ Refresh Metrics
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/app/reservations?openNew=true')}
          >
            + Book for Client
          </Button>
        </div>
      </div>

      {/* 2. Broker Account Profile Banner */}
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
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(147, 51, 234, 0.12)',
              border: '1px solid rgba(147, 51, 234, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              color: '#9333ea',
            }}
          >
            🤝
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--brand-accent)', fontWeight: 700 }}>
              Registered Broker Partner
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {agentData.name || user?.name} {agentData.agency_name ? `• ${agentData.agency_name}` : ''}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Agreed Commission Rate: <strong>{agentData.commission_rate || 10}%</strong> per confirmed booking
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" size="sm" onClick={() => navigate('/app/calendar')}>
            Check Availability Calendar →
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/app/agents')}>
            View Commission Ledger →
          </Button>
        </div>
      </div>

      {/* 3. Agent Performance KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        {/* Total Bookings */}
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
              My Client Bookings
            </span>
            <span style={{ fontSize: '1.25rem' }}>📑</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--brand-accent)', marginBottom: '0.25rem' }}>
            {loading ? '—' : agentData.total_reservations || clientReservations.length}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            All-time referred reservations
          </div>
        </div>

        {/* Active In-House Clients */}
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
              In-House Clients
            </span>
            <span style={{ fontSize: '1.25rem' }}>🏨</span>
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: '#10b981', marginBottom: '0.25rem' }}>
            {loading ? '—' : agentData.active_reservations || clientReservations.filter((r) => r.status === 'CHECKED_IN').length}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Clients currently in residence
          </div>
        </div>

        {/* Total Volume Generated */}
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
              Referred Volume
            </span>
            <span style={{ fontSize: '1.25rem' }}>💳</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {loading ? '—' : formatNaira(agentData.total_booking_volume)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Gross client spend in Naira
          </div>
        </div>

        {/* Total Commission Earned */}
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
              Accrued Commission
            </span>
            <span style={{ fontSize: '1.25rem' }}>💰</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#10b981', marginBottom: '0.25rem' }}>
            {loading ? '—' : formatNaira(agentData.total_commission_earned)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Total earned to date
          </div>
        </div>

        {/* Pending Payout */}
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
              Pending Payout
            </span>
            <span style={{ fontSize: '1.25rem' }}>⏳</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#f59e0b', marginBottom: '0.25rem' }}>
            {loading ? '—' : formatNaira(agentData.pending_commission)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Awaiting finance reconciliation
          </div>
        </div>
      </div>

      {/* 4. Client Bookings Table */}
      <Card
        title={`My Referred Client Reservations (${clientReservations.length})`}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/app/reservations')}
          >
            All Bookings →
          </Button>
        }
      >
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading client records...</div>
        ) : clientReservations.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No client reservations booked yet. Use the "+ Book for Client" button to create your first reservation!
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client / Guest</th>
                  <th>Booking Code</th>
                  <th>Check-In (1 Nt)</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {clientReservations.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.tenant_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.tenant_phone}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.reservation_code}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.check_in_date}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>1 Night stay</div>
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatNaira(r.total_amount)}</td>
                    <td>
                      <Badge status={r.status === 'CONFIRMED' || r.status === 'CHECKED_IN' ? 'available' : 'pending'}>
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
    </div>
  );
}
