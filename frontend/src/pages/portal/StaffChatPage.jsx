import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSocket } from '../../services/socket';
import chatService from '../../services/chatService';
import '../../styles/staffChat.css';
import InChatOperationModal from '../../components/chat/InChatOperationModal';
import InChatOperationDetailsModal from '../../components/chat/InChatOperationDetailsModal';
import ChatConversationSidebar from '../../components/chat/ChatConversationSidebar';
import ChatConversationHeader from '../../components/chat/ChatConversationHeader';
import ChatMessageItem from '../../components/chat/ChatMessageItem';
import ChatMessageComposer from '../../components/chat/ChatMessageComposer';
import { parseChatMessage } from '../../components/chat/chatMessageParser';

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
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'OPERATIONS' | 'DIRECT' | 'GROUP'

  // Mobile View Navigation: 'LIST' or 'CHAT'
  const [mobileView, setMobileView] = useState('LIST');

  // Online Presence & Typing State
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({}); // userId -> { userName, isTyping }
  const typingTimeoutRef = useRef(null);

  // Composer State
  const [messageText, setMessageText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Modals
  const [newDirectModalOpen, setNewDirectModalOpen] = useState(false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [groupDetailsModalOpen, setGroupDetailsModalOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [operationModalOpen, setOperationModalOpen] = useState(false);
  const [viewingOperationId, setViewingOperationId] = useState(null);
  const canInitiateOperation = Boolean(
    user && ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(user.role)
  );
  const canCreateGroup = canInitiateOperation;
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

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
  // 1. Initial Load of Threads (stable callback — never re-fetches on DM switch)
  // --------------------------------------------------------------------------
  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const messagesCacheRef = useRef({});

  const loadThreads = useCallback(async () => {
    try {
      setLoadingThreads((prev) => prev || false);
      const res = await chatService.getThreads();
      const raw = unpack(res);
      const list = Array.isArray(raw) ? raw : [];
      setThreads(list);
      if (list.length > 0 && !activeThreadIdRef.current) {
        setActiveThreadId(list[0].id);
      }
    } catch (err) {
      console.error('[CHAT] Failed to load threads:', err);
      addToast('Failed to load conversation threads', 'error');
    } finally {
      setLoadingThreads(false);
    }
  }, [addToast]);

  useEffect(() => {
    setLoadingThreads(true);
    loadThreads();
  }, [loadThreads]);

  // --------------------------------------------------------------------------
  // 2. Load Messages for Active Thread (instant cache + silent background sync)
  // --------------------------------------------------------------------------
  const loadMessages = useCallback(async (threadId) => {
    if (!threadId) return;
    const cached = messagesCacheRef.current[threadId];
    if (cached) {
      setMessages(cached);
      setLoadingMessages(false);
    } else {
      setLoadingMessages(true);
    }
    try {
      const res = await chatService.getThreadHistory(threadId, { limit: 50 });
      const raw = unpack(res);
      const msgs = Array.isArray(raw) ? raw : [];
      messagesCacheRef.current[threadId] = msgs;
      if (activeThreadIdRef.current === threadId) {
        setMessages(msgs);
      }

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
      if (activeThreadIdRef.current === threadId) {
        setLoadingMessages(false);
      }
    }
  }, []);

  // Update activeThread details when activeThreadId or threads change
  useEffect(() => {
    if (!activeThreadId) {
      setActiveThread(null);
      return;
    }
    const th = threads.find((t) => t.id === activeThreadId);
    setActiveThread(th || null);
  }, [activeThreadId, threads]);

  // Load messages ONLY when activeThreadId changes (prevents re-fetching when unreadCount updates)
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

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
      if (data?.threadId === activeThreadId && Number(data.userId) !== Number(user?.id)) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id > data.lastReadMessageId) return m;
            const existingReaders = Array.isArray(m.readers) ? m.readers : [];
            const alreadyIn = existingReaders.some((r) => Number(r.userId) === Number(data.userId));
            const nextReaders = alreadyIn
              ? existingReaders
              : [
                  ...existingReaders,
                  {
                    userId: data.userId,
                    name: data.readerName || 'Team Member',
                    role: data.readerRole || 'STAFF',
                    photoUrl: data.readerPhotoUrl || null,
                    readAt: data.readAt || new Date().toISOString(),
                  },
                ];
            return {
              ...m,
              isRead: true,
              receiptStatus: 'READ',
              readCount: Math.max(m.readCount || 0, nextReaders.length),
              readers: nextReaders,
            };
          })
        );
      }
    };

    const handleThreadDeleted = (data) => {
      const delId = Number(data?.threadId);
      if (!delId) return;
      setThreads((prev) => prev.filter((t) => Number(t.id) !== delId));
      if (Number(activeThreadId) === delId) {
        setActiveThreadId(null);
        setMessages([]);
        setMobileView('LIST');
        addToast(`Group "${data.title || 'Conversation'}" was deleted by ${data.deletedByName || 'an administrator'}.`, 'info');
      }
    };

    socket.on('presence:state', handlePresenceState);
    socket.on('presence:change', handlePresenceChange);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:new_incoming', handleNewIncoming);
    socket.on('typing:status', handleTypingStatus);
    socket.on('message:receipt_updated', handleReceiptUpdated);
    socket.on('thread:deleted', handleThreadDeleted);

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
      socket.off('thread:deleted', handleThreadDeleted);
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
  const handleSelectFile = (file) => {
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
        setMobileView('CHAT');
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
        setMobileView('CHAT');
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
      setMobileView('LIST');
    } catch (err) {
      console.error('[CHAT] Leave group error:', err);
      addToast(err.response?.data?.message || 'Failed to leave group', 'error');
    }
  };

  const activeTypingList = Object.values(typingUsers).filter((u) => u.isTyping);

  return (
    <div className="staff-chat-container">
      {/* ==================================================================== */}
      {/* 1. LEFT SIDEBAR: CONVERSATION LIST (REDESIGNED)                       */}
      {/* ==================================================================== */}
      <ChatConversationSidebar
        className={mobileView === 'CHAT' ? 'mobile-hidden' : ''}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(id) => {
          setActiveThreadId(id);
          setMobileView('CHAT');
        }}
        loading={loadingThreads}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        canInitiateOperation={canInitiateOperation}
        canCreateGroup={canCreateGroup}
        onOpenOperationModal={() => setOperationModalOpen(true)}
        onOpenNewDirectModal={openNewDirectModal}
        onOpenNewGroupModal={openNewGroupModal}
        onlineUserIds={onlineUserIds}
      />

      {/* ==================================================================== */}
      {/* 2. MAIN ACTIVE CHAT PANE (REDESIGNED)                                */}
      {/* ==================================================================== */}
      <main className={`chat-main-pane ${mobileView === 'LIST' ? 'mobile-hidden' : ''}`}>
        {activeThread ? (
          <>
            {/* Conversation Header */}
            <ChatConversationHeader
              thread={activeThread}
              currentUser={user}
              onlineUserIds={onlineUserIds}
              canInitiateOperation={canInitiateOperation}
              canDeleteGroup={canCreateGroup}
              onOpenOperationModal={() => setOperationModalOpen(true)}
              onOpenGroupDetailsModal={openGroupDetailsModal}
              onDeleteGroup={(th) => setDeleteGroupTarget(th)}
              onBackToList={() => setMobileView('LIST')}
            />

            {/* Scrollable Message History with Distinct Visual Layouts */}
            <div className="chat-messages-container">
              {loadingMessages && messages.length === 0 && (
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

              {messages.length > 0 &&
                messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const prevSenderId = prevMsg ? (prevMsg.sender?.id || prevMsg.senderId) : null;
                  const currSenderId = msg.sender?.id || msg.senderId;

                  // Consecutive grouping: same sender within 3 minutes, neither is an official operation
                  const isSameSender = Boolean(
                    prevSenderId &&
                    Number(prevSenderId) === Number(currSenderId) &&
                    prevMsg?.createdAt &&
                    msg?.createdAt &&
                    Math.abs(new Date(msg.createdAt) - new Date(prevMsg.createdAt)) < 180000 &&
                    parseChatMessage(prevMsg).type === 'NORMAL' &&
                    parseChatMessage(msg).type === 'NORMAL'
                  );

                  return (
                    <ChatMessageItem
                      key={msg.id || msg.clientTempId || idx}
                      message={msg}
                      currentUser={user}
                      isGroupThread={['GROUP', 'PROPERTY_CHANNEL'].includes(activeThread?.threadType || activeThread?.thread_type)}
                      isPreviousSameSender={isSameSender}
                      onFeedbackSent={() => loadMessages(activeThreadId)}
                      onViewOperation={(opId) => {
                        setViewingOperationId(opId || msg.context_entity_id);
                      }}
                      onOperationUpdated={() => {
                        if (activeThreadId) loadMessages(activeThreadId);
                      }}
                      onImageClick={(att) => setLightboxImage(att)}
                    />
                  );
                })}

              <div ref={messagesEndRef} />
            </div>

            {/* Fixed Message Composer */}
            <ChatMessageComposer
              messageText={messageText}
              onTextChange={handleTextChange}
              onSendMessage={handleSendMessage}
              pendingAttachment={pendingAttachment}
              onRemoveAttachment={() => setPendingAttachment(null)}
              onSelectFile={handleSelectFile}
              sending={sending}
              typingUsers={activeTypingList}
            />
          </>
        ) : (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">✉️</div>
            <h3 style={{ color: '#fff', margin: '0 0 0.5rem 0' }}>BFA Staff Communications</h3>
            <p style={{ margin: 0, fontSize: '0.875rem', maxWidth: 420 }}>
              Select a conversation or directive from the left sidebar, or initiate a new direct message or group chat to begin collaborating in real-time.
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
                  href={lightboxImage.downloadUrl || lightboxImage.url}
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
              src={lightboxImage.url || lightboxImage.previewUrl}
              alt={lightboxImage.originalName}
              style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px' }}
            />
          </div>
        </div>
      )}

      {/* In-Chat Operation Initiation Modal */}
      <InChatOperationModal
        isOpen={operationModalOpen}
        onClose={() => setOperationModalOpen(false)}
        currentUser={user}
        activeThread={activeThread}
        onOperationCreated={(newOp) => {
          loadThreads();
          if (newOp?.chat_thread_id) {
            setActiveThreadId(newOp.chat_thread_id);
            setMobileView('CHAT');
          }
        }}
      />

      {/* In-Chat Operation Details & Memo Modal */}
      <InChatOperationDetailsModal
        isOpen={Boolean(viewingOperationId)}
        onClose={() => setViewingOperationId(null)}
        operationId={viewingOperationId}
        currentUser={user}
        onOperationUpdated={() => {
          if (activeThreadId) {
            loadMessages(activeThreadId);
          }
        }}
      />

      {/* Delete Group Confirmation Modal */}
      {deleteGroupTarget && (
        <div
          className="chat-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(10, 12, 18, 0.72)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="chat-modal-card"
            style={{
              width: '100%',
              maxWidth: '420px',
              background: '#111827',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '14px',
              padding: '20px',
              color: '#f8fafc',
            }}
          >
            <h3 style={{ margin: '0 0 8px', color: '#f87171' }}>Delete Group Conversation</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{deleteGroupTarget.title}</strong>? Active members will no longer
              see this group or be able to send messages to it. Audit history is preserved.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="chat-btn-header"
                onClick={() => setDeleteGroupTarget(null)}
                disabled={deletingGroup}
              >
                Cancel
              </button>
              <button
                type="button"
                className="chat-btn-action"
                disabled={deletingGroup}
                style={{ background: '#dc2626', borderColor: '#ef4444', color: '#fff' }}
                onClick={async () => {
                  setDeletingGroup(true);
                  try {
                    await chatService.deleteGroupThread(deleteGroupTarget.id);
                    setThreads((prev) => prev.filter((t) => Number(t.id) !== Number(deleteGroupTarget.id)));
                    if (Number(activeThreadId) === Number(deleteGroupTarget.id)) {
                      setActiveThreadId(null);
                      setMessages([]);
                    }
                    addToast(`Group "${deleteGroupTarget.title}" deleted.`, 'success');
                    setDeleteGroupTarget(null);
                  } catch (err) {
                    addToast(err.response?.data?.error?.message || err.message || 'Failed to delete group.', 'error');
                  } finally {
                    setDeletingGroup(false);
                  }
                }}
              >
                {deletingGroup ? 'Deleting...' : 'Delete Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
