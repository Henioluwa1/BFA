import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { financialService, frontOfficeService, maintenanceService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const { activeProperty, isAllProperties } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kpis, setKpis] = useState({
    grossCollected: 0,
    totalRefunded: 0,
    netRevenue: 0,
    bookedRevenue: 0,
    outstandingReceivables: 0,
    pendingPayments: 0,
    approvedExpenses: 0,
    pendingExpenses: 0,
    voidedExpenses: 0,
    netProfit: 0,
    profitMargin: 0,
  });
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [occupancy, setOccupancy] = useState({
    totalUnits: 0,
    occupiedUnits: 0,
    availableUnits: 0,
    occupancyRate: 0,
  });
  const [maintenance, setMaintenance] = useState({
    openCount: 0,
    inProgressCount: 0,
    criticalCount: 0,
  });

  const propertyId = isAllProperties ? undefined : activeProperty?.id;

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [finRes, foRes, maintRes] = await Promise.all([
        financialService.getOverview({ propertyId }).catch((err) => {
          console.warn('Financial overview fetch warning:', err);
          return { data: { kpis: {}, categoryBreakdown: [] } };
        }),
        frontOfficeService.getStats({ propertyId }).catch((err) => {
          console.warn('Front office stats fetch warning:', err);
          return { data: {} };
        }),
        maintenanceService.getStats({ propertyId }).catch((err) => {
          console.warn('Maintenance stats fetch warning:', err);
          return { data: {} };
        }),
      ]);

      const finData = finRes.data || {};
      if (finData.kpis) {
        setKpis(finData.kpis);
      }
      if (Array.isArray(finData.categoryBreakdown)) {
        setCategoryBreakdown(finData.categoryBreakdown);
      }

      const foData = foRes.data || {};
      const totalUnits = foData.totalUnits || 0;
      const occupiedUnits = foData.occupiedUnits || 0;
      const availableUnits = foData.availableUnits || 0;
      const occRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
      setOccupancy({
        totalUnits,
        occupiedUnits,
        availableUnits,
        occupancyRate: occRate,
      });

      const maintData = maintRes.data?.overview || maintRes.data || {};
      setMaintenance({
        openCount: maintData.open ?? maintData.open_count ?? 0,
        inProgressCount: maintData.inProgress ?? maintData.in_progress_count ?? 0,
        criticalCount: maintData.criticalOpen ?? maintData.critical_open_count ?? maintData.critical_count ?? 0,
      });
    } catch (err) {
      console.error('Owner dashboard load error:', err);
      setError(err?.message || 'Failed to retrieve authoritative owner portfolio data.');
      addToast('Failed to load portfolio financial metrics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [propertyId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Executive Portfolio & Yield Console</h1>
            <span
              style={{
                background: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              💼 Asset Owner
            </span>
            <Badge status="info">
              {isAllProperties ? '🌐 Multi-Property Portfolio' : `📍 ${activeProperty?.name || 'Selected Property'}`}
            </Badge>
          </div>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Authoritative financial yields, net operating income (NOI), expense monitoring, and real estate asset utilization.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="outline" size="sm" onClick={loadDashboardData} loading={loading}>
            ↻ Refresh Ledger & Stats
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/app/reports?tab=financial')}>
            📊 Full Financial Reports
          </Button>
        </div>
      </div>

      {/* Error state if data fetch fails */}
      {error && (
        <div
          style={{
            padding: '1rem 1.25rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <strong>Error loading portfolio metrics:</strong> {error}
          </div>
          <Button variant="outline" size="sm" onClick={loadDashboardData}>
            Try Again
          </Button>
        </div>
      )}

      {/* Primary Financial Yield Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Net Operating Income (NOI) */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                NET OPERATING INCOME (NOI)
              </span>
              <span style={{ fontSize: '1.25rem' }}>💰</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: kpis.netProfit >= 0 ? '#059669' : '#dc2626', marginBottom: '0.25rem' }}>
              {loading ? '...' : formatNaira(kpis.netProfit)}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Profit Margin:{' '}
              <strong style={{ color: kpis.profitMargin >= 0 ? '#059669' : '#dc2626' }}>
                {loading ? '...' : `${kpis.profitMargin}%`}
              </strong>
            </div>
          </div>
        </Card>

        {/* Gross Collections */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                GROSS CASH COLLECTED
              </span>
              <span style={{ fontSize: '1.25rem' }}>📥</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              {loading ? '...' : formatNaira(kpis.grossCollected)}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Net realized revenue: {loading ? '...' : formatNaira(kpis.netRevenue)}
            </div>
          </div>
        </Card>

        {/* Portfolio Occupancy Rate */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                ASSET OCCUPANCY RATE
              </span>
              <span style={{ fontSize: '1.25rem' }}>🏢</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2563eb', marginBottom: '0.25rem' }}>
              {loading ? '...' : `${occupancy.occupancyRate}%`}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {loading ? '...' : `${occupancy.occupiedUnits} occupied / ${occupancy.totalUnits} total units`}
            </div>
          </div>
        </Card>

        {/* Operating Expenses */}
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                APPROVED OPEX (EXPENSES)
              </span>
              <span style={{ fontSize: '1.25rem' }}>🧾</span>
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#d97706', marginBottom: '0.25rem' }}>
              {loading ? '...' : formatNaira(kpis.approvedExpenses)}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {kpis.pendingExpenses > 0
                ? `${formatNaira(kpis.pendingExpenses)} pending approval`
                : 'Zero unapproved expenses'}
            </div>
          </div>
        </Card>
      </div>

      {/* Secondary Strategic Overview Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Bookings & Receivables Summary */}
        <Card title="Receivables & Bookings Flow">
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Contracted Bookings:</span>
              <span style={{ fontWeight: 600 }}>{formatNaira(kpis.bookedRevenue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Outstanding Receivables:</span>
              <span style={{ fontWeight: 600, color: kpis.outstandingReceivables > 0 ? '#b45309' : '#059669' }}>
                {formatNaira(kpis.outstandingReceivables)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Customer Refunds Processed:</span>
              <span style={{ fontWeight: 600, color: '#6b7280' }}>
                {formatNaira(kpis.totalRefunded)}
              </span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => navigate('/app/financial?tab=payments')}>
                Audit Financial Transactions →
              </Button>
            </div>
          </div>
        </Card>

        {/* Asset Maintenance & Capex Watch */}
        <Card title="Asset Integrity & Maintenance">
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Active Work Orders:</span>
              <span style={{ fontWeight: 600, color: maintenance.openCount > 0 ? '#b45309' : '#059669' }}>
                {maintenance.openCount} Open
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Tasks In Progress:</span>
              <span style={{ fontWeight: 600 }}>{maintenance.inProgressCount} active</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Critical Issues:</span>
              <span style={{ fontWeight: 600, color: maintenance.criticalCount > 0 ? '#dc2626' : '#059669' }}>
                {maintenance.criticalCount} Critical
              </span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => navigate('/app/maintenance')}>
                Review Maintenance Requests →
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Two Column Detailed Breakdown */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: '1.5rem',
        }}
      >
        {/* Left Column: Operating Expense Breakdown by Category */}
        <Card title="Operating Expense (OPEX) Distribution">
          <div style={{ padding: '1rem' }}>
            {categoryBreakdown.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📋</span>
                <p style={{ margin: 0 }}>No approved operating expenses recorded for this period.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {categoryBreakdown.map((cat, idx) => {
                  const catAmount = parseFloat(cat.total_amount || 0);
                  const totalExp = kpis.approvedExpenses > 0 ? kpis.approvedExpenses : 1;
                  const pct = Math.min(100, Math.round((catAmount / totalExp) * 100));

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                          {cat.category ? cat.category.toLowerCase().replace(/_/g, ' ') : 'General'}
                        </span>
                        <span>
                          <strong>{formatNaira(catAmount)}</strong> ({pct}%)
                        </span>
                      </div>
                      {/* Visual progress bar */}
                      <div
                        style={{
                          height: '6px',
                          borderRadius: '9999px',
                          background: 'var(--border)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: '#d97706',
                            borderRadius: '9999px',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Right Column: Asset Quick Actions & Reports */}
        <Card title="Asset Management Shortcuts">
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              onClick={() => navigate('/app/financial')}
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Financial Ledger & Invoices</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Audit receivables, payments & balances</div>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </div>

            <div
              onClick={() => navigate('/app/expenses')}
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Expense Approvals & Outflows</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Track utility, vendor & facility spend</div>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </div>

            <div
              onClick={() => navigate('/app/properties')}
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Property Portfolio Directory</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inspect buildings, unit counts & statuses</div>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </div>

            <div
              onClick={() => navigate('/app/reports?tab=financial')}
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Financial Statements & Export</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Download official P&L in CSV or PDF format</div>
              </div>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
