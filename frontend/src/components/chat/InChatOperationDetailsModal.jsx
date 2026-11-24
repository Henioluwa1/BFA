import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  FileText,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Building2,
  User,
  ShieldCheck,
  Send,
  Calendar,
  Eye,
  Check,
  UserCheck,
  ArrowRight,
  ShieldAlert,
  History,
  ListTodo,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import api, { centralOperationsService, userService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function InChatOperationDetailsModal({
  isOpen,
  onClose,
  operationId,
  currentUser,
  onOperationUpdated,
}) {
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState(null);
  const [activeTab, setActiveTab] = useState('directive'); // 'directive' | 'actions' | 'memo' | 'tasks' | 'audit'

  // Actions state
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Forms inside Actions Tab
  const [assigneeId, setAssigneeId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [progressTaskId, setProgressTaskId] = useState('');
  const [progressPercent, setProgressPercent] = useState(50);
  const [progressNotes, setProgressNotes] = useState('');
  const [blockerCategory, setBlockerCategory] = useState('MISSING_PARTS');
  const [blockerDesc, setBlockerDesc] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionEvidenceUrl, setCompletionEvidenceUrl] = useState('');
  const [reviewDecision, setReviewDecision] = useState('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');

  // Staff options for assignment
  const [staffList, setStaffList] = useState([]);

  const cleanOpId = typeof operationId === 'string' && operationId.startsWith('OPS-')
    ? operationId
    : operationId;

  // Load Operation Record
  const fetchOperation = useCallback(async () => {
    if (!cleanOpId) return;
    setLoading(true);
    try {
      const res = await centralOperationsService.getOperationById(cleanOpId);
      const data = res?.data || res;
      setOperation(data);
      if (data.tasks && data.tasks.length > 0 && !progressTaskId) {
        setProgressTaskId(data.tasks[0].id);
      }
    } catch (err) {
      console.error('[InChatOperationDetailsModal] Failed to fetch operation:', err);
      addToast('Failed to load operation details.', 'error');
    } finally {
      setLoading(false);
    }
  }, [cleanOpId]);

  useEffect(() => {
    if (isOpen && cleanOpId) {
      fetchOperation();
    }
  }, [isOpen, cleanOpId, fetchOperation]);

  // Load staff list if management
  useEffect(() => {
    if (!isOpen) return;
    const role = currentUser?.role || '';
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(role)) {
      userService.getUsers({ limit: 100 })
        .then((res) => {
          const users = res?.data?.users || res?.users || (Array.isArray(res?.data) ? res.data : []);
          setStaffList(users);
        })
        .catch(() => {});
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const currentUserId = Number(currentUser?.id);
  const isInitiator = Number(currentUser?.id) === Number(operation?.initiated_by_user_id);
  const isManagement = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(currentUser?.role);
  const isSupervisor = isInitiator || isManagement;
  const isResponsible = Number(operation?.current_responsible_user_id) === currentUserId;
  const myRecipientRecord = operation?.recipients?.find(
    (r) => Number(r.user_id) === currentUserId
  );
  const isRecipient = Boolean(myRecipientRecord);
  const isAcknowledged = Boolean(myRecipientRecord?.acknowledged_at);
  const canAcknowledge = isRecipient && !isAcknowledged;

  const memo = operation?.latest_memo || (operation?.memos && operation.memos[0]) || {};

  // Handlers
  const handleAcknowledge = async () => {
    if (!operation?.id) return;
    setActionLoading(true);
    try {
      await centralOperationsService.acknowledgeOperation(operation.id, 'Acknowledged in Operational Viewer');
      addToast('Directive receipt acknowledged successfully.', 'success');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to acknowledge receipt.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!operation?.id) return;
    setActionLoading(true);
    try {
      await centralOperationsService.claimOperation(operation.id);
      addToast('Responsibility successfully claimed! Primary task created.', 'success');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to claim responsibility.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assigneeId) {
      addToast('Please select a staff member to assign.', 'warning');
      return;
    }
    setActionLoading(true);
    try {
      await centralOperationsService.assignOperation(operation.id, assigneeId, assignNotes);
      addToast('Responsibility successfully assigned to team member.', 'success');
      setAssignNotes('');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to assign responsibility.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleProgress = async (e) => {
    e.preventDefault();
    if (!progressNotes.trim()) {
      addToast('Please describe the progress accomplished.', 'warning');
      return;
    }
    setActionLoading(true);
    try {
      await centralOperationsService.updateProgress(operation.id, {
        taskId: progressTaskId || undefined,
        note: progressNotes.trim(),
        progressPercent: parseInt(progressPercent, 10),
      });
      addToast('Operational progress update posted.', 'success');
      setProgressNotes('');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to update progress.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlocker = async (e) => {
    e.preventDefault();
    if (!blockerDesc.trim()) {
      addToast('Please specify the nature of the blocker.', 'warning');
      return;
    }
    setActionLoading(true);
    try {
      await centralOperationsService.reportBlocker(operation.id, {
        blockerCategory,
        description: blockerDesc.trim(),
        severity: 'HIGH',
      });
      addToast('Operational blocker escalated to management.', 'warning');
      setBlockerDesc('');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to report blocker.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompletionSubmit = async (e) => {
    e.preventDefault();
    if (!completionNotes.trim()) {
      addToast('Please provide completion summary notes.', 'warning');
      return;
    }
    setActionLoading(true);
    try {
      await centralOperationsService.submitCompletion(operation.id, {
        completionNotes: completionNotes.trim(),
        completionEvidenceUrl: completionEvidenceUrl.trim() || undefined,
      });
      addToast('Operation submitted for supervisory review and sign-off.', 'success');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to submit completion.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (reviewDecision !== 'APPROVED' && !reviewNotes.trim()) {
      addToast('Please provide feedback notes explaining the revision or rejection.', 'warning');
      return;
    }
    setActionLoading(true);
    try {
      await centralOperationsService.reviewOperation(operation.id, {
        decision: reviewDecision,
        reviewNotes: reviewNotes.trim(),
      });
      addToast(`Supervisory review concluded (${reviewDecision}).`, 'success');
      setReviewNotes('');
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to submit review.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!operation?.id) return;
    setDownloadingPdf(true);
    try {
      await centralOperationsService.downloadMemoPdf({
        operationId: operation.id,
        memoId: memo?.id,
        filename: `${memo?.memo_reference || operation?.operation_code || 'Operation_Memo'}.pdf`,
      });
      addToast('Operations Memorandum PDF downloaded successfully.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to download PDF memorandum.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrintMemo = async () => {
    if (!operation?.id) return;
    setDownloadingPdf(true);
    try {
      await centralOperationsService.previewMemoPdf({
        operationId: operation.id,
        memoId: memo?.id,
        filename: `${memo?.memo_reference || operation?.operation_code || 'Operation_Memo'}.pdf`,
      });
    } catch (err) {
      addToast(err.message || 'Failed to open PDF preview.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const priorityColor = {
    CRITICAL: '#f87171',
    URGENT: '#fbbf24',
    IMPORTANT: '#fbbf24',
    NORMAL: '#60a5fa',
  }[operation?.priority || 'NORMAL'] || '#60a5fa';

  const nextActionText = operation?.viewer_next_action?.text || operation?.next_action || 'Review directive mandates and acknowledge receipt.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'modalFadeIn 180ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '94vh',
          background: 'rgba(10, 10, 16, 0.96)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1.5px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '16px',
          boxShadow: '0 25px 70px -10px rgba(0, 0, 0, 0.95), 0 0 35px rgba(59, 130, 246, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#ffffff',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(255, 255, 255, 0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(212, 175, 55, 0.15)',
                border: '1.5px solid rgba(212, 175, 55, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fbbf24',
                flexShrink: 0,
              }}
            >
              <FileText size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                  {operation?.operation_code || 'Operational Directive'}
                </h3>
                {memo.memo_reference && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      background: 'rgba(212, 175, 55, 0.15)',
                      border: '1px solid rgba(212, 175, 55, 0.4)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      color: '#fbbf24',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                    }}
                  >
                    {memo.memo_reference}
                  </span>
                )}
                {operation?.priority && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: `${priorityColor}25`,
                      color: priorityColor,
                      border: `1px solid ${priorityColor}60`,
                    }}
                  >
                    {operation.priority}
                  </span>
                )}
                {operation?.status && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.18)',
                      color: 'rgba(255, 255, 255, 0.85)',
                    }}
                  >
                    {operation.status}
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                {operation?.title || 'Operational details and execution workflow'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrintMemo}
              disabled={downloadingPdf || loading}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: downloadingPdf ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Preview Official Memorandum PDF in browser tab"
            >
              <Eye size={14} />
              Preview
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || loading}
              style={{
                background: 'rgba(59, 130, 246, 0.18)',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: downloadingPdf ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Download Official Memorandum PDF"
            >
              <Download size={14} />
              {downloadingPdf ? 'Downloading...' : 'PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(0, 0, 0, 0.35)',
            padding: '0 20px',
            gap: '8px',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'directive', label: '1. Directive & Overview', icon: FileText },
            { id: 'actions', label: '2. Operational Actions', icon: CheckCircle2 },
            { id: 'memo', label: '3. Official Memorandum', icon: Eye },
            { id: 'tasks', label: `4. Linked Tasks (${operation?.tasks?.length || 0})`, icon: ListTodo },
            { id: 'audit', label: `5. Audit Ledger (${operation?.events?.length || 0})`, icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2.5px solid #3b82f6' : '2.5px solid transparent',
                  color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={14} style={{ color: isActive ? '#60a5fa' : 'inherit' }} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255, 255, 255, 0.7)' }}>
              Loading operational directive details...
            </div>
          )}

          {!loading && operation && (
            <>
              {/* TAB 1: DIRECTIVE & OVERVIEW */}
              {activeTab === 'directive' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Dynamic Next Action Banner */}
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '10px',
                      background: 'rgba(37, 99, 235, 0.15)',
                      borderLeft: '5px solid #3b82f6',
                      borderTop: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRight: '1px solid rgba(59, 130, 246, 0.25)',
                      borderBottom: '1px solid rgba(59, 130, 246, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        ⚡ Current Next Action Directive
                      </div>
                      <div style={{ fontSize: '0.84rem', color: '#ffffff', marginTop: '4px', fontWeight: 600 }}>
                        {nextActionText}
                      </div>
                    </div>

                    {canAcknowledge && (
                      <button
                        type="button"
                        onClick={handleAcknowledge}
                        disabled={actionLoading}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          background: '#10b981',
                          border: 'none',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          cursor: actionLoading ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexShrink: 0,
                          boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        <Check size={14} />
                        {actionLoading ? 'Acknowledging...' : 'Acknowledge Receipt'}
                      </button>
                    )}
                  </div>

                  {/* Accountability Matrix 4-Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                      gap: '12px',
                      padding: '14px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.10)',
                      borderRadius: '10px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.55)', fontWeight: 700, textTransform: 'uppercase' }}>
                        1. INITIATOR / ISSUER
                      </div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', marginTop: '3px' }}>
                        {operation.initiator_name} ({operation.initiator_role})
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.55)', fontWeight: 700, textTransform: 'uppercase' }}>
                        2. INTENDED AUDIENCE
                      </div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', marginTop: '3px' }}>
                        {memo.recipient_summary || operation.target_group || operation.target_role || operation.audience_type}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.55)', fontWeight: 700, textTransform: 'uppercase' }}>
                        3. RESPONSIBLE PERSON
                      </div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, marginTop: '3px' }}>
                        {isResponsible ? (
                          <span style={{ color: '#34d399' }}>★ You (Assigned Owner)</span>
                        ) : operation.responsible_name ? (
                          <span style={{ color: '#38bdf8' }}>{operation.responsible_name} ({operation.responsible_role || 'Staff'})</span>
                        ) : (
                          <span style={{ color: '#fbbf24', fontStyle: 'italic' }}>
                            ⚠️ Unassigned ({operation.current_responsible_group || 'Open to Group'})
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.55)', fontWeight: 700, textTransform: 'uppercase' }}>
                        4. SUPERVISOR / APPROVER
                      </div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff', marginTop: '3px' }}>
                        {operation.reviewer_name ? `${operation.reviewer_name} (Reviewed)` : `${operation.initiator_name} / Management`}
                      </div>
                    </div>
                  </div>

                  {/* Core Content Blocks */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Purpose */}
                    <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Executive Rationale & Operational Purpose
                      </div>
                      <div style={{ fontSize: '0.86rem', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {memo.purpose || operation.purpose || 'No statement of purpose provided.'}
                      </div>
                    </div>

                    {/* Operational Instructions */}
                    <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Specific Operational Instructions
                      </div>
                      <div style={{ fontSize: '0.86rem', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {memo.operational_instructions || operation.operational_instructions || 'Execute directives as outlined in official mandate.'}
                      </div>
                    </div>

                    {/* Expected Outcome */}
                    {(memo.expected_outcome || operation.expected_outcome) && (
                      <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#60a5fa', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Expected Outcome & Deliverables
                        </div>
                        <div style={{ fontSize: '0.86rem', color: '#ffffff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {memo.expected_outcome || operation.expected_outcome}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: OPERATIONAL ACTIONS */}
              {activeTab === 'actions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Action 1: Ownership / Claim / Assign */}
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
                      Operational Ownership & Responsibility
                    </div>
                    <p style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.7)', margin: '0 0 12px' }}>
                      Current Owner: <strong>{operation.responsible_name || 'Unassigned (Awaiting Ownership)'}</strong>
                    </p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {/* Self-claim if unassigned */}
                      {!operation.current_responsible_user_id && (
                        <button
                          type="button"
                          onClick={handleClaim}
                          disabled={actionLoading}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: 'rgba(217, 119, 6, 0.25)',
                            border: '1.5px solid #d97706',
                            color: '#fbbf24',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: actionLoading ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <UserCheck size={14} /> Accept / Claim Ownership
                        </button>
                      )}

                      {/* Management Delegation Form */}
                      {isManagement && (
                        <form onSubmit={handleAssign} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                          <select
                            value={assigneeId}
                            onChange={(e) => setAssigneeId(e.target.value)}
                            style={{
                              padding: '7px 10px',
                              background: '#0a0a0e',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: '6px',
                              color: '#ffffff',
                              fontSize: '0.78rem',
                              flex: 1,
                              minWidth: '200px',
                            }}
                          >
                            <option value="">Select staff member to assign...</option>
                            {/* Priority: Eligible Recipients */}
                            {operation.recipients && operation.recipients.map((r) => (
                              <option key={`recip-${r.user_id}`} value={r.user_id}>
                                [Recipient] {r.user_name || `User #${r.user_id}`} ({r.role})
                              </option>
                            ))}
                            {/* General Staff */}
                            {staffList.map((s) => (
                              <option key={`staff-${s.id}`} value={s.id}>
                                {s.full_name || s.name} ({s.role})
                              </option>
                            ))}
                          </select>

                          <button
                            type="submit"
                            disabled={actionLoading || !assigneeId}
                            style={{
                              padding: '7px 14px',
                              borderRadius: '6px',
                              background: '#2563eb',
                              border: 'none',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              cursor: actionLoading ? 'wait' : 'pointer',
                            }}
                          >
                            Delegate Ownership
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* Action 2: Submit Progress Update */}
                  <form
                    onSubmit={handleProgress}
                    style={{
                      padding: '16px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                    }}
                  >
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
                      Submit Progress Update & Evidence
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      {operation.tasks && operation.tasks.length > 0 && (
                        <select
                          value={progressTaskId}
                          onChange={(e) => setProgressTaskId(e.target.value)}
                          style={{
                            padding: '7px 10px',
                            background: '#0a0a0e',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontSize: '0.78rem',
                          }}
                        >
                          {operation.tasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              Task: {t.title} ({t.status})
                            </option>
                          ))}
                        </select>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.7)' }}>Progress:</span>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          step="10"
                          value={progressPercent}
                          onChange={(e) => setProgressPercent(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, width: '38px', textAlign: 'right' }}>
                          {progressPercent}%
                        </span>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={progressNotes}
                      onChange={(e) => setProgressNotes(e.target.value)}
                      placeholder="Detail work performed, tests completed, or milestone achieved..."
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: '#0a0a0e',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '0.8rem',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                        marginBottom: '8px',
                      }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="submit"
                        disabled={actionLoading || !progressNotes.trim()}
                        style={{
                          padding: '7px 16px',
                          borderRadius: '6px',
                          background: '#2563eb',
                          border: 'none',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          cursor: actionLoading ? 'wait' : 'pointer',
                        }}
                      >
                        Submit Progress Update
                      </button>
                    </div>
                  </form>

                  {/* Action 3: Report Blocker */}
                  <form
                    onSubmit={handleBlocker}
                    style={{
                      padding: '16px',
                      borderRadius: '10px',
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                    }}
                  >
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#f87171', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={16} /> Escalate Blocker to Supervisors
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginBottom: '10px' }}>
                      <select
                        value={blockerCategory}
                        onChange={(e) => setBlockerCategory(e.target.value)}
                        style={{
                          padding: '7px 10px',
                          background: '#0a0a0e',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                        }}
                      >
                        <option value="MISSING_PARTS">Missing Tools / Parts</option>
                        <option value="ACCESS_DENIED">Access Denied / Key Issue</option>
                        <option value="SUPPLIER_DELAY">Supplier / Vendor Delay</option>
                        <option value="CLIENT_REFUSAL">Guest / Tenant Conflict</option>
                        <option value="SAFETY_HAZARD">Safety / Hazard Issue</option>
                        <option value="OTHER">Other Operational Blocker</option>
                      </select>

                      <input
                        type="text"
                        value={blockerDesc}
                        onChange={(e) => setBlockerDesc(e.target.value)}
                        placeholder="Explain the impediment and what is required to unblock..."
                        style={{
                          padding: '7px 10px',
                          background: '#0a0a0e',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="submit"
                        disabled={actionLoading || !blockerDesc.trim()}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid #ef4444',
                          color: '#f87171',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          cursor: actionLoading ? 'wait' : 'pointer',
                        }}
                      >
                        Report Blocker
                      </button>
                    </div>
                  </form>

                  {/* Action 4: Submit Completion (for Responsible Person) */}
                  {(isResponsible || isSupervisor) && operation.status !== 'COMPLETED' && (
                    <form
                      onSubmit={handleCompletionSubmit}
                      style={{
                        padding: '16px',
                        borderRadius: '10px',
                        background: 'rgba(16, 185, 129, 0.05)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#34d399', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={16} /> Submit Operation for Completion Review
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                        <textarea
                          rows={2}
                          value={completionNotes}
                          onChange={(e) => setCompletionNotes(e.target.value)}
                          placeholder="Summarize completed work, deliverables delivered, and outcome achieved..."
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: '#0a0a0e',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            boxSizing: 'border-box',
                            resize: 'vertical',
                          }}
                        />

                        <input
                          type="url"
                          value={completionEvidenceUrl}
                          onChange={(e) => setCompletionEvidenceUrl(e.target.value)}
                          placeholder="Evidence URL / photo link / report link (optional)"
                          style={{
                            padding: '7px 10px',
                            background: '#0a0a0e',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontSize: '0.78rem',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="submit"
                          disabled={actionLoading || !completionNotes.trim()}
                          style={{
                            padding: '7px 16px',
                            borderRadius: '6px',
                            background: '#10b981',
                            border: 'none',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: actionLoading ? 'wait' : 'pointer',
                          }}
                        >
                          Submit for Supervisory Review
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Action 5: Supervisory Review Panel */}
                  {isSupervisor && (operation.status === 'SUBMITTED_FOR_REVIEW' || operation.status === 'AWAITING_REVIEW') && (
                    <form
                      onSubmit={handleReviewSubmit}
                      style={{
                        padding: '16px',
                        borderRadius: '10px',
                        background: 'rgba(192, 132, 252, 0.08)',
                        border: '1.5px solid rgba(192, 132, 252, 0.35)',
                      }}
                    >
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#c084fc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ShieldCheck size={16} /> Supervisory Review & Sign-Off Panel
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="reviewDecision"
                            value="APPROVED"
                            checked={reviewDecision === 'APPROVED'}
                            onChange={() => setReviewDecision('APPROVED')}
                          />
                          <span style={{ color: '#34d399', fontWeight: 700 }}>Approve & Close</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="reviewDecision"
                            value="REVISE"
                            checked={reviewDecision === 'REVISE'}
                            onChange={() => setReviewDecision('REVISE')}
                          />
                          <span style={{ color: '#fb923c', fontWeight: 700 }}>Request Revision</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="reviewDecision"
                            value="REJECTED"
                            checked={reviewDecision === 'REJECTED'}
                            onChange={() => setReviewDecision('REJECTED')}
                          />
                          <span style={{ color: '#f87171', fontWeight: 700 }}>Reject</span>
                        </label>
                      </div>

                      <textarea
                        rows={2}
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Enter supervisory feedback, approval notes, or required revisions..."
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#0a0a0e',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '6px',
                          color: '#ffffff',
                          fontSize: '0.8rem',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          marginBottom: '8px',
                        }}
                      />

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="submit"
                          disabled={actionLoading}
                          style={{
                            padding: '7px 18px',
                            borderRadius: '6px',
                            background: reviewDecision === 'APPROVED' ? '#10b981' : '#f59e0b',
                            border: 'none',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: actionLoading ? 'wait' : 'pointer',
                          }}
                        >
                          Confirm Supervisory Decision
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 3: OFFICIAL MEMORANDUM DOCUMENT */}
              {activeTab === 'memo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handlePrintMemo}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <Printer size={13} /> Print Document
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={downloadingPdf}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        background: '#2563eb',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: downloadingPdf ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <Download size={13} /> {downloadingPdf ? 'Downloading...' : 'Download Official PDF'}
                    </button>
                  </div>

                  {/* High-Fidelity Memorandum Paper Preview */}
                  <div
                    style={{
                      background: '#ffffff',
                      color: '#0f172a',
                      padding: '36px 40px',
                      borderRadius: '8px',
                      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                      fontFamily: '"Times New Roman", Times, Georgia, serif',
                      lineHeight: 1.5,
                    }}
                  >
                    {/* Header */}
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '18px' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                        BFA APARTMENTS MANAGEMENT SYSTEM
                      </div>
                      <div style={{ fontSize: '0.88rem', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '2px', color: '#475569' }}>
                        CENTRAL OPERATIONS & EXECUTIVE DIRECTIVES
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '8px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                        OFFICIAL MEMORANDUM
                      </div>
                    </div>

                    {/* Meta Table Box */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '0.88rem' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                          <td style={{ width: '15%', padding: '6px 8px', fontWeight: 700, color: '#334155' }}>TO:</td>
                          <td style={{ width: '35%', padding: '6px 8px' }}>{memo.recipient_summary || operation.target_group || operation.audience_type}</td>
                          <td style={{ width: '15%', padding: '6px 8px', fontWeight: 700, color: '#334155' }}>DATE:</td>
                          <td style={{ width: '35%', padding: '6px 8px' }}>{new Date(operation.created_at).toLocaleDateString()}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>FROM:</td>
                          <td style={{ padding: '6px 8px' }}>{operation.initiator_name} ({operation.initiator_role})</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>REF:</td>
                          <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700 }}>
                            {memo.memo_reference || operation.operation_code}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>SUBJECT:</td>
                          <td colSpan={3} style={{ padding: '6px 8px', fontWeight: 700, textTransform: 'uppercase' }}>
                            {memo.subject || operation.title}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>PRIORITY:</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700 }}>{operation.priority}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#334155' }}>DEADLINE:</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700 }}>
                            {operation.deadline_at ? new Date(operation.deadline_at).toLocaleDateString() : 'Standard Timeline'}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Section 1: Purpose */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                        1. Purpose & Executive Rationale
                      </div>
                      <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', textAlign: 'justify' }}>
                        {memo.purpose || operation.purpose}
                      </div>
                    </div>

                    {/* Section 2: Instructions */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                        2. Operational Instructions & Directives
                      </div>
                      <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', textAlign: 'justify' }}>
                        {memo.operational_instructions || operation.operational_instructions}
                      </div>
                    </div>

                    {/* Section 3: Expected Outcome */}
                    {(memo.expected_outcome || operation.expected_outcome) && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                          3. Expected Outcome & Deliverables
                        </div>
                        <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', textAlign: 'justify' }}>
                          {memo.expected_outcome || operation.expected_outcome}
                        </div>
                      </div>
                    )}

                    {/* Section 4: Accountability */}
                    {(memo.responsibility_definition || operation.responsibility_definition) && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                          4. Accountability & Task Responsibility
                        </div>
                        <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', textAlign: 'justify' }}>
                          {memo.responsibility_definition || operation.responsibility_definition}
                        </div>
                      </div>
                    )}

                    {/* Section 5: Reporting */}
                    {(memo.reporting_requirements || operation.reporting_requirements) && (
                      <div style={{ marginBottom: '22px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                          5. Reporting & Verification Requirements
                        </div>
                        <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', textAlign: 'justify' }}>
                          {memo.reporting_requirements || operation.reporting_requirements}
                        </div>
                      </div>
                    )}

                    {/* Sign-Off Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #0f172a', paddingTop: '14px', marginTop: '30px', fontSize: '0.82rem' }}>
                      <div>
                        <div><strong>ISSUED BY:</strong> {operation.initiator_name}</div>
                        <div style={{ color: '#64748b' }}>Designation: {operation.initiator_role}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div><strong>RESPONSIBLE OWNER:</strong> {operation.responsible_name || 'Designated Staff Team'}</div>
                        <div style={{ color: '#64748b' }}>Status: {operation.status}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: LINKED TASKS & SUB-TASKS */}
              {activeTab === 'tasks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
                    Actionable Tasks Derived from Operation ({operation.tasks?.length || 0})
                  </div>

                  {(!operation.tasks || operation.tasks.length === 0) ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                      No separate sub-tasks linked yet. A primary task is created upon claiming or personal assignment.
                    </div>
                  ) : (
                    operation.tasks.map((task) => (
                      <div
                        key={task.id}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#ffffff' }}>
                              {task.title}
                            </span>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: task.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                color: task.status === 'COMPLETED' ? '#34d399' : '#60a5fa',
                                border: `1px solid ${task.status === 'COMPLETED' ? '#10b981' : '#3b82f6'}`,
                              }}
                            >
                              {task.status}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.65)', marginTop: '4px', display: 'flex', gap: '14px' }}>
                            <span>Assigned to: <strong>{task.assigned_to_name || 'Staff Member'}</strong></span>
                            <span>Progress: <strong>{task.progress_percent || 0}%</strong></span>
                            {task.deadline_at && <span>Deadline: {new Date(task.deadline_at).toLocaleDateString()}</span>}
                          </div>

                          {/* Progress bar */}
                          <div style={{ height: '4px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${task.progress_percent || 0}%`,
                                background: task.status === 'COMPLETED' ? '#10b981' : '#3b82f6',
                                borderRadius: '2px',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 5: AUDIT LEDGER & TIMELINE */}
              {activeTab === 'audit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
                    Immutable Lifecycle Audit Trail ({operation.events?.length || 0})
                  </div>

                  {(!operation.events || operation.events.length === 0) ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                      No historical events recorded yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {operation.events.map((evt) => (
                        <div
                          key={evt.id}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            fontSize: '0.78rem',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, color: '#60a5fa' }}>
                              {evt.event_type}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                              {new Date(evt.created_at).toLocaleString()}
                            </span>
                          </div>

                          <div style={{ color: '#ffffff', marginBottom: '2px' }}>
                            Actor: <strong>{evt.actor_name || 'System'}</strong> ({evt.actor_role || 'AUTOMATION'})
                            {evt.old_status && evt.new_status && (
                              <span style={{ marginLeft: '8px', color: 'rgba(255, 255, 255, 0.7)' }}>
                                [{evt.old_status} → {evt.new_status}]
                              </span>
                            )}
                          </div>

                          {evt.notes && (
                            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontStyle: 'italic', marginTop: '2px' }}>
                              "{evt.notes}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 22px',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.65)' }}>
            Operation ID: {operation?.id} · Code: {operation?.operation_code}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 18px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
