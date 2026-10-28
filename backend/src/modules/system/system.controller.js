const ApiResponse = require('../../utils/apiResponse');
const pool = require('../../db/pool');
const config = require('../../config');
const auditService = require('../../core/audit/audit.service');
const OperationsControlService = require('./operationsControl.service');

/**
 * System Information and Settings Controller
 */
class SystemController {
  static async getOperationsOverview(req, res, next) {
    try {
      const overview = await OperationsControlService.getOverview(req.user);
      return ApiResponse.success(res, {
        message: 'Operations Control Center overview retrieved successfully',
        data: overview,
      });
    } catch (error) {
      next(error);
    }
  }

  static async toggleModule(req, res, next) {
    try {
      const result = await OperationsControlService.toggleModule({
        moduleId: req.params.id,
        isEnabled: req.body.isEnabled,
        reason: req.body.reason,
        caller: req.user,
        req,
      });
      return ApiResponse.success(res, {
        message: `Module '${result.name}' successfully ${result.isEnabled ? 'enabled' : 'disabled'}.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createBackup(req, res, next) {
    try {
      const result = await OperationsControlService.createBackupSnapshot({
        caller: req.user,
        req,
      });
      return ApiResponse.created(res, {
        message: 'Database backup snapshot generated successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getInfo(req, res, next) {
    try {
      // Query system settings from database
      const settingsRows = await pool.query('SELECT category, setting_key, setting_value, description FROM system_settings;');
      
      const settingsMap = {};
      settingsRows.forEach((row) => {
        if (!settingsMap[row.category]) {
          settingsMap[row.category] = {};
        }
        settingsMap[row.category][row.setting_key] = row.setting_value;
      });

      return ApiResponse.success(res, {
        message: 'System info retrieved successfully',
        data: {
          name: config.app.name,
          version: '1.0.0',
          environment: config.app.env,
          currentServerTime: new Date().toISOString(),
          settings: settingsMap,
          modules: [
            { id: 'dashboard', name: 'Dashboard', path: '/', phase: 1, ready: true },
            { id: 'calendar', name: 'Calendar', path: '/calendar', phase: 5, ready: true },
            { id: 'reservations', name: 'All Reservations', path: '/reservations', phase: 4, ready: true },
            { id: 'apartments', name: 'Apartments', path: '/apartments', phase: 3, ready: true },
            { id: 'financial', name: 'Financial', path: '/financial', phase: 8, ready: true },
            { id: 'analytics', name: 'Analytics', path: '/analytics', phase: 10, ready: true },
            { id: 'agents', name: 'Agents', path: '/agents', phase: 9, ready: true },
            { id: 'maintenance', name: 'Maintenance', path: '/maintenance', phase: 7, ready: true },
            { id: 'inspection', name: 'Inspection', path: '/inspection', phase: 6, ready: true },
            { id: 'team', name: 'Team', path: '/team', phase: 2, ready: true },
            { id: 'settings', name: 'Settings', path: '/settings', phase: 11, ready: true },
            { id: 'operations', name: 'Operations Control Center', path: '/operations', phase: 12, ready: true },
          ],
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getSettings(req, res, next) {
    try {
      const rows = await pool.query('SELECT id, category, setting_key, setting_value, description, updated_at FROM system_settings ORDER BY category ASC, setting_key ASC');
      
      const settingsMap = {};
      rows.forEach((row) => {
        if (!settingsMap[row.category]) {
          settingsMap[row.category] = {};
        }
        settingsMap[row.category][row.setting_key] = row.setting_value;
      });

      return ApiResponse.success(res, {
        message: 'System settings retrieved successfully',
        data: {
          settings: settingsMap,
          rows,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateSettings(req, res, next) {
    try {
      const settingsPayload = req.body.settings || req.body;
      const user = req.user;

      if (!settingsPayload || typeof settingsPayload !== 'object') {
        return res.status(400).json({ success: false, message: 'Invalid settings payload.' });
      }

      const updatedKeys = [];
      const oldValues = {};
      const newValues = {};

      // Get current values for audit
      const existingRows = await pool.query('SELECT setting_key, setting_value, category FROM system_settings');
      const existingMap = {};
      existingRows.forEach(r => { existingMap[r.setting_key] = r.setting_value; });

      // Handle both flattened key-value or categorized object
      const pairs = [];
      for (const [keyOrCategory, valueOrObj] of Object.entries(settingsPayload)) {
        if (typeof valueOrObj === 'object' && valueOrObj !== null && !Array.isArray(valueOrObj)) {
          // Categorized: e.g. { company: { company_name: "..." } }
          for (const [k, v] of Object.entries(valueOrObj)) {
            pairs.push({ category: keyOrCategory, key: k, value: String(v) });
          }
        } else {
          // Flattened: e.g. { company_name: "..." }
          let category = 'general';
          if (keyOrCategory.startsWith('company_')) category = 'company';
          else if (keyOrCategory.includes('deposit') || keyOrCategory.includes('booking') || keyOrCategory.includes('checkin') || keyOrCategory.includes('checkout') || keyOrCategory.includes('overbooking')) category = 'reservations';
          else if (keyOrCategory.includes('currency') || keyOrCategory.includes('tax') || keyOrCategory.includes('vat') || keyOrCategory.includes('rate')) category = 'finance';

          pairs.push({ category, key: keyOrCategory, value: String(valueOrObj) });
        }
      }

      await pool.withTransaction(async (conn) => {
        for (const item of pairs) {
          oldValues[item.key] = existingMap[item.key] || null;
          newValues[item.key] = item.value;
          updatedKeys.push(item.key);

          await conn.query(
            `INSERT INTO system_settings (category, setting_key, setting_value, description)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
            [item.category, item.key, item.value, item.key.replace(/_/g, ' ')]
          );
        }
      });

      // Audit log the update
      await auditService.log({
        actorId: user?.id || null,
        actorEmail: user?.email || 'admin@bfa.com',
        actorRole: user?.role || 'ADMIN',
        action: 'SETTINGS_UPDATED',
        entityType: 'system_settings',
        entityId: 'global',
        oldValues,
        newValues,
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      return ApiResponse.success(res, {
        message: 'System settings saved and applied successfully.',
        data: {
          updatedCount: updatedKeys.length,
          updatedKeys,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SystemController;
