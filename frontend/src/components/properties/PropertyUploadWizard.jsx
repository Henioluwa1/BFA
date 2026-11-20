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
  Upload,
  X,
  Sparkles,
  MapPin,
  Tag,
  ShieldCheck,
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

  const [currentStep, setCurrentStep] = useState(1); // 1: Property & Building Amenities, 2: Apartment Registration & Amenities, 3: Internal Spaces Breakdown, 4: Preview & Submit
  const [submitting, setSubmitting] = useState(false);

  // -------------------------------------------------------------
  // PART 2: PROPERTY REGISTRATION STATE (Level A)
  // -------------------------------------------------------------
  // Section 1: Property Information
  const [propertyData, setPropertyData] = useState({
    name: '',
    code: '',
    category: 'SERVICED_APARTMENTS',
    location: '',
    district: '',
    address: '',
    environment_description: '',
    description: '',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    check_in_time: '14:00',
    check_out_time: '11:00',
  });

  // Section 2: Main Building Photograph
  const [mainBuildingPhoto, setMainBuildingPhoto] = useState(null); // { fileData, fileType, fileName, previewUrl, isPrimary: true }

  // Section 3: Dynamic Property/Building Amenities (Max 7)
  const [buildingAmenities, setBuildingAmenities] = useState([
    {
      tempId: 1,
      name: '24/7 Central Power Generator',
      description: 'Continuous uninterrupted dual-redundant backup power for the entire building estate.',
      photoData: null,
      fileType: null,
      previewUrl: '',
    },
    {
      tempId: 2,
      name: 'Controlled Resident Parking Garage',
      description: 'Covered, secure underground parking with automated gate access control.',
      photoData: null,
      fileType: null,
      previewUrl: '',
    },
    {
      tempId: 3,
      name: 'Executive Concierge & Reception',
      description: 'Round-the-clock staffed arrival reception and guest assistance lobby.',
      photoData: null,
      fileType: null,
      previewUrl: '',
    },
  ]);

  // -------------------------------------------------------------
  // PART 3: APARTMENT / UNIT REGISTRATION STATE (Level B & C)
  // -------------------------------------------------------------
  const [units, setUnits] = useState([
    {
      tempId: 101,
      apartment_code: 'APT-101',
      unit_number: '101',
      unit_name: 'Executive Horizon Suite 101',
      unit_type: '2-Bedroom Luxury Suite',
      description: 'Opulent serviced apartment with open-plan reception salon and skyline vistas.',
      floor: 1,
      capacity: 4,
      bedroom_count: 2,
      bathroom_count: 2,
      rate_per_night: 85000,
      mainApartmentPhoto: null,
      apartment_amenities: [
        {
          tempId: 1,
          name: '55-inch 4K Smart OLED Television',
          description: 'Wall-mounted smart entertainment display with Netflix & Disney+ pre-configured.',
          photoData: null,
          previewUrl: '',
        },
        {
          tempId: 2,
          name: 'Dual-Door Frost-Free Refrigerator',
          description: 'Spacious kitchen refrigeration with freezer compartment and cold water dispenser.',
          photoData: null,
          previewUrl: '',
        },
        {
          tempId: 3,
          name: 'Orthopaedic King-Size Bed',
          description: 'Master suite king bed with premium high-density mattress and 600-thread linens.',
          photoData: null,
          previewUrl: '',
        },
      ],
      internal_spaces: [
        {
          tempId: 1,
          space_type: 'LIVING_ROOM',
          name: 'Main Living Salon & Lounge',
          description: 'Designer sofa lounge with ambient ceiling lighting and floor-to-ceiling balcony glazing.',
          photos: [],
        },
        {
          tempId: 2,
          space_type: 'BEDROOM',
          name: 'Master Suite Bedroom',
          description: 'Private enclosed master bedroom with walk-in wardrobe and en-suite bath.',
          photos: [],
        },
      ],
    },
  ]);

  const [activeUnitIndex, setActiveUnitIndex] = useState(0);

  // -------------------------------------------------------------
  // IMAGE UPLOAD HELPER
  // -------------------------------------------------------------
  const processImageFile = (file, onSuccess) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      addToast(`Image '${file.name}' exceeds the 10MB size limit.`, 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onSuccess({
        fileData: e.target.result,
        fileType: file.type || 'image/jpeg',
        fileName: file.name,
        previewUrl: e.target.result,
      });
    };
    reader.readAsDataURL(file);
  };

  // -------------------------------------------------------------
  // BUILDING AMENITIES ACTIONS (Max 7 Limit)
  // -------------------------------------------------------------
  const handleAddBuildingAmenity = () => {
    if (buildingAmenities.length >= 7) {
      addToast('Maximum of 7 building amenities allowed per property.', 'warning');
      return;
    }
    const newAmenity = {
      tempId: Date.now() + Math.random(),
      name: '',
      description: '',
      photoData: null,
      fileType: null,
      previewUrl: '',
    };
    setBuildingAmenities((prev) => [...prev, newAmenity]);
  };

  const handleUpdateBuildingAmenity = (idx, field, value) => {
    setBuildingAmenities((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleRemoveBuildingAmenity = (idx) => {
    setBuildingAmenities((prev) => prev.filter((_, i) => i !== idx));
  };

  // -------------------------------------------------------------
  // APARTMENT ACTIONS (Manually Entered Apartment ID & Dynamic Amenities)
  // -------------------------------------------------------------
  const handleAddUnit = () => {
    const nextNum = 101 + units.length;
    const newUnit = {
      tempId: Date.now() + Math.random(),
      apartment_code: `APT-${nextNum}`,
      unit_number: `${nextNum}`,
      unit_name: `Apartment Suite ${nextNum}`,
      unit_type: '2-Bedroom Luxury Suite',
      description: '',
      floor: 1,
      capacity: 2,
      bedroom_count: 1,
      bathroom_count: 1,
      rate_per_night: 65000,
      mainApartmentPhoto: null,
      apartment_amenities: [],
      internal_spaces: [],
    };
    setUnits((prev) => [...prev, newUnit]);
    setActiveUnitIndex(units.length);
  };

  const handleRemoveUnit = (idx) => {
    if (units.length <= 1) {
      addToast('A property must contain at least one apartment unit.', 'warning');
      return;
    }
    setUnits((prev) => prev.filter((_, i) => i !== idx));
    if (activeUnitIndex >= units.length - 1 && activeUnitIndex > 0) {
      setActiveUnitIndex(activeUnitIndex - 1);
    }
  };

  const handleUpdateActiveUnit = (field, value) => {
    setUnits((prev) => {
      const copy = [...prev];
      copy[activeUnitIndex] = { ...copy[activeUnitIndex], [field]: value };
      // Keep unit_number aligned with apartment_code if not independently specified
      if (field === 'apartment_code') {
        copy[activeUnitIndex].unit_number = value;
      }
      return copy;
    });
  };

  // Apartment Dynamic Amenities (Unlimited)
  const handleAddApartmentAmenity = () => {
    const newAmenity = {
      tempId: Date.now() + Math.random(),
      name: '',
      description: '',
      photoData: null,
      fileType: null,
      previewUrl: '',
    };
    setUnits((prev) => {
      const copy = [...prev];
      const unit = copy[activeUnitIndex];
      if (unit) {
        unit.apartment_amenities = [...(unit.apartment_amenities || []), newAmenity];
      }
      return copy;
    });
  };

  const handleUpdateApartmentAmenity = (amenityIdx, field, value) => {
    setUnits((prev) => {
      const copy = [...prev];
      const unit = copy[activeUnitIndex];
      if (unit && unit.apartment_amenities && unit.apartment_amenities[amenityIdx]) {
        unit.apartment_amenities[amenityIdx] = {
          ...unit.apartment_amenities[amenityIdx],
          [field]: value,
        };
      }
      return copy;
    });
  };

  const handleRemoveApartmentAmenity = (amenityIdx) => {
    setUnits((prev) => {
      const copy = [...prev];
      const unit = copy[activeUnitIndex];
      if (unit && unit.apartment_amenities) {
        unit.apartment_amenities = unit.apartment_amenities.filter((_, i) => i !== amenityIdx);
      }
      return copy;
    });
  };

  // Step 3: Space Management for Active Unit
  const handleAddSpaceToActiveUnit = () => {
    const newSpace = {
      tempId: Date.now() + Math.random(),
      space_type: 'BEDROOM',
      name: 'New Internal Space',
      description: '',
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

  const handleUpdateSpaceInActiveUnit = (spaceIdx, field, value) => {
    setUnits((prev) => {
      const copy = [...prev];
      const unit = copy[activeUnitIndex];
      if (unit && unit.internal_spaces && unit.internal_spaces[spaceIdx]) {
        unit.internal_spaces[spaceIdx] = {
          ...unit.internal_spaces[spaceIdx],
          [field]: value,
        };
      }
      return copy;
    });
  };

  const handleRemoveSpaceFromActiveUnit = (spaceIdx) => {
    setUnits((prev) => {
      const copy = [...prev];
      const unit = copy[activeUnitIndex];
      if (unit && unit.internal_spaces) {
        unit.internal_spaces = unit.internal_spaces.filter((_, i) => i !== spaceIdx);
      }
      return copy;
    });
  };

  // -------------------------------------------------------------
  // VALIDATION & STEP NAVIGATION
  // -------------------------------------------------------------
  const validateStep1 = () => {
    if (!propertyData.name.trim()) {
      addToast('Property Name is required.', 'error');
      return false;
    }
    if (!propertyData.code.trim()) {
      addToast('Property Code is required.', 'error');
      return false;
    }
    if (!propertyData.address.trim()) {
      addToast('Full Property Address is required.', 'error');
      return false;
    }
    if (buildingAmenities.length > 7) {
      addToast('Maximum of 7 building amenities allowed per property.', 'error');
      return false;
    }
    for (let i = 0; i < buildingAmenities.length; i++) {
      if (!buildingAmenities[i].name.trim()) {
        addToast(`Building Amenity #${i + 1} requires an Amenity Name.`, 'error');
        return false;
      }
    }
    return true;
  };

  const validateStep2 = () => {
    if (units.length === 0) {
      addToast('At least one apartment unit must be registered.', 'error');
      return false;
    }
    // Check duplicate apartment IDs within property scope
    const codeSet = new Set();
    for (let i = 0; i < units.length; i++) {
      const code = String(units[i].apartment_code || units[i].unit_number || '').trim().toUpperCase();
      if (!code) {
        addToast(`Unit #${i + 1} requires a manually entered Apartment ID (e.g. APT-001).`, 'error');
        setActiveUnitIndex(i);
        return false;
      }
      if (codeSet.has(code)) {
        addToast(`Duplicate Apartment ID '${code}' detected. Each apartment must have a unique ID within this property.`, 'error');
        setActiveUnitIndex(i);
        return false;
      }
      codeSet.add(code);

      if (!units[i].unit_name.trim()) {
        addToast(`Unit '${code}' requires an Apartment Name.`, 'error');
        setActiveUnitIndex(i);
        return false;
      }

      // Validate apartment amenities
      const aptAmn = units[i].apartment_amenities || [];
      for (let j = 0; j < aptAmn.length; j++) {
        if (!aptAmn[j].name.trim()) {
          addToast(`Unit '${code}': Amenity #${j + 1} requires an Amenity Name.`, 'error');
          setActiveUnitIndex(i);
          return false;
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!validateStep2()) return;
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // -------------------------------------------------------------
  // SUBMISSION HANDLER (Draft or Dual-Review Executive Submission)
  // -------------------------------------------------------------
  const handleSaveOrSubmit = async (isSubmittingForApproval) => {
    if (!validateStep1() || !validateStep2()) {
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create Property Record
      const propPayload = {
        name: propertyData.name.trim(),
        code: propertyData.code.trim().toUpperCase(),
        category: propertyData.category,
        location: propertyData.location.trim() || null,
        district: propertyData.district.trim() || null,
        address: propertyData.address.trim(),
        city: propertyData.city || 'Lagos',
        state: propertyData.state || 'Lagos',
        country: propertyData.country || 'Nigeria',
        environment_description: propertyData.environment_description.trim() || null,
        description: propertyData.description.trim() || null,
        check_in_time: propertyData.check_in_time || '14:00',
        check_out_time: propertyData.check_out_time || '11:00',
        status: 'DRAFT',
      };

      const propRes = await propertyService.create(propPayload);
      const newPropertyId = propRes.data?.id;
      if (!newPropertyId) {
        throw new Error('Failed to create property record.');
      }

      // 2. Upload Main Building Photograph if provided
      if (mainBuildingPhoto && mainBuildingPhoto.fileData) {
        try {
          await propertyService.uploadMedia(newPropertyId, [
            {
              fileData: mainBuildingPhoto.fileData,
              fileType: mainBuildingPhoto.fileType,
              category: 'BUILDING_EXTERIOR',
              caption: `${propertyData.name} - Main Building Photograph`,
              isPrimary: true,
              display_order: 0,
            },
          ]);
        } catch (imgErr) {
          console.warn('Main building photo upload warning:', imgErr.message);
        }
      }

      // 3. Save Dynamic Building Amenities (Max 7)
      if (buildingAmenities.length > 0) {
        try {
          const formattedAmenities = buildingAmenities.map((a, idx) => ({
            name: a.name.trim(),
            description: a.description.trim(),
            photoData: a.photoData || null,
            fileType: a.fileType || null,
            display_order: idx,
          }));
          await propertyService.saveAmenities(newPropertyId, formattedAmenities);
        } catch (amnErr) {
          console.warn('Building amenities save warning:', amnErr.message);
        }
      }

      // 4. Create Apartments and their dynamic amenities & main photos
      for (const unit of units) {
        const aptRes = await apartmentService.create({
          property_id: newPropertyId,
          apartment_code: unit.apartment_code.trim(),
          unit_number: unit.unit_number.trim(),
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
          // Upload Main Apartment Photograph
          if (unit.mainApartmentPhoto && unit.mainApartmentPhoto.fileData) {
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
            } catch (aptImgErr) {
              console.warn(`Unit ${unit.apartment_code} main photo upload warning:`, aptImgErr.message);
            }
          }

          // Save Dynamic Apartment Amenities
          if (unit.apartment_amenities && unit.apartment_amenities.length > 0) {
            try {
              const formattedAptAmn = unit.apartment_amenities.map((a, aIdx) => ({
                name: a.name.trim(),
                description: a.description.trim(),
                photoData: a.photoData || null,
                fileType: a.fileType || null,
                display_order: aIdx,
              }));
              await apartmentService.saveAmenities(newAptId, formattedAptAmn);
            } catch (aptAmnErr) {
              console.warn(`Unit ${unit.apartment_code} amenities save warning:`, aptAmnErr.message);
            }
          }

          // Create Level C Internal Spaces
          if (unit.internal_spaces && unit.internal_spaces.length > 0) {
            for (let sIdx = 0; sIdx < unit.internal_spaces.length; sIdx++) {
              const space = unit.internal_spaces[sIdx];
              try {
                const spaceRes = await internalSpacesService.createSpace(newAptId, {
                  space_type: space.space_type || 'CUSTOM',
                  name: space.name,
                  description: space.description,
                  display_order: sIdx,
                });
                const newSpaceId = spaceRes.data?.id;
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
      }

      // 5. Submit for Approval or Save as Draft
      if (isSubmittingForApproval) {
        await propertyService.submitForApproval(newPropertyId);
        addToast(
          `Property '${propertyData.name}' created and submitted for Executive Dual-Review Approval!`,
          'success'
        );
      } else {
        addToast(
          `Property '${propertyData.name}' saved as DRAFT successfully. You can review and submit it whenever ready.`,
          'success'
        );
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to complete property registration.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const activeUnit = units[activeUnitIndex] || units[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Property Structure, Media & Amenities Registration"
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Step Indicator Ribbon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)',
            padding: '12px 18px',
            borderRadius: '10px',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: currentStep >= 1 ? '#d4af37' : 'var(--bg-card)',
                color: currentStep >= 1 ? '#000' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              1
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: currentStep === 1 ? 700 : 500, color: currentStep === 1 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Property & Building Amenities
            </span>
          </div>

          <ChevronRight size={16} color="var(--text-muted)" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: currentStep >= 2 ? '#d4af37' : 'var(--bg-card)',
                color: currentStep >= 2 ? '#000' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              2
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: currentStep === 2 ? 700 : 500, color: currentStep === 2 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Apartments & Amenities
            </span>
          </div>

          <ChevronRight size={16} color="var(--text-muted)" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: currentStep >= 3 ? '#d4af37' : 'var(--bg-card)',
                color: currentStep >= 3 ? '#000' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              3
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: currentStep === 3 ? 700 : 500, color: currentStep === 3 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Internal Spaces
            </span>
          </div>

          <ChevronRight size={16} color="var(--text-muted)" />

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: currentStep === 4 ? '#d4af37' : 'var(--bg-card)',
                color: currentStep === 4 ? '#000' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              4
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: currentStep === 4 ? 700 : 500, color: currentStep === 4 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              Preview & Submit
            </span>
          </div>
        </div>

        {/* ============================================================= */}
        {/* STEP 1: PROPERTY INFORMATION, MAIN BUILDING PHOTO & AMENITIES */}
        {/* ============================================================= */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* SECTION 1: PROPERTY INFORMATION */}
            <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Building size={20} color="#d4af37" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  1. PROPERTY INFORMATION
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Property Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Grand Horizon Tower"
                    value={propertyData.name}
                    onChange={(e) => setPropertyData({ ...propertyData, name: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Property Code / Reference *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GHT-VI"
                    value={propertyData.code}
                    onChange={(e) => setPropertyData({ ...propertyData, code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem', textTransform: 'uppercase' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Property Category *
                  </label>
                  <select
                    value={propertyData.category}
                    onChange={(e) => setPropertyData({ ...propertyData, category: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                  >
                    {PROPERTY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Location (Enclave / Area)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Victoria Island Waterfront"
                    value={propertyData.location}
                    onChange={(e) => setPropertyData({ ...propertyData, location: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    District
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Eti-Osa District"
                    value={propertyData.district}
                    onChange={(e) => setPropertyData({ ...propertyData, district: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Full Property Address *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 12 Bishop Aboyade Cole Street, Victoria Island, Lagos"
                    value={propertyData.address}
                    onChange={(e) => setPropertyData({ ...propertyData, address: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Surrounding Neighbourhood & Highlights
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Describe surrounding enclave, nearby amenities, proximity to business hubs, water views, etc."
                    value={propertyData.environment_description}
                    onChange={(e) => setPropertyData({ ...propertyData, environment_description: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Property Description
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Comprehensive description of the building estate, architectural highlights, service tier, security standard..."
                    value={propertyData.description}
                    onChange={(e) => setPropertyData({ ...propertyData, description: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: MAIN PROPERTY / BUILDING PHOTOGRAPH */}
            <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Camera size={20} color="#d4af37" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    2. MAIN PROPERTY / BUILDING PHOTOGRAPH
                  </h3>
                </div>
                <Badge variant="warning">PRIMARY LISTING COVER</Badge>
              </div>

              <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                This photograph represents the entire building/estate and will serve as the prominent visual facade across public listings and guest discovery.
              </p>

              {mainBuildingPhoto ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-surface)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                  <img
                    src={mainBuildingPhoto.previewUrl}
                    alt="Main Building"
                    style={{ width: '140px', height: '95px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #d4af37' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {mainBuildingPhoto.fileName}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#10b981', marginTop: '2px', fontWeight: 600 }}>
                      ✓ Verified Main Building Photograph (Primary Cover)
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                      <label style={{ cursor: 'pointer' }}>
                        <Button variant="outline" size="sm" type="button" onClick={() => {}}>
                          <Upload size={14} style={{ marginRight: '6px' }} /> Replace Photograph
                        </Button>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: 'none' }}
                          onChange={(e) => processImageFile(e.target.files[0], (data) => setMainBuildingPhoto({ ...data, isPrimary: true }))}
                        />
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setMainBuildingPhoto(null)}
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}
                      >
                        <Trash2 size={14} style={{ marginRight: '6px' }} /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '30px',
                    border: '2px dashed var(--border-default)',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <Upload size={32} color="#d4af37" style={{ marginBottom: '8px' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Upload Main Building Photograph
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    High-resolution exterior or facade photo (JPEG, PNG, WebP up to 10MB)
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => processImageFile(e.target.files[0], (data) => setMainBuildingPhoto({ ...data, isPrimary: true }))}
                  />
                </label>
              )}
            </div>

            {/* SECTION 3: DYNAMIC PROPERTY / BUILDING AMENITIES (MAX 7) */}
            <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={20} color="#d4af37" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    3. PROPERTY / BUILDING AMENITIES
                  </h3>
                </div>
                <Badge variant={buildingAmenities.length >= 7 ? 'danger' : 'info'}>
                  {buildingAmenities.length} / 7 AMENITIES (MAX 7)
                </Badge>
              </div>

              <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Describe what this building specifically offers (e.g. Parking Garage, Swimming Pool, Generator, Security Post, Elevator, Gym). Each amenity requires a Name, Photograph, and Description.
              </p>

              {/* Amenity Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                {buildingAmenities.map((amenity, idx) => (
                  <div
                    key={amenity.tempId || idx}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#d4af37', textTransform: 'uppercase' }}>
                        Building Facility #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBuildingAmenity(idx)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        <Trash2 size={14} /> Remove Amenity
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                      {/* Amenity Name */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Amenity Name *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Swimming Pool & Sun Deck"
                          value={amenity.name}
                          onChange={(e) => handleUpdateBuildingAmenity(idx, 'name', e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                        />
                      </div>

                      {/* Amenity Description */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Amenity Description
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Outdoor heated swimming pool with lounge deck and lifeguard"
                          value={amenity.description}
                          onChange={(e) => handleUpdateBuildingAmenity(idx, 'description', e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>

                    {/* Amenity Photograph */}
                    <div style={{ marginTop: '4px' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        Amenity Photograph
                      </label>
                      {amenity.previewUrl ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img
                            src={amenity.previewUrl}
                            alt={amenity.name || 'Amenity'}
                            style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <label style={{ cursor: 'pointer' }}>
                              <Button variant="outline" size="sm" type="button" onClick={() => {}}>
                                Replace Photo
                              </Button>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                style={{ display: 'none' }}
                                onChange={(e) => processImageFile(e.target.files[0], (data) => {
                                  handleUpdateBuildingAmenity(idx, 'photoData', data.fileData);
                                  handleUpdateBuildingAmenity(idx, 'fileType', data.fileType);
                                  handleUpdateBuildingAmenity(idx, 'previewUrl', data.previewUrl);
                                })}
                              />
                            </label>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => {
                                handleUpdateBuildingAmenity(idx, 'photoData', null);
                                handleUpdateBuildingAmenity(idx, 'fileType', null);
                                handleUpdateBuildingAmenity(idx, 'previewUrl', '');
                              }}
                              style={{ color: '#ef4444' }}
                            >
                              Remove Photo
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            border: '1px dashed var(--border-default)',
                            borderRadius: '6px',
                            background: 'var(--bg-card)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <Camera size={14} color="#d4af37" />
                          <span>Upload Facility Photo</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: 'none' }}
                            onChange={(e) => processImageFile(e.target.files[0], (data) => {
                              handleUpdateBuildingAmenity(idx, 'photoData', data.fileData);
                              handleUpdateBuildingAmenity(idx, 'fileType', data.fileType);
                              handleUpdateBuildingAmenity(idx, 'previewUrl', data.previewUrl);
                            })}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Amenity Button or Limit Message */}
              {buildingAmenities.length < 7 ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={handleAddBuildingAmenity}
                  style={{ borderColor: '#d4af37', color: '#d4af37', fontWeight: 600 }}
                >
                  <Plus size={16} style={{ marginRight: '6px' }} /> + ADD ANOTHER AMENITY
                </Button>
              ) : (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>Maximum of 7 building amenities reached for this property.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STEP 2: APARTMENT / UNIT REGISTRATION & DYNAMIC AMENITIES     */}
        {/* ============================================================= */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Apartment Selector Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
              {units.map((u, uIdx) => (
                <button
                  key={u.tempId || uIdx}
                  type="button"
                  onClick={() => setActiveUnitIndex(uIdx)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: activeUnitIndex === uIdx ? '2px solid #d4af37' : '1px solid var(--border-default)',
                    background: activeUnitIndex === uIdx ? 'rgba(212, 175, 55, 0.15)' : 'var(--bg-card)',
                    color: activeUnitIndex === uIdx ? '#d4af37' : 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🚪 {u.apartment_code || `Unit ${uIdx + 1}`}
                </button>
              ))}

              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleAddUnit}
                style={{ whiteSpace: 'nowrap', borderColor: '#d4af37', color: '#d4af37' }}
              >
                <Plus size={14} style={{ marginRight: '4px' }} /> + Add Another Apartment
              </Button>
            </div>

            {/* Active Apartment Form */}
            {activeUnit && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 1. Apartment Information */}
                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Home size={20} color="#d4af37" />
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        1. APARTMENT INFORMATION ({activeUnit.apartment_code})
                      </h3>
                    </div>
                    {units.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => handleRemoveUnit(activeUnitIndex)}
                        style={{ color: '#ef4444', borderColor: '#ef4444' }}
                      >
                        <Trash2 size={14} style={{ marginRight: '4px' }} /> Remove Unit
                      </Button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    {/* Manually entered Apartment ID */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Apartment ID / Reference * (e.g. APT-001, UNIT-A1)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. APT-101"
                        value={activeUnit.apartment_code}
                        onChange={(e) => handleUpdateActiveUnit('apartment_code', e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Apartment Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Executive Horizon Suite 101"
                        value={activeUnit.unit_name}
                        onChange={(e) => handleUpdateActiveUnit('unit_name', e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Apartment Type
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 2-Bedroom Luxury Suite"
                        value={activeUnit.unit_type}
                        onChange={(e) => handleUpdateActiveUnit('unit_type', e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Nightly Rate (₦) *
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 85000"
                        value={activeUnit.rate_per_night}
                        onChange={(e) => handleUpdateActiveUnit('rate_per_night', e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: '#d4af37', fontSize: '0.95rem', fontWeight: 700 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Occupancy Capacity (Guests)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={activeUnit.capacity}
                        onChange={(e) => handleUpdateActiveUnit('capacity', e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Floor Level
                      </label>
                      <input
                        type="number"
                        value={activeUnit.floor}
                        onChange={(e) => handleUpdateActiveUnit('floor', e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                      />
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Apartment Description
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Describe the layout, ambience, furnishings, balcony views, and specific appeal of this apartment..."
                        value={activeUnit.description}
                        onChange={(e) => handleUpdateActiveUnit('description', e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Main Apartment Photograph */}
                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Camera size={20} color="#d4af37" />
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        2. MAIN APARTMENT PHOTOGRAPH
                      </h3>
                    </div>
                    <Badge variant="warning">PRIMARY INTERIOR PHOTO</Badge>
                  </div>

                  <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Represents the overall appearance of this apartment's interior. This is the primary image shown when guests select this suite in booking.
                  </p>

                  {activeUnit.mainApartmentPhoto ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--bg-surface)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                      <img
                        src={activeUnit.mainApartmentPhoto.previewUrl}
                        alt="Main Apartment"
                        style={{ width: '140px', height: '95px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #d4af37' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {activeUnit.mainApartmentPhoto.fileName}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#10b981', marginTop: '2px', fontWeight: 600 }}>
                          ✓ Main Interior Photograph Verified
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                          <label style={{ cursor: 'pointer' }}>
                            <Button variant="outline" size="sm" type="button" onClick={() => {}}>
                              Replace Photo
                            </Button>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              style={{ display: 'none' }}
                              onChange={(e) => processImageFile(e.target.files[0], (data) => handleUpdateActiveUnit('mainApartmentPhoto', { ...data, isPrimary: true }))}
                            />
                          </label>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => handleUpdateActiveUnit('mainApartmentPhoto', null)}
                            style={{ color: '#ef4444', borderColor: '#ef4444' }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px',
                        border: '2px dashed var(--border-default)',
                        borderRadius: '8px',
                        background: 'var(--bg-surface)',
                        cursor: 'pointer',
                      }}
                    >
                      <Upload size={28} color="#d4af37" style={{ marginBottom: '6px' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Upload Main Apartment Interior Photograph
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Broad interior view of {activeUnit.unit_name || 'this apartment'} (JPEG, PNG, WebP)
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => processImageFile(e.target.files[0], (data) => handleUpdateActiveUnit('mainApartmentPhoto', { ...data, isPrimary: true }))}
                      />
                    </label>
                  )}
                </div>

                {/* 3. Dynamic Apartment Amenities (Unlimited) */}
                <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={20} color="#d4af37" />
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        3. APARTMENT AMENITIES (Inside {activeUnit.apartment_code})
                      </h3>
                    </div>
                    <Badge variant="success">
                      {(activeUnit.apartment_amenities || []).length} AMENITIES (UNLIMITED)
                    </Badge>
                  </div>

                  <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Actual facilities, appliances, furniture, and features inside this particular apartment (e.g. Refrigerator, Smart TV, King Bed, PS4, Microwave, Washing Machine).
                  </p>

                  {/* Apartment Amenities Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                    {(activeUnit.apartment_amenities || []).map((amenity, aIdx) => (
                      <div
                        key={amenity.tempId || aIdx}
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '8px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#d4af37', textTransform: 'uppercase' }}>
                            Apartment Item #{aIdx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveApartmentAmenity(aIdx)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            <Trash2 size={14} /> Remove Item
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                          {/* Amenity Name */}
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              Amenity Name *
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Smart 55-inch OLED TV"
                              value={amenity.name}
                              onChange={(e) => handleUpdateApartmentAmenity(aIdx, 'name', e.target.value)}
                              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                            />
                          </div>

                          {/* Amenity Description */}
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              Amenity Description
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. 4K Ultra HD with streaming subscriptions"
                              value={amenity.description}
                              onChange={(e) => handleUpdateApartmentAmenity(aIdx, 'description', e.target.value)}
                              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                            />
                          </div>
                        </div>

                        {/* Amenity Photograph */}
                        <div style={{ marginTop: '4px' }}>
                          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            Amenity Photograph
                          </label>
                          {amenity.previewUrl ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <img
                                src={amenity.previewUrl}
                                alt={amenity.name || 'Amenity'}
                                style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }}
                              />
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <label style={{ cursor: 'pointer' }}>
                                  <Button variant="outline" size="sm" type="button" onClick={() => {}}>
                                    Replace Photo
                                  </Button>
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    style={{ display: 'none' }}
                                    onChange={(e) => processImageFile(e.target.files[0], (data) => {
                                      handleUpdateApartmentAmenity(aIdx, 'photoData', data.fileData);
                                      handleUpdateApartmentAmenity(aIdx, 'fileType', data.fileType);
                                      handleUpdateApartmentAmenity(aIdx, 'previewUrl', data.previewUrl);
                                    })}
                                  />
                                </label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  onClick={() => {
                                    handleUpdateApartmentAmenity(aIdx, 'photoData', null);
                                    handleUpdateApartmentAmenity(aIdx, 'fileType', null);
                                    handleUpdateApartmentAmenity(aIdx, 'previewUrl', '');
                                  }}
                                  style={{ color: '#ef4444' }}
                                >
                                  Remove Photo
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 14px',
                                border: '1px dashed var(--border-default)',
                                borderRadius: '6px',
                                background: 'var(--bg-card)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                color: 'var(--text-primary)',
                              }}
                            >
                              <Camera size={14} color="#d4af37" />
                              <span>Upload Amenity Photo</span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                style={{ display: 'none' }}
                                onChange={(e) => processImageFile(e.target.files[0], (data) => {
                                  handleUpdateApartmentAmenity(aIdx, 'photoData', data.fileData);
                                  handleUpdateApartmentAmenity(aIdx, 'fileType', data.fileType);
                                  handleUpdateApartmentAmenity(aIdx, 'previewUrl', data.previewUrl);
                                })}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={handleAddApartmentAmenity}
                    style={{ borderColor: '#d4af37', color: '#d4af37', fontWeight: 600 }}
                  >
                    <Plus size={16} style={{ marginRight: '6px' }} /> + ADD ANOTHER APARTMENT AMENITY
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* STEP 3: LEVEL C INTERNAL SPACES BREAKDOWN                     */}
        {/* ============================================================= */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={20} color="#d4af37" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Level C: Internal Spaces for {activeUnit?.apartment_code} ({activeUnit?.unit_name})
                  </h3>
                </div>
                <Button variant="outline" size="sm" type="button" onClick={handleAddSpaceToActiveUnit}>
                  <Plus size={14} style={{ marginRight: '4px' }} /> Add Space (Bedroom / Kitchen / Bath)
                </Button>
              </div>

              <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Optional Level C structural spaces. Photos uploaded here will be strictly associated with that room only.
              </p>

              {(activeUnit?.internal_spaces || []).length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--border-default)', borderRadius: '6px' }}>
                  No internal spaces added yet. Click "+ Add Space" to define specific rooms (e.g. Master Bedroom, Chef Kitchen).
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {activeUnit.internal_spaces.map((sp, sIdx) => (
                    <div
                      key={sp.tempId || sIdx}
                      style={{
                        background: 'var(--bg-surface)',
                        padding: '14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#d4af37' }}>
                          Space #{sIdx + 1}: {sp.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSpaceFromActiveUnit(sIdx)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                            Space Type
                          </label>
                          <select
                            value={sp.space_type}
                            onChange={(e) => handleUpdateSpaceInActiveUnit(sIdx, 'space_type', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                          >
                            {SPACE_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                            Custom Space Name
                          </label>
                          <input
                            type="text"
                            value={sp.name}
                            onChange={(e) => handleUpdateSpaceInActiveUnit(sIdx, 'name', e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* STEP 4: PREVIEW & EXECUTIVE SUBMISSION                        */}
        {/* ============================================================= */}
        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'var(--bg-card)', padding: '20px', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <CheckCircle size={20} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Comprehensive Property Hierarchy Preview
                </h3>
              </div>

              {/* Level A Preview */}
              <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-default)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 700, color: '#d4af37' }}>
                      🏢 {propertyData.name} ({propertyData.code})
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {propertyData.address} • {propertyData.district ? `${propertyData.district}, ` : ''}{propertyData.city}
                    </p>
                    {propertyData.environment_description && (
                      <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Neighbourhood: {propertyData.environment_description}
                      </p>
                    )}
                  </div>
                  {mainBuildingPhoto && (
                    <img
                      src={mainBuildingPhoto.previewUrl}
                      alt="Facade"
                      style={{ width: '100px', height: '70px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #d4af37' }}
                    />
                  )}
                </div>

                {/* Building Amenities Preview */}
                <div style={{ marginTop: '14px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Building Amenities ({buildingAmenities.length} / 7):
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginTop: '8px' }}>
                    {buildingAmenities.map((a, idx) => (
                      <div key={idx} style={{ background: 'var(--bg-card)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {a.previewUrl ? (
                          <img src={a.previewUrl} alt={a.name} style={{ width: '38px', height: '38px', objectFit: 'cover', borderRadius: '4px' }} />
                        ) : (
                          <ShieldCheck size={24} color="#d4af37" />
                        )}
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {a.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {a.description || 'Building facility'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Level B & C Units Preview */}
              <div>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Apartment Units Registered ({units.length}):
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                  {units.map((u, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'var(--bg-surface)',
                        padding: '14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {u.mainApartmentPhoto && (
                            <img src={u.mainApartmentPhoto.previewUrl} alt={u.unit_name} style={{ width: '50px', height: '38px', objectFit: 'cover', borderRadius: '4px' }} />
                          )}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              🚪 {u.apartment_code}: {u.unit_name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {u.unit_type} • Capacity: {u.capacity} Guests • Floor: {u.floor}
                            </div>
                          </div>
                        </div>
                        <span style={{ fontWeight: 700, color: '#d4af37', fontSize: '0.9rem' }}>
                          ₦{Number(u.rate_per_night).toLocaleString()}/night
                        </span>
                      </div>

                      {/* Apartment Amenities Preview */}
                      {(u.apartment_amenities || []).length > 0 && (
                        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {u.apartment_amenities.map((a, aIdx) => (
                            <span
                              key={aIdx}
                              style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-default)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                color: 'var(--text-secondary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              ✨ {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* FOOTER CONTROLS & NAVIGATION                                  */}
        {/* ============================================================= */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-default)',
          }}
        >
          <div>
            {currentStep > 1 && (
              <Button variant="outline" type="button" onClick={handleBack} disabled={submitting}>
                <ChevronLeft size={16} style={{ marginRight: '6px' }} /> Back
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>

            {currentStep < 4 ? (
              <Button variant="primary" type="button" onClick={handleNext}>
                Next <ChevronRight size={16} style={{ marginLeft: '6px' }} />
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  type="button"
                  loading={submitting}
                  onClick={() => handleSaveOrSubmit(false)}
                >
                  Save as DRAFT
                </Button>

                <Button
                  variant="primary"
                  type="button"
                  loading={submitting}
                  onClick={() => handleSaveOrSubmit(true)}
                  style={{ background: '#d4af37', borderColor: '#d4af37', color: '#000', fontWeight: 700 }}
                >
                  <Send size={16} style={{ marginRight: '6px' }} /> Submit for Executive Dual Approval
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
