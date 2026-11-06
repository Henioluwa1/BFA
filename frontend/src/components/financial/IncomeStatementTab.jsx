import React from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import { formatNaira } from '../../utils/currency';

export default function IncomeStatementTab({ data, loading, onRefresh }) {
  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>⏳ Computing Profit & Loss Statement...</div>
          <p style={{ fontSize: '0.85rem' }}>Aggregating revenue credits and expense debits from General Ledger</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <p>No income statement data available for the selected period and property filter.</p>
          <Button variant="secondary" onClick={onRefresh} style={{ marginTop: '1rem' }}>
            Refresh Data
          </Button>
        </div>
      </Card>
    );
  }

  const { revenues = { accounts: [], totalRevenue: 0 }, expenses = { accounts: [], totalExpenses: 0 }, netOperatingIncome = 0, isProfitable } = data;

  const handleExportCSV = () => {
    const rows = [
      ['PROFIT & LOSS STATEMENT (INCOME STATEMENT)'],
      ['Basis:', data.basis || 'Accrual Accounting'],
      ['Date Range:', `${data.filters?.fromDate || 'Beginning'} to ${data.filters?.toDate || 'Current'}`],
      [],
      ['REVENUE ACCOUNTS'],
      ['Account Code', 'Account Name', 'Classification', 'Net Amount (NGN)'],
      ...revenues.accounts.map((a) => [a.account_code, a.account_name, a.account_subtype, a.net_amount]),
      ['TOTAL REVENUE', '', '', revenues.totalRevenue],
      [],
      ['OPERATING EXPENSES'],
      ['Account Code', 'Account Name', 'Classification', 'Net Amount (NGN)'],
      ...expenses.accounts.map((a) => [a.account_code, a.account_name, a.account_subtype, a.net_amount]),
      ['TOTAL EXPENSES', '', '', expenses.totalExpenses],
      [],
      ['NET OPERATING INCOME / (LOSS)', '', '', netOperatingIncome],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bfa-income-statement-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Earned Revenue
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-green, #22c55e)', marginTop: '0.25rem' }}>
            {formatNaira(revenues.totalRevenue)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {revenues.accounts.length} active revenue streams
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Operating Expenses
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-red, #ef4444)', marginTop: '0.25rem' }}>
            {formatNaira(expenses.totalExpenses)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {expenses.accounts.length} expense categories recognized
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Net Operating Income / (Loss)
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: isProfitable ? 'var(--accent-green, #22c55e)' : 'var(--accent-red, #ef4444)', marginTop: '0.25rem' }}>
            {formatNaira(netOperatingIncome)}
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <Badge variant={isProfitable ? 'success' : 'danger'}>
              {isProfitable ? 'Profitable Operations' : 'Net Operating Deficit'}
            </Badge>
          </div>
        </Card>
      </div>

      {/* Header & Export Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Statement of Comprehensive Income</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Authoritative accrual revenue and operating expenses derived from posted General Ledger entries.
          </p>
        </div>
        <Button variant="secondary" onClick={handleExportCSV}>
          📥 Export P&L (CSV)
        </Button>
      </div>

      {/* REVENUES SECTION */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: 'var(--accent-gold)' }}>1. Operating Revenue (4000 Series)</h4>
          <span style={{ fontWeight: 700, color: 'var(--accent-green, #22c55e)' }}>Subtotal: {formatNaira(revenues.totalRevenue)}</span>
        </div>
        {revenues.accounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            No revenue recorded for the selected period.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Classification</th>
                <th style={{ textAlign: 'right' }}>Total Credits</th>
                <th style={{ textAlign: 'right' }}>Total Debits</th>
                <th style={{ textAlign: 'right' }}>Net Revenue</th>
              </tr>
            </thead>
            <tbody>
              {revenues.accounts.map((a) => (
                <tr key={a.account_id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-gold)' }}>{a.account_code}</td>
                  <td style={{ fontWeight: 600 }}>{a.account_name}</td>
                  <td>
                    <Badge variant="neutral">{a.account_subtype}</Badge>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatNaira(a.total_credit)}</td>
                  <td style={{ textAlign: 'right' }}>{formatNaira(a.total_debit)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-green, #22c55e)' }}>
                    {formatNaira(a.net_amount)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-secondary)', fontWeight: 700 }}>
                <td colSpan={5}>TOTAL OPERATING REVENUE</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-green, #22c55e)', fontSize: '1rem' }}>
                  {formatNaira(revenues.totalRevenue)}
                </td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>

      {/* EXPENSES SECTION */}
      <Card>
        <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-default)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: 'var(--accent-gold)' }}>2. Operating Expenses (5000 Series)</h4>
          <span style={{ fontWeight: 700, color: 'var(--accent-red, #ef4444)' }}>Subtotal: {formatNaira(expenses.totalExpenses)}</span>
        </div>
        {expenses.accounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
            No operational expenses recorded for the selected period.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Classification</th>
                <th style={{ textAlign: 'right' }}>Total Debits</th>
                <th style={{ textAlign: 'right' }}>Total Credits</th>
                <th style={{ textAlign: 'right' }}>Net Expense</th>
              </tr>
            </thead>
            <tbody>
              {expenses.accounts.map((a) => (
                <tr key={a.account_id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-gold)' }}>{a.account_code}</td>
                  <td style={{ fontWeight: 600 }}>{a.account_name}</td>
                  <td>
                    <Badge variant="neutral">{a.account_subtype}</Badge>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatNaira(a.total_debit)}</td>
                  <td style={{ textAlign: 'right' }}>{formatNaira(a.total_credit)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-red, #ef4444)' }}>
                    {formatNaira(a.net_amount)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg-secondary)', fontWeight: 700 }}>
                <td colSpan={5}>TOTAL OPERATING EXPENSES</td>
                <td style={{ textAlign: 'right', color: 'var(--accent-red, #ef4444)', fontSize: '1rem' }}>
                  {formatNaira(expenses.totalExpenses)}
                </td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>

      {/* FINAL SUMMARY CALLOUT */}
      <Card style={{ borderLeft: `4px solid ${isProfitable ? 'var(--accent-green, #22c55e)' : 'var(--accent-red, #ef4444)'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Final Net Profit / (Loss) for Period
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isProfitable ? 'var(--accent-green, #22c55e)' : 'var(--accent-red, #ef4444)', marginTop: '0.2rem' }}>
              {formatNaira(netOperatingIncome)}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <div>Revenue: <strong>{formatNaira(revenues.totalRevenue)}</strong></div>
            <div>Expenses: <strong>{formatNaira(expenses.totalExpenses)}</strong></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

