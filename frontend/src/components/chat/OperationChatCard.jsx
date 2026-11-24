import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Check,
  UserCheck,
  Clock,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import api, { centralOperationsService } from '../../services/api';
import { useToast } from '../../context/ToastContext';

/**
 * Enterprise Operation & Memo Interactive Card in Staff Chat
 * 100% Dark Glass / Black Glass design with pure white typography.
 * Displays unambiguous accountability: Initiator, Audience, Responsible Owner, and Next Action.
 */
export default function OperationChatCard({
  operationId,
  memoRef,
  priority = 'NORMAL',
  title: initialTitle,
  currentUser,
  onViewOperation,
  onOperationUpdated,
}) {
  const { addToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [opData, setOpData] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Extract clean ID
  const cleanOpId = typeof operationId === 'string' && operationId.startsWith('OPS-')
    ? operationId
    : operationId;

  const loadOperationData = useCallback(async () => {
    if (!cleanOpId) return;
    try {
      setLoadingDetails(true);
      const res = await centralOperationsService.getOperationById(cleanOpId);
      const data = res?.data || res;
      setOpData(data);
    } catch (err) {
      // Quiet fail to allow card fallback rendering
      console.warn('[OperationChatCard] Could not load full operation details:', err.message);
    } finally {
      setLoadingDetails(false);
    }
  }, [cleanOpId]);

  useEffect(() => {
    loadOperationData();
  }, [loadOperationData]);

  // Priority metadata
  const activePriority = opData?.priority || priority || 'NORMAL';
  const prioBadge = {
    CRITICAL: {
      text: '🚨 CRITICAL DIRECTIVE',
      bg: 'rgba(239, 68, 68, 0.25)',
      color: '#f87171',
      border: '#ef4444',
    },
    URGENT: {
      text: '⚡ URGENT DIRECTIVE',
      bg: 'rgba(245, 158, 11, 0.25)',
      color: '#fbbf24',
      border: '#f59e0b',
    },
    IMPORTANT: {
      text: '⚠️ IMPORTANT DIRECTIVE',
      bg: 'rgba(245, 158, 11, 0.20)',
      color: '#fbbf24',
      border: '#f59e0b',
    },
    NORMAL: {
      text: '📋 OFFICIAL DIRECTIVE',
      bg: 'rgba(59, 130, 246, 0.20)',
      color: '#60a5fa',
      border: '#3b82f6',
    },
  }[activePriority] || {
    text: '📋 OFFICIAL DIRECTIVE',
    bg: 'rgba(59, 130, 246, 0.20)',
    color: '#60a5fa',
    border: '#3b82f6',
  };

  // Status Badge
  const status = opData?.status || 'ISSUED';
  const statusMeta = {
    AWAITING_OWNERSHIP: { label: 'AWAITING OWNER', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
    AWAITING_ACKNOWLEDGEMENT: { label: 'AWAITING ACK', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)' },
    IN_PROGRESS: { label: 'IN PROGRESS', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.2)' },
    ACCEPTED: { label: 'ACCEPTED', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)' },
    SUBMITTED_FOR_REVIEW: { label: 'UNDER REVIEW', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.2)' },
    AWAITING_REVIEW: { label: 'AWAITING REVIEW', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.2)' },
    COMPLETED: { label: 'COMPLETED', color: '#34d399', bg: 'rgba(52, 211, 153, 0.2)' },
    BLOCKED: { label: 'BLOCKED', color: '#f87171', bg: 'rgba(248, 113, 113, 0.2)' },
    REVISION_REQUIRED: { label: 'REVISION REQ.', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.2)' },
  }[status] || { label: status, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.2)' };

  // Recipient check
  const currentUserId = Number(currentUser?.id);
  const myRecipient = opData?.recipients?.find((r) => Number(r.user_id) === currentUserId);
  const isAcknowledged = Boolean(myRecipient?.acknowledged_at);
  const canAcknowledge = myRecipient && !isAcknowledged;

  // Claim eligibility:
  // If operation has no assigned user or is in AWAITING_OWNERSHIP, and user is in the recipient group or target role
  const isAssigned = Boolean(opData?.current_responsible_user_id);
  const isViewerResponsible = Number(opData?.current_responsible_user_id) === currentUserId;
  const canClaim = !isAssigned && (
    status === 'AWAITING_OWNERSHIP' ||
    status === 'ISSUED' ||
    status === 'AWAITING_ACKNOWLEDGEMENT'
  ) && (
    myRecipient ||
    ['ADMIN', 'OPERATIONS_MANAGER', 'MANAGER', 'SUPER_ADMIN'].includes(currentUser?.role)
  );

  // Next action display
  const viewerNextAction = opData?.viewer_next_action?.text || opData?.next_action || 'Review directive mandates and acknowledge receipt.';
  const displayTitle = opData?.title || initialTitle || 'Central Operational Directive';
  const displayMemoRef = opData?.memo_reference || (opData?.memos?.[0]?.memo_reference) || memoRef;
  const targetOpId = opData?.id || cleanOpId;

  // Quick Acknowledge
  const handleAcknowledge = async (e) => {
    e.stopPropagation();
    if (!targetOpId) return;
    setAcknowledging(true);
    try {
      await centralOperationsService.acknowledgeOperation(targetOpId, 'Acknowledged via Staff Chat Card.');
      addToast('Operation receipt formally acknowledged.', 'success');
      await loadOperationData();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to acknowledge.', 'error');
    } finally {
      setAcknowledging(false);
    }
  };

  // Quick Claim Responsibility
  const handleClaim = async (e) => {
    e.stopPropagation();
    if (!targetOpId) return;
    setClaiming(true);
    try {
      await centralOperationsService.claimOperation(targetOpId);
      addToast('Responsibility successfully claimed! Linked task assigned to you.', 'success');
      await loadOperationData();
      onOperationUpdated?.();
    } catch (err) {
      addToast(err.response?.data?.message || err.message || 'Failed to claim responsibility.', 'error');
    } finally {
      setClaiming(false);
    }
  };

  // Download PDF Memorandum
  const handleDownloadPdf = async (e) => {
    e.stopPropagation();
    if (!targetOpId) return;
    setDownloading(true);
    try {
      await centralOperationsService.downloadMemoPdf({
        operationId: targetOpId,
        memoId: opData?.memos?.[0]?.id,
        filename: `${displayMemoRef || `Operation_${targetOpId}`}.pdf`,
      });
      addToast('Operations Memorandum PDF downloaded successfully.', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to download PDF memorandum.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '14px 16px',
        borderRadius: '12px',
        background: 'rgba(10, 10, 16, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1.5px solid rgba(255, 255, 255, 0.16)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.75)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: '#ffffff',
      }}
    >
      {/* Top Meta Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              padding: '2.5px 8px',
              borderRadius: '4px',
              background: prioBadge.bg,
              color: prioBadge.color,
              border: `1px solid ${prioBadge.border}`,
              letterSpacing: '0.4px',
            }}
          >
            {prioBadge.text}
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '2.5px 8px',
              borderRadius: '4px',
              background: statusMeta.bg,
              color: statusMeta.color,
              border: `1px solid ${statusMeta.color}40`,
            }}
          >
            {statusMeta.label}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.75)' }}>
          {opData?.operation_code && (
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {opData.operation_code}
            </span>
          )}
          {displayMemoRef && (
            <span style={{ fontFamily: 'monospace', color: '#d4af37', fontWeight: 700 }}>
              {displayMemoRef}
            </span>
          )}
        </div>
      </div>

      {/* Operation Title */}
      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.35 }}>
        {displayTitle}
      </div>

      {/* Accountability Matrix (Who Initiated, Audience, Responsible Owner) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '8px',
          padding: '8px 10px',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.73rem',
        }}
      >
        <div>
          <span style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.66rem', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
            Initiated By
          </span>
          <span style={{ color: '#ffffff', fontWeight: 600 }}>
            {opData?.initiator_name ? `${opData.initiator_name} (${opData.initiator_role || 'Auth'})` : 'Management'}
          </span>
        </div>

        <div>
          <span style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.66rem', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
            Target Audience
          </span>
          <span style={{ color: '#ffffff', fontWeight: 600 }}>
            {opData?.target_group || opData?.target_role || opData?.audience_type || 'Assigned Staff'}
          </span>
        </div>

        <div>
          <span style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.66rem', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
            Responsible Person
          </span>
          {isViewerResponsible ? (
            <span style={{ color: '#34d399', fontWeight: 800 }}>
              ★ You (Primary Owner)
            </span>
          ) : opData?.responsible_name ? (
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>
              {opData.responsible_name}
            </span>
          ) : (
            <span style={{ color: '#fbbf24', fontWeight: 700, fontStyle: 'italic' }}>
              ⚠️ Awaiting Owner
            </span>
          )}
        </div>
      </div>

      {/* Unambiguous Next Action Directive Banner */}
      <div
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          background: 'rgba(37, 99, 235, 0.12)',
          borderLeft: '4px solid #3b82f6',
          fontSize: '0.76rem',
          color: '#ffffff',
          lineHeight: 1.4,
        }}
      >
        <span style={{ color: '#60a5fa', fontWeight: 800, textTransform: 'uppercase', marginRight: '6px' }}>
          Next Required Action:
        </span>
        <span style={{ color: 'rgba(255, 255, 255, 0.92)' }}>
          {viewerNextAction}
        </span>
      </div>

      {/* Action Buttons Row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px', alignItems: 'center' }}>
        {/* Open Modal / Tasks */}
        <button
          type="button"
          onClick={() => onViewOperation?.(targetOpId)}
          style={{
            fontSize: '0.75rem',
            padding: '6px 14px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            border: 'none',
            color: '#ffffff',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
          }}
        >
          <FileText size={14} /> Open Directive & Tasks
        </button>

        {/* Claim Responsibility Button (if unassigned group operation) */}
        {canClaim && (
          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming}
            style={{
              fontSize: '0.75rem',
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(217, 119, 6, 0.25)',
              border: '1.5px solid #d97706',
              color: '#fbbf24',
              fontWeight: 800,
              cursor: claiming ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
            title="Accept ownership and assign primary task to yourself"
          >
            <UserCheck size={14} /> {claiming ? 'Claiming...' : 'Accept Responsibility'}
          </button>
        )}

        {/* Acknowledge Button */}
        {canAcknowledge && (
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={acknowledging}
            style={{
              fontSize: '0.75rem',
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.18)',
              border: '1px solid #10b981',
              color: '#34d399',
              fontWeight: 700,
              cursor: acknowledging ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Check size={14} /> {acknowledging ? '...' : 'Acknowledge Receipt'}
          </button>
        )}

        {/* Download Memo PDF */}
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={downloading}
          style={{
            fontSize: '0.75rem',
            padding: '6px 12px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#ffffff',
            fontWeight: 600,
            cursor: downloading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            marginLeft: 'auto',
          }}
          title="Download Official Operations Memorandum (PDF)"
        >
          <Download size={14} /> {downloading ? 'Downloading...' : 'Memo PDF'}
        </button>
      </div>
    </div>
  );
}
