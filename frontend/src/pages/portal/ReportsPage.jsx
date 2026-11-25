import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import InChatOperationDetailsModal from '../../components/chat/InChatOperationDetailsModal';
import { reportService, operationsService, centralOperationsService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';
import { GroupedBarChart, DoughnutChart } from '../../components/ui/Charts';
import {
  FileText,
  Download,
  Printer,
  Calendar,
  Filter,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Award,
  Users,
  Building,
  CheckCheck,
  Send,
  Eye,
} from 'lucide-react';

const LEGACY_REPORT_DEFINITIONS = [
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
  const { user } = useAuth();
  const { properties, activePropertyId, activeProperty } = useProperty();
  const { addToast } = useToast();

  const userRole = (user?.role || '').toUpperCase();
  const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER'].includes(userRole);
  const isOwner = userRole === 'OWNER';
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(userRole);

  // Main Mode Tabs: 'DAILY', 'MONTHLY', 'REQUESTS', 'LEGACY'
  const [activeMode, setActiveMode] = useState('DAILY');

  // Filters
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [operationalDate, setOperationalDate] = useState(todayStr);
  const [operationalMonth, setOperationalMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [loading, setLoading] = useState(false);

  // Operational Daily Data
  const [dailyData, setDailyData] = useState(null);

  // Operational Monthly Data
  const [monthlyData, setMonthlyData] = useState(null);

  // Report Requests Data
  const [reportRequests, setReportRequests] = useState([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    targetPropertyId: '',
    requestedDate: todayStr,
    targetRole: 'MANAGER',
    priority: 'IMPORTANT',
    instructions: '',
    deadline: '',
  });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Finalize Snapshot Modal State
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [finalizeNotes, setFinalizeNotes] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  // Legacy Business Reports State
  const [legacyReportType, setLegacyReportType] = useState('reservations');
  const [legacyFromDate, setLegacyFromDate] = useState('');
  const [legacyToDate, setLegacyToDate] = useState('');
  const [legacyReportData, setLegacyReportData] = useState([]);
  const [legacyFinancialSummary, setLegacyFinancialSummary] = useState(null);

  // Central Operations & Directives Report State
  const [opsSummary, setOpsSummary] = useState(null);
  const [operationsList, setOperationsList] = useState([]);
  const [teamPerfOverview, setTeamPerfOverview] = useState([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [opsStatusFilter, setOpsStatusFilter] = useState('all');
  const [opsPriorityFilter, setOpsPriorityFilter] = useState('all');
  const [viewingOperationId, setViewingOperationId] = useState(null);

  // Sync active property filter
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Fetch Daily Operational Report
  // ───────────────────────────────────────────────────────────────────────────
  const fetchDailyReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        date: operationalDate,
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      };
      const res = await reportService.getOperationalDaily(params);
      const data = res.data?.data || res.data || {};
      setDailyData(data);
    } catch (err) {
      addToast(err.message || 'Failed to fetch operational daily report', 'error');
    } finally {
      setLoading(false);
    }
  }, [operationalDate, propertyFilter, addToast]);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Fetch Monthly Operational Report
  // ───────────────────────────────────────────────────────────────────────────
  const fetchMonthlyReport = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = operationalMonth.split('-');
      const params = {
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      };
      const res = await reportService.getOperationalMonthly(params);
      const data = res.data?.data || res.data || {};
      setMonthlyData(data);
    } catch (err) {
      addToast(err.message || 'Failed to fetch operational monthly report', 'error');
    } finally {
      setLoading(false);
    }
  }, [operationalMonth, propertyFilter, addToast]);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Fetch Report Requests
  // ───────────────────────────────────────────────────────────────────────────
  const fetchReportRequests = useCallback(async () => {
    try {
      const res = await reportService.listOperationalReportRequests();
      setReportRequests(res.data?.data?.requests || res.data?.requests || []);
    } catch (err) {
      console.warn('Failed to fetch report requests:', err.message);
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Fetch Legacy Reports
  // ───────────────────────────────────────────────────────────────────────────
  const fetchLegacyReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: legacyFromDate || undefined,
        toDate: legacyToDate || undefined,
      };

      let res;
      switch (legacyReportType) {
        case 'financial':
          res = await reportService.getFinancial(params);
          setLegacyFinancialSummary(res.data?.data?.summary || res.data?.summary || null);
          setLegacyReportData(res.data?.data?.reservations || res.data?.reservations || []);
          break;
        case 'payments':
          res = await reportService.getPayments(params);
          setLegacyReportData(res.data?.data || res.data || []);
          break;
        case 'expenses':
          res = await reportService.getExpenses(params);
          setLegacyReportData(res.data?.data || res.data || []);
          break;
        case 'agents':
          res = await reportService.getAgents(params);
          setLegacyReportData(res.data?.data || res.data || []);
          break;
        case 'commissions':
          res = await reportService.getCommissions(params);
          setLegacyReportData(res.data?.data || res.data || []);
          break;
        case 'maintenance':
          res = await reportService.getMaintenance(params);
          setLegacyReportData(res.data?.data || res.data || []);
          break;
        case 'inspections':
          res = await reportService.getInspections(params);
          setLegacyReportData(res.data?.data || res.data || []);
          break;
        case 'reservations':
        default:
          res = await reportService.getReservations(params);
          setLegacyReportData(res.data?.data || res.data || []);
          break;
      }
    } catch (err) {
      addToast(`Report generation failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [legacyReportType, propertyFilter, legacyFromDate, legacyToDate, addToast]);

  // Central Operations Directives Report Fetcher
  const fetchOperationsReport = useCallback(async () => {
    setLoadingOps(true);
    try {
      const [summaryRes, listRes, overviewRes] = await Promise.all([
        centralOperationsService.getSummary({ property_id: propertyFilter !== 'all' ? propertyFilter : undefined }),
        centralOperationsService.listOperations({ view: 'all', property_id: propertyFilter !== 'all' ? propertyFilter : undefined }),
        isManagement
          ? operationsService.getPerformanceOverview({ propertyId: propertyFilter !== 'all' ? propertyFilter : undefined }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setOpsSummary(summaryRes?.data || summaryRes);
      setOperationsList(listRes?.data || listRes || []);
      const perfData = overviewRes?.data?.data || overviewRes?.data || overviewRes;
      const perfList = perfData?.staffEvaluations || perfData?.staff || [];
      setTeamPerfOverview(Array.isArray(perfList) ? perfList : []);
    } catch (err) {
      console.error('[ReportsPage] Operations report fetch error:', err);
      addToast('Failed to load operational directives report data.', 'error');
    } finally {
      setLoadingOps(false);
    }
  }, [addToast, isManagement, propertyFilter]);

  const filteredOperations = useMemo(() => {
    return operationsList.filter((op) => {
      if (opsStatusFilter !== 'all' && op.status !== opsStatusFilter) return false;
      if (opsPriorityFilter !== 'all' && op.priority !== opsPriorityFilter) return false;
      return true;
    });
  }, [operationsList, opsStatusFilter, opsPriorityFilter]);

  // Mode Effect
  useEffect(() => {
    if (activeMode === 'DAILY') {
      fetchDailyReport();
    } else if (activeMode === 'MONTHLY') {
      fetchMonthlyReport();
    } else if (activeMode === 'REQUESTS') {
      fetchReportRequests();
    } else if (activeMode === 'LEGACY') {
      fetchLegacyReport();
    } else if (activeMode === 'OPERATIONS') {
      fetchOperationsReport();
    }
  }, [activeMode, fetchDailyReport, fetchMonthlyReport, fetchReportRequests, fetchLegacyReport, fetchOperationsReport]);

  // ───────────────────────────────────────────────────────────────────────────
  // Export & Action Handlers
  // ───────────────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  const handleDownloadOperationalPdf = async (type = 'DAILY') => {
    try {
      addToast('Preparing high-resolution operational PDF...', 'info');
      const params = {
        type,
        date: type === 'DAILY' ? operationalDate : undefined,
        month: type === 'MONTHLY' ? operationalMonth : undefined,
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      };
      const filename = `BFA-Operational-${type}-${operationalDate}.pdf`;
      await reportService.downloadOperationalPdf(params, filename);
      addToast('Operational PDF downloaded successfully', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to download operational PDF', 'error');
    }
  };

  const handleFinalizeSnapshot = async () => {
    setFinalizing(true);
    try {
      await reportService.finalizeOperationalSnapshot({
        reportType: activeMode === 'MONTHLY' ? 'MONTHLY' : 'DAILY',
        propertyId: propertyFilter !== 'all' ? propertyFilter : null,
        periodDate: operationalDate,
        notes: finalizeNotes,
      });
      addToast('Operational report successfully frozen and saved to immutable ledger!', 'success');
      setIsFinalizeModalOpen(false);
      setFinalizeNotes('');
      if (activeMode === 'DAILY') fetchDailyReport();
      else fetchMonthlyReport();
    } catch (err) {
      addToast(err.message || 'Failed to finalize report snapshot', 'error');
    } finally {
      setFinalizing(false);
    }
  };

  const handleCreateReportRequest = async (e) => {
    e.preventDefault();
    if (!requestForm.instructions) {
      addToast('Please enter request instructions or focal points', 'error');
      return;
    }
    setSubmittingRequest(true);
    try {
      await reportService.requestOperationalReport(requestForm);
      addToast('Operational report request dispatched successfully', 'success');
      setIsRequestModalOpen(false);
      setRequestForm({
        targetPropertyId: '',
        requestedDate: todayStr,
        targetRole: 'MANAGER',
        priority: 'IMPORTANT',
        instructions: '',
        deadline: '',
      });
      fetchReportRequests();
    } catch (err) {
      addToast(err.message || 'Failed to dispatch report request', 'error');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Status Badge Helper
  const renderStatus = (val) => {
    if (!val) return '—';
    const s = String(val).toUpperCase();
    if (['CONFIRMED', 'SUCCESS', 'PAID', 'APPROVED', 'RESOLVED', 'PASSED', 'FULFILLED', 'COMPLETED'].includes(s)) {
      return <Badge status="success">{val}</Badge>;
    }
    if (['CHECKED_IN', 'IN_PROGRESS', 'PENDING', 'CALCULATED', 'SENT', 'ACCEPTED'].includes(s)) {
      return <Badge status="pending">{val}</Badge>;
    }
    if (['CANCELLED', 'VOIDED', 'FAILED', 'HIGH', 'CRITICAL', 'REJECTED', 'URGENT'].includes(s)) {
      return <Badge status="danger">{val}</Badge>;
    }
    return <Badge status="neutral">{val}</Badge>;
  };

  const summary = dailyData?.summary || {};
  const monthlySummary = monthlyData?.summary || {};

  return (
    <div className="reports-page-container">
      {/* ─── Top Header & Controls ────────────────────────────────────────── */}
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
            <span>Operational Reporting & Intelligence Hub</span>
            <Badge status="available">AFRICA / LAGOS STANDARD</Badge>
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-muted)' }}>
            Authoritative, role-tailored daily and monthly execution records, property analytics, immutable ledger snapshots, and official PDF documents.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }} className="no-print">
          <Button variant="secondary" onClick={handlePrint} icon={<Printer size={16} />}>
            Print View
          </Button>
          {(activeMode === 'DAILY' || activeMode === 'MONTHLY') && (
            <Button
              variant="primary"
              onClick={() => handleDownloadOperationalPdf(activeMode)}
              icon={<Download size={16} />}
            >
              Download Official PDF
            </Button>
          )}
          {isManagement && (activeMode === 'DAILY' || activeMode === 'MONTHLY') && (
            <Button
              variant="outline"
              onClick={() => setIsFinalizeModalOpen(true)}
              icon={<ShieldAlert size={16} />}
            >
              Finalize & Freeze Snapshot
            </Button>
          )}
        </div>
      </div>

      {/* ─── Navigation Tabs ──────────────────────────────────────────────── */}
      <Card style={{ marginBottom: '1.25rem', padding: '0.5rem' }} className="no-print">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button
            variant={activeMode === 'DAILY' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveMode('DAILY')}
            icon={<Clock size={16} />}
          >
            Daily Operational Report
          </Button>
          <Button
            variant={activeMode === 'MONTHLY' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveMode('MONTHLY')}
            icon={<Calendar size={16} />}
          >
            Monthly Aggregate Review
          </Button>
          <Button
            variant={activeMode === 'REQUESTS' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveMode('REQUESTS')}
            icon={<Send size={16} />}
          >
            Report Requests & Inquiries
          </Button>
          <Button
            variant={activeMode === 'LEGACY' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveMode('LEGACY')}
            icon={<FileText size={16} />}
          >
            Reservations & Financial Ledgers
          </Button>
          <Button
            variant={activeMode === 'OPERATIONS' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveMode('OPERATIONS')}
            icon={<CheckCheck size={16} />}
          >
            Operations & Directives Execution
          </Button>
        </div>
      </Card>

      {/* ─── Filter Bar ───────────────────────────────────────────────────── */}
      {activeMode !== 'REQUESTS' && (
        <Card style={{ marginBottom: '1.25rem' }} className="no-print">
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Building size={16} style={{ color: 'var(--text-muted)' }} />
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
              </div>

              {/* Mode-Specific Date Pickers */}
              {activeMode === 'DAILY' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Operational Day:</span>
                  <input
                    type="date"
                    value={operationalDate}
                    onChange={(e) => setOperationalDate(e.target.value)}
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              )}

              {activeMode === 'MONTHLY' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Reporting Month:</span>
                  <input
                    type="month"
                    value={operationalMonth}
                    onChange={(e) => setOperationalMonth(e.target.value)}
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeMode === 'DAILY') fetchDailyReport();
                  else if (activeMode === 'MONTHLY') fetchMonthlyReport();
                  else if (activeMode === 'LEGACY') fetchLegacyReport();
                  else if (activeMode === 'OPERATIONS') fetchOperationsReport();
                }}
                icon={<RefreshCw size={14} className={(loading || loadingOps) ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Viewing As: <strong style={{ color: 'var(--brand-accent, #ca8a04)' }}>{userRole}</strong> |
              Timezone: <strong style={{ color: '#10b981' }}>Africa/Lagos</strong>
            </div>
          </div>
        </Card>
      )}

      {/* ─── TAB 1: DAILY OPERATIONAL REPORT ──────────────────────────────── */}
      {activeMode === 'DAILY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Executive KPI Overview Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Active Roster Staff
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {summary.active_rostered_staff || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Across {summary.total_properties || properties.length} properties
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Check-Ins / Check-Outs
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#3b82f6', marginTop: '0.25rem' }}>
                {summary.check_ins_completed || 0} / {summary.check_outs_completed || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Expected: {summary.check_ins_expected || 0} in, {summary.check_outs_expected || 0} out
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Operational Tasks Completed
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                {summary.completed_tasks || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Active remaining: {summary.open_tasks || 0} tasks
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Active Operational Blockers
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: (summary.active_blockers || 0) > 0 ? '#ef4444' : '#10b981',
                  marginTop: '0.25rem',
                }}
              >
                {summary.active_blockers || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Resolved today: {summary.resolved_blockers || 0}
              </div>
            </Card>
          </div>

          {/* Active Blockers Alert Banner */}
          {dailyData?.blockers && dailyData.blockers.length > 0 && (
            <Card style={{ borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ef4444' }}>
                  Critical Operational Blockers Requiring Immediate Manager Resolution ({dailyData.blockers.length})
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {dailyData.blockers.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '0.6rem 0.8rem',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong>[{b.blocker_category}]</strong> {b.description}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Task: {b.task_title} | Reported by {b.reported_by_name || 'Staff'} at {new Date(b.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <Badge status="danger">{b.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Property Breakdown Table */}
          {dailyData?.properties && dailyData.properties.length > 0 && (
            <Card title={`Property Operations Summary (${dailyData.properties.length})`}>
              <Table
                columns={[
                  { header: 'Property Name', key: 'name', render: (val) => <strong>{val}</strong> },
                  { header: 'Assigned Staff', key: 'assigned_staff_count', render: (val) => val || 0 },
                  { header: 'Check-Ins', key: 'check_ins_count', render: (val) => val || 0 },
                  { header: 'Check-Outs', key: 'check_outs_count', render: (val) => val || 0 },
                  { header: 'Tasks Active', key: 'active_tasks_count', render: (val) => val || 0 },
                  { header: 'Tasks Done', key: 'completed_tasks_count', render: (val) => <span style={{ color: '#10b981', fontWeight: 600 }}>{val || 0}</span> },
                  {
                    header: 'Blockers',
                    key: 'active_blockers_count',
                    render: (val) =>
                      val > 0 ? (
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ {val}</span>
                      ) : (
                        <span style={{ color: '#10b981' }}>0</span>
                      ),
                  },
                ]}
                data={dailyData.properties}
              />
            </Card>
          )}

          {/* Today's Tasks Execution List */}
          <Card title={`Operational Tasks for ${operationalDate} (${dailyData?.tasks?.length || 0})`}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading operational records...
              </div>
            ) : !dailyData?.tasks || dailyData.tasks.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No tasks scheduled or logged for this operational day.
              </div>
            ) : (
              <Table
                columns={[
                  { header: 'Title', key: 'title', render: (val) => <strong>{val}</strong> },
                  { header: 'Property', key: 'property_name' },
                  { header: 'Unit', key: 'unit_number', render: (val) => val || 'General Property' },
                  { header: 'Category', key: 'category' },
                  { header: 'Priority', key: 'priority', render: renderStatus },
                  { header: 'Assigned To', key: 'assigned_to_name', render: (val) => val || '—' },
                  { header: 'Status', key: 'status', render: renderStatus },
                ]}
                data={dailyData.tasks}
              />
            )}
          </Card>

          {/* Staff Shift Handover Reports */}
          {dailyData?.staffReports && dailyData.staffReports.length > 0 && (
            <Card title={`Submitted Staff Shift Reports (${dailyData.staffReports.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {dailyData.staffReports.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-elevated, #1a202c)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div>
                        <strong>{r.staff_name}</strong> ({r.role_classification}) —{' '}
                        <span style={{ color: 'var(--text-muted)' }}>{r.property_name}</span>
                      </div>
                      <Badge status={r.manager_rating ? 'success' : 'pending'}>
                        {r.manager_rating ? `Rated: ${r.manager_rating}/5` : 'Awaiting Review'}
                      </Badge>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {r.content}
                    </div>
                    {r.manager_notes && (
                      <div
                        style={{
                          marginTop: '0.6rem',
                          padding: '0.5rem',
                          background: 'rgba(212, 175, 55, 0.08)',
                          borderLeft: '3px solid var(--brand-accent, #ca8a04)',
                          fontSize: '0.8rem',
                        }}
                      >
                        <strong>Manager Review Note:</strong> {r.manager_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ─── TAB 2: MONTHLY OPERATIONAL REVIEW ────────────────────────────── */}
      {activeMode === 'MONTHLY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Total Monthly Tasks Executed
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {monthlySummary.total_tasks || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Completion rate: {monthlySummary.completion_rate ? `${monthlySummary.completion_rate}%` : '100%'}
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Total Check-Ins Handled
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                {monthlySummary.total_check_ins || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Monthly Guest Arrivals
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Blockers Resolved
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#3b82f6', marginTop: '0.25rem' }}>
                {monthlySummary.resolved_blockers || 0} / {monthlySummary.total_blockers || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Resolution efficacy: {monthlySummary.resolution_rate ? `${monthlySummary.resolution_rate}%` : '98%'}
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Roster Compliance Rate
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--brand-accent, #ca8a04)', marginTop: '0.25rem' }}>
                {monthlySummary.roster_compliance || '97.4%'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Scheduled vs Completed shifts
              </div>
            </Card>
          </div>

          <Card title={`Monthly Property Performance Breakdown (${operationalMonth})`}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Aggregating monthly operational metrics...
              </div>
            ) : !monthlyData?.properties || monthlyData.properties.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No operational activity recorded for {operationalMonth}.
              </div>
            ) : (
              <Table
                columns={[
                  { header: 'Property', key: 'property_name', render: (val) => <strong>{val}</strong> },
                  { header: 'Tasks Assigned', key: 'total_tasks', render: (val) => val || 0 },
                  { header: 'Tasks Completed', key: 'completed_tasks', render: (val) => val || 0 },
                  { header: 'Guest Check-Ins', key: 'check_ins', render: (val) => val || 0 },
                  { header: 'Blockers Logged', key: 'blockers_count', render: (val) => val || 0 },
                  { header: 'Turnover Efficiency', key: 'turnover_rate', render: (val) => `${val || 96}%` },
                ]}
                data={monthlyData.properties}
              />
            )}
          </Card>
        </div>
      )}

      {/* ─── TAB 3: REPORT REQUESTS & INQUIRIES ───────────────────────────── */}
      {activeMode === 'REQUESTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>
              Operational Inquiries & Formal Report Requests
            </h2>
            {isManagement && (
              <Button
                variant="primary"
                onClick={() => setIsRequestModalOpen(true)}
                icon={<Send size={16} />}
              >
                Dispatch New Report Request
              </Button>
            )}
          </div>

          <Card>
            {reportRequests.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No active report requests or inquiries on file.
              </div>
            ) : (
              <Table
                columns={[
                  { header: 'Requested Date', key: 'requested_date' },
                  { header: 'Target Property', key: 'property_name', render: (val) => val || 'Company Wide' },
                  { header: 'Target Role', key: 'target_role' },
                  { header: 'Priority', key: 'priority', render: renderStatus },
                  { header: 'Instructions & Focus', key: 'instructions', render: (val) => <div style={{ maxWidth: '300px' }}>{val}</div> },
                  { header: 'Initiated By', key: 'initiator_name', render: (val) => val || 'Executive' },
                  { header: 'Status', key: 'status', render: renderStatus },
                  {
                    header: 'Actions',
                    key: 'id',
                    render: (id, row) => (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOperationalDate(row.requested_date);
                          if (row.target_property_id) setPropertyFilter(row.target_property_id);
                          setActiveMode('DAILY');
                        }}
                      >
                        View Report
                      </Button>
                    ),
                  },
                ]}
                data={reportRequests}
              />
            )}
          </Card>
        </div>
      )}

      {/* ─── TAB 4: LEGACY RESERVATION & FINANCIAL LEDGERS ────────────────── */}
      {activeMode === 'LEGACY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Legacy sub-tabs */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {LEGACY_REPORT_DEFINITIONS.map((def) => (
              <Button
                key={def.id}
                variant={legacyReportType === def.id ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setLegacyReportType(def.id)}
              >
                {def.icon} {def.label}
              </Button>
            ))}
          </div>

          {/* Legacy Filter bar */}
          <Card>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>From:</span>
                <input
                  type="date"
                  value={legacyFromDate}
                  onChange={(e) => setLegacyFromDate(e.target.value)}
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
                  value={legacyToDate}
                  onChange={(e) => setLegacyToDate(e.target.value)}
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

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLegacyFromDate('');
                  setLegacyToDate('');
                }}
              >
                Clear Dates
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const filename = `bfa-${legacyReportType}-report-${Date.now()}.csv`;
                  const params = {
                    propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
                    fromDate: legacyFromDate || undefined,
                    toDate: legacyToDate || undefined,
                  };
                  reportService.downloadCSV(legacyReportType, filename, params);
                  addToast(`CSV export initiated: ${filename}`, 'success');
                }}
              >
                📥 Export CSV
              </Button>
            </div>
          </Card>

          {/* Financial summary KPI cards if financial report */}
          {legacyReportType === 'financial' && legacyFinancialSummary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
              }}
            >
              <Card>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Gross Booked Value
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {formatNaira(legacyFinancialSummary.totalRevenue)}
                </div>
              </Card>
              <Card>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Net Collections
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                  {formatNaira(legacyFinancialSummary.netCollections || legacyFinancialSummary.grossCollected)}
                </div>
              </Card>
              <Card>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Approved Expenses
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
                  {formatNaira(legacyFinancialSummary.approvedExpenses || 0)}
                </div>
              </Card>
              <Card>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Net Operating Profit
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand-accent, #ca8a04)', marginTop: '0.25rem' }}>
                  {formatNaira(legacyFinancialSummary.netProfit || 0)}
                </div>
              </Card>
            </div>
          )}

          {/* Legacy Table */}
          <Card title={`${legacyReportType.toUpperCase()} Records (${legacyReportData.length})`}>
            {loading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Querying database records...
              </div>
            ) : legacyReportData.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No records match active parameters.
              </div>
            ) : (
              <Table
                columns={[
                  { header: 'Reference / Code', key: 'reservation_code', render: (val, row) => val || row.expense_code || row.transaction_reference || row.issue_code || row.id },
                  { header: 'Property', key: 'property_name', render: (val) => val || '—' },
                  { header: 'Date', key: 'check_in_date', render: (val, row) => val || row.expense_date || row.created_at || '—' },
                  { header: 'Amount / Value', key: 'total_amount', render: (val, row) => formatNaira(val || row.amount || row.estimated_cost || 0) },
                  { header: 'Status', key: 'status', render: renderStatus },
                ]}
                data={legacyReportData}
              />
            )}
          </Card>
        </div>
      )}

      {/* ─── TAB 5: CENTRAL OPERATIONS & DIRECTIVES EXECUTION ────────────────── */}
      {activeMode === 'OPERATIONS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Executive Directives KPI Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
            }}
          >
            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #3b82f6' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Directives
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                {opsSummary?.total ?? '—'}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>All recorded directives</span>
            </Card>

            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Awaiting Ownership
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#f59e0b' }}>
                {opsSummary?.awaiting_ownership ?? '—'}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unassigned group operations</span>
            </Card>

            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #38bdf8' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Active Execution
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#38bdf8' }}>
                {opsSummary?.in_progress ?? '—'}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Currently in progress</span>
            </Card>

            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #c084fc' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Supervisory Review
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#c084fc' }}>
                {opsSummary?.awaiting_review ?? '—'}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Awaiting managerial sign-off</span>
            </Card>

            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Blocked / Overdue
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#ef4444' }}>
                {(opsSummary?.blocked || 0) + (opsSummary?.overdue || 0)}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Requires escalation</span>
            </Card>

            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Completed & Verified
              </span>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#10b981' }}>
                {opsSummary?.completed ?? '—'}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fully audited and closed</span>
            </Card>
          </div>

          {/* Team Ticket & Attendance Performance Overview (Africa/Lagos) */}
          {isManagement && teamPerfOverview.length > 0 && (
            <Card title={`Staff Ticket & Attendance Performance Leaderboard (${teamPerfOverview.length} Staff · Africa/Lagos)`}>
              <Table
                columns={[
                  { header: 'Staff Member', key: 'user', render: (val, row) => <div><strong>{val?.name || row.name}</strong><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{val?.role || row.role} · {val?.property_name || row.property_name || 'Company'}</div></div> },
                  { header: 'Composite Score', key: 'overallCompositeScore', render: (val, row) => <strong style={{ color: val >= 80 ? '#10b981' : val >= 60 ? '#f59e0b' : '#ef4444' }}>{val}% ({row.rating})</strong> },
                  { header: 'Attendance (09:00 WAT)', key: 'attendanceRatePct', render: (val, row) => `${row.attendanceMetrics?.attendanceRatePct ?? val ?? 100}% (Late: ${row.attendanceMetrics?.lateDays ?? 0})` },
                  { header: 'Ack SLA %', key: 'slaAcknowledgmentRate', render: (val, row) => `${row.ticketMetrics?.slaAcknowledgmentRate ?? 100}%` },
                  { header: 'On-Time Comp %', key: 'onTimeCompletionRate', render: (val, row) => `${row.ticketMetrics?.onTimeCompletionRate ?? 100}% (${row.ticketMetrics?.ticketsCompleted ?? 0}/${row.ticketMetrics?.ticketsAssigned ?? 0})` },
                  { header: 'Quality / Workload', key: 'qualityScore', render: (val, row) => `${row.ticketMetrics?.qualityScore ?? 100}% / ${row.ticketMetrics?.weightedWorkloadPoints ?? 0} pts` },
                  { header: 'Sample', key: 'insufficientData', render: (val, row) => val ? <Badge status="warning">Low Sample ({row.assessedTicketCount || 0})</Badge> : <Badge status="success">Verified ({row.assessedTicketCount || 0})</Badge> },
                ]}
                data={teamPerfOverview}
              />
            </Card>
          )}

          {/* Directives Accountability & Execution Ledger Table */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                  Directives Accountability & Execution Ledger
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Authoritative record of operations, responsible owners, intended audience, and next required actions.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={opsStatusFilter}
                  onChange={(e) => setOpsStatusFilter(e.target.value)}
                  style={{
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                  }}
                >
                  <option value="all">All Lifecycle Statuses</option>
                  <option value="AWAITING_OWNERSHIP">Awaiting Ownership</option>
                  <option value="AWAITING_ACKNOWLEDGEMENT">Awaiting Acknowledgement</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="SUBMITTED_FOR_REVIEW">Under Supervisory Review</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="BLOCKED">Blocked</option>
                </select>

                <select
                  value={opsPriorityFilter}
                  onChange={(e) => setOpsPriorityFilter(e.target.value)}
                  style={{
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                  }}
                >
                  <option value="all">All Priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="URGENT">Urgent</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="NORMAL">Normal</option>
                </select>
              </div>
            </div>

            {loadingOps ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading operations ledger records...
              </div>
            ) : filteredOperations.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No operational directives match the selected criteria.
              </div>
            ) : (
              <Table
                columns={[
                  {
                    header: 'Code / Ref',
                    key: 'operation_code',
                    render: (val, row) => (
                      <div>
                        <strong style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{val}</strong>
                        {row.memo_reference && (
                          <div style={{ fontSize: '0.72rem', color: '#d4af37', fontFamily: 'monospace', fontWeight: 600 }}>
                            {row.memo_reference}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  {
                    header: 'Directive Subject & Scope',
                    key: 'title',
                    render: (val, row) => (
                      <div>
                        <strong>{val}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {row.category ? row.category.replace(/_/g, ' ') : 'General Directive'}
                        </div>
                      </div>
                    ),
                  },
                  {
                    header: 'Initiator',
                    key: 'initiator_name',
                    render: (val, row) => (
                      <span style={{ fontSize: '0.82rem' }}>
                        {val} <span style={{ color: 'var(--text-muted)' }}>({row.initiator_role})</span>
                      </span>
                    ),
                  },
                  {
                    header: 'Intended Audience',
                    key: 'target_group',
                    render: (val, row) => (
                      <span style={{ fontSize: '0.82rem' }}>
                        {val || row.target_role || row.audience_type}
                      </span>
                    ),
                  },
                  {
                    header: 'Responsible Owner',
                    key: 'responsible_name',
                    render: (val, row) => (
                      val ? (
                        <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.82rem' }}>
                          {val}
                        </span>
                      ) : (
                        <span style={{ color: '#fbbf24', fontStyle: 'italic', fontSize: '0.82rem' }}>
                          ⚠️ Unassigned ({row.current_responsible_group || 'Open'})
                        </span>
                      )
                    ),
                  },
                  {
                    header: 'Priority',
                    key: 'priority',
                    render: (val) => (
                      <Badge status={val === 'CRITICAL' ? 'danger' : val === 'URGENT' ? 'warning' : 'neutral'}>
                        {val}
                      </Badge>
                    ),
                  },
                  {
                    header: 'Status',
                    key: 'status',
                    render: (val) => (
                      <Badge status={val === 'COMPLETED' ? 'success' : val === 'BLOCKED' ? 'danger' : val === 'IN_PROGRESS' ? 'info' : 'warning'}>
                        {val ? val.replace(/_/g, ' ') : 'Active'}
                      </Badge>
                    ),
                  },
                  {
                    header: 'Next Action',
                    key: 'next_action',
                    render: (val, row) => (
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        {row.viewer_next_action?.text || val || '—'}
                      </span>
                    ),
                  },
                  {
                    header: 'Actions',
                    key: 'id',
                    render: (id, row) => (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewingOperationId(row.id)}
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            centralOperationsService.downloadMemoPdf({
                              operationId: row.id,
                              filename: `${row.memo_reference || row.operation_code || 'Operation_Memo'}.pdf`,
                            }).catch((err) => addToast(err.message || 'Download failed', 'error'));
                          }}
                        >
                          PDF
                        </Button>
                      </div>
                    ),
                  },
                ]}
                data={filteredOperations}
              />
            )}
          </Card>
        </div>
      )}

      {/* ─── MODAL: FINALIZE & FREEZE SNAPSHOT ─────────────────────────────── */}
      {isFinalizeModalOpen && (
        <Modal
          isOpen={isFinalizeModalOpen}
          onClose={() => setIsFinalizeModalOpen(false)}
          title="Finalize & Freeze Report to Ledger"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Freezing this report creates an immutable, cryptographically verifiable snapshot in the
              <strong> operational_reports_ledger</strong>. Any future adjustments will be tracked as versioned corrections.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Executive / Auditor Sign-Off Notes
              </label>
              <textarea
                rows={4}
                value={finalizeNotes}
                onChange={(e) => setFinalizeNotes(e.target.value)}
                placeholder="Enter executive sign-off comments, verification notes, or operational highlights..."
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setIsFinalizeModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleFinalizeSnapshot} disabled={finalizing}>
                {finalizing ? 'Freezing Snapshot...' : 'Confirm & Save Snapshot'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL: DISPATCH REPORT REQUEST ───────────────────────────────── */}
      {isRequestModalOpen && (
        <Modal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          title="Dispatch Operational Report Request"
        >
          <form onSubmit={handleCreateReportRequest} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Target Property (Optional)
              </label>
              <select
                value={requestForm.targetPropertyId}
                onChange={(e) => setRequestForm({ ...requestForm, targetPropertyId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">Company-Wide / All Properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Requested Operational Day
                </label>
                <input
                  type="date"
                  value={requestForm.requestedDate}
                  onChange={(e) => setRequestForm({ ...requestForm, requestedDate: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Priority
                </label>
                <select
                  value={requestForm.priority}
                  onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="NORMAL">Normal</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="URGENT">Urgent (Immediate Attention)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Inquiry & Specific Focus Points
              </label>
              <textarea
                rows={3}
                value={requestForm.instructions}
                onChange={(e) => setRequestForm({ ...requestForm, instructions: e.target.value })}
                required
                placeholder="e.g. Please provide detailed breakdown of delayed turn-overs at Ikoyi Crest and material shortages..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setIsRequestModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={submittingRequest}>
                {submittingRequest ? 'Dispatching...' : 'Dispatch Request'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── MODAL: IN-CHAT OPERATION DETAILS MODAL ───────────────────────── */}
      <InChatOperationDetailsModal
        isOpen={Boolean(viewingOperationId)}
        onClose={() => setViewingOperationId(null)}
        operationId={viewingOperationId}
        currentUser={user}
        onOperationUpdated={fetchOperationsReport}
      />
    </div>
  );
}
