import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import { inspectionService, reservationService, apartmentService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNaira } from '../utils/currency';

export default function InspectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties, activePropertyId, setActivePropertyId } = useProperty();
  const { hasPermission } = useAuth();
  const { addToast } = useToast();

  const [inspections, setInspections] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    property_id: '',
    apartment_id: '',
    reservation_id: '',
    inspection_type: 'CHECKOUT',
    condition_rating: 'GOOD',
    scheduled_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [manageForm, setManageForm] = useState({
    condition_rating: 'GOOD',
    status: 'IN_PROGRESS',
    damage_items: [],
    missing_items: [],
    notes: '',
  });

  // New damage item sub-state
  const [newDamage, setNewDamage] = useState({
    item: '',
    description: '',
    severity: 'MINOR',
    location: 'Living Area',
    estimated_cost: '',
  });

  // Sync with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Synchronize URL search params for deep-linking
  useEffect(() => {
    const qPropId = searchParams.get('propertyId');
    if (qPropId) setPropertyFilter(qPropId);

    const openNew = searchParams.get('openNew');
    if (openNew === 'true') {
      const qAptId = searchParams.get('apartmentId');
      const qResId = searchParams.get('reservationId');
      setCreateForm((prev) => ({
        ...prev,
        property_id: qPropId || prev.property_id,
        apartment_id: qAptId || prev.apartment_id,
        reservation_id: qResId || prev.reservation_id,
      }));
      setIsCreateModalOpen(true);
    }
  }, [searchParams]);

  // Load inspections
  const fetchInspections = async () => {
    setLoading(true);
    try {
      const res = await inspectionService.getAll({
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        inspectionType: typeFilter !== 'ALL' ? typeFilter : undefined,
      });
      setInspections(res.data || []);
    } catch (err) {
      addToast(`Error loading inspections: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load reference apartments & reservations
  useEffect(() => {
    async function loadRefs() {
      try {
        const [aptRes, resRes] = await Promise.all([
          apartmentService.getAll({ propertyId: propertyFilter !== 'all' ? propertyFilter : undefined }),
          reservationService.getAll({ propertyId: propertyFilter !== 'all' ? propertyFilter : undefined }),
        ]);
        setApartments(aptRes.data || []);
        setReservations(resRes.data || []);
      } catch {
        // Handled silently
      }
    }
    loadRefs();
  }, [propertyFilter]);

  useEffect(() => {
    fetchInspections();
  }, [propertyFilter, statusFilter, typeFilter]);

  // Summary Metrics
  const stats = useMemo(() => {
    const total = inspections.length;
    const completed = inspections.filter((i) => i.status === 'COMPLETED').length;
    const followUp = inspections.filter((i) => i.status === 'FOLLOW_UP').length;
    const inProgress = inspections.filter((i) => ['DRAFT', 'IN_PROGRESS'].includes(i.status)).length;
    return { total, completed, followUp, inProgress };
  }, [inspections]);

  // Open Create Modal
  const handleOpenCreate = () => {
    const defaultProp = properties.length > 0 ? String(properties[0].id) : '';
    setCreateForm({
      property_id: defaultProp,
      apartment_id: '',
      reservation_id: '',
      inspection_type: 'CHECKOUT',
      condition_rating: 'GOOD',
      scheduled_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setIsCreateModalOpen(true);
  };

  // Submit Create Inspection
  const handleSubmitCreate = async (e) => {
    e.preventDefault();
    if (!createForm.property_id || !createForm.apartment_id) {
      addToast('Please select property and unit', 'error');
      return;
    }

    setActionLoading(true);
    try {
      await inspectionService.create({
        ...createForm,
        property_id: parseInt(createForm.property_id, 10),
        apartment_id: parseInt(createForm.apartment_id, 10),
        reservation_id: createForm.reservation_id ? parseInt(createForm.reservation_id, 10) : undefined,
      });
      addToast('Inspection scheduled successfully!', 'success');
      setIsCreateModalOpen(false);
      fetchInspections();
    } catch (err) {
      addToast(`Failed to create inspection: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Manage Modal
  const handleOpenManage = (insp) => {
    setSelectedInspection(insp);
    let parsedDamage = [];
    let parsedMissing = [];
    try {
      parsedDamage = typeof insp.damage_items === 'string' ? JSON.parse(insp.damage_items) : insp.damage_items || [];
    } catch {
      parsedDamage = [];
    }
    try {
      parsedMissing = typeof insp.missing_items === 'string' ? JSON.parse(insp.missing_items) : insp.missing_items || [];
    } catch {
      parsedMissing = [];
    }

    setManageForm({
      condition_rating: insp.condition_rating || 'GOOD',
      status: insp.status || 'IN_PROGRESS',
      damage_items: parsedDamage,
      missing_items: parsedMissing,
      notes: insp.notes || '',
    });
    setNewDamage({
      item: '',
      description: '',
      severity: 'MINOR',
      location: 'Living Area',
      estimated_cost: '',
    });
    setIsManageModalOpen(true);
  };

  // Add damage item to manageForm
  const handleAddDamageItem = () => {
    if (!newDamage.item.trim()) return;
    const item = {
      id: Date.now(),
      item: newDamage.item.trim(),
      description: newDamage.description.trim(),
      severity: newDamage.severity,
      location: newDamage.location,
      estimated_cost: parseFloat(newDamage.estimated_cost) || 0,
    };
    setManageForm((prev) => ({
      ...prev,
      damage_items: [...prev.damage_items, item],
      condition_rating: prev.condition_rating === 'EXCELLENT' || prev.condition_rating === 'GOOD' ? 'DAMAGED' : prev.condition_rating,
    }));
    setNewDamage({ item: '', description: '', severity: 'MINOR', location: 'Living Area', estimated_cost: '' });
  };

  const handleRemoveDamage = (id) => {
    setManageForm((prev) => ({
      ...prev,
      damage_items: prev.damage_items.filter((d) => d.id !== id),
    }));
  };

  // Complete Inspection
  const handleComplete = async () => {
    if (!selectedInspection) return;
    setActionLoading(true);
    try {
      await inspectionService.complete(selectedInspection.id, manageForm);
      addToast('Inspection finalized and logged into audit trail!', 'success');
      setIsManageModalOpen(false);
      fetchInspections();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Save in-progress
  const handleSaveDraft = async () => {
    if (!selectedInspection) return;
    setActionLoading(true);
    try {
      await inspectionService.update(selectedInspection.id, manageForm);
      addToast('Inspection updates saved.', 'success');
      setIsManageModalOpen(false);
      fetchInspections();
    } catch (err) {
      addToast(`Error: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Condition Badge Color Helper
  const getConditionBadge = (cond) => {
    const c = String(cond || '').toUpperCase();
    if (c === 'EXCELLENT' || c === 'GOOD') return 'badge-available';
    if (c === 'FAIR') return 'badge-pending';
    return 'badge-cancelled';
  };

  const columns = [
    {
      header: 'Inspection Code',
      key: 'inspection_code',
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 700, color: 'var(--brand-accent)', fontFamily: 'monospace' }}>
            {val}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Scheduled: {row.scheduled_date}
          </div>
        </div>
      ),
    },
    {
      header: 'Property & Unit',
      key: 'property_name',
      render: (val, row) => (
        <div>
          <div
            style={{ fontWeight: 600, color: 'var(--brand-accent)', cursor: 'pointer' }}
            onClick={() => navigate(`/app/properties?search=${encodeURIComponent(val || '')}`)}
            title="View building in Properties"
          >
            🏢 {val} ↗
          </div>
          <div
            style={{ fontSize: '0.8rem', color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600, marginTop: '2px' }}
            onClick={() => navigate(`/app/apartments?unitId=${row.apartment_id}&propertyId=${row.property_id}`)}
            title="View Unit Details"
          >
            Unit {row.unit_number} ({row.unit_type}) ↗
          </div>
        </div>
      ),
    },
    {
      header: 'Type & Condition',
      key: 'inspection_type',
      render: (val, row) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{val}</span>
          <span className={`badge ${getConditionBadge(row.condition_rating)}`} style={{ fontSize: '0.65rem' }}>
            {row.condition_rating}
          </span>
        </div>
      ),
    },
    {
      header: 'Linked Guest / Stay',
      key: 'guest_name',
      render: (val, row) => (
        <div style={{ fontSize: '0.8rem' }}>
          {val ? (
            <div
              style={{ fontWeight: 700, color: 'var(--brand-accent)', cursor: 'pointer' }}
              onClick={() => navigate(`/app/guests?search=${encodeURIComponent(val)}`)}
              title="View Guest Profile"
            >
              👤 {val} ↗
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Routine Walkthrough</span>
          )}
          {row.reservation_code && (
            <div
              style={{ fontSize: '0.72rem', color: 'var(--brand-accent)', cursor: 'pointer', fontFamily: 'monospace', marginTop: '2px' }}
              onClick={() => navigate(`/app/reservations?search=${encodeURIComponent(row.reservation_code)}`)}
              title="View Reservation Details"
            >
              📑 {row.reservation_code} ↗
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (val) => <Badge status={val}>{val}</Badge>,
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (_, row) => (
        <Button variant="outline" size="sm" onClick={() => handleOpenManage(row)}>
          Manage
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Apartment Inspections
            </h1>
            <Badge status="available">PHASE 6 LIFECYCLE</Badge>
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.35rem' }}>
            Pre-arrival checks, post-checkout unit assessments, structured damage itemization, and maintenance follow-up.
          </p>
        </div>

        {hasPermission('inspections.create') && (
          <Button variant="primary" size="sm" onClick={handleOpenCreate}>
            + Schedule Inspection
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '1rem' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Inspections
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
            {stats.total}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            In Progress / Scheduled
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#1e5c99' }}>
            {stats.inProgress}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Completed (Clean)
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: '#196f19' }}>
            {stats.completed}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            Damage / Follow-Up
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--rust-light)' }}>
            {stats.followUp}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Property:</label>
            <select
              value={propertyFilter}
              onChange={(e) => {
                setPropertyFilter(e.target.value);
                setActivePropertyId(e.target.value);
              }}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Type:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Types</option>
              <option value="CHECKOUT">Post-Checkout</option>
              <option value="PRE_CHECKIN">Pre-Arrival</option>
              <option value="ROUTINE">Routine Walkthrough</option>
              <option value="DAMAGE">Damage Assessment</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '0.55rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="FOLLOW_UP">Follow-Up Required</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card title={`Inspections Record (${inspections.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading inspection records...
          </div>
        ) : (
          <Table columns={columns} data={inspections} emptyMessage="No inspections found." />
        )}
      </Card>

      {/* Create Inspection Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        size="lg"
        icon="📋"
        title="Schedule Unit Inspection"
        subtitle="Initialize physical condition evaluation, checkout walkthrough, or damage assessment"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSubmitCreate} loading={actionLoading}>
              Schedule Inspection
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmitCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Property:</label>
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
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Apartment Unit:</label>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Inspection Type:</label>
              <select
                value={createForm.inspection_type}
                onChange={(e) => setCreateForm({ ...createForm, inspection_type: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="CHECKOUT">Post-Checkout</option>
                <option value="PRE_CHECKIN">Pre-Arrival</option>
                <option value="ROUTINE">Routine Walkthrough</option>
                <option value="DAMAGE">Damage Assessment</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Scheduled Date:</label>
              <input
                type="date"
                required
                value={createForm.scheduled_date}
                onChange={(e) => setCreateForm({ ...createForm, scheduled_date: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Link Reservation (Optional):</label>
            <select
              value={createForm.reservation_id}
              onChange={(e) => setCreateForm({ ...createForm, reservation_id: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="">No linked reservation (Standalone walkthrough)</option>
              {reservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reservation_code} — {r.tenant_name} (Unit {r.unit_number})
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* Manage Inspection Modal */}
      {selectedInspection && (
        <Modal
          isOpen={isManageModalOpen}
          onClose={() => setIsManageModalOpen(false)}
          size="xl"
          icon="🔍"
          title={`Inspection Assessment: ${selectedInspection.inspection_code}`}
          subtitle="Structured condition rating, itemized damage ledger in ₦, and completion sign-off"
          footer={
            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button variant="outline" onClick={() => setIsManageModalOpen(false)}>Close</Button>
              <Button variant="outline" onClick={handleSaveDraft} loading={actionLoading}>Save In-Progress</Button>
              <Button variant="primary" onClick={handleComplete} loading={actionLoading}>
                ✓ Complete Inspection
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                  setIsManageModalOpen(false);
                  navigate(`/app/maintenance?openNew=true&apartmentId=${selectedInspection.apartment_id}&propertyId=${selectedInspection.property_id}`);
                }}
              >
                🔧 Log Maintenance Ticket
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsManageModalOpen(false);
                  navigate(`/app/apartments?unitId=${selectedInspection.apartment_id}&propertyId=${selectedInspection.property_id}`);
                }}
              >
                🏢 View Unit Details
              </Button>
              {selectedInspection.reservation_code && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsManageModalOpen(false);
                    navigate(`/app/reservations?search=${encodeURIComponent(selectedInspection.reservation_code)}`);
                  }}
                >
                  📑 Reservation ({selectedInspection.reservation_code})
                </Button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-card-hover)', padding: '0.75rem', borderRadius: 'var(--radius-md)', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    style={{ fontWeight: 800, color: 'var(--brand-accent)', cursor: 'pointer', fontSize: '0.95rem' }}
                    onClick={() => {
                      setIsManageModalOpen(false);
                      navigate(`/app/properties?search=${encodeURIComponent(selectedInspection.property_name || '')}`);
                    }}
                    title="View Property"
                  >
                    🏢 {selectedInspection.property_name} ↗
                  </span>
                  {' — '}
                  <span
                    style={{ fontWeight: 800, color: 'var(--brand-accent)', cursor: 'pointer', fontSize: '0.95rem' }}
                    onClick={() => {
                      setIsManageModalOpen(false);
                      navigate(`/app/apartments?unitId=${selectedInspection.apartment_id}&propertyId=${selectedInspection.property_id}`);
                    }}
                    title="View Unit"
                  >
                    Unit {selectedInspection.unit_number} ↗
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Inspection Type: <strong>{selectedInspection.inspection_type}</strong>
                  {selectedInspection.guest_name ? ` • Guest: ${selectedInspection.guest_name}` : ''}
                </div>
              </div>
              <Badge status={selectedInspection.status}>{selectedInspection.status}</Badge>
            </div>

            {/* Condition Rating */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Unit Condition Assessment:</label>
              <select
                value={manageForm.condition_rating}
                onChange={(e) => setManageForm({ ...manageForm, condition_rating: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', marginTop: '0.25rem' }}
              >
                <option value="EXCELLENT">EXCELLENT (Pristine, no issues)</option>
                <option value="GOOD">GOOD (Normal minor wear, no damage)</option>
                <option value="FAIR">FAIR (Cleaning required)</option>
                <option value="POOR">POOR (Heavy soiling or maintenance needed)</option>
                <option value="DAMAGED">DAMAGED (Physical damage logged - triggers follow-up)</option>
              </select>
            </div>

            {/* Structured Damage Itemization */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Itemized Damage Logger ({manageForm.damage_items.length} items)
              </div>

              {manageForm.damage_items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {manageForm.damage_items.map((d) => (
                    <div
                      key={d.id || d.item}
                      style={{
                        padding: '0.5rem',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div>
                        <strong>{d.item}</strong> ({d.location}) • {d.severity}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{d.description}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700 }}>{formatNaira(d.estimated_cost)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDamage(d.id)}
                          style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontWeight: 700 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add damage input */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.4rem' }}>
                <input
                  type="text"
                  placeholder="Damaged Item (e.g. Lamp)"
                  value={newDamage.item}
                  onChange={(e) => setNewDamage({ ...newDamage, item: e.target.value })}
                  style={{ padding: '0.4rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
                <input
                  type="text"
                  placeholder="Location (e.g. Master Bedroom)"
                  value={newDamage.location}
                  onChange={(e) => setNewDamage({ ...newDamage, location: e.target.value })}
                  style={{ padding: '0.4rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
                <select
                  value={newDamage.severity}
                  onChange={(e) => setNewDamage({ ...newDamage, severity: e.target.value })}
                  style={{ padding: '0.4rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  <option value="MINOR">Minor</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="SEVERE">Severe</option>
                </select>
                <input
                  type="number"
                  placeholder="Est. Cost (₦)"
                  value={newDamage.estimated_cost}
                  onChange={(e) => setNewDamage({ ...newDamage, estimated_cost: e.target.value })}
                  style={{ padding: '0.4rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
                <Button variant="primary" size="sm" onClick={handleAddDamageItem}>
                  + Add Item
                </Button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Inspector Remarks:</label>
              <textarea
                rows={2}
                value={manageForm.notes}
                onChange={(e) => setManageForm({ ...manageForm, notes: e.target.value })}
                placeholder="Operational inspection remarks..."
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
