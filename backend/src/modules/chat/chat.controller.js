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
}

module.exports = ChatController;
