const ChatService = require('./chat.service');
const ApiResponse = require('../../utils/apiResponse');

class ChatController {
  static async getContacts(req, res, next) {
    try {
      const contacts = await ChatService.getContacts(req.user, req.query.search || req.query.q);
      return ApiResponse.success(res, {
        message: 'Eligible staff contacts retrieved successfully',
        data: contacts,
        meta: { total: contacts.length },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getUnreadCount(req, res, next) {
    try {
      const totalUnread = await ChatService.getUnreadCount(req.user);
      return ApiResponse.success(res, {
        message: 'Total unread message count retrieved successfully',
        data: { totalUnread },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getThreads(req, res, next) {
    try {
      const threads = await ChatService.getThreads(req.user);
      return ApiResponse.success(res, {
        message: 'Active conversation threads retrieved successfully',
        data: threads,
        meta: { total: threads.length },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getThreadById(req, res, next) {
    try {
      const thread = await ChatService.getThreadById(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Conversation thread retrieved successfully',
        data: thread,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createDirectThread(req, res, next) {
    try {
      const thread = await ChatService.findOrCreateDirectThread(req.user, req.body.targetUserId);
      return ApiResponse.created(res, {
        message: 'Direct conversation thread initialized successfully',
        data: thread,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createGroupThread(req, res, next) {
    try {
      const group = await ChatService.createGroupThread(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Group conversation thread created successfully',
        data: group,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteGroupThread(req, res, next) {
    try {
      const deleted = await ChatService.deleteGroupThread(req.params.id, req.user, req.body?.reason || null);
      return ApiResponse.success(res, {
        message: `Group "${deleted.title}" deleted successfully`,
        data: deleted,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMessageReaders(req, res, next) {
    try {
      const data = await ChatService.getMessageReaders(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Message readers retrieved successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getThreadParticipants(req, res, next) {
    try {
      const participants = await ChatService.getThreadParticipants(req.params.id, req.user);
      return ApiResponse.success(res, {
        message: 'Thread participants retrieved successfully',
        data: participants,
      });
    } catch (err) {
      next(err);
    }
  }

  static async addParticipants(req, res, next) {
    try {
      const result = await ChatService.addParticipants(req.params.id, req.user, req.body.userIds);
      return ApiResponse.success(res, {
        message: 'Participants added successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async removeParticipant(req, res, next) {
    try {
      const result = await ChatService.removeParticipant(req.params.id, req.user, req.params.userId);
      return ApiResponse.success(res, {
        message: 'Participant removed successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createPropertyChannel(req, res, next) {
    try {
      const channel = await ChatService.createPropertyChannel(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Property team channel created successfully',
        data: channel,
      });
    } catch (err) {
      next(err);
    }
  }

  static async createSystemBroadcast(req, res, next) {
    try {
      const broadcast = await ChatService.createSystemBroadcast(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'System broadcast published successfully',
        data: broadcast,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getThreadHistory(req, res, next) {
    try {
      const history = await ChatService.getThreadHistory(req.params.id, req.user, {
        before: req.query.before,
        limit: req.query.limit,
      });
      return ApiResponse.success(res, {
        message: 'Thread message history retrieved successfully',
        data: history.messages,
        meta: { pagination: history.pagination },
      });
    } catch (err) {
      next(err);
    }
  }

  static async sendMessage(req, res, next) {
    try {
      const message = await ChatService.sendMessage(req.user, {
        threadId: req.params.id,
        ...req.body,
      });
      return ApiResponse.created(res, {
        message: 'Message sent successfully',
        data: message,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAttachment(req, res, next) {
    try {
      const att = await ChatService.getAttachment(req.params.id, req.params.attachmentId, req.user);
      res.setHeader('Content-Type', att.file_type || 'application/octet-stream');
      if (att.file_size) {
        res.setHeader('Content-Length', att.file_size);
      }
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.original_name)}"`);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.end(att.file_data);
    } catch (err) {
      next(err);
    }
  }

  static async downloadAttachment(req, res, next) {
    try {
      const att = await ChatService.getAttachment(req.params.id, req.params.attachmentId, req.user);
      res.setHeader('Content-Type', att.file_type || 'application/octet-stream');
      if (att.file_size) {
        res.setHeader('Content-Length', att.file_size);
      }
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.original_name)}"`);
      return res.end(att.file_data);
    } catch (err) {
      next(err);
    }
  }

  static async markAsRead(req, res, next) {
    try {
      const result = await ChatService.markAsRead(req.user, req.params.id, req.body.messageId);
      return ApiResponse.success(res, {
        message: 'Read watermark updated successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getContextPreview(req, res, next) {
    try {
      const preview = await ChatService.getContextPreview(req.user, req.query);
      return ApiResponse.success(res, {
        message: 'Context preview resolved successfully',
        data: preview,
      });
    } catch (err) {
      next(err);
    }
  }

  static async deleteMessage(req, res, next) {
    try {
      const result = await ChatService.deleteMessage(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Message soft-deleted successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getRetention(req, res, next) {
    try {
      const policy = await ChatService.getRetentionPolicy(req.user, req.query.propertyId);
      return ApiResponse.success(res, {
        message: 'Chat retention policy retrieved successfully',
        data: policy,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateRetention(req, res, next) {
    try {
      const policy = await ChatService.updateRetentionPolicy(req.user, req.body);
      return ApiResponse.success(res, {
        message: 'Chat retention policy updated successfully',
        data: policy,
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── Operational Priority & Acknowledgement Controls ─────────────────────
  static async acknowledgeMessage(req, res, next) {
    try {
      const result = await ChatService.acknowledgeMessage(req.user, req.params.id);
      return ApiResponse.success(res, {
        message: 'Message acknowledged successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getPendingImportantMessages(req, res, next) {
    try {
      const messages = await ChatService.getPendingImportantMessages(req.user);
      return ApiResponse.success(res, {
        message: 'Pending important notices retrieved',
        data: messages,
      });
    } catch (err) {
      next(err);
    }
  }

  static async broadcastOwnerCircular(req, res, next) {
    try {
      const result = await ChatService.broadcastOwnerCircular(req.user, req.body);
      return ApiResponse.created(res, {
        message: 'Owner circular broadcasted successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async syncEventReadState(req, res, next) {
    try {
      const data = await ChatService.syncEventReadState(req.user, req.body || {});
      return ApiResponse.success(res, {
        message: 'Event read state synchronized successfully',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async sendSubmissionFeedback(req, res, next) {
    try {
      const data = await ChatService.sendSubmissionFeedback(req.user, {
        ...(req.body || {}),
        submissionId: req.params.id,
      });
      return ApiResponse.created(res, {
        message: 'Submission feedback posted to management chat',
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ChatController;
