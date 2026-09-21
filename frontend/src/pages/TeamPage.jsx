import React from 'react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useProperty } from '../context/PropertyContext';

export default function TeamPage() {
  const { activeProperty, isAllProperties } = useProperty();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Team & Access Governance</span>
            <Badge status="pending">SCHEDULED: PHASE 2</Badge>
          </h1>
          <p className="page-subtitle">
            User administration, 6 primary enterprise roles, single-owner rule, and granular permissions.
          </p>
        </div>
      </div>

      <Card title="6 Primary Roles Hierarchy (Section 4 & 5)">
        <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 700, fontSize: '0.85rem' }}>
            NON-NEGOTIABLE GOVERNANCE RULES
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.25rem' }}>
            Only ONE Owner may exist in the system. Admin account cannot be modified or deactivated by Owner or Manager through normal application features.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { role: 'Admin', desc: 'Highest administrative authority. Full system, user, and settings control.' },
            { role: 'Manager', desc: 'Operational control of properties, units, staff, reservations. Cannot manage Admin.' },
            { role: 'Receptionist', desc: 'Front-desk operations, check-in, check-out, bookings, front calendar.' },
            { role: 'Staff', desc: 'Housekeeping, maintenance execution, inspections, unit status updates.' },
            { role: 'Agent', desc: 'Third-party client booking. Isolated view limited strictly to their own clients.' },
            { role: 'Owner', desc: 'Executive oversight, financials, business performance. Exactly 1 Owner allowed.' },
          ].map((r) => (
            <div key={r.role} style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>{r.role}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r.desc}</div>
            </div>
          ))}
        </div>

        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Phase 2 Architectural Specifications:</h4>
        <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyleType: 'disc' }}>
          <li>Backend-authoritative granular permissions (e.g. <code>reservations.checkin</code>, <code>payments.create</code>).</li>
          <li>Password hashing (bcrypt), JWT security, session invalidation.</li>
          <li>Enforcement of the single-owner constraint in database and API logic.</li>
        </ul>
      </Card>
    </div>
  );
}
