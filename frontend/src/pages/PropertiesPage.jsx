import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import { propertyService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNaira } from '../utils/currency';

export default function PropertiesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties, activePropertyId, setActivePropertyId, refreshProperties } = useProperty();
  const { user, isSuperAdmin } = useAuth();
  const { addToast } = useToast();

  const canManageProperties = ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(user?.role);

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const prevSearchParamRef = useRef(searchParams.get('search'));
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Synchronize URL search parameter changes while component remains mounted
  useEffect(() => {
    const currentSearchParam = searchParams.get('search');
    if (currentSearchParam !== prevSearchParamRef.current) {
      prevSearchParamRef.current = currentSearchParam;
      setSearch(currentSearchParam || '');
    }
  }, [searchParams]);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);

  // Property units quick view modal
  const [unitsModalProperty, setUnitsModalProperty] = useState(null);
  const [propertyUnits, setPropertyUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

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

  const [statusForm, setStatusForm] = useState({
    status: 'ACTIVE',
  });

  // Filter properties
  const filteredProperties = useMemo(() => {
    return properties.filter((prop) => {
      const matchesSearch =
        search === '' ||
        prop.name?.toLowerCase().includes(search.toLowerCase()) ||
        prop.code?.toLowerCase().includes(search.toLowerCase()) ||
        prop.address?.toLowerCase().includes(search.toLowerCase()) ||
        prop.city?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || prop.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [properties, search, statusFilter]);

  // Handlers for Add Property
  const handleOpenAdd = () => {
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
    setIsAddModalOpen(true);
  };

  const handleCreateProperty = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...propertyForm,
        amenities: propertyForm.amenities
          ? propertyForm.amenities.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };
      await propertyService.create(payload);
      addToast('Property registered successfully!', 'success');
      setIsAddModalOpen(false);
      refreshProperties();
    } catch (err) {
      addToast(`Error creating property: ${err.message}`, 'error');
    }
  };

  // Handlers for Edit Property
  const handleOpenEdit = (prop) => {
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
      amenities: Array.isArray(prop.amenities)
        ? prop.amenities.join(', ')
        : typeof prop.amenities === 'string'
        ? prop.amenities
        : '',
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateProperty = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...propertyForm,
        amenities: propertyForm.amenities
          ? propertyForm.amenities.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };
      await propertyService.update(selectedProperty.id, payload);
      addToast('Property updated successfully!', 'success');
      setIsEditModalOpen(false);
      refreshProperties();
    } catch (err) {
      addToast(`Error updating property: ${err.message}`, 'error');
    }
  };

  // Handlers for Status Change
  const handleOpenStatusModal = (prop) => {
    setSelectedProperty(prop);
    setStatusForm({ status: prop.status || 'ACTIVE' });
    setIsStatusModalOpen(true);
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    try {
      await propertyService.updateStatus(selectedProperty.id, statusForm);
      addToast(`Property ${selectedProperty.name} status updated to ${statusForm.status}!`, 'success');
      setIsStatusModalOpen(false);
      refreshProperties();
    } catch (err) {
      addToast(`Error updating status: ${err.message}`, 'error');
    }
  };

  // Navigation to Apartments
  const handleViewApartments = (propertyId) => {
    setActivePropertyId(String(propertyId));
    navigate(`/app/apartments?propertyId=${propertyId}`);
  };

  // Quick Units inspection for property
  const handleOpenUnitsModal = async (prop) => {
    setUnitsModalProperty(prop);
    setUnitsLoading(true);
    try {
      const res = await propertyService.getApartments(prop.id);
      setPropertyUnits(res.data || []);
    } catch (err) {
      addToast(`Error loading units: ${err.message}`, 'error');
      setPropertyUnits([]);
    } finally {
      setUnitsLoading(false);
    }
  };

  return (
    <div>
      {/* 1. Page Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 className="page-title" style={{ margin: 0 }}>
              Properties & Buildings
            </h1>
            <Badge status="info">{properties.length} Properties</Badge>
          </div>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Authoritative building portfolio, multi-property configurations, address information, and operational statuses.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/app/apartments')}>
            View All Units
          </Button>
          {canManageProperties && (
            <Button variant="primary" onClick={handleOpenAdd}>
              + Add Property
            </Button>
          )}
        </div>
      </div>

      {/* 2. Filters & Search Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '1.5rem',
          background: 'var(--bg-card)',
          padding: '1rem',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ flex: '1 1 240px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search by building name, code, address, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Status:</span>
          {['ALL', 'ACTIVE', 'INACTIVE', 'MAINTENANCE'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`filter-pill ${statusFilter === status ? 'active' : ''}`}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: statusFilter === status ? '1px solid var(--accent-gold)' : '1px solid var(--border-color)',
                background: statusFilter === status ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                color: statusFilter === status ? 'var(--accent-gold)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Property Cards Grid */}
      {filteredProperties.length === 0 ? (
        <Card>
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ margin: '0 auto 1rem', opacity: 0.5 }}
            >
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
              <path d="M9 22v-4h6v4" />
              <path d="M8 6h.01" />
              <path d="M16 6h.01" />
              <path d="M8 10h.01" />
              <path d="M16 10h.01" />
            </svg>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              No Properties Found
            </h3>
            <p style={{ fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
              {search || statusFilter !== 'ALL'
                ? 'Try adjusting your search query or status filter.'
                : 'Get started by creating your first residential property or building.'}
            </p>
            <Button variant="primary" onClick={handleOpenAdd}>
              + Add Property
            </Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
          {filteredProperties.map((prop) => {
            const isCurrentlySelected = String(activePropertyId) === String(prop.id);
            const amenitiesList = Array.isArray(prop.amenities)
              ? prop.amenities
              : typeof prop.amenities === 'string'
              ? JSON.parse(prop.amenities || '[]')
              : [];

            return (
              <Card key={prop.id}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    justifyContent: 'space-between',
                    gap: '1.25rem',
                  }}
                >
                  {/* Top info */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span
                        style={{
                          background: 'rgba(212, 175, 55, 0.15)',
                          color: 'var(--accent-gold)',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '4px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {prop.code}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {isCurrentlySelected && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#10b981',
                              background: 'rgba(16, 185, 129, 0.1)',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '9999px',
                            }}
                          >
                            ● ACTIVE CONTEXT
                          </span>
                        )}
                        <Badge
                          status={
                            prop.status === 'ACTIVE'
                              ? 'success'
                              : prop.status === 'MAINTENANCE'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {prop.status}
                        </Badge>
                      </div>
                    </div>

                    <h3 style={{ margin: '0.25rem 0 0.5rem', fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                      {prop.name}
                    </h3>

                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {prop.address ? `${prop.address}, ${prop.city}` : prop.city || 'Lagos, Nigeria'}
                    </p>

                    {prop.description && (
                      <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {prop.description}
                      </p>
                    )}

                    {/* Contact Info */}
                    {(prop.contact_phone || prop.contact_email) && (
                      <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {prop.contact_phone && <div>📞 {prop.contact_phone}</div>}
                        {prop.contact_email && <div>✉️ {prop.contact_email}</div>}
                      </div>
                    )}

                    {/* Unit Capacity & Stats */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.5rem',
                        marginTop: '1rem',
                        padding: '0.75rem',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        textAlign: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {prop.total_units || prop.unit_count || 0}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>TOTAL UNITS</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10b981' }}>
                          {prop.available_units ?? '-'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>AVAILABLE</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ef4444' }}>
                          {prop.occupied_units ?? '-'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>OCCUPIED</div>
                      </div>
                    </div>

                    {/* Amenities Tags */}
                    {amenitiesList.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.85rem' }}>
                        {amenitiesList.slice(0, 5).map((amenity, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.72rem',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '4px',
                            }}
                          >
                            ✓ {amenity}
                          </span>
                        ))}
                        {amenitiesList.length > 5 && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                            +{amenitiesList.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.4rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--border-color)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleViewApartments(prop.id)}
                      style={{ flex: '1 1 auto' }}
                      title="Filter and manage all apartments in this building"
                    >
                      Units
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleOpenUnitsModal(prop)}
                      title="Quick inspection of units inside this building"
                    >
                      Quick List
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/app/maintenance?propertyId=${prop.id}`)}
                      title="View maintenance work orders for this property"
                    >
                      Maintenance
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/app/inspections?propertyId=${prop.id}`)}
                      title="View unit inspections for this property"
                    >
                      Inspections
                    </Button>
                    {canManageProperties && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleOpenStatusModal(prop)}>
                          Status
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(prop)}>
                          Edit
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Add Property */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Register New Property / Building">
        <form onSubmit={handleCreateProperty} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Property Code *</label>
              <input
                type="text"
                className="input-field"
                required
                maxLength={20}
                placeholder="e.g. GHT"
                value={propertyForm.code}
                onChange={(e) => setPropertyForm({ ...propertyForm, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className="form-label">Building Name *</label>
              <input
                type="text"
                className="input-field"
                required
                placeholder="e.g. Grand Horizon Tower"
                value={propertyForm.name}
                onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Physical Street Address *</label>
            <input
              type="text"
              className="input-field"
              required
              placeholder="e.g. 12 Bishop Aboyade Cole, Victoria Island"
              value={propertyForm.address}
              onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label className="form-label">City *</label>
              <input
                type="text"
                className="input-field"
                required
                value={propertyForm.city}
                onChange={(e) => setPropertyForm({ ...propertyForm, city: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">State</label>
              <input
                type="text"
                className="input-field"
                value={propertyForm.state}
                onChange={(e) => setPropertyForm({ ...propertyForm, state: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Country</label>
              <input
                type="text"
                className="input-field"
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
                className="input-field"
                placeholder="+234 800 ..."
                value={propertyForm.contact_phone}
                onChange={(e) => setPropertyForm({ ...propertyForm, contact_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Contact Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="property@bfa.com"
                value={propertyForm.contact_email}
                onChange={(e) => setPropertyForm({ ...propertyForm, contact_email: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Global Amenities (Comma-separated)</label>
            <input
              type="text"
              className="input-field"
              placeholder="Fiber Internet, Swimming Pool, Gym, 24/7 Power, Concierge"
              value={propertyForm.amenities}
              onChange={(e) => setPropertyForm({ ...propertyForm, amenities: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Description / Operational Notes</label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Summary of property amenities, location advantages, or concierge services..."
              value={propertyForm.description}
              onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Register Property
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Property */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit Property — ${propertyForm.name}`}>
        <form onSubmit={handleUpdateProperty} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
            <div>
              <label className="form-label">Property Code</label>
              <input
                type="text"
                className="input-field"
                disabled
                value={propertyForm.code}
                style={{ opacity: 0.7 }}
              />
            </div>
            <div>
              <label className="form-label">Building Name *</label>
              <input
                type="text"
                className="input-field"
                required
                value={propertyForm.name}
                onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Physical Street Address *</label>
            <input
              type="text"
              className="input-field"
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
                className="input-field"
                required
                value={propertyForm.city}
                onChange={(e) => setPropertyForm({ ...propertyForm, city: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">State</label>
              <input
                type="text"
                className="input-field"
                value={propertyForm.state}
                onChange={(e) => setPropertyForm({ ...propertyForm, state: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Country</label>
              <input
                type="text"
                className="input-field"
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
                className="input-field"
                value={propertyForm.contact_phone}
                onChange={(e) => setPropertyForm({ ...propertyForm, contact_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label">Contact Email</label>
              <input
                type="email"
                className="input-field"
                value={propertyForm.contact_email}
                onChange={(e) => setPropertyForm({ ...propertyForm, contact_email: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Global Amenities (Comma-separated)</label>
            <input
              type="text"
              className="input-field"
              value={propertyForm.amenities}
              onChange={(e) => setPropertyForm({ ...propertyForm, amenities: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Description / Operational Notes</label>
            <textarea
              className="input-field"
              rows={2}
              value={propertyForm.description}
              onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Update Status */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={`Update Status — ${selectedProperty?.name}`}
      >
        <form onSubmit={handleUpdateStatus} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Operational Status</label>
            <select
              className="input-field"
              value={statusForm.status}
              onChange={(e) => setStatusForm({ status: e.target.value })}
            >
              <option value="ACTIVE">ACTIVE (Fully Operational)</option>
              <option value="MAINTENANCE">MAINTENANCE (Temporarily Offline)</option>
              <option value="INACTIVE">INACTIVE (Decommissioned)</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setIsStatusModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Update Status
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Quick Units Overview */}
      <Modal
        isOpen={Boolean(unitsModalProperty)}
        onClose={() => setUnitsModalProperty(null)}
        title={`Units in ${unitsModalProperty?.name} (${unitsModalProperty?.code})`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>LOCATION</div>
              <div style={{ fontWeight: 600 }}>{unitsModalProperty?.address}, {unitsModalProperty?.city}</div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const id = unitsModalProperty.id;
                setUnitsModalProperty(null);
                handleViewApartments(id);
              }}
            >
              Open Full Units View ↗
            </Button>
          </div>

          {unitsLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              Loading building inventory...
            </div>
          ) : propertyUnits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              No apartment units registered under this building yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '360px', overflowY: 'auto' }}>
              {propertyUnits.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Unit {u.unit_number}</strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({u.unit_type})</span>
                      <Badge status={u.status === 'AVAILABLE' ? 'success' : u.status === 'OCCUPIED' ? 'danger' : 'warning'}>
                        {u.status}
                      </Badge>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Floor {u.floor || 1} • {u.capacity || 2} Persons • {formatNaira(u.rate_per_night)}/night
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setUnitsModalProperty(null);
                        navigate(`/app/apartments?search=${encodeURIComponent(u.unit_number)}`);
                      }}
                      title="Inspect unit details"
                    >
                      Details
                    </Button>
                    {(u.status === 'AVAILABLE' || u.status === 'READY') && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setUnitsModalProperty(null);
                          navigate(`/app/reservations?apartmentId=${u.id}&propertyId=${unitsModalProperty.id}`);
                        }}
                        title="Book this unit under 1-night policy"
                      >
                        Book
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
            <Button variant="ghost" onClick={() => setUnitsModalProperty(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
