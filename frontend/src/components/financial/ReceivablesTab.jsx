import React, { useState, useMemo } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { formatNaira } from '../../utils/currency';

export default function ReceivablesTab({ data, loading, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [agingFilter, setAgingFilter] = useState('ALL');

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⏳ Loading Accounts Receivable & Guest Ledgers...</div>
          <p style={{ fontSize: '0.85rem' }}>Reconciling outstanding booking balances against Account 1200</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No accounts receivable records found for the selected criteria.</p>
          <Button variant="secondary" onClick={onRefresh} style={{ marginTop: '1rem' }}>
            Refresh Data
          </Button>
        </div>
      </Card>
    );
  }

  const {
    summary = { totalBilled: 0, totalCollected: 0, totalOutstanding: 0, debtorCount: 0 },
    receivables = [],
  } = data;

  // Filtered by search and aging
  const filteredList = useMemo(() => {
    return receivables.filter((r) => {
      const matchSearch =
        !searchTerm ||
        r.reservationCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.tenantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.propertyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.unitNumber?.toLowerCase().includes(searchTerm.toLowerCase());

      let matchAging = true;
      if (agingFilter === 'CURRENT') matchAging = r.daysOverdue === 0;
      else if (agingFilter === 'OVERDUE_1_30') matchAging = r.daysOverdue >= 1 && r.daysOverdue <= 30;
      else if (agingFilter === 'OVERDUE_30_PLUS') matchAging = r.daysOverdue > 30;

      return matchSearch && matchAging;
    });
  }, [receivables, searchTerm, agingFilter]);

  const handleExportCSV = () => {
    const headers = [
      'Reservation Code',
      'Guest Name',
      'Phone',
      'Property',
      'Unit',
      'Check-In',
      'Check-Out',
      'Total Billed (NGN)',
      'Paid Amount (NGN)',
      'Outstanding Balance (NGN)',
      'Days Overdue',
      'Payment Status',
    ];
    const rows = filteredList.map((r) => [
      `"${r.reservationCode || ''}"`,
      `"${(r.tenantName || '').replace(/"/g, '""')}"`,
      `"${r.tenantPhone || ''}"`,
      `"${(r.propertyName || '').replace(/"/g, '""')}"`,
      `"${r.unitNumber || ''}"`,
      r.checkInDate || '',
      r.checkOutDate || '',
      r.totalAmount,
      r.paidAmount,
      r.outstandingBalance,
      r.daysOverdue,
      r.paymentStatus,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bfa-receivables-${Date.now()}.csv`);
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
            Total Outstanding
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
            {formatNaira(summary.totalOutstanding)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {summary.debtorCount} guest balances pending
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Contracted Billed
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatNaira(summary.totalBilled)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Active debtor reservations
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Collected to Date
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {formatNaira(summary.totalCollected)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {summary.totalBilled > 0 ? `${((summary.totalCollected / summary.totalBilled) * 100).toFixed(1)}% recovery rate` : '0%'}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Subledger Account
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--accent-gold, #c25e2e)', marginTop: '0.25rem' }}>
            Account 1200
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Guest Ledger / Accounts Receivable
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', flex: 1, minWidth: '300px' }}>
            <input
              type="text"
              placeholder="Search by reservation #, guest name, phone, or unit..."
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
              value={agingFilter}
              onChange={(e) => setAgingFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="ALL">All Aging Categories</option>
              <option value="CURRENT">Current Stays (0 days overdue)</option>
              <option value="OVERDUE_1_30">Overdue (1 - 30 days)</option>
              <option value="OVERDUE_30_PLUS">Severe (30+ days overdue)</option>
            </select>
          </div>
          <Button variant="secondary" onClick={handleExportCSV}>
            📥 Export Receivables (CSV)
          </Button>
        </div>
      </Card>

      {/* Receivables Table */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Outstanding Guest Folios ({filteredList.length})</h4>
          <span style={{ fontWeight: 600, color: '#ef4444' }}>
            Filtered Unpaid: {formatNaira(filteredList.reduce((acc, r) => acc + (parseFloat(r.outstandingBalance) || 0), 0))}
          </span>
        </div>

        {filteredList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No matching outstanding receivables found.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Booking Code</th>
                <th>Guest</th>
                <th>Property / Unit</th>
                <th>Stay Dates</th>
                <th style={{ textAlign: 'right' }}>Total Billed</th>
                <th style={{ textAlign: 'right' }}>Collected</th>
                <th style={{ textAlign: 'right' }}>Outstanding</th>
                <th>Aging / Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((r) => (
                <tr key={r.reservationId}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    {r.reservationCode}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.tenantName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.tenantPhone}</div>
                  </td>
                  <td>
                    <div>{r.propertyName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Unit {r.unitNumber}</div>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    <div>In: {r.checkInDate ? r.checkInDate.slice(0, 10) : '-'}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Out: {r.checkOutDate ? r.checkOutDate.slice(0, 10) : '-'}</div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatNaira(r.totalAmount)}</td>
                  <td style={{ textAlign: 'right', color: '#10b981' }}>{formatNaira(r.paidAmount)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                    {formatNaira(r.outstandingBalance)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                      <Badge status={r.daysOverdue > 30 ? 'error' : r.daysOverdue > 0 ? 'pending' : 'neutral'}>
                        {r.daysOverdue === 0 ? 'Current Stay' : `${r.daysOverdue} days past`}
                      </Badge>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.paymentStatus}</span>
                    </div>
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

