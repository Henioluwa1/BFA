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
  Play,
  Upload,
  RotateCcw,
  Lock,
  XCircle,
  CalendarPlus,
} from 'lucide-react';
import { centralOperationsService, userService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const formatWatTimestamp = (iso) => {
  if (!iso) return '—';
  try {
    return `${new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))} WAT`;
  } catch {
    return String(iso);
  }
};

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
  const [assignReason, setAssignReason] = useState('');
  const [progressTaskId, setProgressTaskId] = useState('');
  const [progressPercent, setProgressPercent] = useState(50);
  const [progressNotes, setProgressNotes] = useState('');
  const [clarificationQuestion, setClarificationQuestion] = useState('');
  const [clarificationResponse, setClarificationResponse] = useState('');
  const [blockerCategory, setBlockerCategory] = useState('MISSING_PARTS');
  const [blockerDesc, setBlockerDesc] = useState('');
  const [blockerResolutionNotes, setBlockerResolutionNotes] = useState('');
  const [extensionDeadline, setExtensionDeadline] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionDecisionNotes, setExtensionDecisionNotes] = useState('');
  const [evidenceCaption, setEvidenceCaption] = useState('');
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionEvidenceUrl, setCompletionEvidenceUrl] = useState('');
  const [reviewDecision, setReviewDecision] = useState('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [closeImmediately, setCloseImmediately] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [closeOutcome, setCloseOutcome] = useState('CLOSED_RESOLVED');
  const [closeReason, setCloseReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');

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
  const isTerminal = ['COMPLETED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(operation?.status);
  const isAcknowledged = Boolean(myRecipientRecord?.acknowledged_at || (isResponsible && operation?.first_acknowledged_at));
  const canAcknowledge = !isTerminal && !isAcknowledged && (isRecipient || isResponsible);
  const canStartExecution = !isTerminal && Boolean(operation?.current_responsible_user_id) && !operation?.started_at && (isResponsible || isManagement);
  const isReassigning = Boolean(operation?.current_responsible_user_id);

  const memo = operation?.latest_memo || (operation?.memos && operation.memos[0]) || {};

  // Shared helper to execute an action and refresh state
  const runTicketAction = async (fn, successMsg, onReset) => {
    if (!operation?.id) return;
    setActionLoading(true);
    try {
      await fn();
      addToast(successMsg, 'success');
      onReset?.();
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Operation failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handlers
  const handleAcknowledge = () => runTicketAction(
    () => centralOperationsService.acknowledgeOperation(operation.id, 'Acknowledged in Ticket Viewer'),
    'Ticket receipt formally acknowledged.'
  );

  const handleClaim = () => runTicketAction(
    () => centralOperationsService.claimOperation(operation.id),
    'Responsibility claimed! Primary task linked to your queue.'
  );

  const handleStartExecution = () => runTicketAction(
    () => centralOperationsService.startExecution(operation.id, { notes: 'Execution started via Ticket Workspace' }),
    'Execution started! Ticket is now IN PROGRESS.'
  );

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assigneeId) {
      addToast('Please select a staff member to assign.', 'warning');
      return;
    }
    if (isReassigning && assignReason.trim().length < 5) {
      addToast('A clear reassignment reason (min 5 characters) is mandatory when transferring an assigned ticket.', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.assignOperation(operation.id, {
        targetUserId: assigneeId,
        notes: assignNotes.trim() || undefined,
        reason: assignReason.trim() || undefined,
      }),
      isReassigning ? 'Ticket reassigned with audit history recorded and fresh SLA cycle.' : 'Responsibility assigned to team member.',
      () => {
        setAssignNotes('');
        setAssignReason('');
      }
    );
  };

  const handleRequestClarification = async (e) => {
    e.preventDefault();
    if (clarificationQuestion.trim().length < 5) {
      addToast('Enter your clarification question (min 5 characters).', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.requestClarification(operation.id, { questionText: clarificationQuestion.trim() }),
      'Clarification request dispatched to issuer/supervisor.',
      () => setClarificationQuestion('')
    );
  };

  const handleRespondClarification = async (e) => {
    e.preventDefault();
    if (clarificationResponse.trim().length < 5) {
      addToast('Enter a detailed clarification response (min 5 characters).', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.respondClarification(operation.id, { responseText: clarificationResponse.trim() }),
      'Clarification response posted and ticket resumed.',
      () => setClarificationResponse('')
    );
  };

  const handleRequestExtension = async (e) => {
    e.preventDefault();
    if (!extensionDeadline || extensionReason.trim().length < 5) {
      addToast('Specify both proposed new deadline and clear justification (min 5 characters).', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.requestExtension(operation.id, {
        requestedDeadlineAt: new Date(extensionDeadline).toISOString(),
        reason: extensionReason.trim(),
      }),
      'Deadline extension request submitted for supervisory review.',
      () => {
        setExtensionDeadline('');
        setExtensionReason('');
      }
    );
  };

  const handleReviewExtension = async (decision) => {
    await runTicketAction(
      () => centralOperationsService.reviewExtension(operation.id, {
        decision,
        notes: extensionDecisionNotes.trim() || undefined,
      }),
      `Deadline extension ${decision.toLowerCase()}.`,
      () => setExtensionDecisionNotes('')
    );
  };

  const handleUploadEvidence = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !operation?.id) return;
    if (file.size > 6 * 1024 * 1024) {
      addToast('Maximum evidence file size is 6 MB.', 'warning');
      e.target.value = '';
      return;
    }
    setEvidenceUploading(true);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const raw = String(reader.result || '');
          resolve(raw.includes(',') ? raw.split(',')[1] : raw);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await centralOperationsService.uploadEvidence(operation.id, {
        fileData: base64Data,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        caption: evidenceCaption.trim() || undefined,
      });
      addToast(`Evidence "${file.name}" saved securely to database storage.`, 'success');
      setEvidenceCaption('');
      e.target.value = '';
      await fetchOperation();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Evidence upload failed.', 'error');
    } finally {
      setEvidenceUploading(false);
    }
  };

  const handleProgress = async (e) => {
    e.preventDefault();
    if (!progressNotes.trim()) {
      addToast('Please describe the progress accomplished.', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.updateProgress(operation.id, {
        taskId: progressTaskId || undefined,
        note: progressNotes.trim(),
        progressPercent: parseInt(progressPercent, 10),
      }),
      'Ticket progress update posted.',
      () => setProgressNotes('')
    );
  };

  const handleBlocker = async (e) => {
    e.preventDefault();
    if (!blockerDesc.trim()) {
      addToast('Please specify the nature of the blocker.', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.reportBlocker(operation.id, {
        blockerCategory,
        description: blockerDesc.trim(),
        severity: 'HIGH',
      }),
      'Operational blocker escalated to management.',
      () => setBlockerDesc('')
    );
  };

  const handleResolveBlocker = async (e) => {
    e.preventDefault();
    await runTicketAction(
      () => centralOperationsService.resolveBlocker(operation.id, {
        resolutionNotes: blockerResolutionNotes.trim() || 'Blocker resolved by supervising management.',
      }),
      'Ticket blocker marked resolved and resumed.',
      () => setBlockerResolutionNotes('')
    );
  };

  const handleCompletionSubmit = async (e) => {
    e.preventDefault();
    if (!completionNotes.trim()) {
      addToast('Please provide completion summary notes.', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.submitCompletion(operation.id, {
        completionNotes: completionNotes.trim(),
        completionEvidenceUrl: completionEvidenceUrl.trim() || undefined,
      }),
      'Completion submitted for supervisory verification and sign-off.'
    );
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (reviewDecision !== 'APPROVED' && !reviewNotes.trim()) {
      addToast('Please provide feedback notes explaining the revision or rejection.', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.reviewOperation(operation.id, {
        decision: reviewDecision,
        reviewNotes: reviewNotes.trim(),
        closeImmediately: reviewDecision === 'APPROVED' ? closeImmediately : false,
      }),
      `Supervisory review concluded (${reviewDecision}).`,
      () => setReviewNotes('')
    );
  };

  const handleRejectTicket = async (e) => {
    e.preventDefault();
    if (rejectReason.trim().length < 5) {
      addToast('Provide a clear justification (min 5 characters) to decline or reject this ticket.', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.rejectTicket(operation.id, { reason: rejectReason.trim() }),
      'Ticket rejection/decline recorded cleanly.',
      () => setRejectReason('')
    );
  };

  const handleCloseTicket = async (e) => {
    e.preventDefault();
    await runTicketAction(
      () => centralOperationsService.closeTicket(operation.id, {
        outcome: closeOutcome,
        closureReason: closeReason.trim() || 'Formally closed by supervising management.',
      }),
      'Ticket formally closed.',
      () => setCloseReason('')
    );
  };

  const handleReopenTicket = async (e) => {
    e.preventDefault();
    if (reopenReason.trim().length < 5) {
      addToast('Provide a clear reason (min 5 characters) to reopen this ticket.', 'warning');
      return;
    }
    await runTicketAction(
      () => centralOperationsService.reopenTicket(operation.id, { reason: reopenReason.trim() }),
      'Ticket reopened with preserved lifecycle audit history.',
      () => setReopenReason('')
    );
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
    HIGH: '#fbbf24',
    IMPORTANT: '#fbbf24',
    NORMAL: '#60a5fa',
    LOW: '#94a3b8',
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
            flexShrink: 0,
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(255, 255, 255, 0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
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
                  {operation?.ticket_reference || operation?.operation_code || 'Operational Ticket'}
                </h3>
                {operation?.operation_code && operation?.ticket_reference && operation.ticket_reference !== operation.operation_code && (
                  <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#93c5fd', background: 'rgba(59, 130, 246, 0.14)', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '2px 7px', borderRadius: '4px' }}>
                    {operation.operation_code}
                  </span>
                )}
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
                {operation?.escalated_at && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: 'rgba(239, 68, 68, 0.25)',
                      border: '1px solid #ef4444',
                      color: '#fca5a5',
                    }}
                  >
                    ESCALATED
                  </span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.75)' }}>
                {operation?.title || 'Ticket details, SLA commitments, and execution workflow'}
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
            flexShrink: 0,
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

                    {/* Ticket SLA & Lifecycle Timestamps (Africa/Lagos) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                        gap: '10px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '0.76rem',
                      }}
                    >
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.66rem', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                          Issued At
                        </span>
                        <span style={{ color: '#ffffff', fontWeight: 600 }}>{formatWatTimestamp(operation.issued_at || operation.created_at)}</span>
                      </div>
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.66rem', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                          Ack SLA Deadline
                        </span>
                        <span style={{ color: operation.first_acknowledged_at ? '#34d399' : '#fbbf24', fontWeight: 700 }}>
                          {formatWatTimestamp(operation.acknowledgment_deadline_at || operation.ack_deadline_at)}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.66rem', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                          Target Execution Due
                        </span>
                        <span style={{ color: '#ffffff', fontWeight: 600 }}>{formatWatTimestamp(operation.deadline_at || operation.due_at)}</span>
                      </div>
                      <div>
                        <span style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.66rem', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                          Acknowledged / Started
                        </span>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                          {operation.first_acknowledged_at ? formatWatTimestamp(operation.first_acknowledged_at) : 'Pending'}
                          {operation.started_at ? ` · Started` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Clarification Thread Snapshot */}
                    {(operation.clarification_question || operation.clarification_response) && (
                      <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.35)', fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 800, color: '#fbbf24', marginBottom: '4px' }}>Clarification Thread</div>
                        {operation.clarification_question && (
                          <div style={{ color: '#ffffff', marginBottom: '4px' }}>
                            <strong>Question:</strong> {operation.clarification_question}
                          </div>
                        )}
                        {operation.clarification_response && (
                          <div style={{ color: '#34d399' }}>
                            <strong>Supervisor Response:</strong> {operation.clarification_response}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pending Extension Banner */}
                    {operation.extension_status === 'PENDING' && (
                      <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.35)', fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 800, color: '#fb923c' }}>
                          Pending Deadline Extension Request → {formatWatTimestamp(operation.requested_deadline_at)}
                        </div>
                        <div style={{ color: '#ffffff', marginTop: '3px' }}>Reason: {operation.extension_reason}</div>
                      </div>
                    )}

                    {/* Reassignment & Deadline History Summary */}
                    {((operation.reassignment_history && operation.reassignment_history.length > 0) ||
                      (operation.deadline_history && operation.deadline_history.length > 0)) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                        {operation.reassignment_history?.length > 0 && (
                          <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', marginBottom: '6px' }}>
                              Reassignment History ({operation.reassignment_history.length})
                            </div>
                            {operation.reassignment_history.map((rh) => (
                              <div key={rh.id} style={{ fontSize: '0.76rem', color: '#e2e8f0', padding: '5px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                <div>
                                  <strong>{rh.previous_user_name || 'Unassigned'}</strong> → <strong>{rh.new_user_name}</strong>
                                </div>
                                <div style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '0.7rem' }}>
                                  By {rh.reassigned_by_name} · {formatWatTimestamp(rh.reassigned_at)}
                                </div>
                                {rh.reason && <div style={{ color: '#fbbf24', fontSize: '0.72rem', fontStyle: 'italic' }}>"{rh.reason}"</div>}
                              </div>
                            ))}
                          </div>
                        )}
                        {operation.deadline_history?.length > 0 && (
                          <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#fb923c', textTransform: 'uppercase', marginBottom: '6px' }}>
                              Deadline Adjustment History ({operation.deadline_history.length})
                            </div>
                            {operation.deadline_history.map((dh) => (
                              <div key={dh.id} style={{ fontSize: '0.76rem', color: '#e2e8f0', padding: '5px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                <div>
                                  <strong>{dh.change_type}</strong>: {formatWatTimestamp(dh.new_deadline_at)}
                                </div>
                                <div style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '0.7rem' }}>
                                  Prev: {formatWatTimestamp(dh.previous_deadline_at)} · By {dh.approved_by_name || dh.requested_by_name || 'System'}
                                </div>
                                {dh.reason && <div style={{ color: 'rgba(255, 255, 255, 0.78)', fontSize: '0.72rem' }}>"{dh.reason}"</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TICKET LIFECYCLE & ACTIONS */}
              {activeTab === 'actions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Action 1: Ownership, Start Execution, Reassignment */}
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
                      Ticket Ownership, Execution Start & Reassignment
                    </div>
                    <p style={{ fontSize: '0.76rem', color: 'rgba(255, 255, 255, 0.72)', margin: '0 0 12px' }}>
                      Current Owner: <strong>{operation.responsible_name || 'Unassigned (Awaiting Ownership)'}</strong>
                      {operation.acknowledged_at && <span style={{ color: '#34d399' }}> · Ack: {formatWatTimestamp(operation.acknowledged_at)}</span>}
                      {operation.started_at && <span style={{ color: '#60a5fa' }}> · Started: {formatWatTimestamp(operation.started_at)}</span>}
                    </p>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: isManagement && !isTerminal ? '12px' : '0' }}>
                      {canAcknowledge && (
                        <button
                          type="button"
                          onClick={handleAcknowledge}
                          disabled={actionLoading}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '6px',
                            background: 'rgba(16, 185, 129, 0.2)',
                            border: '1px solid #10b981',
                            color: '#34d399',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: actionLoading ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Check size={14} /> Acknowledge Receipt
                        </button>
                      )}

                      {!operation.current_responsible_user_id && !isTerminal && (
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
                          <UserCheck size={14} /> Accept Responsibility
                        </button>
                      )}

                      {canStartExecution && (
                        <button
                          type="button"
                          onClick={handleStartExecution}
                          disabled={actionLoading}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.22)',
                            border: '1.5px solid #3b82f6',
                            color: '#93c5fd',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            cursor: actionLoading ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Play size={14} /> Start Execution
                        </button>
                      )}
                    </div>

                    {isManagement && !isTerminal && (
                      <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                              minWidth: '180px',
                            }}
                          >
                            <option value="">{isReassigning ? 'Select new staff member to reassign...' : 'Select staff member to assign...'}</option>
                            {operation.recipients && operation.recipients.map((r) => (
                              <option key={`recip-${r.user_id}`} value={r.user_id}>
                                [Recipient] {r.user_name || `User #${r.user_id}`} ({r.role})
                              </option>
                            ))}
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
                            {isReassigning ? 'Reassign Ownership (New SLA)' : 'Assign Ownership'}
                          </button>
                        </div>

                        {isReassigning && (
                          <input
                            type="text"
                            value={assignReason}
                            onChange={(e) => setAssignReason(e.target.value)}
                            placeholder="Mandatory reassignment reason (recorded in audit ledger)..."
                            style={{
                              padding: '7px 10px',
                              background: '#0a0a0e',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: '6px',
                              color: '#ffffff',
                              fontSize: '0.78rem',
                            }}
                          />
                        )}
                      </form>
                    )}
                  </div>

                  {/* Action 2: Clarification Inquiry & Supervisory Response */}
                  {!isTerminal && (
                    <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fbbf24', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <HelpCircle size={15} /> Clarification Inquiry & Response
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                        <form onSubmit={handleRequestClarification} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <input
                            type="text"
                            value={clarificationQuestion}
                            onChange={(e) => setClarificationQuestion(e.target.value)}
                            placeholder="Ask issuer/supervisor for clarification..."
                            style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.78rem' }}
                          />
                          <button
                            type="submit"
                            disabled={actionLoading || clarificationQuestion.trim().length < 5}
                            style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#fbbf24', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', alignSelf: 'flex-start' }}
                          >
                            Request Clarification
                          </button>
                        </form>

                        {isSupervisor && (
                          <form onSubmit={handleRespondClarification} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <input
                              type="text"
                              value={clarificationResponse}
                              onChange={(e) => setClarificationResponse(e.target.value)}
                              placeholder="Supervisor response to unblock/clarify..."
                              style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.78rem' }}
                            />
                            <button
                              type="submit"
                              disabled={actionLoading || clarificationResponse.trim().length < 5}
                              style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', color: '#93c5fd', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', alignSelf: 'flex-start' }}
                            >
                              Respond & Resume
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action 3: Deadline Extension Request & Supervisory Review */}
                  {!isTerminal && (
                    <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fb923c', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CalendarPlus size={15} /> Deadline Extension Control
                      </div>

                      {operation.extension_status === 'PENDING' && isSupervisor && (
                        <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(251, 146, 60, 0.12)', border: '1px solid rgba(251, 146, 60, 0.35)', marginBottom: '10px', fontSize: '0.78rem' }}>
                          <div>
                            <strong>Requested New Deadline:</strong> {formatWatTimestamp(operation.requested_deadline_at)}
                          </div>
                          <div style={{ color: 'rgba(255, 255, 255, 0.85)', margin: '4px 0 8px' }}>
                            Justification: {operation.extension_reason}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={extensionDecisionNotes}
                              onChange={(e) => setExtensionDecisionNotes(e.target.value)}
                              placeholder="Optional decision notes..."
                              style={{ flex: 1, minWidth: '160px', padding: '6px 9px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem' }}
                            />
                            <button type="button" onClick={() => handleReviewExtension('APPROVED')} disabled={actionLoading} style={{ padding: '6px 12px', borderRadius: '6px', background: '#10b981', border: 'none', color: '#ffffff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                              Approve Extension
                            </button>
                            <button type="button" onClick={() => handleReviewExtension('REJECTED')} disabled={actionLoading} style={{ padding: '6px 12px', borderRadius: '6px', background: '#ef4444', border: 'none', color: '#ffffff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>
                              Reject Request
                            </button>
                          </div>
                        </div>
                      )}

                      <form onSubmit={handleRequestExtension} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="datetime-local"
                          value={extensionDeadline}
                          onChange={(e) => setExtensionDeadline(e.target.value)}
                          style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.78rem' }}
                        />
                        <input
                          type="text"
                          value={extensionReason}
                          onChange={(e) => setExtensionReason(e.target.value)}
                          placeholder="Reason for deadline extension..."
                          style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.78rem' }}
                        />
                        <button
                          type="submit"
                          disabled={actionLoading || !extensionDeadline || extensionReason.trim().length < 5}
                          style={{ padding: '7px 12px', borderRadius: '6px', background: 'rgba(251, 146, 60, 0.2)', border: '1px solid #fb923c', color: '#fb923c', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}
                        >
                          Request Extension
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Action 4: Upload Database Evidence & Submit Progress Update */}
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.12)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#ffffff' }}>
                      Evidence Attachments ({operation.evidence_files?.length || 0}) & Progress Updates
                    </div>

                    {!isTerminal && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '10px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.35)', border: '1px dashed rgba(255, 255, 255, 0.22)' }}>
                        <input
                          type="text"
                          value={evidenceCaption}
                          onChange={(e) => setEvidenceCaption(e.target.value)}
                          placeholder="Evidence caption (optional)..."
                          style={{ flex: 1, minWidth: '160px', padding: '6px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem' }}
                        />
                        <label style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.22)', border: '1px solid #3b82f6', color: '#93c5fd', fontWeight: 700, fontSize: '0.76rem', cursor: evidenceUploading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <Upload size={13} />
                          {evidenceUploading ? 'Uploading...' : 'Upload DB Evidence'}
                          <input type="file" onChange={handleUploadEvidence} disabled={evidenceUploading} style={{ display: 'none' }} />
                        </label>
                      </div>
                    )}

                    {operation.evidence_files?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {operation.evidence_files.map((ev) => (
                          <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.04)', fontSize: '0.76rem' }}>
                            <div>
                              <strong>{ev.file_name}</strong>
                              <span style={{ color: 'rgba(255, 255, 255, 0.6)', marginLeft: '8px' }}>
                                ({Math.max(1, Math.round((ev.file_size_bytes || 0) / 1024))} KB · {ev.uploaded_by_name || 'Staff'})
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                onClick={() => centralOperationsService.downloadEvidenceFile(operation.id, ev.id, ev.file_name, true)}
                                style={{ padding: '4px 8px', borderRadius: '5px', background: 'rgba(59, 130, 246, 0.16)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#93c5fd', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => centralOperationsService.downloadEvidenceFile(operation.id, ev.id, ev.file_name, false)}
                                style={{ padding: '4px 8px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleProgress}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
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
                  </div>

                  {/* Action 5: Report & Resolve Blocker */}
                  {!isTerminal && (
                    <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={16} /> Escalate Blocker & Supervisory Resolution
                      </div>

                      {operation.status === 'BLOCKED' && isSupervisor && (
                        <form onSubmit={handleResolveBlocker} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
                          <input
                            type="text"
                            value={blockerResolutionNotes}
                            onChange={(e) => setBlockerResolutionNotes(e.target.value)}
                            placeholder="Resolution notes to unblock ticket..."
                            style={{ flex: 1, minWidth: '180px', padding: '6px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem' }}
                          />
                          <button type="submit" disabled={actionLoading} style={{ padding: '6px 14px', borderRadius: '6px', background: '#10b981', border: 'none', color: '#ffffff', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>
                            Resolve Blocker & Resume
                          </button>
                        </form>
                      )}

                      <form onSubmit={handleBlocker}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                          <select
                            value={blockerCategory}
                            onChange={(e) => setBlockerCategory(e.target.value)}
                            style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.78rem' }}
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
                            style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.78rem' }}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="submit"
                            disabled={actionLoading || !blockerDesc.trim()}
                            style={{ padding: '6px 14px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#f87171', fontWeight: 700, fontSize: '0.78rem', cursor: actionLoading ? 'wait' : 'pointer' }}
                          >
                            Report Blocker
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Action 6: Submit Completion (for Responsible Person) */}
                  {(isResponsible || isSupervisor) && !isTerminal && (
                    <form
                      onSubmit={handleCompletionSubmit}
                      style={{ padding: '16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)' }}
                    >
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#34d399', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={16} /> Submit Ticket for Completion Review
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                        <textarea
                          rows={2}
                          value={completionNotes}
                          onChange={(e) => setCompletionNotes(e.target.value)}
                          placeholder="Summarize completed work, deliverables delivered, and outcome achieved..."
                          style={{ width: '100%', padding: '8px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.8rem', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                        <input
                          type="url"
                          value={completionEvidenceUrl}
                          onChange={(e) => setCompletionEvidenceUrl(e.target.value)}
                          placeholder="External evidence URL (optional — DB uploads above are preferred)"
                          style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.78rem' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="submit"
                          disabled={actionLoading || !completionNotes.trim()}
                          style={{ padding: '7px 16px', borderRadius: '6px', background: '#10b981', border: 'none', color: '#ffffff', fontWeight: 700, fontSize: '0.78rem', cursor: actionLoading ? 'wait' : 'pointer' }}
                        >
                          Submit for Supervisory Review
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Action 7: Supervisory Review Panel */}
                  {isSupervisor && (operation.status === 'SUBMITTED_FOR_REVIEW' || operation.status === 'AWAITING_REVIEW') && (
                    <form
                      onSubmit={handleReviewSubmit}
                      style={{ padding: '16px', borderRadius: '10px', background: 'rgba(192, 132, 252, 0.08)', border: '1.5px solid rgba(192, 132, 252, 0.35)' }}
                    >
                      <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#c084fc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ShieldCheck size={16} /> Supervisory Review & Sign-Off Panel
                      </div>

                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                          <input type="radio" name="reviewDecision" value="APPROVED" checked={reviewDecision === 'APPROVED'} onChange={() => setReviewDecision('APPROVED')} />
                          <span style={{ color: '#34d399', fontWeight: 700 }}>Approve</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                          <input type="radio" name="reviewDecision" value="REVISE" checked={reviewDecision === 'REVISE'} onChange={() => setReviewDecision('REVISE')} />
                          <span style={{ color: '#fb923c', fontWeight: 700 }}>Request Revision</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer' }}>
                          <input type="radio" name="reviewDecision" value="REJECTED" checked={reviewDecision === 'REJECTED'} onChange={() => setReviewDecision('REJECTED')} />
                          <span style={{ color: '#f87171', fontWeight: 700 }}>Reject Quality</span>
                        </label>
                        {reviewDecision === 'APPROVED' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', color: '#cbd5e1', cursor: 'pointer', marginLeft: 'auto' }}>
                            <input type="checkbox" checked={closeImmediately} onChange={(e) => setCloseImmediately(e.target.checked)} />
                            Formally close ticket on approval
                          </label>
                        )}
                      </div>

                      <textarea
                        rows={2}
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Enter supervisory feedback, approval notes, or required revisions..."
                        style={{ width: '100%', padding: '8px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.8rem', boxSizing: 'border-box', resize: 'vertical', marginBottom: '8px' }}
                      />

                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="submit"
                          disabled={actionLoading}
                          style={{ padding: '7px 18px', borderRadius: '6px', background: reviewDecision === 'APPROVED' ? '#10b981' : '#f59e0b', border: 'none', color: '#ffffff', fontWeight: 700, fontSize: '0.78rem', cursor: actionLoading ? 'wait' : 'pointer' }}
                        >
                          Confirm Supervisory Decision
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Action 8: Decline / Reject Invalid Ticket, Formal Close & Reopen */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
                    {!isTerminal && (
                      <form onSubmit={handleRejectTicket} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <XCircle size={15} /> {isSupervisor ? 'Reject Ticket' : 'Decline Misassigned Ticket'}
                        </div>
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason for decline/rejection..."
                          style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem' }}
                        />
                        <button type="submit" disabled={actionLoading || rejectReason.trim().length < 5} style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', alignSelf: 'flex-start' }}>
                          {isSupervisor ? 'Reject Ticket' : 'Decline Ticket'}
                        </button>
                      </form>
                    )}

                    {isSupervisor && operation.status !== 'CLOSED' && (
                      <form onSubmit={handleCloseTicket} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Lock size={15} /> Formally Close Ticket
                        </div>
                        <select value={closeOutcome} onChange={(e) => setCloseOutcome(e.target.value)} style={{ padding: '6px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem' }}>
                          <option value="CLOSED_RESOLVED">Closed — Resolved</option>
                          <option value="CLOSED_CANCELLED_MANAGEMENT">Closed — Cancelled by Management</option>
                          <option value="CLOSED_INVALID">Closed — Duplicate / Invalid</option>
                        </select>
                        <input
                          type="text"
                          value={closeReason}
                          onChange={(e) => setCloseReason(e.target.value)}
                          placeholder="Closure verification note..."
                          style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem' }}
                        />
                        <button type="submit" disabled={actionLoading} style={{ padding: '6px 12px', borderRadius: '6px', background: '#10b981', border: 'none', color: '#ffffff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', alignSelf: 'flex-start' }}>
                          Close Ticket
                        </button>
                      </form>
                    )}

                    {isSupervisor && isTerminal && (
                      <form onSubmit={handleReopenTicket} style={{ padding: '14px', borderRadius: '10px', background: 'rgba(251, 146, 60, 0.06)', border: '1px solid rgba(251, 146, 60, 0.35)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fb923c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <RotateCcw size={15} /> Reopen Closed Ticket
                        </div>
                        <input
                          type="text"
                          value={reopenReason}
                          onChange={(e) => setReopenReason(e.target.value)}
                          placeholder="Reason to reopen (history preserved)..."
                          style={{ padding: '7px 10px', background: '#0a0a0e', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem' }}
                        />
                        <button type="submit" disabled={actionLoading || reopenReason.trim().length < 5} style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(251, 146, 60, 0.25)', border: '1px solid #fb923c', color: '#fdba74', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', alignSelf: 'flex-start' }}>
                          Reopen Ticket
                        </button>
                      </form>
                    )}
                  </div>
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

                          <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.65)', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                            <span>Assigned to: <strong>{task.assigned_to_name || 'Staff Member'}</strong></span>
                            <span>Progress: <strong>{task.progress_percent || 0}%</strong></span>
                            {(task.due_date || task.deadline_at) && <span>Deadline: {formatWatTimestamp(task.due_date || task.deadline_at)}</span>}
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
                              {formatWatTimestamp(evt.created_at)}
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

                          {(evt.event_summary || evt.notes) && (
                            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontStyle: 'italic', marginTop: '2px' }}>
                              "{evt.event_summary || evt.notes}"
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
            flexShrink: 0,
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
