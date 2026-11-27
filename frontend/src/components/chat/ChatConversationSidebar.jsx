import React from 'react';
import {
  Search,
  Plus,
  Users,
  MessageSquare,
  Zap,
  Building2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { parseConversationTitle } from './chatMessageParser';

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ChatConversationSidebar({
  threads = [],
  activeThreadId,
  onSelectThread,
  loading = false,
  searchQuery = '',
  onSearchChange,
  activeTab = 'ALL',
  onTabChange,
  canInitiateOperation = false,
  canCreateGroup = false,
  onOpenOperationModal,
  onOpenNewDirectModal,
  onOpenNewGroupModal,
  onlineUserIds = new Set(),
  className = '',
}) {
  const filteredThreads = threads.filter((t) => {
    const parsed = parseConversationTitle(t);
    if (activeTab === 'DIRECT' && t.threadType !== 'DIRECT') return false;
    if (activeTab === 'GROUP' && (t.threadType !== 'GROUP' && t.threadType !== 'PROPERTY_CHANNEL' || parsed.isOperation)) return false;
    if (activeTab === 'OPERATIONS' && !parsed.isOperation) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchClean = parsed.cleanTitle?.toLowerCase().includes(q);
      const matchCode = parsed.operationCode?.toLowerCase().includes(q);
      const matchMsg = t.lastMessage?.content?.toLowerCase().includes(q);
      return matchTitle || matchClean || matchCode || matchMsg;
    }
    return true;
  });

  return (
    <aside className={`chat-sidebar ${className}`}>
      {/* Top Header */}
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-title-row">
          <h2>Team Messages</h2>
          <div className="chat-action-buttons">
            {canInitiateOperation && (
              <button
                type="button"
                className="chat-btn-action"
                onClick={onOpenOperationModal}
                style={{
                  background: 'rgba(245, 158, 11, 0.18)',
                  borderColor: '#f59e0b',
                  color: '#fbbf24',
                }}
                title="Initiate Formal Central Operation Directive"
              >
                <Zap size={13} />
                <span>Operation</span>
              </button>
            )}
            <button
              type="button"
              className="chat-btn-action"
              onClick={onOpenNewDirectModal}
              title="Start a 1-to-1 direct conversation"
            >
              <Plus size={13} />
              <span>DM</span>
            </button>
            {canCreateGroup && (
              <button
                type="button"
                className="chat-btn-action"
                onClick={onOpenNewGroupModal}
                title="Create a new team group"
              >
                <Plus size={13} />
                <span>Group</span>
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="chat-search-box">
          <span className="chat-search-icon">
            <Search size={14} />
          </span>
          <input
            type="text"
            className="chat-search-input"
            placeholder="Search conversations, directives..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Filter Tabs */}
        <div className="chat-filter-tabs">
          <button
            type="button"
            className={`chat-filter-tab ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={() => onTabChange('ALL')}
          >
            All
          </button>
          <button
            type="button"
            className={`chat-filter-tab ${activeTab === 'OPERATIONS' ? 'active' : ''}`}
            onClick={() => onTabChange('OPERATIONS')}
            title="Filter by Operations and Directives"
          >
            ⚡ Directives
          </button>
          <button
            type="button"
            className={`chat-filter-tab ${activeTab === 'DIRECT' ? 'active' : ''}`}
            onClick={() => onTabChange('DIRECT')}
          >
            Direct
          </button>
          <button
            type="button"
            className={`chat-filter-tab ${activeTab === 'GROUP' ? 'active' : ''}`}
            onClick={() => onTabChange('GROUP')}
          >
            Groups
          </button>
        </div>
      </div>

      {/* Threads List */}
      <div className="chat-threads-list">
        {loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
            Loading conversations...
          </div>
        )}

        {!loading && filteredThreads.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
            No conversations found. Click <strong>+ DM</strong> or <strong>+ Group</strong> to begin!
          </div>
        )}

        {!loading &&
          filteredThreads.map((thread) => {
            const parsed = parseConversationTitle(thread);
            const isDirect = thread.threadType === 'DIRECT';
            const isGroup = thread.threadType === 'GROUP';
            const isPropertyChannel = thread.threadType === 'PROPERTY_CHANNEL';
            const otherUser = thread.otherParticipant;
            const isOnline = otherUser ? onlineUserIds.has(Number(otherUser.id)) : false;
            const isActive = activeThreadId === thread.id;

            return (
              <div
                key={thread.id}
                className={`chat-thread-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectThread(thread.id)}
                title={thread.title}
              >
                {/* Avatar */}
                <div className="chat-avatar-wrapper">
                  <div
                    className={`chat-avatar ${
                      parsed.isOperation ? 'operation' : isGroup || isPropertyChannel ? 'group' : ''
                    }`}
                  >
                    {parsed.isOperation ? (
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

                {/* Info */}
                <div className="chat-thread-info">
                  <div className="chat-thread-header-row">
                    <span className="chat-thread-name">
                      {parsed.cleanTitle}
                    </span>
                    <span className="chat-thread-time">
                      {formatTime(thread.lastMessage?.createdAt || thread.lastMessageAt)}
                    </span>
                  </div>

                  {/* Second Line: Operation Code Badge or Subtitle */}
                  {parsed.isOperation && parsed.operationCode ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '1px 0 2px' }}>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: '#fbbf24',
                          background: 'rgba(245, 158, 11, 0.18)',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          padding: '0px 5px',
                          borderRadius: '3px',
                        }}
                      >
                        {parsed.operationCode}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#60a5fa', fontWeight: 600 }}>
                        Directive
                      </span>
                    </div>
                  ) : isPropertyChannel ? (
                    <div style={{ fontSize: '0.68rem', color: '#38bdf8', margin: '1px 0' }}>
                      🏢 Property Channel
                    </div>
                  ) : null}

                  {/* Third Line: Message Preview */}
                  <div className="chat-thread-preview-row">
                    <span className="chat-thread-preview">
                      {thread.lastMessage ? (
                        <>
                          {thread.lastMessage.senderName && (
                            <strong style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                              {thread.lastMessage.senderName.split(' ')[0]}:{' '}
                            </strong>
                          )}
                          {thread.lastMessage.content}
                        </>
                      ) : (
                        'No messages yet'
                      )}
                    </span>
                    {thread.unreadCount > 0 && (
                      <span className="chat-unread-badge">
                        {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </aside>
  );
}
