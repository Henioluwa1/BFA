import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function CalendarPage() {
  const { activeProperty, isAllProperties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Reservation Calendar</span>
            <Badge status="pending">SCHEDULED: PHASE 5</Badge>
          </h1>
          <p className="page-subtitle">
            Visual multi-property reservation calendar supporting Month, Week, Day, and Timeline views.
          </p>
        </div>
      </div>

      <Card title="Active Property Scope & Filters">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isAllProperties ? 'GLOBAL PORTFOLIO CALENDAR' : `PROPERTY: ${activeProperty?.name}`}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            {isAllProperties
              ? 'Displaying reservations across all registered BFA properties.'
              : `Scoped to ${activeProperty?.name} (${activeProperty?.unitCount} rentable units).`}
          </p>
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 5 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Interactive timeline, month, week, and day grid views.</li>
          <li>Filtering by property, apartment/unit, reservation status, agent, and tenant/guest.</li>
          <li>Double-booking collision prevention visualizer.</li>
          <li>Direct click-through to reservation details and front-office workflows (check-in / check-out).</li>
        </ul>
      </Card>
    </div>
  );
}
