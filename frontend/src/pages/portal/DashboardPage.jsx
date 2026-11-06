import React from 'react';
import { useAuth } from '../../context/AuthContext';
import SuperAdminDashboard from '../../components/dashboard/SuperAdminDashboard';
import AdminDashboard from '../../components/dashboard/AdminDashboard';
import ManagerDashboard from '../../components/dashboard/ManagerDashboard';
import ReceptionistDashboard from '../../components/dashboard/ReceptionistDashboard';
import StaffDashboard from '../../components/dashboard/StaffDashboard';
import AgentDashboard from '../../components/dashboard/AgentDashboard';
import OwnerDashboard from '../../components/dashboard/OwnerDashboard';

/**
 * Redefined BFA Role-Specific Dashboard Router
 * Dynamically mounts the appropriate, security-scoped dashboard for each role:
 * - SUPER_ADMIN: Developer/Technical operations console (health, DB latency, services, logs — NO business/financial data)
 * - OWNER: Business Executive portfolio yield, RevPAR, accounting ledgers, high-risk financial oversight
 * - ADMIN: Business operations admin, staff directory, properties, reservations, cross-property operational governance
 * - MANAGER: Property-scoped operational center (strictly requires property assignment; rejected if unassigned)
 * - RECEPTIONIST: Front desk arrivals/departures, in-house guests, unit readiness (zero sensitive financials)
 * - STAFF: Work orders queue, maintenance turnover board, priority tasks (zero financial/billing data, room status safety)
 * - AGENT: Personal client bookings pipeline, commissions accrued & pending (strictly scoped to agentId)
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
      return <AdminDashboard />;

    case 'OPERATIONS_MANAGER':
    case 'MANAGER':
      return <ManagerDashboard />;

    case 'RECEPTIONIST':
      return <ReceptionistDashboard />;

    case 'STAFF':
      return <StaffDashboard />;

    case 'AGENT':
      return <AgentDashboard />;

    case 'OWNER':
      return <OwnerDashboard />;

    default:
      return <StaffDashboard />;
  }
}
