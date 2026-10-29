import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import { propertyService, apartmentService, reservationService, maintenanceService, inspectionService } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

export default function ApartmentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties, activePropertyId, setActivePropertyId, refreshProperties } = useProperty();
  const { addToast } = useToast();

  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState(searchParams.get('propertyId') || activePropertyId || 'all');

  // Related records for selected unit detail view
  const [unitReservations, setUnitReservations] = useState([]);
  const [unitMaintenance, setUnitMaintenance] = useState([]);
  const [unitInspections, setUnitInspections] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Modals state
  const [isAddPropertyModalOpen, setIsAddPropertyModalOpen] = useState(false);
  const [isEditPropertyModalOpen, setIsEditPropertyModalOpen] = useState(false);
  const [isAddUnitModalOpen, setIsAddUnitModalOpen] = useState(false);
  const [isEditUnitModalOpen, setIsEditUnitModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [selectedProperty, setSelectedProperty] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);

  // Form states
  const [propertyForm, setPropertyForm] = useState({
    code: '',
    name: '',
    description: '',
    address: '',
    city: 'Lagos',
    state: 'Lagos State',
    country: 'Nigeria',
    contact_phone: '',
    contact_email: '',
    amenities: '',
  });

  const [unitForm, setUnitForm] = useState({
    property_id: '',
    unit_number: '',
    unit_name: '',
    unit_type: 'Standard',
    floor: 1,
    capacity: 2,
    bedroom_count: 1,
    bathroom_count: 1,
    rate_per_night: '',
    status: 'AVAILABLE',
    amenities: '',
    notes: '',
  });

  const [statusUpdateForm, setStatusUpdateForm] = useState({
    status: 'AVAILABLE',
    notes: '',
  });

  // Sync selectedPropertyFilter with activePropertyId from context or searchParams
  useEffect(() => {
    const propParam = searchParams.get('propertyId');
    const searchParam = searchParams.get('search');
    const unitIdParam = searchParams.get('unitId');

    if (propParam) {
      setSelectedPropertyFilter(propParam);
      setActivePropertyId(propParam);
    } else if (activePropertyId) {
      setSelectedPropertyFilter(activePropertyId);
    }
    if (searchParam) {
      setSearch(searchParam);
    }
    if (unitIdParam) {
      apartmentService.getById(unitIdParam).then((res) => {
        if (res.data) handleOpenDetail(res.data);
      }).catch(() => {});
    }
  }, [searchParams, activePropertyId]);

  const fetchApartments = async () => {
    setLoading(true);
    try {
      const params = {
        propertyId: selectedPropertyFilter !== 'all' ? selectedPropertyFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        unitType: typeFilter !== 'ALL' ? typeFilter : undefined,
        search: search.trim() || undefined,
      };
      const res = await apartmentService.getAll(params);
      setApartments(res.data || []);
    } catch (err) {
      addToast(`Failed to load apartments: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApartments();
  }, [selectedPropertyFilter, statusFilter, typeFilter]);

  // Handlers for Property CRUD
  const handleOpenAddProperty = () => {
    setPropertyForm({
      code: '',
      name: '',
      description: '',
      address: '',
      city: 'Lagos',
      state: 'Lagos State',
      country: 'Nigeria',
      contact_phone: '',
      contact_email: '',
      amenities: '',
    });
    setIsAddPropertyModalOpen(true);
  };

  const handleCreateProperty = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...propertyForm,
        amenities: propertyForm.amenities ? propertyForm.amenities.split(',').map((s) => s.trim()) : [],
      };
      await propertyService.create(payload);
      addToast('Property registered successfully!', 'success');
      setIsAddPropertyModalOpen(false);
      refreshProperties();
      fetchApartments();
    } catch (err) {
      addToast(`Error creating property: ${err.message}`, 'error');
    }
  };

  const handleOpenEditProperty = (prop) => {
    setSelectedProperty(prop);
    setPropertyForm({
      code: prop.code,
      name: prop.name,
      description: prop.description || '',
      address: prop.address || '',
      city: prop.city || '',
      state: prop.state || '',
      country: prop.country || '',
      contact_phone: prop.contact_phone || '',
      contact_email: prop.contact_email || '',
      amenities: Array.isArray(prop.amenities) ? prop.amenities.join(', ') : '',
    });
    setIsEditPropertyModalOpen(true);
  };

  const handleUpdateProperty = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...propertyForm,
        amenities: propertyForm.amenities ? propertyForm.amenities.split(',').map((s) => s.trim()) : [],
      };
      await propertyService.update(selectedProperty.id, payload);
      addToast('Property updated successfully!', 'success');
      setIsEditPropertyModalOpen(false);
      refreshProperties();
    } catch (err) {
      addToast(`Error updating property: ${err.message}`, 'error');
    }
  };

  // Handlers for Unit CRUD
  const handleOpenAddUnit = () => {
    const defaultPropId = selectedPropertyFilter !== 'all' ? selectedPropertyFilter : properties[0]?.id || '';
    setUnitForm({
      property_id: defaultPropId,
      unit_number: '',
      unit_name: '',
      unit_type: 'Standard',
      floor: 1,
      capacity: 2,
      bedroom_count: 1,
      bathroom_count: 1,
      rate_per_night: '',
      status: 'AVAILABLE',
      amenities: '',
      notes: '',
    });
    setIsAddUnitModalOpen(true);
  };

  const handleCreateUnit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...unitForm,
        property_id: parseInt(unitForm.property_id, 10),
        floor: parseInt(unitForm.floor, 10) || 1,
        capacity: parseInt(unitForm.capacity, 10) || 2,
        bedroom_count: parseInt(unitForm.bedroom_count, 10) || 1,
        bathroom_count: parseInt(unitForm.bathroom_count, 10) || 1,
        rate_per_night: parseFloat(unitForm.rate_per_night),
        amenities: unitForm.amenities ? unitForm.amenities.split(',').map((s) => s.trim()) : [],
      };
      await apartmentService.create(payload);
      addToast('Apartment unit created successfully!', 'success');
      setIsAddUnitModalOpen(false);
      fetchApartments();
      refreshProperties();
    } catch (err) {
      addToast(`Error creating unit: ${err.message}`, 'error');
    }
  };

  const handleOpenEditUnit = (unit) => {
    setSelectedUnit(unit);
    setUnitForm({
      property_id: unit.property_id,
      unit_number: unit.unit_number,
      unit_name: unit.unit_name,
      unit_type: unit.unit_type,
      floor: unit.floor || 1,
      capacity: unit.capacity || 2,
      bedroom_count: unit.bedroom_count || 1,
      bathroom_count: unit.bathroom_count || 1,
      rate_per_night: unit.rate_per_night,
      status: unit.status,
      amenities: Array.isArray(unit.amenities) ? unit.amenities.join(', ') : '',
      notes: unit.notes || '',
    });
    setIsEditUnitModalOpen(true);
  };

  const handleUpdateUnit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...unitForm,
        floor: parseInt(unitForm.floor, 10),
        capacity: parseInt(unitForm.capacity, 10),
        bedroom_count: parseInt(unitForm.bedroom_count, 10),
        bathroom_count: parseInt(unitForm.bathroom_count, 10),
        rate_per_night: parseFloat(unitForm.rate_per_night),
        amenities: unitForm.amenities ? unitForm.amenities.split(',').map((s) => s.trim()) : [],
      };
      await apartmentService.update(selectedUnit.id, payload);
      addToast('Apartment unit updated successfully!', 'success');
      setIsEditUnitModalOpen(false);
      fetchApartments();
    } catch (err) {
      addToast(`Error updating unit: ${err.message}`, 'error');
    }
  };

  // Status Change Workflow
  const handleOpenStatusModal = (unit) => {
    setSelectedUnit(unit);
    setStatusUpdateForm({
      status: unit.status,
      notes: '',
    });
    setIsStatusModalOpen(true);
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    try {
      await apartmentService.updateStatus(selectedUnit.id, statusUpdateForm);
      addToast(`Unit #${selectedUnit.unit_number} status updated to ${statusUpdateForm.status}!`, 'success');
      setIsStatusModalOpen(false);
      fetchApartments();
      refreshProperties();
    } catch (err) {
      addToast(`Status update failed: ${err.message}`, 'error');
    }
  };

  // View Detail & Load Related Records
  const handleOpenDetail = async (unit) => {
    setSelectedUnit(unit);
    setIsDetailModalOpen(true);
    setRelatedLoading(true);
    try {
      const [resData, maintData, inspData] = await Promise.allSettled([
        reservationService.getAll({ apartmentId: unit.id }),
        maintenanceService.getAll({ apartmentId: unit.id }),
        inspectionService.getAll({ apartmentId: unit.id }),
      ]);
      setUnitReservations(resData.status === 'fulfilled' ? resData.value.data || [] : []);
      setUnitMaintenance(maintData.status === 'fulfilled' ? maintData.value.data || [] : []);
      setUnitInspections(inspData.status === 'fulfilled' ? inspData.value.data || [] : []);
    } catch {
      setUnitReservations([]);
      setUnitMaintenance([]);
      setUnitInspections([]);
    } finally {
      setRelatedLoading(false);
    }
  };

  // Status Badge Mapper
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return <Badge status="success">AVAILABLE</Badge>;
      case 'READY':
        return <Badge status="success">READY</Badge>;
      case 'RESERVED':
        return <Badge status="info">RESERVED</Badge>;
      case 'OCCUPIED':
        return <Badge status="danger">OCCUPIED</Badge>;
      case 'DIRTY':
        return <Badge status="warning">DIRTY</Badge>;
      case 'CLEANING':
        return <Badge status="warning">CLEANING</Badge>;
      case 'MAINTENANCE':
        return <Badge status="danger">MAINTENANCE</Badge>;
      case 'BLOCKED':
      case 'OUT_OF_SERVICE':
        return <Badge status="neutral">{status}</Badge>;
      default:
        return <Badge status="neutral">{status}</Badge>;
    }
  };

  // Table Columns
  const columns = [
    {
      header: 'Unit',
      key: 'unit_number',
      render: (val, row) => (
        <div
          style={{ cursor: 'pointer' }}
          onClick={() => handleOpenDetail(row)}
          title="Click to view full unit details and linked records"
        >
          <strong style={{ color: 'var(--brand-accent, #3b82f6)', fontSize: '1rem', textDecoration: 'underline' }}>{val}</strong>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{row.unit_name}</div>
        </div>
      ),
    },
    {
      header: 'Property',
      key: 'property_name',
      render: (val, row) => (
        <div
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(`/app/properties?search=${encodeURIComponent(row.property_code)}`)}
          title="Open property portfolio profile"
        >
          <span style={{ fontWeight: 500 }}>{val}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: 600 }}>{row.property_code} ↗</div>
        </div>
      ),
    },
    {
      header: 'Type & Floor',
      key: 'unit_type',
      render: (val, row) => (
        <span>
          {val} {row.floor ? `(Floor ${row.floor})` : ''}
        </span>
      ),
    },
    {
      header: 'Capacity',
      key: 'capacity',
      render: (val, row) => (
        <span>
          {val} Guests • {row.bedroom_count || 1} Bed • {row.bathroom_count || 1} Bath
        </span>
      ),
    },
    {
      header: 'Rate / Night',
      key: 'rate_per_night',
      render: (val) => <strong style={{ color: 'var(--text-primary)' }}>{formatNaira(val)}</strong>,
    },
    {
      header: 'Operational Status',
      key: 'status',
      render: (val) => renderStatusBadge(val),
    },
    {
      header: 'Actions',
      key: 'actions',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={() => handleOpenDetail(row)}>
            Details
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleOpenStatusModal(row)}>
            Status
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleOpenEditUnit(row)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">
            <span>Properties, Apartments & Units</span>
            <Badge status="success">PHASE 3 ACTIVE</Badge>
          </h1>
          <p className="page-subtitle">
            Enterprise property hierarchy management, individual unit configuration, operational housekeeping lifecycle, and authoritative rates.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={handleOpenAddProperty}>
            + Add Property
          </Button>
          <Button variant="primary" onClick={handleOpenAddUnit}>
            + Add Apartment Unit
          </Button>
        </div>
      </div>

      {/* Property Showcase & Dynamic Statistics */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          PROPERTIES PORTFOLIO OVERVIEW
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {properties.map((prop) => {
            const isSelected = String(selectedPropertyFilter) === String(prop.id);
            return (
              <div
                key={prop.id}
                style={{
                  background: 'var(--bg-card)',
                  border: isSelected ? '2px solid var(--accent-gold)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                        {prop.code}
                      </span>
                      <h4 style={{ margin: '0.2rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        {prop.name}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {prop.address ? `${prop.address}, ${prop.city}` : prop.city}
                      </p>
                    </div>
                    <Badge status={prop.status === 'ACTIVE' ? 'success' : 'warning'}>{prop.status}</Badge>
                  </div>

                  {/* Real Stats Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '0.5rem',
                      marginTop: '1rem',
                      padding: '0.75rem',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {prop.total_units || prop.unit_count || 0}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>TOTAL UNITS</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-success)' }}>
                        {prop.available_units || 0}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>AVAILABLE</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-danger)' }}>
                        {prop.occupied_units || 0}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>OCCUPIED</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-warning)' }}>
                        {prop.maintenance_units || 0}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>MAINTENANCE</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <Button
                    size="sm"
                    variant={isSelected ? 'primary' : 'outline'}
                    onClick={() => {
                      setSelectedPropertyFilter(isSelected ? 'all' : prop.id);
                      setActivePropertyId(isSelected ? 'all' : prop.id);
                    }}
                  >
                    {isSelected ? '✓ Filtering By This' : 'Filter Units'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleOpenEditProperty(prop)}>
                    Edit Building
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Apartment Units Section */}
      <Card title="Apartment Units Inventory">
        {/* Filter Controls Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1.25rem',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', flex: 1, minWidth: '300px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search unit #, name, or amenities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: '280px' }}
            />

            <select
              className="form-control"
              value={selectedPropertyFilter}
              onChange={(e) => {
                setSelectedPropertyFilter(e.target.value);
                setActivePropertyId(e.target.value);
              }}
              style={{ maxWidth: '200px' }}
            >
              <option value="all">All Properties ({properties.length})</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>

            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ maxWidth: '170px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="READY">READY</option>
              <option value="RESERVED">RESERVED</option>
              <option value="OCCUPIED">OCCUPIED</option>
              <option value="DIRTY">DIRTY</option>
              <option value="CLEANING">CLEANING</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
              <option value="BLOCKED">BLOCKED</option>
              <option value="OUT_OF_SERVICE">OUT OF SERVICE</option>
            </select>

            <select
              className="form-control"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ maxWidth: '160px' }}
            >
              <option value="ALL">All Unit Types</option>
              <option value="Studio">Studio</option>
              <option value="Standard">Standard</option>
              <option value="Deluxe">Deluxe</option>
              <option value="Executive">Executive</option>
              <option value="One Bedroom">One Bedroom</option>
              <option value="Two Bedroom">Two Bedroom</option>
              <option value="Penthouse">Penthouse</option>
            </select>

            <Button variant="outline" size="sm" onClick={fetchApartments}>
              Filter
            </Button>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Showing <strong>{apartments.length}</strong> unit{apartments.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Data Table */}
        <Table columns={columns} data={apartments} loading={loading} emptyMessage="No units matching the criteria." />
      </Card>

      {/* 1. ADD PROPERTY MODAL */}
      <Modal
        isOpen={isAddPropertyModalOpen}
        onClose={() => setIsAddPropertyModalOpen(false)}
        size="lg"
        icon="🏢"
        title="Add New Property / Building"
        subtitle="Register a new serviced residential building or location into the BFA portfolio"
      >
        <form onSubmit={handleCreateProperty} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Property Code *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. VI01"
                required
                value={propertyForm.code}
                onChange={(e) => setPropertyForm({ ...propertyForm, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className="form-label">Property Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Victoria Island Executive Tower"
                required
                value={propertyForm.name}
                onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="High-end serviced residential property..."
              value={propertyForm.description}
              onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Street Address *</label>
            <input
              type="text"
              className="form-control"
              placeholder="12 Adeola Odeku Street"
              required
              value={propertyForm.address}
              onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">City *</label>
              <input
                type="text"
                className="form-control"
                required
                value={propertyForm.city}
                onChange={(e) => setPropertyForm({ ...propertyForm, city: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">State</label>
              <input
                type="text"
                className="form-control"
                value={propertyForm.state}
                onChange={(e) => setPropertyForm({ ...propertyForm, state: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Country</label>
              <input
                type="text"
                className="form-control"
                value={propertyForm.country}
                onChange={(e) => setPropertyForm({ ...propertyForm, country: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Contact Phone</label>
              <input
                type="text"
                className="form-control"
                placeholder="+234 800 000 0000"
                value={propertyForm.contact_phone}
                onChange={(e) => setPropertyForm({ ...propertyForm, contact_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Contact Email</label>
              <input
                type="email"
                className="form-control"
                placeholder="reception@bfa.ng"
                value={propertyForm.contact_email}
                onChange={(e) => setPropertyForm({ ...propertyForm, contact_email: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Amenities (comma-separated)</label>
            <input
              type="text"
              className="form-control"
              placeholder="24/7 Power, Fiber Internet, Swimming Pool, Gym, Concierge"
              value={propertyForm.amenities}
              onChange={(e) => setPropertyForm({ ...propertyForm, amenities: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" onClick={() => setIsAddPropertyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Property
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. EDIT PROPERTY MODAL */}
      <Modal
        isOpen={isEditPropertyModalOpen}
        onClose={() => setIsEditPropertyModalOpen(false)}
        size="lg"
        icon="🏢"
        title={`Edit Property: ${selectedProperty?.name}`}
        subtitle="Update property contact info, amenities, and operational configuration"
      >
        <form onSubmit={handleUpdateProperty} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Property Name *</label>
            <input
              type="text"
              className="form-control"
              required
              value={propertyForm.name}
              onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Description</label>
            <textarea
              className="form-control"
              rows={2}
              value={propertyForm.description}
              onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Address</label>
            <input
              type="text"
              className="form-control"
              value={propertyForm.address}
              onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Contact Phone</label>
              <input
                type="text"
                className="form-control"
                value={propertyForm.contact_phone}
                onChange={(e) => setPropertyForm({ ...propertyForm, contact_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Contact Email</label>
              <input
                type="email"
                className="form-control"
                value={propertyForm.contact_email}
                onChange={(e) => setPropertyForm({ ...propertyForm, contact_email: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Amenities (comma-separated)</label>
            <input
              type="text"
              className="form-control"
              value={propertyForm.amenities}
              onChange={(e) => setPropertyForm({ ...propertyForm, amenities: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" onClick={() => setIsEditPropertyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3. ADD APARTMENT UNIT MODAL */}
      <Modal
        isOpen={isAddUnitModalOpen}
        onClose={() => setIsAddUnitModalOpen(false)}
        size="lg"
        icon="🏠"
        title="Add Apartment Unit"
        subtitle="Create a new physical serviced apartment unit under an existing property"
      >
        <form onSubmit={handleCreateUnit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Parent Property *</label>
            <select
              className="form-control"
              required
              value={unitForm.property_id}
              onChange={(e) => setUnitForm({ ...unitForm, property_id: e.target.value })}
            >
              <option value="">Select Property...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Unit Number *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 101"
                required
                value={unitForm.unit_number}
                onChange={(e) => setUnitForm({ ...unitForm, unit_number: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Unit Title / Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Penthouse Horizon 101"
                required
                value={unitForm.unit_name}
                onChange={(e) => setUnitForm({ ...unitForm, unit_name: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Unit Type</label>
              <select
                className="form-control"
                value={unitForm.unit_type}
                onChange={(e) => setUnitForm({ ...unitForm, unit_type: e.target.value })}
              >
                <option value="Studio">Studio</option>
                <option value="Standard">Standard</option>
                <option value="Deluxe">Deluxe</option>
                <option value="Executive">Executive</option>
                <option value="One Bedroom">One Bedroom</option>
                <option value="Two Bedroom">Two Bedroom</option>
                <option value="Penthouse">Penthouse</option>
              </select>
            </div>
            <div>
              <label className="form-label">Floor</label>
              <input
                type="number"
                className="form-control"
                min="0"
                value={unitForm.floor}
                onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Capacity (Guests)</label>
              <input
                type="number"
                className="form-control"
                min="1"
                value={unitForm.capacity}
                onChange={(e) => setUnitForm({ ...unitForm, capacity: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Bedrooms</label>
              <input
                type="number"
                className="form-control"
                min="1"
                value={unitForm.bedroom_count}
                onChange={(e) => setUnitForm({ ...unitForm, bedroom_count: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Bathrooms</label>
              <input
                type="number"
                className="form-control"
                min="1"
                value={unitForm.bathroom_count}
                onChange={(e) => setUnitForm({ ...unitForm, bathroom_count: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Base Rate per Night (₦) *</label>
              <input
                type="number"
                className="form-control"
                placeholder="250000.00"
                step="0.01"
                required
                value={unitForm.rate_per_night}
                onChange={(e) => setUnitForm({ ...unitForm, rate_per_night: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Initial Status</label>
              <select
                className="form-control"
                value={unitForm.status}
                onChange={(e) => setUnitForm({ ...unitForm, status: e.target.value })}
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="READY">READY</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Amenities (comma-separated)</label>
            <input
              type="text"
              className="form-control"
              placeholder="King Bed, Balcony, Smart TV, Espresso Machine"
              value={unitForm.amenities}
              onChange={(e) => setUnitForm({ ...unitForm, amenities: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" onClick={() => setIsAddUnitModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Unit
            </Button>
          </div>
        </form>
      </Modal>

      {/* 4. EDIT UNIT MODAL */}
      <Modal
        isOpen={isEditUnitModalOpen}
        onClose={() => setIsEditUnitModalOpen(false)}
        size="md"
        icon="✏️"
        title={`Edit Unit: #${selectedUnit?.unit_number}`}
        subtitle="Modify unit details, floor, capacity, and nightly pricing"
      >
        <form onSubmit={handleUpdateUnit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Unit Number</label>
              <input
                type="text"
                className="form-control"
                disabled
                value={unitForm.unit_number}
              />
            </div>
            <div>
              <label className="form-label">Unit Title / Name *</label>
              <input
                type="text"
                className="form-control"
                required
                value={unitForm.unit_name}
                onChange={(e) => setUnitForm({ ...unitForm, unit_name: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Unit Type</label>
              <select
                className="form-control"
                value={unitForm.unit_type}
                onChange={(e) => setUnitForm({ ...unitForm, unit_type: e.target.value })}
              >
                <option value="Studio">Studio</option>
                <option value="Standard">Standard</option>
                <option value="Deluxe">Deluxe</option>
                <option value="Executive">Executive</option>
                <option value="One Bedroom">One Bedroom</option>
                <option value="Two Bedroom">Two Bedroom</option>
                <option value="Penthouse">Penthouse</option>
              </select>
            </div>
            <div>
              <label className="form-label">Base Rate per Night (₦) *</label>
              <input
                type="number"
                className="form-control"
                step="0.01"
                required
                value={unitForm.rate_per_night}
                onChange={(e) => setUnitForm({ ...unitForm, rate_per_night: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Capacity</label>
              <input
                type="number"
                className="form-control"
                value={unitForm.capacity}
                onChange={(e) => setUnitForm({ ...unitForm, capacity: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Bedrooms</label>
              <input
                type="number"
                className="form-control"
                value={unitForm.bedroom_count}
                onChange={(e) => setUnitForm({ ...unitForm, bedroom_count: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Bathrooms</label>
              <input
                type="number"
                className="form-control"
                value={unitForm.bathroom_count}
                onChange={(e) => setUnitForm({ ...unitForm, bathroom_count: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Amenities</label>
            <input
              type="text"
              className="form-control"
              value={unitForm.amenities}
              onChange={(e) => setUnitForm({ ...unitForm, amenities: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" onClick={() => setIsEditUnitModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* 5. STATUS WORKFLOW MODAL */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        size="sm"
        icon="🧹"
        title={`Update Status: Unit #${selectedUnit?.unit_number}`}
        subtitle="Transition physical unit state across housekeeping and maintenance"
      >
        <form onSubmit={handleUpdateStatus} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Operational Status *</label>
            <select
              className="form-control"
              value={statusUpdateForm.status}
              onChange={(e) => setStatusUpdateForm({ ...statusUpdateForm, status: e.target.value })}
            >
              <option value="AVAILABLE">AVAILABLE (Ready for guest assignment)</option>
              <option value="READY">READY (Housekeeping inspected)</option>
              <option value="CLEANING">CLEANING (Housekeeping in progress)</option>
              <option value="DIRTY">DIRTY (Guest departed, cleaning required)</option>
              <option value="OCCUPIED">OCCUPIED (Guest currently in-house)</option>
              <option value="MAINTENANCE">MAINTENANCE (Repairs required)</option>
              <option value="BLOCKED">BLOCKED (Operational hold)</option>
              <option value="OUT_OF_SERVICE">OUT OF SERVICE (Decommissioned)</option>
            </select>
          </div>

          <div>
            <label className="form-label">Reason / Housekeeping Log Note</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="e.g. Completed scheduled linen replacement and AC filter service."
              value={statusUpdateForm.notes}
              onChange={(e) => setStatusUpdateForm({ ...statusUpdateForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Update Status
            </Button>
          </div>
        </form>
      </Modal>

      {/* 6. UNIT DETAIL MODAL WITH CONNECTED RECORDS */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        size="lg"
        icon="🔍"
        title={`Unit Details: #${selectedUnit?.unit_number} - ${selectedUnit?.unit_name}`}
        subtitle="Complete architectural specifications, current occupancy, and linked operational records"
      >
        {selectedUnit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header info with link to parent building */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>PARENT BUILDING</div>
                <div
                  style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-accent, #3b82f6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    navigate(`/app/properties?search=${encodeURIComponent(selectedUnit.property_code)}`);
                  }}
                  title="View building details in Properties registry"
                >
                  🏢 {selectedUnit.property_name} ({selectedUnit.property_code}) ↗
                </div>
              </div>
              <div>{renderStatusBadge(selectedUnit.status)}</div>
            </div>

            {/* Active Stay Banner if Occupied or Reserved */}
            {(() => {
              const activeRes = unitReservations.find((r) => ['CHECKED_IN', 'CONFIRMED'].includes(r.status));
              if (!activeRes) return null;
              return (
                <div style={{ padding: '0.85rem', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb' }}>CURRENT ACTIVE STAY</div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {activeRes.tenant_name || activeRes.guest_name} — {activeRes.reservation_code}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Check-in: {activeRes.check_in_date} • 1-Night Max Stay
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      navigate(`/app/reservations?search=${encodeURIComponent(activeRes.reservation_code)}`);
                    }}
                  >
                    View Booking ↗
                  </Button>
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>UNIT TYPE</div>
                <div style={{ fontWeight: 600 }}>{selectedUnit.unit_type}</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>FLOOR</div>
                <div style={{ fontWeight: 600 }}>Floor {selectedUnit.floor || 1}</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>NIGHTLY RATE</div>
                <div style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>
                  {formatNaira(selectedUnit.rate_per_night)}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>CAPACITY</div>
                <div style={{ fontWeight: 600 }}>{selectedUnit.capacity || 2} Persons</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>BEDROOMS</div>
                <div style={{ fontWeight: 600 }}>{selectedUnit.bedroom_count || 1} Room(s)</div>
              </div>
              <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>BATHROOMS</div>
                <div style={{ fontWeight: 600 }}>{selectedUnit.bathroom_count || 1} Bath(s)</div>
              </div>
            </div>

            {/* Linked Records Section */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                Connected Operational Records
              </div>

              {relatedLoading ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                  Loading linked reservations, maintenance, and inspections...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Recent Stays */}
                  <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        RESERVATIONS HISTORY ({unitReservations.length})
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsDetailModalOpen(false);
                          navigate(`/app/reservations?search=${encodeURIComponent(selectedUnit.unit_number)}`);
                        }}
                      >
                        All Unit Bookings ↗
                      </Button>
                    </div>
                    {unitReservations.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No historical bookings found for this unit.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '120px', overflowY: 'auto' }}>
                        {unitReservations.slice(0, 3).map((r) => (
                          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', padding: '0.25rem 0', borderBottom: '1px dashed var(--border-color)' }}>
                            <div>
                              <strong style={{ color: 'var(--brand-accent)', cursor: 'pointer' }} onClick={() => { setIsDetailModalOpen(false); navigate(`/app/reservations?search=${r.reservation_code}`); }}>
                                {r.reservation_code}
                              </strong>
                              {' '}— {r.tenant_name || r.guest_name} ({r.check_in_date})
                            </div>
                            <Badge status={r.status === 'CONFIRMED' ? 'info' : r.status === 'CHECKED_IN' ? 'success' : 'neutral'}>{r.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Maintenance Orders */}
                  <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        MAINTENANCE WORK ORDERS ({unitMaintenance.length})
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsDetailModalOpen(false);
                          navigate(`/app/maintenance?apartmentId=${selectedUnit.id}&propertyId=${selectedUnit.property_id}`);
                        }}
                      >
                        All Unit Work Orders ↗
                      </Button>
                    </div>
                    {unitMaintenance.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No maintenance work orders logged for this unit.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '120px', overflowY: 'auto' }}>
                        {unitMaintenance.slice(0, 3).map((m) => (
                          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', padding: '0.25rem 0', borderBottom: '1px dashed var(--border-color)' }}>
                            <div>
                              <strong style={{ color: 'var(--brand-accent)', cursor: 'pointer' }} onClick={() => { setIsDetailModalOpen(false); navigate(`/app/maintenance?search=${m.issue_code || m.issue_title}`); }}>
                                {m.issue_code || `#${m.id}`}
                              </strong>
                              {' '}— {m.issue_title}
                            </div>
                            <Badge status={m.status === 'RESOLVED' ? 'success' : m.status === 'OPEN' ? 'warning' : 'danger'}>{m.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Unit Inspections */}
                  <div style={{ background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        INSPECTIONS ({unitInspections.length})
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIsDetailModalOpen(false);
                          navigate(`/app/inspections?apartmentId=${selectedUnit.id}&propertyId=${selectedUnit.property_id}`);
                        }}
                      >
                        All Unit Inspections ↗
                      </Button>
                    </div>
                    {unitInspections.length === 0 ? (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No inspections recorded for this unit.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '120px', overflowY: 'auto' }}>
                        {unitInspections.slice(0, 3).map((insp) => (
                          <div key={insp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', padding: '0.25rem 0', borderBottom: '1px dashed var(--border-color)' }}>
                            <div>
                              <strong style={{ color: 'var(--brand-accent)', cursor: 'pointer' }} onClick={() => { setIsDetailModalOpen(false); navigate(`/app/inspections?search=${insp.inspection_code}`); }}>
                                {insp.inspection_code}
                              </strong>
                              {' '}— {insp.inspection_type} ({insp.condition_rating || 'N/A'})
                            </div>
                            <Badge status={insp.status === 'COMPLETED' ? 'success' : 'warning'}>{insp.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>AMENITIES</h5>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {Array.isArray(selectedUnit.amenities) && selectedUnit.amenities.length > 0 ? (
                  selectedUnit.amenities.map((am, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '0.25rem 0.6rem',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      ✓ {am}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Standard BFA amenities suite</span>
                )}
              </div>
            </div>

            {selectedUnit.notes && (
              <div>
                <h5 style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>OPERATIONAL NOTES</h5>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  {selectedUnit.notes}
                </p>
              </div>
            )}

            {/* Modal Actions Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(selectedUnit.status === 'AVAILABLE' || selectedUnit.status === 'READY') && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      navigate(`/app/reservations?apartmentId=${selectedUnit.id}&propertyId=${selectedUnit.property_id}`);
                    }}
                  >
                    + Book Unit (1-Night Policy)
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    navigate(`/app/maintenance?apartmentId=${selectedUnit.id}&propertyId=${selectedUnit.property_id}`);
                  }}
                >
                  Log Maintenance
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    navigate(`/app/inspections?apartmentId=${selectedUnit.id}&propertyId=${selectedUnit.property_id}`);
                  }}
                >
                  Schedule Inspection
                </Button>
              </div>

              <Button variant="secondary" onClick={() => setIsDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
