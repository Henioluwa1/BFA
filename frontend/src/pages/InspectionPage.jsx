import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function InspectionPage() {
  const { activeProperty, isAllProperties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Apartment Inspection</span>
            <Badge status="pending">SCHEDULED: PHASE 6</Badge>
          </h1>
          <p className="page-subtitle">
            Pre-arrival and post-checkout unit condition assessments, damage logs, missing items, and evidence tracking.
          </p>
        </div>
      </div>

      <Card title="Inspection & Checkout Workflow (Section 20)">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isAllProperties ? 'GLOBAL INSPECTIONS RECORD' : `PROPERTY SCOPE: ${activeProperty?.name}`}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            Inspections trigger post-stay unit transitions: e.g. marking units <code>DIRTY</code> or flagging damage.
          </p>
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 6 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Integrated with checkout: Tenant leaves → Post-stay inspection → Cleaning/Maintenance trigger.</li>
          <li>Condition checklist: Damage assessments, missing unit items, inspection notes.</li>
          <li>Evidence attachments and photo verification.</li>
          <li>Historical guest stay inspection history.</li>
        </ul>
      </Card>
    </div>
  );
}
