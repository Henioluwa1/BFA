import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function ApartmentsPage() {
  const { activeProperty, isAllProperties, properties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Apartments & Units</span>
            <Badge status="pending">SCHEDULED: PHASE 3</Badge>
          </h1>
          <p className="page-subtitle">
            Multi-property building management, individual unit configurations, rate plans, and operational statuses.
          </p>
        </div>
      </div>

      <Card title="Multi-Property Hierarchy (Section 1 & 8)">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isAllProperties ? 'ALL BFA PROPERTIES' : `CURRENT PROPERTY: ${activeProperty?.name}`}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            {isAllProperties
              ? `Currently managing ${properties.length} dynamic properties.`
              : `Managing ${activeProperty?.unitCount} units in ${activeProperty?.name}.`}
          </p>
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 3 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Strict non-negotiable domain rule: Every apartment/unit belongs to exactly one property.</li>
          <li>Unit status decoupled from reservation status (Available, Occupied, Dirty, Ready, Maintenance, Blocked, Out of Service).</li>
          <li>Dynamic unit creation, activation, deactivation without breaking historical booking relationships.</li>
          <li>Deriving total unit counts dynamically from units table (no manual hardcoded numbers).</li>
        </ul>
      </Card>
    </div>
  );
}
