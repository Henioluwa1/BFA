import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { propertySubmissionService, resolveMediaUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';
import { FileText, Download, CheckCircle2, XCircle, AlertTriangle, Send, Building2 } from 'lucide-react';

const STATUS_BADGE = {
  DRAFT: 'neutral',
  PENDING_OWNER_APPROVAL: 'warning',
  PENDING_OPS_APPROVAL: 'info',
  CHANGES_REQUESTED: 'warning',
  REJECTED: 'danger',
  APPROVED: 'success',
  PUBLISHED: 'success',
  UNPUBLISHED: 'neutral',
};

export default function ApprovalsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [entityFilter, setEntityFilter] = useState('ALL');

  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docData, setDocData] = useState(null);
  const [docLoading, setDocLoading] = useState(false);

  const [reviewModal, setReviewModal] = useState({ open: false, submission: null, action: 'CHANGES_REQUESTED' });
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const userRole = String(user?.role || '').toUpperCase();

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await propertySubmissionService.getSubmissions({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        entityType: entityFilter !== 'ALL' ? entityFilter : undefined,
      });
      setSubmissions(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      addToast(err.message || 'Failed to load approval submissions.', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, entityFilter, addToast]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const handleViewDocument = useCallback(async (submissionId) => {
    setDocModalOpen(true);
    setDocLoading(true);
    try {
      const res = await propertySubmissionService.getSubmissionDocument(submissionId);
      setDocData(res?.data || null);
    } catch (err) {
      addToast(err.message || 'Failed to load submission document.', 'error');
      setDocModalOpen(false);
    } finally {
      setDocLoading(false);
    }
  }, [addToast]);

  // Deep-link from notification (?submission=123&viewDoc=1)
  useEffect(() => {
    const subId = searchParams.get('submission');
    if (subId) {
      handleViewDocument(subId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, handleViewDocument, setSearchParams]);

  const handleDownloadPdf = async (submissionId, code) => {
    try {
      const blob = await propertySubmissionService.downloadSubmissionPdf(submissionId);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${code || `BFA-Submission-${submissionId}`}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      addToast(err.message || 'Failed to download PDF.', 'error');
    }
  };

  const handleApprove = async (submission) => {
    setSubmitting(true);
    try {
      await propertySubmissionService.reviewSubmission(submission.id, {
        action: 'APPROVED',
        decisionNotes: `Approved by ${user?.name || userRole}`,
      });
      addToast(`Approval recorded for ${submission.submission_code}`, 'success');
      await loadSubmissions();
      if (docModalOpen && docData?.submission?.id === submission.id) {
        await handleViewDocument(submission.id);
      }
    } catch (err) {
      addToast(err.response?.data?.error?.message || err.message || 'Approval failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDecision = async (e) => {
    e.preventDefault();
    if (!reviewNotes.trim()) {
      addToast('Please enter a reason or comment.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await propertySubmissionService.reviewSubmission(reviewModal.submission.id, {
        action: reviewModal.action,
        decisionNotes: reviewNotes.trim(),
        commentContent: reviewNotes.trim(),
      });
      addToast(`Submission marked ${reviewModal.action}`, 'success');
      setReviewModal({ open: false, submission: null, action: 'CHANGES_REQUESTED' });
      setReviewNotes('');
      await loadSubmissions();
    } catch (err) {
      addToast(err.response?.data?.error?.message || err.message || 'Action failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (submission) => {
    setSubmitting(true);
    try {
      await propertySubmissionService.publishSubmission(submission.id);
      addToast(`${submission.submission_code} published to public website!`, 'success');
      await loadSubmissions();
      if (docModalOpen && docData?.submission?.id === submission.id) {
        await handleViewDocument(submission.id);
      }
    } catch (err) {
      addToast(err.response?.data?.error?.message || err.message || 'Publication failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const canActAsOwner = (sub) =>
    userRole === 'OWNER' &&
    String(sub.submitted_by_id) !== String(user?.id) &&
    sub.owner_review_status !== 'APPROVED' &&
    !['PUBLISHED', 'REJECTED'].includes(sub.status);

  const canActAsOps = (sub) =>
    userRole === 'OPERATIONS_MANAGER' &&
    String(sub.submitted_by_id) !== String(user?.id) &&
    sub.owner_review_status === 'APPROVED' &&
    sub.ops_review_status !== 'APPROVED' &&
    !['PUBLISHED', 'REJECTED'].includes(sub.status);

  const canRejectOrRequest = (sub) =>
    ['OWNER', 'OPERATIONS_MANAGER'].includes(userRole) &&
    String(sub.submitted_by_id) !== String(user?.id) &&
    !['PUBLISHED', 'REJECTED'].includes(sub.status);

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Property &amp; Apartment Approvals</h1>
          <p className="page-subtitle">
            Mandatory two-stage Owner and Operations Manager review before any property, apartment, or price update is published.
          </p>
        </div>
        <Button variant="secondary" onClick={loadSubmissions} disabled={loading}>
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </Button>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'PENDING_OWNER_APPROVAL', label: 'Pending Owner' },
              { id: 'PENDING_OPS_APPROVAL', label: 'Pending Ops Manager' },
              { id: 'APPROVED', label: 'Approved (Ready to Publish)' },
              { id: 'CHANGES_REQUESTED', label: 'Changes Requested' },
              { id: 'REJECTED', label: 'Rejected' },
              { id: 'PUBLISHED', label: 'Published' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn btn-sm ${statusFilter === t.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {['ALL', 'PROPERTY', 'APARTMENT'].map((et) => (
              <button
                key={et}
                type="button"
                className={`btn btn-sm ${entityFilter === et ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setEntityFilter(et)}
              >
                {et === 'ALL' ? 'All Types' : et}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Submissions List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {loading && submissions.length === 0 ? (
          <Card><div style={{ padding: '2rem', textAlign: 'center' }}>Loading approval queue...</div></Card>
        ) : submissions.length === 0 ? (
          <Card><div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No submissions match the selected filters.</div></Card>
        ) : (
          submissions.map((sub) => {
            const photoUrl = resolveMediaUrl(sub.main_photo_url);
            const title = sub.entity_type === 'APARTMENT'
              ? `${sub.property_name} — ${sub.apartment_name || sub.content_snapshot?.unit_name || 'Apartment'} (#${sub.apartment_number || sub.content_snapshot?.unit_number || ''})`
              : sub.property_name;
            return (
              <Card key={sub.id}>
                <div style={{ display: 'flex', gap: '1.1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ width: '132px', height: '90px', borderRadius: '10px', overflow: 'hidden', background: '#0b1b15', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {photoUrl ? (
                      <img src={photoUrl} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Building2 size={28} color="#d4af37" />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <Badge status="info">{sub.entity_type || 'PROPERTY'}</Badge>
                      <Badge status={STATUS_BADGE[sub.status] || 'neutral'}>{sub.status}</Badge>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sub.submission_code} • v{sub.document_version || sub.version_number}</span>
                    </div>
                    <h3 style={{ margin: '0 0 0.3rem', fontSize: '1.05rem', color: 'var(--text-primary)' }}>{title}</h3>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>Submitted by: <strong>{sub.submitted_by_name}</strong></span>
                      <span>Date: {new Date(sub.submitted_at).toLocaleString()}</span>
                      <span>Owner: <strong>{sub.owner_review_status || 'PENDING'}</strong></span>
                      <span>Ops Manager: <strong>{sub.ops_review_status || 'PENDING'}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Button size="sm" variant="secondary" onClick={() => handleViewDocument(sub.id)}>
                      <FileText size={14} /> View Document
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleDownloadPdf(sub.id, sub.submission_code)}>
                      <Download size={14} /> Download PDF
                    </Button>
                    {(canActAsOwner(sub) || canActAsOps(sub)) && (
                      <Button size="sm" variant="primary" disabled={submitting} onClick={() => handleApprove(sub)}>
                        <CheckCircle2 size={14} /> Approve
                      </Button>
                    )}
                    {canRejectOrRequest(sub) && (
                      <>
                        <Button size="sm" variant="secondary" disabled={submitting} onClick={() => { setReviewNotes(''); setReviewModal({ open: true, submission: sub, action: 'CHANGES_REQUESTED' }); }}>
                          <AlertTriangle size={14} /> Request Changes
                        </Button>
                        <Button size="sm" variant="danger" disabled={submitting} onClick={() => { setReviewNotes(''); setReviewModal({ open: true, submission: sub, action: 'REJECTED' }); }}>
                          <XCircle size={14} /> Reject
                        </Button>
                      </>
                    )}
                    {sub.status === 'APPROVED' && ['OWNER', 'OPERATIONS_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
                      <Button size="sm" variant="primary" disabled={submitting} onClick={() => handlePublish(sub)}>
                        <Send size={14} /> Publish to Website
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* In-App Submission Document Modal */}
      <Modal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        title={docData?.submission ? `Submission Document — ${docData.submission.submission_code}` : 'Submission Document'}
        size="xl"
      >
        {docLoading || !docData ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading complete submission document...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Badge status={STATUS_BADGE[docData.submission.status] || 'neutral'}>{docData.submission.status}</Badge>
                <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                  Version v{docData.submission.document_version} • Submitted by {docData.submission.submitted_by_name}
                </span>
              </div>
              <Button size="sm" variant="primary" onClick={() => handleDownloadPdf(docData.submission.id, docData.submission.submission_code)}>
                <Download size={14} /> Download PDF
              </Button>
            </div>

            <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#d4af37' }}>Property Information</h4>
              <p style={{ margin: '0.2rem 0' }}><strong>Name:</strong> {docData.property.name} ({docData.property.code})</p>
              <p style={{ margin: '0.2rem 0' }}><strong>Address:</strong> {[docData.property.address, docData.property.city, docData.property.state, docData.property.country].filter(Boolean).join(', ')}</p>
              <p style={{ margin: '0.2rem 0' }}><strong>Description:</strong> {docData.property.description || '—'}</p>
            </div>

            {docData.apartment && (
              <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: '#d4af37' }}>Apartment &amp; Pricing Information</h4>
                <p style={{ margin: '0.2rem 0' }}><strong>Unit:</strong> {docData.apartment.unit_name} (#{docData.apartment.unit_number}) — {docData.apartment.unit_type}</p>
                <p style={{ margin: '0.2rem 0' }}><strong>Capacity:</strong> {docData.apartment.capacity} Guests • {docData.apartment.bedroom_count} Bed • {docData.apartment.bathroom_count} Bath</p>
                <p style={{ margin: '0.2rem 0' }}><strong>Entered Booking Price:</strong> {formatNaira(docData.apartment.entered_rate_per_night)} ({docData.apartment.rate_type || 'PER_NIGHT'}) — Status: {docData.apartment.pricing_status}</p>
                {docData.apartment.approved_rate_per_night != null && (
                  <p style={{ margin: '0.2rem 0' }}><strong>Approved Public Price:</strong> {formatNaira(docData.apartment.approved_rate_per_night)}</p>
                )}
              </div>
            )}

            <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#d4af37' }}>Photographs ({docData.media?.length || 0})</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
                {(docData.media || []).map((m) => (
                  <div key={m.id} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <img src={resolveMediaUrl(m.file_url)} alt={m.caption} style={{ width: '100%', height: '100px', objectFit: 'cover' }} />
                    <div style={{ padding: '4px 6px', fontSize: '0.72rem', color: '#cbd5e1' }}>{m.is_primary ? '★ ' : ''}{m.caption}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '1rem', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#d4af37' }}>Approval Sign-Off</h4>
              <p style={{ margin: '0.2rem 0' }}><strong>1. Owner Review:</strong> {docData.submission.owner_review_status} {docData.submission.owner_reviewed_by_name ? `(${docData.submission.owner_reviewed_by_name})` : ''}</p>
              <p style={{ margin: '0.2rem 0' }}><strong>2. Operations Manager Review:</strong> {docData.submission.ops_review_status} {docData.submission.ops_reviewed_by_name ? `(${docData.submission.ops_reviewed_by_name})` : ''}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject / Request Changes Modal */}
      <Modal
        isOpen={reviewModal.open}
        onClose={() => setReviewModal({ open: false, submission: null, action: 'CHANGES_REQUESTED' })}
        title={reviewModal.action === 'REJECTED' ? 'Reject Submission' : 'Request Changes'}
      >
        <form onSubmit={handleSubmitDecision} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Reason / Review Comments *</label>
            <textarea
              className="input-field"
              rows={3}
              required
              placeholder="Explain what needs to be corrected or why this submission is rejected..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button type="button" variant="secondary" onClick={() => setReviewModal({ open: false, submission: null, action: 'CHANGES_REQUESTED' })}>Cancel</Button>
            <Button type="submit" variant={reviewModal.action === 'REJECTED' ? 'danger' : 'primary'} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Confirm Decision'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
