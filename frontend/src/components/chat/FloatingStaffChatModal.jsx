import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getSocket } from '../../services/socket';
import chatService from '../../services/chatService';
import {
  MessageSquare,
  Send,
  Paperclip,
  Image as ImageIcon,
  Users,
  Search,
  Plus,
  X,
  Minimize2,
  FileText,
  Download,
  Check,
  CheckCheck,
  Clock,
  ChevronLeft,
  Circle,
  Eye,
  Info,
  ShieldAlert,
} from 'lucide-react';
import '../../styles/staffChat.css';
import InChatOperationModal from './InChatOperationModal';
import InChatOperationDetailsModal from './InChatOperationDetailsModal';
import OperationChatCard from './OperationChatCard';
import ChatMessageItem from './ChatMessageItem';
import { parseConversationTitle } from './chatMessageParser';

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

function formatThreadTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
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
  const [messages, setMessages] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [textInput, setTextInput] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [threadFilter, setThreadFilter] = useState('ALL'); // 'ALL' | 'OPERATIONS' | 'DIRECT' | 'GROUP'

  // Mobile View Navigation: 'LIST' or 'CHAT'
  const [mobileView, setMobileView] = useState('LIST');
  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Modals for Actions inside Chat
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [newDirectModalOpen, setNewDirectModalOpen] = useState(false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState([]);
  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
  const [participants, setParticipants] = useState([]);

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

  // Attachments State
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  // Presence & Typing State
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [typingUsersByThread, setTypingUsersByThread] = useState({});

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // ───────────────────────────────────────────────────────────────────────────
  // Unread Count Fetching & Socket Sync
  // ───────────────────────────────────────────────────────────────────────────
  const fetchUnread = useCallback(async () => {
    if (!isEligible) return;
    try {
      const res = await chatService.getUnreadCount();
      const raw = unpack(res);
      setUnreadTotal(Number(raw?.totalUnread || 0));
    } catch {
      // Ignore background unread check errors
    }
  }, [isEligible]);

  useEffect(() => {
    if (isEligible) {
      fetchUnread();
      const interval = setInterval(fetchUnread, 45000);
      return () => clearInterval(interval);
    }
  }, [isEligible, fetchUnread]);

  // ───────────────────────────────────────────────────────────────────────────
  // Unacknowledged Important Notices & Circulars
  // ───────────────────────────────────────────────────────────────────────────
  const fetchPendingNotices = useCallback(async () => {
    if (!isEligible) return;
    try {
      const res = await chatService.getImportantPendingNotices();
      const raw = unpack(res);
      setPendingNotices(raw?.notices || []);
    } catch {
      // background notices fetch error ignore
    }
  }, [isEligible]);

  useEffect(() => {
    if (isEligible) {
      fetchPendingNotices();
      const interval = setInterval(fetchPendingNotices, 60000);
      return () => clearInterval(interval);
    }
  }, [isEligible, fetchPendingNotices]);

  const handleAcknowledgeMessage = async (messageId) => {
    try {
      await chatService.acknowledgeMessage(messageId);
      addToast('Notice formally acknowledged and verified', 'success');
      setPendingNotices((prev) => prev.filter((n) => n.id !== messageId));
      fetchPendingNotices();
      if (activeThreadId) {
        loadMessages(activeThreadId);
      }
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
  // Global Event Listener to Open/Toggle Chat from any button
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleOpenEvent = (e) => {
      setIsOpen(true);
      if (e.detail?.threadId) {
        setActiveThreadId(e.detail.threadId);
        setMobileView('CHAT');
      } else {
        if (window.innerWidth <= 768) {
          setMobileView('LIST');
        }
      }
    };
    window.addEventListener('bfa:open-chat', handleOpenEvent);
    return () => window.removeEventListener('bfa:open-chat', handleOpenEvent);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Outside Click Listener to close the floating panel
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e) => {
      // If clicking inside panel or inside the trigger button, do not close
      if (
        (panelRef.current && panelRef.current.contains(e.target)) ||
        (triggerRef.current && triggerRef.current.contains(e.target)) ||
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
  // Load Threads
  // ───────────────────────────────────────────────────────────────────────────
  const loadThreads = useCallback(async () => {
    if (!isEligible) return;
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
      console.warn('[FloatingChat] Threads load error:', err.message);
    } finally {
      setLoadingThreads(false);
    }
  }, [isEligible, activeThreadId]);

  useEffect(() => {
    if (isOpen && isEligible) {
      loadThreads();
    }
  }, [isOpen, isEligible, loadThreads]);

  // ───────────────────────────────────────────────────────────────────────────
  // Load Messages for Active Thread
  // ───────────────────────────────────────────────────────────────────────────
  const loadMessages = useCallback(
    async (threadId) => {
      if (!threadId || !isEligible) return;
      try {
        setLoadingMessages(true);
        const res = await chatService.getThreadHistory(threadId, { limit: 50 });
        const raw = unpack(res);
        const msgs = Array.isArray(raw) ? raw : [];
        setMessages(msgs);

        // Auto mark as read
        if (msgs.length > 0) {
          const latestId = msgs[msgs.length - 1].id;
          chatService.markRead(threadId, latestId).catch(() => {});
          setThreads((prev) =>
            prev.map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t))
          );
          fetchUnread();
        }
      } catch (err) {
        console.warn('[FloatingChat] Message load error:', err.message);
      } finally {
        setLoadingMessages(false);
      }
    },
    [isEligible, fetchUnread]
  );

  useEffect(() => {
    if (isOpen && activeThreadId) {
      loadMessages(activeThreadId);
    }
  }, [isOpen, activeThreadId, loadMessages]);

  // Scroll to bottom of message stream
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // ───────────────────────────────────────────────────────────────────────────
  // Socket.IO Real-Time Synchronizer
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEligible) return;
    const socket = getSocket();
    if (!socket) return;

    if (activeThreadId && isOpen) {
      socket.emit('chat:join_thread', { threadId: activeThreadId });
    }

    const handleNewMessage = (msg) => {
      if (!msg) return;
      if (msg.thread_id === activeThreadId || msg.threadId === activeThreadId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id || (m.clientTempId && m.clientTempId === msg.clientTempId))) {
            return prev.map((m) =>
              m.clientTempId && m.clientTempId === msg.clientTempId ? msg : m
            );
          }
          return [...prev, msg];
        });

        if (isOpen) {
          chatService.markRead(activeThreadId, msg.id).catch(() => {});
        }
      }

      // Update thread list preview
      setThreads((prev) =>
        prev.map((t) => {
          const isTarget = t.id === (msg.thread_id || msg.threadId);
          if (!isTarget) return t;
          const isCurrentActive = isTarget && t.id === activeThreadId && isOpen;
          return {
            ...t,
            last_message_preview: msg.content || (msg.message_type === 'IMAGE' ? '📷 Photo' : '📎 Attachment'),
            last_message_at: msg.created_at,
            unread_count: isCurrentActive ? 0 : Number(t.unread_count || 0) + 1,
          };
        })
      );

      fetchUnread();
    };

    const handlePresence = (data) => {
      if (!data) return;
      if (Array.isArray(data.onlineUsers)) {
        setOnlineUserIds(new Set(data.onlineUsers));
      } else if (data.userId) {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (data.status === 'ONLINE') next.add(data.userId);
          else next.delete(data.userId);
          return next;
        });
      }
    };

    const handleTyping = (data) => {
      if (!data || !data.threadId) return;
      setTypingUsersByThread((prev) => {
        const threadUsers = { ...(prev[data.threadId] || {}) };
        if (data.isTyping) {
          threadUsers[data.userId] = data.userName || 'Someone';
        } else {
          delete threadUsers[data.userId];
        }
        return { ...prev, [data.threadId]: threadUsers };
      });
    };

    socket.on('message:new', handleNewMessage);
    socket.on('presence:change', handlePresence);
    socket.on('typing:status', handleTyping);

    return () => {
      if (activeThreadId) {
        socket.emit('chat:leave_thread', { threadId: activeThreadId });
      }
      socket.off('message:new', handleNewMessage);
      socket.off('presence:change', handlePresence);
      socket.off('typing:status', handleTyping);
    };
  }, [activeThreadId, isEligible, isOpen, fetchUnread]);

  // ───────────────────────────────────────────────────────────────────────────
  // Typing Indicator Emission
  // ───────────────────────────────────────────────────────────────────────────
  const handleTypingActivity = () => {
    const socket = getSocket();
    if (!socket || !activeThreadId) return;

    socket.emit('typing:start', { threadId: activeThreadId });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { threadId: activeThreadId });
    }, 2500);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Send Message with Optional Binary Attachment
  // ───────────────────────────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if ((!textInput.trim() && !pendingAttachment) || !activeThreadId || sending) {
      return;
    }

    const clientTempId = `tmp-${Date.now()}`;
    const outgoingText = textInput.trim();
    const attToSend = pendingAttachment;

    // Optimistic UI bubble
    const tempMsg = {
      id: clientTempId,
      clientTempId,
      thread_id: activeThreadId,
      sender_id: user?.id,
      senderName: user?.name,
      senderRole: user?.role,
      content: outgoingText,
      message_type: attToSend
        ? attToSend.fileType.startsWith('image/')
          ? 'IMAGE'
          : 'DOCUMENT'
        : 'TEXT',
      attachment: attToSend
        ? {
            original_name: attToSend.originalName,
            file_type: attToSend.fileType,
            file_size: attToSend.fileSize,
            previewUrl: attToSend.previewUrl,
          }
        : null,
      created_at: new Date().toISOString(),
      is_optimistic: true,
    };

    setMessages((prev) => [...prev, tempMsg]);
    setTextInput('');
    setPendingAttachment(null);
    setSending(true);

    try {
      const res = await chatService.sendMessage(activeThreadId, {
        content: outgoingText,
        messageType: tempMsg.message_type,
        attachment: attToSend,
        priority: selectedPriority,
      });
      setSelectedPriority('NORMAL');

      const confirmedMsg = unpack(res);
      if (confirmedMsg) {
        setMessages((prev) =>
          prev.map((m) => (m.clientTempId === clientTempId ? confirmedMsg : m))
        );
      }
      loadThreads();
    } catch (err) {
      console.error('[FloatingChat] Send failed:', err);
      addToast('Failed to deliver message. Tap to retry.', 'error');
      setMessages((prev) => prev.filter((m) => m.clientTempId !== clientTempId));
    } finally {
      setSending(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // File Attachment Picker
  // ───────────────────────────────────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      addToast('Attachments must not exceed 15MB limit.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const isImg = file.type.startsWith('image/');
      setPendingAttachment({
        originalName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        base64Data: event.target.result,
        previewUrl: isImg ? event.target.result : null,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Start New Direct Conversation Modal Actions
  // ───────────────────────────────────────────────────────────────────────────
  const handleOpenDirectModal = async () => {
    setNewDirectModalOpen(true);
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
      }
    } catch (err) {
      addToast(err.message || 'Could not initiate conversation', 'error');
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Start New Group Modal Actions
  // ───────────────────────────────────────────────────────────────────────────
  const handleOpenGroupModal = async () => {
    setNewGroupModalOpen(true);
    setGroupTitle('');
    setSelectedGroupMemberIds([]);
    try {
      setLoadingContacts(true);
      const res = await chatService.getContacts();
      const raw = unpack(res);
      setContacts(Array.isArray(raw) ? raw : []);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupTitle.trim()) {
      addToast('Group title is required', 'warning');
      return;
    }
    if (selectedGroupMemberIds.length === 0) {
      addToast('Select at least one team member', 'warning');
      return;
    }

    try {
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
      addToast(`Group '${groupTitle}' created!`, 'success');
    } catch (err) {
      addToast(err.message || 'Could not create group', 'error');
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Filtered Threads
  // ───────────────────────────────────────────────────────────────────────────
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const parsed = parseConversationTitle(t);
      const tType = t.thread_type || t.threadType;
      const hasOpContent =
        parsed.isOperation ||
        /BFA-TKT-|OPERATIONAL TICKET|OFFICIAL OPERATION|MEMO-\d+/i.test(String(t.last_message_preview || t.lastMessage?.content || ''));
      if (threadFilter === 'DIRECT' && tType !== 'DIRECT') return false;
      if (threadFilter === 'GROUP' && (tType === 'DIRECT' || parsed.isOperation)) return false;
      if (threadFilter === 'OPERATIONS' && !hasOpContent) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const rawTitle = (t.title || t.otherUserName || '').toLowerCase();
      const cleanTitle = (parsed.cleanTitle || '').toLowerCase();
      const opCode = (parsed.operationCode || '').toLowerCase();
      const role = (t.otherUserRole || '').toLowerCase();
      const lastMsg = (t.last_message_preview || t.lastMessage?.content || '').toLowerCase();

      return (
        rawTitle.includes(q) ||
        cleanTitle.includes(q) ||
        opCode.includes(q) ||
        role.includes(q) ||
        lastMsg.includes(q)
      );
    });
  }, [threads, threadFilter, searchQuery]);

  const activeThread = useMemo(() => {
    return threads.find((t) => t.id === activeThreadId) || null;
  }, [threads, activeThreadId]);

  const currentTypingUsers = useMemo(() => {
    if (!activeThreadId) return [];
    const usersObj = typingUsersByThread[activeThreadId] || {};
    return Object.entries(usersObj)
      .filter(([uid]) => Number(uid) !== user?.id)
      .map(([, name]) => name);
  }, [typingUsersByThread, activeThreadId, user]);

  const handleSelectThread = (threadId) => {
    setActiveThreadId(threadId);
    if (isMobileScreen) {
      setMobileView('CHAT');
    }
  };

  const handleBackToList = () => {
    setMobileView('LIST');
  };

  if (!isEligible) {
    return null;
  }

  return (
    <>
      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 1. FLOATING CHAT TRIGGER BUTTON (Bottom-Right, Elegant Glass & Gold) */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next && isMobileScreen && !activeThreadId) {
              setMobileView('LIST');
            }
            return next;
          });
        }}
        aria-label="Staff Team Chat"
        title="Open BFA Staff Team Chat"
        className="floating-chat-trigger-btn"
      >
        <MessageSquare size={24} style={{ color: '#d4af37' }} />
        {unreadTotal > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: 800,
              borderRadius: '50%',
              minWidth: '22px',
              height: '22px',
              padding: '0 5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #0a0a0e',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.6)',
            }}
          >
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 2. FLOATING MESSENGER-STYLE GLASS MODAL PANEL */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {isOpen && (
        <aside
          ref={panelRef}
          aria-label="Staff Team Chat Window"
          className="floating-chat-window"
        >
          {/* Top Window Header (Switches dynamically on Mobile between List & Chat) */}
          <div className="floating-chat-header">
            {isMobileScreen && mobileView === 'CHAT' ? (
              /* Mobile View B: Individual Conversation Header */
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="floating-chat-mobile-back"
                    aria-label="Back to conversation list"
                    title="Back to conversations"
                  >
                    <ChevronLeft size={18} />
                    <span>Chats</span>
                  </button>

                  {activeThread && (() => {
                    const parsedHeader = parseConversationTitle(activeThread);
                    const tType = activeThread.thread_type || activeThread.threadType;
                    const isDirect = tType === 'DIRECT';
                    const isGroup = tType === 'GROUP';
                    const isProperty = tType === 'PROPERTY_CHANNEL';
                    const isOnline = activeThread.otherUserId && onlineUserIds.has(activeThread.otherUserId);

                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: parsedHeader.isOperation
                                ? 'linear-gradient(135deg, #d97706, #b45309)'
                                : isProperty
                                ? '#0284c7'
                                : isGroup
                                ? '#4f46e5'
                                : '#d4af37',
                              color: parsedHeader.isOperation || isProperty || isGroup ? '#ffffff' : '#000000',
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: parsedHeader.isOperation ? '1.5px solid #fbbf24' : 'none',
                            }}
                          >
                            {parsedHeader.isOperation
                              ? '⚡'
                              : isProperty
                              ? '🏢'
                              : isGroup
                              ? '👥'
                              : parsedHeader.cleanTitle.slice(0, 2).toUpperCase()}
                          </div>
                          {isDirect && (
                            <span
                              style={{
                                position: 'absolute',
                                bottom: '-1px',
                                right: '-1px',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: isOnline ? '#10b981' : '#64748b',
                                border: '1.5px solid #0a0a0e',
                              }}
                            />
                          )}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              color: '#ffffff',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {parsedHeader.cleanTitle}
                          </div>
                          <div
                            style={{
                              fontSize: '0.68rem',
                              color: '#cbd5e1',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {parsedHeader.isOperation && parsedHeader.operationCode ? (
                              <>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fbbf24' }}>
                                  {parsedHeader.operationCode}
                                </span>
                                <span>· Directive</span>
                              </>
                            ) : isProperty ? (
                              <span>Property Channel</span>
                            ) : isGroup ? (
                              <span>Team Group</span>
                            ) : (
                              <span>
                                {activeThread.otherUserRole || 'Direct'}
                                {isOnline ? ' · Online' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {activeThread?.thread_type === 'GROUP' && (
                    <button
                      type="button"
                      onClick={async () => {
                        setParticipantsModalOpen(true);
                        try {
                          const res = await chatService.getThreadParticipants(activeThread.id);
                          const raw = unpack(res);
                          setParticipants(Array.isArray(raw) ? raw : []);
                        } catch {}
                      }}
                      className="chat-btn-glass"
                      style={{ padding: '5px 8px', fontSize: '0.72rem' }}
                      title="View Team Members"
                    >
                      <Users size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="chat-btn-glass"
                    style={{ padding: '5px 8px', color: '#f87171' }}
                    title="Close chat window"
                  >
                    <X size={16} />
                  </button>
                </div>
              </>
            ) : (
              /* Desktop or Mobile View A: App Window Header */
              <>
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
              </>
            )}
          </div>

          {/* Unacknowledged Important Notices Alert Banner */}
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
                  You have <strong>{pendingNotices.length}</strong> unacknowledged operational notice{pendingNotices.length > 1 ? 's' : ''}.
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
                Review & Sign
              </button>
            </div>
          )}

          {/* Body: Responsive Layout (Split on Desktop, Single-Panel on Mobile) */}
          <div className="floating-chat-body">
            {/* ──── Column 1: Conversations List ──── */}
            <div
              className={`floating-chat-sidebar ${
                isMobileScreen && mobileView === 'CHAT' ? 'mobile-hidden' : ''
              }`}
            >
              {/* Action Buttons: DM and Group */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={handleOpenDirectModal}
                    className="chat-btn-glass"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <Plus size={13} /> DM
                  </button>
                  {['SUPER_ADMIN', 'ADMIN', 'OWNER', 'OPERATIONS_MANAGER', 'MANAGER'].includes(String(user?.role || '').toUpperCase()) && (
                    <button
                      type="button"
                      onClick={handleOpenGroupModal}
                      className="chat-btn-glass"
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      <Users size={13} /> Group
                    </button>
                  )}
                </div>

                {/* Search Bar */}
                <div style={{ position: 'relative' }}>
                  <Search
                    size={13}
                    style={{
                      position: 'absolute',
                      left: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#94a3b8',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search team, directives, or chats..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px 6px 28px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Filter Tabs */}
                <div
                  style={{
                    display: 'flex',
                    gap: '4px',
                    marginTop: '8px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    padding: '3px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {[
                    { key: 'ALL', label: 'All' },
                    { key: 'OPERATIONS', label: '⚡ Directives' },
                    { key: 'DIRECT', label: 'Direct' },
                    { key: 'GROUP', label: 'Groups' },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setThreadFilter(key)}
                      style={{
                        flex: 1,
                        padding: '4px 0',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        background:
                          threadFilter === key
                            ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.28) 0%, rgba(212, 175, 55, 0.12) 100%)'
                            : 'transparent',
                        color: threadFilter === key ? '#fbbf24' : '#94a3b8',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        border: threadFilter === key ? '1px solid rgba(212, 175, 55, 0.4)' : '1px solid transparent',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Threads List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {loadingThreads && (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                    Loading conversations...
                  </div>
                )}
                {!loadingThreads && filteredThreads.length === 0 && (
                  <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                    No conversations found. Click <strong>+ DM</strong> or <strong>+ Group</strong> to begin!
                  </div>
                )}
                {filteredThreads.map((t) => {
                  const isActive = t.id === activeThreadId;
                  const parsed = parseConversationTitle(t);
                  const tType = t.thread_type || t.threadType;
                  const isDirect = tType === 'DIRECT';
                  const isGroup = tType === 'GROUP';
                  const isProperty = tType === 'PROPERTY_CHANNEL';
                  const isOnline = t.otherUserId && onlineUserIds.has(t.otherUserId);
                  const unread = Number(t.unread_count || t.unreadCount || 0);

                  return (
                    <div
                      key={t.id}
                      onClick={() => handleSelectThread(t.id)}
                      className={`floating-thread-card ${isActive ? 'active' : ''}`}
                    >
                      {/* Avatar */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            background: parsed.isOperation
                              ? 'linear-gradient(135deg, #d97706, #b45309)'
                              : isProperty
                              ? 'linear-gradient(135deg, #0284c7, #0369a1)'
                              : isGroup
                              ? 'linear-gradient(135deg, #4f46e5, #4338ca)'
                              : 'linear-gradient(135deg, #d4af37, #b8972e)',
                            color: parsed.isOperation || isProperty || isGroup ? '#ffffff' : '#000000',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: parsed.isOperation
                              ? '1.5px solid #fbbf24'
                              : '1px solid rgba(255, 255, 255, 0.15)',
                            boxShadow: parsed.isOperation ? '0 0 10px rgba(245, 158, 11, 0.4)' : 'none',
                          }}
                        >
                          {parsed.isOperation ? (
                            '⚡'
                          ) : isProperty ? (
                            '🏢'
                          ) : isGroup ? (
                            '👥'
                          ) : (
                            (t.title || t.otherUserName || 'SC').slice(0, 2).toUpperCase()
                          )}
                        </div>
                        {isDirect && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '0px',
                              right: '0px',
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: isOnline ? '#10b981' : '#64748b',
                              border: '2px solid #0a0a0e',
                            }}
                          />
                        )}
                      </div>

                      {/* Structured Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                          <span className="floating-thread-title">
                            {parsed.cleanTitle}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#64748b', flexShrink: 0, marginTop: '1px' }}>
                            {formatThreadTime(t.last_message_at || t.lastMessage?.createdAt || t.created_at)}
                          </span>
                        </div>

                        {parsed.isOperation && parsed.operationCode ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '2px 0' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '0.65rem',
                                color: '#fbbf24',
                                background: 'rgba(245, 158, 11, 0.18)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                padding: '0 4px',
                                borderRadius: '3px',
                              }}
                            >
                              {parsed.operationCode}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: '#60a5fa', fontWeight: 600 }}>
                              Directive
                            </span>
                          </div>
                        ) : isProperty ? (
                          <div style={{ fontSize: '0.68rem', color: '#38bdf8', margin: '2px 0', fontWeight: 500 }}>
                            🏢 Property Team
                          </div>
                        ) : isGroup ? (
                          <div style={{ fontSize: '0.68rem', color: '#a78bfa', margin: '2px 0', fontWeight: 500 }}>
                            {t.title === 'General Group' ? '👥 All active staff' : '👥 Team Channel'}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8', margin: '2px 0' }}>
                            {t.otherUserRole || 'Staff Member'}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span className="floating-thread-preview">
                            {t.last_message_preview || t.lastMessage?.content || 'No messages yet'}
                          </span>
                          {unread > 0 && (
                            <span
                              style={{
                                background: '#f59e0b',
                                color: '#000000',
                                borderRadius: '10px',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '1px 6px',
                                minWidth: '18px',
                                textAlign: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ──── Column 2: Active Chat Pane ──── */}
            <div
              className={`floating-chat-main ${
                isMobileScreen && mobileView === 'LIST' ? 'mobile-hidden' : ''
              }`}
            >
              {activeThread ? (
                <>
                  {/* Desktop Active Header (hidden on mobile since top header handles it) */}
                  {!isMobileScreen && (
                    <div
                      style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(15, 18, 26, 0.85)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div>
                        {(() => {
                          const parsedHeader = parseConversationTitle(activeThread);
                          return (
                            <>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>
                                {parsedHeader.cleanTitle}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {parsedHeader.isOperation && parsedHeader.operationCode ? (
                                  <>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fbbf24', background: 'rgba(245, 158, 11, 0.16)', padding: '1px 5px', borderRadius: '3px' }}>
                                      {parsedHeader.operationCode}
                                    </span>
                                    <span>· Operational Directive</span>
                                  </>
                                ) : (
                                  <>
                                    <span>{activeThread.thread_type}</span>
                                    {activeThread.otherUserRole && <span>· {activeThread.otherUserRole}</span>}
                                  </>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {activeThread.thread_type === 'GROUP' && (
                        <button
                          type="button"
                          onClick={async () => {
                            setParticipantsModalOpen(true);
                            try {
                              const res = await chatService.getThreadParticipants(activeThread.id);
                              const raw = unpack(res);
                              setParticipants(Array.isArray(raw) ? raw : []);
                            } catch {}
                          }}
                          className="chat-btn-glass"
                          style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                        >
                          <Users size={13} /> Members
                        </button>
                      )}
                    </div>
                  )}

                  {/* Message History Stream */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      padding: isMobileScreen ? '12px 10px' : '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    {loadingMessages && (
                      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', padding: '20px' }}>
                        Loading message history...
                      </div>
                    )}
                    {!loadingMessages && messages.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', padding: '40px' }}>
                        No messages in this conversation yet. Say hello!
                      </div>
                    )}
                    {messages.map((m, idx) => {
                      const prevMsg = idx > 0 ? messages[idx - 1] : null;
                      const prevSenderId = prevMsg ? (prevMsg.sender_id || prevMsg.senderId) : null;
                      const currSenderId = m.sender_id || m.senderId;
                      const isSameSender = Boolean(
                        prevSenderId &&
                        Number(prevSenderId) === Number(currSenderId) &&
                        prevMsg?.created_at &&
                        m?.created_at &&
                        Math.abs(new Date(m.created_at) - new Date(prevMsg.created_at)) < 180000
                      );
                      return (
                        <ChatMessageItem
                          key={m.id || m.clientTempId || idx}
                          message={m}
                          currentUser={user}
                          isPreviousSameSender={isSameSender}
                          onViewOperation={(opId) => setViewingOperationId(opId || m.context_entity_id)}
                          onOperationUpdated={() => {
                            if (activeThread?.id) loadMessages(activeThread.id);
                          }}
                          onImageClick={(att) => setLightboxUrl(att.url || att.previewUrl)}
                        />
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Typing Indicator */}
                  {currentTypingUsers.length > 0 && (
                    <div style={{ padding: '4px 14px', fontSize: '0.7rem', color: '#fbbf24', fontStyle: 'italic', background: 'rgba(0, 0, 0, 0.4)' }}>
                      {currentTypingUsers.join(', ')} {currentTypingUsers.length === 1 ? 'is' : 'are'} typing...
                    </div>
                  )}

                  {/* Pending Attachment Chip */}
                  {pendingAttachment && (
                    <div
                      style={{
                        padding: '6px 14px',
                        background: 'rgba(212, 175, 55, 0.15)',
                        borderTop: '1px solid rgba(212, 175, 55, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        color: '#fbbf24',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Paperclip size={13} /> {pendingAttachment.originalName} ({(pendingAttachment.fileSize / 1024).toFixed(0)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingAttachment(null)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Frosted Glass Composer */}
                  <form
                    onSubmit={handleSendMessage}
                    className="floating-chat-composer"
                    style={{
                      padding: isMobileScreen ? '8px 10px' : '10px 14px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.10)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(14, 18, 26, 0.94)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="chat-btn-glass"
                      style={{ padding: '8px 10px', borderRadius: '8px' }}
                      title="Attach file or photo (max 15MB)"
                    >
                      <Paperclip size={16} />
                    </button>

                    <select
                      value={selectedPriority}
                      onChange={(e) => setSelectedPriority(e.target.value)}
                      style={{
                        padding: '7px 8px',
                        borderRadius: '8px',
                        background: selectedPriority === 'URGENT' ? 'rgba(239, 68, 68, 0.25)' : selectedPriority === 'IMPORTANT' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                        border: selectedPriority === 'URGENT' ? '1px solid #ef4444' : selectedPriority === 'IMPORTANT' ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.14)',
                        color: selectedPriority === 'URGENT' ? '#f87171' : selectedPriority === 'IMPORTANT' ? '#fbbf24' : '#cbd5e1',
                        fontWeight: selectedPriority !== 'NORMAL' ? 700 : 500,
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        outline: 'none',
                        maxWidth: isMobileScreen ? '85px' : 'auto',
                      }}
                      title="Set Message Priority Level"
                    >
                      <option value="NORMAL" style={{ background: '#0a0a0e', color: '#fff' }}>Normal</option>
                      <option value="IMPORTANT" style={{ background: '#0a0a0e', color: '#fbbf24' }}>⚠️ Important</option>
                      <option value="URGENT" style={{ background: '#0a0a0e', color: '#f87171' }}>🚨 Urgent</option>
                    </select>

                    <input
                      type="text"
                      placeholder={isMobileScreen ? 'Message...' : 'Type a message to team...'}
                      value={textInput}
                      onChange={(e) => {
                        setTextInput(e.target.value);
                        handleTypingActivity();
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '0.82rem',
                        outline: 'none',
                        minWidth: 0,
                      }}
                    />

                    <button
                      type="submit"
                      disabled={sending || (!textInput.trim() && !pendingAttachment)}
                      style={{
                        background: sending || (!textInput.trim() && !pendingAttachment)
                          ? '#475569'
                          : 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '8px',
                        padding: isMobileScreen ? '8px 12px' : '8px 14px',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: sending || (!textInput.trim() && !pendingAttachment) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(212, 175, 55, 0.3)',
                      }}
                    >
                      <Send size={14} /> {!isMobileScreen && <span>Send</span>}
                    </button>
                  </form>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Select or start a conversation from the left
                </div>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 3. MODALS INSIDE CHAT: + DM MODAL */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {newDirectModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(18px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setNewDirectModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(10, 10, 14, 0.95)',
              backdropFilter: 'blur(28px)',
              borderRadius: '14px',
              border: '1.5px solid rgba(255, 255, 255, 0.18)',
              width: '420px',
              maxWidth: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', fontWeight: 700 }}>
                Start Direct Conversation
              </h3>
              <button
                type="button"
                onClick={() => setNewDirectModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '12px', maxHeight: '360px', overflowY: 'auto' }}>
              {loadingContacts ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                  Loading staff directory...
                </div>
              ) : contacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                  No available contacts found.
                </div>
              ) : (
                contacts.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleStartDirectChat(c.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      marginBottom: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fff' }}>{c.name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {c.role} · {c.propertyName || 'Global Headquarters'}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#d4af37', fontWeight: 700 }}>Message ➔</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 4. MODALS INSIDE CHAT: + GROUP MODAL */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {newGroupModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(18px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setNewGroupModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(10, 10, 14, 0.95)',
              backdropFilter: 'blur(28px)',
              borderRadius: '14px',
              border: '1.5px solid rgba(255, 255, 255, 0.18)',
              width: '460px',
              maxWidth: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', fontWeight: 700 }}>
                Create Group Channel
              </h3>
              <button
                type="button"
                onClick={() => setNewGroupModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#ffffff', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Channel Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Front Desk & Security Operations"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#ffffff', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Select Participants ({selectedGroupMemberIds.length} selected)
                </label>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {contacts.map((c) => {
                    const isSelected = selectedGroupMemberIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedGroupMemberIds((prev) =>
                            isSelected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          );
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: isSelected ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: isSelected ? '1px solid #d4af37' : '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', color: '#fff' }}>
                          {c.name} ({c.role})
                        </span>
                        {isSelected && <Check size={14} style={{ color: '#d4af37' }} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setNewGroupModalOpen(false)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#cbd5e1',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  style={{
                    background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                    color: '#000000',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Create Group
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 4.5 UNACKNOWLEDGED IMPORTANT NOTICES MODAL */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {noticesModalOpen && (
        <div
          className="chat-lightbox-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'rgba(10, 10, 14, 0.95)',
              backdropFilter: 'blur(28px)',
              borderRadius: '14px',
              border: '1.5px solid rgba(255, 255, 255, 0.18)',
              width: '520px',
              maxWidth: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} style={{ color: '#ef4444' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', fontWeight: 700 }}>
                  Mandatory Operational Notices ({pendingNotices.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setNoticesModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
              {pendingNotices.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#10b981', padding: '16px' }}>
                  ✓ All operational notices and circulars have been acknowledged!
                </div>
              ) : (
                pendingNotices.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: n.priority === 'URGENT' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                          color: n.priority === 'URGENT' ? '#f87171' : '#fbbf24',
                          border: n.priority === 'URGENT' ? '1px solid #ef4444' : '1px solid #f59e0b',
                        }}
                      >
                        {n.priority} NOTICE
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        From {n.sender_name || 'Executive'} • {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.84rem', color: '#ffffff', lineHeight: 1.4 }}>
                      {n.content}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleAcknowledgeMessage(n.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: '#10b981',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Check size={13} /> Acknowledge & Sign Receipt
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setNoticesModalOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 4.6 BROADCAST OWNER CIRCULAR MODAL */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {circularModalOpen && (
        <div
          className="chat-lightbox-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'rgba(10, 10, 14, 0.95)',
              backdropFilter: 'blur(28px)',
              borderRadius: '14px',
              border: '1.5px solid rgba(255, 255, 255, 0.18)',
              width: '500px',
              maxWidth: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#fff', fontWeight: 700 }}>
                📢 Broadcast Executive Circular to All Staff
              </h3>
              <button
                type="button"
                onClick={() => setCircularModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBroadcastCircular} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#ffffff', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Circular Subject / Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Standard Operating Directives: Mandatory Check-in Protocol & Guest Etiquette"
                  value={circularForm.title}
                  onChange={(e) => setCircularForm({ ...circularForm, title: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#ffffff', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Priority Level
                </label>
                <select
                  value={circularForm.priority}
                  onChange={(e) => setCircularForm({ ...circularForm, priority: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="IMPORTANT" style={{ background: '#0a0a0e', color: '#fbbf24' }}>⚠️ Important (Requires Staff Acknowledgement)</option>
                  <option value="URGENT" style={{ background: '#0a0a0e', color: '#f87171' }}>🚨 Urgent (Immediate Mandatory Mobilization)</option>
                  <option value="NORMAL" style={{ background: '#0a0a0e', color: '#fff' }}>Normal Information</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#ffffff', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Executive Circular Message *
                </label>
                <textarea
                  rows={5}
                  placeholder="Type the formal executive directive to be delivered and acknowledged across all properties..."
                  value={circularForm.content}
                  onChange={(e) => setCircularForm({ ...circularForm, content: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                    lineHeight: 1.4,
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setCircularModalOpen(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#cbd5e1',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcastingCircular}
                  style={{
                    background: 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                    color: '#000000',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  {broadcastingCircular ? 'Broadcasting...' : 'Broadcast Circular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 4.7 IN-CHAT CENTRAL OPERATION INITIATION & DETAILS MODALS */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <InChatOperationModal
        isOpen={operationModalOpen}
        onClose={() => setOperationModalOpen(false)}
        currentUser={user}
        activeThread={activeThread}
        onOperationCreated={(newOp) => {
          loadThreads();
          if (newOp?.chat_thread_id) {
            setActiveThreadId(newOp.chat_thread_id);
          }
        }}
      />

      <InChatOperationDetailsModal
        isOpen={Boolean(viewingOperationId)}
        onClose={() => setViewingOperationId(null)}
        operationId={viewingOperationId}
        currentUser={user}
        onOperationUpdated={() => {
          if (activeThreadId) {
            chatService.getThreadHistory(activeThreadId).then((res) => {
              const raw = unpack(res);
              setMessages(Array.isArray(raw) ? raw : []);
            });
          }
        }}
      />

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 5. LIGHTBOX MODAL */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="chat-lightbox-backdrop"
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <img
            src={lightboxUrl}
            alt="Full size attachment"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '12px' }}
          />
        </div>
      )}
    </>
  );
}
