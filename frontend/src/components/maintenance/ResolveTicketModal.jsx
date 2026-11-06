import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { maintenanceService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const ALLOWED_EXEMPTIONS = [
  { value: 'TENANT_PRIVACY', label: '🔒 Tenant Privacy Restriction (Occupied Room/Private Belongings)' },
  { value: 'PRIVACY_RESTRICTION', label: '🛡️ General Privacy Restriction' },
  { value: 'EMERGENCY_CONTAINMENT', label: '🚨 Emergency Containment (Rapid Intervention / Hazard)' },
  { value: 'DEVICE_FAILURE', label: '📱 Camera / Device Hardware Failure' },
  { value: 'NON_VISUAL_REPAIR', label: '🔧 Non-Visual Repair (Diagnostic / System Reset / Breaker)' },
  { value: 'OTHER', label: '📝 Other Documented Operational Reason' },
];

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export default function ResolveTicketModal({
  isOpen,
  onClose,
  workOrder,
  onSuccess,
}) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  // Form Fields
  const [actualCost, setActualCost] = useState(
    workOrder?.actual_cost ? String(workOrder.actual_cost) : (workOrder?.estimated_cost ? String(workOrder.estimated_cost) : '0')
  );
  const [resolutionNotes, setResolutionNotes] = useState(workOrder?.resolution_notes || '');

  // DEC-2.5B-04 Option C: Evidence verification mode
  // 'UPLOAD_PHOTO' | 'WRITTEN_EXEMPTION' | 'NONE'
  const [evidenceMode, setEvidenceMode] = useState('UPLOAD_PHOTO');

  // Photo state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoCaption, setPhotoCaption] = useState('');

  // Exemption state
  const [exemptionReason, setExemptionReason] = useState('TENANT_PRIVACY');
  const [exemptionNotes, setExemptionNotes] = useState('');

  // Handle file select
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      addToast('Invalid photo format. Only JPEG, PNG, and WebP are allowed.', 'error');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      addToast(
        `Photo exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB selected).`,
        'error'
      );
      e.target.value = '';
      return;
    }

    setPhotoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!resolutionNotes || resolutionNotes.trim().length < 3) {
      addToast('Resolution notes are required (minimum 3 characters).', 'error');
      return;
    }

    const numCost = actualCost === '' ? 0 : parseFloat(actualCost);
    if (isNaN(numCost) || numCost < 0) {
      addToast('Actual cost must be a valid non-negative number.', 'error');
      return;
    }

    // Exemption validation
    if (evidenceMode === 'WRITTEN_EXEMPTION') {
      if (!exemptionReason) {
        addToast('Please select a valid photo exemption reason.', 'error');
        return;
      }
      if (!exemptionNotes || exemptionNotes.trim().length < 3) {
        addToast('Documented explanatory notes (minimum 3 characters) are required for written photo exemption.', 'error');
        return;
      }
    }

    setLoading(true);
    try {
      let photoBase64 = null;
      if (evidenceMode === 'UPLOAD_PHOTO' && photoFile) {
        const reader = new FileReader();
        photoBase64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Failed to read photo file.'));
          reader.readAsDataURL(photoFile);
        });
      }

      const payload = {
        actual_cost: numCost,
        resolution_notes: resolutionNotes.trim(),
      };

      if (evidenceMode === 'UPLOAD_PHOTO' && photoBase64) {
        payload.photo = photoBase64;
        payload.evidenceCategory = 'MAINTENANCE_AFTER';
        payload.caption = photoCaption.trim() || `Post-repair verification for #${workOrder.issue_code}`;
      } else if (evidenceMode === 'WRITTEN_EXEMPTION') {
        payload.photo_exemption_reason = exemptionReason;
        payload.resolution_notes = `${resolutionNotes.trim()} [Photo Exemption: ${exemptionReason} - ${exemptionNotes.trim()}]`;
      }

      // If written exemption was selected, document it first via evidence endpoint
      if (evidenceMode === 'WRITTEN_EXEMPTION') {
        await maintenanceService.documentExemption(workOrder.id, {
          photo_exemption_reason: exemptionReason,
          exemption_notes: exemptionNotes.trim(),
        });
      }

      const res = await maintenanceService.resolve(workOrder.id, payload);

      let successMsg = `Work order #${workOrder.issue_code} resolved successfully!`;
      if (workOrder.blocking_unit && workOrder.apartment_id) {
        successMsg += ' Unit evaluated for housekeeping turnover (CLEANING).';
      }
      if (evidenceMode === 'WRITTEN_EXEMPTION') {
        successMsg += ' (Written photo exemption documented in audit trail)';
      }

      addToast(successMsg, 'success');
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      if (onSuccess) onSuccess(res.data);
      onClose();
    } catch (err) {
      addToast(`Failed to resolve work order: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!workOrder) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resolve Work Order: ${workOrder.issue_code}`}
      maxWidth="620px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Resolving...' : 'Complete & Resolve Work Order'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Work Order Info */}
        <div
          style={{
            background: 'var(--bg-surface)',
            padding: '0.85rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{workOrder.issue_title}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Property: <strong>{workOrder.property_name}</strong> • Unit:{' '}
            <strong>{workOrder.unit_number ? `Unit ${workOrder.unit_number}` : 'Facility / Common Area'}</strong>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            Current Status: <strong>{workOrder.status}</strong> • Blocking Unit:{' '}
            <strong>{workOrder.blocking_unit ? 'YES (MAINTENANCE)' : 'NO'}</strong>
          </div>
        </div>

        {/* Actual Cost Input */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Actual Repair Cost (₦) *
          </label>
          <input
            type="number"
            required
            min="0"
            step="0.01"
            placeholder="0.00"
            value={actualCost}
            onChange={(e) => setActualCost(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              marginTop: '0.25rem',
            }}
          />
        </div>

        {/* Resolution Notes */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Resolution & Repair Completion Notes *
          </label>
          <textarea
            rows={3}
            required
            placeholder="Detail repairs completed, materials installed, testing verified, and recommendations for housekeeping..."
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '100%',
              padding: '0.55rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
              resize: 'vertical',
              marginTop: '0.25rem',
            }}
          />
        </div>

        {/* DEC-2.5B-04: FLEXIBLE EVIDENCE & WRITTEN EXEMPTION SELECTOR */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            📷 Repair Evidence Verification (DEC-2.5B-04 Option C)
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            Flexible post-repair evidence policy: attach a completion photo, document a written exemption, or proceed if evidence was already logged.
          </div>

          {/* Mode Selector Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                cursor: 'pointer',
                padding: '0.4rem 0.6rem',
                borderRadius: '4px',
                border: `1px solid ${evidenceMode === 'UPLOAD_PHOTO' ? 'var(--brand-accent)' : 'var(--border-default)'}`,
                background: evidenceMode === 'UPLOAD_PHOTO' ? 'rgba(200, 169, 81, 0.1)' : 'var(--bg-card)',
              }}
            >
              <input
                type="radio"
                name="evidenceMode"
                value="UPLOAD_PHOTO"
                checked={evidenceMode === 'UPLOAD_PHOTO'}
                onChange={() => setEvidenceMode('UPLOAD_PHOTO')}
              />
              <span style={{ fontWeight: evidenceMode === 'UPLOAD_PHOTO' ? 700 : 500 }}>
                Attach Completion Photo
              </span>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                cursor: 'pointer',
                padding: '0.4rem 0.6rem',
                borderRadius: '4px',
                border: `1px solid ${evidenceMode === 'WRITTEN_EXEMPTION' ? '#f59e0b' : 'var(--border-default)'}`,
                background: evidenceMode === 'WRITTEN_EXEMPTION' ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-card)',
              }}
            >
              <input
                type="radio"
                name="evidenceMode"
                value="WRITTEN_EXEMPTION"
                checked={evidenceMode === 'WRITTEN_EXEMPTION'}
                onChange={() => setEvidenceMode('WRITTEN_EXEMPTION')}
              />
              <span style={{ fontWeight: evidenceMode === 'WRITTEN_EXEMPTION' ? 700 : 500 }}>
                Document Exemption
              </span>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                cursor: 'pointer',
                padding: '0.4rem 0.6rem',
                borderRadius: '4px',
                border: `1px solid ${evidenceMode === 'NONE' ? 'var(--brand-accent)' : 'var(--border-default)'}`,
                background: evidenceMode === 'NONE' ? 'rgba(107, 114, 128, 0.1)' : 'var(--bg-card)',
              }}
            >
              <input
                type="radio"
                name="evidenceMode"
                value="NONE"
                checked={evidenceMode === 'NONE'}
                onChange={() => setEvidenceMode('NONE')}
              />
              <span style={{ fontWeight: evidenceMode === 'NONE' ? 700 : 500 }}>
                Existing / Not Required
              </span>
            </label>
          </div>

          {/* Mode 1: Photo Upload Fields */}
          {evidenceMode === 'UPLOAD_PHOTO' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Select Completion Photo (JPEG, PNG, WebP up to 10 MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  style={{ width: '100%', fontSize: '0.75rem', marginTop: '0.2rem' }}
                />
              </div>

              {photoPreview && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <img
                    src={photoPreview}
                    alt="Preview"
                    style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      placeholder="Optional caption (e.g. Completed shower installation)"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.4rem',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Written Exemption Workflow */}
          {evidenceMode === 'WRITTEN_EXEMPTION' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.25rem' }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Approved Exemption Reason *
                </label>
                <select
                  required
                  value={exemptionReason}
                  onChange={(e) => setExemptionReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: '0.78rem',
                    boxSizing: 'border-box',
                    marginTop: '0.2rem',
                  }}
                >
                  {ALLOWED_EXEMPTIONS.map((ex) => (
                    <option key={ex.value} value={ex.value}>
                      {ex.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Documented Exemption Justification Notes * (Minimum 3 characters)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain why photo evidence was exempted (e.g. Guest in room requested no photography; circuit breaker reset had no visual defect)..."
                  value={exemptionNotes}
                  onChange={(e) => setExemptionNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: '0.78rem',
                    boxSizing: 'border-box',
                    marginTop: '0.2rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.72rem',
                  color: '#b45309',
                  lineHeight: 1.4,
                }}
              >
                ⚖️ <strong>Auditable Administrative Exception:</strong> In accordance with DEC-2.5B-04 Option C, this documents a binding written exemption in the audit trail (<code>MAINTENANCE_EVIDENCE_EXEMPTION</code>). No dummy files or placeholder records are fabricated.
              </div>
            </div>
          )}

          {/* Mode 3: Existing / Not Required Note */}
          {evidenceMode === 'NONE' && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0.35rem 0' }}>
              Resolving work order with existing diagnostic photos or without requiring additional photographic attachments.
            </div>
          )}
        </div>

        {/* Housekeeping Progression Notice */}
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '0.75rem 0.9rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}
        >
          🧹 <strong>Unit Operational State Progression:</strong> Resolving this ticket releases this work order's lock.
          If no other blocking work orders remain active, the unit transitions to <strong>CLEANING</strong> (or <strong>OCCUPIED</strong> if an in-house guest is present).
        </div>

        {/* Financial Separation of Duties Notice */}
        <div
          style={{
            background: 'rgba(200, 169, 81, 0.08)',
            border: '1px solid rgba(200, 169, 81, 0.25)',
            padding: '0.75rem 0.9rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}
        >
          ℹ️ <strong>Financial Separation of Duties:</strong> Repair costs recorded here reflect maintenance expenditure
          on the work order. They do <strong>NOT</strong> create an accounting expense or disburse funds. Formal corporate
          expenses require separate administrative recording and maker-checker approval.
        </div>
      </form>
    </Modal>
  );
}
