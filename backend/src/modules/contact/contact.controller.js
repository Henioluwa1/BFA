const ContactService = require('./contact.service');

class ContactController {
  static async submitInquiry(req, res, next) {
    try {
      const result = await ContactService.submitInquiry({
        clientName: req.body?.fullName || req.body?.clientName,
        clientEmail: req.body?.email || req.body?.clientEmail,
        clientPhone: req.body?.phone || req.body?.clientPhone,
        inquiryDepartment: req.body?.inquiryDepartment || req.body?.stayType,
        inquiryCategory: req.body?.inquiryCategory || req.body?.stayType,
        inquirySubject: req.body?.subject,
        message: req.body?.message,
        bookingReference: req.body?.bookingReference || req.body?.bookingNumber,
        propertyInterest: req.body?.propertyInterest,
        attachmentBase64: req.body?.attachmentBase64,
        attachmentFilename: req.body?.attachmentFilename,
        attachmentMime: req.body?.attachmentMime,
        ipAddress: req.ip,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async lookupByAccessCode(req, res, next) {
    try {
      const result = await ContactService.lookupByAccessCode({
        inquiryReference: req.body?.inquiryReference,
        accessCode: req.body?.accessCode,
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getClientInquiryDetail(req, res, next) {
    try {
      const result = await ContactService.getClientInquiryDetail(req.params.token);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async addClientMessage(req, res, next) {
    try {
      const result = await ContactService.addClientMessage(req.params.token, req.body || {});
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async submitClientFeedback(req, res, next) {
    try {
      const result = await ContactService.submitClientFeedback(req.params.token, req.body || {});
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async listInquiries(req, res, next) {
    try {
      const items = await ContactService.listInquiries(req.user, req.query);
      res.status(200).json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getInquiryById(req, res, next) {
    try {
      const result = await ContactService.getInquiryById(req.params.id, req.user);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async assignInquiry(req, res, next) {
    try {
      const result = await ContactService.assignInquiry(req.params.id, req.body || {}, req.user);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async addStaffMessage(req, res, next) {
    try {
      const result = await ContactService.addStaffMessage(req.params.id, req.body || {}, req.user);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async closeInquiry(req, res, next) {
    try {
      const result = await ContactService.closeInquiry(req.params.id, req.body || {}, req.user);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async reopenInquiry(req, res, next) {
    try {
      const result = await ContactService.reopenInquiry(req.params.id, req.body || {}, req.user);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ContactController;
