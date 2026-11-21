import React, { useState, useEffect, useCallback } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Table from '../ui/Table';
import Modal from '../ui/Modal';
import { operationsService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import {
  FileText,
  Star,
  RefreshCw,
  Building,
  User,
  CheckCircle,
  Eye,
  MessageSquare,
} from 'lucide-react';

export default function StaffReportsReviewTab({ activePropertyId }) {
  const { user } = useAuth();
  const { properties } = useProperty();
  const { addToast } = useToast();

  const userRole = (user?.role || '').toUpperCase();
  const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER'].includes(userRole);

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  // Review Modal
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        propertyId: activePropertyId !== 'all' ? activePropertyId : undefined,
      };
      const res = await operationsService.listStaffReports(params);
      setReports(res.data?.data?.reports || res.data?.reports || []);
    } catch (err) {
      addToast(err.message || 'Failed to load staff reports', 'error');
    } finally {
      setLoading(false);
    }
  }, [activePropertyId, addToast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleReviewReport = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await operationsService.reviewStaffReport(reviewTarget.id, {
        manager_rating: reviewRating,
        manager_notes: reviewNotes,
      });
      addToast('Staff operational report reviewed and signed off non-destructively!', 'success');
      setReviewTarget(null);
      setReviewNotes('');
      fetchReports();
    } catch (err) {
      addToast(err.message || 'Failed to submit review', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} style={{ color: 'var(--brand-accent, #ca8a04)' }} />
            <span>Staff Shift & Handover Reports Review</span>
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Auditable, non-destructive review of end-of-shift reports, handover briefings, and incident statements submitted by staff.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchReports} icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}>
          Refresh
        </Button>
      </div>

      <Card>
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading staff reports...
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No staff shift reports submitted for this property filter.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {reports.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-elevated, #1a202c)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem' }}>{r.staff_name || r.user_id}</strong>
                      <Badge status="neutral">{r.role_classification || 'Staff'}</Badge>
                      <Badge status="available">{r.property_name || 'Property'}</Badge>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Shift Date: <strong>{r.shift_date}</strong> | Submitted: {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {r.manager_rating ? (
                      <span style={{ color: '#10b981', fontWeight: 600, fontSize: '0.88rem' }}>
                        ★ {r.manager_rating}/5 Rated by {r.reviewed_by_name || 'Manager'}
                      </span>
                    ) : (
                      <Badge status="pending">Awaiting Review</Badge>
                    )}
                    {isManagement && (
                      <Button
                        size="sm"
                        variant={r.manager_rating ? 'outline' : 'primary'}
                        onClick={() => {
                          setReviewTarget(r);
                          setReviewRating(r.manager_rating || 5);
                          setReviewNotes(r.manager_notes || '');
                        }}
                      >
                        {r.manager_rating ? 'Edit Review' : 'Review & Rate'}
                      </Button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    fontSize: '0.88rem',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {r.content}
                </div>

                {r.manager_notes && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      background: 'rgba(212, 175, 55, 0.08)',
                      borderLeft: '4px solid var(--brand-accent, #ca8a04)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.84rem',
                    }}
                  >
                    <strong>Manager Evaluation & Review Notes:</strong>
                    <div style={{ marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                      {r.manager_notes}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ─── MODAL: REVIEW STAFF REPORT ────────────────────────────────────── */}
      {reviewTarget && (
        <Modal
          isOpen={Boolean(reviewTarget)}
          onClose={() => setReviewTarget(null)}
          title={`Review Report: ${reviewTarget.staff_name} (${reviewTarget.shift_date})`}
        >
          <form onSubmit={handleReviewReport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', maxHeight: '160px', overflowY: 'auto' }}>
              <strong>Original Staff Report:</strong>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                {reviewTarget.content}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Operational Quality Rating (1 - 5)
              </label>
              <select
                value={reviewRating}
                onChange={(e) => setReviewRating(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="5">5 - Exemplary / Above Expectations</option>
                <option value="4">4 - High Quality / Fully Satisfactory</option>
                <option value="3">3 - Standard / Minor Issues Handled</option>
                <option value="2">2 - Substandard / Follow-up Required</option>
                <option value="1">1 - Deficient</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 600 }}>
                Manager Evaluation & Feedback (Non-Destructive) *
              </label>
              <textarea
                rows={4}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                required
                placeholder="Enter formal managerial feedback, turnover evaluation, or commendations..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setReviewTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={submittingReview}>
                {submittingReview ? 'Saving Review...' : 'Save Manager Review'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
