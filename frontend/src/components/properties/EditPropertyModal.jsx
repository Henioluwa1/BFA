import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { propertyService, apartmentService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import PropertyMediaManager from './PropertyMediaManager';
import AddUnitsToPropertyModal from './AddUnitsToPropertyModal';
import {
  Building,
  Layers,
  Image as ImageIcon,
  Home,
  Plus,
  Trash2,
  Upload,
  Check,
  AlertTriangle,
  Sparkles,
  MapPin,
  Clock,
  ShieldCheck,
  ExternalLink,
  Edit2,
  DollarSign,
  Users,
} from 'lucide-react';

const PROPERTY_CATEGORIES = [
  'RESIDENTIAL',
  'SERVICED_APARTMENTS',
  'BOUTIQUE_HOTEL',
  'LUXURY_SUITES',
  'PENTHOUSE_COLLECTION',
  'COMMERCIAL',
];

export default function EditPropertyModal({ isOpen, onClose, property, onPropertyUpdated }) {
  const { addToast } = useToast();

  // Active Navigation Tab: 'INFO' | 'TECH_SPECS' | 'AMENITIES' | 'MEDIA' | 'UNITS'
  const [activeTab, setActiveTab] = useState('INFO');
  const [saving, setSaving] = useState(false);

  // Technical Specifications State (stored as JSONB in properties.technical_specs)
  const [techSpecs, setTechSpecs] = useState({
    power_backup: '',
    water_supply: '',
    security_systems: '',
    internet_connectivity: '',
    parking_capacity: '',
    building_features: '',
    custom: [],
  });
  const [pubStatus, setPubStatus] = useState('ACTIVE');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. PROPERTY INFORMATION STATE (Prepopulated from saved backend property)
  // ───────────────────────────────────────────────────────────────────────────
  const [infoForm, setInfoForm] = useState({
    name: '',
    code: '',
    category: 'SERVICED_APARTMENTS',
    location: '',
    district: '',
    address: '',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    environment_description: '',
    description: '',
    check_in_time: '14:00',
    check_out_time: '11:00',
    contact_phone: '',
    contact_email: '',
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. DYNAMIC BUILDING AMENITIES STATE (Max 7, loaded from DB)
  // ───────────────────────────────────────────────────────────────────────────
  const [buildingAmenities, setBuildingAmenities] = useState([]);
  const [loadingAmenities, setLoadingAmenities] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. UNITS STATE (Loaded from DB)
  // ───────────────────────────────────────────────────────────────────────────
  const [units, setUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [isAddUnitModalOpen, setIsAddUnitModalOpen] = useState(false);

  // Sync state when property prop changes
  useEffect(() => {
    if (property && isOpen) {
      setInfoForm({
        name: property.name || '',
        code: property.code || '',
        category: property.category || 'SERVICED_APARTMENTS',
        location: property.location || '',
        district: property.district || '',
        address: property.address || '',
        city: property.city || 'Lagos',
        state: property.state || 'Lagos',
        country: property.country || 'Nigeria',
        environment_description: property.environment_description || '',
        description: property.description || '',
        check_in_time: property.check_in_time || '14:00',
        check_out_time: property.check_out_time || '11:00',
        contact_phone: property.contact_phone || '',
        contact_email: property.contact_email || '',
      });
      const rawSpecs = typeof property.technical_specs === 'string'
        ? (() => { try { return JSON.parse(property.technical_specs); } catch { return {}; } })()
        : (property.technical_specs || {});
      setTechSpecs({
        power_backup: rawSpecs.power_backup || '',
        water_supply: rawSpecs.water_supply || '',
        security_systems: rawSpecs.security_systems || '',
        internet_connectivity: rawSpecs.internet_connectivity || '',
        parking_capacity: rawSpecs.parking_capacity || '',
        building_features: rawSpecs.building_features || '',
        custom: Array.isArray(rawSpecs.custom) ? rawSpecs.custom : [],
      });
      setPubStatus(property.status || 'ACTIVE');
      setActiveTab('INFO');
      fetchAmenities();
      fetchUnits();
    }
  }, [property, isOpen]);

  // Fetch building amenities from API
  const fetchAmenities = useCallback(async () => {
    if (!property?.id) return;
    try {
      setLoadingAmenities(true);
      const res = await propertyService.getAmenities(property.id);
      const raw = res?.data !== undefined ? res.data : res;
      if (Array.isArray(raw)) {
        setBuildingAmenities(
          raw.map((a, idx) => ({
            id: a.id,
            tempId: a.id || idx,
            name: a.name || '',
            description: a.description || '',
            photoData: null,
            fileType: null,
            previewUrl: a.photo_url || a.image_url || '',
          }))
        );
      } else if (property.amenities) {
        // Fallback if amenities are comma-separated string
        const list = Array.isArray(property.amenities)
          ? property.amenities
          : String(property.amenities)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
        setBuildingAmenities(
          list.map((name, idx) => ({
            tempId: idx,
            name,
            description: '',
            previewUrl: '',
          }))
        );
      }
    } catch {
      // Fallback
      setBuildingAmenities([]);
    } finally {
      setLoadingAmenities(false);
    }
  }, [property]);

  // Fetch apartment units from API
  const fetchUnits = useCallback(async () => {
    if (!property?.id) return;
    try {
      setLoadingUnits(true);
      const res = await apartmentService.getAll({ property_id: property.id });
      const raw = res?.data !== undefined ? res.data : res;
      setUnits(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.warn('Failed to load property units:', err.message);
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  }, [property]);

  const processImageFile = (file, onDone) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      addToast(`Image '${file.name}' exceeds the 10MB limit.`, 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onDone({
        fileData: e.target.result,
        fileType: file.type || 'image/jpeg',
        fileName: file.name,
        previewUrl: e.target.result,
      });
    };
    reader.readAsDataURL(file);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Save Tab 1: Property Information
  // ───────────────────────────────────────────────────────────────────────────
  const handleSaveInfo = async (e) => {
    e?.preventDefault();
    if (!infoForm.name.trim()) {
      addToast('Building Name is required.', 'error');
      return;
    }
    if (!infoForm.address.trim()) {
      addToast('Physical Street Address is required.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: infoForm.name.trim(),
        category: infoForm.category,
        location: infoForm.location.trim() || null,
        district: infoForm.district.trim() || null,
        address: infoForm.address.trim(),
        city: infoForm.city || 'Lagos',
        state: infoForm.state || 'Lagos',
        country: infoForm.country || 'Nigeria',
        environment_description: infoForm.environment_description.trim() || null,
        description: infoForm.description.trim() || null,
        check_in_time: infoForm.check_in_time || '14:00',
        check_out_time: infoForm.check_out_time || '11:00',
        contact_phone: infoForm.contact_phone.trim() || null,
        contact_email: infoForm.contact_email.trim() || null,
      };

      await propertyService.update(property.id, payload);
      addToast('Property information updated successfully!', 'success');
      onPropertyUpdated?.();
    } catch (err) {
      addToast(err.message || 'Failed to update property.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTechSpecs = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const cleanedCustom = (techSpecs.custom || []).filter((c) => c.label?.trim() && c.value?.trim());
      await propertyService.update(property.id, {
        technical_specs: {
          ...techSpecs,
          custom: cleanedCustom,
        },
      });
      addToast('Technical specifications saved!', 'success');
      onPropertyUpdated?.();
    } catch (err) {
      addToast(err.message || 'Failed to save technical specifications.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateVisibility = async (nextStatus) => {
    setSaving(true);
    try {
      await propertyService.updateStatus(property.id, { status: nextStatus });
      setPubStatus(nextStatus);
      addToast(`Property visibility set to ${nextStatus}`, 'success');
      onPropertyUpdated?.();
    } catch (err) {
      addToast(err.message || 'Failed to update publication status.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Save Tab 2: Building Amenities
  // ───────────────────────────────────────────────────────────────────────────
  const handleAddBuildingAmenity = () => {
    if (buildingAmenities.length >= 7) {
      addToast('Maximum of 7 building amenities allowed per property.', 'warning');
      return;
    }
    setBuildingAmenities((prev) => [
      ...prev,
      {
        tempId: Date.now() + Math.random(),
        name: '',
        description: '',
        photoData: null,
        fileType: null,
        previewUrl: '',
      },
    ]);
  };

  const handleUpdateAmenity = (idx, field, value) => {
    setBuildingAmenities((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleRemoveAmenity = (idx) => {
    setBuildingAmenities((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveAmenities = async (e) => {
    e?.preventDefault();
    for (let i = 0; i < buildingAmenities.length; i++) {
      if (!buildingAmenities[i].name.trim()) {
        addToast(`Amenity #${i + 1} requires a Name.`, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const formatted = buildingAmenities.map((a, idx) => ({
        name: a.name.trim(),
        description: a.description.trim(),
        photoData: a.photoData || null,
        fileType: a.fileType || null,
        display_order: idx,
      }));
      await propertyService.saveAmenities(property.id, formatted);
      addToast('Building amenities saved successfully!', 'success');
      onPropertyUpdated?.();
    } catch (err) {
      addToast(err.message || 'Failed to save amenities.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Edit Property — ${infoForm.name || property?.name || ''}`}
        subtitle={`Configure property metadata, building amenities, media gallery, and serviced apartment units (${property?.code || 'ID: ' + property?.id})`}
        size="xl"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Tab Navigation Ribbon */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              paddingBottom: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            {[
              { id: 'INFO', label: 'Property Information', icon: <Building size={16} /> },
              { id: 'TECH_SPECS', label: 'Technical Specs', icon: <ShieldCheck size={16} /> },
              { id: 'AMENITIES', label: `Amenities & Features (${buildingAmenities.length}/7)`, icon: <Layers size={16} /> },
              { id: 'MEDIA', label: 'Media Gallery', icon: <ImageIcon size={16} /> },
              { id: 'UNITS', label: `Units (${units.length})`, icon: <Home size={16} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  minHeight: '40px',
                  border: activeTab === tab.id ? '1px solid #d4af37' : '1px solid rgba(255, 255, 255, 0.08)',
                  background: activeTab === tab.id ? 'rgba(212, 175, 55, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                  color: activeTab === tab.id ? '#fbbf24' : '#cbd5e1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* TAB 1: PROPERTY INFORMATION */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'INFO' && (
            <form onSubmit={handleSaveInfo} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="form-label">Property Code (Immutable)</label>
                  <input
                    type="text"
                    className="input-field"
                    disabled
                    value={infoForm.code}
                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                  />
                </div>

                <div>
                  <label className="form-label">Building Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    required
                    value={infoForm.name}
                    onChange={(e) => setInfoForm({ ...infoForm, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">Property Category</label>
                  <select
                    className="input-field"
                    value={infoForm.category}
                    onChange={(e) => setInfoForm({ ...infoForm, category: e.target.value })}
                  >
                    {PROPERTY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Location & District */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="form-label">Location / Primary Area</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Victoria Island, Lekki Phase 1"
                    value={infoForm.location}
                    onChange={(e) => setInfoForm({ ...infoForm, location: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">District / Zone</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Waterfront Enclave, Diplomatic Zone"
                    value={infoForm.district}
                    onChange={(e) => setInfoForm({ ...infoForm, district: e.target.value })}
                  />
                </div>
              </div>

              {/* Physical Street Address */}
              <div>
                <label className="form-label">Physical Street Address *</label>
                <input
                  type="text"
                  className="input-field"
                  required
                  placeholder="Street number, building name, and road"
                  value={infoForm.address}
                  onChange={(e) => setInfoForm({ ...infoForm, address: e.target.value })}
                />
              </div>

              {/* City, State, Country */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="form-label">City *</label>
                  <input
                    type="text"
                    className="input-field"
                    required
                    value={infoForm.city}
                    onChange={(e) => setInfoForm({ ...infoForm, city: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">State</label>
                  <input
                    type="text"
                    className="input-field"
                    value={infoForm.state}
                    onChange={(e) => setInfoForm({ ...infoForm, state: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">Country</label>
                  <input
                    type="text"
                    className="input-field"
                    value={infoForm.country}
                    onChange={(e) => setInfoForm({ ...infoForm, country: e.target.value })}
                  />
                </div>
              </div>

              {/* Check-In / Check-Out */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="form-label">Check-In Time</label>
                  <input
                    type="time"
                    className="input-field"
                    value={infoForm.check_in_time}
                    onChange={(e) => setInfoForm({ ...infoForm, check_in_time: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">Check-Out Time</label>
                  <input
                    type="time"
                    className="input-field"
                    value={infoForm.check_out_time}
                    onChange={(e) => setInfoForm({ ...infoForm, check_out_time: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">Contact Phone</label>
                  <input
                    type="text"
                    className="input-field"
                    value={infoForm.contact_phone}
                    onChange={(e) => setInfoForm({ ...infoForm, contact_phone: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label">Contact Email</label>
                  <input
                    type="email"
                    className="input-field"
                    value={infoForm.contact_email}
                    onChange={(e) => setInfoForm({ ...infoForm, contact_email: e.target.value })}
                  />
                </div>
              </div>

              {/* Surrounding Neighborhood & Operational Notes */}
              <div>
                <label className="form-label">Surrounding Neighborhood & Environment Description</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Describe proximity to commercial hubs, airports, waterfront, dining..."
                  value={infoForm.environment_description}
                  onChange={(e) => setInfoForm({ ...infoForm, environment_description: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label">Property Overview & Operational Notes</label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder="Architectural design, guest service standard, security features..."
                  value={infoForm.description}
                  onChange={(e) => setInfoForm({ ...infoForm, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '10px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600 }}>Public Visibility:</span>
                  <Badge variant={['ACTIVE', 'PUBLISHED'].includes(pubStatus) ? 'success' : 'warning'}>
                    {pubStatus}
                  </Badge>
                  {['ACTIVE', 'PUBLISHED'].includes(pubStatus) ? (
                    <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => handleUpdateVisibility('UNPUBLISHED')}>
                      Unpublish
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="primary" disabled={saving} onClick={() => handleUpdateVisibility('PUBLISHED')}>
                      Publish to Website
                    </Button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Button type="button" variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={saving}
                    style={{
                      background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                      color: '#000000',
                      fontWeight: 800,
                    }}
                  >
                    <ShieldCheck size={16} />
                    {saving ? 'Saving...' : 'Save Property Information'}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* TAB 1b: TECHNICAL SPECIFICATIONS */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'TECH_SPECS' && (
            <form onSubmit={handleSaveTechSpecs} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="form-label">Power &amp; Backup Systems</label>
                  <input type="text" className="input-field" placeholder="e.g. Dual 500kVA Generators + Solar Hybrid" value={techSpecs.power_backup} onChange={(e) => setTechSpecs({ ...techSpecs, power_backup: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Water Supply &amp; Treatment</label>
                  <input type="text" className="input-field" placeholder="e.g. Industrial Borehole + UV Filtration" value={techSpecs.water_supply} onChange={(e) => setTechSpecs({ ...techSpecs, water_supply: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Security Arrangements</label>
                  <input type="text" className="input-field" placeholder="e.g. 24/7 Armed Guards, Biometric Gate, CCTV" value={techSpecs.security_systems} onChange={(e) => setTechSpecs({ ...techSpecs, security_systems: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Internet &amp; Connectivity</label>
                  <input type="text" className="input-field" placeholder="e.g. 500 Mbps Dedicated Fiber Wi-Fi 6" value={techSpecs.internet_connectivity} onChange={(e) => setTechSpecs({ ...techSpecs, internet_connectivity: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Parking Capacity</label>
                  <input type="text" className="input-field" placeholder="e.g. 24 Subterranean Guarded Bays" value={techSpecs.parking_capacity} onChange={(e) => setTechSpecs({ ...techSpecs, parking_capacity: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Building Features</label>
                  <input type="text" className="input-field" placeholder="e.g. Acoustic Double Glazing, Elevator Access" value={techSpecs.building_features} onChange={(e) => setTechSpecs({ ...techSpecs, building_features: e.target.value })} />
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0' }}>Additional Technical Specifications</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setTechSpecs({ ...techSpecs, custom: [...(techSpecs.custom || []), { label: '', value: '' }] })}
                  >
                    <Plus size={14} /> Add Specification
                  </Button>
                </div>
                {(techSpecs.custom || []).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Label (e.g. Fire Suppression)"
                      value={item.label}
                      onChange={(e) => {
                        const next = [...techSpecs.custom];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setTechSpecs({ ...techSpecs, custom: next });
                      }}
                    />
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Value (e.g. Automated Smoke & Sprinkler System)"
                      value={item.value}
                      onChange={(e) => {
                        const next = [...techSpecs.custom];
                        next[idx] = { ...next[idx], value: e.target.value };
                        setTechSpecs({ ...techSpecs, custom: next });
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setTechSpecs({ ...techSpecs, custom: techSpecs.custom.filter((_, i) => i !== idx) })}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={saving} style={{ background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)', color: '#000', fontWeight: 800 }}>
                  {saving ? 'Saving...' : 'Save Technical Specifications'}
                </Button>
              </div>
            </form>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* TAB 2: AMENITIES & FEATURES (Dynamic Building Amenities, Max 7) */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'AMENITIES' && (
            <form onSubmit={handleSaveAmenities} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.45)',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: '#fff', fontWeight: 700 }}>
                    Building Estate Amenities ({buildingAmenities.length} of 7 Max)
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1' }}>
                    Shared facilities available across the entire property estate (power, pool, security, gym).
                  </p>
                </div>
                {buildingAmenities.length < 7 && (
                  <Button type="button" size="sm" variant="outline" onClick={handleAddBuildingAmenity}>
                    <Plus size={14} /> Add Amenity
                  </Button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
                {buildingAmenities.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    No building amenities defined yet. Click '+ Add Amenity' above.
                  </div>
                )}
                {buildingAmenities.map((amn, idx) => (
                  <div
                    key={amn.tempId || idx}
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          background: 'rgba(212, 175, 55, 0.2)',
                          color: '#fbbf24',
                          border: '1px solid #d4af37',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </span>

                      <input
                        type="text"
                        placeholder="Amenity Name (e.g. 24/7 Central Backup Power)"
                        className="input-field"
                        required
                        style={{ flex: 1, fontWeight: 700 }}
                        value={amn.name}
                        onChange={(e) => handleUpdateAmenity(idx, 'name', e.target.value)}
                      />

                      <button
                        type="button"
                        onClick={() => handleRemoveAmenity(idx)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
                        title="Delete amenity"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="Description of facility (e.g. Continuous dual-redundant power for estate)"
                      className="input-field"
                      value={amn.description}
                      onChange={(e) => handleUpdateAmenity(idx, 'description', e.target.value)}
                    />

                    {/* Image Preview / Upload */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                      {amn.previewUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <img
                            src={amn.previewUrl}
                            alt={amn.name}
                            style={{ width: '60px', height: '42px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #d4af37' }}
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateAmenity(idx, 'previewUrl', '')}
                            style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.72rem', cursor: 'pointer' }}
                          >
                            Remove Photo
                          </button>
                        </div>
                      ) : (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: '1px dashed rgba(212, 175, 55, 0.4)',
                            background: 'rgba(212, 175, 55, 0.05)',
                            fontSize: '0.72rem',
                            color: '#d4af37',
                            cursor: 'pointer',
                          }}
                        >
                          <Upload size={12} /> Upload Amenity Photo
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                processImageFile(f, (img) => {
                                  handleUpdateAmenity(idx, 'photoData', img.fileData);
                                  handleUpdateAmenity(idx, 'fileType', img.fileType);
                                  handleUpdateAmenity(idx, 'previewUrl', img.previewUrl);
                                });
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={saving}
                  style={{
                    background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                    color: '#000000',
                    fontWeight: 800,
                  }}
                >
                  <ShieldCheck size={16} />
                  {saving ? 'Saving...' : 'Save Building Amenities'}
                </Button>
              </div>
            </form>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* TAB 3: MEDIA GALLERY */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'MEDIA' && property && (
            <div>
              <PropertyMediaManager
                property={property}
                onCoverUpdated={onPropertyUpdated}
              />
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* TAB 4: UNITS (Apartments under this property) */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {activeTab === 'UNITS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.45)',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: '#fff', fontWeight: 700 }}>
                    Serviced Apartment Units ({units.length})
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1' }}>
                    Physical apartment suites registered under {property?.name}.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => setIsAddUnitModalOpen(true)}
                  style={{
                    background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                    color: '#000000',
                    fontWeight: 800,
                  }}
                >
                  <Plus size={14} /> Add Units to Property
                </Button>
              </div>

              {loadingUnits ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                  Loading registered units...
                </div>
              ) : units.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  <Home size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                  <div>No apartment units registered under this property yet.</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddUnitModalOpen(true)}
                    style={{ marginTop: '12px' }}
                  >
                    + Register First Unit
                  </Button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '12px',
                    maxHeight: '440px',
                    overflowY: 'auto',
                    padding: '2px',
                  }}
                >
                  {units.map((u) => {
                    const rate = Number(u.rate_per_night || u.rate || 0);
                    const photo = u.cover_photo || u.primary_image || u.photo_url || null;

                    return (
                      <div
                        key={u.id}
                        style={{
                          background: 'rgba(0, 0, 0, 0.45)',
                          borderRadius: '10px',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: '0 4px 15px rgba(0,0,0,0.25)',
                        }}
                      >
                        {photo && (
                          <div style={{ height: '110px', width: '100%', overflow: 'hidden', background: '#000' }}>
                            <img src={photo} alt={u.unit_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}

                        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span
                              style={{
                                background: 'rgba(212, 175, 55, 0.15)',
                                color: '#fbbf24',
                                border: '1px solid #d4af37',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                              }}
                            >
                              {u.apartment_code || `APT-${u.id}`}
                            </span>

                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: u.status === 'AVAILABLE' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                color: u.status === 'AVAILABLE' ? '#34d399' : '#fbbf24',
                              }}
                            >
                              {u.status || 'AVAILABLE'}
                            </span>
                          </div>

                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
                            {u.unit_name || `Unit ${u.unit_number}`}
                          </div>

                          <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                            {u.unit_type || 'Serviced Suite'} · Floor {u.floor || 1}
                          </div>

                          <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#d4af37' }}>
                              ₦{rate.toLocaleString()} <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 500 }}>/ night</span>
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                              {u.bedroom_count || 1} Bed · {u.bathroom_count || 1} Bath
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Add Units to Property Modal triggered directly from Units Tab */}
      {isAddUnitModalOpen && (
        <AddUnitsToPropertyModal
          isOpen={isAddUnitModalOpen}
          onClose={() => setIsAddUnitModalOpen(false)}
          property={property}
          onSuccess={() => {
            fetchUnits();
            onPropertyUpdated?.();
          }}
        />
      )}
    </>
  );
}
