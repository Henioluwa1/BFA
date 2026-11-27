import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { propertyService, apartmentService, resolveMediaUrl } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';
import {
  Building,
  MapPin,
  Bed,
  Bath,
  Users,
  Clock,
  ShieldCheck,
  Edit2,
  Plus,
  Trash2,
  Eye,
  Image as ImageIcon,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

export default function PropertyDetailModal({
  isOpen,
  onClose,
  property,
  canManage,
  canArchive,
  onEditProperty,
  onOpenGallery,
  onOpenReview,
  onAddUnits,
  onArchiveProperty,
  onInspectUnit,
  onOpenUnitMediaSpecs,
  onRefresh,
}) {
  const { addToast } = useToast();
  const [detail, setDetail] = useState(property || null);
  const [mediaList, setMediaList] = useState([]);
  const [activePhotoUrl, setActivePhotoUrl] = useState('');
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);

  // Unit Archive confirmation inside property view
  const [archiveUnitTarget, setArchiveUnitTarget] = useState(null);
  const [archivingUnit, setArchivingUnit] = useState(false);

  const loadFullProperty = useCallback(async () => {
    if (!isOpen || !property?.id) return;
    setLoading(true);
    try {
      const [propRes, mediaRes, unitsRes] = await Promise.all([
        propertyService.getById(property.id).catch(() => ({ data: property })),
        propertyService.getMedia(property.id).catch(() => ({ data: [] })),
        propertyService.getApartments(property.id).catch(() => ({ data: [] })),
      ]);

      const propData = propRes?.data || propRes || property;
      const mediaData = Array.isArray(mediaRes?.data) ? mediaRes.data : Array.isArray(mediaRes) ? mediaRes : [];
      const unitsData = Array.isArray(unitsRes?.data) ? unitsRes.data : Array.isArray(unitsRes) ? unitsRes : [];

      setDetail(propData);
      setMediaList(mediaData);
      setUnits(unitsData);

      const primary =
        mediaData.find((m) => m.is_primary)?.file_url ||
        mediaData[0]?.file_url ||
        propData?.primary_photo_url ||
        '';
      setActivePhotoUrl(resolveMediaUrl(primary));
    } catch (err) {
      addToast(`Failed to load property details: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [isOpen, property, addToast]);

  useEffect(() => {
    loadFullProperty();
  }, [loadFullProperty]);

  if (!isOpen || !property) return null;

  const prop = detail || property;
  const amenitiesList = Array.isArray(prop.amenities)
    ? prop.amenities
    : typeof prop.amenities === 'string'
    ? (() => {
        try {
          return JSON.parse(prop.amenities || '[]');
        } catch {
          return [];
        }
      })()
    : [];

  const handleConfirmArchiveUnit = async (mode = 'archive') => {
    if (!archiveUnitTarget) return;
    setArchivingUnit(true);
    try {
      const res = await apartmentService.archive(archiveUnitTarget.id, mode);
      addToast(res?.message || `Apartment #${archiveUnitTarget.unit_number} updated.`, 'success');
      setArchiveUnitTarget(null);
      await loadFullProperty();
      if (onRefresh) onRefresh();
    } catch (err) {
      addToast(`Failed to ${mode} apartment: ${err.message}`, 'error');
    } finally {
      setArchivingUnit(false);
    }
  };

  const approvalBadgeStatus = (status) => {
    if (['APPROVED', 'PUBLISHED'].includes(status)) return 'success';
    if (['REJECTED', 'CHANGES_REQUESTED'].includes(status)) return 'danger';
    return 'warning';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={`${prop.name || 'Property Details'} (${prop.code || ''})`}
      subtitle={`${prop.address ? `${prop.address}, ` : ''}${prop.city || 'Akure'}, ${prop.state || 'Ondo State'}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '100%', boxSizing: 'border-box' }}>
        {/* Top Action Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            background: 'rgba(15, 23, 42, 0.75)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(148, 163, 184, 0.25)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
            <Badge status={prop.status === 'ACTIVE' || prop.status === 'PUBLISHED' ? 'success' : prop.status === 'ARCHIVED' ? 'neutral' : 'warning'}>
              Status: {prop.status}
            </Badge>
            <Badge status={approvalBadgeStatus(prop.approval_status)}>
              Approval: {prop.approval_status || 'PENDING'}
            </Badge>
            {prop.category && <Badge status="info">{prop.category}</Badge>}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {canManage && (
              <>
                <Button size="sm" variant="outline" onClick={() => { onClose(); onEditProperty?.(prop); }}>
                  <Edit2 size={13} style={{ marginRight: 4 }} /> Edit Property
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { onClose(); onOpenGallery?.(prop); }}>
                  <ImageIcon size={13} style={{ marginRight: 4 }} /> Gallery
                </Button>
                <Button size="sm" variant="outline" onClick={() => { onClose(); onOpenReview?.(prop); }} style={{ borderColor: '#d4af37', color: '#d4af37' }}>
                  <ShieldCheck size={13} style={{ marginRight: 4 }} /> Review / Publish
                </Button>
              </>
            )}
            {canArchive && prop.status !== 'ARCHIVED' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { onClose(); onArchiveProperty?.(prop); }}
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
              >
                <Trash2 size={13} style={{ marginRight: 4 }} /> Archive / Delete
              </Button>
            )}
          </div>
        </div>

        {/* Gallery + Overview */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* Left: Photo Gallery */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div
              style={{
                width: '100%',
                height: '220px',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {activePhotoUrl ? (
                <img
                  src={activePhotoUrl}
                  alt={prop.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                  <Building size={32} style={{ opacity: 0.4, marginBottom: '0.35rem' }} />
                  <div style={{ fontSize: '0.82rem' }}>No building photographs uploaded yet</div>
                </div>
              )}
            </div>

            {mediaList.length > 1 && (
              <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {mediaList.map((m) => {
                  const url = resolveMediaUrl(m.file_url);
                  const isActive = url === activePhotoUrl;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActivePhotoUrl(url)}
                      style={{
                        flexShrink: 0,
                        width: '60px',
                        height: '44px',
                        padding: 0,
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: isActive ? '2px solid var(--accent-gold, #d4af37)' : '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background: 'none',
                      }}
                    >
                      <img src={url} alt={m.caption || prop.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Property Information & Specs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Description
              </div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {prop.description || 'No property description recorded yet.'}
              </p>
            </div>

            {prop.environment_description && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Neighborhood &amp; Environment
                </div>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {prop.environment_description}
                </p>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.75)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(148, 163, 184, 0.25)' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>CHECK-IN / CHECK-OUT</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '2px' }}>
                  <Clock size={13} /> {prop.check_in_time || '14:00'} / {prop.check_out_time || '11:00'}
                </div>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.75)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(148, 163, 184, 0.25)' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>CONTACT</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc', marginTop: '2px', wordBreak: 'break-word' }}>
                  {prop.contact_phone || prop.contact_email || 'Not configured'}
                </div>
              </div>
            </div>

            {amenitiesList.length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Building Amenities &amp; Facilities
                </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {amenitiesList.map((a, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: 'rgba(15, 23, 42, 0.75)',
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        color: '#e2e8f0',
                        fontSize: '0.75rem',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '4px',
                      }}
                    >
                      ✓ {typeof a === 'string' ? a : a?.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Associated Apartments Section */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                Apartments in {prop.name} ({units.length})
              </h4>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Create, inspect, edit, or safely archive apartments belonging exclusively to this property.
              </div>
            </div>

            {canManage && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onClose();
                  onAddUnits?.(prop);
                }}
              >
                <Plus size={14} style={{ marginRight: 4 }} /> Add Apartment
              </Button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading apartments...
            </div>
          ) : units.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
              No apartments registered under this property yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '340px', overflowY: 'auto' }}>
              {units.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    padding: '0.8rem 1rem',
                    background: 'rgba(15, 23, 42, 0.75)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                  }}
                >
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#f8fafc', fontSize: '0.95rem' }}>
                        {u.unit_name} (#{u.unit_number})
                      </strong>
                      <Badge status={u.status === 'AVAILABLE' ? 'success' : u.status === 'OUT_OF_SERVICE' ? 'neutral' : 'warning'}>
                        {u.status}
                      </Badge>
                      <Badge status={approvalBadgeStatus(u.approval_status)}>
                        {u.approval_status || 'PENDING'}
                      </Badge>
                      {!u.is_active && <Badge status="neutral">Unpublished</Badge>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                      <span><Bed size={12} style={{ verticalAlign: 'middle' }} /> {u.unit_type || 'Suite'}</span>
                      <span><Users size={12} style={{ verticalAlign: 'middle' }} /> Max {u.capacity || 2}</span>
                      <span><Bath size={12} style={{ verticalAlign: 'middle' }} /> {u.bathroom_count || 1} Bath</span>
                      <span>
                        Entered: <strong>{formatNaira(u.entered_rate_per_night ?? u.rate_per_night)}</strong>
                        {u.approved_rate_per_night ? (
                          <> • Approved Public: <strong style={{ color: '#10b981' }}>{formatNaira(u.approved_rate_per_night)}</strong></>
                        ) : (
                          <> • <span style={{ color: '#f59e0b' }}>No approved public price yet</span></>
                        )}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onClose();
                        onInspectUnit?.(u);
                      }}
                    >
                      <Eye size={13} style={{ marginRight: 4 }} /> Details
                    </Button>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onClose();
                          onOpenUnitMediaSpecs?.(u);
                        }}
                      >
                        <Edit2 size={13} style={{ marginRight: 4 }} /> Edit / Media
                      </Button>
                    )}
                    {canArchive && u.status !== 'OUT_OF_SERVICE' && (
                      <Button
                        size="sm"
                        variant="outline"
                        style={{ borderColor: '#ef4444', color: '#ef4444' }}
                        onClick={() => setArchiveUnitTarget(u)}
                      >
                        <Trash2 size={13} style={{ marginRight: 4 }} /> Archive
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inline Safe Archive/Delete Confirmation for Apartment */}
        {archiveUnitTarget && (
          <div
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', fontWeight: 700 }}>
              <AlertTriangle size={16} />
              <span>Confirm Archive / Delete: {archiveUnitTarget.unit_name} (#{archiveUnitTarget.unit_number})</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Archiving removes this apartment from public discovery and prevents new bookings while preserving all historical reservations and financial records. If this unit has zero reservations, you may also choose Permanent Delete.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button size="sm" variant="ghost" onClick={() => setArchiveUnitTarget(null)} disabled={archivingUnit}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                onClick={() => handleConfirmArchiveUnit('archive')}
                disabled={archivingUnit}
              >
                {archivingUnit ? 'Processing...' : 'Archive Unit (Preserve History)'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
                onClick={() => handleConfirmArchiveUnit('delete')}
                disabled={archivingUnit}
              >
                {archivingUnit ? 'Processing...' : 'Delete Permanently (If Unused)'}
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onClose();
              window.open(`/properties/${prop.id}`, '_blank');
            }}
          >
            <ExternalLink size={13} style={{ marginRight: 4 }} /> Open Public Listing
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
