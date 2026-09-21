import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function FinancialPage() {
  const { activeProperty, isAllProperties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Financial Management</span>
            <Badge status="pending">SCHEDULED: PHASE 8</Badge>
          </h1>
          <p className="page-subtitle">
            Payments collection, outstanding balance tracking, expense categorization, and net profit derivation.
          </p>
        </div>
      </div>

      <Card title="Financial Scoping & Accounting Rules">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            {isAllProperties ? 'GLOBAL CONSOLIDATED FINANCIALS' : `PROPERTY FINANCIALS: ${activeProperty?.name}`}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            Financial calculations are strictly computed from authoritative payment and expense records.
          </p>
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 8 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Calculated balances: <code>Outstanding = Reservation Total − Valid Payments</code>.</li>
          <li>Every payment is linked and traceable to a source reservation record.</li>
          <li>Expense tracking categorized by operations, maintenance, utilities, and commissions.</li>
          <li>Net Profit derived from validated revenue minus recorded expenses.</li>
        </ul>
      </Card>
    </div>
  );
}
