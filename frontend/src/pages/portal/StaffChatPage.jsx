import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSocket } from '../../services/socket';
import chatService from '../../services/chatService';
import '../../styles/staffChat.css';

function unpack(res, fallback = null) {
  if (!res) return fallback;
  if (res.data !== undefined) return res.data;
  return res;
}

export default function StaffChatPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'DIRECT' | 'GROUP'

  // Online Presence & Typing State
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({}); // userId -> { userName, isTyping }
  const typingTimeoutRef = useRef(null);

  // Composer State
  const [messageText, setMessageText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Modals
  const [newDirectModalOpen, setNewDirectModalOpen] = useState(false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [groupDetailsModalOpen, setGroupDetailsModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  // Contacts for Modals
  const [contacts, setContacts] = useState([]);
  const [contactsSearch, setContactsSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

  // New Group Form
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Group Details & Participant Management
  const [participants, setParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // --------------------------------------------------------------------------
  // 1. Initial Load of Threads
  // --------------------------------------------------------------------------
  const loadThreads = useCallback(async () => {
    try {
      setLoadingThreads(true);
      const res = await chatService.getThreads();
      const raw = unpack(res);
      const list = Array.isArray(raw) ? raw : [];
      setThreads(list);
      if (list.length > 0 && !activeThreadId) {
        setActiveThreadId(list[0].id);
      }
    } catch (err) {
      console.error('[CHAT] Failed to load threads:', err);
      addToast('Failed to load conversation threads', 'error');
    } finally {
      setLoadingThreads(false);
    }
  }, [activeThreadId, addToast]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // --------------------------------------------------------------------------
  // 2. Load Messages for Active Thread
  // --------------------------------------------------------------------------
  const loadMessages = useCallback(async (threadId) => {
    if (!threadId) return;
    try {
      setLoadingMessages(true);
      const res = await chatService.getThreadHistory(threadId, { limit: 50 });
      const raw = unpack(res);
      const msgs = Array.isArray(raw) ? raw : [];
      setMessages(msgs);

      // Auto mark latest message as read
      if (msgs.length > 0) {
        const latestMsg = msgs[msgs.length - 1];
        chatService.markAsRead(threadId, latestMsg.id).catch(() => {});
        const socket = getSocket();
        if (socket?.connected) {
          socket.emit('message:read', { threadId, messageId: latestMsg.id });
        }
        // Clear unread count locally for this thread
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
        );
      }
    } catch (err) {
      console.error('[CHAT] Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Update activeThread details when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId) {
      setActiveThread(null);
      setMessages([]);
      return;
    }
    const th = threads.find((t) => t.id === activeThreadId);
    setActiveThread(th || null);
    loadMessages(activeThreadId);
  }, [activeThreadId, threads, loadMessages]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingUsers]);

  // --------------------------------------------------------------------------
  // 3. Socket.IO Real-Time Lifecycle
  // --------------------------------------------------------------------------
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Request current online users list
    socket.emit('presence:get', (res) => {
      if (res?.success && Array.isArray(res.data)) {
        setOnlineUserIds(new Set(res.data.map((id) => Number(id))));
      }
    });

    const handlePresenceState = (data) => {
      if (data?.onlineUserIds) {
        setOnlineUserIds(new Set(data.onlineUserIds.map((id) => Number(id))));
      }
    };

    const handlePresenceChange = (data) => {
      if (!data?.userId) return;
      const uId = Number(data.userId);
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (data.status === 'ONLINE') {
          next.add(uId);
        } else {
          next.delete(uId);
        }
        return next;
      });
    };

    const handleMessageDelivered = (payload) => {
      const { threadId, message } = payload;
      if (threadId === activeThreadId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id || (message.clientTempId && m.clientTempId === message.clientTempId))) {
            return prev.map((m) => (m.clientTempId === message.clientTempId ? message : m));
          }
          return [...prev, message];
        });

        // Mark as read immediately if window is open
        chatService.markAsRead(threadId, message.id).catch(() => {});
        socket.emit('message:read', { threadId, messageId: message.id });
      }

      // Update thread preview in threads list and bring to top
      setThreads((prev) => {
        const existing = prev.find((t) => t.id === threadId);
        if (!existing) {
          loadThreads();
          return prev;
        }
        const updated = {
          ...existing,
          lastMessage: {
            id: message.id,
            content: message.content,
            messageType: message.messageType,
            senderName: message.senderName || message.sender?.name,
            createdAt: message.createdAt,
          },
          unreadCount: threadId === activeThreadId ? 0 : (existing.unreadCount || 0) + 1,
        };
        const rest = prev.filter((t) => t.id !== threadId);
        return [updated, ...rest];
      });
    };

    const handleNewIncoming = (payload) => {
      const { threadId, message } = payload;
      if (threadId !== activeThreadId) {
        setThreads((prev) => {
          const existing = prev.find((t) => t.id === threadId);
          if (!existing) {
            loadThreads();
            return prev;
          }
          const updated = {
            ...existing,
            lastMessage: {
              id: message.id,
              content: message.content,
              messageType: message.messageType,
              senderName: message.senderName || message.sender?.name,
              createdAt: message.createdAt,
            },
            unreadCount: (existing.unreadCount || 0) + 1,
          };
          const rest = prev.filter((t) => t.id !== threadId);
          return [updated, ...rest];
        });
      }
    };

    const handleTypingStatus = (data) => {
      if (data?.threadId === activeThreadId && data.userId !== user?.id) {
        setTypingUsers((prev) => ({
          ...prev,
          [data.userId]: { userName: data.userName, isTyping: data.isTyping },
        }));
      }
    };

    const handleReceiptUpdated = (data) => {
      if (data?.threadId === activeThreadId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id <= data.lastReadMessageId ? { ...m, isRead: true } : m
          )
        );
      }
    };

    socket.on('presence:state', handlePresenceState);
    socket.on('presence:change', handlePresenceChange);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:new_incoming', handleNewIncoming);
    socket.on('typing:status', handleTypingStatus);
    socket.on('message:receipt_updated', handleReceiptUpdated);

    // Join active thread room
    if (activeThreadId) {
      socket.emit('thread:join', { threadId: activeThreadId });
    }

    return () => {
      socket.off('presence:state', handlePresenceState);
      socket.off('presence:change', handlePresenceChange);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:new_incoming', handleNewIncoming);
      socket.off('typing:status', handleTypingStatus);
      socket.off('message:receipt_updated', handleReceiptUpdated);
      if (activeThreadId) {
        socket.emit('thread:leave', { threadId: activeThreadId });
      }
    };
  }, [activeThreadId, user?.id, loadThreads]);

  // --------------------------------------------------------------------------
  // 4. Typing Event Dispatcher
  // --------------------------------------------------------------------------
  const handleTextChange = (e) => {
    setMessageText(e.target.value);
    const socket = getSocket();
    if (!socket?.connected || !activeThreadId) return;

    socket.emit('typing:start', { threadId: activeThreadId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { threadId: activeThreadId });
    }, 2000);
  };

  // --------------------------------------------------------------------------
  // 5. File Attachment Selection
  // --------------------------------------------------------------------------
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_SIZE) {
      addToast('File exceeds maximum allowed size of 15MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPendingAttachment({
        originalName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileData: event.target.result, // base64 data URL
      });
    };
    reader.onerror = () => {
      addToast('Failed to read selected file', 'error');
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  };

  // --------------------------------------------------------------------------
  // 6. Send Message Action
  // --------------------------------------------------------------------------
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!activeThreadId) return;

    const trimmed = messageText.trim();
    if (!trimmed && !pendingAttachment) return;

    const clientTempId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const tempPayload = {
      threadId: activeThreadId,
      clientTempId,
      content: trimmed || pendingAttachment?.originalName || 'Attachment',
      messageType: pendingAttachment
        ? pendingAttachment.fileType.startsWith('image/')
          ? 'IMAGE'
          : 'DOCUMENT'
        : 'TEXT',
      attachment: pendingAttachment
        ? {
            originalName: pendingAttachment.originalName,
            fileType: pendingAttachment.fileType,
            fileSize: pendingAttachment.fileSize,
          }
        : null,
      sender: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      createdAt: new Date().toISOString(),
      isSending: true,
    };

    // Optimistic UI push
    setMessages((prev) => [...prev, tempPayload]);
    setMessageText('');
    const attToSend = pendingAttachment;
    setPendingAttachment(null);
    setSending(true);

    try {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('typing:stop', { threadId: activeThreadId });
      }

      // Send to server
      const res = await chatService.sendMessage(activeThreadId, {
        clientTempId,
        content: tempPayload.content,
        messageType: tempPayload.messageType,
        attachment: attToSend,
      });

      const confirmedMsg = unpack(res);
      if (confirmedMsg) {
        setMessages((prev) =>
          prev.map((m) => (m.clientTempId === clientTempId ? confirmedMsg : m))
        );
      }
    } catch (err) {
      console.error('[CHAT] Send failed:', err);
      addToast('Failed to send message: ' + (err.response?.data?.message || err.message), 'error');
      setMessages((prev) => prev.filter((m) => m.clientTempId !== clientTempId));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // --------------------------------------------------------------------------
  // 7. Modals: Contacts Discovery & New Direct Message
  // --------------------------------------------------------------------------
  const openNewDirectModal = async () => {
    setNewDirectModalOpen(true);
    setContactsSearch('');
    try {
      setLoadingContacts(true);
      const res = await chatService.getContacts();
      const raw = unpack(res);
      setContacts(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error('[CHAT] Contacts load error:', err);
      addToast('Failed to load contacts directory', 'error');
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleStartDirectChat = async (targetUserId) => {
    try {
      const res = await chatService.createDirectThread(targetUserId);
      const thread = unpack(res);
      setNewDirectModalOpen(false);
      await loadThreads();
      if (thread?.id) {
        setActiveThreadId(thread.id);
      }
      addToast('Conversation ready', 'success');
    } catch (err) {
      console.error('[CHAT] Start direct chat error:', err);
      addToast(err.response?.data?.message || 'Failed to start chat', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // 8. Modals: New Group Creation
  // --------------------------------------------------------------------------
  const openNewGroupModal = async () => {
    setNewGroupModalOpen(true);
    setGroupTitle('');
    setSelectedGroupMemberIds([]);
    setContactsSearch('');
    try {
      setLoadingContacts(true);
      const res = await chatService.getContacts();
      const raw = unpack(res);
      setContacts(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error('[CHAT] Contacts load error:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleToggleGroupMember = (userId) => {
    setSelectedGroupMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupTitle.trim()) {
      addToast('Please enter a group title', 'warning');
      return;
    }
    if (selectedGroupMemberIds.length === 0) {
      addToast('Please select at least one team member', 'warning');
      return;
    }

    try {
      setCreatingGroup(true);
      const res = await chatService.createGroupThread({
        title: groupTitle.trim(),
        participantIds: selectedGroupMemberIds,
      });
      const group = unpack(res);
      setNewGroupModalOpen(false);
      await loadThreads();
      if (group?.id) {
        setActiveThreadId(group.id);
      }
      addToast(`Group "${groupTitle}" created successfully`, 'success');
    } catch (err) {
      console.error('[CHAT] Group creation error:', err);
      addToast(err.response?.data?.message || 'Failed to create group', 'error');
    } finally {
      setCreatingGroup(false);
    }
  };

  // --------------------------------------------------------------------------
  // 9. Modals: Group Participants & Management
  // --------------------------------------------------------------------------
  const openGroupDetailsModal = async () => {
    if (!activeThreadId) return;
    setGroupDetailsModalOpen(true);
    setAddMemberUserId('');
    try {
      setLoadingParticipants(true);
      const res = await chatService.getThreadParticipants(activeThreadId);
      const pRaw = unpack(res);
      setParticipants(Array.isArray(pRaw) ? pRaw : []);
      // Load contacts for add member dropdown
      const cRes = await chatService.getContacts();
      const cRaw = unpack(cRes);
      setContacts(Array.isArray(cRaw) ? cRaw : []);
    } catch (err) {
      console.error('[CHAT] Load participants error:', err);
    } finally {
      setLoadingParticipants(false);
    }
  };

  const handleAddMemberToGroup = async () => {
    if (!addMemberUserId || !activeThreadId) return;
    try {
      setAddingMember(true);
      await chatService.addParticipants(activeThreadId, [Number(addMemberUserId)]);
      setAddMemberUserId('');
      const res = await chatService.getThreadParticipants(activeThreadId);
      const pRaw = unpack(res);
      setParticipants(Array.isArray(pRaw) ? pRaw : []);
      addToast('Team member added to group', 'success');
    } catch (err) {
      console.error('[CHAT] Add member error:', err);
      addToast(err.response?.data?.message || 'Failed to add member', 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!activeThreadId || !window.confirm('Are you sure you want to leave this group?')) return;
    try {
      await chatService.removeParticipant(activeThreadId, user.id);
      setGroupDetailsModalOpen(false);
      addToast('You have left the group', 'info');
      await loadThreads();
      setActiveThreadId(null);
    } catch (err) {
      console.error('[CHAT] Leave group error:', err);
      addToast(err.response?.data?.message || 'Failed to leave group', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // Helpers: Filter Threads
  // --------------------------------------------------------------------------
  const filteredThreads = threads.filter((t) => {
    if (activeTab === 'DIRECT' && t.threadType !== 'DIRECT') return false;
    if (activeTab === 'GROUP' && t.threadType !== 'GROUP' && t.threadType !== 'PROPERTY_CHANNEL') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchMsg = t.lastMessage?.content?.toLowerCase().includes(q);
      return matchTitle || matchMsg;
    }
    return true;
  });

  const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Active typing user list for current thread
  const activeTypingList = Object.values(typingUsers).filter((u) => u.isTyping);

  return (
    <div className="staff-chat-container">
      {/* ==================================================================== */}
      {/* LEFT SIDEBAR: THREAD LIST                                            */}
      {/* ==================================================================== */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-title-row">
            <h2>Team Messages</h2>
            <div className="chat-action-buttons">
              <button
                type="button"
                className="chat-btn-action"
                onClick={openNewDirectModal}
                title="Start a 1-to-1 direct conversation"
              >
                <span>+</span> DM
              </button>
              <button
                type="button"
                className="chat-btn-action"
                onClick={openNewGroupModal}
                title="Create a new team group"
              >
                <span>+</span> Group
              </button>
            </div>
          </div>

          <div className="chat-search-box">
            <span className="chat-search-icon">🔍</span>
            <input
              type="text"
              className="chat-search-input"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="chat-filter-tabs">
            <button
              type="button"
              className={`chat-filter-tab ${activeTab === 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveTab('ALL')}
            >
              All
            </button>
            <button
              type="button"
              className={`chat-filter-tab ${activeTab === 'DIRECT' ? 'active' : ''}`}
              onClick={() => setActiveTab('DIRECT')}
            >
              Direct
            </button>
            <button
              type="button"
              className={`chat-filter-tab ${activeTab === 'GROUP' ? 'active' : ''}`}
              onClick={() => setActiveTab('GROUP')}
            >
              Groups
            </button>
          </div>
        </div>

        <div className="chat-threads-list">
          {loadingThreads && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              Loading conversations...
            </div>
          )}

          {!loadingThreads && filteredThreads.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
              No conversations found. Click <strong>+ DM</strong> or <strong>+ Group</strong> to begin!
            </div>
          )}

          {!loadingThreads &&
            filteredThreads.map((thread) => {
              const isDirect = thread.threadType === 'DIRECT';
              const isGroup = thread.threadType === 'GROUP' || thread.threadType === 'PROPERTY_CHANNEL';
              const otherUser = thread.otherParticipant;
              const isOnline = otherUser ? onlineUserIds.has(Number(otherUser.id)) : false;
              const initial = thread.title ? thread.title.charAt(0).toUpperCase() : 'T';

              return (
                <div
                  key={thread.id}
                  className={`chat-thread-item ${activeThreadId === thread.id ? 'active' : ''}`}
                  onClick={() => setActiveThreadId(thread.id)}
                >
                  <div className="chat-avatar-wrapper">
                    <div className={`chat-avatar ${isGroup ? 'group' : ''}`}>
                      {isGroup ? '👥' : initial}
                    </div>
                    {isDirect && (
                      <span className={`chat-presence-dot ${isOnline ? 'online' : 'offline'}`} />
                    )}
                  </div>

                  <div className="chat-thread-info">
                    <div className="chat-thread-header-row">
                      <span className="chat-thread-name">{thread.title}</span>
                      <span className="chat-thread-time">
                        {formatTime(thread.lastMessage?.createdAt || thread.lastMessageAt)}
                      </span>
                    </div>

                    <div className="chat-thread-preview-row">
                      <span className="chat-thread-preview">
                        {thread.lastMessage
                          ? `${thread.lastMessage.senderName ? `${thread.lastMessage.senderName.split(' ')[0]}: ` : ''}${thread.lastMessage.content}`
                          : 'No messages yet'}
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

      {/* ==================================================================== */}
      {/* RIGHT MAIN PANE: ACTIVE CONVERSATION                                 */}
      {/* ==================================================================== */}
      <main className="chat-main-pane">
        {activeThread ? (
          <>
            {/* Thread Header */}
            <header className="chat-pane-header">
              <div className="chat-header-identity">
                <div className={`chat-avatar ${activeThread.threadType === 'GROUP' ? 'group' : ''}`}>
                  {activeThread.threadType === 'GROUP' ? '👥' : activeThread.title?.charAt(0).toUpperCase()}
                </div>
                <div className="chat-header-details">
                  <h3>
                    {activeThread.title}
                    <span className="chat-role-chip">{activeThread.threadType}</span>
                  </h3>
                  <p>
                    {activeThread.threadType === 'DIRECT' && activeThread.otherParticipant && (
                      <>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: onlineUserIds.has(Number(activeThread.otherParticipant.id))
                              ? '#10b981'
                              : '#64748b',
                            marginRight: 5,
                          }}
                        />
                        {onlineUserIds.has(Number(activeThread.otherParticipant.id))
                          ? 'Active Now'
                          : 'Offline'}{' '}
                        • {activeThread.otherParticipant.role} •{' '}
                        {activeThread.propertyName || 'BFA Headquarters'}
                      </>
                    )}
                    {(activeThread.threadType === 'GROUP' || activeThread.threadType === 'PROPERTY_CHANNEL') && (
                      <>
                        Team Channel • {activeThread.participantsCount || 'Multi'} members • Persistent file storage enabled
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="chat-header-actions">
                {(activeThread.threadType === 'GROUP' || activeThread.threadType === 'PROPERTY_CHANNEL') && (
                  <button
                    type="button"
                    className="chat-btn-header"
                    onClick={openGroupDetailsModal}
                    title="View and manage group participants"
                  >
                    👥 Manage Members
                  </button>
                )}
              </div>
            </header>

            {/* Messages Scrollable History */}
            <div className="chat-messages-container">
              {loadingMessages && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Loading message history...
                </div>
              )}

              {!loadingMessages && messages.length === 0 && (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">💬</div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>No Messages Yet</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', maxWidth: 360 }}>
                    Say hello, share apartment documents, or send photos to start collaborating.
                  </p>
                </div>
              )}

              {!loadingMessages &&
                messages.map((msg) => {
                  const isSystem = msg.messageType === 'SYSTEM_NOTICE';
                  const isOutgoing = Number(msg.sender?.id || msg.senderId) === Number(user?.id);

                  if (isSystem) {
                    return (
                      <div key={msg.id || msg.clientTempId} className="chat-msg-row system">
                        <div className="chat-system-bubble">{msg.content}</div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id || msg.clientTempId}
                      className={`chat-msg-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
                    >
                      {!isOutgoing && (
                        <div className="chat-sender-label">
                          <span>{msg.sender?.name || 'Staff Member'}</span>
                          <span className="chat-role-chip">{msg.sender?.role || 'STAFF'}</span>
                        </div>
                      )}

                      <div className="chat-msg-bubble">
                        {/* Text message content */}
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                        {/* Image attachment */}
                        {msg.attachment && msg.attachment.fileType?.startsWith('image/') && (
                          <div className="chat-attachment-card">
                            <img
                              src={msg.attachment.url}
                              alt={msg.attachment.originalName || 'Photo'}
                              className="chat-attachment-img-preview"
                              onClick={() => setLightboxImage(msg.attachment)}
                            />
                          </div>
                        )}

                        {/* Document attachment */}
                        {msg.attachment && !msg.attachment.fileType?.startsWith('image/') && (
                          <div className="chat-doc-card">
                            <span style={{ fontSize: '1.4rem' }}>📄</span>
                            <div className="chat-doc-info">
                              <div className="chat-doc-name">{msg.attachment.originalName}</div>
                              <div className="chat-doc-size">{formatFileSize(msg.attachment.fileSize)}</div>
                            </div>
                            <a
                              href={msg.attachment.downloadUrl}
                              download={msg.attachment.originalName}
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
                          <span>{formatTime(msg.createdAt)}</span>
                          {isOutgoing && (
                            <span title={msg.isRead ? 'Read' : 'Delivered'}>
                              {msg.isRead ? '✓✓' : '✓'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

              {/* Real-Time Typing Bubble */}
              {activeTypingList.length > 0 && (
                <div className="chat-typing-indicator">
                  <div className="chat-typing-dots">
                    <span className="chat-typing-dot" />
                    <span className="chat-typing-dot" />
                    <span className="chat-typing-dot" />
                  </div>
                  <span>
                    {activeTypingList.map((u) => u.userName).join(', ')}{' '}
                    {activeTypingList.length === 1 ? 'is' : 'are'} typing...
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Attachment Preview Bar above Composer */}
            {pendingAttachment && (
              <div className="chat-composer-attachment-preview">
                <div className="chat-composer-att-badge">
                  <span>{pendingAttachment.fileType.startsWith('image/') ? '📷' : '📎'}</span>
                  <strong>{pendingAttachment.originalName}</strong>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                    ({formatFileSize(pendingAttachment.fileSize)})
                  </span>
                </div>
                <button
                  type="button"
                  className="chat-btn-remove-att"
                  onClick={() => setPendingAttachment(null)}
                >
                  ✕ Remove
                </button>
              </div>
            )}

            {/* Message Composer */}
            <form className="chat-composer" onSubmit={handleSendMessage}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={handleFileSelect}
              />

              <button
                type="button"
                className="chat-composer-btn-attach"
                onClick={() => fileInputRef.current?.click()}
                title="Attach photo or document (Max 15MB)"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              <textarea
                className="chat-composer-textarea"
                rows="1"
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                value={messageText}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
              />

              <button
                type="submit"
                className="chat-composer-btn-send"
                disabled={sending || (!messageText.trim() && !pendingAttachment)}
              >
                <span>Send</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </>
        ) : (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">✉️</div>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem 0' }}>BFA Staff Communications</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', maxWidth: 420 }}>
              Select a conversation from the left sidebar, or initiate a new direct message or group chat to begin collaborating in real-time.
            </p>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* MODAL 1: NEW DIRECT MESSAGE (CONTACTS DIRECTORY)                      */}
      {/* ==================================================================== */}
      {newDirectModalOpen && (
        <div className="chat-modal-overlay" onClick={() => setNewDirectModalOpen(false)}>
          <div className="chat-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Start Direct Conversation</h3>
              <button
                type="button"
                className="chat-modal-close-btn"
                onClick={() => setNewDirectModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '0.85rem 1.25rem 0.25rem' }}>
              <input
                type="text"
                className="chat-search-input"
                placeholder="Search staff by name or email..."
                value={contactsSearch}
                onChange={(e) => setContactsSearch(e.target.value)}
              />
            </div>

            <div className="chat-modal-body">
              {loadingContacts && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  Loading staff directory...
                </div>
              )}

              {!loadingContacts && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {contacts
                    .filter((c) => {
                      if (!contactsSearch.trim()) return true;
                      const q = contactsSearch.toLowerCase();
                      return (
                        c.name?.toLowerCase().includes(q) ||
                        c.email?.toLowerCase().includes(q) ||
                        c.role?.toLowerCase().includes(q)
                      );
                    })
                    .map((contact) => {
                      const isOnline = onlineUserIds.has(Number(contact.id));
                      return (
                        <div
                          key={contact.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            background: 'rgba(30, 41, 59, 0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div className="chat-avatar-wrapper">
                              <div className="chat-avatar">
                                {contact.name?.charAt(0).toUpperCase()}
                              </div>
                              <span
                                className={`chat-presence-dot ${isOnline ? 'online' : 'offline'}`}
                              />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#fff' }}>
                                {contact.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                <span className="chat-role-chip">{contact.role}</span> •{' '}
                                {contact.propertyName || 'Headquarters'}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="chat-btn-action"
                            onClick={() => handleStartDirectChat(contact.id)}
                          >
                            💬 Message
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: CREATE NEW GROUP                                            */}
      {/* ==================================================================== */}
      {newGroupModalOpen && (
        <div className="chat-modal-overlay" onClick={() => setNewGroupModalOpen(false)}>
          <div className="chat-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Create Team Group</h3>
              <button
                type="button"
                className="chat-modal-close-btn"
                onClick={() => setNewGroupModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroup}>
              <div className="chat-modal-body">
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.4rem' }}>
                    Group Name / Channel Title *
                  </label>
                  <input
                    type="text"
                    className="chat-search-input"
                    style={{ paddingLeft: '0.85rem' }}
                    placeholder="e.g. Front Desk & Housekeeping Sync"
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.4rem' }}>
                    Select Team Participants ({selectedGroupMemberIds.length} selected)
                  </label>
                  <input
                    type="text"
                    className="chat-search-input"
                    placeholder="Filter staff members..."
                    value={contactsSearch}
                    onChange={(e) => setContactsSearch(e.target.value)}
                  />
                </div>

                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                  {contacts
                    .filter((c) => {
                      if (!contactsSearch.trim()) return true;
                      const q = contactsSearch.toLowerCase();
                      return c.name?.toLowerCase().includes(q) || c.role?.toLowerCase().includes(q);
                    })
                    .map((contact) => {
                      const isChecked = selectedGroupMemberIds.includes(contact.id);
                      return (
                        <label
                          key={contact.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            background: isChecked ? 'rgba(59, 130, 246, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                            cursor: 'pointer',
                            border: `1px solid ${isChecked ? 'rgba(59, 130, 246, 0.4)' : 'transparent'}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleGroupMember(contact.id)}
                          />
                          <div className="chat-avatar" style={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                            {contact.name?.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff' }}>
                              {contact.name}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                              <span className="chat-role-chip">{contact.role}</span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="chat-modal-footer">
                <button
                  type="button"
                  className="chat-btn-header"
                  onClick={() => setNewGroupModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="chat-composer-btn-send"
                  disabled={creatingGroup || !groupTitle.trim() || selectedGroupMemberIds.length === 0}
                >
                  {creatingGroup ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: GROUP PARTICIPANTS & MANAGEMENT                             */}
      {/* ==================================================================== */}
      {groupDetailsModalOpen && (
        <div className="chat-modal-overlay" onClick={() => setGroupDetailsModalOpen(false)}>
          <div className="chat-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Group Participants</h3>
              <button
                type="button"
                className="chat-modal-close-btn"
                onClick={() => setGroupDetailsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="chat-modal-body">
              {/* Add Member Dropdown */}
              <div style={{ marginBottom: '1.25rem', padding: '0.85rem', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#fff', marginBottom: '0.4rem' }}>
                  Add Member to Group
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="chat-search-input"
                    style={{ paddingLeft: '0.85rem' }}
                    value={addMemberUserId}
                    onChange={(e) => setAddMemberUserId(e.target.value)}
                  >
                    <option value="">-- Choose staff member --</option>
                    {contacts
                      .filter((c) => !participants.some((p) => p.userId === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.role})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="chat-composer-btn-send"
                    onClick={handleAddMemberToGroup}
                    disabled={!addMemberUserId || addingMember}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Members List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {loadingParticipants && (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>
                    Loading group roster...
                  </div>
                )}
                {!loadingParticipants &&
                  participants.map((p) => (
                    <div
                      key={p.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        background: 'rgba(30, 41, 59, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div className="chat-avatar" style={{ width: 34, height: 34, fontSize: '0.85rem' }}>
                          {p.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff' }}>
                            {p.name} {p.userId === user?.id ? '(You)' : ''}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                            <span className="chat-role-chip">{p.userRole || 'STAFF'}</span> •{' '}
                            {p.participantRole === 'ADMIN' ? '👑 Admin' : 'Member'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="chat-modal-footer">
              <button
                type="button"
                className="chat-btn-remove-att"
                onClick={handleLeaveGroup}
              >
                Leave Group
              </button>
              <button
                type="button"
                className="chat-btn-header"
                onClick={() => setGroupDetailsModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: IMAGE LIGHTBOX PREVIEW                                      */}
      {/* ==================================================================== */}
      {lightboxImage && (
        <div className="chat-modal-overlay" onClick={() => setLightboxImage(null)}>
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: '#0f172a',
              borderRadius: '12px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.75rem', alignItems: 'center' }}>
              <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{lightboxImage.originalName}</strong>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a
                  href={lightboxImage.downloadUrl}
                  download={lightboxImage.originalName}
                  className="chat-btn-download"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ⬇ Download
                </a>
                <button
                  type="button"
                  className="chat-modal-close-btn"
                  onClick={() => setLightboxImage(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.originalName}
              style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
