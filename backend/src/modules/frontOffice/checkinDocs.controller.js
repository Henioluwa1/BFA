const fs = require('fs');
const CheckinDocsService = require('./checkinDocs.service');

class CheckinDocsController {
  static async getDocumentTypes(req, res, next) {
    try {
      const types = await CheckinDocsService.getDocumentTypes();
      res.status(200).json({ success: true, data: types });
    } catch (err) {
      next(err);
    }
  }

  static async getCheckinSession(req, res, next) {
    try {
      const session = await CheckinDocsService.getCheckinSession(req.params.id, req.user);
      res.status(200).json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  static async upsertCheckinSession(req, res, next) {
    try {
      const session = await CheckinDocsService.upsertCheckinSession(req.params.id, req.body || {}, req.user);
      res.status(200).json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }

  static async listDocuments(req, res, next) {
    try {
      const docs = await CheckinDocsService.listDocuments(req.params.id, req.user);
      res.status(200).json({ success: true, data: docs });
    } catch (err) {
      next(err);
    }
  }

  static async uploadDocument(req, res, next) {
    try {
      const doc = await CheckinDocsService.uploadDocument(req.params.id, req.body || {}, req.user);
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      next(err);
    }
  }

  static async serveDocument(req, res, next) {
    try {
      const { absolutePath, mimeType, originalFilename } = await CheckinDocsService.serveDocument(req.params.docId, req.user);
      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalFilename)}"`);
      fs.createReadStream(absolutePath).pipe(res);
    } catch (err) {
      next(err);
    }
  }

  static async getPaymentTransactionRefs(req, res, next) {
    try {
      const refs = await CheckinDocsService.getPaymentTransactionRefs(req.params.id, req.user);
      res.status(200).json({ success: true, data: refs });
    } catch (err) {
      next(err);
    }
  }

  static async recordPaymentRef(req, res, next) {
    try {
      const result = await CheckinDocsService.recordPaymentRef(req.params.id, req.body || {}, req.user);
      res.status(result.isDuplicate ? 200 : 201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async evaluateReadiness(req, res, next) {
    try {
      const result = await CheckinDocsService.evaluateCheckinReadiness(req.params.id, req.user);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CheckinDocsController;
