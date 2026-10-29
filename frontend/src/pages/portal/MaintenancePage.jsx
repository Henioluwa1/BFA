import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { maintenanceService, propertyService, apartmentService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

const CATEGORIES = [
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'APPLIANCE',
  'FURNITURE',
  'STRUCTURAL',
  'CLEANING',
  'PEST_CONTROL',
  'SECURITY',
  'OTHER',
];

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function MaintenancePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties, activePropertyId, isAllProperties, activeProperty } = useProperty();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [records, setRecords] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);

  // Action Form State
  const [createForm, setCreateForm] = useState({
    property_id: '',
    apartment_id: '',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    issue_title: '',
    description: '',
    blocking_unit: true,
    estimated_cost: '',
  });

  const [resolveForm, setResolveForm] = useState({
    actual_cost: '',
    resolution_notes: '',
  });

  const [assignForm, setAssignForm] = useState({
    assigned_to_id: '',
  });

  // Sync propertyFilter with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Synchronize URL search params for deep-linking
  useEffect(() => {
    const qSearch = searchParams.get('search');
    if (qSearch) setSearchQuery(qSearch);

    const qPropId = searchParams.get('propertyId');
    if (qPropId) setPropertyFilter(qPropId);

    const openNew = searchParams.get('openNew');
    if (openNew === 'true') {
      const qAptId = searchParams.get('apartmentId');
      setCreateForm((prev) => ({
        ...prev,
        property_id: qPropId || prev.property_id,
        apartment_id: qAptId || prev.apartment_id,
      }));
      setIsCreateModalOpen(true);
    }
  }, [searchParams]);

  // Load maintenance records
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await maintenanceService.getAll({
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
      });
      setRecords(res.data || []);
    } catch (err) {
      addToast(`Failed to load maintenance records: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load apartments for dropdown
  useEffect(() => {
    async function loadApartments() {
      try {
        const res = await apartmentService.getAll({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        });
        setApartments(res.data || []);
      } catch (err) {
        console.error('Failed to load apartments', err);
      }
    }
    loadApartments();
  }, [propertyFilter]);

  useEffect(() => {
    fetchRecords();
  }, [propertyFilter, statusFilter, categoryFilter, priorityFilter]);

  // Filter records by search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter(
      (r) =>
        r.issue_code?.toLowerCase().includes(q) ||
        r.issue_title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.unit_number?.toLowerCase().includes(q) ||
        r.property_name?.toLowerCase().includes(q)
    );
  }, [records, searchQuery]);

  // Metrics computation
  const stats = useMemo(() => {
    const openCount = records.filter((r) => r.status === 'OPEN').length;
    const inProgressCount = records.filter((r) => r.status === 'IN_PROGRESS').length;
    const resolvedCount = records.filter((r) => r.status === 'RESOLVED').length;
    const criticalCount = records.filter((r) => r.priority === 'CRITICAL' && r.status !== 'RESOLVED').length;
    const totalCost = records.reduce((acc, r) => acc + (parseFloat(r.actual_cost) || parseFloat(r.cost) || 0), 0);

    return { openCount, inProgressCount, resolvedCount, criticalCount, totalCost };
  }, [records]);

  // Open Create Modal
  const handleOpenCreate = () => {
    const defaultPropId = propertyFilter !== 'all' ? propertyFilter : properties[0]?.id || '';
    setCreateForm({
      property_id: defaultPropId,
      apartment_id: '',
      category: 'PLUMBING',
      priority: 'MEDIUM',
      issue_title: '',
      description: '',
      blocking_unit: true,
      estimated_cost: '',
    });
    setIsCreateModalOpen(true);
  };

  // Submit Create Issue
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await maintenanceService.create(createForm);
      addToast('Maintenance work order logged successfully!', 'success');
      setIsCreateModalOpen(false);
      fetchRecords();
    } catch (err) {
      addToast(`Error creating work order: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Detail / Manage Modal
  const handleOpenDetail = (issue) => {
    setSelectedIssue(issue);
    setResolveForm({
      actual_cost: issue.actual_cost || issue.cost || '',
      resolution_notes: issue.resolution_notes || '',
    });
    setAssignForm({
      assigned_to_id: issue.assigned_to_id || '',
    });
    setIsDetailModalOpen(true);
  };

  // Action: Start Work
  const handleStartWork = async () => {
    if (!selectedIssue) return;
    setActionLoading(true);
    try {
      const res = await maintenanceService.start(selectedIssue.id);
      addToast('Work order is now IN_PROGRESS.', 'success');
      setSelectedIssue(res.data);
      fetchRecords();
    } catch (err) {
      addToast(`Failed to update status: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Assign Staff
  const handleAssignStaff = async (e) => {
    e.preventDefault();
    if (!selectedIssue) return;
    setActionLoading(true);
    try {
      const res = await maintenanceService.assign(selectedIssue.id, assignForm);
      addToast('Staff assigned successfully.', 'success');
      setSelectedIssue(res.data);
      fetchRecords();
    } catch (err) {
      addToast(`Failed to assign staff: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Resolve Issue
  const handleResolveIssue = async (e) => {
    e.preventDefault();
    if (!selectedIssue) return;
    setActionLoading(true);
    try {
      const res = await maintenanceService.resolve(selectedIssue.id, resolveForm);
      addToast('Maintenance resolved! Unit operational status updated to CLEANING.', 'success');
      setSelectedIssue(res.data);
      setIsDetailModalOpen(false);
      fetchRecords();
    } catch (err) {
      addToast(`Failed to resolve issue: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Cancel Work Order
  const handleCancelIssue = async () => {
    if (!selectedIssue) return;
    if (!window.confirm('Are you sure you want to cancel this work order?')) return;
    setActionLoading(true);
    try {
      await maintenanceService.cancel(selectedIssue.id, { reason: 'Cancelled by operator' });
      addToast('Work order cancelled.', 'info');
      setIsDetailModalOpen(false);
      fetchRecords();
    } catch (err) {
      addToast(`Failed to cancel work order: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
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
        return <span style={{ color: '#f97316', fontWeight: 600, fontSize: '0.8rem' }}>▲ HIGH</span>;
      case 'MEDIUM':
        return <span style={{ color: '#eab308', fontWeight: 500, fontSize: '0.8rem' }}>■ MEDIUM</span>;
      case 'LOW':
        return <span style={{ color: '#10b981', fontWeight: 500, fontSize: '0.8rem' }}>▼ LOW</span>;
      default:
        return priority;
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>Maintenance & Operations</span>
            <Badge status="info">PHASE 7 VERIFIED</Badge>
          </h1>
          <p className="page-subtitle">
            Lifecycle issue tracking, staff assignment, repair resolution, and automated unit state integration.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="primary" onClick={handleOpenCreate}>
            + Report Issue
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Open Issues</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-danger, #ef4444)', marginTop: '0.25rem' }}>
            {stats.openCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Awaiting technician action</div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>In Progress</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
            {stats.inProgressCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Active repairs underway</div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Resolved</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {stats.resolvedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Completed work orders</div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Critical / Urgent</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: stats.criticalCount > 0 ? '#ef4444' : 'var(--text-primary)', marginTop: '0.25rem' }}>
            {stats.criticalCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Blocking unit availability</div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Incurred Cost</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold, #c8a951)', marginTop: '0.25rem' }}>
            {formatNaira(stats.totalCost)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>All recorded repairs</div>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Search</label>
            <input
              type="text"
              placeholder="Search code, title, unit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Property</label>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Priority</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Priorities</option>
              {PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>{pr}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Work Orders Table */}
      <Card title={`Maintenance Work Orders (${filteredRecords.length})`}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading work orders...</div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 600 }}>No maintenance work orders found</p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Create an issue or adjust your search filters.</p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Property & Unit</th>
                <th>Issue Details</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Cost</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--accent-gold)' }}>
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
                      style={{ fontSize: '0.8rem', color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600, marginTop: '2px' }}
                      onClick={() => navigate(`/app/apartments?unitId=${item.apartment_id}&propertyId=${item.property_id}`)}
                      title="View Unit Details"
                    >
                      Unit {item.unit_number} {item.unit_name ? `(${item.unit_name})` : ''} ↗
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.issue_title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'var(--bg-surface)', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                      {item.category || 'MAINTENANCE'}
                    </span>
                  </td>
                  <td>{getPriorityBadge(item.priority)}</td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td style={{ fontWeight: 600 }}>
                    {formatNaira(item.actual_cost || item.cost || item.estimated_cost || 0)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="secondary" size="small" onClick={() => handleOpenDetail(item)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Create Issue Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Report Operational Maintenance Issue"
        maxWidth="600px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateSubmit} disabled={actionLoading}>
              {actionLoading ? 'Logging Issue...' : 'Log Work Order'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Property *</label>
              <select
                required
                value={createForm.property_id}
                onChange={(e) => setCreateForm({ ...createForm, property_id: e.target.value, apartment_id: '' })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="">Select Property...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Apartment Unit *</label>
              <select
                required
                value={createForm.apartment_id}
                onChange={(e) => setCreateForm({ ...createForm, apartment_id: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="">Select Unit...</option>
                {apartments
                  .filter((a) => !createForm.property_id || String(a.property_id) === String(createForm.property_id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>Unit {a.unit_number} — {a.unit_name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category *</label>
              <select
                required
                value={createForm.category}
                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Priority *</label>
              <select
                required
                value={createForm.priority}
                onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>{pr}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Issue Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Master Bedroom AC Leaking Water"
              value={createForm.issue_title}
              onChange={(e) => setCreateForm({ ...createForm, issue_title: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Detailed Description *</label>
            <textarea
              rows={3}
              required
              placeholder="Describe symptoms, exact location in unit, safety concerns..."
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Estimated Cost (₦)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={createForm.estimated_cost}
                onChange={(e) => setCreateForm({ ...createForm, estimated_cost: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>

            <div style={{ paddingTop: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={createForm.blocking_unit}
                  onChange={(e) => setCreateForm({ ...createForm, blocking_unit: e.target.checked })}
                />
                <span style={{ fontWeight: 600 }}>Block Unit Availability</span>
              </label>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Sets unit status to <code>MAINTENANCE</code> and prevents new bookings.
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Detail / Manage Modal */}
      {selectedIssue && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Work Order #${selectedIssue.issue_code}`}
          maxWidth="700px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                {selectedIssue.status !== 'CANCELLED' && selectedIssue.status !== 'RESOLVED' && (
                  <Button variant="danger" size="small" onClick={handleCancelIssue} disabled={actionLoading}>
                    Cancel Order
                  </Button>
                )}
              </div>
              <Button variant="secondary" onClick={() => setIsDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Connected Workflows Bar */}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                background: 'var(--bg-card-hover)',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                alignItems: 'center',
                border: '1px solid var(--border-default)',
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Related Workflows:
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  navigate(`/app/inspections?apartmentId=${selectedIssue.apartment_id}&propertyId=${selectedIssue.property_id}`);
                }}
              >
                📋 View Unit Inspections
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  navigate(`/app/apartments?unitId=${selectedIssue.apartment_id}&propertyId=${selectedIssue.property_id}`);
                }}
              >
                🏢 View Unit Details
              </Button>
            </div>

            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{selectedIssue.issue_title}</h3>
                <div style={{ fontSize: '0.85rem', marginTop: '0.35rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span
                    style={{ color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      navigate(`/app/properties?search=${encodeURIComponent(selectedIssue.property_name || '')}`);
                    }}
                    title="View Property"
                  >
                    🏢 {selectedIssue.property_name} ↗
                  </span>
                  {' • '}
                  <span
                    style={{ color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      navigate(`/app/apartments?unitId=${selectedIssue.apartment_id}&propertyId=${selectedIssue.property_id}`);
                    }}
                    title="View Unit"
                  >
                    Unit {selectedIssue.unit_number} ({selectedIssue.unit_name || 'Unit'}) ↗
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                {getStatusBadge(selectedIssue.status)}
                {getPriorityBadge(selectedIssue.priority)}
              </div>
            </div>

            {/* Description & metadata */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Category:</span>
                <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>{selectedIssue.category || 'MAINTENANCE'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Reported Date:</span>
                <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>
                  {selectedIssue.reported_at ? new Date(selectedIssue.reported_at).toLocaleDateString() : 'N/A'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Assigned Tech:</span>
                <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>
                  {selectedIssue.assigned_to_name ? `${selectedIssue.assigned_to_name} (${selectedIssue.assigned_to_role})` : 'Unassigned'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Unit Blocking:</span>
                <div style={{ fontWeight: 600, marginTop: '0.15rem', color: selectedIssue.blocking_unit ? '#ef4444' : 'inherit' }}>
                  {selectedIssue.blocking_unit ? 'YES (MAINTENANCE)' : 'NO'}
                </div>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Description:</span>
              <p style={{ margin: '0.35rem 0 0 0', padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', fontSize: '0.88rem' }}>
                {selectedIssue.description}
              </p>
            </div>

            {/* Staff Assignment Section */}
            {selectedIssue.status !== 'RESOLVED' && selectedIssue.status !== 'CANCELLED' && (
              <Card title="Technician Assignment">
                <form onSubmit={handleAssignStaff} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    placeholder="Enter Staff/Technician User ID"
                    value={assignForm.assigned_to_id}
                    onChange={(e) => setAssignForm({ assigned_to_id: e.target.value })}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                  />
                  <Button variant="secondary" size="small" onClick={handleAssignStaff} disabled={actionLoading || !assignForm.assigned_to_id}>
                    Assign Staff
                  </Button>
                </form>
              </Card>
            )}

            {/* Lifecycle Transitions */}
            {selectedIssue.status === 'OPEN' && (
              <div style={{ padding: '1rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Start Repair Work</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Mark this work order as IN_PROGRESS and log the start time.
                  </div>
                </div>
                <Button variant="primary" onClick={handleStartWork} disabled={actionLoading}>
                  Start Work
                </Button>
              </div>
            )}

            {selectedIssue.status === 'IN_PROGRESS' && (
              <Card title="Finalize and Resolve Work Order">
                <form onSubmit={handleResolveIssue} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(200, 169, 81, 0.1)', padding: '0.65rem', borderRadius: '4px', border: '1px solid rgba(200, 169, 81, 0.3)' }}>
                    ℹ Resolving this issue will automatically move the unit to <strong>CLEANING</strong> status so housekeeping can inspect and prepare it before re-opening for guest bookings.
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Actual Repair Cost (₦) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={resolveForm.actual_cost}
                      onChange={(e) => setResolveForm({ ...resolveForm, actual_cost: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Resolution Notes *</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Detail work performed, replacement parts installed, warranty notes..."
                      value={resolveForm.resolution_notes}
                      onChange={(e) => setResolveForm({ ...resolveForm, resolution_notes: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <Button variant="primary" onClick={handleResolveIssue} disabled={actionLoading}>
                      Resolve & Release to Housekeeping
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {selectedIssue.status === 'RESOLVED' && (
              <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.9rem' }}>✓ Work Order Completed & Resolved</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Resolved at: {selectedIssue.resolved_at ? new Date(selectedIssue.resolved_at).toLocaleString() : 'N/A'}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                  Actual Incurred Cost: {formatNaira(selectedIssue.actual_cost || selectedIssue.cost || 0)}
                </div>
                <div style={{ fontSize: '0.82rem', marginTop: '0.5rem', color: 'var(--text-primary)', background: 'var(--bg-surface)', padding: '0.65rem', borderRadius: '4px' }}>
                  <strong>Resolution Notes:</strong> {selectedIssue.resolution_notes || 'No notes recorded.'}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
