import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { propertyService, propertyMediaService, resolveMediaUrl } from '../../services/api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';
import PropertyMediaManager from '../../components/properties/PropertyMediaManager';
import PropertyUploadWizard from '../../components/properties/PropertyUploadWizard';
import PropertyApprovalReviewModal from '../../components/properties/PropertyApprovalReviewModal';
import AddUnitsToPropertyModal from '../../components/properties/AddUnitsToPropertyModal';
import EditPropertyModal from '../../components/properties/EditPropertyModal';
import PropertyDetailModal from '../../components/properties/PropertyDetailModal';
import ApartmentMediaAndSpecsModal from '../../components/properties/ApartmentMediaAndSpecsModal';
import { Building, Layers, Image as ImageIcon } from '../../components/ui/Icons';

export default function PropertiesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties, activePropertyId, setActivePropertyId, refreshProperties } = useProperty();
  const { user, isSuperAdmin } = useAuth();
  const { addToast } = useToast();

  const canManageProperties = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(user?.role);
  const canArchiveProperties = ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(user?.role);

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const prevSearchParamRef = useRef(searchParams.get('search'));
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [approvalFilter, setApprovalFilter] = useState('ALL');
  const [unitMediaSpecsTarget, setUnitMediaSpecsTarget] = useState(null);

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
  const [isAddUnitsModalOpen, setIsAddUnitsModalOpen] = useState(false);
  const [propertyForAddUnits, setPropertyForAddUnits] = useState(null);

  // Property Upload Wizard & Approval Governance Modals
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [reviewProperty, setReviewProperty] = useState(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Property Detail Modal
  const [detailProperty, setDetailProperty] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Archive Confirmation
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveConfirmText, setArchiveConfirmText] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);

  // Property units quick view modal
  const [unitsModalProperty, setUnitsModalProperty] = useState(null);
  const [propertyUnits, setPropertyUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  // Property Media & Gallery state
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [galleryProperty, setGalleryProperty] = useState(null);
  const [newPropertyPhotos, setNewPropertyPhotos] = useState([]);

  const MEDIA_CATEGORIES = [
    { value: 'BUILDING_EXTERIOR', label: 'Building Exterior' },
    { value: 'BUILDING_ENTRANCE', label: 'Building Entrance' },
    { value: 'RECEPTION', label: 'Reception & Front Desk' },
    { value: 'LOBBY', label: 'Lobby & Lounge' },
    { value: 'SWIMMING_POOL', label: 'Swimming Pool' },
    { value: 'GARDEN', label: 'Garden & Courtyard' },
    { value: 'PARKING', label: 'Parking & Driveway' },
    { value: 'FACILITIES', label: 'Gym / Amenities / Facilities' },
    { value: 'OTHER', label: 'Other' },
  ];

  // Form states
  const [propertyForm, setPropertyForm] = useState({
    code: '',
    name: '',
    description: '',
    address: '',
    city: 'Akure',
    state: 'Ondo State',
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
      const matchesApproval =
        approvalFilter === 'ALL' ||
        (approvalFilter === 'PENDING' &&
          ['PENDING_OWNER_APPROVAL', 'PENDING_OPERATIONS_APPROVAL', 'PENDING_APPROVAL'].includes(prop.approval_status)) ||
        (approvalFilter === 'APPROVED' && ['APPROVED', 'PUBLISHED'].includes(prop.approval_status)) ||
        (approvalFilter === 'PUBLISHED' && (prop.status === 'PUBLISHED' || prop.approval_status === 'PUBLISHED'));
      return matchesSearch && matchesStatus && matchesApproval;
    });
  }, [properties, search, statusFilter, approvalFilter]);

  // Dashboard stats
  const stats = useMemo(() => {
    const total = properties.length;
    const active = properties.filter((p) => p.status === 'ACTIVE').length;
    const archived = properties.filter((p) => p.status === 'ARCHIVED' || p.is_archived).length;
    const published = properties.filter((p) => p.status === 'PUBLISHED' || p.approval_status === 'PUBLISHED').length;
    const pendingApproval = properties.filter((p) =>
      ['PENDING_APPROVAL', 'PENDING_OWNER_APPROVAL', 'PENDING_OPERATIONS_APPROVAL'].includes(p.status) ||
      ['PENDING_OWNER_APPROVAL', 'PENDING_OPERATIONS_APPROVAL'].includes(p.approval_status)
    ).length;
    const totalUnits = properties.reduce((sum, p) => sum + (Number(p.total_units) || Number(p.unit_count) || 0), 0);
    const pendingUnits = properties.reduce((sum, p) => sum + (Number(p.pending_approval_units) || 0), 0);
    const publishedUnits = properties.reduce((sum, p) => sum + (Number(p.published_units) || 0), 0);
    return { total, active, archived, published, pendingApproval, totalUnits, pendingUnits, publishedUnits };
  }, [properties]);

  // Handlers for Add Property
  const handleOpenAdd = () => {
    setPropertyForm({
      code: '',
      name: '',
      description: '',
      address: '',
      city: 'Akure',
      state: 'Ondo State',
      country: 'Nigeria',
      contact_phone: '',
      contact_email: '',
      amenities: '',
    });
    setNewPropertyPhotos([]);
    setIsAddModalOpen(true);
  };

  const handlePhotoFilesSelected = (e, targetSetter) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        addToast(`Skipped ${file.name}: Only JPG, PNG, and WebP are allowed.`, 'warning');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        addToast(`Skipped ${file.name}: Image exceeds 5MB limit.`, 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        targetSetter((prev) => {
          const isFirst = prev.length === 0;
          return [
            ...prev,
            {
              id: Date.now() + Math.random(),
              fileData: event.target.result,
              fileType: file.type,
              fileName: file.name,
              category: 'BUILDING_EXTERIOR',
              caption: '',
              isCover: isFirst,
            },
          ];
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
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
      const res = await propertyService.create(payload);
      const createdProperty = res?.data || res;
      const createdId = createdProperty?.id;

      if (createdId && newPropertyPhotos.length > 0) {
        try {
          await propertyMediaService.uploadMedia(
            createdId,
            newPropertyPhotos.map((p, idx) => ({
              fileData: p.fileData,
              fileType: p.fileType,
              category: p.category,
              caption: p.caption,
              isCover: p.isCover,
              displayOrder: idx + 1,
            }))
          );
          if (user?.role === 'MANAGER') {
            addToast('Property registered! Photos submitted for Admin publication review.', 'success');
          } else {
            addToast('Property registered and photos published successfully!', 'success');
          }
        } catch (mediaErr) {
          addToast(`Property created, but photos failed to upload: ${mediaErr.message}`, 'warning');
        }
      } else {
        addToast('Property registered successfully!', 'success');
      }

      setIsAddModalOpen(false);
      setNewPropertyPhotos([]);
      refreshProperties();
    } catch (err) {
      addToast(`Error creating property: ${err.message}`, 'error');
    }
  };

  // Handlers for Building Gallery
  const handleOpenGalleryModal = (prop) => {
    setGalleryProperty(prop);
    setIsGalleryModalOpen(true);
  };

  // Handlers for Edit Property
  const handleOpenEdit = (prop) => {
    setSelectedProperty(prop);
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

  // Archive / Delete property handler
  const handleArchiveProperty = async (mode = 'archive') => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      const res = await propertyService.archive(archiveTarget.id, mode);
      addToast(res?.message || `Property "${archiveTarget.name}" updated successfully.`, 'success');
      setArchiveTarget(null);
      setArchiveConfirmText('');
      refreshProperties();
    } catch (err) {
      addToast(`Operation failed: ${err.message}`, 'error');
    } finally {
      setIsArchiving(false);
    }
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
            <>
              <Button
                variant="primary"
                onClick={() => setIsWizardOpen(true)}
                style={{
                  background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                  color: '#0f172a',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(212, 175, 55, 0.3)',
                }}
              >
                ⚡ Structure & Upload Property
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 1b. Portfolio KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.25rem',
        }}
      >
        {[
          { label: 'Total Properties', value: stats.total, color: 'var(--text-primary)' },
          { label: 'Active', value: stats.active, color: '#10b981' },
          { label: 'Pending Approval', value: stats.pendingApproval, color: '#f59e0b' },
          { label: 'Published', value: stats.published, color: '#38bdf8' },
          { label: 'Archived', value: stats.archived, color: '#94a3b8' },
          { label: 'Total Apartments', value: stats.totalUnits, color: 'var(--accent-gold, #d4af37)' },
          { label: 'Pending Apts', value: stats.pendingUnits, color: '#f59e0b' },
          { label: 'Published Apts', value: stats.publishedUnits, color: '#10b981' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 0.9rem',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: kpi.color, marginTop: '0.15rem' }}>
              {kpi.value}
            </div>
          </div>
        ))}
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

        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>Status:</span>
          {['ALL', 'ACTIVE', 'PUBLISHED', 'PENDING_APPROVAL', 'MAINTENANCE', 'INACTIVE', 'ARCHIVED'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`filter-pill ${statusFilter === status ? 'active' : ''}`}
              style={{
                padding: '0.3rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.76rem',
                fontWeight: 600,
                border: statusFilter === status ? '1px solid var(--accent-gold)' : '1px solid var(--border-color)',
                background: statusFilter === status ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
                color: statusFilter === status ? 'var(--accent-gold)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>Approval:</span>
          {['ALL', 'PENDING', 'APPROVED', 'PUBLISHED'].map((ap) => (
            <button
              key={ap}
              type="button"
              onClick={() => setApprovalFilter(ap)}
              style={{
                padding: '0.3rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.76rem',
                fontWeight: 600,
                border: approvalFilter === ap ? '1px solid #38bdf8' : '1px solid var(--border-color)',
                background: approvalFilter === ap ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: approvalFilter === ap ? '#38bdf8' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {ap}
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
            <Button
              variant="primary"
              onClick={() => setIsWizardOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                color: '#0f172a',
                fontWeight: 700,
              }}
            >
              ⚡ Structure & Upload Property
            </Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: '1.5rem' }}>
          {filteredProperties.map((prop) => {
            const isCurrentlySelected = String(activePropertyId) === String(prop.id);
            const coverPhotoUrl = resolveMediaUrl(prop.primary_photo_url || prop.main_photo);
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
                    {coverPhotoUrl && (
                      <div
                        onClick={() => {
                          setDetailProperty(prop);
                          setIsDetailModalOpen(true);
                        }}
                        style={{
                          width: '100%',
                          height: '150px',
                          borderRadius: 'var(--radius-md)',
                          overflow: 'hidden',
                          marginBottom: '0.85rem',
                          cursor: 'pointer',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <img
                          src={coverPhotoUrl}
                          alt={prop.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
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
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
                            prop.status === 'ACTIVE' || prop.status === 'PUBLISHED'
                              ? 'success'
                              : prop.status === 'MAINTENANCE' || prop.status === 'PENDING_APPROVAL'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {prop.status}
                        </Badge>
                        {prop.approval_status && (
                          <Badge
                            status={
                              ['APPROVED', 'PUBLISHED'].includes(prop.approval_status)
                                ? 'success'
                                : ['REJECTED', 'CHANGES_REQUESTED'].includes(prop.approval_status)
                                ? 'danger'
                                : 'warning'
                            }
                          >
                            {prop.approval_status.replace(/_/g, ' ')}
                          </Badge>
                        )}
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
                      onClick={() => {
                        setDetailProperty(prop);
                        setIsDetailModalOpen(true);
                      }}
                      style={{ flex: '1 1 auto' }}
                      title="Open complete property overview and manage its apartments"
                    >
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleViewApartments(prop.id)}
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
                      variant="secondary"
                      onClick={() => handleOpenGalleryModal(prop)}
                      title="Manage building photos, gallery, categories, and cover image"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      📷 Gallery
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReviewProperty(prop);
                        setIsReviewModalOpen(true);
                      }}
                      title="Dual-Review Executive Governance & Publication Gate"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderColor: '#d4af37', color: '#d4af37' }}
                    >
                      🛡️ Review / Publish
                    </Button>
                    {canManageProperties && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPropertyForAddUnits(prop);
                            setIsAddUnitsModalOpen(true);
                          }}
                          style={{ borderColor: '#38bdf8', color: '#38bdf8' }}
                          title="Register additional apartment units under this property"
                        >
                          + Add Units
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleOpenStatusModal(prop)}>
                          Status
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleOpenEdit(prop)}>
                          Edit
                        </Button>
                      </>
                    )}
                    {canArchiveProperties && prop.status !== 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        style={{ borderColor: '#ef4444', color: '#ef4444' }}
                        onClick={() => {
                          setArchiveTarget(prop);
                          setArchiveConfirmText('');
                        }}
                        title="Archive or safely delete this property"
                      >
                        Archive / Delete
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

            {/* Redesigned Edit Property Modal with 4 Sections (Info, Amenities, Media, Units) */}
      {isEditModalOpen && selectedProperty && (
        <EditPropertyModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          property={selectedProperty}
          onPropertyUpdated={refreshProperties}
        />
      )}

      {/* Add Units to Property Modal */}
      {isAddUnitsModalOpen && propertyForAddUnits && (
        <AddUnitsToPropertyModal
          isOpen={isAddUnitsModalOpen}
          onClose={() => setIsAddUnitsModalOpen(false)}
          property={propertyForAddUnits}
          onSuccess={refreshProperties}
        />
      )}

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

      {/* Modal: Building Gallery & Media Asset Management */}
      <Modal
        isOpen={isGalleryModalOpen}
        onClose={() => {
          setIsGalleryModalOpen(false);
          setGalleryProperty(null);
        }}
        title={`Building Photo Gallery — ${galleryProperty?.name || ''}`}
        size="xl"
      >
        {galleryProperty && (
          <PropertyMediaManager
            property={galleryProperty}
            onCoverUpdated={refreshProperties}
          />
        )}
      </Modal>

      {/* Property Upload Wizard (3-Level Hierarchy) */}
      {isWizardOpen && (
        <PropertyUploadWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onSuccess={() => refreshProperties()}
        />
      )}

      {/* Property Approval & Review Modal */}
      {isReviewModalOpen && reviewProperty && (
        <PropertyApprovalReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => {
            setIsReviewModalOpen(false);
            setReviewProperty(null);
          }}
          property={reviewProperty}
          onSuccess={() => refreshProperties()}
        />
      )}

      {/* Property Detail & Associated Apartments Modal */}
      {isDetailModalOpen && detailProperty && (
        <PropertyDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setDetailProperty(null);
          }}
          property={detailProperty}
          canManage={canManageProperties}
          canArchive={canArchiveProperties}
          onEditProperty={(p) => handleOpenEdit(p)}
          onOpenGallery={(p) => handleOpenGalleryModal(p)}
          onOpenReview={(p) => {
            setReviewProperty(p);
            setIsReviewModalOpen(true);
          }}
          onAddUnits={(p) => {
            setPropertyForAddUnits(p);
            setIsAddUnitsModalOpen(true);
          }}
          onArchiveProperty={(p) => {
            setArchiveTarget(p);
            setArchiveConfirmText('');
          }}
          onInspectUnit={(u) => navigate(`/app/apartments?unitId=${u.id}&propertyId=${u.property_id}`)}
          onOpenUnitMediaSpecs={(u) => setUnitMediaSpecsTarget(u)}
          onRefresh={refreshProperties}
        />
      )}

      {/* Unit Media & Specs Modal (opened from Property Detail) */}
      <ApartmentMediaAndSpecsModal
        isOpen={Boolean(unitMediaSpecsTarget)}
        onClose={() => setUnitMediaSpecsTarget(null)}
        apartment={unitMediaSpecsTarget}
        onUpdated={refreshProperties}
      />

      {/* Safe Property Archive / Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(archiveTarget)}
        onClose={() => {
          if (!isArchiving) {
            setArchiveTarget(null);
            setArchiveConfirmText('');
          }
        }}
        title={`Archive / Delete Property — ${archiveTarget?.name || ''}`}
      >
        {archiveTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                padding: '0.9rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--text-primary)',
                fontSize: '0.86rem',
                lineHeight: 1.55,
              }}
            >
              <strong>Consequences:</strong>
              <ul style={{ margin: '0.4rem 0 0 1.15rem', padding: 0 }}>
                <li>Archiving removes <strong>{archiveTarget.name}</strong> from public discovery and blocks all new public bookings.</li>
                <li>All historical reservations, payments, and audit logs remain <strong>100% preserved</strong>.</li>
                <li>Properties with active/upcoming reservations cannot be archived or deleted.</li>
                <li>Permanent deletion is only permitted if the property has zero apartments, reservations, and submissions.</li>
              </ul>
            </div>

            <div>
              <label className="form-label">
                Type <strong>{archiveTarget.code}</strong> to confirm:
              </label>
              <input
                type="text"
                className="input-field"
                value={archiveConfirmText}
                onChange={(e) => setArchiveConfirmText(e.target.value)}
                placeholder={archiveTarget.code}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setArchiveTarget(null);
                  setArchiveConfirmText('');
                }}
                disabled={isArchiving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                disabled={isArchiving || archiveConfirmText.trim().toUpperCase() !== String(archiveTarget.code || '').toUpperCase()}
                onClick={() => handleArchiveProperty('archive')}
              >
                {isArchiving ? 'Processing...' : 'Archive Property'}
              </Button>
              <Button
                type="button"
                variant="outline"
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
                disabled={isArchiving || archiveConfirmText.trim().toUpperCase() !== String(archiveTarget.code || '').toUpperCase()}
                onClick={() => handleArchiveProperty('delete')}
              >
                {isArchiving ? 'Processing...' : 'Delete Permanently (If Empty)'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
