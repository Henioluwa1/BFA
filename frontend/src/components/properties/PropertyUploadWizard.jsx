import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  propertyService,
  apartmentService,
  internalSpacesService,
} from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  Building,
  Layers,
  Image as ImageIcon,
  CheckCircle,
  AlertTriangle,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Home,
  Check,
  Send,
  Eye,
  Camera,
  Maximize2,
} from 'lucide-react';

const PROPERTY_CATEGORIES = [
  'RESIDENTIAL',
  'SERVICED_APARTMENTS',
  'BOUTIQUE_HOTEL',
  'LUXURY_SUITES',
  'PENTHOUSE_COLLECTION',
  'COMMERCIAL',
];

const PROPERTY_PHOTO_CATEGORIES = [
  { value: 'BUILDING_EXTERIOR', label: 'Building Exterior' },
  { value: 'BUILDING_ENTRANCE', label: 'Entrance & Gate' },
  { value: 'RECEPTION', label: 'Reception & Front Desk' },
  { value: 'LOBBY', label: 'Lobby & Lounge' },
  { value: 'SWIMMING_POOL', label: 'Swimming Pool & Deck' },
  { value: 'GARDEN', label: 'Garden & Courtyard' },
  { value: 'PARKING', label: 'Parking & Access' },
  { value: 'FACILITIES', label: 'Gym / Amenities / Facilities' },
  { value: 'OTHER', label: 'Other Property Feature' },
];

const SPACE_TYPES = [
  { value: 'BEDROOM', label: 'Bedroom' },
  { value: 'LIVING_ROOM', label: 'Living Room' },
  { value: 'KITCHEN', label: 'Kitchen' },
  { value: 'BATHROOM', label: 'Bathroom' },
  { value: 'TOILET', label: 'Restroom / Guest Toilet' },
  { value: 'DINING_AREA', label: 'Dining Area' },
  { value: 'BALCONY', label: 'Balcony / Porch' },
  { value: 'TERRACE', label: 'Terrace / Rooftop' },
  { value: 'STUDY_AREA', label: 'Study / Work Station' },
  { value: 'CORRIDOR', label: 'Hallway / Corridor' },
  { value: 'CUSTOM', label: 'Custom Feature Space' },
];

export default function PropertyUploadWizard({ isOpen, onClose, onSuccess }) {
  const { addToast } = useToast();

  const [currentStep, setCurrentStep] = useState(1); // 1: Level A, 2: Level B, 3: Level C, 4: Preview & Submit
  const [submitting, setSubmitting] = useState(false);

  // Level A: Building / Property Details
  const [propertyData, setPropertyData] = useState({
    name: '',
    code: '',
    address: '',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    category: 'SERVICED_APARTMENTS',
    description: '',
    environment_description: '',
    amenities: ['24/7 Power', 'High-Speed WiFi', 'Dedicated Security', 'Treated Water'],
    check_in_time: '14:00',
    check_out_time: '11:00',
  });
  const [propertyPhotos, setPropertyPhotos] = useState([]); // [{ fileData, fileType, category, isPrimary, caption, previewUrl }]
  const [amenityInput, setAmenityInput] = useState('');

  // Level B: Apartments / Units
  const [units, setUnits] = useState([]); // [{ id (temp), unit_number, unit_name, unit_type, floor, capacity, bedroom_count, bathroom_count, rate_per_night, photos: [], internal_spaces: [] }]

  // Step 2 & 3 local editor states
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);

  // --- Image Upload Helpers ---
  const handleFileSelect = (e, callback, categoryDefault = 'BUILDING_EXTERIOR') => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      if (file.size > 8 * 1024 * 1024) {
        addToast(`File ${file.name} exceeds 8MB size limit.`, 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Content = event.target.result;
        callback({
          fileData: base64Content,
          fileType: file.type || 'image/jpeg',
          fileName: file.name,
          category: categoryDefault,
          isPrimary: false,
          caption: file.name.replace(/\.[^/.]+$/, ''),
          previewUrl: base64Content,
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const addAmenity = () => {
    if (amenityInput.trim() && !propertyData.amenities.includes(amenityInput.trim())) {
      setPropertyData((prev) => ({
        ...prev,
        amenities: [...prev.amenities, amenityInput.trim()],
      }));
      setAmenityInput('');
    }
  };

  const removeAmenity = (item) => {
    setPropertyData((prev) => ({
      ...prev,
      amenities: prev.amenities.filter((a) => a !== item),
    }));
  };

  // --- Step 2 Unit Management ---
  const handleAddUnit = () => {
    const nextNumber = `${101 + units.length}`;
    const newUnit = {
      tempId: Date.now() + Math.random(),
      unit_number: nextNumber,
      unit_name: `Apartment Suite ${nextNumber}`,
      unit_type: '2-Bedroom Luxury Suite',
      floor: 1,
      capacity: 4,
      bedroom_count: 2,
      bathroom_count: 2,
      rate_per_night: 85000,
      photos: [],
      internal_spaces: [
        {
          tempId: Date.now() + 1,
          space_type: 'LIVING_ROOM',
          name: 'Main Living Room & Lounge',
          description: 'Spacious lounge with smart entertainment and plush seating',
          amenities: ['Smart TV', 'Air Conditioning', 'High Ceiling'],
          photos: [],
        },
        {
          tempId: Date.now() + 2,
          space_type: 'BEDROOM',
          name: 'Master Bedroom',
          description: 'King-sized bed with memory foam mattress and walk-in wardrobe',
          amenities: ['King Bed', 'Ensuite Bathroom', 'Balcony Access'],
          photos: [],
        },
        {
          tempId: Date.now() + 3,
          space_type: 'KITCHEN',
          name: 'Modern Fitted Kitchen',
          description: 'Full chef kitchen equipped with refrigerator, microwave, and induction cooktop',
          amenities: ['Refrigerator', 'Microwave', 'Cookware'],
          photos: [],
        },
      ],
    };
    setUnits((prev) => [...prev, newUnit]);
    setActiveUnitIndex(units.length);
  };

  const handleRemoveUnit = (idx) => {
    setUnits((prev) => prev.filter((_, i) => i !== idx));
    if (activeUnitIndex >= units.length - 1 && activeUnitIndex > 0) {
      setActiveUnitIndex(activeUnitIndex - 1);
    }
  };

  const handleUpdateActiveUnit = (field, value) => {
    setUnits((prev) => {
      const copy = [...prev];
      copy[activeUnitIndex] = { ...copy[activeUnitIndex], [field]: value };
      return copy;
    });
  };

  // --- Step 3 Space Management for Active Unit ---
  const handleAddSpaceToActiveUnit = () => {
    const newSpace = {
      tempId: Date.now() + Math.random(),
      space_type: 'BEDROOM',
      name: 'New Internal Space',
      description: '',
      amenities: [],
      photos: [],
    };
    setUnits((prev) => {
      const copy = [...prev];
      const unit = copy[activeUnitIndex];
      if (unit) {
        unit.internal_spaces = [...(unit.internal_spaces || []), newSpace];
      }
      return copy;
    });
  };

  const handleRemoveSpaceFromActiveUnit = (spaceIdx) => {
    setUnits((prev) => {
      const copy = [...prev];
      const unit = copy[activeUnitIndex];
      if (unit) {
        unit.internal_spaces = unit.internal_spaces.filter((_, i) => i !== spaceIdx);
      }
      return copy;
    });
  };

  const handleUpdateSpaceInActiveUnit = (spaceIdx, field, value) => {
    setUnits((prev) => {
      const copy = [...prev];
      const unit = copy[activeUnitIndex];
      if (unit && unit.internal_spaces[spaceIdx]) {
        unit.internal_spaces[spaceIdx] = {
          ...unit.internal_spaces[spaceIdx],
          [field]: value,
        };
      }
      return copy;
    });
  };

  // --- Submission Handler ---
  const handleSaveOrSubmit = async (isSubmittingForApproval) => {
    if (!propertyData.name.trim() || !propertyData.code.trim() || !propertyData.address.trim()) {
      addToast('Property Name, Code, and Address are required.', 'error');
      setCurrentStep(1);
      return;
    }

    if (units.length === 0) {
      addToast('At least one apartment unit must be defined.', 'error');
      setCurrentStep(2);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create Property Record (Initial status = DRAFT)
      const propPayload = {
        name: propertyData.name.trim(),
        code: propertyData.code.trim().toUpperCase(),
        address: propertyData.address.trim(),
        city: propertyData.city || 'Lagos',
        state: propertyData.state || 'Lagos',
        country: propertyData.country || 'Nigeria',
        category: propertyData.category,
        description: propertyData.description,
        environment_description: propertyData.environment_description,
        amenities: propertyData.amenities,
        status: 'DRAFT',
      };

      const propRes = await propertyService.create(propPayload);
      const newPropertyId = propRes.data?.id;

      if (!newPropertyId) {
        throw new Error('Failed to obtain new property ID.');
      }

      // 2. Upload Property-Level Photos (Level A)
      if (propertyPhotos.length > 0) {
        try {
          const mediaPayload = propertyPhotos.map((p, idx) => ({
            fileData: p.fileData,
            fileType: p.fileType,
            category: p.category || 'BUILDING_EXTERIOR',
            caption: p.caption || propertyData.name,
            isPrimary: idx === 0 || p.isPrimary,
            display_order: idx,
          }));
          await propertyService.uploadMedia(newPropertyId, mediaPayload);
        } catch (mediaErr) {
          console.warn('Property media upload warning:', mediaErr.message);
        }
      }

      // 3. Create Level B Apartments and Level C Internal Spaces
      for (const unit of units) {
        const aptRes = await apartmentService.create({
          property_id: newPropertyId,
          unit_number: unit.unit_number,
          unit_name: unit.unit_name,
          unit_type: unit.unit_type,
          floor: parseInt(unit.floor, 10) || 1,
          capacity: parseInt(unit.capacity, 10) || 2,
          bedroom_count: parseInt(unit.bedroom_count, 10) || 1,
          bathroom_count: parseInt(unit.bathroom_count, 10) || 1,
          rate_per_night: parseFloat(unit.rate_per_night) || 50000,
          status: 'AVAILABLE',
        });
        const newAptId = aptRes.data?.id;

        // Upload Apartment Photos (Level B)
        if (newAptId && unit.photos && unit.photos.length > 0) {
          try {
            const aptMediaPayload = unit.photos.map((p, idx) => ({
              fileData: p.fileData,
              fileType: p.fileType,
              category: 'INTERIOR',
              caption: p.caption || unit.unit_name,
              isPrimary: idx === 0,
              display_order: idx,
            }));
            await propertyMediaService.uploadApartmentMedia(newAptId, aptMediaPayload);
          } catch (aptMediaErr) {
            console.warn('Apartment media upload warning:', aptMediaErr.message);
          }
        }

        // Create Level C Internal Spaces
        if (newAptId && unit.internal_spaces && unit.internal_spaces.length > 0) {
          for (let sIdx = 0; sIdx < unit.internal_spaces.length; sIdx++) {
            const space = unit.internal_spaces[sIdx];
            try {
              const spaceRes = await internalSpacesService.createSpace(newAptId, {
                space_type: space.space_type || 'CUSTOM',
                name: space.name,
                description: space.description,
                amenities: space.amenities,
                display_order: sIdx,
              });
              const newSpaceId = spaceRes.data?.id;

              // Upload Space-Specific Photos (Level C)
              if (newSpaceId && space.photos && space.photos.length > 0) {
                const spaceMediaPayload = space.photos.map((p, pIdx) => ({
                  fileData: p.fileData,
                  fileType: p.fileType,
                  caption: p.caption || space.name,
                  isPrimary: pIdx === 0,
                  display_order: pIdx,
                }));
                await internalSpacesService.uploadMedia(newSpaceId, spaceMediaPayload);
              }
            } catch (spErr) {
              console.warn('Internal space creation warning:', spErr.message);
            }
          }
        }
      }

      // 4. Submit for Approval if requested
      if (isSubmittingForApproval) {
        await propertyService.submitForApproval(newPropertyId);
        addToast(
          `Property '${propertyData.name}' created and submitted for Executive Dual-Review Approval!`,
          'success'
        );
      } else {
        addToast(
          `Property '${propertyData.name}' saved as DRAFT successfully. You can submit it for approval whenever ready.`,
          'success'
        );
      }

      onSuccess();
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to save property.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const activeUnit = units[activeUnitIndex];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Property Structure & Multi-Level Media Upload Wizard"
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Wizard Step Progression Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)',
            padding: '12px 20px',
            borderRadius: '10px',
            border: '1px solid var(--border-default)',
            fontSize: '0.85rem',
            overflowX: 'auto',
          }}
        >
          {[
            { step: 1, label: 'Level A: Building & Grounds', icon: Building },
            { step: 2, label: 'Level B: Apartments / Units', icon: Home },
            { step: 3, label: 'Level C: Internal Spaces', icon: Layers },
            { step: 4, label: 'Preview & Submit', icon: CheckCircle },
          ].map((item, idx, arr) => {
            const Icon = item.icon;
            const isDone = currentStep > item.step;
            const isCurrent = currentStep === item.step;
            return (
              <React.Fragment key={item.step}>
                <div
                  onClick={() => setCurrentStep(item.step)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    color: isCurrent
                      ? 'var(--brand-accent)'
                      : isDone
                      ? 'var(--text-primary)'
                      : 'var(--text-muted)',
                    fontWeight: isCurrent ? 700 : 500,
                  }}
                >
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: isCurrent
                        ? 'var(--brand-accent)'
                        : isDone
                        ? '#10b981'
                        : 'var(--bg-card-hover)',
                      color: isCurrent || isDone ? '#ffffff' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                    }}
                  >
                    {isDone ? '✓' : item.step}
                  </span>
                  <span>{item.label}</span>
                </div>
                {idx < arr.length - 1 && (
                  <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>→</span>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* STEP 1: Level A — Building & Grounds */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(212, 175, 55, 0.08)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.25)', fontSize: '0.85rem' }}>
              <strong>Level A (Building & Grounds):</strong> Define building identity, neighborhood environment, overarching amenities, and high-resolution photographs categorized by exterior, reception, lobby, and shared amenities.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Property Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Azure Bay Luxury Waterfront Suites"
                  value={propertyData.name}
                  onChange={(e) => setPropertyData({ ...propertyData, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Unique Property Code *
                </label>
                <input
                  type="text"
                  placeholder="e.g. AZURE-BAY"
                  value={propertyData.code}
                  onChange={(e) => setPropertyData({ ...propertyData, code: e.target.value.toUpperCase() })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Property Category
                </label>
                <select
                  value={propertyData.category}
                  onChange={(e) => setPropertyData({ ...propertyData, category: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                >
                  {PROPERTY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Street Address *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Plot 14 Admiralty Way, Lekki Phase 1"
                  value={propertyData.address}
                  onChange={(e) => setPropertyData({ ...propertyData, address: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                Surrounding Environment & Neighborhood Description
              </label>
              <textarea
                rows={2}
                placeholder="Describe neighborhood scenery, proximity to landmarks, security, and ocean views..."
                value={propertyData.environment_description}
                onChange={(e) => setPropertyData({ ...propertyData, environment_description: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Overarching Amenities */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                Overarching Property Amenities
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Add amenity (e.g. Olympic Swimming Pool)..."
                  value={amenityInput}
                  onChange={(e) => setAmenityInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAmenity(); } }}
                  style={{ flex: 1, padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
                <Button variant="outline" size="sm" onClick={addAmenity}>Add</Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {propertyData.amenities.map((item) => (
                  <span
                    key={item}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '0.78rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {item}
                    <button
                      onClick={() => removeAmenity(item)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Level A Photo Uploader */}
            <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Building & Grounds Photographs (Level A)</h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Upload exterior, lobby, entrance, and shared amenities. Never mix apartment interiors here.</span>
                </div>
                <label
                  style={{
                    background: 'var(--brand-accent)',
                    color: '#ffffff',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Camera size={14} /> Add Property Photos
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileSelect(e, (photo) => setPropertyPhotos((prev) => [...prev, photo]))}
                  />
                </label>
              </div>

              {propertyPhotos.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No property photos staged yet. Select photos to preview thumbnails and select category tags.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                  {propertyPhotos.map((p, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: p.isPrimary ? '2px solid #d4af37' : '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                      }}
                    >
                      <img
                        src={p.previewUrl}
                        alt="Property photo"
                        style={{ width: '100%', height: '110px', objectFit: 'cover' }}
                      />
                      <div style={{ padding: '6px' }}>
                        <select
                          value={p.category}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPropertyPhotos((prev) => prev.map((item, i) => i === idx ? { ...item, category: val } : item));
                          }}
                          style={{ width: '100%', fontSize: '0.72rem', padding: '3px', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}
                        >
                          {PROPERTY_PHOTO_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <button
                            onClick={() => {
                              setPropertyPhotos((prev) => prev.map((item, i) => ({ ...item, isPrimary: i === idx })));
                            }}
                            style={{
                              border: 'none',
                              background: p.isPrimary ? '#d4af37' : 'rgba(255,255,255,0.1)',
                              color: p.isPrimary ? '#0f172a' : 'var(--text-secondary)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            {p.isPrimary ? 'Cover ★' : 'Set Cover'}
                          </button>
                          <button
                            onClick={() => setPropertyPhotos((prev) => prev.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Level B — Apartments / Units */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.85rem' }}>
              <strong>Level B (Apartments & Suites):</strong> Define individual bookable units, rates, capacities, and unit-level photographs. Each unit will have dedicated internal spaces configured in Step 3.
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Defined Units ({units.length})</span>
              <Button variant="primary" size="sm" onClick={handleAddUnit}>
                <Plus size={14} style={{ marginRight: '4px' }} /> Add Unit
              </Button>
            </div>

            {units.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                No apartments added yet. Click <strong>+ Add Unit</strong> to define the first suite in this property.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.25rem', alignItems: 'flex-start' }}>
                {/* Unit Navigation Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {units.map((u, idx) => (
                    <div
                      key={u.tempId || idx}
                      onClick={() => setActiveUnitIndex(idx)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: activeUnitIndex === idx ? 'var(--brand-accent)' : 'var(--bg-surface)',
                        color: activeUnitIndex === idx ? '#ffffff' : 'var(--text-primary)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>Unit {u.unit_number}</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.8 }}>₦{Number(u.rate_per_night).toLocaleString()}/night</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveUnit(idx); }}
                        style={{ border: 'none', background: 'none', color: activeUnitIndex === idx ? '#ffffff' : '#ef4444', cursor: 'pointer', padding: '2px' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {/* Active Unit Configuration Form */}
                {activeUnit && (
                  <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>Unit Number *</label>
                        <input
                          type="text"
                          value={activeUnit.unit_number}
                          onChange={(e) => handleUpdateActiveUnit('unit_number', e.target.value)}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>Unit Name / Title *</label>
                        <input
                          type="text"
                          value={activeUnit.unit_name}
                          onChange={(e) => handleUpdateActiveUnit('unit_name', e.target.value)}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Floor</label>
                        <input
                          type="number"
                          value={activeUnit.floor}
                          onChange={(e) => handleUpdateActiveUnit('floor', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Capacity</label>
                        <input
                          type="number"
                          value={activeUnit.capacity}
                          onChange={(e) => handleUpdateActiveUnit('capacity', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bedrooms</label>
                        <input
                          type="number"
                          value={activeUnit.bedroom_count}
                          onChange={(e) => handleUpdateActiveUnit('bedroom_count', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bathrooms</label>
                        <input
                          type="number"
                          value={activeUnit.bathroom_count}
                          onChange={(e) => handleUpdateActiveUnit('bathroom_count', e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>Nightly Rate (₦) *</label>
                      <input
                        type="number"
                        value={activeUnit.rate_per_night}
                        onChange={(e) => handleUpdateActiveUnit('rate_per_night', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: '#d4af37', fontWeight: 700 }}
                      />
                    </div>

                    {/* Unit Photos (Level B) */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Unit Photos (Level B)</span>
                        <label
                          style={{
                            background: 'var(--bg-card-hover)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Camera size={13} /> Add Unit Photo
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: 'none' }}
                            onChange={(e) => handleFileSelect(e, (p) => {
                              handleUpdateActiveUnit('photos', [...(activeUnit.photos || []), p]);
                            })}
                          />
                        </label>
                      </div>

                      {(!activeUnit.photos || activeUnit.photos.length === 0) ? (
                        <div style={{ padding: '1rem', textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          No unit photos attached.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                          {activeUnit.photos.map((p, pIdx) => (
                            <div key={pIdx} style={{ position: 'relative', width: '90px', height: '65px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                              <img src={p.previewUrl} alt="Unit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button
                                onClick={() => {
                                  handleUpdateActiveUnit('photos', activeUnit.photos.filter((_, i) => i !== pIdx));
                                }}
                                style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Level C — Internal Spaces per Unit */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(168, 85, 247, 0.08)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(168, 85, 247, 0.25)', fontSize: '0.85rem' }}>
              <strong>Level C (Internal Spaces):</strong> Define the internal rooms and zones for each apartment (e.g. Master Bedroom, Chef Kitchen, Luxury Bathroom) with space-specific photographs. Strictly never mix categories.
            </div>

            {units.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Please define at least one apartment unit in Step 2 before configuring internal spaces.
              </div>
            ) : (
              <div>
                {/* Unit Selector Tabs */}
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', borderBottom: '1px solid var(--border-default)', paddingBottom: '8px', marginBottom: '16px' }}>
                  {units.map((u, idx) => (
                    <button
                      key={u.tempId || idx}
                      onClick={() => setActiveUnitIndex(idx)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: activeUnitIndex === idx ? 'var(--brand-accent)' : 'var(--bg-surface)',
                        color: activeUnitIndex === idx ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Unit {u.unit_number} ({u.internal_spaces?.length || 0} spaces)
                    </button>
                  ))}
                </div>

                {activeUnit && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        Internal Spaces for Unit {activeUnit.unit_number} ({activeUnit.unit_name})
                      </span>
                      <Button variant="outline" size="sm" onClick={handleAddSpaceToActiveUnit}>
                        <Plus size={14} style={{ marginRight: '4px' }} /> Add Internal Space
                      </Button>
                    </div>

                    {(!activeUnit.internal_spaces || activeUnit.internal_spaces.length === 0) ? (
                      <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No internal spaces defined for this unit. Click <strong>+ Add Internal Space</strong> to add bedrooms, kitchens, bathrooms, etc.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {activeUnit.internal_spaces.map((sp, sIdx) => (
                          <div
                            key={sp.tempId || sIdx}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-default)',
                              borderRadius: '8px',
                              padding: '12px 16px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                <select
                                  value={sp.space_type}
                                  onChange={(e) => handleUpdateSpaceInActiveUnit(sIdx, 'space_type', e.target.value)}
                                  style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', fontSize: '0.8rem', fontWeight: 600 }}
                                >
                                  {SPACE_TYPES.map((st) => (
                                    <option key={st.value} value={st.value}>{st.label}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  placeholder="Space title (e.g. Master Bedroom with Ensuite)"
                                  value={sp.name}
                                  onChange={(e) => handleUpdateSpaceInActiveUnit(sIdx, 'name', e.target.value)}
                                  style={{ flex: 1, padding: '5px 10px', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', fontSize: '0.85rem' }}
                                />
                              </div>
                              <button
                                onClick={() => handleRemoveSpaceFromActiveUnit(sIdx)}
                                style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', marginLeft: '10px' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            {/* Space Photos (Level C) */}
                            <div style={{ borderTop: '1px dashed var(--border-default)', paddingTop: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  Photos of this specific space ({sp.photos?.length || 0})
                                </span>
                                <label
                                  style={{
                                    background: 'var(--bg-card-hover)',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <Camera size={12} /> Add Space Photo
                                  <input
                                    type="file"
                                    multiple
                                    accept="image/jpeg,image/png,image/webp"
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleFileSelect(e, (p) => {
                                      handleUpdateSpaceInActiveUnit(sIdx, 'photos', [...(sp.photos || []), p]);
                                    })}
                                  />
                                </label>
                              </div>

                              {sp.photos && sp.photos.length > 0 && (
                                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                                  {sp.photos.map((p, pIdx) => (
                                    <div key={pIdx} style={{ position: 'relative', width: '80px', height: '60px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
                                      <img src={p.previewUrl} alt="Space" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      <button
                                        onClick={() => {
                                          handleUpdateSpaceInActiveUnit(sIdx, 'photos', sp.photos.filter((_, i) => i !== pIdx));
                                        }}
                                        style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Full Hierarchy Preview & Executive Submission */}
        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.85rem' }}>
              <strong>Hierarchy Inspection & Approval Gate:</strong> Verify the complete 3-level tree below. You can save as Draft to continue later, or Submit for Dual-Review Executive Approval.
            </div>

            {/* Tree Preview View */}
            <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-default)', maxHeight: '50vh', overflowY: 'auto' }}>
              {/* Level A Node */}
              <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building size={18} style={{ color: '#d4af37' }} />
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {propertyData.name || 'Untitled Property'} ({propertyData.code})
                  </span>
                  <Badge variant="warning">DRAFT</Badge>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {propertyData.address}, {propertyData.city} • Category: {propertyData.category}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {propertyPhotos.length} property photos • {propertyData.amenities.length} amenities
                </div>
              </div>

              {/* Level B & C Hierarchy */}
              <div style={{ paddingLeft: '1.5rem', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {units.map((u, uIdx) => (
                  <div key={uIdx} style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Home size={15} style={{ color: '#38bdf8' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                          Unit {u.unit_number}: {u.unit_name}
                        </span>
                      </div>
                      <span style={{ fontWeight: 700, color: '#d4af37', fontSize: '0.9rem' }}>
                        ₦{Number(u.rate_per_night).toLocaleString()}/night
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {u.photos?.length || 0} unit photos • {u.capacity} Guests • {u.bedroom_count} Bed • {u.bathroom_count} Bath
                    </div>

                    {/* Level C Spaces Tree */}
                    <div style={{ marginTop: '8px', paddingLeft: '1.25rem', borderLeft: '2px solid rgba(212, 175, 55, 0.3)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {u.internal_spaces && u.internal_spaces.map((sp, sIdx) => (
                        <div key={sIdx} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            • <strong>{sp.space_type}</strong>: {sp.name}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {sp.photos?.length || 0} photo(s)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dual Review Policy Banner */}
            <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '0.78rem', color: '#94a3b8' }}>
              🛡️ <strong>Dual-Review Gate:</strong> Once submitted, the property will require independent reviews from both the <strong>System Admin</strong> and the <strong>Business Owner</strong>. Both approvals are mandatory before publication to the public directory.
            </div>
          </div>
        )}

        {/* Wizard Controls Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-default)', paddingTop: '1rem' }}>
          <div>
            {currentStep > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep((prev) => prev - 1)}
                disabled={submitting}
              >
                <ChevronLeft size={14} style={{ marginRight: '4px' }} /> Back
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>

            {currentStep < 4 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCurrentStep((prev) => prev + 1)}
              >
                Next <ChevronRight size={14} style={{ marginLeft: '4px' }} />
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSaveOrSubmit(false)}
                  loading={submitting}
                >
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSaveOrSubmit(true)}
                  loading={submitting}
                  style={{ background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)', color: '#0f172a', fontWeight: 700 }}
                >
                  <Send size={14} style={{ marginRight: '4px' }} /> Submit for Executive Approval
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
