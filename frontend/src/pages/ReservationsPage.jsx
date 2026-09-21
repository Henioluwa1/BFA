import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function ReservationsPage() {
  const { activeProperty, isAllProperties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>All Reservations</span>
            <Badge status="pending">SCHEDULED: PHASE 4</Badge>
          </h1>
          <p className="page-subtitle">
            Comprehensive reservation management, booking lifecycles, and tenant stay tracking.
          </p>
        </div>
      </div>

      <Card title="Active Property Scope & Filters">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isAllProperties ? 'GLOBAL RESERVATIONS SCOPE' : `FILTERED: ${activeProperty?.name}`}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            {isAllProperties
              ? 'Showing booking records across all BFA buildings.'
              : `Showing bookings exclusively for ${activeProperty?.name}.`}
          </p>
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 4 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Status tabs: All, Checked In, Completed, Cancelled, Pending, Confirmed, No-Show.</li>
          <li>Server-side double-booking prevention with transactional locking and conflict detection.</li>
          <li>Direct vs. Agent reservation attribution.</li>
          <li>Real-time calculation of reservation totals, deposits, and outstanding balances.</li>
        </ul>
      </Card>
    </div>
  );
}
