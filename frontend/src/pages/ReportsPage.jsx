import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import { reportService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useToast } from '../context/ToastContext';
import { formatNaira } from '../utils/currency';

export default function ReportsPage() {
  const { activePropertyId, activeProperty, isAllProperties } = useProperty();
  const { addToast } = useToast();
  const [reportType, setReportType] = useState('reservations');
  const [financialSummary, setFinancialSummary] = useState(null);
  const [reservationsData, setReservationsData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      if (reportType === 'financial') {
        const res = await reportService.getFinancial({ propertyId: activePropertyId });
        setFinancialSummary(res.data.summary);
        setReservationsData(res.data.reservations);
      } else {
        const res = await reportService.getReservations({ propertyId: activePropertyId });
        setReservationsData(res.data);
      }
      addToast(`Generated ${reportType} report successfully.`, 'success');
    } catch (err) {
      addToast(`Report generation failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [reportType, activePropertyId]);

  const handleDownloadCSV = () => {
    reportService.downloadCSV(reportType, `bfa-${reportType}-report.csv`);
    addToast(`CSV export initiated: bfa-${reportType}-report.csv`, 'success');
  };

  const handleDownloadPDF = () => {
    reportService.downloadPDF('bfa-financial-summary.pdf');
    addToast('PDF generation opened in new tab.', 'success');
  };

  const columns = [
    { header: 'Code', key: 'reservation_code' },
    { header: 'Property', key: 'property_name' },
    { header: 'Unit', key: 'unit_number' },
    { header: 'Tenant', key: 'tenant_name' },
    { header: 'Check-In (1 Night)', key: 'check_in_date' },
    {
      header: 'Total Amount',
      key: 'total_amount',
      render: (val) => formatNaira(val),
    },
    {
      header: 'Paid',
      key: 'paid_amount',
      render: (val) => formatNaira(val),
    },
    {
      header: 'Status',
      key: 'status',
      render: (val) => <Badge status={val}>{val}</Badge>,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span>Reports & Exports</span>
            <Badge status="available">CSV + PDF ACTIVE</Badge>
          </h1>
          <p className="page-subtitle">
            Authoritative reporting engine generated from active database records.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="outline" size="sm" onClick={handleDownloadCSV}>
            📥 Export CSV
          </Button>
          <Button variant="primary" size="sm" onClick={handleDownloadPDF}>
            📄 Download Executive PDF
          </Button>
        </div>
      </div>

      {/* Scoping & Report Selector Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['reservations', 'financial'].map((type) => (
              <Button
                key={type}
                variant={reportType === type ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setReportType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)} Report
              </Button>
            ))}
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Active Scope: <strong style={{ color: 'var(--brand-accent)' }}>{isAllProperties ? 'All Properties' : activeProperty?.name}</strong>
          </div>
        </div>
      </Card>

      {/* Financial Summary Card if financial selected */}
      {reportType === 'financial' && financialSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Card>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Booked Value</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {formatNaira(financialSummary.totalRevenue)}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Collected</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#16a34a', marginTop: '0.25rem' }}>
              {formatNaira(financialSummary.totalCollected)}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Outstanding</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
              {formatNaira(financialSummary.totalOutstanding)}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Net Operating Profit</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-accent)', marginTop: '0.25rem' }}>
              {formatNaira(financialSummary.netProfit)}
            </div>
          </Card>
        </div>
      )}

      {/* Report Data Table */}
      <Card title={`${reportType.toUpperCase()} Authoritative Records`}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Generating report data from MySQL database...
          </div>
        ) : (
          <Table columns={columns} data={reservationsData} emptyMessage="No reservations match the active report criteria." />
        )}
      </Card>
    </div>
  );
}
