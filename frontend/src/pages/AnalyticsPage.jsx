import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function AnalyticsPage() {
  const { activeProperty, isAllProperties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Analytics & Intelligence</span>
            <Badge status="pending">SCHEDULED: PHASE 10</Badge>
          </h1>
          <p className="page-subtitle">
            Property performance, revenue trends, occupancy metrics, and operational reports.
          </p>
        </div>
      </div>

      <Card title="Analytics Scoping & Aggregation">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isAllProperties ? 'CONSOLIDATED PORTFOLIO ANALYTICS' : `PROPERTY ANALYTICS: ${activeProperty?.name}`}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            Zero artificial metrics. All charts and KPIs derive directly from raw reservation and financial records.
          </p>
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 10 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Overview: Total revenue, total expenses, net profit, portfolio occupancy rate.</li>
          <li>Reservations: Monthly booking trends, length of stay, direct vs agent breakdown.</li>
          <li>Apartment Performance: Revenue per available room (RevPAR), highest performing units.</li>
          <li>Property-level dynamic filtering on all analytics views.</li>
        </ul>
      </Card>
    </div>
  );
}
