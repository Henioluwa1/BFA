import React from 'react';
import {
  Users,
  Shield,
  Zap,
  ArrowLeft,
  Info,
  Clock,
  Sparkles,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { parseConversationTitle } from './chatMessageParser';

export default function ChatConversationHeader({
  thread,
  currentUser,
  onlineUserIds = new Set(),
  canInitiateOperation = false,
  canDeleteGroup = false,
  onOpenOperationModal,
  onOpenGroupDetailsModal,
  onDeleteGroup,
  onBackToList,
}) {
  if (!thread) {
    return (
      <header className="chat-pane-header">
        <div className="chat-header-identity">
          <div className="chat-avatar">💬</div>
          <div className="chat-header-details">
            <h3>Select a Conversation</h3>
            <p>Choose a thread from the left sidebar to start messaging.</p>
          </div>
        </div>
      </header>
    );
  }

  const threadType = thread.thread_type || thread.threadType;
  const isDirect = threadType === 'DIRECT';
  const isGroup = threadType === 'GROUP';
  const isPropertyChannel = threadType === 'PROPERTY_CHANNEL';
  const parsedTitle = parseConversationTitle(thread);
  const otherUser = thread.otherParticipant;
  const isOnline = otherUser ? onlineUserIds.has(Number(otherUser.id)) : false;

  return (
    <header className="chat-pane-header">
      {/* Mobile Back Button */}
      {onBackToList && (
        <button
          type="button"
          className="chat-btn-mobile-back"
          onClick={onBackToList}
          title="Back to conversations"
        >
          <ArrowLeft size={18} />
          <span>Chats</span>
        </button>
      )}

      {/* Identity & Structured Title */}
      <div className="chat-header-identity" style={{ minWidth: 0, flex: 1 }}>
        <div className="chat-avatar-wrapper">
          <div
            className={`chat-avatar ${
              parsedTitle.isOperation
                ? 'operation'
                : isGroup || isPropertyChannel
                ? 'group'
                : ''
            }`}
          >
            {parsedTitle.isOperation ? (
              '⚡'
            ) : isPropertyChannel ? (
              '🏢'
            ) : isGroup ? (
              '👥'
            ) : otherUser?.name ? (
              otherUser.name.charAt(0).toUpperCase()
            ) : thread.title ? (
              thread.title.charAt(0).toUpperCase()
            ) : (
              '💬'
            )}
          </div>
          {isDirect && (
            <span className={`chat-presence-dot ${isOnline ? 'online' : 'offline'}`} />
          )}
        </div>

        <div className="chat-header-details" style={{ minWidth: 0, flex: 1 }}>
          {parsedTitle.isOperation ? (
            /* Structured Operation Header */
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'nowrap',
                  minWidth: 0,
                }}
              >
                <h3
                  className="chat-header-title-text"
                  title={thread.title}
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {parsedTitle.cleanTitle}
                </h3>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.73rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginTop: '2px',
                  flexWrap: 'wrap',
                }}
              >
                {parsedTitle.operationCode && (
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: '#fbbf24',
                      background: 'rgba(245, 158, 11, 0.16)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {parsedTitle.operationCode}
                  </span>
                )}
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.16)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                    fontSize: '0.66rem',
                    textTransform: 'uppercase',
                  }}
                >
                  Operation Channel
                </span>
                <span>•</span>
                <span>{thread.participantsCount || 'Multi'} participants</span>
                {thread.propertyName && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#94a3b8' }}>{thread.propertyName}</span>
                  </>
                )}
              </div>
            </div>
          ) : isDirect && otherUser ? (
            /* Direct 1-to-1 Header */
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {otherUser.name}
                </h3>
                <span className="chat-role-chip">{otherUser.role || 'STAFF'}</span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: '#94a3b8' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isOnline ? '#10b981' : '#64748b',
                    marginRight: 6,
                  }}
                />
                {isOnline ? 'Active Now' : 'Offline'} •{' '}
                {otherUser.propertyName || thread.propertyName || 'BFA Headquarters'}
              </p>
            </div>
          ) : (
            /* Group / Property Channel Header */
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {thread.title}
                </h3>
                <span className="chat-role-chip">
                  {isPropertyChannel ? 'PROPERTY CHANNEL' : 'TEAM GROUP'}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: '#94a3b8' }}>
                {isPropertyChannel
                  ? `${thread.propertyName || 'Property'} Team Channel`
                  : `Team Channel • ${thread.participantsCount || 'Multi'} members`}
                {' • '}Persistent file sharing active
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Header Actions */}
      <div className="chat-header-actions" style={{ flexShrink: 0 }}>
        {canInitiateOperation && (
          <button
            type="button"
            className="chat-btn-action"
            onClick={onOpenOperationModal}
            style={{
              background: 'rgba(245, 158, 11, 0.18)',
              borderColor: '#f59e0b',
              color: '#fbbf24',
              fontWeight: 700,
            }}
            title="Initiate Formal Central Operation Directive"
          >
            <Zap size={14} />
            <span>Operation</span>
          </button>
        )}

        {(isGroup || isPropertyChannel) && onOpenGroupDetailsModal && (
          <button
            type="button"
            className="chat-btn-header"
            onClick={onOpenGroupDetailsModal}
            title="View and manage group participants"
          >
            <Users size={14} />
            <span>Members</span>
          </button>
        )}

        {(isGroup || isPropertyChannel) && canDeleteGroup && onDeleteGroup && thread.title !== 'General Group' && (
          <button
            type="button"
            className="chat-btn-header"
            onClick={() => onDeleteGroup(thread)}
            title="Delete this group conversation"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.45)',
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.12)',
            }}
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        )}
      </div>
    </header>
  );
}
