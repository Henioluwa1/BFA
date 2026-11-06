import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  Image as ImageIcon,
  Upload as UploadIcon,
  Trash2 as TrashIcon,
  Star as StarIcon,
  Eye as EyeIcon,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Check,
  X as CloseIcon,
  Building,
  Layers,
  AlertCircle,
  ExternalLink,
} from '../ui/Icons';
import { propertyMediaService, propertySubmissionService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// Normalized category metadata and grouping
export const MEDIA_CATEGORIES = [
  { value: 'BUILDING_EXTERIOR', label: 'Building Exterior', group: 'BUILDING' },
  { value: 'BUILDING_ENTRANCE', label: 'Building Entrance & Porte-Cochère', group: 'BUILDING' },
  { value: 'RECEPTION', label: 'Reception & Front Desk', group: 'BUILDING' },
  { value: 'LOBBY', label: 'Lobby & Executive Lounge', group: 'BUILDING' },
  { value: 'SWIMMING_POOL', label: 'Swimming Pool & Deck', group: 'GROUNDS' },
  { value: 'GARDEN', label: 'Garden & Courtyard', group: 'GROUNDS' },
  { value: 'PARKING', label: 'Parking & Driveway', group: 'GROUNDS' },
  { value: 'FACILITIES', label: 'Gym & Fitness Center', group: 'FACILITIES' },
  { value: 'AMENITY', label: 'Shared Amenities & Spaces', group: 'FACILITIES' },
  { value: 'INTERIOR', label: 'Common Interior Areas', group: 'FACILITIES' },
  { value: 'OTHER', label: 'Other Grounds & Architecture', group: 'FACILITIES' },
];

export const CATEGORY_GROUP_MAP = {
  BUILDING: ['BUILDING_EXTERIOR', 'BUILDING_ENTRANCE', 'RECEPTION', 'LOBBY'],
  GROUNDS: ['GARDEN', 'PARKING', 'SWIMMING_POOL'],
  FACILITIES: ['FACILITIES', 'AMENITY', 'INTERIOR', 'OTHER'],
};

const formatBytes = (bytes, decimals = 1) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export default function PropertyMediaManager({
  property,
  onCoverUpdated,
  onMediaCountChanged,
  compact = false,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const isPublisherRole = ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(user?.role);
  const isManager = user?.role === 'MANAGER' || user?.role === 'OPERATIONS_MANAGER';

  // State
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('ALL'); // ALL | BUILDING | GROUNDS | FACILITIES
  const [defaultCategory, setDefaultCategory] = useState('BUILDING_EXTERIOR');
  const [pendingUploads, setPendingUploads] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Lightbox modal state
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const fileInputRef = useRef(null);

  // Load media items
  const loadMedia = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      const res = await propertyMediaService.getMedia(property.id);
      const items = res?.data || res || [];
      // Normalize items: isPrimary, file_url
      const normalized = items.map((item) => ({
        ...item,
        isPrimary: Boolean(item.is_primary || item.is_cover),
        isPublished: Boolean(item.is_published),
      }));
      setMediaList(normalized);
      if (onMediaCountChanged) {
        onMediaCountChanged(normalized.length);
      }
    } catch (err) {
      addToast(`Failed to load property media: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [property?.id, addToast, onMediaCountChanged]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { ALL: mediaList.length, BUILDING: 0, GROUNDS: 0, FACILITIES: 0 };
    mediaList.forEach((item) => {
      const cat = item.category || 'OTHER';
      if (CATEGORY_GROUP_MAP.BUILDING.includes(cat)) {
        counts.BUILDING += 1;
      } else if (CATEGORY_GROUP_MAP.GROUNDS.includes(cat)) {
        counts.GROUNDS += 1;
      } else {
        counts.FACILITIES += 1;
      }
    });
    return counts;
  }, [mediaList]);

  // Filtered media list
  const filteredMedia = useMemo(() => {
    if (activeCategoryFilter === 'ALL') return mediaList;
    const allowed = CATEGORY_GROUP_MAP[activeCategoryFilter] || [];
    return mediaList.filter((item) => allowed.includes(item.category));
  }, [mediaList, activeCategoryFilter]);

  // Pending count for managers
  const pendingReviewCount = useMemo(() => {
    return mediaList.filter((m) => !m.isPublished).length;
  }, [mediaList]);

  // File selection validation and staging
  const processFiles = (files) => {
    const validFiles = [];
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    Array.from(files).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        addToast(`Skipped "${file.name}": Only JPG, PNG, and WebP images are supported.`, 'warning');
        return;
      }
      if (file.size > MAX_SIZE) {
        addToast(`Skipped "${file.name}": Exceeds the 5 MB maximum file size limit.`, 'warning');
        return;
      }
      validFiles.push(file);
    });

    if (validFiles.length === 0) return;

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPendingUploads((prev) => {
          const isFirstUpload = prev.length === 0 && mediaList.length === 0;
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              fileData: e.target.result,
              fileType: file.type,
              fileName: file.name,
              fileSize: file.size,
              category: defaultCategory || 'BUILDING_EXTERIOR',
              caption: '',
              isPrimary: isFirstUpload,
            },
          ];
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Upload pending queue
  const handleSaveUploads = async () => {
    if (pendingUploads.length === 0 || !property?.id) return;
    setUploading(true);
    try {
      const payload = pendingUploads.map((item, idx) => ({
        fileData: item.fileData,
        fileType: item.fileType,
        fileName: item.fileName,
        category: item.category,
        caption: item.caption,
        isCover: Boolean(item.isPrimary),
        displayOrder: mediaList.length + idx + 1,
      }));

      await propertyMediaService.uploadMedia(property.id, payload);

      if (isManager) {
        addToast(
          `${payload.length} photo(s) uploaded and queued for Administrator publication review!`,
          'success'
        );
      } else {
        addToast(`${payload.length} photo(s) uploaded and published to property gallery!`, 'success');
      }

      setPendingUploads([]);
      await loadMedia();
      if (onCoverUpdated) onCoverUpdated();
    } catch (err) {
      addToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Set Cover Image
  const handleSetCover = async (mediaId) => {
    if (!property?.id) return;
    try {
      await propertyMediaService.setCover(property.id, mediaId);
      addToast('Cover image updated successfully!', 'success');
      // Optimistic update
      setMediaList((prev) =>
        prev.map((m) => ({
          ...m,
          isPrimary: m.id === mediaId,
          is_primary: m.id === mediaId ? 1 : 0,
        }))
      );
      if (onCoverUpdated) onCoverUpdated();
    } catch (err) {
      addToast(`Failed to update cover photo: ${err.message}`, 'error');
      loadMedia();
    }
  };

  // Toggle Publication (Admins / Owners only)
  const handleTogglePublish = async (mediaId, currentStatus) => {
    if (!property?.id) return;
    const targetStatus = !currentStatus;
    try {
      await propertyMediaService.publishMedia(property.id, mediaId, targetStatus);
      addToast(
        targetStatus
          ? 'Photo published to public portal and guest discovery!'
          : 'Photo unpublished from public display.',
        'success'
      );
      setMediaList((prev) =>
        prev.map((m) =>
          m.id === mediaId
            ? { ...m, isPublished: targetStatus, is_published: targetStatus ? 1 : 0 }
            : m
        )
      );
    } catch (err) {
      addToast(`Failed to toggle publication: ${err.message}`, 'error');
    }
  };

  // Delete Media
  const handleDeleteMedia = async (mediaId, caption) => {
    if (!property?.id) return;
    const confirmMsg = caption
      ? `Delete photo "${caption}" permanently? This removes the physical image file.`
      : 'Are you sure you want to permanently delete this photo?';

    if (!window.confirm(confirmMsg)) return;

    try {
      await propertyMediaService.deleteMedia(property.id, mediaId);
      addToast('Photo deleted successfully.', 'success');
      setMediaList((prev) => prev.filter((m) => m.id !== mediaId));
      if (onMediaCountChanged) {
        onMediaCountChanged(mediaList.length - 1);
      }
      if (lightboxIndex !== null) {
        setLightboxIndex(null);
      }
    } catch (err) {
      addToast(`Failed to delete photo: ${err.message}`, 'error');
    }
  };

  // Reordering: Move Left / Move Right
  const handleReorder = async (currentIndex, direction) => {
    const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= filteredMedia.length) return;

    const sourceItem = filteredMedia[currentIndex];
    const targetItem = filteredMedia[targetIndex];

    // Find actual indices in the full mediaList
    const fullSourceIdx = mediaList.findIndex((m) => m.id === sourceItem.id);
    const fullTargetIdx = mediaList.findIndex((m) => m.id === targetItem.id);

    if (fullSourceIdx === -1 || fullTargetIdx === -1) return;

    // Create reordered array
    const newMediaList = [...mediaList];
    const [moved] = newMediaList.splice(fullSourceIdx, 1);
    newMediaList.splice(fullTargetIdx, 0, moved);

    // Optimistic state
    setMediaList(newMediaList);
    setReordering(true);

    try {
      const orderList = newMediaList.map((item, idx) => ({
        id: item.id,
        display_order: idx + 1,
      }));
      await propertyMediaService.reorderMedia(property.id, orderList);
      addToast('Gallery order updated.', 'success');
    } catch (err) {
      addToast(`Failed to reorder images: ${err.message}`, 'error');
      // Rollback
      loadMedia();
    } finally {
      setReordering(false);
    }
  };

  // Dual-Review Submission by Manager
  const handleSubmitPendingForReview = async () => {
    if (!property?.id || pendingReviewCount === 0) return;
    setSubmittingReview(true);
    try {
      const unapprovedList = mediaList.filter((m) => !m.isPublished);
      await propertySubmissionService.createSubmission({
        propertyId: property.id,
        submissionType: 'PHOTO_UPDATE',
        contentSnapshot: {
          propertyId: property.id,
          propertyName: property.name,
          pendingPhotosCount: unapprovedList.length,
          unapprovedMediaIds: unapprovedList.map((m) => m.id),
          submittedBy: user?.name || user?.email,
          submittedAt: new Date().toISOString(),
          note: `Batch review submission for ${unapprovedList.length} newly uploaded property photo(s).`,
        },
      });
      addToast(
        `Dual-Review submission created! ${unapprovedList.length} photo(s) submitted for Administrator approval.`,
        'success'
      );
    } catch (err) {
      addToast(`Failed to create review submission: ${err.message}`, 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Keyboard navigation for Lightbox (with capture phase so it intercepts Escape before parent modal)
  const handleKeyDown = useCallback(
    (e) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        setLightboxIndex((prev) => (prev > 0 ? prev - 1 : filteredMedia.length - 1));
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation();
        setLightboxIndex((prev) => (prev < filteredMedia.length - 1 ? prev + 1 : 0));
      }
    },
    [lightboxIndex, filteredMedia.length]
  );

  useEffect(() => {
    if (lightboxIndex !== null) {
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [lightboxIndex, handleKeyDown]);

  const activeLightboxItem = lightboxIndex !== null ? filteredMedia[lightboxIndex] : null;

  return (
    <div className="property-media-manager" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Header Toolbar & Unit Separation Notice */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Building & Property Media Gallery
              </h3>
              <Badge status={mediaList.length > 0 ? 'success' : 'default'}>
                {mediaList.length} Total {mediaList.length === 1 ? 'Photo' : 'Photos'}
              </Badge>
              {pendingReviewCount > 0 && (
                <Badge status="warning">{pendingReviewCount} Pending Review</Badge>
              )}
            </div>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Manage authoritative building architecture, exterior views, common grounds, and facility imagery for{' '}
              <strong>{property?.name}</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Default Tag:
              </span>
              <select
                className="input-field"
                value={defaultCategory}
                onChange={(e) => setDefaultCategory(e.target.value)}
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.5rem', minHeight: '38px', width: 'auto' }}
              >
                {MEDIA_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                minHeight: '44px',
                padding: '0 1rem',
                fontWeight: 600,
              }}
            >
              <UploadIcon size={18} />
              Upload Photos
            </button>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
          </div>
        </div>

        {/* Unit-Level Separation Notice Banner */}
        <div
          style={{
            background: 'rgba(30, 58, 138, 0.05)',
            border: '1px solid rgba(37, 99, 235, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Building size={20} style={{ color: 'var(--brand-accent)', flexShrink: 0 }} />
            <div style={{ fontSize: '0.825rem', color: 'var(--text-primary)' }}>
              <strong>Architectural Separation:</strong> These photos represent the property building, lobby, grounds,
              and shared amenities. Individual apartment units maintain dedicated room and unit galleries inside Unit
              Management.
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/app/apartments?propertyId=${property?.id}`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              minHeight: '36px',
            }}
          >
            <span>View Unit Galleries</span>
            <ExternalLink size={14} />
          </Button>
        </div>

        {/* Manager Dual-Review Action Notice */}
        {isManager && pendingReviewCount > 0 && (
          <div
            style={{
              background: 'rgba(217, 119, 6, 0.08)',
              border: '1px solid rgba(217, 119, 6, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <AlertCircle size={20} style={{ color: '#d97706', flexShrink: 0 }} />
              <div style={{ fontSize: '0.825rem', color: 'var(--text-primary)' }}>
                <strong>Dual-Review Governance:</strong> You have <strong>{pendingReviewCount}</strong> uploaded
                photo(s) awaiting Administrator or Owner publication before they appear on the public guest portal.
              </div>
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={submittingReview}
              onClick={handleSubmitPendingForReview}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                minHeight: '36px',
                background: '#d97706',
                borderColor: '#b45309',
              }}
            >
              {submittingReview ? 'Submitting...' : 'Submit for Dual-Review Approval'}
            </Button>
          </div>
        )}
      </div>

      {/* 2. Drag-and-Drop Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragOver ? '2px dashed var(--brand-accent)' : '2px dashed var(--border-color)',
          background: isDragOver ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem 1.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(37, 99, 235, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-accent)',
            marginBottom: '0.25rem',
          }}
        >
          <UploadIcon size={24} />
        </div>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          Drag & drop building images here, or <span style={{ color: 'var(--brand-accent)' }}>browse files</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Supports JPG, PNG, and WebP up to 5 MB each. Multiple selection supported.
        </div>
      </div>

      {/* 3. Pending Uploads Staging Area */}
      {pendingUploads.length > 0 && (
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <div>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Ready to Upload ({pendingUploads.length} {pendingUploads.length === 1 ? 'file' : 'files'})
              </span>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Set category tagging and descriptive captions before saving.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPendingUploads([])}
                disabled={uploading}
                style={{ minHeight: '38px' }}
              >
                Clear All
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={handleSaveUploads}
                disabled={uploading}
                style={{ minHeight: '38px', minWidth: '130px' }}
              >
                {uploading ? 'Uploading...' : `Save & Upload (${pendingUploads.length})`}
              </Button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))',
              gap: '1rem',
            }}
          >
            {pendingUploads.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  border: item.isPrimary ? '2px solid var(--accent-gold)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  background: 'var(--bg-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  position: 'relative',
                }}
              >
                {/* Thumbnail Preview */}
                <div
                  style={{
                    position: 'relative',
                    height: '130px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    background: '#090d16',
                  }}
                >
                  <img
                    src={item.fileData}
                    alt={item.fileName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    onClick={() => setPendingUploads((prev) => prev.filter((p) => p.id !== item.id))}
                    title="Remove from queue"
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(0,0,0,0.7)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <CloseIcon size={14} />
                  </button>

                  {item.isPrimary && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '6px',
                        left: '6px',
                        background: 'var(--accent-gold)',
                        color: '#000000',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '3px 7px',
                        borderRadius: '4px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      ★ SET AS COVER
                    </span>
                  )}
                </div>

                {/* File details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }} title={item.fileName}>
                    {item.fileName}
                  </span>
                  <span>{formatBytes(item.fileSize)}</span>
                </div>

                {/* Category selector */}
                <div>
                  <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                    Category Tag
                  </label>
                  <select
                    className="input-field"
                    value={item.category}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPendingUploads((prev) =>
                        prev.map((p) => (p.id === item.id ? { ...p, category: val } : p))
                      );
                    }}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', width: '100%', minHeight: '36px' }}
                  >
                    {MEDIA_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Caption input */}
                <div>
                  <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                    Photo Caption
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Front facade at sunset"
                    className="input-field"
                    value={item.caption}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPendingUploads((prev) =>
                        prev.map((p) => (p.id === item.id ? { ...p, caption: val } : p))
                      );
                    }}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', width: '100%', minHeight: '36px' }}
                  />
                </div>

                {/* Primary Cover Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <input
                    type="checkbox"
                    id={`cover-check-${item.id}`}
                    checked={item.isPrimary}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setPendingUploads((prev) =>
                        prev.map((p) => ({
                          ...p,
                          isPrimary: p.id === item.id ? isChecked : false,
                        }))
                      );
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <label
                    htmlFor={`cover-check-${item.id}`}
                    style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    Set as Property Cover Image
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Category Filter Tabs */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', label: 'All Photos', count: categoryCounts.ALL },
            { id: 'BUILDING', label: 'Building & Exterior', count: categoryCounts.BUILDING },
            { id: 'GROUNDS', label: 'Grounds & Outdoors', count: categoryCounts.GROUNDS },
            { id: 'FACILITIES', label: 'Amenities & Facilities', count: categoryCounts.FACILITIES },
          ].map((tab) => {
            const isActive = activeCategoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategoryFilter(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '9999px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  minHeight: '38px',
                  border: isActive ? '1px solid var(--brand-accent)' : '1px solid var(--border-color)',
                  background: isActive ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                  color: isActive ? 'var(--brand-accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    background: isActive ? 'var(--brand-accent)' : 'var(--bg-surface)',
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '9999px',
                    border: isActive ? 'none' : '1px solid var(--border-color)',
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {reordering && (
          <span style={{ fontSize: '0.8rem', color: 'var(--brand-accent)', fontWeight: 600 }}>
            Saving order updates...
          </span>
        )}
      </div>

      {/* 5. Existing Media Gallery Grid */}
      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Loading gallery photographs...</div>
        </div>
      ) : filteredMedia.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3.5rem 1.5rem',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border-color)',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <ImageIcon size={28} />
          </div>
          <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
            No photos found in this category
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', maxWidth: '420px', lineHeight: 1.4 }}>
            {activeCategoryFilter === 'ALL'
              ? 'This building has no photographs uploaded yet. Add high-resolution exterior, reception, or amenities images to showcase the property to guests and workforce.'
              : `No photographs categorized under ${activeCategoryFilter.toLowerCase()} yet. Upload images above and tag them to populate this category.`}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            style={{ minHeight: '40px', marginTop: '0.5rem' }}
          >
            + Add Photos Now
          </Button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))',
            gap: '1.25rem',
          }}
        >
          {filteredMedia.map((media, index) => {
            const isCover = media.isPrimary;
            const categoryMeta = MEDIA_CATEGORIES.find((c) => c.value === media.category) || {
              label: media.category || 'Building Photo',
            };

            return (
              <div
                key={media.id}
                className="media-card"
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-lg)',
                  border: isCover
                    ? '2px solid var(--accent-gold, #d97706)'
                    : '1px solid var(--border-color)',
                  boxShadow: isCover ? '0 0 0 1px rgba(217, 119, 6, 0.2)' : 'none',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Photo Preview Container */}
                <div
                  style={{
                    position: 'relative',
                    height: '180px',
                    background: '#090d16',
                    cursor: 'pointer',
                  }}
                  onClick={() => setLightboxIndex(index)}
                >
                  <img
                    src={media.file_url}
                    alt={media.caption || `${property?.name} photo`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />

                  {/* Overlays / Badges */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      alignItems: 'flex-start',
                    }}
                  >
                    {isCover && (
                      <span
                        style={{
                          background: 'var(--accent-gold, #d97706)',
                          color: '#ffffff',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          letterSpacing: '0.04em',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        }}
                      >
                        <StarIcon size={12} fill="#ffffff" />
                        COVER IMAGE
                      </span>
                    )}
                    <span
                      style={{
                        background: 'rgba(0, 0, 0, 0.72)',
                        color: '#f8fafc',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      {categoryMeta.label}
                    </span>
                  </div>

                  <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                    <Badge status={media.isPublished ? 'success' : 'warning'}>
                      {media.isPublished ? 'Published' : 'Pending Review'}
                    </Badge>
                  </div>

                  {/* Hover Eye Action */}
                  <div
                    className="preview-hover-pill"
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      background: 'rgba(0, 0, 0, 0.7)',
                      color: '#ffffff',
                      fontSize: '0.725rem',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
                    <EyeIcon size={13} />
                    <span>View</span>
                  </div>
                </div>

                {/* Card Content & Metadata */}
                <div
                  style={{
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    flex: 1,
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '0.825rem',
                        fontWeight: 600,
                        color: media.caption ? 'var(--text-primary)' : 'var(--text-muted)',
                        lineHeight: 1.35,
                        minHeight: '2.4em',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {media.caption || <em>No caption provided</em>}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.725rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.4rem',
                      }}
                    >
                      <span>Order #{media.display_order || index + 1}</span>
                      <span>{formatBytes(media.file_size_bytes)}</span>
                    </div>
                  </div>

                  {/* Actions & Ordering Controls */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      paddingTop: '0.6rem',
                      borderTop: '1px solid var(--border-color)',
                    }}
                  >
                    {/* Ordering row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Reorder:
                      </span>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={index === 0 || reordering}
                          onClick={() => handleReorder(index, 'left')}
                          title="Move earlier in gallery order"
                          style={{
                            padding: '4px 8px',
                            minHeight: '36px',
                            minWidth: '36px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <ArrowLeft size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={index === filteredMedia.length - 1 || reordering}
                          onClick={() => handleReorder(index, 'right')}
                          title="Move later in gallery order"
                          style={{
                            padding: '4px 8px',
                            minHeight: '36px',
                            minWidth: '36px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Operational buttons */}
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {!isCover ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleSetCover(media.id)}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.35rem 0.65rem',
                            minHeight: '36px',
                            flex: 1,
                            fontWeight: 600,
                          }}
                        >
                          Set as Cover
                        </button>
                      ) : (
                        <div
                          style={{
                            flex: 1,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--accent-gold, #d97706)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.35rem 0.5rem',
                          }}
                        >
                          <StarIcon size={13} fill="currentColor" />
                          <span>Active Cover</span>
                        </div>
                      )}

                      {/* Admin/Owner Direct Publish Toggle */}
                      {isPublisherRole && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleTogglePublish(media.id, media.isPublished)}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.35rem 0.65rem',
                            minHeight: '36px',
                          }}
                        >
                          {media.isPublished ? 'Unpublish' : 'Publish'}
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => handleDeleteMedia(media.id, media.caption)}
                        title="Delete this photo"
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.35rem 0.5rem',
                          minHeight: '36px',
                          color: '#ef4444',
                        }}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. High-Resolution Fullscreen Lightbox Modal */}
      {lightboxIndex !== null && activeLightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="media-lightbox-overlay"
          data-testid="media-lightbox"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 8, 16, 0.94)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '1.25rem',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Lightbox Header Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#ffffff',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                {property?.name} — Photo Preview
              </span>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                ({lightboxIndex + 1} of {filteredMedia.length})
              </span>
              {activeLightboxItem.isPrimary && (
                <span
                  style={{
                    background: 'var(--accent-gold, #d97706)',
                    color: '#000000',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  ★ COVER IMAGE
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              aria-label="Close Lightbox"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#ffffff',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <CloseIcon size={20} />
            </button>
          </div>

          {/* Lightbox Main Stage */}
          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem 0',
              overflow: 'hidden',
            }}
          >
            {/* Prev Button */}
            <button
              type="button"
              onClick={() =>
                setLightboxIndex((prev) => (prev > 0 ? prev - 1 : filteredMedia.length - 1))
              }
              aria-label="Previous photo"
              style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(0, 0, 0, 0.65)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10,
              }}
            >
              <ChevronLeft size={24} />
            </button>

            {/* High-res Image */}
            <img
              src={activeLightboxItem.file_url}
              alt={activeLightboxItem.caption || 'Property photograph'}
              style={{
                maxWidth: '92%',
                maxHeight: '74vh',
                objectFit: 'contain',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              }}
            />

            {/* Next Button */}
            <button
              type="button"
              onClick={() =>
                setLightboxIndex((prev) => (prev < filteredMedia.length - 1 ? prev + 1 : 0))
              }
              aria-label="Next photo"
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'rgba(0, 0, 0, 0.65)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10,
              }}
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {/* Lightbox Footer & Metadata */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
                {activeLightboxItem.caption || <em>No caption attached</em>}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '0.85rem',
                  fontSize: '0.78rem',
                  color: '#94a3b8',
                  marginTop: '0.2rem',
                }}
              >
                <span>
                  Category:{' '}
                  <strong>
                    {MEDIA_CATEGORIES.find((c) => c.value === activeLightboxItem.category)?.label ||
                      activeLightboxItem.category}
                  </strong>
                </span>
                <span>•</span>
                <span>Size: {formatBytes(activeLightboxItem.file_size_bytes)}</span>
                <span>•</span>
                <span>Status: {activeLightboxItem.isPublished ? 'Published' : 'Pending Review'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {!activeLightboxItem.isPrimary && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleSetCover(activeLightboxItem.id)}
                  style={{ minHeight: '38px' }}
                >
                  Make Cover Photo
                </Button>
              )}
              {isPublisherRole && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleTogglePublish(activeLightboxItem.id, activeLightboxItem.isPublished)
                  }
                  style={{ minHeight: '38px' }}
                >
                  {activeLightboxItem.isPublished ? 'Unpublish' : 'Publish'}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  handleDeleteMedia(activeLightboxItem.id, activeLightboxItem.caption)
                }
                style={{ color: '#ef4444', minHeight: '38px' }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
