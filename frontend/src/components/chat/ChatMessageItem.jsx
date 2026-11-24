import React, { useState } from 'react';
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
  TrendingUp,
  Award,
  CheckCheck,
  Eye,
  CornerDownRight,
  Calendar,
} from 'lucide-react';
import OperationChatCard from './OperationChatCard';
import { parseChatMessage } from './chatMessageParser';

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getRoleBadgeStyle(role) {
  const r = (role || '').toUpperCase();
  if (r === 'OWNER') {
    return { bg: 'rgba(245, 158, 11, 0.22)', color: '#fbbf24', border: '#f59e0b', label: 'Owner' };
  }
  if (r === 'SUPER_ADMIN' || r === 'ADMIN') {
    return { bg: 'rgba(99, 102, 241, 0.22)', color: '#a5b4fc', border: '#6366f1', label: 'Admin' };
  }
  if (r === 'OPERATIONS_MANAGER' || r === 'MANAGER') {
    return { bg: 'rgba(14, 165, 233, 0.22)', color: '#38bdf8', border: '#0ea5e9', label: 'Manager' };
  }
  if (r === 'RECEPTIONIST') {
    return { bg: 'rgba(244, 114, 182, 0.22)', color: '#f472b6', border: '#ec4899', label: 'Receptionist' };
  }
  return { bg: 'rgba(16, 185, 129, 0.22)', color: '#34d399', border: '#10b981', label: 'Staff' };
}

export default function ChatMessageItem({
  message,
  currentUser,
  isPreviousSameSender = false,
  onViewOperation,
  onOperationUpdated,
  onImageClick,
}) {
  const parsed = parseChatMessage(message);
  const isOutgoing = Number(message.sender?.id || message.senderId) === Number(currentUser?.id);
  const senderRole = message.senderRole || message.sender?.role || 'STAFF';
  const senderName = message.senderName || message.sender?.name || (isOutgoing ? 'You' : 'Staff Member');
  const roleStyle = getRoleBadgeStyle(senderRole);

  // 1. SYSTEM NOTICE (Pill)
  if (parsed.type === 'SYSTEM_NOTICE') {
    return (
      <div className="chat-msg-row system" style={{ margin: '8px 0', alignSelf: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.72)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Sparkles size={12} style={{ color: '#d4af37' }} />
          <span>{parsed.data.content}</span>
        </div>
      </div>
    );
  }

  // 2. OFFICIAL OPERATION / DIRECTIVE CARD
  if (parsed.type === 'OFFICIAL_OPERATION') {
    return (
      <div
        className={`chat-msg-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
        style={{ width: '100%', maxWidth: '780px', margin: '10px 0' }}
      >
        {!isOutgoing && !isPreviousSameSender && (
          <div className="chat-sender-label" style={{ marginBottom: '4px' }}>
            <span style={{ fontWeight: 700, color: '#f8fafc' }}>{senderName}</span>
            <span
              style={{
                background: roleStyle.bg,
                color: roleStyle.color,
                border: `1px solid ${roleStyle.border}40`,
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              {roleStyle.label}
            </span>
          </div>
        )}

        <div style={{ width: '100%' }}>
          <OperationChatCard
            operationId={parsed.data.operationId || parsed.data.operationCode}
            memoRef={parsed.data.memoRef}
            priority={parsed.data.priority}
            title={parsed.data.title}
            currentUser={currentUser}
            onViewOperation={onViewOperation}
            onOperationUpdated={onOperationUpdated}
          />
          <div className="chat-msg-meta" style={{ marginTop: '4px' }}>
            <span>{formatTime(message.createdAt)}</span>
            {isOutgoing && (
              <span title={message.isRead ? 'Read' : 'Delivered'}>
                {message.isRead ? (
                  <CheckCheck size={13} style={{ color: '#34d399' }} />
                ) : (
                  <Check size={13} />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. RESPONSIBILITY ACCEPTED (Structured Activity Card)
  if (parsed.type === 'RESPONSIBILITY_ACCEPTED') {
    return (
      <div
        className="chat-msg-row"
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: '560px',
          margin: '8px 0',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.22))',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderLeft: '4px solid #10b981',
            borderRadius: '10px',
            padding: '12px 16px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.25)',
                  color: '#34d399',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UserCheck size={15} />
              </span>
              <strong style={{ fontSize: '0.85rem', color: '#34d399', letterSpacing: '0.2px' }}>
                Responsibility Accepted
              </strong>
            </div>

            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
              }}
            >
              Status: Accepted
            </span>
          </div>

          <div style={{ fontSize: '0.8rem', color: '#f1f5f9', marginBottom: '8px', paddingLeft: '34px' }}>
            <span style={{ fontWeight: 600 }}>{parsed.data.actor}</span>
            {parsed.data.operationCode && (
              <span style={{ color: 'rgba(255, 255, 255, 0.65)', marginLeft: '6px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                · Operation: <strong style={{ color: '#60a5fa' }}>{parsed.data.operationCode}</strong>
              </span>
            )}
          </div>

          <div
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(0, 0, 0, 0.3)',
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.9)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginLeft: '34px',
            }}
          >
            <strong style={{ color: '#60a5fa', fontSize: '0.7rem', textTransform: 'uppercase' }}>
              Next Action:
            </strong>
            <span>{parsed.data.nextAction}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            <span>{formatTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  // 4. RESPONSIBILITY DELEGATED (Structured Delegation Flow Card)
  if (parsed.type === 'RESPONSIBILITY_DELEGATED') {
    return (
      <div
        className="chat-msg-row"
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: '580px',
          margin: '8px 0',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(67, 56, 202, 0.22))',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderLeft: '4px solid #6366f1',
            borderRadius: '10px',
            padding: '12px 16px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.25)',
                  color: '#a5b4fc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowRight size={15} />
              </span>
              <strong style={{ fontSize: '0.85rem', color: '#a5b4fc', letterSpacing: '0.2px' }}>
                Responsibility Delegated
              </strong>
            </div>

            {parsed.data.operationCode && (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                }}
              >
                {parsed.data.operationCode}
              </span>
            )}
          </div>

          {/* Delegation Visual Direction */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.35)',
              marginBottom: '8px',
              fontSize: '0.78rem',
            }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', display: 'block' }}>
                Delegated By
              </span>
              <strong style={{ color: '#f8fafc' }}>{parsed.data.delegatedBy}</strong>
            </div>

            <div style={{ color: '#a5b4fc', display: 'flex', alignItems: 'center' }}>
              <ArrowRight size={18} />
            </div>

            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', display: 'block' }}>
                Assigned To
              </span>
              <strong style={{ color: '#38bdf8' }}>{parsed.data.assignedTo}</strong>
            </div>
          </div>

          {parsed.data.instructions && (
            <div
              style={{
                fontSize: '0.76rem',
                color: 'rgba(255, 255, 255, 0.85)',
                marginBottom: '8px',
                padding: '6px 10px',
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: '6px',
              }}
            >
              <strong style={{ color: '#fbbf24', marginRight: '5px' }}>Instructions:</strong>
              <span>{parsed.data.instructions}</span>
            </div>
          )}

          <div
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(37, 99, 235, 0.15)',
              borderLeft: '3px solid #3b82f6',
              fontSize: '0.74rem',
              color: '#ffffff',
            }}
          >
            <strong style={{ color: '#60a5fa', textTransform: 'uppercase', marginRight: '6px' }}>
              Next Action:
            </strong>
            <span>{parsed.data.nextAction}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            <span>{formatTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  // 5. OPERATIONAL BLOCKER
  if (parsed.type === 'OPERATIONAL_BLOCKER') {
    return (
      <div
        className="chat-msg-row"
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: '560px',
          margin: '8px 0',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(153, 27, 27, 0.25))',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderLeft: '4px solid #ef4444',
            borderRadius: '10px',
            padding: '12px 16px',
            backdropFilter: 'blur(16px)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={15} />
              </span>
              <strong style={{ fontSize: '0.85rem', color: '#f87171' }}>
                Operational Blocker Reported
              </strong>
            </div>

            {parsed.data.operationCode && (
              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#f87171' }}>
                {parsed.data.operationCode}
              </span>
            )}
          </div>

          <div style={{ fontSize: '0.78rem', marginBottom: '6px', paddingLeft: '34px' }}>
            <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              Reported By: <strong style={{ color: '#fff' }}>{parsed.data.reportedBy}</strong> · Category: <strong>{parsed.data.category}</strong>
            </div>
            <div style={{ marginTop: '4px', color: '#fecaca', whiteSpace: 'pre-wrap' }}>
              {parsed.data.details}
            </div>
          </div>

          <div
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.2)',
              fontSize: '0.74rem',
              color: '#fca5a5',
              marginLeft: '34px',
              fontWeight: 600,
            }}
          >
            ⚠️ {parsed.data.nextAction}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            <span>{formatTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  // 6. PROGRESS UPDATE
  if (parsed.type === 'PROGRESS_UPDATE') {
    return (
      <div
        className="chat-msg-row"
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: '560px',
          margin: '8px 0',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(3, 105, 161, 0.2))',
            border: '1px solid rgba(14, 165, 233, 0.35)',
            borderLeft: '4px solid #0ea5e9',
            borderRadius: '10px',
            padding: '12px 16px',
            backdropFilter: 'blur(16px)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'rgba(14, 165, 233, 0.25)',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={15} />
              </span>
              <strong style={{ fontSize: '0.85rem', color: '#38bdf8' }}>
                Operational Progress Update
              </strong>
            </div>

            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(14, 165, 233, 0.2)',
                color: '#38bdf8',
                border: '1px solid rgba(14, 165, 233, 0.4)',
              }}
            >
              {parsed.data.status}
            </span>
          </div>

          <div style={{ fontSize: '0.78rem', marginBottom: '6px', paddingLeft: '34px' }}>
            <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              Logged By: <strong style={{ color: '#fff' }}>{parsed.data.loggedBy}</strong>
              {parsed.data.operationCode && (
                <span style={{ marginLeft: '6px', fontFamily: 'monospace' }}>
                  · Ref: <strong style={{ color: '#38bdf8' }}>{parsed.data.operationCode}</strong>
                </span>
              )}
            </div>
            {parsed.data.notes && (
              <div style={{ marginTop: '4px', color: '#e0f2fe', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.25)', padding: '6px 10px', borderRadius: '6px' }}>
                {parsed.data.notes}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            <span>{formatTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  // 7. COMPLETION SUBMITTED
  if (parsed.type === 'COMPLETION_SUBMITTED') {
    return (
      <div
        className="chat-msg-row"
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: '560px',
          margin: '8px 0',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(180, 83, 9, 0.2))',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderLeft: '4px solid #f59e0b',
            borderRadius: '10px',
            padding: '12px 16px',
            backdropFilter: 'blur(16px)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.25)',
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={15} />
              </span>
              <strong style={{ fontSize: '0.85rem', color: '#fbbf24' }}>
                Completion Evidence Submitted
              </strong>
            </div>

            {parsed.data.operationCode && (
              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#fbbf24' }}>
                {parsed.data.operationCode}
              </span>
            )}
          </div>

          <div style={{ fontSize: '0.78rem', marginBottom: '6px', paddingLeft: '34px' }}>
            <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              Submitted By: <strong style={{ color: '#fff' }}>{parsed.data.submittedBy}</strong>
            </div>
            {parsed.data.notes && (
              <div style={{ marginTop: '4px', color: '#fef3c7', whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.25)', padding: '6px 10px', borderRadius: '6px' }}>
                {parsed.data.notes}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: 'rgba(245, 158, 11, 0.18)',
              fontSize: '0.74rem',
              color: '#fef08a',
              marginLeft: '34px',
              fontWeight: 600,
            }}
          >
            ⏳ {parsed.data.nextAction}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            <span>{formatTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  // 8. OPERATION COMPLETED & APPROVED
  if (parsed.type === 'OPERATION_COMPLETED') {
    return (
      <div
        className="chat-msg-row"
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: '560px',
          margin: '8px 0',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 78, 59, 0.3))',
            border: '1.5px solid #10b981',
            borderRadius: '10px',
            padding: '14px 16px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.25)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#10b981',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Award size={16} />
              </span>
              <strong style={{ fontSize: '0.88rem', color: '#34d399' }}>
                Operation Officially Completed & Verified
              </strong>
            </div>

            {parsed.data.operationCode && (
              <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#34d399', fontWeight: 700 }}>
                {parsed.data.operationCode}
              </span>
            )}
          </div>

          <div style={{ fontSize: '0.78rem', paddingLeft: '36px' }}>
            <div style={{ color: 'rgba(255, 255, 255, 0.75)', marginBottom: '4px' }}>
              Sign-off By: <strong style={{ color: '#fff' }}>{parsed.data.reviewedBy}</strong>
            </div>
            {parsed.data.reviewNotes && (
              <div style={{ color: '#d1fae5', background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '6px' }}>
                "{parsed.data.reviewNotes}"
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', fontSize: '0.65rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            <span>{formatTime(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  // 9. TASK UPDATE CARD
  if (parsed.type === 'TASK_UPDATE') {
    return (
      <div
        className="chat-msg-row"
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: '540px',
          margin: '8px 0',
        }}
      >
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderLeft: '4px solid #3b82f6',
            borderRadius: '10px',
            padding: '10px 14px',
            backdropFilter: 'blur(16px)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} style={{ color: '#60a5fa' }} />
              <strong style={{ fontSize: '0.82rem', color: '#60a5fa' }}>{parsed.data.title}</strong>
            </div>
            <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#94a3b8' }}>
              {parsed.data.taskCode}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.75)' }}>
            <span>Assigned: <strong style={{ color: '#fff' }}>{parsed.data.assignee}</strong></span>
            <span>Status: <strong style={{ color: '#38bdf8' }}>{parsed.data.status}</strong></span>
          </div>

          {parsed.data.dueDate && (
            <div style={{ marginTop: '4px', fontSize: '0.7rem', color: '#94a3b8' }}>
              Due: {parsed.data.dueDate}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 10. DEFAULT: NORMAL CHAT MESSAGE BUBBLE
  return (
    <div
      className={`chat-msg-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
      style={{
        marginTop: isPreviousSameSender ? '3px' : '10px',
      }}
    >
      {!isOutgoing && !isPreviousSameSender && (
        <div className="chat-sender-label">
          <span>{senderName}</span>
          <span
            style={{
              background: roleStyle.bg,
              color: roleStyle.color,
              border: `1px solid ${roleStyle.border}40`,
              fontSize: '0.625rem',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '4px',
            }}
          >
            {roleStyle.label}
          </span>
        </div>
      )}

      <div className="chat-msg-bubble">
        {/* Text message content */}
        {message.content && (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
            {message.content}
          </div>
        )}

        {/* Image Attachment */}
        {message.attachment && message.attachment.fileType?.startsWith('image/') && (
          <div className="chat-attachment-card" style={{ marginTop: '8px' }}>
            <img
              src={message.attachment.url || message.attachment.previewUrl}
              alt={message.attachment.originalName || 'Photo'}
              className="chat-attachment-img-preview"
              onClick={() => onImageClick?.(message.attachment)}
            />
          </div>
        )}

        {/* Document Attachment */}
        {message.attachment && !message.attachment.fileType?.startsWith('image/') && (
          <div className="chat-doc-card" style={{ marginTop: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>📄</span>
            <div className="chat-doc-info">
              <div className="chat-doc-name">{message.attachment.originalName}</div>
              <div className="chat-doc-size">{formatFileSize(message.attachment.fileSize)}</div>
            </div>
            <a
              href={message.attachment.downloadUrl || message.attachment.url}
              download={message.attachment.originalName}
              className="chat-btn-download"
              target="_blank"
              rel="noopener noreferrer"
            >
              ⬇ Download
            </a>
          </div>
        )}

        {/* Timestamp & Delivery Status */}
        <div className="chat-msg-meta">
          <span>{formatTime(message.createdAt)}</span>
          {isOutgoing && (
            <span title={message.isRead ? 'Read' : 'Delivered'}>
              {message.isRead ? (
                <CheckCheck size={13} style={{ color: '#34d399' }} />
              ) : (
                <Check size={13} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
