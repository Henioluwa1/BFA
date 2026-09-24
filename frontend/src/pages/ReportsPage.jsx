import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import { reportService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useToast } from '../context/ToastContext';
import { formatNaira } from '../utils/currency';

const REPORT_DEFINITIONS = [
  { id: 'reservations', label: 'Reservations', icon: '📅', hasPdf: false },
  { id: 'financial', label: 'Financial Summary', icon: '💰', hasPdf: true },
  { id: 'payments', label: 'Payment Transactions', icon: '💳', hasPdf: false },
  { id: 'expenses', label: 'Operational Expenses', icon: '🧾', hasPdf: false },
  { id: 'agents', label: 'Agent Directory', icon: '👥', hasPdf: false },
  { id: 'commissions', label: 'Agent Commissions', icon: '💼', hasPdf: true },
  { id: 'maintenance', label: 'Maintenance Issues', icon: '🛠️', hasPdf: false },
  { id: 'inspections', label: 'Apartment Inspections', icon: '📋', hasPdf: false },
];

export default function ReportsPage() {
  const { properties, activePropertyId, activeProperty, isAllProperties } = useProperty();
  const { addToast } = useToast();

  const [reportType, setReportType] = useState('reservations');
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);

  // Data states
  const [reportData, setReportData] = useState([]);
  const [financialSummary, setFinancialSummary] = useState(null);

  // Sync with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Fetch report
  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = {
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      };

      let res;
      switch (reportType) {
        case 'financial':
          res = await reportService.getFinancial(params);
          setFinancialSummary(res.data?.data?.summary || res.data?.summary || null);
          setReportData(res.data?.data?.reservations || res.data?.reservations || []);
          break;
        case 'payments':
          res = await reportService.getPayments(params);
          setReportData(res.data?.data || res.data || []);
          break;
        case 'expenses':
          res = await reportService.getExpenses(params);
          setReportData(res.data?.data || res.data || []);
          break;
        case 'agents':
          res = await reportService.getAgents(params);
          setReportData(res.data?.data || res.data || []);
          break;
        case 'commissions':
          res = await reportService.getCommissions(params);
          setReportData(res.data?.data || res.data || []);
          break;
        case 'maintenance':
          res = await reportService.getMaintenance(params);
          setReportData(res.data?.data || res.data || []);
          break;
        case 'inspections':
          res = await reportService.getInspections(params);
          setReportData(res.data?.data || res.data || []);
          break;
        case 'reservations':
        default:
          res = await reportService.getReservations(params);
          setReportData(res.data?.data || res.data || []);
          break;
      }
    } catch (err) {
      addToast(`Report generation failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, propertyFilter, fromDate, toDate]);

  // Download Handlers
  const handleDownloadCSV = () => {
    const filename = `bfa-${reportType}-report-${Date.now()}.csv`;
    const params = {
      propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };
    reportService.downloadCSV(reportType, filename, params);
    addToast(`CSV export initiated: ${filename}`, 'success');
  };

  const handleDownloadPDF = (type = reportType) => {
    const targetType = type === 'commissions' ? 'commissions' : 'financial';
    const filename = `bfa-${targetType}-report-${Date.now()}.pdf`;
    const params = {
      propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };
    reportService.downloadPDF(targetType, filename, params);
    addToast(`PDF report opened in viewer.`, 'success');
  };

  // Status Badge Helper
  const renderStatus = (val) => {
    if (!val) return '—';
    const s = String(val).toUpperCase();
    if (['CONFIRMED', 'SUCCESS', 'PAID', 'APPROVED', 'RESOLVED', 'PASSED'].includes(s)) {
      return <Badge status="success">{val}</Badge>;
    }
    if (['CHECKED_IN', 'IN_PROGRESS', 'PENDING', 'CALCULATED'].includes(s)) {
      return <Badge status="pending">{val}</Badge>;
    }
    if (['CANCELLED', 'VOIDED', 'FAILED', 'HIGH', 'CRITICAL'].includes(s)) {
      return <Badge status="danger">{val}</Badge>;
    }
    return <Badge status="neutral">{val}</Badge>;
  };

  // Columns definition tailored to active report type
  const columns = useMemo(() => {
    switch (reportType) {
      case 'reservations':
        return [
          { header: 'Code', key: 'reservation_code' },
          { header: 'Property', key: 'property_name' },
          { header: 'Unit', key: 'unit_number' },
          { header: 'Tenant / Guest', key: 'tenant_name' },
          { header: 'Agent Partner', key: 'agent_name', render: (val) => val || 'Direct' },
          { header: 'Check-In', key: 'check_in_date' },
          { header: 'Check-Out', key: 'check_out_date' },
          { header: 'Total Value', key: 'total_amount', render: (val) => formatNaira(val) },
          { header: 'Collected', key: 'paid_amount', render: (val) => formatNaira(val) },
          { header: 'Status', key: 'status', render: renderStatus },
        ];
      case 'financial':
        return [
          { header: 'Reservation Code', key: 'reservation_code' },
          { header: 'Property', key: 'property_name' },
          { header: 'Tenant', key: 'tenant_name' },
          { header: 'Check-In', key: 'check_in_date' },
          { header: 'Booked Amount', key: 'total_amount', render: (val) => formatNaira(val) },
          { header: 'Paid Amount', key: 'paid_amount', render: (val) => formatNaira(val) },
          { header: 'Status', key: 'status', render: renderStatus },
        ];
      case 'payments':
        return [
          { header: 'Reference', key: 'transaction_reference' },
          { header: 'Reservation', key: 'reservation_code' },
          { header: 'Tenant', key: 'tenant_name' },
          { header: 'Property', key: 'property_name' },
          { header: 'Amount', key: 'amount', render: (val) => formatNaira(val) },
          { header: 'Method', key: 'payment_method' },
          { header: 'Refunded', key: 'refund_amount', render: (val) => (val > 0 ? formatNaira(val) : '—') },
          { header: 'Status', key: 'status', render: renderStatus },
        ];
      case 'expenses':
        return [
          { header: 'Code', key: 'expense_code' },
          { header: 'Property', key: 'property_name' },
          { header: 'Category', key: 'category' },
          { header: 'Description', key: 'description' },
          { header: 'Vendor / Payee', key: 'vendor_payee', render: (val) => val || '—' },
          { header: 'Amount', key: 'amount', render: (val) => formatNaira(val) },
          { header: 'Method', key: 'payment_method' },
          { header: 'Expense Date', key: 'expense_date' },
          { header: 'Status', key: 'status', render: renderStatus },
        ];
      case 'agents':
        return [
          { header: 'Agent Name', key: 'name' },
          { header: 'Agency', key: 'agency_name', render: (val) => val || 'Independent' },
          { header: 'Email', key: 'email' },
          { header: 'Phone', key: 'phone' },
          {
            header: 'Commission Schedule',
            key: 'commission_rate',
            render: (val, row) =>
              row.commission_type === 'PERCENTAGE' ? `${val}%` : formatNaira(val),
          },
          { header: 'Bookings', key: 'total_bookings' },
          { header: 'Total Volume', key: 'total_volume', render: (val) => formatNaira(val) },
          { header: 'Paid Commission', key: 'total_commission', render: (val) => formatNaira(val) },
          { header: 'Status', key: 'status', render: renderStatus },
        ];
      case 'commissions':
        return [
          { header: 'Code', key: 'commission_code' },
          { header: 'Agent', key: 'agent_name' },
          { header: 'Agency', key: 'agency_name', render: (val) => val || '—' },
          { header: 'Reservation', key: 'reservation_code' },
          { header: 'Property', key: 'property_name' },
          { header: 'Booking Amount', key: 'booking_amount', render: (val) => formatNaira(val) },
          {
            header: 'Rate',
            key: 'commission_rate',
            render: (val, row) =>
              row.commission_type === 'PERCENTAGE' ? `${val}%` : formatNaira(val),
          },
          { header: 'Commission Amount', key: 'commission_amount', render: (val) => formatNaira(val) },
          { header: 'Payout Ref', key: 'payment_reference', render: (val) => val || '—' },
          { header: 'Status', key: 'status', render: renderStatus },
        ];
      case 'maintenance':
        return [
          { header: 'Code', key: 'issue_code' },
          { header: 'Title', key: 'issue_title' },
          { header: 'Property', key: 'property_name' },
          { header: 'Unit', key: 'unit_number' },
          { header: 'Category', key: 'category' },
          { header: 'Priority', key: 'priority', render: renderStatus },
          { header: 'Estimated Cost', key: 'estimated_cost', render: (val) => formatNaira(val) },
          { header: 'Actual Cost', key: 'actual_cost', render: (val) => formatNaira(val) },
          { header: 'Assigned To', key: 'assigned_to', render: (val) => val || '—' },
          { header: 'Status', key: 'status', render: renderStatus },
        ];
      case 'inspections':
        return [
          { header: 'Code', key: 'inspection_code' },
          { header: 'Property', key: 'property_name' },
          { header: 'Unit', key: 'unit_number' },
          { header: 'Type', key: 'inspection_type' },
          { header: 'Condition Rating', key: 'condition_rating', render: (val) => `${val} / 5` },
          { header: 'Inspector', key: 'inspector_name', render: (val) => val || '—' },
          { header: 'Date', key: 'created_at' },
          { header: 'Status', key: 'status', render: renderStatus },
        ];
      default:
        return [];
    }
  }, [reportType]);

  const activeDef = REPORT_DEFINITIONS.find((d) => d.id === reportType) || REPORT_DEFINITIONS[0];

  return (
    <div>
      {/* Header */}
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
            <span>Reports & Exports</span>
            <Badge status="available">CSV + PDF ACTIVE</Badge>
          </h1>
          <p className="page-subtitle">
            Authoritative reporting engine generated from live MariaDB/MySQL database records.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={handleDownloadCSV}>
            📥 Export {activeDef.label} (CSV)
          </Button>
          {(reportType === 'financial' || reportType === 'commissions') && (
            <Button variant="primary" onClick={() => handleDownloadPDF(reportType)}>
              📄 Download {reportType === 'commissions' ? 'Commissions' : 'Executive'} PDF
            </Button>
          )}
        </div>
      </div>

      {/* Report Categories Tabs */}
      <Card style={{ marginBottom: '1.5rem', padding: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {REPORT_DEFINITIONS.map((def) => (
            <Button
              key={def.id}
              variant={reportType === def.id ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setReportType(def.id)}
            >
              {def.icon} {def.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* Filters Bar */}
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
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Property Selector */}
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Date Pickers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
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
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
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

            {(fromDate || toDate) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
              >
                Clear Dates
              </Button>
            )}
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Active Scope:{' '}
            <strong style={{ color: 'var(--brand-accent, #ca8a04)' }}>
              {propertyFilter === 'all' ? 'All Properties' : properties.find((p) => String(p.id) === String(propertyFilter))?.name}
            </strong>
          </div>
        </div>
      </Card>

      {/* Financial Summary Cards if Financial selected */}
      {reportType === 'financial' && financialSummary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <Card>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Total Booked Value
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {formatNaira(financialSummary.totalRevenue)}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Gross Collected
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#16a34a', marginTop: '0.25rem' }}>
              {formatNaira(financialSummary.grossCollected || financialSummary.totalCollected)}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Processed Refunds
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
              {formatNaira(financialSummary.totalRefunded || 0)}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Net Operating Profit
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-accent, #ca8a04)', marginTop: '0.25rem' }}>
              {formatNaira(financialSummary.netProfit)}
            </div>
          </Card>
        </div>
      )}

      {/* Interactive Report Records Table */}
      <Card title={`${activeDef.label} Records (${reportData.length})`}>
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Querying authoritative records from MariaDB database...
          </div>
        ) : reportData.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No records match the active report parameters.
          </div>
        ) : (
          <Table columns={columns} data={reportData} />
        )}
      </Card>
    </div>
  );
}
