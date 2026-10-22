import React from 'react';

/**
 * FinancialSummaryCard — Renders financial KPIs from the outstanding payments summary.
 * Role-scoped: only authorized roles see this component.
 */
export default function FinancialSummaryCard({ data = {} }) {
  const {
    netRevenue = 0,
    grossCollected = 0,
    totalRefunded = 0,
    bookedRevenue = 0,
    outstandingReceivables = 0,
    pendingPayments = 0,
    approvedExpenses = 0,
    pendingExpenses = 0,
    currency = 'NGN',
  } = data;

  const fmt = (n) => `₦${Number(n || 0).toLocaleString()}`;

  return (
    <div className="fin-summary-card" role="region" aria-label="Financial Summary">
      <div className="fin-summary-header">
        <span className="fin-summary-icon">💰</span>
        <span className="fin-summary-title">Financial Overview</span>
      </div>

      <div className="fin-summary-grid">
        <KPITile label="Net Revenue" value={fmt(netRevenue)} variant="positive" />
        <KPITile label="Gross Collected" value={fmt(grossCollected)} variant="positive" />
        <KPITile label="Outstanding Receivables" value={fmt(outstandingReceivables)} variant={outstandingReceivables > 0 ? 'warning' : 'neutral'} />
        <KPITile label="Pending Payments" value={fmt(pendingPayments)} variant={pendingPayments > 0 ? 'warning' : 'neutral'} />
        <KPITile label="Booked Revenue" value={fmt(bookedRevenue)} variant="neutral" />
        <KPITile label="Approved Expenses" value={fmt(approvedExpenses)} variant="neutral" />
      </div>

      {pendingExpenses > 0 && (
        <div className="fin-summary-note">
          ⚠️ <strong>₦{Number(pendingExpenses).toLocaleString()}</strong> in pending expenses awaiting approval.
        </div>
      )}
    </div>
  );
}

function KPITile({ label, value, variant = 'neutral' }) {
  return (
    <div className={`fin-kpi-tile fin-kpi-${variant}`}>
      <div className="fin-kpi-label">{label}</div>
      <div className="fin-kpi-value">{value}</div>
    </div>
  );
}
