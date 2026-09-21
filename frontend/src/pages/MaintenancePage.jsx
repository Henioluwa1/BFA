import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function MaintenancePage() {
  const { activeProperty, isAllProperties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Maintenance Tracker</span>
            <Badge status="pending">SCHEDULED: PHASE 7</Badge>
          </h1>
          <p className="page-subtitle">
            Operational issue tracking, staff assignment, repair resolution, and unit operational state integration.
          </p>
        </div>
      </div>

      <Card title="Operational Issue Scoping">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isAllProperties ? 'ALL PROPERTY WORK ORDERS' : `MAINTENANCE: ${activeProperty?.name}`}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            Active work orders directly transition affected units into <code>MAINTENANCE</code> or <code>BLOCKED</code> status.
          </p>
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 7 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Issue lifecycle: <code>OPEN</code> → <code>IN_PROGRESS</code> → <code>RESOLVED</code>.</li>
          <li>Assigning staff members and logging resolution times and repair costs.</li>
          <li>Synchronizing unit availability: prevent reservations on units under critical maintenance.</li>
          <li>Filters for Opened, In Progress, and Resolved work orders.</li>
        </ul>
      </Card>
    </div>
  );
}
