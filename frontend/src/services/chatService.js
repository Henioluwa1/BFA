import api from './api';

export const chatService = {
  getContacts: (search) =>
    api.get('/chat/contacts', { params: search ? { search } : {} }),

  getUnreadCount: () =>
    api.get('/chat/unread-count'),

  getThreads: () =>
    api.get('/chat/threads'),

  getThreadById: (threadId) =>
    api.get(`/chat/threads/${threadId}`),

  createDirectThread: (targetUserId) =>
    api.post('/chat/threads/direct', { targetUserId }),

  createGroupThread: (data) =>
    api.post('/chat/threads/group', data),

  deleteGroupThread: (threadId, reason = null) =>
    api.delete(`/chat/threads/${threadId}`, { data: { reason } }),

  getMessageReaders: (messageId) =>
    api.get(`/chat/messages/${messageId}/readers`),

  syncEventReadState: (payload) =>
    api.post('/chat/events/sync-read', payload),

  sendSubmissionFeedback: (submissionId, payload) =>
    api.post(`/chat/submissions/${submissionId}/feedback`, payload),

  getThreadParticipants: (threadId) =>
    api.get(`/chat/threads/${threadId}/participants`),

  addParticipants: (threadId, userIds) =>
    api.post(`/chat/threads/${threadId}/participants`, { userIds }),

  removeParticipant: (threadId, userId) =>
    api.delete(`/chat/threads/${threadId}/participants/${userId}`),

  getThreadHistory: (threadId, params = {}) =>
    api.get(`/chat/threads/${threadId}/history`, { params }),

  sendMessage: (threadId, data) =>
    api.post(`/chat/threads/${threadId}/messages`, data),

  markAsRead: (threadId, messageId) =>
    api.post(`/chat/threads/${threadId}/read`, { messageId }),

  deleteMessage: (messageId) =>
    api.delete(`/chat/messages/${messageId}`),

  getAttachmentUrl: (threadId, attachmentId) =>
    `/api/v1/chat/threads/${threadId}/attachments/${attachmentId}`,

  getDownloadUrl: (threadId, attachmentId) =>
    `/api/v1/chat/threads/${threadId}/attachments/${attachmentId}/download`,

  // ─── Priority & Acknowledgements ────────────────────────────────────
  getImportantPendingNotices: () =>
    api.get('/chat/important-pending'),

  acknowledgeMessage: (messageId) =>
    api.post(`/chat/messages/${messageId}/acknowledge`),

  broadcastCircular: (data) =>
    api.post('/chat/circulars', data),
};

export default chatService;
