import React, { useState, useMemo } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { formatNaira } from '../../utils/currency';

export default function RefundsReconciliationTab({ data, loading, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⏳ Loading Refunds & Payment Reconciliation...</div>
          <p style={{ fontSize: '0.85rem' }}>Matching subledger refund transactions with General Ledger reversing entries</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No refund transactions found for the selected criteria.</p>
          <Button variant="secondary" onClick={onRefresh} style={{ marginTop: '1rem' }}>
            Refresh Data
          </Button>
        </div>
      </Card>
    );
  }

  const {
    summary = { totalOriginalAmount: 0, totalRefunded: 0, netRetained: 0, refundCount: 0 },
    refunds = [],
  } = data;

  const filteredRefunds = useMemo(() => {
    return refunds.filter((r) => {
      const matchSearch =
        !searchTerm ||
        r.transactionReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reservationCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.propertyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.refundReason?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchMethod = methodFilter === 'ALL' || r.paymentMethod === methodFilter;

      return matchSearch && matchMethod;
    });
  }, [refunds, searchTerm, methodFilter]);

  const handleExportCSV = () => {
    const headers = [
      'Transaction Ref',
      'Booking Code',
      'Property',
      'Payment Method',
      'Original Amount (NGN)',
      'Refunded Amount (NGN)',
      'Net Retained (NGN)',
      'Refund Reason',
      'Status',
      'Refunded At',
    ];
    const rows = filteredRefunds.map((r) => [
      `"${r.transactionReference || ''}"`,
      `"${r.reservationCode || ''}"`,
      `"${(r.propertyName || '').replace(/"/g, '""')}"`,
      r.paymentMethod || '',
      r.originalAmount,
      r.refundAmount,
      r.netRetained,
      `"${(r.refundReason || '').replace(/"/g, '""')}"`,
      r.status,
      r.refundedAt || '',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bfa-refunds-reconciliation-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Processed Refunds
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
            {formatNaira(summary.totalRefunded)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {summary.refundCount} reversed transactions
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Original Gross Value
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatNaira(summary.totalOriginalAmount)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Prior to refund execution
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Net Retained Revenue
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {formatNaira(summary.netRetained)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Remaining post-refund balance
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            GL Alignment
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--accent-gold, #c25e2e)', marginTop: '0.25rem' }}>
            Full Double-Entry
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Audited against Cash & 2030 Deposits
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px' }}>
            <input
              type="text"
              placeholder="Search reference, reservation code, property, or reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="ALL">All Payment Methods</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="POS">POS Terminal</option>
              <option value="CASH">Cash</option>
              <option value="ONLINE">Online Gateway</option>
            </select>
          </div>
          <Button variant="secondary" onClick={handleExportCSV}>
            📥 Export Refunds (CSV)
          </Button>
        </div>
      </Card>

      {/* Refunds Table */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Reconciled Refund Records ({filteredRefunds.length})</h4>
          <span style={{ fontWeight: 600, color: '#ef4444' }}>
            Filtered Total: {formatNaira(filteredRefunds.reduce((acc, r) => acc + (parseFloat(r.refundAmount) || 0), 0))}
          </span>
        </div>

        {filteredRefunds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No refund records match the selected filters.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Booking Code</th>
                <th>Property</th>
                <th>Method</th>
                <th style={{ textAlign: 'right' }}>Original Amount</th>
                <th style={{ textAlign: 'right' }}>Refund Amount</th>
                <th style={{ textAlign: 'right' }}>Net Retained</th>
                <th>Reason & Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRefunds.map((r) => (
                <tr key={r.transactionId}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    {r.transactionReference}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{r.reservationCode}</td>
                  <td>{r.propertyName}</td>
                  <td>
                    <Badge status="neutral">{r.paymentMethod}</Badge>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatNaira(r.originalAmount)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                    {formatNaira(r.refundAmount)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                    {formatNaira(r.netRetained)}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 500 }}>{r.refundReason || 'No reason specified'}</div>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {r.refundedAt ? new Date(r.refundedAt).toLocaleString() : '-'}
                    </div>
                  </td>
                  <td>
                    <Badge status={r.status === 'REFUNDED' ? 'error' : 'pending'}>
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

