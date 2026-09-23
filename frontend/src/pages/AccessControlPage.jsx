import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import { accessService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function AccessControlPage() {
  const { user, isSuperAdmin } = useAuth();
  const { addToast } = useToast();
  const userRole = (user?.role || '').toUpperCase();

  const [capabilities, setCapabilities] = useState([]);
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('capabilities'); // 'capabilities' | 'approvals' | 'overrides'

  // Modals
  const [selectedCap, setSelectedCap] = useState(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [justification, setJustification] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [targetAction, setTargetAction] = useState(true);

  // Review modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [capsRes, reqsRes, ovrRes] = await Promise.all([
        accessService.getCapabilities(),
        accessService.getApprovalRequests({ status: 'PENDING' }).catch(() => ({ data: [] })),
        accessService.getOverrides().catch(() => ({ data: [] })),
      ]);
      setCapabilities(capsRes.data || []);
      setApprovalRequests(reqsRes.data || []);
      setOverrides(ovrRes.data || []);
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load access control details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleClick = (cap) => {
    const nextStatus = !cap.is_enabled;
    setSelectedCap(cap);
    setTargetAction(nextStatus);

    // If capability is OWNER_RESTRICTED and user is not OWNER
    if (cap.restriction_level === 'OWNER_RESTRICTED' && userRole !== 'OWNER') {
      if (isSuperAdmin) {
        // Super Admin can either submit normal approval or use emergency force override
        setJustification('');
        setRequestModalOpen(true);
      } else {
        // Normal Admin/Manager must submit request to Owner
        setJustification('');
        setRequestModalOpen(true);
      }
      return;
    }

    // Direct toggle permitted
    executeToggle(cap.name, nextStatus);
  };

  const executeToggle = async (capabilityKey, isEnabled, reason = '') => {
    try {
      const res = await accessService.updateCapability(capabilityKey, {
        isEnabled,
        reason: reason || `Updated by ${userRole} (${user?.email})`,
      });

      if (res.data?.requiresApproval) {
        addToast(res.message || 'Approval request submitted to Owner.', 'info');
      } else {
        addToast(`Capability "${capabilityKey}" set to ${isEnabled ? 'ENABLED' : 'DISABLED'}.`, 'success');
      }
      loadData();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update capability.', 'error');
    }
  };

  const handleSendApprovalRequest = async (e) => {
    e.preventDefault();
    if (!justification.trim()) {
      addToast('Please provide a justification for this access modification.', 'warning');
      return;
    }

    await executeToggle(selectedCap.name, targetAction, justification);
    setRequestModalOpen(false);
    setJustification('');
  };

  const handleExecuteForceOverride = async (e) => {
    e.preventDefault();
    if (confirmPhrase.trim() !== 'CONFIRM_FORCE_OVERRIDE') {
      addToast('You must type CONFIRM_FORCE_OVERRIDE exactly.', 'error');
      return;
    }
    if (!justification.trim() || justification.trim().length < 10) {
      addToast('Emergency justification must be at least 10 characters.', 'warning');
      return;
    }

    try {
      await accessService.forceOverride({
        capabilityName: selectedCap.name,
        targetState: targetAction,
        justification: justification.trim(),
        confirmationPhrase: confirmPhrase.trim(),
      });
      addToast(`FORCE OVERRIDE applied to "${selectedCap.name}". Event logged with elevated audit.`, 'success');
      setOverrideModalOpen(false);
      setRequestModalOpen(false);
      setJustification('');
      setConfirmPhrase('');
      loadData();
    } catch (err) {
      addToast(err.response?.data?.message || 'Force override failed.', 'error');
    }
  };

  const handleReviewRequest = async (approved) => {
    try {
      await accessService.respondApprovalRequest(selectedRequest.id, {
        action: approved ? 'APPROVE' : 'REJECT',
        notes: reviewNotes.trim() || (approved ? 'Approved by Owner' : 'Rejected by Owner'),
      });
      addToast(`Request #${selectedRequest.id} has been ${approved ? 'APPROVED' : 'REJECTED'}.`, 'success');
      setReviewModalOpen(false);
      setSelectedRequest(null);
      setReviewNotes('');
      loadData();
    } catch (err) {
      addToast(err.response?.data?.message || 'Review response failed.', 'error');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🛡️</span> Access Control & Capability Engine
          </h1>
          <p className="page-subtitle">
            Authoritative capability toggles, Owner governance, and elevated Super Admin emergency overrides.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Badge status={isSuperAdmin ? 'danger' : userRole === 'OWNER' ? 'success' : 'primary'}>
            Authority Level: {userRole}
          </Badge>
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </Button>
        </div>
      </div>

      {/* Role Authority Hierarchy Banner */}
      <Card style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(20,24,33,0.9), rgba(15,23,42,0.95))' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h4 style={{ margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>System Role Hierarchy</h4>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              SUPER_ADMIN (Technical Authority) ➔ OWNER (Business Sovereign) ➔ MANAGER ➔ ADMIN ➔ RECEPTIONIST
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-danger">SUPER_ADMIN</span>
            <span className="badge badge-success">OWNER</span>
            <span className="badge badge-info">MANAGER</span>
            <span className="badge badge-primary">ADMIN</span>
            <span className="badge badge-neutral">RECEPTIONIST</span>
          </div>
        </div>
      </Card>

      {/* Navigation Tabs */}
      <div className="tab-nav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          className={`btn ${activeTab === 'capabilities' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('capabilities')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          ⚙️ Capabilities & Toggles ({capabilities.length})
        </button>
        <button
          className={`btn ${activeTab === 'approvals' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('approvals')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          📋 Pending Approvals ({approvalRequests.length})
        </button>
        <button
          className={`btn ${activeTab === 'overrides' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('overrides')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          🚨 Override Audit History ({overrides.length})
        </button>
      </div>

      {/* TAB 1: Capabilities */}
      {activeTab === 'capabilities' && (
        <Card title="Operational Capabilities">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Modify live operational switches across booking, payments, and property features. Modifications to OWNER_RESTRICTED policies require explicit Owner approval unless bypassed via Super Admin emergency procedure.
          </p>

          <Table>
            <thead>
              <tr>
                <th>Capability Key</th>
                <th>Description</th>
                <th>Restriction Policy</th>
                <th>Current Status</th>
                <th>Last Modified By</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((cap) => {
                const isRestricted = cap.restriction_level === 'OWNER_RESTRICTED';
                return (
                  <tr key={cap.id || cap.name}>
                    <td>
                      <strong style={{ fontFamily: 'monospace', color: 'var(--brand-accent)' }}>
                        {cap.name}
                      </strong>
                    </td>
                    <td>{cap.description || 'System operational capability'}</td>
                    <td>
                      <Badge status={isRestricted ? 'warning' : 'neutral'}>
                        {cap.restriction_level || 'NONE'}
                      </Badge>
                    </td>
                    <td>
                      <Badge status={cap.is_enabled ? 'success' : 'danger'}>
                        {cap.is_enabled ? 'ENABLED' : 'DISABLED'}
                      </Badge>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {cap.last_modified_by ? `${cap.last_modified_by} (${new Date(cap.updated_at).toLocaleDateString()})` : 'System Seed'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        size="sm"
                        variant={cap.is_enabled ? 'danger' : 'primary'}
                        onClick={() => handleToggleClick(cap)}
                      >
                        {cap.is_enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {capabilities.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                    No capabilities registered.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {/* TAB 2: Owner Approval Queue */}
      {activeTab === 'approvals' && (
        <Card title="Pending Access Approval Requests">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Privileged capability updates submitted to the property Owner for official review.
          </p>

          <Table>
            <thead>
              <tr>
                <th>Req ID</th>
                <th>Capability</th>
                <th>Requested State</th>
                <th>Submitted By</th>
                <th>Justification</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Review</th>
              </tr>
            </thead>
            <tbody>
              {approvalRequests.map((req) => (
                <tr key={req.id}>
                  <td>#{req.id}</td>
                  <td><strong>{req.capability_name}</strong></td>
                  <td>
                    <Badge status={req.target_state ? 'success' : 'danger'}>
                      {req.target_state ? 'ENABLE' : 'DISABLE'}
                    </Badge>
                  </td>
                  <td>{req.requester_name || req.requester_email} ({req.requester_role})</td>
                  <td style={{ maxWidth: '280px', wordBreak: 'break-word' }}>{req.justification}</td>
                  <td>{new Date(req.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {['OWNER', 'SUPER_ADMIN'].includes(userRole) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedRequest(req);
                          setReviewNotes('');
                          setReviewModalOpen(true);
                        }}
                      >
                        Review
                      </Button>
                    ) : (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Awaiting Owner</span>
                    )}
                  </td>
                </tr>
              ))}
              {approvalRequests.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    No pending approval requests.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {/* TAB 3: Overrides History */}
      {activeTab === 'overrides' && (
        <Card title="Emergency Force Override Audit Log">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Permanent record of emergency overrides enacted under Super Admin authority.
          </p>

          <Table>
            <thead>
              <tr>
                <th>Override ID</th>
                <th>Capability</th>
                <th>Enacted State</th>
                <th>Super Admin</th>
                <th>Justification</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map((ovr) => (
                <tr key={ovr.id}>
                  <td>#{ovr.id}</td>
                  <td><strong style={{ color: 'var(--brand-accent)' }}>{ovr.capability_name}</strong></td>
                  <td>
                    <Badge status={ovr.target_state ? 'success' : 'danger'}>
                      {ovr.target_state ? 'ENABLED' : 'DISABLED'}
                    </Badge>
                  </td>
                  <td>{ovr.actor_email} ({ovr.actor_role})</td>
                  <td style={{ maxWidth: '300px' }}>{ovr.justification}</td>
                  <td>{new Date(ovr.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {overrides.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                    No emergency overrides recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {/* MODAL 1: Request Owner Approval */}
      <Modal
        isOpen={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        title={`Owner Approval Required: ${selectedCap?.name}`}
      >
        <form onSubmit={handleSendApprovalRequest}>
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              This capability is governed by <strong>OWNER_RESTRICTED</strong> policy. To {targetAction ? 'enable' : 'disable'} this capability, please provide a business reason. A notification will be dispatched to the Owner.
            </p>
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Business Justification / Reason *</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Provide context for this policy modification..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {isSuperAdmin && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  setRequestModalOpen(false);
                  setConfirmPhrase('');
                  setOverrideModalOpen(true);
                }}
              >
                🚨 Emergency Force Override
              </Button>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
              <Button type="button" variant="secondary" onClick={() => setRequestModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Submit Request
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Super Admin Emergency Force Override */}
      <Modal
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        title="🚨 CONFIRM EMERGENCY FORCE OVERRIDE"
      >
        <form onSubmit={handleExecuteForceOverride}>
          <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.15)', borderLeft: '4px solid #ef4444', borderRadius: '4px', marginBottom: '1rem' }}>
            <strong style={{ color: '#ef4444', display: 'block', marginBottom: '0.25rem' }}>
              SUPER ADMIN PRIVILEGED OVERRIDE
            </strong>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              This action bypasses standard Owner approval. It is logged in high-priority security audit trails and broadcasts immediate alerts to management.
            </p>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>Emergency Justification *</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="State the technical or operational incident necessitating this emergency bypass..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ fontWeight: 600 }}>
              Confirmation Phrase: Type <code style={{ color: '#ef4444', background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '3px' }}>CONFIRM_FORCE_OVERRIDE</code>
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="CONFIRM_FORCE_OVERRIDE"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button type="button" variant="secondary" onClick={() => setOverrideModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={confirmPhrase !== 'CONFIRM_FORCE_OVERRIDE' || !justification.trim()}
            >
              Enact Force Override
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Review Request (Owner) */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title={`Review Request #${selectedRequest?.id}`}
      >
        <div>
          <p><strong>Capability:</strong> {selectedRequest?.capability_name}</p>
          <p><strong>Proposed State:</strong> {selectedRequest?.target_state ? 'ENABLED' : 'DISABLED'}</p>
          <p><strong>Requester:</strong> {selectedRequest?.requester_name} ({selectedRequest?.requester_role})</p>
          <p><strong>Justification:</strong> {selectedRequest?.justification}</p>

          <div className="form-group" style={{ margin: '1rem 0' }}>
            <label className="form-label">Reviewer Notes (Optional)</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="Add review feedback..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button type="button" variant="secondary" onClick={() => setReviewModalOpen(false)}>
              Close
            </Button>
            <Button type="button" variant="danger" onClick={() => handleReviewRequest(false)}>
              Reject
            </Button>
            <Button type="button" variant="success" onClick={() => handleReviewRequest(true)}>
              Approve
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
