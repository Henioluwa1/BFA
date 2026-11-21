import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { apartmentService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  Home,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Check,
  AlertTriangle,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

const UNIT_TYPES = [
  'Studio Apartment',
  '1-Bedroom Luxury Suite',
  '2-Bedroom Luxury Suite',
  '3-Bedroom Executive Suite',
  'Penthouse Collection',
  'Presidential Villa',
  'Duplex Loft',
];

export default function AddUnitsToPropertyModal({ isOpen, onClose, property, onSuccess }) {
  const { addToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const createInitialUnit = () => ({
    tempId: Date.now() + Math.random(),
    apartment_code: '',
    unit_number: '',
    unit_name: '',
    unit_type: '2-Bedroom Luxury Suite',
    description: '',
    floor: 1,
    capacity: 2,
    bedroom_count: 1,
    bathroom_count: 1,
    rate_per_night: 75000,
    mainApartmentPhoto: null, // { fileData, fileType, fileName, previewUrl }
    apartment_amenities: [
      {
        tempId: 1,
        name: '55-inch 4K Smart OLED TV',
        description: 'Wall-mounted smart entertainment display with Netflix & Disney+ streaming.',
        photoData: null,
        previewUrl: '',
      },
      {
        tempId: 2,
        name: 'High-Speed Fiber Wi-Fi',
        description: 'Dedicated high-speed wireless connectivity throughout the suite.',
        photoData: null,
        previewUrl: '',
      },
    ],
  });

  const [units, setUnits] = useState([createInitialUnit()]);
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);

  // Reset when modal opens for a property
  useEffect(() => {
    if (isOpen) {
      setUnits([createInitialUnit()]);
      setActiveUnitIndex(0);
      setSubmitting(false);
    }
  }, [isOpen, property]);

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

  const handleUpdateUnit = (idx, field, value) => {
    setUnits((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleAddUnitToQueue = () => {
    setUnits((prev) => [...prev, createInitialUnit()]);
    setActiveUnitIndex(units.length);
  };

  const handleRemoveUnitFromQueue = (idx) => {
    if (units.length === 1) {
      addToast('At least one unit must be defined.', 'warning');
      return;
    }
    setUnits((prev) => prev.filter((_, i) => i !== idx));
    setActiveUnitIndex((prev) => Math.max(0, prev >= idx ? prev - 1 : prev));
  };

  const handleAddAmenity = (unitIdx) => {
    setUnits((prev) => {
      const copy = [...prev];
      const amns = copy[unitIdx].apartment_amenities || [];
      copy[unitIdx] = {
        ...copy[unitIdx],
        apartment_amenities: [
          ...amns,
          {
            tempId: Date.now() + Math.random(),
            name: '',
            description: '',
            photoData: null,
            previewUrl: '',
          },
        ],
      };
      return copy;
    });
  };

  const handleUpdateAmenity = (unitIdx, amnIdx, field, value) => {
    setUnits((prev) => {
      const copy = [...prev];
      const amns = [...(copy[unitIdx].apartment_amenities || [])];
      amns[amnIdx] = { ...amns[amnIdx], [field]: value };
      copy[unitIdx] = { ...copy[unitIdx], apartment_amenities: amns };
      return copy;
    });
  };

  const handleRemoveAmenity = (unitIdx, amnIdx) => {
    setUnits((prev) => {
      const copy = [...prev];
      const amns = (copy[unitIdx].apartment_amenities || []).filter((_, i) => i !== amnIdx);
      copy[unitIdx] = { ...copy[unitIdx], apartment_amenities: amns };
      return copy;
    });
  };

  // Validation
  const validateUnits = () => {
    const codes = new Set();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const code = (u.apartment_code || '').trim().toUpperCase();
      if (!code) {
        addToast(`Unit #${i + 1} requires a manually entered Apartment ID (e.g. APT-201).`, 'error');
        setActiveUnitIndex(i);
        return false;
      }
      if (codes.has(code)) {
        addToast(`Duplicate Apartment ID '${code}' detected in batch.`, 'error');
        setActiveUnitIndex(i);
        return false;
      }
      codes.add(code);

      if (!u.unit_name.trim()) {
        addToast(`Unit '${code}' requires an Apartment Name.`, 'error');
        setActiveUnitIndex(i);
        return false;
      }

      const amns = u.apartment_amenities || [];
      for (let j = 0; j < amns.length; j++) {
        if (!amns[j].name.trim()) {
          addToast(`Unit '${code}': Amenity #${j + 1} requires an Amenity Name.`, 'error');
          setActiveUnitIndex(i);
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!property?.id) {
      addToast('No property selected.', 'error');
      return;
    }
    if (!validateUnits()) return;

    setSubmitting(true);
    let createdCount = 0;

    try {
      for (const unit of units) {
        const aptRes = await apartmentService.create({
          property_id: property.id,
          apartment_code: unit.apartment_code.trim().toUpperCase(),
          unit_number: unit.unit_number.trim() || unit.apartment_code.trim(),
          unit_name: unit.unit_name.trim(),
          unit_type: unit.unit_type,
          description: unit.description.trim() || null,
          floor: parseInt(unit.floor, 10) || 1,
          capacity: parseInt(unit.capacity, 10) || 2,
          bedroom_count: parseInt(unit.bedroom_count, 10) || 1,
          bathroom_count: parseInt(unit.bathroom_count, 10) || 1,
          rate_per_night: parseFloat(unit.rate_per_night) || 50000,
          status: 'AVAILABLE',
        });

        const newAptId = aptRes.data?.id;
        if (newAptId) {
          createdCount++;

          // Upload Main Apartment Photograph if provided
          if (unit.mainApartmentPhoto?.fileData) {
            try {
              await apartmentService.uploadMedia(newAptId, [
                {
                  fileData: unit.mainApartmentPhoto.fileData,
                  fileType: unit.mainApartmentPhoto.fileType,
                  caption: `${unit.unit_name} - Main Interior Photograph`,
                  isPrimary: true,
                  display_order: 0,
                },
              ]);
            } catch (imgErr) {
              console.warn(`Unit ${unit.apartment_code} main photo upload warning:`, imgErr.message);
            }
          }

          // Save Dynamic In-suite Amenities
          if (unit.apartment_amenities?.length > 0) {
            try {
              const formatted = unit.apartment_amenities.map((a, idx) => ({
                name: a.name.trim(),
                description: a.description.trim(),
                photoData: a.photoData || null,
                fileType: a.fileType || null,
                display_order: idx,
              }));
              await apartmentService.saveAmenities(newAptId, formatted);
            } catch (amnErr) {
              console.warn(`Unit ${unit.apartment_code} amenities save warning:`, amnErr.message);
            }
          }
        }
      }

      addToast(
        `Successfully registered ${createdCount} new apartment unit${createdCount > 1 ? 's' : ''} to ${property.name}!`,
        'success'
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error adding units:', err);
      addToast(err.message || 'Failed to save apartment units.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const currentUnit = units[activeUnitIndex] || units[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add Units to Property — ${property?.name || 'Property'}`}
      subtitle={`Register additional serviced apartment units under ${property?.name} (${property?.code || 'ID: ' + property?.id})`}
      size="xl"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Selected Property Identification Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.15) 0%, rgba(10, 10, 14, 0.85) 100%)',
            border: '1px solid rgba(212, 175, 55, 0.35)',
            borderRadius: '10px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Home size={20} style={{ color: '#d4af37' }} />
            <div>
              <div style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.95rem' }}>
                {property?.name}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Code: <strong style={{ color: '#fbbf24' }}>{property?.code}</strong> · Location:{' '}
                {property?.location || property?.district || property?.city || 'Lagos'}
              </div>
            </div>
          </div>
          <span
            style={{
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '3px 9px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            Property ID #{property?.id}
          </span>
        </div>

        {/* Units Tabs / Selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', flex: 1, paddingBottom: '4px' }}>
            {units.map((u, idx) => (
              <button
                key={u.tempId}
                type="button"
                onClick={() => setActiveUnitIndex(idx)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  border: idx === activeUnitIndex ? '1px solid #d4af37' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: idx === activeUnitIndex ? 'rgba(212, 175, 55, 0.25)' : 'rgba(0, 0, 0, 0.45)',
                  color: idx === activeUnitIndex ? '#fbbf24' : '#cbd5e1',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{u.apartment_code || `Unit #${idx + 1}`}</span>
                {units.length > 1 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveUnitFromQueue(idx);
                    }}
                    style={{ color: '#f87171', cursor: 'pointer', fontSize: '0.85rem' }}
                    title="Remove unit from batch"
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
          </div>

          <Button type="button" size="sm" variant="outline" onClick={handleAddUnitToQueue}>
            <Plus size={14} /> Add Another Unit
          </Button>
        </div>

        {/* Active Unit Configuration Form */}
        {currentUnit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Row 1: Identification */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label">
                  Manually Entered Apartment ID * <span style={{ color: '#fbbf24' }}>(Unique)</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  required
                  placeholder="e.g. APT-201, SUITE-301"
                  value={currentUnit.apartment_code}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'apartment_code', e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <label className="form-label">Unit Number / Room #</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. 201"
                  value={currentUnit.unit_number}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'unit_number', e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Apartment Name *</label>
                <input
                  type="text"
                  className="input-field"
                  required
                  placeholder="e.g. Azure Skyline Suite 201"
                  value={currentUnit.unit_name}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'unit_name', e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: Type, Floor, Capacity, Rate */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label">Unit Type / Category</label>
                <select
                  className="input-field"
                  value={currentUnit.unit_type}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'unit_type', e.target.value)}
                >
                  {UNIT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Floor</label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  value={currentUnit.floor}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'floor', e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Max Guests</label>
                <input
                  type="number"
                  min="1"
                  className="input-field"
                  value={currentUnit.capacity}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'capacity', e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Bedrooms</label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  value={currentUnit.bedroom_count}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'bedroom_count', e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Bathrooms</label>
                <input
                  type="number"
                  min="1"
                  className="input-field"
                  value={currentUnit.bathroom_count}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'bathroom_count', e.target.value)}
                />
              </div>

              <div>
                <label className="form-label">Nightly Rate (₦) *</label>
                <input
                  type="number"
                  min="1000"
                  step="500"
                  required
                  className="input-field"
                  value={currentUnit.rate_per_night}
                  onChange={(e) => handleUpdateUnit(activeUnitIndex, 'rate_per_night', e.target.value)}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="form-label">Apartment Overview & Description</label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Describe layout, interior aesthetics, view, or executive finishes..."
                value={currentUnit.description}
                onChange={(e) => handleUpdateUnit(activeUnitIndex, 'description', e.target.value)}
              />
            </div>

            {/* Main Apartment Interior Photograph */}
            <div style={{ background: 'rgba(0, 0, 0, 0.45)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <label className="form-label" style={{ fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ImageIcon size={15} /> Main Apartment Interior Photograph
              </label>

              {currentUnit.mainApartmentPhoto ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '8px' }}>
                  <img
                    src={currentUnit.mainApartmentPhoto.previewUrl}
                    alt="Main Apartment"
                    style={{ width: '90px', height: '65px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #d4af37' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#fff' }}>
                      {currentUnit.mainApartmentPhoto.fileName}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUpdateUnit(activeUnitIndex, 'mainApartmentPhoto', null)}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.75rem', cursor: 'pointer', padding: 0, marginTop: '4px' }}
                    >
                      Remove & Replace Photo
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1.5px dashed rgba(212, 175, 55, 0.4)',
                    background: 'rgba(212, 175, 55, 0.04)',
                    cursor: 'pointer',
                    marginTop: '6px',
                  }}
                >
                  <Upload size={18} style={{ color: '#d4af37' }} />
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                    Click to upload main apartment photo (Max 10MB)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        processImageFile(file, (photo) => {
                          handleUpdateUnit(activeUnitIndex, 'mainApartmentPhoto', photo);
                        });
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            {/* In-Suite Apartment Amenities */}
            <div style={{ background: 'rgba(0, 0, 0, 0.45)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="form-label" style={{ fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                  <Sparkles size={15} /> In-Suite Amenities & Features ({currentUnit.apartment_amenities?.length || 0})
                </label>
                <button
                  type="button"
                  onClick={() => handleAddAmenity(activeUnitIndex)}
                  style={{
                    background: 'rgba(212, 175, 55, 0.15)',
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                    color: '#fbbf24',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  + Add Amenity
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {(currentUnit.apartment_amenities || []).map((amn, aIdx) => (
                  <div
                    key={amn.tempId}
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Amenity Name (e.g. Smart OLED TV)"
                      className="input-field"
                      style={{ flex: 1, fontSize: '0.78rem', padding: '5px 8px' }}
                      value={amn.name}
                      onChange={(e) => handleUpdateAmenity(activeUnitIndex, aIdx, 'name', e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      className="input-field"
                      style={{ flex: 1.5, fontSize: '0.78rem', padding: '5px 8px' }}
                      value={amn.description}
                      onChange={(e) => handleUpdateAmenity(activeUnitIndex, aIdx, 'description', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveAmenity(activeUnitIndex, aIdx)}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                      title="Remove amenity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '14px' }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            style={{
              background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
              color: '#000000',
              fontWeight: 800,
              minWidth: '180px',
            }}
          >
            <ShieldCheck size={16} />
            {submitting ? 'Registering Units...' : `Save & Register ${units.length} Unit${units.length > 1 ? 's' : ''}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
