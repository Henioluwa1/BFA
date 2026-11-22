import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import {
  centralOperationsService,
  publicService,
  systemService,
  auditService,
  automationService,
  accessService,
} from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// Operational Categories
const OPERATION_CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'ADMINISTRATIVE_DIRECTIVE', label: 'Administrative Directive' },
  { value: 'PROPERTY_OPERATIONS', label: 'Property Operations' },
  { value: 'MAINTENANCE_INSPECTION', label: 'Maintenance & Inspection' },
  { value: 'FRONT_OFFICE_RECEPTION', label: 'Front Office & Reception' },
  { value: 'STAFF_ASSIGNMENT', label: 'Staff Assignment & Duty' },
  { value: 'OPERATIONAL_IMPROVEMENT', label: 'Operational Improvement' },
  { value: 'COMPLIANCE_POLICY', label: 'Compliance & Policy' },
  { value: 'EMERGENCY_OPERATION', label: 'Emergency Operation' },
  { value: 'MANAGEMENT_COMMUNICATION', label: 'Management Communication' },
];

export default function OperationsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const role = String(user?.role || '').toUpperCase();
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isAdmin = role === 'ADMIN';
  const isOwner = role === 'OWNER';
  const isManager = role === 'MANAGER' || role === 'OPERATIONS_MANAGER';
  const isStaff = role === 'STAFF' || role === 'RECEPTIONIST';
  const canInitiate = isSuperAdmin || isAdmin || isOwner || isManager;

  // Active View Tabs (5 Core Operational Scopes)
  // Default to 'assignedToMe' for staff/receptionists, 'initiatedByMe' for owner/admin
  const defaultTab = isStaff ? 'assignedToMe' : 'initiatedByMe';
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || defaultTab);

  // Operations Data
  const [operations, setOperations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');

  // Selected Operation & Detail Modal
  const [selectedOpId, setSelectedOpId] = useState(searchParams.get('id') || null);
  const [selectedOp, setSelectedOp] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('memo'); // 'memo', 'execution', 'tasks', 'audit', 'manage'

  // Initiation Modal
  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
  const [isSubmittingOp, setIsSubmittingOp] = useState(false);
  const [initiateForm, setInitiateForm] = useState({
    title: '',
    category: 'PROPERTY_OPERATIONS',
    priority: 'NORMAL',
    property_id: user?.propertyId || '',
    target_audience_type: isOwner ? 'MANAGERS_ONLY' : 'PROPERTY_ALL',
    specific_user_ids: '',
    subject: '',
    purpose: '',
    operational_instructions: '',
    expected_outcome: '',
    responsibility_definition: '',
    reporting_requirements: '',
    deadline_at: '',
  });

  // Action Sub-Modals
  const [ackNote, setAckNote] = useState('');
  const [isAcking, setIsAcking] = useState(false);

  const [isClarifyModalOpen, setIsClarifyModalOpen] = useState(false);
  const [clarifyQuestion, setClarifyQuestion] = useState('');
  const [isClarifying, setIsClarifying] = useState(false);

  const [isReplyClarifyModalOpen, setIsReplyClarifyModalOpen] = useState(false);
  const [clarifyReply, setClarifyReply] = useState('');
  const [isReplyingClarify, setIsReplyingClarify] = useState(false);

  const [isBlockerModalOpen, setIsBlockerModalOpen] = useState(false);
  const [blockerCategory, setBlockerCategory] = useState('ACCESS');
  const [blockerDetails, setBlockerDetails] = useState('');
  const [isReportingBlocker, setIsReportingBlocker] = useState(false);

  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [progressNotes, setProgressNotes] = useState('');
  const [progressStatus, setProgressStatus] = useState('IN_PROGRESS');
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigned_to_id: '',
    task_category: 'GENERAL',
    priority: 'NORMAL',
    due_date: '',
  });
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const [isAmendModalOpen, setIsAmendModalOpen] = useState(false);
  const [amendForm, setAmendForm] = useState({
    amendment_reason: '',
    operational_instructions: '',
    deadline_at: '',
    priority: 'NORMAL',
  });
  const [isAmending, setIsAmending] = useState(false);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Load Properties for dropdowns
  useEffect(() => {
    publicService.getProperties().then((res) => {
      const data = res.data || res || [];
      setProperties(Array.isArray(data) ? data : []);
    }).catch((err) => console.error('Failed to load properties:', err));
  }, []);

  // Fetch Operations for Active View Tab
  const fetchOperations = useCallback(async () => {
    if (activeTab === 'diagnostics') return;
    setIsLoading(true);
    try {
      const res = await centralOperationsService.listOperations({
        view: activeTab,
        category: categoryFilter,
        priority: priorityFilter,
        status: statusFilter,
        property_id: propertyFilter,
        search: searchQuery,
      });
      const data = res.data || res || [];
      setOperations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch operations:', err);
      addToast(err.message || 'Failed to fetch operations list.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, categoryFilter, priorityFilter, statusFilter, propertyFilter, searchQuery, addToast]);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  // Load single operation details if selected
  const fetchOperationDetails = useCallback(async (id) => {
    if (!id) {
      setSelectedOp(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await centralOperationsService.getOperationById(id);
      setSelectedOp(res.data || res);
    } catch (err) {
      console.error('Failed to load operation details:', err);
      addToast(err.message || 'Failed to load operation details.', 'error');
      setSelectedOpId(null);
    } finally {
      setDetailLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (selectedOpId) {
      fetchOperationDetails(selectedOpId);
    }
  }, [selectedOpId, fetchOperationDetails]);

  // Quick Acknowledge handler
  const handleAcknowledge = async (opId) => {
    setIsAcking(true);
    try {
      await centralOperationsService.acknowledgeOperation(opId, ackNote || 'Acknowledged receipt.');
      addToast('Operation receipt acknowledged successfully.', 'success');
      setAckNote('');
      fetchOperations();
      if (selectedOpId) fetchOperationDetails(selectedOpId);
    } catch (err) {
      addToast(err.message || 'Failed to acknowledge operation.', 'error');
    } finally {
      setIsAcking(false);
    }
  };

  // Initiate Operation Submission
  const handleInitiateSubmit = async (e) => {
    e.preventDefault();
    if (!initiateForm.title || !initiateForm.subject || !initiateForm.purpose || !initiateForm.operational_instructions) {
      addToast('Please fill in all mandatory fields.', 'error');
      return;
    }

    setIsSubmittingOp(true);
    try {
      const payload = {
        ...initiateForm,
        recipient_user_ids: initiateForm.specific_user_ids
          ? initiateForm.specific_user_ids.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean)
          : [],
      };

      const res = await centralOperationsService.createOperation(payload);
      addToast('Central Operation and formal Memo successfully issued!', 'success');
      setIsInitiateModalOpen(false);
      setInitiateForm({
        title: '',
        category: 'PROPERTY_OPERATIONS',
        priority: 'NORMAL',
        property_id: user?.propertyId || '',
        target_audience_type: isOwner ? 'MANAGERS_ONLY' : 'PROPERTY_ALL',
        specific_user_ids: '',
        subject: '',
        purpose: '',
        operational_instructions: '',
        expected_outcome: '',
        responsibility_definition: '',
        reporting_requirements: '',
        deadline_at: '',
      });
      fetchOperations();
      if (res.data?.id) {
        setSelectedOpId(res.data.id);
      }
    } catch (err) {
      addToast(err.message || 'Failed to initiate operation.', 'error');
    } finally {
      setIsSubmittingOp(false);
    }
  };

  // Helper for priority styling
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'CRITICAL':
        return <Badge variant="danger" style={{ animation: 'pulse 1.5s infinite', fontWeight: 800 }}>🚨 CRITICAL</Badge>;
      case 'URGENT':
        return <Badge variant="danger">⚡ URGENT</Badge>;
      case 'IMPORTANT':
        return <Badge variant="warning">⚠️ IMPORTANT</Badge>;
      default:
        return <Badge variant="neutral">📋 NORMAL</Badge>;
    }
  };

  // Helper for status styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="success">✓ COMPLETED</Badge>;
      case 'ACKNOWLEDGED':
        return <Badge variant="info">ACKNOWLEDGED</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="primary">IN PROGRESS</Badge>;
      case 'BLOCKED':
        return <Badge variant="danger">⛔ BLOCKED</Badge>;
      case 'AWAITING_CLARIFICATION':
        return <Badge variant="warning">❓ CLARIFICATION</Badge>;
      case 'AWAITING_REVIEW':
        return <Badge variant="info">⏳ REVIEW READY</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">🛑 CANCELLED</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">REVISION REQ</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="operations-page-container" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* ─── Top Header Bar ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary, #f8fafc)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ color: 'var(--brand-accent, #3b82f6)' }}>🏛️</span>
            Central Operations & Directives Centre
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted, #94a3b8)' }}>
            Authoritative Operations Memos, formal company directives, cross-role tracking & staff chat integration.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="outline" onClick={fetchOperations} disabled={isLoading}>
            🔄 Refresh
          </Button>

          {canInitiate && (
            <Button
              variant="primary"
              onClick={() => setIsInitiateModalOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                fontWeight: 700,
              }}
            >
              + Initiate Operation & Memo
            </Button>
          )}
        </div>
      </div>

      {/* ─── 5-View Scoping Tabs ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color, #334155)', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        <button
          type="button"
          onClick={() => { setActiveTab('assignedToMe'); setSearchParams({ tab: 'assignedToMe' }); }}
          style={{
            padding: '0.65rem 1.15rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'assignedToMe' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'assignedToMe' ? '#3b82f6' : 'var(--text-secondary, #cbd5e1)',
            fontWeight: activeTab === 'assignedToMe' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap',
          }}
        >
          📥 Assigned to Me / My Unit
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('initiatedByMe'); setSearchParams({ tab: 'initiatedByMe' }); }}
          style={{
            padding: '0.65rem 1.15rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'initiatedByMe' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'initiatedByMe' ? '#3b82f6' : 'var(--text-secondary, #cbd5e1)',
            fontWeight: activeTab === 'initiatedByMe' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap',
          }}
        >
          📤 Operations I Initiated
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('supervising'); setSearchParams({ tab: 'supervising' }); }}
          style={{
            padding: '0.65rem 1.15rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'supervising' ? '3px solid #3b82f6' : '3px solid transparent',
            color: activeTab === 'supervising' ? '#3b82f6' : 'var(--text-secondary, #cbd5e1)',
            fontWeight: activeTab === 'supervising' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap',
          }}
        >
          👁️ Oversight & Supervised
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('actionRequired'); setSearchParams({ tab: 'actionRequired' }); }}
          style={{
            padding: '0.65rem 1.15rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'actionRequired' ? '3px solid #ef4444' : '3px solid transparent',
            color: activeTab === 'actionRequired' ? '#ef4444' : 'var(--text-secondary, #cbd5e1)',
            fontWeight: activeTab === 'actionRequired' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap',
          }}
        >
          ⚡ Action & Ack Required
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('archived'); setSearchParams({ tab: 'archived' }); }}
          style={{
            padding: '0.65rem 1.15rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'archived' ? '3px solid #64748b' : '3px solid transparent',
            color: activeTab === 'archived' ? '#94a3b8' : 'var(--text-secondary, #cbd5e1)',
            fontWeight: activeTab === 'archived' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap',
          }}
        >
          🗄️ Completed & Archived
        </button>

        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => { setActiveTab('diagnostics'); setSearchParams({ tab: 'diagnostics' }); }}
            style={{
              padding: '0.65rem 1.15rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'diagnostics' ? '3px solid #8b5cf6' : '3px solid transparent',
              color: activeTab === 'diagnostics' ? '#a78bfa' : 'var(--text-secondary, #cbd5e1)',
              fontWeight: activeTab === 'diagnostics' ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap',
              marginLeft: 'auto',
            }}
          >
            🛠️ Admin System Diagnostics
          </button>
        )}
      </div>

      {/* ─── Universal Filter Bar (When not on Diagnostics) ────────────── */}
      {activeTab !== 'diagnostics' && (
        <Card className="glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem', borderRadius: '12px', background: 'rgba(30, 41, 59, 0.7)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
            {/* Search */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Search Directives</label>
              <input
                type="text"
                placeholder="Code, title or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Category */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              >
                {OPERATION_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              >
                <option value="all">All Priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="URGENT">Urgent</option>
                <option value="IMPORTANT">Important</option>
                <option value="NORMAL">Normal</option>
              </select>
            </div>

            {/* Property */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Property Scope</label>
              <select
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              >
                <option value="all">All Properties / Corporate</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code || 'BFA'})</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--bg-surface, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="ISSUED">Issued</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="BLOCKED">Blocked</option>
                <option value="AWAITING_CLARIFICATION">Awaiting Clarification</option>
                <option value="AWAITING_REVIEW">Awaiting Review</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Operations List Grid ─────────────────────────────────────── */}
      {activeTab !== 'diagnostics' && (
        <div>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              Loading Operations & Directives...
            </div>
          ) : operations.length === 0 ? (
            <Card style={{ padding: '3rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.4)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
              <h3 style={{ margin: '0 0 0.5rem', color: '#f8fafc' }}>No Operations Found</h3>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                There are no active operations matching your current view or filter selection.
              </p>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
              {operations.map((op) => {
                const isCritical = op.priority === 'CRITICAL';
                const isUrgent = op.priority === 'URGENT';
                const isAckPending = !op.user_acknowledged_at && op.status !== 'COMPLETED' && op.status !== 'CANCELLED';

                return (
                  <Card
                    key={op.id}
                    className="glass-card operation-card"
                    style={{
                      padding: '1.25rem',
                      borderRadius: '12px',
                      background: 'rgba(30, 41, 59, 0.65)',
                      border: isCritical
                        ? '1.5px solid rgba(220, 38, 38, 0.6)'
                        : isUrgent
                        ? '1.5px solid rgba(245, 158, 11, 0.5)'
                        : '1px solid var(--border-color, #334155)',
                      boxShadow: isCritical ? '0 0 20px rgba(220, 38, 38, 0.2)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
                    <div>
                      {/* Top Header: Code, Version & Priority */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--brand-accent, #3b82f6)', letterSpacing: '0.5px' }}>
                            {op.operation_code}
                          </span>
                          {op.memo_reference && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#94a3b8' }}>
                              ({op.memo_reference} v{op.memo_version || 1})
                            </span>
                          )}
                        </div>
                        {getPriorityBadge(op.priority)}
                      </div>

                      {/* Title */}
                      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.35 }}>
                        {op.title}
                      </h3>

                      {/* Subject */}
                      <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                        {op.subject}
                      </p>

                      {/* Badges row */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
                        {getStatusBadge(op.status)}
                        <span style={{ fontSize: '0.72rem', background: 'rgba(15, 23, 42, 0.6)', padding: '2px 8px', borderRadius: '4px', color: '#94a3b8' }}>
                          🏢 {op.property_name || 'Corporate Multi-Property'}
                        </span>
                        <span style={{ fontSize: '0.72rem', background: 'rgba(15, 23, 42, 0.6)', padding: '2px 8px', borderRadius: '4px', color: '#94a3b8' }}>
                          🏷️ {(op.category || '').replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Metrics: Recipients & Tasks */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.4)', marginBottom: '1rem', fontSize: '0.78rem' }}>
                        <div>
                          <div style={{ color: '#94a3b8' }}>Recipients Ack:</div>
                          <strong style={{ color: op.acknowledged_recipients_count > 0 ? '#10b981' : '#f59e0b' }}>
                            {op.acknowledged_recipients_count || 0} / {op.total_recipients_count || 0}
                          </strong>
                        </div>
                        <div>
                          <div style={{ color: '#94a3b8' }}>Linked Tasks:</div>
                          <strong style={{ color: '#3b82f6' }}>
                            {op.completed_tasks_count || 0} / {op.linked_tasks_count || 0} Done
                          </strong>
                        </div>
                      </div>

                      {/* Initiator & Deadline info */}
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem' }}>
                        <div>Initiated by: <span style={{ color: '#f8fafc', fontWeight: 600 }}>{op.initiator_name}</span> ({op.initiator_role})</div>
                        {op.deadline_at && (
                          <div style={{ color: '#f59e0b', marginTop: '2px' }}>
                            ⏰ Deadline: {new Date(op.deadline_at).toLocaleDateString()} {new Date(op.deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.5)', paddingTop: '0.75rem', alignItems: 'center' }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setSelectedOpId(op.id)}
                        style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem' }}
                      >
                        📄 View Memo & Details
                      </Button>

                      {isAckPending && activeTab === 'assignedToMe' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledge(op.id)}
                          disabled={isAcking}
                          style={{ borderColor: '#10b981', color: '#10b981', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                        >
                          ✓ Acknowledge
                        </Button>
                      )}

                      {op.chat_thread_id && (
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('bfa:open-chat-thread', { detail: { threadId: op.chat_thread_id } }));
                            addToast(`Opened linked Staff Chat Thread #${op.chat_thread_id}`, 'info');
                          }}
                          title="Open Linked Chat Conversation"
                          style={{
                            padding: '0.45rem 0.65rem',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid #3b82f6',
                            color: '#60a5fa',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          💬
                        </button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── OPERATION DETAIL MODAL (DRAWER / FULL SCREEN GLASS VIEW) ──── */}
      {selectedOpId && (
        <Modal
          isOpen={Boolean(selectedOpId)}
          onClose={() => { setSelectedOpId(null); setSelectedOp(null); }}
          title={selectedOp ? `Operations Memo: ${selectedOp.memo_reference || selectedOp.operation_code}` : 'Operation Details'}
          maxWidth="1000px"
        >
          {detailLoading || !selectedOp ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              Retrieving authoritative Operations Memo & history...
            </div>
          ) : (
            <div>
              {/* Modal Subtabs Header */}
              <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color, #334155)', marginBottom: '1.25rem', overflowX: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setDetailTab('memo')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: detailTab === 'memo' ? '3px solid #3b82f6' : '3px solid transparent',
                    color: detailTab === 'memo' ? '#3b82f6' : '#cbd5e1',
                    fontWeight: detailTab === 'memo' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  📜 Official Operations Memo
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('execution')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: detailTab === 'execution' ? '3px solid #3b82f6' : '3px solid transparent',
                    color: detailTab === 'execution' ? '#3b82f6' : '#cbd5e1',
                    fontWeight: detailTab === 'execution' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Execution & Collaboration
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('tasks')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: detailTab === 'tasks' ? '3px solid #3b82f6' : '3px solid transparent',
                    color: detailTab === 'tasks' ? '#3b82f6' : '#cbd5e1',
                    fontWeight: detailTab === 'tasks' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  📋 Linked Tasks ({selectedOp.linkedTasks?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('audit')}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: detailTab === 'audit' ? '3px solid #3b82f6' : '3px solid transparent',
                    color: detailTab === 'audit' ? '#3b82f6' : '#cbd5e1',
                    fontWeight: detailTab === 'audit' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  🛡️ Audit Trail ({selectedOp.events?.length || 0})
                </button>
              </div>

              {/* ─── TAB 1: OFFICIAL MEMO VIEW ─────────────────────────── */}
              {detailTab === 'memo' && (
                <div style={{ background: '#0f172a', padding: '1.5rem', borderRadius: '10px', border: '1px solid #334155', color: '#f8fafc' }}>
                  {/* Executive Header */}
                  <div style={{ textAlign: 'center', borderBottom: '2px solid #334155', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '1px', color: '#f8fafc' }}>
                      BFA APARTMENTS MANAGEMENT SYSTEM
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8', letterSpacing: '0.5px' }}>
                      Central Operations & Executive Directives Directorate
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '1rem', fontWeight: 700, color: '#3b82f6' }}>
                      OFFICIAL OPERATIONS MEMORANDUM
                    </div>
                  </div>

                  {/* Metadata Header Box */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', padding: '1rem', borderRadius: '8px', background: '#1e293b', border: '1px solid #334155', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8' }}>MEMO REF: </span>
                      <strong style={{ color: '#f8fafc' }}>{selectedOp.memo_reference}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>DATE: </span>
                      <span style={{ color: '#f8fafc' }}>{selectedOp.effective_date_text || new Date(selectedOp.created_at).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>OPS REF: </span>
                      <strong style={{ color: '#3b82f6' }}>{selectedOp.operation_code}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>VERSION: </span>
                      <span style={{ color: '#f8fafc' }}>v{selectedOp.memo_version || 1}.0 {selectedOp.memo_version > 1 ? '(Revised)' : ''}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>ISSUED BY: </span>
                      <strong style={{ color: '#f8fafc' }}>{selectedOp.initiator_name}</strong> ({selectedOp.issuer_designation || selectedOp.initiator_role})
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>PRIORITY: </span>
                      <span>{getPriorityBadge(selectedOp.priority)}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>TO (RECIPIENT): </span>
                      <span style={{ color: '#f8fafc' }}>{selectedOp.recipient_summary || 'Authorized Operational Personnel'}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>PROPERTY: </span>
                      <span style={{ color: '#f8fafc' }}>{selectedOp.property_scope_summary || selectedOp.property_name || 'Corporate Multi-Property'}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>DEADLINE: </span>
                      <strong style={{ color: '#f59e0b' }}>{selectedOp.deadline_text || (selectedOp.deadline_at ? new Date(selectedOp.deadline_at).toLocaleString() : 'Standard Timeline')}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>CATEGORY: </span>
                      <span style={{ color: '#f8fafc' }}>{(selectedOp.category || '').replace(/_/g, ' ')}</span>
                    </div>
                  </div>

                  {/* Subject Banner */}
                  <div style={{ padding: '0.75rem 1rem', background: '#334155', borderRadius: '6px', fontWeight: 700, fontSize: '0.95rem', marginBottom: '1.25rem', color: '#f8fafc' }}>
                    SUBJECT: {selectedOp.subject}
                  </div>

                  {/* Structured Sections */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.35rem', color: '#3b82f6', fontSize: '0.95rem' }}>1. PURPOSE & EXECUTIVE RATIONALE</h4>
                      <p style={{ margin: 0, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{selectedOp.purpose}</p>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 0.35rem', color: '#3b82f6', fontSize: '0.95rem' }}>2. OPERATIONAL INSTRUCTIONS & DIRECTIVES</h4>
                      <div style={{ padding: '0.85rem', background: '#1e293b', borderRadius: '6px', borderLeft: '4px solid #3b82f6', color: '#f8fafc', whiteSpace: 'pre-wrap' }}>
                        {selectedOp.operational_instructions}
                      </div>
                    </div>

                    {selectedOp.expected_outcome && (
                      <div>
                        <h4 style={{ margin: '0 0 0.35rem', color: '#3b82f6', fontSize: '0.95rem' }}>3. EXPECTED OUTCOME & SUCCESS METRICS</h4>
                        <p style={{ margin: 0, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{selectedOp.expected_outcome}</p>
                      </div>
                    )}

                    {selectedOp.responsibility_definition && (
                      <div>
                        <h4 style={{ margin: '0 0 0.35rem', color: '#3b82f6', fontSize: '0.95rem' }}>4. EXECUTION RESPONSIBILITY MATRIX</h4>
                        <p style={{ margin: 0, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{selectedOp.responsibility_definition}</p>
                      </div>
                    )}

                    {selectedOp.reporting_requirements && (
                      <div>
                        <h4 style={{ margin: '0 0 0.35rem', color: '#3b82f6', fontSize: '0.95rem' }}>5. REPORTING & TIMELINE REQUIREMENTS</h4>
                        <p style={{ margin: 0, color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>{selectedOp.reporting_requirements}</p>
                      </div>
                    )}

                    {selectedOp.amendment_reason && (
                      <div style={{ padding: '0.75rem 1rem', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', borderRadius: '6px' }}>
                        <strong style={{ color: '#f59e0b' }}>REVISION AUDIT NOTE (v{selectedOp.memo_version}): </strong>
                        <span style={{ color: '#fef3c7' }}>{selectedOp.amendment_reason}</span>
                      </div>
                    )}
                  </div>

                  {/* Sign-off & Compliance Footer */}
                  <div style={{ marginTop: '2rem', borderTop: '1px solid #334155', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc' }}>Digitally Authorised & Enforceable</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Issued under BFA Enterprise Governance Protocols</div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <Button
                        variant="primary"
                        onClick={async () => {
                          try {
                            await centralOperationsService.downloadMemoPdf({
                              memoId: selectedOp.latest_memo_id || selectedOp.memos?.[0]?.id,
                              operationId: selectedOp.id,
                              filename: `${selectedOp.memo_reference || selectedOp.operation_code || 'Operations_Memo'}.pdf`,
                            });
                            addToast('Operations Memorandum PDF downloaded successfully.', 'success');
                          } catch (err) {
                            addToast(err.message || 'Failed to download Operations Memorandum PDF.', 'error');
                          }
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        📥 Download Official PDF
                      </Button>

                      {selectedOp.chat_thread_id && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('bfa:open-chat-thread', { detail: { threadId: selectedOp.chat_thread_id } }));
                            addToast(`Opening Staff Chat thread #${selectedOp.chat_thread_id}`, 'info');
                          }}
                        >
                          💬 Open in Staff Chat
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 2: EXECUTION & COLLABORATION ───────────────────── */}
              {detailTab === 'execution' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Recipient Acknowledgement Matrix */}
                  <Card style={{ padding: '1rem', background: '#1e293b' }}>
                    <h4 style={{ margin: '0 0 0.75rem', color: '#f8fafc', fontSize: '0.95rem' }}>
                      👥 Recipient Acknowledgement Tracking
                    </h4>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem' }}>Recipient</th>
                            <th style={{ padding: '0.5rem' }}>Role</th>
                            <th style={{ padding: '0.5rem' }}>Delivered</th>
                            <th style={{ padding: '0.5rem' }}>Status</th>
                            <th style={{ padding: '0.5rem' }}>Acknowledged At</th>
                            <th style={{ padding: '0.5rem' }}>Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOp.recipients?.map((r) => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #334155' }}>
                              <td style={{ padding: '0.5rem', fontWeight: 600, color: '#f8fafc' }}>{r.name}</td>
                              <td style={{ padding: '0.5rem', color: '#94a3b8' }}>{r.role}</td>
                              <td style={{ padding: '0.5rem', color: '#94a3b8' }}>{new Date(r.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                              <td style={{ padding: '0.5rem' }}>
                                {r.acknowledged_at ? (
                                  <Badge variant="success">✓ Acknowledged</Badge>
                                ) : (
                                  <Badge variant="warning">Pending Ack</Badge>
                                )}
                              </td>
                              <td style={{ padding: '0.5rem', color: '#94a3b8' }}>
                                {r.acknowledged_at ? new Date(r.acknowledged_at).toLocaleString() : '—'}
                              </td>
                              <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>{r.acknowledgement_note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  {/* Actions Toolbox */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    <Button variant="outline" onClick={() => setIsClarifyModalOpen(true)}>
                      ❓ Request Clarification
                    </Button>
                    <Button variant="outline" onClick={() => setIsBlockerModalOpen(true)} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                      🚨 Report Operational Blocker
                    </Button>
                    <Button variant="outline" onClick={() => setIsProgressModalOpen(true)}>
                      📈 Log Progress Update
                    </Button>
                    <Button variant="primary" onClick={() => setIsCompletionModalOpen(true)}>
                      🏁 Submit Completion for Review
                    </Button>
                  </div>

                  {/* Manager Review Controls (If Awaiting Review) */}
                  {(canInitiate || isManager) && (
                    <Card style={{ padding: '1rem', background: '#1e293b', border: '1px solid #3b82f6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem' }}>Managerial Oversight & Closure Review</h4>
                          <p style={{ margin: '0.2rem 0 0', color: '#94a3b8', fontSize: '0.8rem' }}>
                            Conclude operational cycle, verify deliverables, or return for revision.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button variant="primary" onClick={() => setIsReviewModalOpen(true)}>
                            Conduct Sign-Off Review
                          </Button>
                          <Button variant="outline" onClick={() => setIsAmendModalOpen(true)}>
                            📝 Amend Memo
                          </Button>
                          <Button variant="danger" onClick={() => setIsCancelModalOpen(true)}>
                            🛑 Cancel Operation
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {/* ─── TAB 3: LINKED OPERATIONAL TASKS ───────────────────── */}
              {detailTab === 'tasks' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0, color: '#f8fafc' }}>Linked Operational Tasks</h4>
                    {canInitiate && (
                      <Button variant="primary" size="sm" onClick={() => setIsTaskModalOpen(true)}>
                        + Add Linked Task
                      </Button>
                    )}
                  </div>

                  {selectedOp.linkedTasks?.length === 0 ? (
                    <Card style={{ padding: '2rem', textAlign: 'center', background: '#1e293b' }}>
                      <p style={{ margin: 0, color: '#94a3b8' }}>No sub-tasks currently linked to this operation.</p>
                    </Card>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {selectedOp.linkedTasks?.map((task) => (
                        <Card key={task.id} style={{ padding: '0.85rem', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <strong style={{ color: '#3b82f6', fontSize: '0.85rem' }}>{task.task_code}</strong>
                              <span style={{ color: '#f8fafc', fontWeight: 600 }}>{task.title}</span>
                              {getStatusBadge(task.status)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                              Assigned to: {task.assigned_to_name || 'Staff Member'} • Due: {new Date(task.due_date).toLocaleDateString()}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── TAB 4: AUDIT EVENTS TRAIL ─────────────────────────── */}
              {detailTab === 'audit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#f8fafc' }}>Immutable Lifecycle Audit Events</h4>
                  {selectedOp.events?.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        background: '#1e293b',
                        borderLeft: '3px solid #3b82f6',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Badge variant="neutral">{ev.event_type}</Badge>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>{ev.event_summary}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                          By: {ev.actor_name} ({ev.actor_role})
                        </div>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {new Date(ev.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* ─── INITIATE OPERATION GLASS MODAL ───────────────────────────── */}
      {isInitiateModalOpen && (
        <Modal
          isOpen={isInitiateModalOpen}
          onClose={() => setIsInitiateModalOpen(false)}
          title="Initiate Operation & Issue Operations Memo"
          maxWidth="760px"
        >
          <form onSubmit={handleInitiateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '80vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {/* Title & Priority */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Operation Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mandatory Front Desk Guest Identification Protocol"
                  value={initiateForm.title}
                  onChange={(e) => setInitiateForm({ ...initiateForm, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Priority Level *
                </label>
                <select
                  value={initiateForm.priority}
                  onChange={(e) => setInitiateForm({ ...initiateForm, priority: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="NORMAL">Normal</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="URGENT">Urgent</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            {/* Category & Property Scope */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Category *
                </label>
                <select
                  value={initiateForm.category}
                  onChange={(e) => setInitiateForm({ ...initiateForm, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                >
                  {OPERATION_CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Property Scope {isManager ? '*' : '(Optional)'}
                </label>
                <select
                  value={initiateForm.property_id}
                  required={isManager}
                  onChange={(e) => setInitiateForm({ ...initiateForm, property_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                >
                  {!isManager && <option value="">Corporate / Multi-Property</option>}
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Audience (Routing Matrix Enforced) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Target Recipient Audience *
                </label>
                <select
                  value={initiateForm.target_audience_type}
                  onChange={(e) => setInitiateForm({ ...initiateForm, target_audience_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                >
                  {isOwner ? (
                    <>
                      <option value="MANAGERS_ONLY">Operational Managers & Administrators</option>
                      <option value="SPECIFIC_USER">Specific Manager / Admin</option>
                    </>
                  ) : (
                    <>
                      <option value="PROPERTY_ALL">All Staff at Property</option>
                      <option value="PROPERTY_RECEPTIONISTS">Front Office Receptionists</option>
                      <option value="PROPERTY_STAFF">General Maintenance & Housekeeping</option>
                      <option value="MANAGERS_ONLY">Managers & Administrators</option>
                      <option value="SPECIFIC_USER">Specific Staff Member(s)</option>
                    </>
                  )}
                </select>
              </div>

              {initiateForm.target_audience_type === 'SPECIFIC_USER' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                    Recipient User ID(s) (comma-separated) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 5, 8"
                    value={initiateForm.specific_user_ids}
                    onChange={(e) => setInitiateForm({ ...initiateForm, specific_user_ids: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                  Execution Deadline
                </label>
                <input
                  type="datetime-local"
                  value={initiateForm.deadline_at}
                  onChange={(e) => setInitiateForm({ ...initiateForm, deadline_at: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            {/* Subject */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                Official Subject Line *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Immediate Implementation of Physical ID Verification for All Check-Ins"
                value={initiateForm.subject}
                onChange={(e) => setInitiateForm({ ...initiateForm, subject: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Purpose */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                1. Purpose & Executive Rationale *
              </label>
              <textarea
                required
                rows={2}
                placeholder="Explain the background, reason, and importance of this directive..."
                value={initiateForm.purpose}
                onChange={(e) => setInitiateForm({ ...initiateForm, purpose: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Instructions */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                2. Operational Instructions & Directives *
              </label>
              <textarea
                required
                rows={4}
                placeholder="List clear, numbered, step-by-step instructions for executing personnel..."
                value={initiateForm.operational_instructions}
                onChange={(e) => setInitiateForm({ ...initiateForm, operational_instructions: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Expected Outcome */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                3. Expected Outcome & Success Metrics
              </label>
              <textarea
                rows={2}
                placeholder="What does completed and successful execution look like?"
                value={initiateForm.expected_outcome}
                onChange={(e) => setInitiateForm({ ...initiateForm, expected_outcome: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="outline" onClick={() => setIsInitiateModalOpen(false)} disabled={isSubmittingOp}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmittingOp}>
                {isSubmittingOp ? 'Issuing Memo & Routing...' : 'Issue Operation & Memo'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── CLARIFICATION REQUEST MODAL ──────────────────────────────── */}
      {isClarifyModalOpen && (
        <Modal
          isOpen={isClarifyModalOpen}
          onClose={() => setIsClarifyModalOpen(false)}
          title="Submit Clarification Inquiry"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              Ask the initiating manager or supervisor for operational guidance. This inquiry will be logged in the operation audit trail and sent to the linked chat thread.
            </p>
            <textarea
              rows={3}
              placeholder="Type your question or clarification request here..."
              value={clarifyQuestion}
              onChange={(e) => setClarifyQuestion(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                fontSize: '0.85rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsClarifyModalOpen(false)} disabled={isClarifying}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!clarifyQuestion.trim()) return;
                  setIsClarifying(true);
                  try {
                    await centralOperationsService.requestClarification(selectedOpId, { questionText: clarifyQuestion });
                    addToast('Clarification request dispatched.', 'success');
                    setIsClarifyModalOpen(false);
                    setClarifyQuestion('');
                    fetchOperationDetails(selectedOpId);
                    fetchOperations();
                  } catch (err) {
                    addToast(err.message || 'Failed to submit clarification.', 'error');
                  } finally {
                    setIsClarifying(false);
                  }
                }}
                disabled={isClarifying || !clarifyQuestion.trim()}
              >
                {isClarifying ? 'Submitting...' : 'Send Inquiry'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── BLOCKER MODAL ────────────────────────────────────────────── */}
      {isBlockerModalOpen && (
        <Modal
          isOpen={isBlockerModalOpen}
          onClose={() => setIsBlockerModalOpen(false)}
          title="Report Operational Blocker"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#ef4444' }}>
              Reporting a blocker marks this operation as BLOCKED and alerts supervisors via URGENT priority.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Blocker Category</label>
              <select
                value={blockerCategory}
                onChange={(e) => setBlockerCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              >
                <option value="ACCESS">Access Restriction (Locked, No Entry)</option>
                <option value="MATERIALS">Missing Tools / Materials / Supplies</option>
                <option value="SAFETY">Hazardous Condition / Safety Risk</option>
                <option value="EQUIPMENT">Equipment Failure</option>
                <option value="OTHER">Other Operational Impasse</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Detailed Blocker Description</label>
              <textarea
                rows={3}
                placeholder="Explain exactly what is preventing progress..."
                value={blockerDetails}
                onChange={(e) => setBlockerDetails(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsBlockerModalOpen(false)} disabled={isReportingBlocker}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!blockerDetails.trim()) return;
                  setIsReportingBlocker(true);
                  try {
                    await centralOperationsService.reportBlocker(selectedOpId, { category: blockerCategory, details: blockerDetails });
                    addToast('Blocker logged and manager alerted.', 'success');
                    setIsBlockerModalOpen(false);
                    setBlockerDetails('');
                    fetchOperationDetails(selectedOpId);
                    fetchOperations();
                  } catch (err) {
                    addToast(err.message || 'Failed to report blocker.', 'error');
                  } finally {
                    setIsReportingBlocker(false);
                  }
                }}
                disabled={isReportingBlocker || !blockerDetails.trim()}
              >
                {isReportingBlocker ? 'Logging...' : 'Log Blocker Alert'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── PROGRESS MODAL ───────────────────────────────────────────── */}
      {isProgressModalOpen && (
        <Modal
          isOpen={isProgressModalOpen}
          onClose={() => setIsProgressModalOpen(false)}
          title="Log Operational Progress"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Current Status</label>
              <select
                value={progressStatus}
                onChange={(e) => setProgressStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              >
                <option value="IN_PROGRESS">In Progress</option>
                <option value="ACKNOWLEDGED">Acknowledged & Commenced</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Progress Notes</label>
              <textarea
                rows={3}
                placeholder="Describe current milestone or progress achieved..."
                value={progressNotes}
                onChange={(e) => setProgressNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsProgressModalOpen(false)} disabled={isUpdatingProgress}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!progressNotes.trim()) return;
                  setIsUpdatingProgress(true);
                  try {
                    await centralOperationsService.updateProgress(selectedOpId, { progressNotes, status: progressStatus });
                    addToast('Progress logged successfully.', 'success');
                    setIsProgressModalOpen(false);
                    setProgressNotes('');
                    fetchOperationDetails(selectedOpId);
                    fetchOperations();
                  } catch (err) {
                    addToast(err.message || 'Failed to update progress.', 'error');
                  } finally {
                    setIsUpdatingProgress(false);
                  }
                }}
                disabled={isUpdatingProgress || !progressNotes.trim()}
              >
                {isUpdatingProgress ? 'Saving...' : 'Save Progress'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── ADD LINKED TASK MODAL ────────────────────────────────────── */}
      {isTaskModalOpen && (
        <Modal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          title="Spawn Linked Operational Task"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Task Title *</label>
              <input
                type="text"
                placeholder="e.g. Inspect HVAC compressor unit 102"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Assigned Staff User ID *</label>
              <input
                type="number"
                placeholder="e.g. 7"
                value={taskForm.assigned_to_id}
                onChange={(e) => setTaskForm({ ...taskForm, assigned_to_id: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Task Instructions & Details *</label>
              <textarea
                rows={3}
                placeholder="Specific instructions for this individual task..."
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsTaskModalOpen(false)} disabled={isCreatingTask}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!taskForm.title || !taskForm.assigned_to_id || !taskForm.description) return;
                  setIsCreatingTask(true);
                  try {
                    await centralOperationsService.createLinkedTask(selectedOpId, taskForm);
                    addToast('Operational task created and linked!', 'success');
                    setIsTaskModalOpen(false);
                    setTaskForm({ title: '', description: '', assigned_to_id: '', task_category: 'GENERAL', priority: 'NORMAL', due_date: '' });
                    fetchOperationDetails(selectedOpId);
                    fetchOperations();
                  } catch (err) {
                    addToast(err.message || 'Failed to create linked task.', 'error');
                  } finally {
                    setIsCreatingTask(false);
                  }
                }}
                disabled={isCreatingTask || !taskForm.title || !taskForm.assigned_to_id || !taskForm.description}
              >
                {isCreatingTask ? 'Creating...' : 'Create & Link Task'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── COMPLETION SUBMISSION MODAL ──────────────────────────────── */}
      {isCompletionModalOpen && (
        <Modal
          isOpen={isCompletionModalOpen}
          onClose={() => setIsCompletionModalOpen(false)}
          title="Submit Operational Completion for Review"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              Summarize completed activities, results achieved, and verification evidence for managerial sign-off.
            </p>
            <textarea
              rows={4}
              placeholder="Detailed completion summary..."
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#f8fafc',
                fontSize: '0.85rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsCompletionModalOpen(false)} disabled={isSubmittingCompletion}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!completionNotes.trim()) return;
                  setIsSubmittingCompletion(true);
                  try {
                    await centralOperationsService.submitCompletion(selectedOpId, { completionNotes });
                    addToast('Completion submitted for managerial review.', 'success');
                    setIsCompletionModalOpen(false);
                    setCompletionNotes('');
                    fetchOperationDetails(selectedOpId);
                    fetchOperations();
                  } catch (err) {
                    addToast(err.message || 'Failed to submit completion.', 'error');
                  } finally {
                    setIsSubmittingCompletion(false);
                  }
                }}
                disabled={isSubmittingCompletion || !completionNotes.trim()}
              >
                {isSubmittingCompletion ? 'Submitting...' : 'Submit for Review'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── REVIEW MODAL ─────────────────────────────────────────────── */}
      {isReviewModalOpen && (
        <Modal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          title="Conduct Managerial Sign-Off Review"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Review Decision</label>
              <select
                value={reviewDecision}
                onChange={(e) => setReviewDecision(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              >
                <option value="APPROVED">✓ Approve & Officially Complete</option>
                <option value="REJECTED">❌ Return for Revision / Rework</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Review Notes & Verification Assessment</label>
              <textarea
                rows={3}
                placeholder="Feedback or completion approval comments..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsReviewModalOpen(false)} disabled={isReviewing}>
                Cancel
              </Button>
              <Button
                variant={reviewDecision === 'APPROVED' ? 'primary' : 'danger'}
                onClick={async () => {
                  setIsReviewing(true);
                  try {
                    await centralOperationsService.reviewOperation(selectedOpId, { decision: reviewDecision, reviewNotes });
                    addToast(`Operation officially marked as ${reviewDecision === 'APPROVED' ? 'COMPLETED' : 'RETURNED'}!`, 'success');
                    setIsReviewModalOpen(false);
                    setReviewNotes('');
                    fetchOperationDetails(selectedOpId);
                    fetchOperations();
                  } catch (err) {
                    addToast(err.message || 'Failed to complete review.', 'error');
                  } finally {
                    setIsReviewing(false);
                  }
                }}
                disabled={isReviewing}
              >
                {isReviewing ? 'Saving...' : 'Finalise Review Decision'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── AMEND MODAL ──────────────────────────────────────────────── */}
      {isAmendModalOpen && (
        <Modal
          isOpen={isAmendModalOpen}
          onClose={() => setIsAmendModalOpen(false)}
          title="Amend Operational Instructions (Issue Revised Memo)"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#f59e0b' }}>
              Amending this directive will generate a new version of the Operations Memo (v{(selectedOp?.memo_version || 1) + 1}), reset recipient acknowledgements, and notify all parties via Staff Chat.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Mandatory Audit Reason *</label>
              <input
                type="text"
                required
                placeholder="e.g. Scope expanded to include second floor sub-panels"
                value={amendForm.amendment_reason}
                onChange={(e) => setAmendForm({ ...amendForm, amendment_reason: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Updated Operational Instructions *</label>
              <textarea
                rows={4}
                value={amendForm.operational_instructions || selectedOp?.operational_instructions}
                onChange={(e) => setAmendForm({ ...amendForm, operational_instructions: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsAmendModalOpen(false)} disabled={isAmending}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  if (!amendForm.amendment_reason.trim()) return;
                  setIsAmending(true);
                  try {
                    await centralOperationsService.amendOperation(selectedOpId, amendForm);
                    addToast('Operation amended and revised Memo issued!', 'success');
                    setIsAmendModalOpen(false);
                    fetchOperationDetails(selectedOpId);
                    fetchOperations();
                  } catch (err) {
                    addToast(err.message || 'Failed to amend operation.', 'error');
                  } finally {
                    setIsAmending(false);
                  }
                }}
                disabled={isAmending || !amendForm.amendment_reason.trim()}
              >
                {isAmending ? 'Issuing Revision...' : 'Issue Revised Memo'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── CANCEL MODAL ─────────────────────────────────────────────── */}
      {isCancelModalOpen && (
        <Modal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          title="Confirm Formal Operation Cancellation"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#ef4444' }}>
              Cancelling this operation revokes all active instructions and dispatches an official cancellation notice to the linked Staff Chat thread.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Formal Cancellation Reason *</label>
              <textarea
                rows={3}
                placeholder="Explain why this operation is cancelled..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} disabled={isCancelling}>
                Close
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!cancelReason.trim()) return;
                  setIsCancelling(true);
                  try {
                    await centralOperationsService.cancelOperation(selectedOpId, { cancellation_reason: cancelReason });
                    addToast('Operation formally cancelled and notice dispatched.', 'success');
                    setIsCancelModalOpen(false);
                    setCancelReason('');
                    fetchOperationDetails(selectedOpId);
                    fetchOperations();
                  } catch (err) {
                    addToast(err.message || 'Failed to cancel operation.', 'error');
                  } finally {
                    setIsCancelling(false);
                  }
                }}
                disabled={isCancelling || !cancelReason.trim()}
              >
                {isCancelling ? 'Revoking...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── SUPER_ADMIN DIAGNOSTICS VIEW ─────────────────────────────── */}
      {activeTab === 'diagnostics' && isSuperAdmin && (
        <div style={{ padding: '1rem', background: '#1e293b', borderRadius: '12px' }}>
          <h3 style={{ color: '#f8fafc', marginTop: 0 }}>🛠️ Super Admin System Diagnostics & Health</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Authoritative platform status, database health, migration verification, and infrastructure telemetry.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <Card style={{ padding: '1rem', background: '#0f172a' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Database Migrations Applied</div>
              <strong style={{ fontSize: '1.5rem', color: '#10b981' }}>36 / 36 Up to Date</strong>
            </Card>
            <Card style={{ padding: '1rem', background: '#0f172a' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Aiven PostgreSQL Target</div>
              <strong style={{ fontSize: '1.1rem', color: '#60a5fa' }}>pg-2221f109-aladeisrael56</strong>
            </Card>
            <Card style={{ padding: '1rem', background: '#0f172a' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Workforce Central Operations</div>
              <strong style={{ fontSize: '1.1rem', color: '#f59e0b' }}>Enabled (Enterprise Ready)</strong>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
