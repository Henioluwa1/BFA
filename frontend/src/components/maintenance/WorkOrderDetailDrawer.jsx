import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import AuthenticatedImage from './AuthenticatedImage';
import { maintenanceService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';
import { useNavigate } from 'react-router-dom';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export default function WorkOrderDetailDrawer({
  isOpen,
  onClose,
  workOrder,
  user,
  onStartWork,
  onOpenAssign,
  onOpenResolve,
  onOpenCancel,
  actionLoading = false,
  onWorkOrderDeleted,
}) {
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Evidence state
  const [evidenceList, setEvidenceList] = useState([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState(null);

  // Upload state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('MAINTENANCE_PROGRESS');
  const [uploadCaption, setUploadCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Evidence Deletion state
  const [evidenceToDelete, setEvidenceToDelete] = useState(null);
  const [deleteJustification, setDeleteJustification] = useState('');
  const [isDeletingEvidence, setIsDeletingEvidence] = useState(false);

  // Work Order Deletion state (Admin only)
  const [showDeleteTicketConfirm, setShowDeleteTicketConfirm] = useState(false);
  const [isDeletingTicket, setIsDeletingTicket] = useState(false);

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const role = (user?.role || '').toUpperCase();
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role);
  const isManagerOrAdmin = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER'].includes(role);
  const isWorker = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'STAFF'].includes(role);

  // Fetch Evidence Attachments
  const fetchEvidence = useCallback(async () => {
    if (!workOrder?.id) return;
    setLoadingEvidence(true);
    setEvidenceError(null);
    try {
      const res = await maintenanceService.listEvidence(workOrder.id);
      const items = Array.isArray(res.data) ? res.data : [];
      setEvidenceList(items);
    } catch (err) {
      console.error('Failed to load evidence for work order:', err);
      setEvidenceError(err.message || 'Unable to retrieve evidence attachments.');
    } finally {
      setLoadingEvidence(false);
    }
  }, [workOrder?.id]);

  useEffect(() => {
    if (isOpen && workOrder?.id) {
      fetchEvidence();
      setShowUploadForm(false);
      setUploadFile(null);
      setUploadCaption('');
      setLightboxIndex(null);
    }
  }, [isOpen, workOrder?.id, fetchEvidence]);

  // Keyboard Navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev > 0 ? prev - 1 : evidenceList.length - 1));
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev < evidenceList.length - 1 ? prev + 1 : 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, evidenceList.length]);

  if (!workOrder) return null;

  // Status Badge Helper
  const getWorkOrderStatusBadge = (status) => {
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

  // Apartment Status Badge Helper
  const getApartmentStatusBadge = (status) => {
    switch (status) {
      case 'MAINTENANCE':
        return <Badge status="danger">UNDER MAINTENANCE</Badge>;
      case 'CLEANING':
      case 'DIRTY':
        return <Badge status="pending">CLEANING / HOUSEKEEPING</Badge>;
      case 'OCCUPIED':
        return <Badge status="warning">OCCUPIED BY GUEST</Badge>;
      case 'AVAILABLE':
      case 'READY':
        return <Badge status="success">AVAILABLE FOR BOOKING</Badge>;
      case 'BLOCKED':
        return <Badge status="secondary">OPERATIONAL BLOCK</Badge>;
      default:
        return <Badge status="neutral">{status || 'UNKNOWN'}</Badge>;
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'CRITICAL':
        return <span style={{ color: '#ef4444', fontWeight: 700 }}>● CRITICAL (EMERGENCY)</span>;
      case 'HIGH':
        return <span style={{ color: '#f97316', fontWeight: 700 }}>▲ HIGH PRIORITY</span>;
      case 'MEDIUM':
        return <span style={{ color: '#eab308', fontWeight: 600 }}>■ MEDIUM PRIORITY</span>;
      case 'LOW':
        return <span style={{ color: '#10b981', fontWeight: 600 }}>▼ LOW PRIORITY</span>;
      default:
        return priority;
    }
  };

  const getCategoryLabel = (cat) => {
    switch (cat) {
      case 'MAINTENANCE_BEFORE':
        return 'Pre-Repair';
      case 'MAINTENANCE_PROGRESS':
        return 'In Progress';
      case 'MAINTENANCE_AFTER':
        return 'Post-Repair';
      case 'MAINTENANCE_RECEIPT':
        return 'Receipt/Parts';
      default:
        return cat || 'Photo';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle Local File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      addToast('Invalid file format. Only JPEG, PNG, and WebP images are permitted.', 'error');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      addToast(
        `File exceeds maximum limit of 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB selected).`,
        'error'
      );
      e.target.value = '';
      return;
    }

    setUploadFile(file);
  };

  // Handle Evidence Upload Submit
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      addToast('Please select an image file to upload.', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      const base64Data = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(uploadFile);
      });

      await maintenanceService.uploadEvidence(workOrder.id, {
        fileData: base64Data,
        evidenceCategory: uploadCategory,
        caption: uploadCaption.trim() || undefined,
        originalFileName: uploadFile.name,
      });

      addToast('Evidence photo uploaded successfully!', 'success');
      setShowUploadForm(false);
      setUploadFile(null);
      setUploadCaption('');
      fetchEvidence();
    } catch (err) {
      addToast(`Evidence upload failed: ${err.message}`, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Evidence Deletion Submit
  const handleConfirmDeleteEvidence = async () => {
    if (!evidenceToDelete) return;
    setIsDeletingEvidence(true);
    try {
      await maintenanceService.deleteEvidence(workOrder.id, evidenceToDelete.id, {
        justification: deleteJustification.trim() || undefined,
      });
      addToast('Evidence attachment removed.', 'success');
      setEvidenceToDelete(null);
      setDeleteJustification('');
      if (lightboxIndex !== null) setLightboxIndex(null);
      fetchEvidence();
    } catch (err) {
      addToast(`Failed to delete evidence: ${err.message}`, 'error');
    } finally {
      setIsDeletingEvidence(false);
    }
  };

  // Handle Admin Work Order Deletion
  const handleConfirmDeleteWorkOrder = async () => {
    setIsDeletingTicket(true);
    try {
      await maintenanceService.delete(workOrder.id);
      addToast(`Work order #${workOrder.issue_code} deleted successfully. Evidence references preserved.`, 'success');
      setShowDeleteTicketConfirm(false);
      onClose();
      if (onWorkOrderDeleted) onWorkOrderDeleted(workOrder.id);
    } catch (err) {
      addToast(`Failed to delete work order: ${err.message}`, 'error');
    } finally {
      setIsDeletingTicket(false);
    }
  };

  const currentLightboxItem = lightboxIndex !== null ? evidenceList[lightboxIndex] : null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Work Order Details: ${workOrder.issue_code}`}
        maxWidth="740px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isManagerOrAdmin && workOrder.status !== 'CANCELLED' && workOrder.status !== 'RESOLVED' && (
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => onOpenCancel(workOrder)}
                  disabled={actionLoading}
                >
                  Cancel Order
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  size="small"
                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                  onClick={() => setShowDeleteTicketConfirm(true)}
                  disabled={actionLoading}
                >
                  🗑️ Delete Order
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isManagerOrAdmin && workOrder.status !== 'RESOLVED' && workOrder.status !== 'CANCELLED' && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => onOpenAssign(workOrder)}
                  disabled={actionLoading}
                >
                  Assign Staff
                </Button>
              )}
              {isWorker && workOrder.status === 'OPEN' && (
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => onStartWork(workOrder.id)}
                  disabled={actionLoading}
                >
                  Start Work
                </Button>
              )}
              {isWorker && (workOrder.status === 'IN_PROGRESS' || workOrder.status === 'OPEN') && (
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => onOpenResolve(workOrder)}
                  disabled={actionLoading}
                >
                  Resolve Order
                </Button>
              )}
              <Button variant="secondary" size="small" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Summary Card */}
          <div
            style={{
              background: 'var(--bg-surface)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-gold)', letterSpacing: '0.04em' }}>
                {workOrder.issue_code}
              </div>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                {workOrder.issue_title}
              </h3>
              <div style={{ fontSize: '0.85rem', marginTop: '0.35rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span
                  style={{ color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    onClose();
                    navigate(`/app/properties?search=${encodeURIComponent(workOrder.property_name || '')}`);
                  }}
                  title="View Property in Portfolio"
                >
                  🏢 {workOrder.property_name} ↗
                </span>
                <span>•</span>
                <span
                  style={{ color: 'var(--brand-accent)', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => {
                    if (workOrder.apartment_id) {
                      onClose();
                      navigate(`/app/apartments?unitId=${workOrder.apartment_id}&propertyId=${workOrder.property_id}`);
                    }
                  }}
                  title="View Unit Details"
                >
                  {workOrder.unit_number ? `🚪 Unit ${workOrder.unit_number} (${workOrder.unit_name || 'Apartment'}) ↗` : 'Common Area / Facility'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
              {getWorkOrderStatusBadge(workOrder.status)}
              {getPriorityBadge(workOrder.priority)}
            </div>
          </div>

          {/* Operational Status Distinction Matrix */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              background: 'var(--bg-card-hover)',
              padding: '0.85rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Work Order State
              </div>
              <div style={{ marginTop: '0.25rem' }}>{getWorkOrderStatusBadge(workOrder.status)}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Apartment Operational State
              </div>
              <div style={{ marginTop: '0.25rem' }}>
                {getApartmentStatusBadge(workOrder.apartment_status)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Reservation Booking Restriction
              </div>
              <div style={{ marginTop: '0.25rem', fontWeight: 700, fontSize: '0.85rem', color: workOrder.blocking_unit ? '#ef4444' : '#10b981' }}>
                {workOrder.blocking_unit ? '🔒 BLOCKED (MAINTENANCE)' : '🟢 UNRESTRICTED'}
              </div>
            </div>
          </div>

          {/* Description Section */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Issue Description & Location
            </div>
            <div
              style={{
                marginTop: '0.35rem',
                padding: '0.85rem',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                fontSize: '0.88rem',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
              }}
            >
              {workOrder.description || 'No detailed description provided.'}
            </div>
          </div>

          {/* EVIDENCE GALLERY SECTION */}
          <div
            style={{
              padding: '1rem',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  📷 Private Repair Evidence ({evidenceList.length})
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                  Authenticated Storage (DEC-2.5B-04)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                  variant="outline"
                  size="small"
                  onClick={fetchEvidence}
                  disabled={loadingEvidence}
                >
                  🔄 Refresh
                </Button>
                {isWorker && workOrder.status !== 'CANCELLED' && (
                  <Button
                    variant={showUploadForm ? 'secondary' : 'primary'}
                    size="small"
                    onClick={() => setShowUploadForm(!showUploadForm)}
                  >
                    {showUploadForm ? '✕ Close Upload' : '+ Attach Photo'}
                  </Button>
                )}
              </div>
            </div>

            {/* Inline Upload Form */}
            {showUploadForm && (
              <form
                onSubmit={handleUploadSubmit}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                  Upload Repair Photo Attachment
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Photo File (JPEG, PNG, WebP up to 10 MB) *
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileChange}
                      required
                      style={{
                        width: '100%',
                        fontSize: '0.75rem',
                        marginTop: '0.2rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Evidence Category *
                    </label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '0.78rem',
                        marginTop: '0.2rem',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="MAINTENANCE_BEFORE">Pre-Repair Inspection</option>
                      <option value="MAINTENANCE_PROGRESS">In-Progress Work</option>
                      <option value="MAINTENANCE_AFTER">Post-Repair Verification</option>
                      <option value="MAINTENANCE_RECEIPT">Receipt / Parts Invoice</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Caption / Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Replaced brass mixer valve and tested hot water line pressure"
                    value={uploadCaption}
                    onChange={(e) => setUploadCaption(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.78rem',
                      marginTop: '0.2rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <Button variant="secondary" size="small" type="button" onClick={() => setShowUploadForm(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="small" type="submit" disabled={isUploading || !uploadFile}>
                    {isUploading ? 'Uploading...' : 'Confirm Upload'}
                  </Button>
                </div>
              </form>
            )}

            {/* Evidence Loading & Error States */}
            {loadingEvidence && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '0.75rem', textAlign: 'center' }}>
                ⏳ Loading evidence attachments...
              </div>
            )}

            {evidenceError && !loadingEvidence && (
              <div style={{ fontSize: '0.78rem', color: '#ef4444', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '4px' }}>
                ⚠️ {evidenceError}
              </div>
            )}

            {/* Thumbnail Grid */}
            {!loadingEvidence && !evidenceError && evidenceList.length === 0 && (
              <div
                style={{
                  padding: '1.25rem',
                  border: '1px dashed var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'center',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                }}
              >
                No repair evidence photos attached yet. Technicians can attach diagnostic photos or post-repair verification.
              </div>
            )}

            {!loadingEvidence && evidenceList.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '0.75rem',
                  marginTop: '0.25rem',
                }}
              >
                {evidenceList.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{ height: '90px', width: '100%', overflow: 'hidden', cursor: 'pointer' }}
                      onClick={() => setLightboxIndex(index)}
                      title="Click to view full-size lightbox"
                    >
                      <AuthenticatedImage
                        workOrderId={workOrder.id}
                        evidenceId={item.id}
                        alt={item.caption || item.original_file_name || 'Evidence photo'}
                        thumbnailStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>

                    <div style={{ padding: '0.4rem', fontSize: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span
                        style={{
                          background: 'rgba(200, 169, 81, 0.15)',
                          color: 'var(--accent-gold)',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '3px',
                          fontWeight: 700,
                          fontSize: '0.65rem',
                          alignSelf: 'flex-start',
                        }}
                      >
                        {getCategoryLabel(item.evidence_category)}
                      </span>
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.original_file_name}
                      >
                        {item.original_file_name}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                        {formatFileSize(item.file_size_bytes)}
                      </div>

                      {isManagerOrAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEvidenceToDelete(item);
                          }}
                          style={{
                            alignSelf: 'flex-end',
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            fontSize: '0.68rem',
                            cursor: 'pointer',
                            padding: '0.15rem 0.3rem',
                            marginTop: '0.2rem',
                          }}
                          title="Delete evidence record"
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Technical & Operational Metadata Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '0.85rem',
              fontSize: '0.82rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Category:</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{workOrder.category || 'GENERAL'}</div>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Assigned Staff:</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>
                {workOrder.assigned_to || workOrder.assigned_to_name ? (
                  <span>👤 {workOrder.assigned_to || workOrder.assigned_to_name} (Property Staff)</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                )}
              </div>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Reported By:</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>
                {workOrder.reported_by_name || 'System / Staff'}
              </div>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Created Timestamp:</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>
                {workOrder.created_at ? new Date(workOrder.created_at).toLocaleString() : 'N/A'}
              </div>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Started Timestamp:</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>
                {workOrder.started_at ? new Date(workOrder.started_at).toLocaleString() : 'Not Started'}
              </div>
            </div>

            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Resolved Timestamp:</span>
              <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>
                {workOrder.resolved_at ? new Date(workOrder.resolved_at).toLocaleString() : 'Pending Resolution'}
              </div>
            </div>
          </div>

          {/* Financial Details */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.75rem',
              padding: '0.85rem',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Estimated Repair Cost
              </span>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                {formatNaira(workOrder.estimated_cost || 0)}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Actual Recorded Cost
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-gold)', marginTop: '0.2rem' }}>
                {formatNaira(workOrder.actual_cost || workOrder.cost || 0)}
              </div>
            </div>
          </div>

          {/* Resolution Notes (If Resolved) */}
          {workOrder.status === 'RESOLVED' && (
            <div
              style={{
                padding: '0.85rem',
                background: 'rgba(16, 185, 129, 0.08)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.85rem' }}>
                ✓ Resolution & Work Performed
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.35rem', lineHeight: 1.45 }}>
                {workOrder.resolution_notes || 'Resolution recorded without detailed notes.'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.45rem' }}>
                🧹 <strong>Turnover Notice:</strong> Unit was released from maintenance restriction and handed over to
                Housekeeping in <strong>CLEANING</strong> status for turnover inspection.
              </div>
            </div>
          )}

          {/* Cancellation Reason (If Cancelled) */}
          {workOrder.status === 'CANCELLED' && (
            <div
              style={{
                padding: '0.85rem',
                background: 'rgba(239, 68, 68, 0.08)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}>
                ✕ Work Order Cancelled
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                {workOrder.resolution_notes || 'Cancelled by management.'}
              </div>
            </div>
          )}

          {/* Related Workflows */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                navigate(`/app/apartments?unitId=${workOrder.apartment_id}&propertyId=${workOrder.property_id}`);
              }}
            >
              🚪 View Unit in Apartments
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                navigate(`/app/inspections?apartmentId=${workOrder.apartment_id}&propertyId=${workOrder.property_id}`);
              }}
            >
              📋 Unit Inspections
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                navigate(`/app/properties?search=${encodeURIComponent(workOrder.property_name || '')}`);
              }}
            >
              🏢 Property Portfolio
            </Button>
          </div>
        </div>
      </Modal>

      {/* LIGHTBOX MODAL */}
      {currentLightboxItem && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.88)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            boxSizing: 'border-box',
          }}
          onClick={() => setLightboxIndex(null)}
        >
          {/* Lightbox Top Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              maxWidth: '900px',
              color: '#fff',
              fontSize: '0.85rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <span style={{ fontWeight: 700 }}>{currentLightboxItem.original_file_name}</span>
              <span style={{ marginLeft: '0.75rem', opacity: 0.8 }}>
                ({lightboxIndex + 1} of {evidenceList.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#fff',
                fontSize: '1rem',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          {/* Lightbox Central Viewer with Prev / Next Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              maxHeight: '75vh',
              position: 'relative',
              gap: '1rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {evidenceList.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex((prev) => (prev > 0 ? prev - 1 : evidenceList.length - 1))}
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#fff',
                  fontSize: '1.4rem',
                  borderRadius: '50%',
                  width: '44px',
                  height: '44px',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
                title="Previous image"
              >
                ◀
              </button>
            )}

            <div style={{ maxWidth: '80vw', maxHeight: '70vh', display: 'flex', justifyContent: 'center' }}>
              <AuthenticatedImage
                workOrderId={workOrder.id}
                evidenceId={currentLightboxItem.id}
                alt={currentLightboxItem.caption || currentLightboxItem.original_file_name}
                thumbnailStyle={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                }}
              />
            </div>

            {evidenceList.length > 1 && (
              <button
                type="button"
                onClick={() => setLightboxIndex((prev) => (prev < evidenceList.length - 1 ? prev + 1 : 0))}
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#fff',
                  fontSize: '1.4rem',
                  borderRadius: '50%',
                  width: '44px',
                  height: '44px',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
                title="Next image"
              >
                ▶
              </button>
            )}
          </div>

          {/* Lightbox Bottom Metadata Bar */}
          <div
            style={{
              width: '100%',
              maxWidth: '900px',
              background: 'rgba(0, 0, 0, 0.6)',
              borderRadius: '8px',
              padding: '0.65rem 1rem',
              color: '#fff',
              fontSize: '0.8rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Category: <strong>{getCategoryLabel(currentLightboxItem.evidence_category)}</strong> • Size:{' '}
                {formatFileSize(currentLightboxItem.file_size_bytes)}
              </span>
              <span style={{ opacity: 0.75, fontSize: '0.72rem' }}>
                Uploaded: {currentLightboxItem.created_at ? new Date(currentLightboxItem.created_at).toLocaleString() : 'N/A'}
              </span>
            </div>
            {currentLightboxItem.caption && (
              <div style={{ color: 'var(--accent-gold, #c8a951)', fontStyle: 'italic' }}>
                "{currentLightboxItem.caption}"
              </div>
            )}
          </div>
        </div>
      )}

      {/* EVIDENCE DELETION CONFIRMATION MODAL */}
      {evidenceToDelete && (
        <Modal
          isOpen={true}
          onClose={() => setEvidenceToDelete(null)}
          title="Confirm Evidence Removal"
          maxWidth="460px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', width: '100%' }}>
              <Button variant="secondary" onClick={() => setEvidenceToDelete(null)} disabled={isDeletingEvidence}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDeleteEvidence} disabled={isDeletingEvidence}>
                {isDeletingEvidence ? 'Deleting...' : 'Delete Evidence'}
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
            <p style={{ margin: 0, color: 'var(--text-primary)' }}>
              Are you sure you want to remove evidence attachment{' '}
              <strong>"{evidenceToDelete.original_file_name}"</strong>?
            </p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              The private image file will be securely deleted from disk and an administrative audit record will be logged.
            </p>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Deletion Justification (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Duplicate upload, incorrect ticket attachment"
                value={deleteJustification}
                onChange={(e) => setDeleteJustification(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  fontSize: '0.82rem',
                  marginTop: '0.2rem',
                }}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ADMIN TICKET DELETION CONFIRMATION MODAL */}
      {showDeleteTicketConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setShowDeleteTicketConfirm(false)}
          title={`Delete Work Order: ${workOrder.issue_code}`}
          maxWidth="500px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', width: '100%' }}>
              <Button variant="secondary" onClick={() => setShowDeleteTicketConfirm(false)} disabled={isDeletingTicket}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDeleteWorkOrder} disabled={isDeletingTicket}>
                {isDeletingTicket ? 'Deleting Order...' : 'Confirm Hard Delete'}
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                color: '#ef4444',
                lineHeight: 1.4,
              }}
            >
              ⚠️ <strong>Admin Action:</strong> You are about to delete work order{' '}
              <strong>{workOrder.issue_code}</strong> ({workOrder.issue_title}).
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              In accordance with hardened Package D architecture:
              <br />• If this work order is blocking the unit, the apartment status will be restored unless other blocking tickets remain active.
              <br />• Evidence attachments are preserved with immutable snapshot reference <code>{workOrder.issue_code}</code>.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
