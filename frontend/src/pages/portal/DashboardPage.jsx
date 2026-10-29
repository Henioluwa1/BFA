import React from 'react';
import { useAuth } from '../../context/AuthContext';
import SuperAdminDashboard from '../../components/dashboard/SuperAdminDashboard';
import AdminManagerDashboard from '../../components/dashboard/AdminManagerDashboard';
import ReceptionistDashboard from '../../components/dashboard/ReceptionistDashboard';
import StaffDashboard from '../../components/dashboard/StaffDashboard';
import AgentDashboard from '../../components/dashboard/AgentDashboard';
import OwnerDashboard from '../../components/dashboard/OwnerDashboard';

/**
 * Phase 3 Authoritative Role-Specific Dashboard Router
 * Dynamically mounts the appropriate, security-scoped dashboard for each role:
 * - SUPER_ADMIN: Dark canvas, system health telemetry, DB latency, global portfolio
 * - ADMIN: Full operational velocity, unit turnover, front desk, financial summary
 * - MANAGER: Daily operational velocity, unit turnover, front desk, maintenance
 * - RECEPTIONIST: Front desk arrivals/departures, in-house guests, unit readiness (zero sensitive financials)
 * - STAFF: Work orders queue, maintenance turnover board, priority tasks (zero financial/billing data)
 * - AGENT: Personal client bookings pipeline, commissions accrued & pending (strictly scoped to agentId)
 * - OWNER: Portfolio financial yield, NOI, operating expenses, asset occupancy rate
 */
export default function DashboardPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div style={{ fontSize: '2rem' }}>⚡</div>
        <div style={{ fontSize: '1rem', fontWeight: 500 }}>Initializing authorized role dashboard...</div>
      </div>
    );
  }

  const role = (user?.role || '').toUpperCase();

  switch (role) {
    case 'SUPER_ADMIN':
      return <SuperAdminDashboard />;

    case 'ADMIN':
    case 'MANAGER':
      return <AdminManagerDashboard role={role} />;

    case 'RECEPTIONIST':
      return <ReceptionistDashboard />;

    case 'STAFF':
      return <StaffDashboard />;

    case 'AGENT':
      return <AgentDashboard />;

    case 'OWNER':
      return <OwnerDashboard />;

    default:
      // Fallback to operational dashboard scoped as MANAGER
      return <AdminManagerDashboard role={role || 'STAFF'} />;
  }
}
