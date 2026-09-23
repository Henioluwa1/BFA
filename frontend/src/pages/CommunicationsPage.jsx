import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import { communicationService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const COMMUNICATION_TYPES = [
  { value: 'OFFICIAL_ANNOUNCEMENT', label: '📢 Official Announcement' },
  { value: 'POLICY_UPDATE', label: '📜 Policy Update' },
  { value: 'STAFF_MEMO', label: '📝 Staff Memo' },
  { value: 'EMERGENCY_ALERT', label: '🚨 Emergency Alert' },
  { value: 'MAINTENANCE_NOTICE', label: '🔧 Maintenance Notice' },
  { value: 'SECURITY_DIRECTIVE', label: '🛡️ Security Directive' },
  { value: 'BOOKING_NOTICE', label: '📅 Booking Notice' },
  { value: 'FESTIVE_WELCOME', label: '🎉 Festive / Holiday Welcome' },
  { value: 'GENERAL_BROADCAST', label: '💬 General Broadcast' },
];

export default function CommunicationsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const userRole = (user?.role || '').toUpperCase();
  const canApprove = ['ADMIN', 'OWNER', 'SUPER_ADMIN'].includes(userRole);

  const [communications, setCommunications] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'approval_queue' | 'templates'

  // Modals
  const [composeOpen, setComposeOpen] = useState(false);
  const [viewDetailComm, setViewDetailComm] = useState(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState('APPROVE');
  const [reviewNotes, setReviewNotes] = useState('');

  // Form State
  const [form, setForm] = useState({
    title: '',
    type: 'OFFICIAL_ANNOUNCEMENT',
    priority: 'MEDIUM',
    content: '',
    recipientType: 'ALL_STAFF',
    targetRole: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [commsRes, templRes] = await Promise.all([
        communicationService.getAll(),
        communicationService.getTemplates().catch(() => ({ data: [] })),
      ]);
      setCommunications(commsRes.data || []);
      setTemplates(templRes.data || []);
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to load communications.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApplyTemplate = (tmplId) => {
    if (!tmplId) return;
    const tmpl = templates.find((t) => String(t.id) === String(tmplId));
    if (tmpl) {
      setForm((prev) => ({
        ...prev,
        title: tmpl.subject_template || prev.title,
        content: tmpl.body_template || prev.content,
        type: tmpl.type || prev.type,
      }));
      addToast(`Template "${tmpl.name}" applied.`, 'info');
    }
  };

  const handleCreateSubmit = async (submitForApproval = false) => {
    if (!form.title.trim() || !form.content.trim()) {
      addToast('Subject and body content are required.', 'warning');
      return;
    }

    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        priority: form.priority,
        content: form.content.trim(),
        recipients: [
          {
            recipientType: form.recipientType,
            recipientRole: form.targetRole || null,
          },
        ],
      };

      const res = await communicationService.create(payload);
      const newId = res.data?.id || res.data?.communicationId;

      if (submitForApproval && newId) {
        await communicationService.submit(newId);
        addToast('Communication submitted for managerial approval!', 'success');
      } else {
        addToast('Communication saved as draft.', 'success');
      }

      setComposeOpen(false);
      setForm({
        title: '',
        type: 'OFFICIAL_ANNOUNCEMENT',
        priority: 'MEDIUM',
        content: '',
        recipientType: 'ALL_STAFF',
        targetRole: '',
      });
      loadData();
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save communication.', 'error');
    }
  };

  const handleSendBroadcast = async (id) => {
    try {
      await communicationService.send(id);
      addToast(`Communication #${id} broadcasted successfully!`, 'success');
      loadData();
    } catch (err) {
      addToast(err.response?.data?.message || 'Broadcast failed.', 'error');
    }
  };

  const handleReview = async () => {
    try {
      if (reviewAction === 'APPROVE') {
        await communicationService.approve(viewDetailComm.id, { notes: reviewNotes });
        addToast(`Communication #${viewDetailComm.id} approved!`, 'success');
      } else {
        await communicationService.reject(viewDetailComm.id, { notes: reviewNotes });
        addToast(`Communication #${viewDetailComm.id} rejected.`, 'info');
      }
      setReviewModalOpen(false);
      setViewDetailComm(null);
      setReviewNotes('');
      loadData();
    } catch (err) {
      addToast(err.response?.data?.message || 'Review failed.', 'error');
    }
  };

  const pendingApprovals = communications.filter(
    (c) => c.status === 'PENDING_APPROVAL' || c.status === 'SUBMITTED'
  );

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✉️</span> Internal Communications & Announcements Platform
          </h1>
          <p className="page-subtitle">
            Enterprise broadcasting across 9 categories with role-governed approval workflows and template automation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </Button>
          <Button variant="primary" onClick={() => setComposeOpen(true)}>
            + Compose Communication
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-nav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          className={`btn ${activeTab === 'feed' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('feed')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          📬 Broadcast Feed ({communications.length})
        </button>
        <button
          className={`btn ${activeTab === 'approval_queue' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('approval_queue')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          ⏳ Approval Queue ({pendingApprovals.length})
        </button>
        <button
          className={`btn ${activeTab === 'templates' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('templates')}
          style={{ borderRadius: '6px 6px 0 0' }}
        >
          📑 Template Library ({templates.length})
        </button>
      </div>

      {/* TAB 1: Broadcast Feed */}
      {activeTab === 'feed' && (
        <Card title="Communications Log">
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject & Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Author</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {communications.map((comm) => (
                <tr key={comm.id}>
                  <td>#{comm.id}</td>
                  <td>
                    <strong>{comm.title}</strong>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {comm.type.replace(/_/g, ' ')}
                    </div>
                  </td>
                  <td>
                    <Badge
                      status={
                        comm.priority === 'CRITICAL'
                          ? 'danger'
                          : comm.priority === 'HIGH'
                          ? 'warning'
                          : 'neutral'
                      }
                    >
                      {comm.priority}
                    </Badge>
                  </td>
                  <td>
                    <Badge
                      status={
                        comm.status === 'SENT'
                          ? 'success'
                          : comm.status === 'APPROVED'
                          ? 'info'
                          : comm.status === 'PENDING_APPROVAL'
                          ? 'warning'
                          : comm.status === 'REJECTED'
                          ? 'danger'
                          : 'neutral'
                      }
                    >
                      {comm.status}
                    </Badge>
                  </td>
                  <td>{comm.author_name || 'Staff User'}</td>
                  <td>{new Date(comm.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setViewDetailComm(comm)}
                      >
                        View
                      </Button>
                      {comm.status === 'APPROVED' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleSendBroadcast(comm.id)}
                        >
                          Broadcast
                        </Button>
                      )}
                      {comm.status === 'DRAFT' && (
                        <Button
                          size="sm"
                          variant="info"
                          onClick={async () => {
                            await communicationService.submit(comm.id);
                            addToast(`Communication #${comm.id} submitted for review!`, 'success');
                            loadData();
                          }}
                        >
                          Submit
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {communications.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    No communications found.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {/* TAB 2: Approval Queue */}
      {activeTab === 'approval_queue' && (
        <Card title="Management Approval Queue">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Communications submitted by staff requiring review by Admin, Owner, or Super Admin before organization-wide broadcast.
          </p>

          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>Type</th>
                <th>Author</th>
                <th>Priority</th>
                <th>Submitted At</th>
                <th style={{ textAlign: 'right' }}>Review</th>
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.map((comm) => (
                <tr key={comm.id}>
                  <td>#{comm.id}</td>
                  <td><strong>{comm.title}</strong></td>
                  <td>{comm.type.replace(/_/g, ' ')}</td>
                  <td>{comm.author_name} ({comm.author_role})</td>
                  <td>
                    <Badge status={comm.priority === 'CRITICAL' ? 'danger' : 'warning'}>
                      {comm.priority}
                    </Badge>
                  </td>
                  <td>{new Date(comm.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {canApprove ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setViewDetailComm(comm);
                          setReviewModalOpen(true);
                        }}
                      >
                        Review
                      </Button>
                    ) : (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        Pending Manager
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {pendingApprovals.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    No communications currently pending approval.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {/* TAB 3: Templates */}
      {activeTab === 'templates' && (
        <Card title="Pre-Configured Communication Templates">
          <Table>
            <thead>
              <tr>
                <th>Template Name</th>
                <th>Category Type</th>
                <th>Subject Template</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tmpl) => (
                <tr key={tmpl.id}>
                  <td><strong>{tmpl.name}</strong></td>
                  <td><Badge status="info">{tmpl.type}</Badge></td>
                  <td><code>{tmpl.subject_template}</code></td>
                  <td>{new Date(tmpl.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* COMPOSE MODAL */}
      <Modal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Compose New Internal Communication"
      >
        <form onSubmit={(e) => e.preventDefault()}>
          {/* Template Selector */}
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Auto-Fill from Template (Optional)</label>
            <select
              className="form-control"
              onChange={(e) => handleApplyTemplate(e.target.value)}
              defaultValue=""
            >
              <option value="">-- Choose a standard template --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.type})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Communication Type *</label>
              <select
                className="form-control"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {COMMUNICATION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority Level *</label>
              <select
                className="form-control"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical Alert</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Subject / Title *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Notice of Scheduled Generator Maintenance"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Target Audience / Recipients</label>
            <select
              className="form-control"
              value={form.recipientType}
              onChange={(e) => setForm({ ...form, recipientType: e.target.value })}
            >
              <option value="ALL_STAFF">All Staff Members</option>
              <option value="MANAGERS_ONLY">Managers & Admins Only</option>
              <option value="RECEPTIONISTS_ONLY">Front Desk Receptionists Only</option>
              <option value="ALL">Entire Organization (All Roles)</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">Broadcast Content / Message *</label>
            <textarea
              className="form-control"
              rows={5}
              placeholder="Draft your communication content here..."
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button type="button" variant="secondary" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={() => handleCreateSubmit(false)}>
              Save Draft
            </Button>
            <Button type="button" variant="primary" onClick={() => handleCreateSubmit(true)}>
              Submit for Approval
            </Button>
          </div>
        </form>
      </Modal>

      {/* VIEW COMM DETAIL / REVIEW MODAL */}
      <Modal
        isOpen={!!viewDetailComm && !reviewModalOpen}
        onClose={() => setViewDetailComm(null)}
        title={viewDetailComm?.title || 'Communication Details'}
      >
        {viewDetailComm && (
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <Badge status="info">{viewDetailComm.type}</Badge>
              <Badge status="warning">{viewDetailComm.priority}</Badge>
              <Badge status="success">{viewDetailComm.status}</Badge>
            </div>
            <p><strong>Author:</strong> {viewDetailComm.author_name} ({viewDetailComm.author_role})</p>
            <p><strong>Date:</strong> {new Date(viewDetailComm.created_at).toLocaleString()}</p>
            <hr style={{ borderColor: 'var(--border-color)', margin: '1rem 0' }} />
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
              {viewDetailComm.content}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <Button variant="secondary" onClick={() => setViewDetailComm(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* REVIEW & APPROVAL MODAL */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title={`Review Communication: ${viewDetailComm?.title}`}
      >
        <div>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.25rem 0' }}><strong>Type:</strong> {viewDetailComm?.type}</p>
            <p style={{ margin: '0 0 0.25rem 0' }}><strong>Author:</strong> {viewDetailComm?.author_name}</p>
            <p style={{ margin: 0 }}><strong>Content:</strong> {viewDetailComm?.content}</p>
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Review Decision *</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="radio"
                  name="reviewAction"
                  value="APPROVE"
                  checked={reviewAction === 'APPROVE'}
                  onChange={() => setReviewAction('APPROVE')}
                />
                Approve for Broadcast
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="radio"
                  name="reviewAction"
                  value="REJECT"
                  checked={reviewAction === 'REJECT'}
                  onChange={() => setReviewAction('REJECT')}
                />
                Reject & Send Feedback
              </label>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label">Review Notes / Feedback</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Add feedback notes for the author..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={() => setReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'APPROVE' ? 'success' : 'danger'}
              onClick={handleReview}
            >
              {reviewAction === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
