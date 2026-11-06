import React from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { formatNaira } from '../../utils/currency';

export default function CashFlowTab({ data, loading, onRefresh }) {
  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⏳ Computing Statement of Cash Flows...</div>
          <p style={{ fontSize: '0.85rem' }}>Analyzing direct cash and operating bank transactions (Accounts 1010 & 1020)</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No cash flow records found for the selected period.</p>
          <Button variant="secondary" onClick={onRefresh} style={{ marginTop: '1rem' }}>
            Refresh Data
          </Button>
        </div>
      </Card>
    );
  }

  const {
    beginningCashBalance = 0,
    operatingActivities = { inflows: [], totalInflows: 0, outflows: [], totalOutflows: 0, netCashFlow: 0 },
    endingCashBalance = 0,
    filters = {},
  } = data;

  const isPositiveCashFlow = operatingActivities.netCashFlow >= 0;

  const handleExportCSV = () => {
    const rows = [
      ['STATEMENT OF CASH FLOWS (DIRECT BASIS)'],
      ['Basis:', data.basis || 'Direct Operating Cash & Bank Movements'],
      ['Period:', `${filters.fromDate || 'Beginning'} to ${filters.toDate || 'Current'}`],
      [],
      ['Beginning Cash & Bank Balance', '', beginningCashBalance],
      [],
      ['OPERATING CASH INFLOWS'],
      ['Source Type', 'Description', 'Amount (NGN)'],
      ...operatingActivities.inflows.map((i) => [i.sourceType, i.description, i.amount]),
      ['Total Operating Inflows', '', operatingActivities.totalInflows],
      [],
      ['OPERATING CASH OUTFLOWS'],
      ['Source Type', 'Description', 'Amount (NGN)'],
      ...operatingActivities.outflows.map((o) => [o.sourceType, o.description, o.amount]),
      ['Total Operating Outflows', '', operatingActivities.totalOutflows],
      [],
      ['Net Increase / (Decrease) in Cash', '', operatingActivities.netCashFlow],
      ['Ending Cash & Bank Balance', '', endingCashBalance],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bfa-cash-flow-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Beginning Cash Balance
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatNaira(beginningCashBalance)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Prior to {filters.fromDate || 'period start'}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Cash Receipts
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {formatNaira(operatingActivities.totalInflows)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {operatingActivities.inflows.length} receipt categories
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Disbursements
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
            {formatNaira(operatingActivities.totalOutflows)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {operatingActivities.outflows.length} disbursement categories
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ending Cash & Bank
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-gold, #c25e2e)', marginTop: '0.25rem' }}>
            {formatNaira(endingCashBalance)}
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <Badge status={isPositiveCashFlow ? 'success' : 'pending'}>
              {isPositiveCashFlow ? `+${formatNaira(operatingActivities.netCashFlow)} Net Inflow` : `${formatNaira(operatingActivities.netCashFlow)} Net Outflow`}
            </Badge>
          </div>
        </Card>
      </div>

      {/* Header & Export Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Direct Cash Flow Statement</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Cash movements reconciled from 1010 (Operating Bank Account) and 1020 (Petty Cash Vault).
          </p>
        </div>
        <Button variant="secondary" onClick={handleExportCSV}>
          📥 Export Cash Flow (CSV)
        </Button>
      </div>

      {/* CASH INFLOWS */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: '#10b981' }}>1. Operating Cash Inflows (Receipts)</h4>
          <span style={{ fontWeight: 700, color: '#10b981' }}>Total Inflows: {formatNaira(operatingActivities.totalInflows)}</span>
        </div>
        {operatingActivities.inflows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            No cash receipts recorded during this period.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Source Classification</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Collected (NGN)</th>
              </tr>
            </thead>
            <tbody>
              {operatingActivities.inflows.map((inf, idx) => (
                <tr key={idx}>
                  <td>
                    <Badge status="success">{inf.sourceType}</Badge>
                  </td>
                  <td style={{ fontWeight: 600 }}>{inf.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#10b981' }}>
                    {formatNaira(inf.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* CASH OUTFLOWS */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: '#ef4444' }}>2. Operating Cash Outflows (Disbursements)</h4>
          <span style={{ fontWeight: 700, color: '#ef4444' }}>Total Outflows: {formatNaira(operatingActivities.totalOutflows)}</span>
        </div>
        {operatingActivities.outflows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            No cash disbursements recorded during this period.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Source Classification</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Disbursed (NGN)</th>
              </tr>
            </thead>
            <tbody>
              {operatingActivities.outflows.map((out, idx) => (
                <tr key={idx}>
                  <td>
                    <Badge status="error">{out.sourceType}</Badge>
                  </td>
                  <td style={{ fontWeight: 600 }}>{out.description}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>
                    {formatNaira(out.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* CASH SUMMARY RECONCILIATION */}
      <Card>
        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--accent-gold)' }}>Cash Position Reconciliation</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.92rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)' }}>
            <span>Beginning Cash & Bank:</span>
            <span style={{ fontWeight: 600 }}>{formatNaira(beginningCashBalance)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', color: '#10b981' }}>
            <span>(+) Total Cash Inflows:</span>
            <span style={{ fontWeight: 600 }}>{formatNaira(operatingActivities.totalInflows)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', color: '#ef4444' }}>
            <span>(-) Total Cash Outflows:</span>
            <span style={{ fontWeight: 600 }}>{formatNaira(operatingActivities.totalOutflows)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', fontWeight: 700, fontSize: '1.05rem' }}>
            <span>(=) Net Ending Cash & Bank:</span>
            <span style={{ color: 'var(--accent-gold)' }}>{formatNaira(endingCashBalance)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

