import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSocket } from '../../services/socket';
import chatService from '../../services/chatService';
import {
  MessageSquare,
  X,
  Minimize2,
  Circle,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import '../../styles/staffChat.css';
import InChatOperationModal from './InChatOperationModal';
import InChatOperationDetailsModal from './InChatOperationDetailsModal';
import ChatConversationSidebar from './ChatConversationSidebar';
import ChatConversationHeader from './ChatConversationHeader';
import ChatMessageItem from './ChatMessageItem';
import ChatMessageComposer from './ChatMessageComposer';
import { parseChatMessage } from './chatMessageParser';

const ALLOWED_CHAT_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'OWNER',
  'OPERATIONS_MANAGER',
  'MANAGER',
  'RECEPTIONIST',
  'STAFF',
];

function unpack(res, fallback = null) {
  if (!res) return fallback;
  if (res.data !== undefined) return res.data;
  return res;
}

export default function FloatingStaffChatModal() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const isEligible = Boolean(user && ALLOWED_CHAT_ROLES.includes(user.role));

  const [isOpen, setIsOpen] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);

  // Core Chat State
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'OPERATIONS' | 'DIRECT' | 'GROUP'

  // Mobile View Navigation: 'LIST' or 'CHAT'
  const [mobileView, setMobileView] = useState('LIST');
  const [isMobileScreen, setIsMobileScreen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Presence & Typing State
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimeoutRef = useRef(null);

  // Contacts & Directory
  const [contacts, setContacts] = useState([]);
  const [contactsSearch, setContactsSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Modals inside Chat
  const [newDirectModalOpen, setNewDirectModalOpen] = useState(false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Group Participants & Management
  const [groupDetailsModalOpen, setGroupDetailsModalOpen] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // Delete Group Confirmation
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  // Priority, Notice & Circular States
  const [selectedPriority, setSelectedPriority] = useState('NORMAL'); // 'NORMAL' | 'IMPORTANT' | 'URGENT'
  const [pendingNotices, setPendingNotices] = useState([]);
  const [noticesModalOpen, setNoticesModalOpen] = useState(false);
  const [circularModalOpen, setCircularModalOpen] = useState(false);
  const [circularForm, setCircularForm] = useState({ title: '', content: '', priority: 'IMPORTANT' });
  const [broadcastingCircular, setBroadcastingCircular] = useState(false);

  // In-Chat Central Operations States
  const [operationModalOpen, setOperationModalOpen] = useState(false);
  const [viewingOperationId, setViewingOperationId] = useState(null);
  const canInitiateOperation = Boolean(
    user && ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(user.role)
  );
  const canCreateGroup = canInitiateOperation;

  // Attachments & Lightbox
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  const messagesEndRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const messagesCacheRef = useRef({});
  const activeThreadIdRef = useRef(activeThreadId);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) {
      setActiveThread(null);
      return;
    }
    const th = threads.find((t) => Number(t.id) === Number(activeThreadId));
    setActiveThread(th || null);
  }, [activeThreadId, threads]);

  // ───────────────────────────────────────────────────────────────────────────
  // Unread Count & Pending Notices
  // ───────────────────────────────────────────────────────────────────────────
  const fetchUnread = useCallback(async () => {
    if (!isEligible) return;
    try {
      const res = await chatService.getUnreadCount();
      const raw = unpack(res);
      setUnreadTotal(Number(raw?.totalUnread || 0));
    } catch {
      // Ignore background errors
    }
  }, [isEligible]);

  useEffect(() => {
    if (isEligible) {
      fetchUnread();
      const interval = setInterval(fetchUnread, 45000);
      return () => clearInterval(interval);
    }
  }, [isEligible, fetchUnread]);

  const fetchPendingNotices = useCallback(async () => {
    if (!isEligible) return;
    try {
      const res = await chatService.getImportantPendingNotices();
      const raw = unpack(res);
      setPendingNotices(raw?.notices || []);
    } catch {
      // Ignore background errors
    }
  }, [isEligible]);

  useEffect(() => {
    if (isEligible) {
      fetchPendingNotices();
      const interval = setInterval(fetchPendingNotices, 60000);
      return () => clearInterval(interval);
    }
  }, [isEligible, fetchPendingNotices]);

  // ───────────────────────────────────────────────────────────────────────────
  // Global Event Listener to Open/Toggle Chat Modal
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleOpenEvent = (e) => {
      setIsOpen(true);
      if (e.detail?.threadId) {
        setActiveThreadId(e.detail.threadId);
        setMobileView('CHAT');
      } else if (window.innerWidth <= 768) {
        setMobileView('LIST');
      }
    };
    window.addEventListener('bfa:open-chat', handleOpenEvent);
    return () => window.removeEventListener('bfa:open-chat', handleOpenEvent);
  }, []);

  // Outside click closes floating panel (unless inside a sub-modal or lightbox)
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e) => {
      if (
        (panelRef.current && panelRef.current.contains(e.target)) ||
        (triggerRef.current && triggerRef.current.contains(e.target)) ||
        e.target.closest('.chat-modal-overlay') ||
        e.target.closest('.chat-modal-backdrop') ||
        e.target.closest('.chat-lightbox-backdrop')
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  // ───────────────────────────────────────────────────────────────────────────
  // Load Threads & Cached Messages
  // ───────────────────────────────────────────────────────────────────────────
  const loadThreads = useCallback(async () => {
    if (!isEligible) return;
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
      console.warn('[ChatModal] Threads load error:', err.message);
    } finally {
      setLoadingThreads(false);
    }
  }, [isEligible]);

  useEffect(() => {
    if (isOpen && isEligible) {
      setLoadingThreads(true);
      loadThreads();
    }
  }, [isOpen, isEligible, loadThreads]);

  const loadMessages = useCallback(
    async (threadId) => {
      if (!threadId || !isEligible) return;
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
        if (Number(activeThreadIdRef.current) === Number(threadId)) {
          setMessages(msgs);
        }

        if (msgs.length > 0) {
          const latestMsg = msgs[msgs.length - 1];
          chatService.markAsRead(threadId, latestMsg.id).catch(() => {});
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('message:read', { threadId, messageId: latestMsg.id });
          }
          setThreads((prev) =>
            prev.map((t) => (Number(t.id) === Number(threadId) ? { ...t, unreadCount: 0, unread_count: 0 } : t))
          );
          fetchUnread();
        }
      } catch (err) {
        console.warn('[ChatModal] Message load error:', err.message);
      } finally {
        if (Number(activeThreadIdRef.current) === Number(threadId)) {
          setLoadingMessages(false);
        }
      }
    },
    [isEligible, fetchUnread]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    loadMessages(activeThreadId);
  }, [isOpen, activeThreadId, loadMessages]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingUsers, isOpen]);

  // ───────────────────────────────────────────────────────────────────────────
  // Socket.IO Real-Time Lifecycle (Full Parity with StaffChatPage)
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEligible) return;
    const socket = getSocket();
    if (!socket) return;

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
        if (data.status === 'ONLINE') next.add(uId);
        else next.delete(uId);
        return next;
      });
    };

    const updateThreadPreview = (threadId, message, isCurrentlyViewing) => {
      setThreads((prev) => {
        const existing = prev.find((t) => Number(t.id) === Number(threadId));
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
          last_message_preview: message.content || (message.messageType === 'IMAGE' ? '📷 Photo' : '📎 Attachment'),
          last_message_at: message.createdAt,
          unreadCount: isCurrentlyViewing ? 0 : Number(existing.unreadCount ?? existing.unread_count ?? 0) + 1,
          unread_count: isCurrentlyViewing ? 0 : Number(existing.unread_count ?? existing.unreadCount ?? 0) + 1,
        };
        return [updated, ...prev.filter((t) => Number(t.id) !== Number(threadId))];
      });
    };

    const handleMessageDelivered = (payload) => {
      const { threadId, message } = payload || {};
      if (!threadId || !message) return;
      const isViewing = isOpen && Number(threadId) === Number(activeThreadIdRef.current);

      if (Number(threadId) === Number(activeThreadIdRef.current)) {
        setMessages((prev) => {
          const next = prev.some(
            (m) => m.id === message.id || (message.clientTempId && m.clientTempId === message.clientTempId)
          )
            ? prev.map((m) => (m.clientTempId === message.clientTempId ? message : m))
            : [...prev, message];
          messagesCacheRef.current[threadId] = next;
          return next;
        });

        if (isViewing) {
          chatService.markAsRead(threadId, message.id).catch(() => {});
          socket.emit('message:read', { threadId, messageId: message.id });
        }
      }

      updateThreadPreview(threadId, message, isViewing);
      fetchUnread();
    };

    const handleNewIncoming = (payload) => {
      const { threadId, message } = payload || {};
      if (!threadId || !message) return;
      const isViewing = isOpen && Number(threadId) === Number(activeThreadIdRef.current);
      if (Number(threadId) !== Number(activeThreadIdRef.current)) {
        updateThreadPreview(threadId, message, isViewing);
      }
      fetchUnread();
    };

    const handleTypingStatus = (data) => {
      if (Number(data?.threadId) === Number(activeThreadIdRef.current) && Number(data.userId) !== Number(user?.id)) {
        setTypingUsers((prev) => ({
          ...prev,
          [data.userId]: { userName: data.userName, isTyping: data.isTyping },
        }));
      }
    };

    const handleReceiptUpdated = (data) => {
      if (Number(data?.threadId) === Number(activeThreadIdRef.current) && Number(data.userId) !== Number(user?.id)) {
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
      if (Number(activeThreadIdRef.current) === delId) {
        setActiveThreadId(null);
        setMessages([]);
        setMobileView('LIST');
        addToast(
          `Group "${data.title || 'Conversation'}" was deleted by ${data.deletedByName || 'an administrator'}.`,
          'info'
        );
      }
    };

    socket.on('presence:state', handlePresenceState);
    socket.on('presence:change', handlePresenceChange);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:new_incoming', handleNewIncoming);
    socket.on('typing:status', handleTypingStatus);
    socket.on('message:receipt_updated', handleReceiptUpdated);
    socket.on('thread:deleted', handleThreadDeleted);

    if (activeThreadId && isOpen) {
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
  }, [activeThreadId, isEligible, isOpen, user?.id, loadThreads, fetchUnread, addToast]);

  // ───────────────────────────────────────────────────────────────────────────
  // Composer & Attachments
  // ───────────────────────────────────────────────────────────────────────────
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

  const handleSelectFile = (file) => {
    if (!file) return;
    const MAX_SIZE = 15 * 1024 * 1024;
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
        fileData: event.target.result,
      });
    };
    reader.onerror = () => addToast('Failed to read selected file', 'error');
    reader.readAsDataURL(file);
  };

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
      priority: selectedPriority,
      attachment: pendingAttachment
        ? {
            originalName: pendingAttachment.originalName,
            fileType: pendingAttachment.fileType,
            fileSize: pendingAttachment.fileSize,
          }
        : null,
      sender: { id: user.id, name: user.name, role: user.role },
      createdAt: new Date().toISOString(),
      isSending: true,
    };

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
      const res = await chatService.sendMessage(activeThreadId, {
        clientTempId,
        content: tempPayload.content,
        messageType: tempPayload.messageType,
        priority: selectedPriority,
        attachment: attToSend,
      });
      const confirmedMsg = unpack(res);
      if (confirmedMsg) {
        setMessages((prev) => {
          const next = prev.map((m) => (m.clientTempId === clientTempId ? confirmedMsg : m));
          messagesCacheRef.current[activeThreadId] = next;
          return next;
        });
      }
      setSelectedPriority('NORMAL');
    } catch (err) {
      addToast('Failed to send message: ' + (err.response?.data?.message || err.message), 'error');
      setMessages((prev) => prev.filter((m) => m.clientTempId !== clientTempId));
    } finally {
      setSending(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Notices & Circulars
  // ───────────────────────────────────────────────────────────────────────────
  const handleAcknowledgeMessage = async (messageId) => {
    try {
      await chatService.acknowledgeMessage(messageId);
      addToast('Notice formally acknowledged and verified', 'success');
      setPendingNotices((prev) => prev.filter((n) => n.id !== messageId));
      fetchPendingNotices();
      if (activeThreadId) loadMessages(activeThreadId);
    } catch (err) {
      addToast(err.message || 'Failed to acknowledge notice', 'error');
    }
  };

  const handleBroadcastCircular = async (e) => {
    e.preventDefault();
    if (!circularForm.title || !circularForm.content) {
      addToast('Please provide circular title and text', 'error');
      return;
    }
    setBroadcastingCircular(true);
    try {
      await chatService.broadcastCircular(circularForm);
      addToast('Executive circular broadcasted to company staff!', 'success');
      setCircularModalOpen(false);
      setCircularForm({ title: '', content: '', priority: 'IMPORTANT' });
      loadThreads();
    } catch (err) {
      addToast(err.message || 'Failed to broadcast circular', 'error');
    } finally {
      setBroadcastingCircular(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Contacts, Direct Message, Group Creation & Participants
  // ───────────────────────────────────────────────────────────────────────────
  const openNewDirectModal = async () => {
    setNewDirectModalOpen(true);
    setContactsSearch('');
    try {
      setLoadingContacts(true);
      const res = await chatService.getContacts();
      const raw = unpack(res);
      setContacts(Array.isArray(raw) ? raw : []);
    } catch {
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
      addToast(err.response?.data?.message || 'Failed to start chat', 'error');
    }
  };

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
    } catch {
      addToast('Failed to load contacts directory', 'error');
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
      addToast(err.response?.data?.message || 'Failed to create group', 'error');
    } finally {
      setCreatingGroup(false);
    }
  };

  const openGroupDetailsModal = async () => {
    if (!activeThreadId) return;
    setGroupDetailsModalOpen(true);
    setAddMemberUserId('');
    try {
      setLoadingParticipants(true);
      const [pRes, cRes] = await Promise.all([
        chatService.getThreadParticipants(activeThreadId),
        chatService.getContacts(),
      ]);
      const pRaw = unpack(pRes);
      const cRaw = unpack(cRes);
      setParticipants(Array.isArray(pRaw) ? pRaw : []);
      setContacts(Array.isArray(cRaw) ? cRaw : []);
    } catch (err) {
      console.error('[ChatModal] Load participants error:', err);
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
      addToast(err.response?.data?.message || 'Failed to leave group', 'error');
    }
  };

  if (!isEligible) return null;

  const activeTypingList = Object.values(typingUsers).filter((u) => u.isTyping);

  return (
    <>
      {/* 1. Floating Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="floating-chat-trigger-btn"
        aria-label="Open Staff Collaboration Chat"
        title="Staff Collaboration & Operations Chat"
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
        {unreadTotal > 0 && !isOpen && (
          <span className="floating-chat-unread-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
        )}
      </button>

      {/* 2. Main Floating Staff Chat Modal */}
      {isOpen && (
        <div
          ref={panelRef}
          className="floating-chat-window"
          style={{
            width: isMobileScreen ? '100vw' : 'min(1040px, calc(100vw - 48px))',
            height: isMobileScreen ? '100dvh' : 'min(740px, calc(100vh - 110px))',
          }}
          role="dialog"
          aria-label="Staff Collaboration & Operations Chat"
        >
          {/* Top Modal Chrome Bar */}
          <div className="floating-chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <MessageSquare size={18} style={{ color: '#d4af37', flexShrink: 0 }} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: isMobileScreen ? '0.88rem' : '0.95rem',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {isMobileScreen ? 'Staff Operations' : 'Staff Collaboration & Operations'}
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                }}
              >
                <Circle size={6} fill="#34d399" /> LIVE
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {canInitiateOperation && (
                <button
                  type="button"
                  onClick={() => setOperationModalOpen(true)}
                  className="chat-btn-glass-gold"
                  title="Initiate Formal Central Operation Directive"
                >
                  ⚡ {isMobileScreen ? 'Operation' : 'Initiate Operation'}
                </button>
              )}
              {!isMobileScreen && user?.role === 'OWNER' && (
                <button
                  type="button"
                  onClick={() => setCircularModalOpen(true)}
                  className="chat-btn-glass"
                  title="Broadcast Executive Circular to all Staff"
                >
                  📢 Circular
                </button>
              )}
              {!isMobileScreen && (
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="chat-btn-glass"
                  style={{ padding: '6px 8px' }}
                  title="Minimize chat"
                >
                  <Minimize2 size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="chat-btn-glass"
                style={{ padding: '6px 8px', color: '#f87171' }}
                title="Close chat window"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Pending Operational Notices Banner */}
          {pendingNotices.length > 0 && (
            <div
              style={{
                padding: '8px 14px',
                background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.25), rgba(245, 158, 11, 0.25))',
                borderBottom: '1px solid rgba(245, 158, 11, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                color: '#fbbf24',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={15} style={{ color: '#ef4444' }} />
                <span>
                  You have <strong>{pendingNotices.length}</strong> unacknowledged operational notice
                  {pendingNotices.length > 1 ? 's' : ''}.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setNoticesModalOpen(true)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: '#fbbf24',
                  color: '#000000',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Review &amp; Sign
              </button>
            </div>
          )}

          {/* Main Split Body: Modular Sidebar + Active Chat Pane */}
          <div className="floating-chat-body" style={{ minHeight: 0 }}>
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

            <main className={`chat-main-pane ${mobileView === 'LIST' ? 'mobile-hidden' : ''}`}>
              {activeThread ? (
                <>
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
                        const prevSenderId = prevMsg ? prevMsg.sender?.id || prevMsg.senderId : null;
                        const currSenderId = msg.sender?.id || msg.senderId;
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
                            isGroupThread={['GROUP', 'PROPERTY_CHANNEL'].includes(
                              activeThread?.threadType || activeThread?.thread_type
                            )}
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

                  {/* Priority Picker Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 14px',
                      background: 'rgba(15, 23, 42, 0.75)',
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      fontSize: '0.72rem',
                      color: '#94a3b8',
                    }}
                  >
                    <span>Priority:</span>
                    {['NORMAL', 'IMPORTANT', 'URGENT'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSelectedPriority(p)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          border:
                            selectedPriority === p
                              ? p === 'URGENT'
                                ? '1px solid #ef4444'
                                : p === 'IMPORTANT'
                                ? '1px solid #f59e0b'
                                : '1px solid #38bdf8'
                              : '1px solid rgba(255,255,255,0.1)',
                          background:
                            selectedPriority === p
                              ? p === 'URGENT'
                                ? 'rgba(239,68,68,0.2)'
                                : p === 'IMPORTANT'
                                ? 'rgba(245,158,11,0.2)'
                                : 'rgba(56,189,248,0.15)'
                              : 'transparent',
                          color:
                            selectedPriority === p
                              ? p === 'URGENT'
                                ? '#fca5a5'
                                : p === 'IMPORTANT'
                                ? '#fcd34d'
                                : '#7dd3fc'
                              : '#94a3b8',
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

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
                  <p style={{ margin: 0, fontSize: '0.875rem', maxWidth: 400 }}>
                    Select a conversation or directive from the left sidebar, or start a new direct message or group chat.
                  </p>
                </div>
              )}
            </main>
          </div>
        </div>
      )}

      {/* MODAL 1: New Direct Conversation */}
      {newDirectModalOpen && (
        <div className="chat-modal-overlay" style={{ zIndex: 10050 }} onClick={() => setNewDirectModalOpen(false)}>
          <div className="chat-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Start Direct Conversation</h3>
              <button type="button" className="chat-modal-close-btn" onClick={() => setNewDirectModalOpen(false)}>
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
              {loadingContacts ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading staff directory...</div>
              ) : (
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
                              <div className="chat-avatar">{contact.name?.charAt(0).toUpperCase()}</div>
                              <span className={`chat-presence-dot ${isOnline ? 'online' : 'offline'}`} />
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

      {/* MODAL 2: Create New Team Group */}
      {newGroupModalOpen && (
        <div className="chat-modal-overlay" style={{ zIndex: 10050 }} onClick={() => setNewGroupModalOpen(false)}>
          <div className="chat-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Create Team Group</h3>
              <button type="button" className="chat-modal-close-btn" onClick={() => setNewGroupModalOpen(false)}>
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
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff' }}>{contact.name}</div>
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
                <button type="button" className="chat-btn-header" onClick={() => setNewGroupModalOpen(false)}>
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

      {/* MODAL 3: Group Participants & Management */}
      {groupDetailsModalOpen && (
        <div className="chat-modal-overlay" style={{ zIndex: 10050 }} onClick={() => setGroupDetailsModalOpen(false)}>
          <div className="chat-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Group Participants</h3>
              <button type="button" className="chat-modal-close-btn" onClick={() => setGroupDetailsModalOpen(false)}>
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
                {loadingParticipants ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8' }}>Loading group roster...</div>
                ) : (
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
                  ))
                )}
              </div>
            </div>
            <div className="chat-modal-footer">
              <button type="button" className="chat-btn-remove-att" onClick={handleLeaveGroup}>
                Leave Group
              </button>
              <button type="button" className="chat-btn-header" onClick={() => setGroupDetailsModalOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Pending Important Notices */}
      {noticesModalOpen && (
        <div className="chat-modal-overlay" style={{ zIndex: 10050 }} onClick={() => setNoticesModalOpen(false)}>
          <div className="chat-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Unacknowledged Operational Notices</h3>
              <button type="button" className="chat-modal-close-btn" onClick={() => setNoticesModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="chat-modal-body">
              {pendingNotices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                  All operational notices have been acknowledged.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {pendingNotices.map((notice) => (
                    <div
                      key={notice.id}
                      style={{
                        padding: '0.85rem',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <strong style={{ color: '#fbbf24', fontSize: '0.85rem' }}>
                          <AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                          {notice.priority || 'IMPORTANT'} NOTICE
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          {notice.senderName || 'Management'}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 0.75rem', fontSize: '0.84rem', color: '#f8fafc', lineHeight: 1.5 }}>
                        {notice.content}
                      </p>
                      <button
                        type="button"
                        className="chat-composer-btn-send"
                        onClick={() => handleAcknowledgeMessage(notice.id)}
                      >
                        ✓ Acknowledge &amp; Sign
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Executive Circular Broadcast (OWNER) */}
      {circularModalOpen && (
        <div className="chat-modal-overlay" style={{ zIndex: 10050 }} onClick={() => setCircularModalOpen(false)}>
          <div className="chat-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-header">
              <h3>Broadcast Executive Circular</h3>
              <button type="button" className="chat-modal-close-btn" onClick={() => setCircularModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleBroadcastCircular}>
              <div className="chat-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#f8fafc', marginBottom: '4px' }}>
                    Circular Title *
                  </label>
                  <input
                    type="text"
                    className="chat-search-input"
                    style={{ paddingLeft: '0.85rem' }}
                    value={circularForm.title}
                    onChange={(e) => setCircularForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Updated Check-In Protocol"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#f8fafc', marginBottom: '4px' }}>
                    Priority
                  </label>
                  <select
                    className="chat-search-input"
                    style={{ paddingLeft: '0.85rem' }}
                    value={circularForm.priority}
                    onChange={(e) => setCircularForm((p) => ({ ...p, priority: e.target.value }))}
                  >
                    <option value="IMPORTANT">IMPORTANT (Requires Acknowledgment)</option>
                    <option value="URGENT">URGENT</option>
                    <option value="NORMAL">NORMAL</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#f8fafc', marginBottom: '4px' }}>
                    Circular Content *
                  </label>
                  <textarea
                    rows={4}
                    className="chat-search-input"
                    style={{ padding: '0.75rem' }}
                    value={circularForm.content}
                    onChange={(e) => setCircularForm((p) => ({ ...p, content: e.target.value }))}
                    placeholder="Write official company-wide directive..."
                    required
                  />
                </div>
              </div>
              <div className="chat-modal-footer">
                <button type="button" className="chat-btn-header" onClick={() => setCircularModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="chat-composer-btn-send" disabled={broadcastingCircular}>
                  {broadcastingCircular ? 'Broadcasting...' : 'Broadcast Circular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: Image Lightbox */}
      {lightboxImage && (
        <div className="chat-modal-overlay chat-lightbox-backdrop" style={{ zIndex: 10060 }} onClick={() => setLightboxImage(null)}>
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
              <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{lightboxImage.originalName || 'Attachment'}</strong>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(lightboxImage.downloadUrl || lightboxImage.url) && (
                  <a
                    href={lightboxImage.downloadUrl || lightboxImage.url}
                    download={lightboxImage.originalName}
                    className="chat-btn-download"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ⬇ Download
                  </a>
                )}
                <button type="button" className="chat-modal-close-btn" onClick={() => setLightboxImage(null)}>
                  ✕
                </button>
              </div>
            </div>
            <img
              src={lightboxImage.url || lightboxImage.previewUrl}
              alt={lightboxImage.originalName || 'Chat preview'}
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
          if (activeThreadId) loadMessages(activeThreadId);
        }}
      />

      {/* Delete Group Confirmation Modal */}
      {deleteGroupTarget && (
        <div
          className="chat-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10060,
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
    </>
  );
}
