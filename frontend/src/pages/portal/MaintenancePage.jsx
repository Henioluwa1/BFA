import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import { maintenanceService, apartmentService, userService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

// Subcomponents
import CreateTicketModal from '../../components/maintenance/CreateTicketModal';
import AssignTechnicianModal from '../../components/maintenance/AssignTechnicianModal';
import ResolveTicketModal from '../../components/maintenance/ResolveTicketModal';
import CancelTicketModal from '../../components/maintenance/CancelTicketModal';
import WorkOrderDetailDrawer from '../../components/maintenance/WorkOrderDetailDrawer';
import TechnicianExecutionCard from '../../components/maintenance/TechnicianExecutionCard';

const CATEGORIES = [
  'ALL',
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'CARPENTRY',
  'APPLIANCE',
  'PAINTING',
  'CLEANING',
  'GENERAL',
];

const PRIORITIES = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];

export default function MaintenancePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { properties, activePropertyId, isAllProperties, activeProperty } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const userRole = (user?.role || '').toUpperCase();
  const isManagerOrAdmin = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER'].includes(userRole);
  const isStaff = userRole === 'STAFF';

  // Data State
  const [records, setRecords] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [statsData, setStatsData] = useState({
    open: 0,
    inProgress: 0,
    criticalOpen: 0,
    resolved: 0,
    cancelled: 0,
    totalCost: 0,
  });
  const [unitsInMaintenance, setUnitsInMaintenance] = useState(0);

  // Loading States
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMyOrders, setOnlyMyOrders] = useState(false);
  const [viewMode, setViewMode] = useState('TABLE'); // 'TABLE' or 'CARDS'

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);

  // Target Work Order for Modals
  const [targetWorkOrder, setTargetWorkOrder] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Sync with global PropertyContext
  useEffect(() => {
    if (activePropertyId) {
      setPropertyFilter(activePropertyId);
    }
  }, [activePropertyId]);

  // Deep-linking via URL query params
  useEffect(() => {
    const qSearch = searchParams.get('search');
    if (qSearch) setSearchQuery(qSearch);

    const qPropId = searchParams.get('propertyId');
    if (qPropId) setPropertyFilter(qPropId);

    const qStatus = searchParams.get('status');
    if (qStatus && STATUSES.includes(qStatus.toUpperCase())) {
      setStatusFilter(qStatus.toUpperCase());
    }

    const openNew = searchParams.get('openNew');
    if (openNew === 'true') {
      setIsCreateModalOpen(true);
    }
  }, [searchParams]);

  // Fetch Work Orders
  const fetchWorkOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        apartmentId: unitFilter !== 'ALL' ? unitFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
      };

      const res = await maintenanceService.getAll(params);
      const data = Array.isArray(res.data) ? res.data : [];
      setRecords(data);

      // Deep link to a specific ticket via ?id=X
      const ticketId = searchParams.get('id');
      if (ticketId) {
        const found = data.find((r) => String(r.id) === String(ticketId));
        if (found) {
          setTargetWorkOrder(found);
          setIsDetailDrawerOpen(true);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load maintenance records.');
      addToast(`Error loading work orders: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [propertyFilter, unitFilter, statusFilter, categoryFilter, priorityFilter, searchParams, addToast]);

  // Fetch Operational Stats & Apartment Units
  const fetchStatsAndUnits = useCallback(async () => {
    setStatsLoading(true);
    try {
      const propParam = propertyFilter !== 'all' ? propertyFilter : undefined;
      const [statsRes, aptRes] = await Promise.all([
        maintenanceService.getStats({ propertyId: propParam }).catch(() => ({ data: {} })),
        apartmentService.getAll({ propertyId: propParam }).catch(() => ({ data: [] })),
      ]);

      if (statsRes.data?.overview) {
        setStatsData(statsRes.data.overview);
      }

      const aptList = Array.isArray(aptRes.data) ? aptRes.data : [];
      setApartments(aptList);

      const maintUnits = aptList.filter((a) => a.status === 'MAINTENANCE').length;
      setUnitsInMaintenance(maintUnits);
    } catch (err) {
      console.error('Failed to load maintenance statistics:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [propertyFilter]);

  useEffect(() => {
    fetchWorkOrders();
    fetchStatsAndUnits();
  }, [fetchWorkOrders, fetchStatsAndUnits]);

  // Client-Side Search & "My Assigned Work Orders" Filter
  const filteredRecords = useMemo(() => {
    let list = records;

    if (onlyMyOrders && user?.id) {
      list = list.filter((r) => parseInt(r.assigned_to_id, 10) === parseInt(user.id, 10));
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase();
    return list.filter(
      (r) =>
        r.issue_code?.toLowerCase().includes(q) ||
        r.issue_title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.unit_number?.toLowerCase().includes(q) ||
        r.property_name?.toLowerCase().includes(q) ||
        r.assigned_to?.toLowerCase().includes(q)
    );
  }, [records, searchQuery, onlyMyOrders, user?.id]);

  // Pagination Slice
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRecords.slice(startIndex, startIndex + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;

  // Actions: Start Work
  const handleStartWork = async (id) => {
    setActionLoading(true);
    try {
      const res = await maintenanceService.start(id);
      addToast(`Work order #${res.data?.issue_code || id} marked as IN_PROGRESS.`, 'success');
      setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...res.data } : r)));
      if (targetWorkOrder && targetWorkOrder.id === id) {
        setTargetWorkOrder((prev) => ({ ...prev, ...res.data }));
      }
      fetchStatsAndUnits();
    } catch (err) {
      addToast(`Failed to start work: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Modals
  const handleOpenDetail = (workOrder) => {
    setTargetWorkOrder(workOrder);
    setIsDetailDrawerOpen(true);
  };

  const handleOpenAssign = (workOrder) => {
    setTargetWorkOrder(workOrder);
    setIsAssignModalOpen(true);
  };

  const handleOpenResolve = (workOrder) => {
    setTargetWorkOrder(workOrder);
    setIsResolveModalOpen(true);
  };

  const handleOpenCancel = (workOrder) => {
    setTargetWorkOrder(workOrder);
    setIsCancelModalOpen(true);
  };

  // Reset Filters
  const handleClearFilters = () => {
    setPropertyFilter(activePropertyId || 'all');
    setUnitFilter('ALL');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setPriorityFilter('ALL');
    setSearchQuery('');
    setOnlyMyOrders(false);
    setCurrentPage(1);
  };

  // Status Badge Helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return <Badge status="danger">OPEN</Badge>;
      case 'IN_PROGRESS':
        return <Badge status="pending">IN PROGRESS</Badge>;
      case 'RESOLVED':
        return <Badge status="success">RESOLVED</Badge>;
      case 'CANCELLED':
        return <Badge status="secondary">CANCELLED</Badge>;
      default:
        return <Badge status="neutral">{status}</Badge>;
    }
  };

  // Priority Badge Helper
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'CRITICAL':
        return <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.8rem' }}>● CRITICAL</span>;
      case 'HIGH':
        return <span style={{ color: '#f97316', fontWeight: 700, fontSize: '0.8rem' }}>▲ HIGH</span>;
      case 'MEDIUM':
        return <span style={{ color: '#eab308', fontWeight: 600, fontSize: '0.8rem' }}>■ MEDIUM</span>;
      case 'LOW':
        return <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.8rem' }}>▼ LOW</span>;
      default:
        return priority;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Page Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>
              Property Maintenance & Unit Care
            </h1>
            <Badge status="info">STAGE 2.5B READY</Badge>
          </div>
          <p className="page-subtitle" style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)' }}>
            Work order tracking, property staff assignment, unit operational locking, and housekeeping handoff.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="outline" size="small" onClick={() => { fetchWorkOrders(); fetchStatsAndUnits(); }} disabled={loading}>
            🔄 Refresh
          </Button>

          {isManagerOrAdmin && (
            <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
              + Report Work Order
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Open Work Orders */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Open Work Orders
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-danger, #ef4444)', marginTop: '0.3rem' }}>
            {statsLoading ? '...' : statsData.open}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Awaiting technician start
          </div>
        </Card>

        {/* In Progress */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            In Progress
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.3rem' }}>
            {statsLoading ? '...' : statsData.inProgress}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Active repairs in the field
          </div>
        </Card>

        {/* Emergency / Critical */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Emergency / Critical
          </div>
          <div
            style={{
              fontSize: '1.85rem',
              fontWeight: 700,
              color: statsData.criticalOpen > 0 ? '#ef4444' : 'var(--text-primary)',
              marginTop: '0.3rem',
            }}
          >
            {statsLoading ? '...' : statsData.criticalOpen}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Auto-blocking unit availability
          </div>
        </Card>

        {/* Units in Maintenance */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Units in Maintenance
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, color: '#8b5cf6', marginTop: '0.3rem' }}>
            {statsLoading ? '...' : unitsInMaintenance}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Blocked from reservation engine
          </div>
        </Card>

        {/* Total Incurred Cost */}
        <Card>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Incurred Cost
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-gold, #c8a951)', marginTop: '0.3rem' }}>
            {statsLoading ? '...' : formatNaira(statsData.totalCost || 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Resolved repairs (Non-ledger)
          </div>
        </Card>
      </div>

      {/* Filter Bar Card */}
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              alignItems: 'center',
            }}
          >
            {/* Search Query */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Search</label>
              <input
                type="text"
                placeholder="Code, title, unit, staff..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Property Selector */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Property</label>
              <select
                value={propertyFilter}
                onChange={(e) => {
                  setPropertyFilter(e.target.value);
                  setUnitFilter('ALL');
                  setCurrentPage(1);
                }}
                disabled={userRole === 'MANAGER' && !isAllProperties}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
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

            {/* Apartment Selector */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Apartment Unit</label>
              <select
                value={unitFilter}
                onChange={(e) => {
                  setUnitFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="ALL">All Units & Common Areas</option>
                {apartments.map((a) => (
                  <option key={a.id} value={a.id}>
                    Unit {a.unit_number} — {a.unit_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Selector */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Priority Selector */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr === 'ALL' ? 'All Priorities' : pr}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Selector */}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sub-Filter Controls & View Toggle */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={onlyMyOrders}
                  onChange={(e) => {
                    setOnlyMyOrders(e.target.checked);
                    setCurrentPage(1);
                  }}
                />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  👤 Assigned to Me ({records.filter((r) => parseInt(r.assigned_to_id, 10) === parseInt(user?.id, 10)).length})
                </span>
              </label>

              {(searchQuery || statusFilter !== 'ALL' || categoryFilter !== 'ALL' || priorityFilter !== 'ALL' || unitFilter !== 'ALL' || onlyMyOrders) && (
                <Button variant="ghost" size="small" onClick={handleClearFilters}>
                  ✕ Clear Filters
                </Button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Button
                variant={viewMode === 'TABLE' ? 'primary' : 'outline'}
                size="small"
                onClick={() => setViewMode('TABLE')}
              >
                Table View
              </Button>
              <Button
                variant={viewMode === 'CARDS' ? 'primary' : 'outline'}
                size="small"
                onClick={() => setViewMode('CARDS')}
              >
                Technician Card View
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Work Orders Presentation */}
      <Card title={`Maintenance Work Orders (${filteredRecords.length})`}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Loading maintenance work orders...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: '#ef4444' }}>
            <p style={{ fontWeight: 700 }}>Error Loading Work Orders</p>
            <p style={{ fontSize: '0.85rem' }}>{error}</p>
            <Button variant="outline" size="small" onClick={fetchWorkOrders} style={{ marginTop: '0.75rem' }}>
              Try Again
            </Button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔧</div>
            <p style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              No Maintenance Work Orders Found
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0.25rem auto 1rem' }}>
              No tickets match your active filter criteria. Adjust your search or report a new issue.
            </p>
            {isManagerOrAdmin && (
              <Button variant="primary" size="small" onClick={() => setIsCreateModalOpen(true)}>
                + Report New Work Order
              </Button>
            )}
          </div>
        ) : viewMode === 'CARDS' ? (
          /* Mobile / Handheld Execution Cards View */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1rem',
            }}
          >
            {paginatedRecords.map((item) => (
              <TechnicianExecutionCard
                key={item.id}
                workOrder={item}
                onOpenDetail={handleOpenDetail}
                onStartWork={handleStartWork}
                onOpenResolve={handleOpenResolve}
                onOpenEvidence={handleOpenDetail}
                actionLoading={actionLoading}
                isAssignedToCurrentUser={parseInt(item.assigned_to_id, 10) === parseInt(user?.id, 10)}
              />
            ))}
          </div>
        ) : (
          /* Authoritative Data Table View */
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Property & Unit</th>
                  <th>Issue Details</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Work Status</th>
                  <th>Unit State</th>
                  <th>Assigned Staff</th>
                  <th>Cost</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-gold)' }}>
                      {item.issue_code}
                    </td>
                    <td>
                      <div
                        style={{ fontWeight: 600, color: 'var(--brand-accent)', cursor: 'pointer' }}
                        onClick={() => navigate(`/app/properties?search=${encodeURIComponent(item.property_name || '')}`)}
                        title="View building in Properties"
                      >
                        🏢 {item.property_name} ↗
                      </div>
                      <div
                        style={{ fontSize: '0.78rem', color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600, marginTop: '2px' }}
                        onClick={() => {
                          if (item.apartment_id) {
                            navigate(`/app/apartments?unitId=${item.apartment_id}&propertyId=${item.property_id}`);
                          }
                        }}
                        title="View Unit Details"
                      >
                        {item.unit_number ? `Unit ${item.unit_number} (${item.unit_name || 'Apt'}) ↗` : 'Common Area'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.issue_title}</div>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          maxWidth: '240px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.description}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.45rem',
                          background: 'var(--bg-surface)',
                          borderRadius: '4px',
                          border: '1px solid var(--border-default)',
                          fontWeight: 600,
                        }}
                      >
                        {item.category || 'GENERAL'}
                      </span>
                    </td>
                    <td>{getPriorityBadge(item.priority)}</td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td>
                      {item.blocking_unit === 1 ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444' }}>
                          🔒 MAINTENANCE
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Normal</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.assigned_to || item.assigned_to_name ? (
                          <span>👤 {item.assigned_to || item.assigned_to_name}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assigned Property Staff</div>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                      {formatNaira(item.actual_cost || item.cost || item.estimated_cost || 0)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <Button variant="secondary" size="small" onClick={() => handleOpenDetail(item)}>
                          Details
                        </Button>
                        {item.status === 'OPEN' && (
                          <Button
                            variant="outline"
                            size="small"
                            onClick={() => handleStartWork(item.id)}
                            disabled={actionLoading}
                          >
                            Start
                          </Button>
                        )}
                        {(item.status === 'IN_PROGRESS' || item.status === 'OPEN') && (
                          <Button
                            variant="primary"
                            size="small"
                            onClick={() => handleOpenResolve(item)}
                            disabled={actionLoading}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-subtle)',
              marginTop: '1rem',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              Showing page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredRecords.length} work orders)
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                variant="outline"
                size="small"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="small"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals & Drawers */}
      <CreateTicketModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        properties={properties}
        initialPropertyId={propertyFilter !== 'all' ? propertyFilter : ''}
        onSuccess={() => {
          fetchWorkOrders();
          fetchStatsAndUnits();
        }}
      />

      <AssignTechnicianModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        workOrder={targetWorkOrder}
        onSuccess={() => {
          fetchWorkOrders();
        }}
      />

      <ResolveTicketModal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        workOrder={targetWorkOrder}
        onSuccess={() => {
          fetchWorkOrders();
          fetchStatsAndUnits();
        }}
      />

      <CancelTicketModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        workOrder={targetWorkOrder}
        onSuccess={() => {
          fetchWorkOrders();
          fetchStatsAndUnits();
        }}
      />

      <WorkOrderDetailDrawer
        isOpen={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
        workOrder={targetWorkOrder}
        user={user}
        onStartWork={handleStartWork}
        onOpenAssign={handleOpenAssign}
        onOpenResolve={handleOpenResolve}
        onOpenCancel={handleOpenCancel}
        onWorkOrderDeleted={() => {
          fetchWorkOrders();
          fetchStatsAndUnits();
        }}
        actionLoading={actionLoading}
      />
    </div>
  );
}
