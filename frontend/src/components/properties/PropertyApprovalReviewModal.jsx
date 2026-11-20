import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import {
  propertyService,
  propertySubmissionService,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  Building,
  Home,
  Layers,
  Send,
  Globe,
  Lock,
  Clock,
  UserCheck,
} from 'lucide-react';

export default function PropertyApprovalReviewModal({ isOpen, onClose, property, onSuccess }) {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);

  // Review decision state
  const [decisionNotes, setDecisionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const userRole = (user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);
  const isOwner = userRole === 'OWNER';
  const canReview = isAdmin || isOwner;

  const loadData = useCallback(async () => {
    if (!property?.id) return;
    setLoading(true);
    try {
      // 1. Fetch submissions for this property
      const subRes = await propertySubmissionService.getSubmissions({ propertyId: property.id });
      const subs = subRes?.data || [];
      const latest = subs[0] || null;
      setSubmission(latest);

      // 2. Fetch hierarchy
      const hierRes = await propertyService.getHierarchy(property.id);
      setHierarchy(hierRes?.data || null);
    } catch (err) {
      addToast(err.message || 'Failed to load property submission details.', 'error');
    } finally {
      setLoading(false);
    }
  }, [property?.id, addToast]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!property) return null;

  const isSubmitter = submission && parseInt(submission.submitted_by_id, 10) === parseInt(user?.id, 10);
  const isFullyApproved = submission?.status === 'FULLY_APPROVED';
  const isPublished = property.status === 'PUBLISHED' || submission?.status === 'PUBLISHED';

  // Handle Review Action (APPROVED, CHANGES_REQUESTED, REJECTED)
  const handleReviewAction = async (action) => {
    if (!submission?.id) return;

    if (isSubmitter) {
      addToast('Self-approval violation: You cannot review or approve your own submission.', 'error');
      return;
    }

    if (!decisionNotes.trim() && action !== 'APPROVED') {
      addToast('Decision notes are mandatory when requesting changes or rejecting.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      await propertySubmissionService.reviewSubmission(submission.id, {
        action,
        decisionNotes: decisionNotes.trim(),
      });
      addToast(`Submission marked as ${action} successfully.`, 'success');
      setDecisionNotes('');
      await loadData();
      if (onSuccess) onSuccess();
    } catch (err) {
      addToast(err.message || 'Review action failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Publication
  const handlePublish = async () => {
    if (!submission?.id) return;
    setActionLoading(true);
    try {
      await propertySubmissionService.publishSubmission(submission.id);
      addToast(`Property '${property.name}' is now PUBLISHED and live on the public directory!`, 'success');
      await loadData();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      addToast(err.message || 'Publication failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Draft for Approval
  const handleSubmitDraft = async () => {
    setActionLoading(true);
    try {
      await propertyService.submitForApproval(property.id);
      addToast('Property submitted for executive dual-review approval!', 'success');
      await loadData();
      if (onSuccess) onSuccess();
    } catch (err) {
      addToast(err.message || 'Submission failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Executive Dual-Review: ${property.name}`}
      size="xl"
    >
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading property governance and submission hierarchy...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Status Ribbon */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {property.name} ({property.code})
                </span>
                <Badge variant={isPublished ? 'success' : isFullyApproved ? 'primary' : 'warning'}>
                  {property.status}
                </Badge>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {submission
                  ? `Submission Code: ${submission.submission_code} (v${submission.version_number}) • Submitted by ${submission.submitted_by_name || 'Staff'}`
                  : 'Property currently in DRAFT status without an active submission.'}
              </div>
            </div>

            {/* Publication Gate CTA */}
            {isFullyApproved && !isPublished && canReview && (
              <Button
                variant="primary"
                size="sm"
                onClick={handlePublish}
                loading={actionLoading}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                <Globe size={14} style={{ marginRight: '6px' }} /> Publish to Public Directory
              </Button>
            )}

            {!submission && ['DRAFT', 'REJECTED', 'CHANGES_REQUESTED'].includes(property.status) && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitDraft}
                loading={actionLoading}
                style={{ background: 'var(--brand-accent)' }}
              >
                <Send size={14} style={{ marginRight: '6px' }} /> Submit for Executive Approval
              </Button>
            )}
          </div>

          {/* Dual-Review Status Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* Admin Review Card */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  1. System Admin Approval
                </span>
                <Badge
                  variant={
                    submission?.admin_review_status === 'APPROVED'
                      ? 'success'
                      : submission?.admin_review_status === 'REJECTED'
                      ? 'danger'
                      : 'warning'
                  }
                >
                  {submission?.admin_review_status || 'PENDING'}
                </Badge>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {submission?.admin_reviewed_by_name
                  ? `Reviewed by ${submission.admin_reviewed_by_name}`
                  : 'Awaiting independent Admin verification'}
              </div>
              {submission?.admin_decision_notes && (
                <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '6px', borderRadius: '4px' }}>
                  "{submission.admin_decision_notes}"
                </div>
              )}
            </div>

            {/* Owner Review Card */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  2. Business Owner Approval
                </span>
                <Badge
                  variant={
                    submission?.owner_review_status === 'APPROVED'
                      ? 'success'
                      : submission?.owner_review_status === 'REJECTED'
                      ? 'danger'
                      : 'warning'
                  }
                >
                  {submission?.owner_review_status || 'PENDING'}
                </Badge>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {submission?.owner_reviewed_by_name
                  ? `Reviewed by ${submission.owner_reviewed_by_name}`
                  : 'Awaiting Business Owner review & sign-off'}
              </div>
              {submission?.owner_decision_notes && (
                <div style={{ marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '6px', borderRadius: '4px' }}>
                  "{submission.owner_decision_notes}"
                </div>
              )}
            </div>
          </div>

          {/* Self-Approval Block Notice */}
          {isSubmitter && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                color: '#f87171',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <Lock size={18} />
              <div>
                <strong>Self-Approval Blocked:</strong> You are the author/submitter of this property submission. Independent review must be conducted by an authorized colleague to preserve governance integrity.
              </div>
            </div>
          )}

          {/* Review Decision Panel (for authorized Admin/Owner reviewers) */}
          {canReview && !isSubmitter && !isPublished && submission?.status !== 'PUBLISHED' && (
            <div
              style={{
                background: 'rgba(212, 175, 55, 0.05)',
                border: '1px solid rgba(212, 175, 55, 0.3)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck size={18} style={{ color: '#d4af37' }} />
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Submit Your {isOwner ? 'Owner' : 'Admin'} Review Decision
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Review Notes / Feedback (Mandatory for Changes Requested or Rejection)
                </label>
                <textarea
                  rows={2}
                  placeholder="Record your verification notes, feedback, or approval rationale..."
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReviewAction('REJECTED')}
                  loading={actionLoading}
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                >
                  <XCircle size={14} style={{ marginRight: '4px' }} /> Reject Submission
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReviewAction('CHANGES_REQUESTED')}
                  loading={actionLoading}
                  style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                >
                  <AlertTriangle size={14} style={{ marginRight: '4px' }} /> Request Changes
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleReviewAction('APPROVED')}
                  loading={actionLoading}
                  style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
                >
                  <CheckCircle size={14} style={{ marginRight: '4px' }} /> Grant {isOwner ? 'Owner' : 'Admin'} Approval
                </Button>
              </div>
            </div>
          )}

          {/* Full Hierarchy Preview Tree */}
          <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-default)', maxHeight: '42vh', overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Submitted 3-Level Property Hierarchy & Media Assets
            </h4>

            {hierarchy ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Level A */}
                <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#d4af37' }}>
                        🏢 Level A: {hierarchy.name} ({hierarchy.code})
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {[hierarchy.location, hierarchy.district, hierarchy.address, hierarchy.city].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    {hierarchy.main_photo && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <img
                          src={hierarchy.main_photo}
                          alt="Main Building"
                          style={{ width: '80px', height: '54px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-default)' }}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Main Building Cover</span>
                      </div>
                    )}
                  </div>

                  {/* Building Amenities (Max 7) */}
                  {hierarchy.building_amenities && hierarchy.building_amenities.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                        Verified Building Amenities ({hierarchy.building_amenities.length}/7):
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                        {hierarchy.building_amenities.map((am, amIdx) => (
                          <div key={amIdx} style={{ display: 'flex', gap: '8px', background: 'var(--bg-card)', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-default)', alignItems: 'center' }}>
                            {am.photo_url ? (
                              <img src={am.photo_url} alt={am.name} style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '36px', height: '36px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>✨</div>
                            )}
                            <div style={{ overflow: 'hidden' }}>
                              <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{am.name}</strong>
                              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{am.description || 'Verified facility'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Level B & C */}
                <div style={{ paddingLeft: '0.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {hierarchy.apartments && hierarchy.apartments.map((apt, aIdx) => (
                    <div key={aIdx} style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                              🚪 {apt.unit_name}
                            </span>
                            <Badge variant="secondary" style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1' }}>
                              ID: {apt.apartment_code || apt.unit_number}
                            </Badge>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              ({apt.unit_type})
                            </span>
                          </div>
                          {apt.description && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                              {apt.description}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#d4af37' }}>
                            ₦{Number(apt.rate_per_night).toLocaleString()}/night
                          </span>
                          {apt.main_photo && (
                            <img
                              src={apt.main_photo}
                              alt={apt.unit_name}
                              style={{ width: '60px', height: '42px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Apartment In-Suite Dynamic Amenities */}
                      {apt.apartment_amenities && apt.apartment_amenities.length > 0 && (
                        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-default)' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            In-Suite Amenities ({apt.apartment_amenities.length}):
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                            {apt.apartment_amenities.map((am, amIdx) => (
                              <div key={amIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-surface)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-default)', fontSize: '0.75rem' }}>
                                {am.photo_url && (
                                  <img src={am.photo_url} alt={am.name} style={{ width: '20px', height: '20px', objectFit: 'cover', borderRadius: '3px' }} />
                                )}
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{am.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Level C Internal Spaces */}
                      {apt.internal_spaces && apt.internal_spaces.length > 0 && (
                        <div style={{ marginTop: '8px', paddingLeft: '0.75rem', borderLeft: '2px solid rgba(212, 175, 55, 0.3)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Internal Spaces:</span>
                          {apt.internal_spaces.map((sp, sIdx) => (
                            <div key={sIdx} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                              <span>• <strong>{sp.space_type}</strong>: {sp.name}</span>
                              <span style={{ color: 'var(--text-muted)' }}>{sp.photos?.length || 0} photos</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Hierarchy data not available.</div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
