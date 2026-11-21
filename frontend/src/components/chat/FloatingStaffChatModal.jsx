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
  const [messages, setMessages] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [textInput, setTextInput] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [threadFilter, setThreadFilter] = useState('ALL'); // 'ALL' | 'DIRECT' | 'GROUP'

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
      if (threadFilter === 'DIRECT' && t.thread_type !== 'DIRECT') return false;
      if (threadFilter === 'GROUP' && t.thread_type === 'DIRECT') return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const title = (t.title || t.otherUserName || '').toLowerCase();
      const role = (t.otherUserRole || '').toLowerCase();
      return title.includes(q) || role.includes(q);
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

  if (!isEligible) {
    return null;
  }

  return (
    <>
      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 1. FLOATING CHAT TRIGGER BUTTON (Bottom-Right, Elegant Glass & Brass) */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Staff Team Chat"
        title="Open BFA Staff Team Chat"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 999,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          border: '1.5px solid #d4af37',
          color: '#ffffff',
          boxShadow: '0 10px 25px -4px rgba(0, 0, 0, 0.5), 0 0 15px rgba(212, 175, 55, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          animation: 'chatButtonEntrance 0.5s ease-out',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
          e.currentTarget.style.boxShadow = '0 16px 32px -4px rgba(0, 0, 0, 0.6), 0 0 22px rgba(212, 175, 55, 0.6)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.boxShadow = '0 10px 25px -4px rgba(0, 0, 0, 0.5), 0 0 15px rgba(212, 175, 55, 0.4)';
        }}
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
              border: '2px solid #0f172a',
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
          style={{
            position: 'fixed',
            bottom: '88px',
            right: '24px',
            zIndex: 1000,
            width: '760px',
            maxWidth: 'calc(100vw - 32px)',
            height: '580px',
            maxHeight: 'calc(100vh - 110px)',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(28px) saturate(190%)',
            WebkitBackdropFilter: 'blur(28px) saturate(190%)',
            borderRadius: '16px',
            border: '1.5px solid rgba(212, 175, 55, 0.45)',
            boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.75), 0 0 30px rgba(212, 175, 55, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'chatModalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Top Window Header */}
          <div
            style={{
              padding: '12px 18px',
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.18), rgba(30, 41, 59, 0.95))',
              borderBottom: '1px solid rgba(212, 175, 55, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} style={{ color: '#d4af37' }} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                Staff Collaboration & Files
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Circle size={6} fill="#34d399" /> LIVE
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {user?.role === 'OWNER' && (
                <button
                  type="button"
                  onClick={() => setCircularModalOpen(true)}
                  style={{
                    background: 'rgba(212, 175, 55, 0.2)',
                    border: '1px solid #d4af37',
                    color: '#fbbf24',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                  title="Broadcast Executive Circular to all Staff"
                >
                  📢 Broadcast Circular
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#cbd5e1',
                  borderRadius: '6px',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                title="Minimize chat"
              >
                <Minimize2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: 'none',
                  color: '#f87171',
                  borderRadius: '6px',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                title="Close chat window (Click outside also closes)"
              >
                <X size={16} />
              </button>
            </div>
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
                  color: '#0f172a',
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

          {/* Body: Split View (Conversations List + Active Chat) */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            {/* ──── Column 1: Conversations List (Width ~270px) ──── */}
            <div
              style={{
                width: '270px',
                borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(15, 23, 42, 0.55)',
              }}
            >
              {/* Header Actions */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={handleOpenDirectModal}
                    className="chat-btn-action"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <Plus size={13} /> DM
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenGroupModal}
                    className="chat-btn-action"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <Users size={13} /> Group
                  </button>
                </div>

                {/* Search */}
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search team or chat..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 8px 5px 26px',
                      background: 'rgba(30, 41, 59, 0.75)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Filter Tabs */}
                <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                  {['ALL', 'DIRECT', 'GROUP'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setThreadFilter(f)}
                      style={{
                        flex: 1,
                        padding: '3px 0',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '4px',
                        background: threadFilter === f ? 'rgba(212, 175, 55, 0.25)' : 'transparent',
                        color: threadFilter === f ? '#fbbf24' : '#94a3b8',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Threads List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
                {loadingThreads && (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                    Loading threads...
                  </div>
                )}
                {!loadingThreads && filteredThreads.length === 0 && (
                  <div style={{ padding: '20px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                    No conversations found.
                  </div>
                )}
                {filteredThreads.map((t) => {
                  const isActive = t.id === activeThreadId;
                  const title = t.title || t.otherUserName || 'Staff Channel';
                  const roleTag = t.otherUserRole || (t.thread_type === 'DIRECT' ? 'DIRECT' : 'GROUP');
                  const isOnline = t.otherUserId && onlineUserIds.has(t.otherUserId);
                  const unread = Number(t.unread_count || 0);

                  return (
                    <div
                      key={t.id}
                      onClick={() => setActiveThreadId(t.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: isActive ? 'rgba(212, 175, 55, 0.16)' : 'transparent',
                        border: isActive ? '1px solid rgba(212, 175, 55, 0.4)' : '1px solid transparent',
                        marginBottom: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: t.thread_type === 'GROUP' ? '#4f46e5' : '#d4af37',
                            color: '#0f172a',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {title.slice(0, 2).toUpperCase()}
                        </div>
                        {t.thread_type === 'DIRECT' && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '-1px',
                              right: '-1px',
                              width: '9px',
                              height: '9px',
                              borderRadius: '50%',
                              background: isOnline ? '#10b981' : '#64748b',
                              border: '1.5px solid #0f172a',
                            }}
                          />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: '#ffffff',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {title}
                          </span>
                          {unread > 0 && (
                            <span
                              style={{
                                background: '#ef4444',
                                color: '#fff',
                                borderRadius: '10px',
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                padding: '1px 5px',
                                minWidth: '14px',
                                textAlign: 'center',
                              }}
                            >
                              {unread}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: '#94a3b8',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: '2px',
                          }}
                        >
                          {t.last_message_preview || roleTag}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ──── Column 2: Active Chat Pane (Flex 1) ──── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.4)' }}>
              {activeThread ? (
                <>
                  {/* Active Header */}
                  <div
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(30, 41, 59, 0.5)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>
                        {activeThread.title || activeThread.otherUserName || 'Conversation'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>{activeThread.thread_type}</span>
                        {activeThread.otherUserRole && <span>· {activeThread.otherUserRole}</span>}
                      </div>
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
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          color: '#cbd5e1',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Users size={12} /> Members
                      </button>
                    )}
                  </div>

                  {/* Message Stream */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      padding: '14px',
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
                    {messages.map((m) => {
                      const isMe = Number(m.sender_id || m.senderId) === Number(user?.id);
                      const hasAtt = Boolean(m.attachment);
                      const timeStr = m.created_at
                        ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '';

                      return (
                        <div
                          key={m.id || m.clientTempId}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: isMe ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            alignSelf: isMe ? 'flex-end' : 'flex-start',
                          }}
                        >
                          {!isMe && (
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '2px', paddingLeft: '4px' }}>
                              {m.senderName || 'Staff'} ({m.senderRole || 'Team'})
                            </span>
                          )}

                          <div
                            style={{
                              background: isMe
                                ? 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)'
                                : 'rgba(30, 41, 59, 0.85)',
                              color: isMe ? '#0f172a' : '#ffffff',
                              border: isMe ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                              padding: '8px 12px',
                              fontSize: '0.82rem',
                              lineHeight: 1.4,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                              wordBreak: 'break-word',
                            }}
                          >
                            {/* Attachment Rendering */}
                            {hasAtt && (
                              <div style={{ marginBottom: m.content ? '8px' : 0 }}>
                                {m.attachment.file_type?.startsWith('image/') || m.attachment.fileType?.startsWith('image/') ? (
                                  <div>
                                    <img
                                      src={m.attachment.previewUrl || `/api/v1/chat/threads/${activeThread.id}/attachments/${m.attachment.id}`}
                                      alt={m.attachment.original_name || 'Attachment'}
                                      style={{
                                        maxWidth: '220px',
                                        maxHeight: '160px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        display: 'block',
                                      }}
                                      onClick={() =>
                                        setLightboxUrl(
                                          m.attachment.previewUrl ||
                                            `/api/v1/chat/threads/${activeThread.id}/attachments/${m.attachment.id}`
                                        )
                                      }
                                    />
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      background: isMe ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.06)',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                    }}
                                  >
                                    <FileText size={16} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 700, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {m.attachment.original_name || m.attachment.originalName || 'Document'}
                                      </div>
                                    </div>
                                    {m.attachment.id && (
                                      <a
                                        href={`/api/v1/chat/threads/${activeThread.id}/attachments/${m.attachment.id}/download`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                          color: isMe ? '#0f172a' : '#38bdf8',
                                          display: 'flex',
                                          alignItems: 'center',
                                        }}
                                        title="Download document"
                                      >
                                        <Download size={14} />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Priority Indicator Badge */}
                            {m.priority === 'CRITICAL' && (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'rgba(220, 38, 38, 0.25)',
                                  color: '#ef4444',
                                  border: '1px solid #ef4444',
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  marginBottom: '4px',
                                  letterSpacing: '0.5px',
                                }}
                              >
                                🚨 CRITICAL DIRECTIVE
                              </div>
                            )}
                            {m.priority === 'URGENT' && (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'rgba(239, 68, 68, 0.2)',
                                  color: '#ef4444',
                                  border: '1px solid #ef4444',
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  marginBottom: '4px',
                                }}
                              >
                                ⚡ URGENT
                              </div>
                            )}
                            {m.priority === 'IMPORTANT' && (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'rgba(245, 158, 11, 0.2)',
                                  color: '#f59e0b',
                                  border: '1px solid #f59e0b',
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  marginBottom: '4px',
                                }}
                              >
                                ⚠️ IMPORTANT
                              </div>
                            )}

                            {/* Message text content */}
                            {m.content && <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{m.content}</div>}

                            {/* Operations Memo Preview Card */}
                            {(m.context_entity_type === 'OPERATION' || m.context_entity_type === 'MEMO') && (
                              <div
                                style={{
                                  marginTop: '8px',
                                  padding: '8px 10px',
                                  borderRadius: '8px',
                                  background: 'rgba(15, 23, 42, 0.7)',
                                  border: '1px solid rgba(59, 130, 246, 0.4)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.5px' }}>
                                    📋 OFFICIAL OPERATIONS MEMO
                                  </span>
                                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                    #{m.context_entity_id}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                  <a
                                    href={`/app/operations?id=${m.context_entity_id}`}
                                    style={{
                                      fontSize: '0.72rem',
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      background: '#2563eb',
                                      color: '#ffffff',
                                      textDecoration: 'none',
                                      fontWeight: 600,
                                    }}
                                  >
                                    View Full Operation ➔
                                  </a>
                                </div>
                              </div>
                            )}

                            {/* Acknowledge Receipt Button for critical/important notice or operations */}
                            {(m.priority === 'CRITICAL' || m.priority === 'URGENT' || m.priority === 'IMPORTANT' || m.context_type || m.context_entity_type === 'OPERATION') && !isMe && (
                              <div style={{ marginTop: '6px' }}>
                                {m.acknowledged ? (
                                  <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                                    ✓ Acknowledged
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleAcknowledgeMessage(m.id)}
                                    style={{
                                      padding: '3px 8px',
                                      fontSize: '0.7rem',
                                      borderRadius: '4px',
                                      background: '#10b981',
                                      color: '#ffffff',
                                      border: 'none',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    <Check size={12} /> Acknowledge Receipt
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Timestamp & read ticks */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                gap: '3px',
                                fontSize: '0.62rem',
                                color: isMe ? 'rgba(15, 23, 42, 0.7)' : '#94a3b8',
                                marginTop: '3px',
                              }}
                            >
                              <span>{timeStr}</span>
                              {isMe && <CheckCheck size={11} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Typing Indicator */}
                  {currentTypingUsers.length > 0 && (
                    <div style={{ padding: '4px 14px', fontSize: '0.7rem', color: '#fbbf24', fontStyle: 'italic' }}>
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

                  {/* Composer Form */}
                  <form
                    onSubmit={handleSendMessage}
                    style={{
                      padding: '10px 14px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(15, 23, 42, 0.85)',
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
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#cbd5e1',
                        borderRadius: '8px',
                        padding: '7px 9px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Attach file or photo (max 15MB)"
                    >
                      <Paperclip size={16} />
                    </button>

                    <select
                      value={selectedPriority}
                      onChange={(e) => setSelectedPriority(e.target.value)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '8px',
                        background: selectedPriority === 'URGENT' ? 'rgba(239, 68, 68, 0.25)' : selectedPriority === 'IMPORTANT' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                        border: selectedPriority === 'URGENT' ? '1px solid #ef4444' : selectedPriority === 'IMPORTANT' ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.12)',
                        color: selectedPriority === 'URGENT' ? '#f87171' : selectedPriority === 'IMPORTANT' ? '#fbbf24' : '#cbd5e1',
                        fontWeight: selectedPriority !== 'NORMAL' ? 700 : 500,
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                      title="Set Message Priority Level"
                    >
                      <option value="NORMAL" style={{ background: '#0f172a', color: '#fff' }}>Normal</option>
                      <option value="IMPORTANT" style={{ background: '#0f172a', color: '#fbbf24' }}>⚠️ Important</option>
                      <option value="URGENT" style={{ background: '#0f172a', color: '#f87171' }}>🚨 Urgent</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Type a message to team..."
                      value={textInput}
                      onChange={(e) => {
                        setTextInput(e.target.value);
                        handleTypingActivity();
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: 'rgba(30, 41, 59, 0.75)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '0.82rem',
                        outline: 'none',
                      }}
                    />

                    <button
                      type="submit"
                      disabled={sending || (!textInput.trim() && !pendingAttachment)}
                      style={{
                        background: sending || (!textInput.trim() && !pendingAttachment)
                          ? '#475569'
                          : 'linear-gradient(135deg, #d4af37 0%, #b8972e 100%)',
                        color: '#0f172a',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: sending || (!textInput.trim() && !pendingAttachment) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <Send size={14} /> Send
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
            background: 'rgba(10, 16, 26, 0.7)',
            backdropFilter: 'blur(16px)',
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
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(28px)',
              borderRadius: '14px',
              border: '1.5px solid rgba(212, 175, 55, 0.4)',
              width: '420px',
              maxWidth: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
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
                      background: 'rgba(30, 41, 59, 0.6)',
                      marginBottom: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
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
            background: 'rgba(10, 16, 26, 0.7)',
            backdropFilter: 'blur(16px)',
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
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(28px)',
              borderRadius: '14px',
              border: '1.5px solid rgba(212, 175, 55, 0.4)',
              width: '460px',
              maxWidth: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            }}
          >
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
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
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
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
                    background: 'rgba(30, 41, 59, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
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
                          background: isSelected ? 'rgba(212, 175, 55, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                          border: isSelected ? '1px solid #d4af37' : '1px solid rgba(255, 255, 255, 0.06)',
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
                    color: '#0f172a',
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
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(28px)',
              borderRadius: '14px',
              border: '1.5px solid rgba(245, 158, 11, 0.5)',
              width: '520px',
              maxWidth: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
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
                      background: 'rgba(30, 41, 59, 0.7)',
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
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(28px)',
              borderRadius: '14px',
              border: '1.5px solid rgba(212, 175, 55, 0.5)',
              width: '500px',
              maxWidth: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
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
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
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
                    background: 'rgba(30, 41, 59, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                  Priority Level
                </label>
                <select
                  value={circularForm.priority}
                  onChange={(e) => setCircularForm({ ...circularForm, priority: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(30, 41, 59, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="IMPORTANT">⚠️ Important (Requires Staff Acknowledgement)</option>
                  <option value="URGENT">🚨 Urgent (Immediate Mandatory Mobilization)</option>
                  <option value="NORMAL">Normal Information</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
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
                    background: 'rgba(30, 41, 59, 0.75)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
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
                    color: '#0f172a',
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
