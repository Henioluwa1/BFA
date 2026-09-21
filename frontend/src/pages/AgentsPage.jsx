import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function AgentsPage() {
  const { activeProperty, isAllProperties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Agent Management</span>
            <Badge status="pending">SCHEDULED: PHASE 9</Badge>
          </h1>
          <p className="page-subtitle">
            Third-party partner management, isolated client bookings, commission schedules, and payout settlements.
          </p>
        </div>
      </div>

      <Card title="Agent Data Isolation Standard (Section 18)">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isAllProperties ? 'ALL BFA AGENT PARTNERS' : `FILTERED: ${activeProperty?.name}`}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            Agent accounts are strictly restricted on the backend to view only their authorized client bookings.
          </p>
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 9 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Server-side agent data isolation strictly enforced (agents cannot view other agents' data).</li>
          <li>Commission calculation engine based on property and stay rules.</li>
          <li>Commission history and settlement transaction records.</li>
          <li>Agent performance metrics and booking volume analytics.</li>
        </ul>
      </Card>
    </div>
  );
}
