import React from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { formatNaira } from '../../utils/currency';

export default function BalanceSheetTab({ data, loading, onRefresh }) {
  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⏳ Computing Balance Sheet Statement...</div>
          <p style={{ fontSize: '0.85rem' }}>Aggregating cumulative Asset, Liability, and Equity balances from General Ledger</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No balance sheet data available for the selected criteria.</p>
          <Button variant="secondary" onClick={onRefresh} style={{ marginTop: '1rem' }}>
            Refresh Data
          </Button>
        </div>
      </Card>
    );
  }

  const {
    assets = { accounts: [], totalAssets: 0 },
    liabilities = { accounts: [], totalLiabilities: 0 },
    equity = { accounts: [], baseEquity: 0, currentPeriodEarnings: 0, totalEquity: 0 },
    totalLiabilitiesAndEquity = 0,
    isBalanced = true,
    discrepancy = 0,
    asOfDate,
  } = data;

  const handleExportCSV = () => {
    const rows = [
      ['BALANCE SHEET STATEMENT'],
      ['Basis:', data.basis || 'Accrual Accounting as of Date'],
      ['As of Date:', asOfDate || new Date().toISOString().slice(0, 10)],
      ['Parity Status:', isBalanced ? 'BALANCED' : `UNBALANCED (Variance: ${discrepancy})`],
      [],
      ['1. ASSETS (1000 Series)'],
      ['Account Code', 'Account Name', 'Classification', 'Balance (NGN)'],
      ...assets.accounts.map((a) => [a.account_code, a.account_name, a.account_subtype, a.balance]),
      ['TOTAL ASSETS', '', '', assets.totalAssets],
      [],
      ['2. LIABILITIES (2000 Series)'],
      ['Account Code', 'Account Name', 'Classification', 'Balance (NGN)'],
      ...liabilities.accounts.map((a) => [a.account_code, a.account_name, a.account_subtype, a.balance]),
      ['TOTAL LIABILITIES', '', '', liabilities.totalLiabilities],
      [],
      ['3. EQUITY (3000 Series)'],
      ['Account Code', 'Account Name', 'Classification', 'Balance (NGN)'],
      ...equity.accounts.map((a) => [a.account_code, a.account_name, a.account_subtype, a.balance]),
      ['Retained Net Earnings (Current Period P&L)', '', '', equity.currentPeriodEarnings],
      ['TOTAL EQUITY', '', '', equity.totalEquity],
      [],
      ['TOTAL LIABILITIES & EQUITY', '', '', totalLiabilitiesAndEquity],
      ['BALANCE CHECK (Assets - (Liabilities + Equity))', '', '', discrepancy],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bfa-balance-sheet-${asOfDate || Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Balance Discrepancy Banner if Unbalanced */}
      {!isBalanced && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ color: '#ef4444', fontWeight: 600 }}>
            ⚠ Accounting Parity Alert: Total Assets do not equal Total Liabilities + Equity. Variance: {formatNaira(discrepancy)}
          </div>
          <Badge status="error">OUT OF PARITY</Badge>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Assets
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatNaira(assets.totalAssets)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {assets.accounts.length} asset accounts recorded
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Liabilities
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
            {formatNaira(liabilities.totalLiabilities)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {liabilities.accounts.length} liability obligations
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Equity & Retained
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-gold, #c25e2e)', marginTop: '0.25rem' }}>
            {formatNaira(equity.totalEquity)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Incl. {formatNaira(equity.currentPeriodEarnings)} P&L earnings
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Accounting Parity
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: isBalanced ? '#10b981' : '#ef4444', marginTop: '0.25rem' }}>
            {isBalanced ? 'Balanced' : 'Variance Detected'}
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <Badge status={isBalanced ? 'success' : 'error'}>
              {isBalanced ? 'A = L + E Verified' : `Discrepancy: ${formatNaira(discrepancy)}`}
            </Badge>
          </div>
        </Card>
      </div>

      {/* Header & Export Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Statement of Financial Position</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            As of {asOfDate || 'Current Date'} — Accrual basis asset valuation, liabilities, and owner equity.
          </p>
        </div>
        <Button variant="secondary" onClick={handleExportCSV}>
          📥 Export Balance Sheet (CSV)
        </Button>
      </div>

      {/* ASSETS SECTION */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: 'var(--accent-gold)' }}>1. Assets (1000 Series)</h4>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total Assets: {formatNaira(assets.totalAssets)}</span>
        </div>
        {assets.accounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            No asset balances recorded.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Classification</th>
                <th style={{ textAlign: 'right' }}>Net Balance (NGN)</th>
              </tr>
            </thead>
            <tbody>
              {assets.accounts.map((a) => (
                <tr key={a.account_id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-gold)' }}>{a.account_code}</td>
                  <td style={{ fontWeight: 600 }}>{a.account_name}</td>
                  <td>
                    <Badge status="neutral">{a.account_subtype}</Badge>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNaira(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* LIABILITIES SECTION */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: '#f59e0b' }}>2. Liabilities (2000 Series)</h4>
          <span style={{ fontWeight: 700, color: '#f59e0b' }}>Total Liabilities: {formatNaira(liabilities.totalLiabilities)}</span>
        </div>
        {liabilities.accounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            No liabilities recorded.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Classification</th>
                <th style={{ textAlign: 'right' }}>Net Balance (NGN)</th>
              </tr>
            </thead>
            <tbody>
              {liabilities.accounts.map((a) => (
                <tr key={a.account_id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f59e0b' }}>{a.account_code}</td>
                  <td style={{ fontWeight: 600 }}>{a.account_name}</td>
                  <td>
                    <Badge status="neutral">{a.account_subtype}</Badge>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNaira(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* EQUITY SECTION */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: 'var(--accent-gold)' }}>3. Equity (3000 Series)</h4>
          <span style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>Total Equity: {formatNaira(equity.totalEquity)}</span>
        </div>
        <Table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account Name</th>
              <th>Classification</th>
              <th style={{ textAlign: 'right' }}>Net Balance (NGN)</th>
            </tr>
          </thead>
          <tbody>
            {equity.accounts.map((a) => (
              <tr key={a.account_id}>
                <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-gold)' }}>{a.account_code}</td>
                <td style={{ fontWeight: 600 }}>{a.account_name}</td>
                <td>
                  <Badge status="neutral">{a.account_subtype}</Badge>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNaira(a.balance)}</td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(255, 255, 255, 0.02)', fontWeight: 600 }}>
              <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>3999</td>
              <td style={{ fontStyle: 'italic' }}>Current Period Retained Net Earnings (from P&L)</td>
              <td>
                <Badge status={equity.currentPeriodEarnings >= 0 ? 'success' : 'danger'}>
                  {equity.currentPeriodEarnings >= 0 ? 'SURPLUS' : 'DEFICIT'}
                </Badge>
              </td>
              <td style={{ textAlign: 'right', color: equity.currentPeriodEarnings >= 0 ? '#10b981' : '#ef4444' }}>
                {formatNaira(equity.currentPeriodEarnings)}
              </td>
            </tr>
          </tbody>
        </Table>
        <div
          style={{
            marginTop: '1.25rem',
            padding: '1rem',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          <span>Total Liabilities & Equity:</span>
          <span style={{ color: isBalanced ? 'var(--text-primary)' : '#ef4444' }}>
            {formatNaira(totalLiabilitiesAndEquity)}
          </span>
        </div>
      </Card>
    </div>
  );
}

