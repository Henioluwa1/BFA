import React, { useState, useEffect, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import { analyticsService, reportService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function AnalyticsPage() {
  const { properties, activePropertyId, isAllProperties, activeProperty } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  // Active Tab: 'overview' | 'reservations' | 'apartments' | 'agents' | 'operations'
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  // Filters
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [dateRangePreset, setDateRangePreset] = useState('30D'); // '7D' | '30D' | '90D' | 'YTD' | 'CUSTOM'
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Data states
  const [overviewData, setOverviewData] = useState(null);
  const [reservationsData, setReservationsData] = useState(null);
  const [apartmentsData, setApartmentsData] = useState([]);
  const [agentsData, setAgentsData] = useState([]);
  const [operationsData, setOperationsData] = useState(null);

  // Sync propertyFilter with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Handle Preset Change
  const handlePresetChange = (preset) => {
    setDateRangePreset(preset);
    const end = new Date();
    let start = new Date();

    if (preset === '7D') {
      start.setDate(end.getDate() - 7);
    } else if (preset === '30D') {
      start.setDate(end.getDate() - 30);
    } else if (preset === '90D') {
      start.setDate(end.getDate() - 90);
    } else if (preset === 'YTD') {
      start = new Date(end.getFullYear(), 0, 1);
    }

    if (preset !== 'CUSTOM') {
      setFromDate(start.toISOString().slice(0, 10));
      setToDate(end.toISOString().slice(0, 10));
    }
  };

  // Fetch Analytics Data
  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params = {
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      };

      if (activeTab === 'overview') {
        const res = await analyticsService.getOverview(params);
        setOverviewData(res.data?.data || res.data || null);
      } else if (activeTab === 'reservations') {
        const res = await analyticsService.getReservations(params);
        setReservationsData(res.data?.data || res.data || null);
      } else if (activeTab === 'apartments') {
        const res = await analyticsService.getApartments(params);
        setApartmentsData(res.data?.data || res.data || []);
      } else if (activeTab === 'agents') {
        const res = await analyticsService.getAgents(params);
        setAgentsData(res.data?.data || res.data || []);
      } else if (activeTab === 'operations') {
        const res = await analyticsService.getOperations(params);
        setOperationsData(res.data?.data || res.data || null);
      }
    } catch (err) {
      addToast(`Analytics query failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [activeTab, propertyFilter, fromDate, toDate]);

  // Export Executive PDF
  const handleExportPDF = () => {
    reportService.downloadPDF('financial', `bfa-executive-summary-${Date.now()}.pdf`, {
      propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      fromDate,
      toDate,
    });
    addToast('Executive financial summary PDF generated.', 'success');
  };

  // Export Tab CSV
  const handleExportCSV = () => {
    const reportMapping = {
      overview: 'financial',
      reservations: 'reservations',
      apartments: 'reservations',
      agents: 'agents',
      operations: 'maintenance',
    };
    const reportType = reportMapping[activeTab] || 'financial';
    reportService.downloadCSV(reportType, `bfa-${activeTab}-analytics-${Date.now()}.csv`, {
      propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      fromDate,
      toDate,
    });
    addToast(`Exported ${activeTab} data to CSV.`, 'success');
  };

  const summary = overviewData?.summary || {};

  return (
    <div>
      {/* Page Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>Executive Analytics & Intelligence</span>
            <Badge status="info">PHASE 10 REALTIME</Badge>
          </h1>
          <p className="page-subtitle">
            Property performance, revenue recognition, room yield metrics, channel distribution, and operational health.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={handleExportCSV}>
            📥 Export CSV
          </Button>
          <Button variant="primary" onClick={handleExportPDF}>
            📄 Download Executive PDF
          </Button>
        </div>
      </div>

      {/* Date Range & Scoping Controls Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Quick Preset Buttons */}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.25rem' }}>
              Period:
            </span>
            {['7D', '30D', '90D', 'YTD', 'CUSTOM'].map((preset) => (
              <Button
                key={preset}
                variant={dateRangePreset === preset ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => handlePresetChange(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>

          {/* Date bounds inputs & Property Filter */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setDateRangePreset('CUSTOM');
                }}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setDateRangePreset('CUSTOM');
                }}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                }}
              />
            </div>

            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <Button variant="outline" size="sm" onClick={fetchAnalytics} disabled={loading}>
              🔄 Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Top Executive KPI Cards (6 cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* 1. Net Revenue */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Net Revenue
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {formatNaira(summary.collectedRevenue || summary.totalRevenue || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Gross: {formatNaira(summary.grossCollected || 0)}
          </div>
        </Card>

        {/* 2. Occupancy Rate */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Occupancy Rate
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {summary.occupancyRate ?? 0}%
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {summary.occupiedUnitNights ?? 0} / {summary.totalAvailableUnitNights ?? 0} room nights
          </div>
        </Card>

        {/* 3. ADR */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            ADR (Average Daily Rate)
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatNaira(summary.adr || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Per occupied unit night
          </div>
        </Card>

        {/* 4. RevPAR */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            RevPAR
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: 'var(--brand-accent, #ca8a04)', marginTop: '0.25rem' }}>
            {formatNaira(summary.revPar || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Yield per available night
          </div>
        </Card>

        {/* 5. Net Operating Income */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Net Operating Income (NOI)
          </div>
          <div
            style={{
              fontSize: '1.55rem',
              fontWeight: 700,
              color: (summary.netOperatingIncome ?? 0) >= 0 ? '#10b981' : '#ef4444',
              marginTop: '0.25rem',
            }}
          >
            {formatNaira(summary.netOperatingIncome || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Expenses: {formatNaira(summary.totalExpenses || 0)}
          </div>
        </Card>

        {/* 6. Profit Margin */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Operating Margin
          </div>
          <div
            style={{
              fontSize: '1.55rem',
              fontWeight: 700,
              color: (summary.profitMargin ?? 0) >= 0 ? 'var(--text-primary)' : '#ef4444',
              marginTop: '0.25rem',
            }}
          >
            {summary.profitMargin ?? 0}%
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            NOI / Net Collected
          </div>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <Card style={{ marginBottom: '1.5rem', padding: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'overview', label: '📊 Executive Overview & Trends' },
            { id: 'reservations', label: '📅 Reservations & Channels' },
            { id: 'apartments', label: '🏢 Unit Performance & Yield' },
            { id: 'agents', label: '👥 Agent Leaderboard' },
            { id: 'operations', label: '🛠️ Operations & Maintenance' },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* TAB 1: EXECUTIVE OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Booking Statuses Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
            }}
          >
            <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL BOOKINGS</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.totalBookings ?? 0}</div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ACTIVE IN-HOUSE</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
                {summary.activeStays ?? 0}
              </div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>COMPLETED STAYS</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {summary.completedStays ?? 0}
              </div>
            </div>
            <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CANCELLED STAYS</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
                {summary.cancelledStays ?? 0}
              </div>
            </div>
          </div>

          {/* Daily Trends Table */}
          <Card title="Daily Booking & Revenue Trends in Selected Period">
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Calculating authoritative daily metrics...
              </div>
            ) : !overviewData?.dailyTrends || overviewData.dailyTrends.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No daily reservation activity recorded for this date window.
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bookings Registered</th>
                    <th>Daily Booking Revenue</th>
                    <th>Average Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewData.dailyTrends.map((trend, idx) => {
                    const rev = parseFloat(trend.revenue || 0);
                    const count = parseInt(trend.bookings || 0, 10);
                    const avg = count > 0 ? rev / count : 0;
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{trend.date}</td>
                        <td>{count}</td>
                        <td style={{ fontWeight: 600, color: '#10b981' }}>{formatNaira(rev)}</td>
                        <td>{formatNaira(avg)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: RESERVATIONS & CHANNELS */}
      {activeTab === 'reservations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Key Stay Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Card>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Average Length of Stay (ALOS)
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {reservationsData?.metrics?.averageLengthOfStay ?? 0}{' '}
                <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>nights</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Across non-cancelled reservations
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Average Booking Lead Time
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {reservationsData?.metrics?.averageLeadTimeDays ?? 0}{' '}
                <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>days in advance</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Between booking creation and check-in
              </div>
            </Card>
          </div>

          {/* Booking Sources Distribution */}
          <Card title="Acquisition Channels Distribution">
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Aggregating channel sources...
              </div>
            ) : !reservationsData?.sources || reservationsData.sources.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No channel records available.
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Channel Source</th>
                    <th>Total Bookings</th>
                    <th>Revenue Volume (NGN)</th>
                    <th>Share of Total Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {reservationsData.sources.map((src, idx) => {
                    const totalVol = reservationsData.sources.reduce(
                      (acc, s) => acc + parseFloat(s.volume || 0),
                      0
                    );
                    const vol = parseFloat(src.volume || 0);
                    const pct = totalVol > 0 ? ((vol / totalVol) * 100).toFixed(1) : 0;

                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{src.source}</td>
                        <td>{src.count}</td>
                        <td style={{ fontWeight: 600, color: '#10b981' }}>{formatNaira(vol)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div
                              style={{
                                flex: 1,
                                height: '6px',
                                background: 'var(--border-default)',
                                borderRadius: '3px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: 'var(--brand-accent, #ca8a04)',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '0.8rem', minWidth: '40px' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: UNIT PERFORMANCE & YIELD */}
      {activeTab === 'apartments' && (
        <Card title="Apartment Yield & Unit Performance Breakdown">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Calculating unit revenue yield and RevPAR...
            </div>
          ) : apartmentsData.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No apartment performance data found.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Rate/Night</th>
                  <th>Bookings</th>
                  <th>Occupied</th>
                  <th>Occupancy %</th>
                  <th>RevPAR</th>
                  <th>Revenue Generated</th>
                  <th>Maintenance Cost</th>
                </tr>
              </thead>
              <tbody>
                {apartmentsData.map((unit) => (
                  <tr key={unit.apartment_id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Unit {unit.unit_number}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{unit.unit_name}</div>
                    </td>
                    <td>{unit.property_name}</td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.4rem',
                          background: 'var(--bg-surface)',
                          borderRadius: '4px',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        {unit.unit_type}
                      </span>
                    </td>
                    <td><Badge status={unit.current_status}>{unit.current_status}</Badge></td>
                    <td>{formatNaira(unit.rate_per_night)}</td>
                    <td>{unit.total_bookings}</td>
                    <td>{unit.occupied_nights} nights</td>
                    <td style={{ fontWeight: 600 }}>{unit.occupancy_rate}%</td>
                    <td style={{ fontWeight: 600, color: 'var(--brand-accent)' }}>{formatNaira(unit.rev_par)}</td>
                    <td style={{ fontWeight: 700, color: '#10b981' }}>{formatNaira(unit.revenue_generated)}</td>
                    <td style={{ color: unit.maintenance_cost > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                      {formatNaira(unit.maintenance_cost)}
                      {unit.maintenance_incidents > 0 && (
                        <span style={{ fontSize: '0.72rem', display: 'block' }}>
                          ({unit.maintenance_incidents} issues)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 4: AGENT LEADERBOARD */}
      {activeTab === 'agents' && (
        <Card title="Agent Partner Leaderboard & Volume Attribution">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading agent volume leaderboard...
            </div>
          ) : agentsData.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No agent booking volume recorded in this period.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Rank & Agent</th>
                  <th>Agency</th>
                  <th>Commission Schedule</th>
                  <th>Bookings Brought</th>
                  <th>Total Booking Volume</th>
                  <th>Commission Generated</th>
                  <th>Paid Out</th>
                  <th>Pending Payout</th>
                </tr>
              </thead>
              <tbody>
                {agentsData.map((agent, idx) => (
                  <tr key={agent.agent_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            color: idx === 0 ? '#ca8a04' : idx === 1 ? '#94a3b8' : 'var(--text-muted)',
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{agent.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{agent.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{agent.agency_name || 'Independent'}</td>
                    <td>
                      {agent.commission_type === 'PERCENTAGE'
                        ? `${agent.commission_rate}%`
                        : formatNaira(agent.commission_rate)}
                    </td>
                    <td style={{ fontWeight: 600 }}>{agent.total_bookings}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatNaira(agent.total_volume_brought)}
                    </td>
                    <td style={{ fontWeight: 600, color: '#ca8a04' }}>
                      {formatNaira(agent.total_commission_generated)}
                    </td>
                    <td style={{ color: '#10b981', fontWeight: 600 }}>
                      {formatNaira(agent.paid_commission)}
                    </td>
                    <td style={{ color: '#f59e0b', fontWeight: 600 }}>
                      {formatNaira(agent.pending_commission)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 5: OPERATIONS & MAINTENANCE */}
      {activeTab === 'operations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="Operations & Turnaround Health">
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Querying maintenance and inspection health metrics...
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ACTIVE WORK ORDERS</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
                    {operationsData?.maintenance?.activeCount ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Pending resolution
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>MAINTENANCE EXPENSE</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
                    {formatNaira(operationsData?.maintenance?.totalCost || 0)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Actualized repair costs
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>INSPECTIONS COMPLETED</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {operationsData?.inspections?.completedCount ?? 0}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Check-in & check-out audits
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>INSPECTION PASS RATE</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                    {operationsData?.inspections?.passRate ?? 100}%
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Units cleared for guest stay
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
